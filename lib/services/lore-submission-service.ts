import { randomUUID } from 'crypto';
import { z } from 'zod';
import { isAdmin } from '@/lib/auth/admin';
import { getActiveLoreBaseDataset } from '@/lib/lore/base-query';
import type { LoreBaseDataset } from '@/lib/lore/base-dataset';
import {
  normalizeLoreSubmissionWalletAddress,
  verifyLoreSubmissionTokenOwnership,
  type VerifyTokenOwnershipOptions,
} from '@/lib/lore/submissions/ownership';
import { parseLoreSubmissionCreateInput } from '@/lib/lore/submissions/validation';
import {
  loreSubmissionRepository,
  type LoreSubmissionAdminListFilters,
  type LoreSubmissionAdminListResult,
  type LoreSubmissionCurationUpdate,
  type LoreSubmissionRepository,
} from '@/lib/repositories/lore-submission-repository';
import type {
  CreateLoreSubmissionInput,
  LoreSubmission,
  LoreSubmissionDetailDto,
  LoreSubmissionListItemDto,
} from '@/types/lore-submission';
import { canonizationStageIds } from '@/lib/lore/types';
import {
  dedupeStrings,
  enrichCreateInputWithLoreRefs,
  getSubmissionSourceIds,
  validateLoreReferenceIds,
} from '@/lib/services/lore-submissions/reference-validation';
import {
  buildPublicationSnapshot,
  idSuffix,
  publicTitle,
  slugifyTitle,
  toListItem,
} from '@/lib/services/lore-submissions/publication';
import {
  buildCanonizeTransition,
  buildCloseTransition,
  buildDecanonizeTransition,
  buildRequestChangesTransition,
  buildUnpublishTransition,
  type ConditionalSubmissionTransition,
} from '@/lib/services/lore-submissions/transitions';

export class LoreSubmissionValidationError extends Error {
  details: string[];

  constructor(message: string, details: string[] = [message]) {
    super(message);
    this.name = 'LoreSubmissionValidationError';
    this.details = details;
  }
}

export class LoreSubmissionNotFoundError extends Error {
  constructor(message = 'Lore submission not found') {
    super(message);
    this.name = 'LoreSubmissionNotFoundError';
  }
}

export class LoreSubmissionForbiddenError extends Error {
  constructor(message = 'Not authorized to access this lore submission') {
    super(message);
    this.name = 'LoreSubmissionForbiddenError';
  }
}

export class LoreSubmissionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoreSubmissionConflictError';
  }
}

export class LoreSubmissionRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoreSubmissionRateLimitError';
  }
}

export interface LoreSubmissionServiceOptions {
  maxSubmissionsPerWindow?: number;
  submissionWindowMs?: number;
  ownershipVerifier?: (options: VerifyTokenOwnershipOptions) => Promise<{ owns: boolean; reason: string }>;
  loreBaseDatasetLoader?: () => Promise<LoreBaseDataset>;
}

export interface LoreSubmissionReviewBody {
  action: 'request_changes' | 'approve' | 'close' | 'reject' | 'admin_note';
  note?: string;
}

const DEFAULT_MAX_SUBMISSIONS_PER_WINDOW = 5;
const DEFAULT_SUBMISSION_WINDOW_MS = 60 * 60 * 1000;

const nullableTrimmedString = z.union([z.string().trim().min(1), z.null()]).optional();
const optionalTextArray = z.array(z.string().trim().min(1).max(120)).max(50).optional();
const canonizationStepStatusSchema = z.enum(['complete', 'current', 'blocked', 'not_started', 'skipped']);
const canonizationStepSchema = z.object({
  stageId: z.enum(canonizationStageIds),
  label: z.string().trim().min(1).max(120).optional(),
  status: canonizationStepStatusSchema,
  date: z.string().trim().min(1).max(64).optional(),
  sourceIds: optionalTextArray,
  note: z.string().trim().min(1).max(2000).optional(),
}).strict();

const curationSchema = z.object({
  curatedTitle: nullableTrimmedString,
  curatedSummary: nullableTrimmedString,
  curatedBodyMarkdown: nullableTrimmedString,
  curatedTags: z.union([z.array(z.string().trim().min(1).max(32)).max(10), z.null()]).optional(),
  seasonId: nullableTrimmedString,
  characterIds: optionalTextArray,
  locationIds: optionalTextArray,
  canonNote: nullableTrimmedString,
  canonPath: z.array(canonizationStepSchema).max(20).optional(),
}).strict();

const reviewSchema = z.object({
  action: z.enum(['request_changes', 'approve', 'close', 'reject', 'admin_note']),
  note: z.string().trim().max(2000).optional(),
}).strict();

function normalizeAddressOrThrow(address: string): string {
  const normalized = normalizeLoreSubmissionWalletAddress(address);
  if (!normalized) {
    throw new LoreSubmissionForbiddenError('Authenticated wallet address is invalid');
  }
  return normalized;
}

function zodDetails(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
    return `${path}${issue.message}`;
  });
}

function parseCreateInput(body: unknown): CreateLoreSubmissionInput {
  try {
    return parseLoreSubmissionCreateInput(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new LoreSubmissionValidationError('Invalid lore submission', zodDetails(error));
    }
    throw error;
  }
}

function requireNote(body: LoreSubmissionReviewBody, action: string): string {
  const note = body.note?.trim();
  if (!note) {
    throw new LoreSubmissionValidationError(`${action} requires a note`, [`${action} requires a note`]);
  }
  return note;
}

export class LoreSubmissionService {
  private readonly maxSubmissionsPerWindow: number;
  private readonly submissionWindowMs: number;
  private readonly ownershipVerifier: LoreSubmissionServiceOptions['ownershipVerifier'];
  private readonly loadBaseDataset: () => Promise<LoreBaseDataset>;

  constructor(
    private repository: LoreSubmissionRepository = loreSubmissionRepository,
    options: LoreSubmissionServiceOptions = {},
  ) {
    this.maxSubmissionsPerWindow = options.maxSubmissionsPerWindow ?? DEFAULT_MAX_SUBMISSIONS_PER_WINDOW;
    this.submissionWindowMs = options.submissionWindowMs ?? DEFAULT_SUBMISSION_WINDOW_MS;
    this.ownershipVerifier = options.ownershipVerifier ?? verifyLoreSubmissionTokenOwnership;
    this.loadBaseDataset = options.loreBaseDatasetLoader ?? getActiveLoreBaseDataset;
  }

  async createSubmission(body: unknown, walletAddress: string): Promise<LoreSubmissionDetailDto> {
    const submitterAddress = normalizeAddressOrThrow(walletAddress);
    const input = parseCreateInput(body);
    await this.ensureTokenOwnership(input.tokenId, submitterAddress);
    await this.ensureCreateAbuseControls(input, submitterAddress);

    const dataset = await this.loadBaseDataset();
    const enrichedInput = enrichCreateInputWithLoreRefs(input, dataset);
    const referenceErrors = validateLoreReferenceIds(dataset, {
      characterIds: enrichedInput.characterIds,
      locationIds: enrichedInput.locationIds,
    });
    if (referenceErrors.length > 0) {
      throw new LoreSubmissionValidationError('Invalid lore references', referenceErrors);
    }

    // Lifecycle policy: valid token-owner submissions are auto-public community lore.
    // Admin tools moderate, curate, hide, and canonize after publication.
    const submissionId = randomUUID();
    const publishedAt = new Date().toISOString();
    const publishedSlug = await this.ensurePublicationSlugForTitle(enrichedInput.title, submissionId, dataset);
    return this.repository.createPublishedSubmission(enrichedInput, submitterAddress, {
      submissionId,
      publishedSlug,
      publishedAt,
    });
  }

  async listForSubmitter(walletAddress: string): Promise<LoreSubmissionListItemDto[]> {
    const submitterAddress = normalizeAddressOrThrow(walletAddress);
    const submissions = await this.repository.listForSubmitter(submitterAddress);
    return submissions.map(toListItem);
  }

  async getForViewer(submissionId: string, walletAddress: string): Promise<LoreSubmissionDetailDto> {
    const viewer = normalizeAddressOrThrow(walletAddress);
    const detail = await this.repository.findDetail(submissionId);
    if (!detail) throw new LoreSubmissionNotFoundError();

    if (detail.submission.submitter_address !== viewer && !isAdmin(viewer)) {
      throw new LoreSubmissionForbiddenError();
    }

    return detail;
  }

  async reviseSubmission(submissionId: string, body: unknown, walletAddress: string): Promise<LoreSubmissionDetailDto> {
    const submitterAddress = normalizeAddressOrThrow(walletAddress);
    const existing = await this.repository.findById(submissionId);
    if (!existing) throw new LoreSubmissionNotFoundError();
    if (existing.submitter_address !== submitterAddress) throw new LoreSubmissionForbiddenError();
    if (existing.status !== 'changes_requested') {
      throw new LoreSubmissionConflictError('Only submissions with requested changes can be revised');
    }

    const input = parseCreateInput(body);
    if (input.tokenId !== existing.token_id) {
      throw new LoreSubmissionValidationError('tokenId cannot be changed during revision', [
        'tokenId cannot be changed during revision',
      ]);
    }

    await this.ensureTokenOwnership(input.tokenId, submitterAddress);

    const dataset = await this.loadBaseDataset();
    const enrichedInput = enrichCreateInputWithLoreRefs(input, dataset);
    const referenceErrors = validateLoreReferenceIds(dataset, {
      characterIds: enrichedInput.characterIds,
      locationIds: enrichedInput.locationIds,
    });
    if (referenceErrors.length > 0) {
      throw new LoreSubmissionValidationError('Invalid lore references', referenceErrors);
    }

    // Revisions requested by moderation re-enter public community lore once valid.
    const publishedAt = new Date().toISOString();
    const publishedSlug = await this.ensurePublicationSlugForTitle(
      existing.curated_title ?? enrichedInput.title,
      submissionId,
      dataset,
    );
    const detail = await this.repository.revisePublishedSubmission(submissionId, enrichedInput, submitterAddress, {
      publishedSlug,
      publishedAt,
    });
    if (!detail) throw new LoreSubmissionConflictError('Submission was changed before revision could be saved');
    return detail;
  }

  async listAdmin(filters: Partial<LoreSubmissionAdminListFilters>): Promise<LoreSubmissionAdminListResult> {
    return this.repository.listAdmin({
      status: filters.status,
      submitter: filters.submitter,
      query: filters.query,
      page: filters.page ?? 1,
      perPage: Math.min(Math.max(filters.perPage ?? 25, 1), 100),
    });
  }

  async getAdminDetail(submissionId: string): Promise<LoreSubmissionDetailDto> {
    const detail = await this.repository.findDetail(submissionId);
    if (!detail) throw new LoreSubmissionNotFoundError();
    return detail;
  }

  async updateCuration(submissionId: string, body: unknown, adminAddress: string): Promise<LoreSubmissionDetailDto> {
    const admin = normalizeAddressOrThrow(adminAddress);
    const parsed = curationSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new LoreSubmissionValidationError('Invalid curation payload', zodDetails(parsed.error));
    }

    const updates: LoreSubmissionCurationUpdate = {
      curated_title: parsed.data.curatedTitle ?? undefined,
      curated_summary: parsed.data.curatedSummary ?? undefined,
      curated_body_markdown: parsed.data.curatedBodyMarkdown ?? undefined,
      curated_tags: parsed.data.curatedTags === undefined ? undefined : parsed.data.curatedTags,
      season_id: parsed.data.seasonId ?? undefined,
      character_ids: dedupeStrings(parsed.data.characterIds),
      location_ids: dedupeStrings(parsed.data.locationIds),
      canon_note: parsed.data.canonNote ?? undefined,
      canon_path: parsed.data.canonPath,
    };

    const [dataset, existingDetail] = await Promise.all([
      this.loadBaseDataset(),
      this.repository.findDetail(submissionId),
    ]);
    if (!existingDetail) throw new LoreSubmissionNotFoundError();
    const referenceErrors = validateLoreReferenceIds(dataset, {
      seasonId: updates.season_id,
      characterIds: updates.character_ids,
      locationIds: updates.location_ids,
      canonPath: updates.canon_path,
    }, getSubmissionSourceIds(existingDetail));
    if (referenceErrors.length > 0) {
      throw new LoreSubmissionValidationError('Invalid lore references', referenceErrors);
    }

    const detail = await this.repository.updateCuration(submissionId, updates, admin);
    if (!detail) throw new LoreSubmissionNotFoundError();
    return detail;
  }

  async reviewSubmission(submissionId: string, body: unknown, adminAddress: string): Promise<LoreSubmissionDetailDto> {
    const parsed = reviewSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new LoreSubmissionValidationError('Invalid review payload', zodDetails(parsed.error));
    }

    if (parsed.data.action === 'approve') {
      return this.publishSubmission(submissionId, adminAddress, parsed.data.note);
    }

    if (parsed.data.action === 'request_changes') {
      return this.requestChanges(submissionId, adminAddress, requireNote(parsed.data, 'request_changes'));
    }

    if (parsed.data.action === 'close' || parsed.data.action === 'reject') {
      return this.closeSubmission(submissionId, adminAddress, requireNote(parsed.data, parsed.data.action));
    }

    return this.addAdminNote(submissionId, adminAddress, requireNote(parsed.data, 'admin_note'));
  }

  // Admin publish remains as an exceptional helper for submitted/stale rows and the legacy `approve` alias.
  async publishSubmission(submissionId: string, adminAddress: string, note?: string): Promise<LoreSubmissionDetailDto> {
    const admin = normalizeAddressOrThrow(adminAddress);
    const detail = await this.getAdminDetail(submissionId);
    if (detail.submission.status !== 'submitted') {
      throw new LoreSubmissionConflictError('Only submitted lore can be published');
    }

    return this.publishCommunitySubmission(detail, admin, note, {
      lastAdminAddress: admin,
      reviewedAt: new Date().toISOString(),
    });
  }

  async canonizeSubmission(submissionId: string, adminAddress: string, note?: string): Promise<LoreSubmissionDetailDto> {
    const admin = normalizeAddressOrThrow(adminAddress);
    return this.applyConditionalTransition(submissionId, buildCanonizeTransition({
      admin,
      note,
      now: new Date().toISOString(),
    }));
  }

  async decanonizeSubmission(submissionId: string, adminAddress: string, note?: string): Promise<LoreSubmissionDetailDto> {
    const admin = normalizeAddressOrThrow(adminAddress);
    return this.applyConditionalTransition(submissionId, buildDecanonizeTransition({
      admin,
      note,
      now: new Date().toISOString(),
    }));
  }

  async unpublishSubmission(submissionId: string, adminAddress: string, note?: string): Promise<LoreSubmissionDetailDto> {
    const admin = normalizeAddressOrThrow(adminAddress);
    return this.applyConditionalTransition(submissionId, buildUnpublishTransition({
      admin,
      note,
      now: new Date().toISOString(),
    }));
  }

  private async requestChanges(submissionId: string, adminAddress: string, note: string): Promise<LoreSubmissionDetailDto> {
    const admin = normalizeAddressOrThrow(adminAddress);
    return this.applyConditionalTransition(submissionId, buildRequestChangesTransition({
      admin,
      note,
      now: new Date().toISOString(),
    }));
  }

  private async closeSubmission(submissionId: string, adminAddress: string, note: string): Promise<LoreSubmissionDetailDto> {
    const admin = normalizeAddressOrThrow(adminAddress);
    return this.applyConditionalTransition(submissionId, buildCloseTransition({
      admin,
      note,
      now: new Date().toISOString(),
    }));
  }

  private async applyConditionalTransition(
    submissionId: string,
    transition: ConditionalSubmissionTransition,
  ): Promise<LoreSubmissionDetailDto> {
    const result = await this.repository.updateStatusConditional(
      submissionId,
      transition.expectedStatuses,
      transition.updates,
      transition.review,
    );

    if (!result) throw new LoreSubmissionConflictError(transition.conflictMessage);
    return result;
  }

  private async addAdminNote(submissionId: string, adminAddress: string, note: string): Promise<LoreSubmissionDetailDto> {
    const admin = normalizeAddressOrThrow(adminAddress);
    const existing = await this.getAdminDetail(submissionId);
    await this.repository.addReview({
      submissionId,
      actorAddress: admin,
      action: 'admin_note',
      fromStatus: existing.submission.status,
      toStatus: existing.submission.status,
      note,
    });

    return this.getAdminDetail(submissionId);
  }

  private async publishCommunitySubmission(
    detail: LoreSubmissionDetailDto,
    actorAddress: string,
    note?: string,
    options: { lastAdminAddress: string | null; reviewedAt: string | null } = {
      lastAdminAddress: null,
      reviewedAt: null,
    },
  ): Promise<LoreSubmissionDetailDto> {
    const dataset = await this.loadBaseDataset();
    const referenceErrors = validateLoreReferenceIds(dataset, {
      seasonId: detail.submission.season_id,
      characterIds: detail.submission.character_ids,
      locationIds: detail.submission.location_ids,
      canonPath: detail.submission.canon_path,
    }, getSubmissionSourceIds(detail));
    if (referenceErrors.length > 0) {
      throw new LoreSubmissionValidationError('Invalid lore references', referenceErrors);
    }

    const slug = await this.ensurePublicationSlug(detail.submission, dataset);
    const now = new Date().toISOString();
    const result = await this.repository.updateStatusConditional(
      detail.submission.id,
      ['submitted'],
      {
        status: 'public',
        visibility: 'public',
        published_kind: 'community',
        published_slug: slug,
        canon_status: 'community',
        canon_stage_id: 'community_recorded',
        publication_snapshot: buildPublicationSnapshot(detail, new Date().toISOString()),
        review_note: note ?? null,
        status_reason: null,
        last_admin_address: options.lastAdminAddress,
        reviewed_at: options.reviewedAt,
        published_at: now,
      },
      { actorAddress, action: 'publish', note: note ?? null },
    );

    if (!result) throw new LoreSubmissionConflictError('Submission was changed before it could be published');
    return result;
  }

  private async ensureTokenOwnership(tokenId: string, walletAddress: string): Promise<void> {
    // Admins may publish against tokens missing from the local ownership index.
    if (isAdmin(walletAddress)) return;

    const ownership = await this.ownershipVerifier!({ tokenId, walletAddress });
    if (!ownership.owns) {
      throw new LoreSubmissionForbiddenError(`Wallet does not own token ${tokenId} (${ownership.reason})`);
    }
  }

  private async ensureCreateAbuseControls(input: CreateLoreSubmissionInput, submitterAddress: string): Promise<void> {
    const duplicate = await this.repository.findOpenBySubmitterAndToken(submitterAddress, input.tokenId);
    if (duplicate) {
      throw new LoreSubmissionConflictError(`An active lore submission already exists for token ${input.tokenId}`);
    }

    const since = new Date(Date.now() - this.submissionWindowMs).toISOString();
    const recentCount = await this.repository.countRecentBySubmitter(submitterAddress, since);
    if (recentCount >= this.maxSubmissionsPerWindow) {
      throw new LoreSubmissionRateLimitError('Too many lore submissions from this wallet. Please try again later.');
    }
  }

  private async ensurePublicationSlug(
    submission: LoreSubmission,
    dataset: LoreBaseDataset,
  ): Promise<string> {
    return this.ensurePublicationSlugForTitle(publicTitle(submission), submission.id, dataset);
  }

  private async ensurePublicationSlugForTitle(
    title: string,
    submissionId: string,
    dataset: LoreBaseDataset,
  ): Promise<string> {
    const baseSlug = slugifyTitle(title);
    if (!dataset.indexes.eventsBySlug.has(baseSlug) && !await this.repository.slugExists(baseSlug, submissionId)) {
      return baseSlug;
    }

    const suffixed = `${baseSlug}-${idSuffix(submissionId)}`;
    if (!dataset.indexes.eventsBySlug.has(suffixed) && !await this.repository.slugExists(suffixed, submissionId)) {
      return suffixed;
    }

    throw new LoreSubmissionConflictError(`Could not mint a unique slug for '${baseSlug}'`);
  }
}

export const loreSubmissionService = new LoreSubmissionService();
