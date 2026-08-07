import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase';
import type {
  CreateLoreSubmissionInput,
  LoreSubmission,
  LoreSubmissionDetailDto,
  LoreSubmissionLink,
  LoreSubmissionLinkMetadata,
  LoreSubmissionReview,
  LoreSubmissionReviewAction,
  LoreSubmissionStatus,
  NormalizedLoreSubmissionLinkInput,
} from '@/types/lore-submission';
import {
  loreSubmissionLinkRoles,
  loreSubmissionLinkTypes,
  loreSubmissionPublishedKinds,
  loreSubmissionReviewActions,
  loreSubmissionStatuses,
  loreSubmissionVisibilities,
} from '@/types/lore-submission';
import type { Database, Json } from '@/lib/database.types';
import type { CanonStatus, CanonizationStageId, CanonizationStep, CanonizationStepStatus } from '@/lib/lore/types';
import { canonStatuses, canonizationStageIds } from '@/lib/lore/types';

export interface LoreSubmissionAdminListFilters {
  status?: LoreSubmissionStatus;
  submitter?: string;
  query?: string;
  page: number;
  perPage: number;
}

export interface LoreSubmissionAdminListResult {
  submissions: LoreSubmission[];
  total: number;
  page: number;
  perPage: number;
}

export interface LoreSubmissionCurationUpdate {
  curated_title?: string | null;
  curated_summary?: string | null;
  curated_body_markdown?: string | null;
  curated_tags?: string[] | null;
  season_id?: string | null;
  character_ids?: string[];
  location_ids?: string[];
  canon_note?: string | null;
  canon_path?: CanonizationStep[];
}

export interface LoreSubmissionStatusUpdate {
  status?: LoreSubmissionStatus;
  review_note?: string | null;
  status_reason?: string | null;
  last_admin_address?: string | null;
  published_slug?: string | null;
  visibility?: LoreSubmission['visibility'];
  published_kind?: LoreSubmission['published_kind'];
  canon_status?: CanonStatus;
  canon_stage_id?: CanonizationStageId;
  canon_note?: string | null;
  canon_path?: CanonizationStep[];
  publication_snapshot?: Json | null;
  reviewed_at?: string | null;
  published_at?: string | null;
  canonized_at?: string | null;
  closed_at?: string | null;
}

export interface LoreSubmissionReviewInput {
  submissionId: string;
  actorAddress: string;
  action: LoreSubmissionReviewAction;
  fromStatus: LoreSubmissionStatus | null;
  toStatus: LoreSubmissionStatus;
  note?: string | null;
}

export interface LoreSubmissionPublicationInput {
  submissionId?: string;
  publishedSlug: string;
  publishedAt: string;
}

type SupabaseError = { message: string; code?: string };
type LoreSubmissionDbClient = SupabaseClient<Database>;
type LoreSubmissionRow = Database['public']['Tables']['lore_submissions']['Row'];
type LoreSubmissionLinkRow = Database['public']['Tables']['lore_submission_links']['Row'];
type LoreSubmissionReviewRow = Database['public']['Tables']['lore_submission_reviews']['Row'];

const SUBMISSION_COLUMNS = '*';
const LINK_COLUMNS = '*';
const REVIEW_COLUMNS = '*';
const canonizationStepStatuses = ['complete', 'current', 'blocked', 'not_started', 'skipped'] as const;

function getClient(): LoreSubmissionDbClient {
  const client = getSupabaseAdmin();
  if (!client) {
    throw new Error('Supabase admin client not configured');
  }

  return client as LoreSubmissionDbClient;
}

function normalizeArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonObject(value: Json | null | undefined): value is { [key: string]: Json | undefined } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function typedValue<T extends readonly string[]>(
  value: string | null,
  allowed: T,
  fieldName: string,
): T[number] {
  if (value !== null && (allowed as readonly string[]).includes(value)) return value as T[number];
  throw new Error(`Invalid lore submission ${fieldName}: ${value ?? 'null'}`);
}

function optionalTypedValue<T extends readonly string[]>(
  value: string | null,
  allowed: T,
  fieldName: string,
): T[number] | null {
  if (value === null) return null;
  return typedValue(value, allowed, fieldName);
}

function normalizeCanonPath(value: Json | null): CanonizationStep[] {
  if (value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error('Invalid lore submission canon_path: expected an array');
  }

  return value.map((step, index) => {
    if (!isRecord(step)) {
      throw new Error(`Invalid lore submission canon_path[${index}]: expected an object`);
    }

    const stageId = typedValue(
      typeof step.stageId === 'string' ? step.stageId : null,
      canonizationStageIds,
      `canon_path[${index}].stageId`,
    ) as CanonizationStageId;
    const status = typedValue(
      typeof step.status === 'string' ? step.status : null,
      canonizationStepStatuses,
      `canon_path[${index}].status`,
    ) as CanonizationStepStatus;
    const sourceIds = Array.isArray(step.sourceIds) && step.sourceIds.every((sourceId) => typeof sourceId === 'string')
      ? step.sourceIds
      : undefined;

    return {
      stageId,
      label: typeof step.label === 'string' ? step.label : undefined,
      status,
      date: typeof step.date === 'string' ? step.date : undefined,
      sourceIds,
      note: typeof step.note === 'string' ? step.note : undefined,
    };
  });
}

function normalizePublicationSnapshot(value: Json | null): Json | null {
  if (value === null) return null;
  if (!isJsonObject(value)) {
    throw new Error('Invalid lore submission publication_snapshot: expected an object or null');
  }
  return value;
}

function normalizeLinkMetadata(value: Json | null): LoreSubmissionLinkMetadata {
  if (!isJsonObject(value)) {
    throw new Error('Invalid lore submission link metadata: expected an object');
  }
  return value as LoreSubmissionLinkMetadata;
}

function toJsonValue(value: unknown): Json {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(toJsonValue);
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .map(([entryKey, entryValue]) => [entryKey, toJsonValue(entryValue)]),
    ) as Json;
  }

  throw new Error('Value cannot be serialized as Supabase JSON');
}

function jsonObjectFromRecord(record: Record<string, unknown>): Json {
  return toJsonValue(record);
}

function toSubmission(row: LoreSubmissionRow): LoreSubmission {
  return {
    id: row.id,
    submitter_address: row.submitter_address,
    token_id: row.token_id,
    title: row.title,
    summary: row.summary,
    body_markdown: row.body_markdown,
    tags: normalizeArray(row.tags),
    curated_title: row.curated_title ?? null,
    curated_summary: row.curated_summary ?? null,
    curated_body_markdown: row.curated_body_markdown ?? null,
    curated_tags: row.curated_tags ?? null,
    season_id: row.season_id ?? null,
    character_ids: normalizeArray(row.character_ids),
    location_ids: normalizeArray(row.location_ids),
    status: typedValue(row.status, loreSubmissionStatuses, 'status') as LoreSubmissionStatus,
    review_note: row.review_note ?? null,
    status_reason: row.status_reason ?? null,
    last_admin_address: row.last_admin_address ?? null,
    published_slug: row.published_slug ?? null,
    visibility: typedValue(row.visibility, loreSubmissionVisibilities, 'visibility'),
    published_kind: optionalTypedValue(row.published_kind, loreSubmissionPublishedKinds, 'published_kind'),
    canon_status: typedValue(row.canon_status, canonStatuses, 'canon_status') as CanonStatus,
    canon_stage_id: typedValue(row.canon_stage_id, canonizationStageIds, 'canon_stage_id') as CanonizationStageId,
    canon_note: row.canon_note ?? null,
    canon_path: normalizeCanonPath(row.canon_path),
    publication_snapshot: normalizePublicationSnapshot(row.publication_snapshot),
    created_at: row.created_at,
    updated_at: row.updated_at,
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at ?? null,
    published_at: row.published_at ?? null,
    canonized_at: row.canonized_at ?? null,
    closed_at: row.closed_at ?? null,
  };
}

function toLink(row: LoreSubmissionLinkRow): LoreSubmissionLink {
  return {
    id: row.id,
    submission_id: row.submission_id,
    role: typedValue(row.role, loreSubmissionLinkRoles, 'link.role'),
    link_type: typedValue(row.link_type, loreSubmissionLinkTypes, 'link.link_type'),
    original_url: row.original_url,
    normalized_url: row.normalized_url,
    display_title: row.display_title ?? null,
    platform: row.platform ?? null,
    author: row.author ?? null,
    published_at: row.published_at ?? null,
    archived_url: row.archived_url ?? null,
    attribution: row.attribution ?? null,
    preservation_note: row.preservation_note ?? null,
    metadata: normalizeLinkMetadata(row.metadata),
    sort_order: row.sort_order ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toReview(row: LoreSubmissionReviewRow): LoreSubmissionReview {
  return {
    id: row.id,
    submission_id: row.submission_id,
    actor_address: row.actor_address,
    action: typedValue(row.action, loreSubmissionReviewActions, 'review.action'),
    from_status: optionalTypedValue(row.from_status, loreSubmissionStatuses, 'review.from_status'),
    to_status: typedValue(row.to_status, loreSubmissionStatuses, 'review.to_status') as LoreSubmissionStatus,
    note: row.note ?? null,
    created_at: row.created_at,
  };
}

function throwOnError(error: SupabaseError | null, context: string): void {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

function linkRpcPayload(links: NormalizedLoreSubmissionLinkInput[]): Json {
  return links.map((link, index) => jsonObjectFromRecord({
    role: link.role,
    link_type: link.linkType,
    original_url: link.originalUrl,
    normalized_url: link.normalizedUrl,
    display_title: link.displayTitle ?? null,
    platform: link.platform ?? null,
    archived_url: link.archivedUrl ?? null,
    attribution: link.attribution ?? null,
    metadata: link.metadata,
    sort_order: index,
  }));
}

function linkInsertRows(submissionId: string, links: NormalizedLoreSubmissionLinkInput[]): Database['public']['Tables']['lore_submission_links']['Insert'][] {
  return links.map((link, index) => ({
    submission_id: submissionId,
    role: link.role,
    link_type: link.linkType,
    original_url: link.originalUrl,
    normalized_url: link.normalizedUrl,
    display_title: link.displayTitle ?? null,
    platform: link.platform ?? null,
    archived_url: link.archivedUrl ?? null,
    attribution: link.attribution ?? null,
    metadata: jsonObjectFromRecord(link.metadata),
    sort_order: index,
  }));
}

async function fetchRequiredDetail(repository: LoreSubmissionRepository, submissionId: string, context: string): Promise<LoreSubmissionDetailDto> {
  const detail = await repository.findDetail(submissionId);
  if (!detail) throw new Error(`${context}: updated row was not found after transaction`);
  return detail;
}

export class LoreSubmissionRepository {
  async createSubmission(input: CreateLoreSubmissionInput, submitterAddress: string): Promise<LoreSubmissionDetailDto> {
    const { data: submissionId, error } = await getClient().rpc('create_lore_submission_with_links_and_review', {
      p_submitter_address: submitterAddress,
      p_token_id: input.tokenId,
      p_title: input.title,
      p_summary: input.summary,
      p_body_markdown: input.bodyMarkdown,
      p_tags: input.tags,
      p_character_ids: input.characterIds,
      p_location_ids: input.locationIds,
      p_links: linkRpcPayload(input.links),
    });

    throwOnError(error, 'Failed to create lore submission');
    if (!submissionId) throw new Error('Failed to create lore submission: no row returned');
    return fetchRequiredDetail(this, submissionId, 'Failed to create lore submission');
  }

  async createPublishedSubmission(
    input: CreateLoreSubmissionInput,
    submitterAddress: string,
    publication: LoreSubmissionPublicationInput,
  ): Promise<LoreSubmissionDetailDto> {
    const { data: submissionId, error } = await getClient().rpc('create_lore_submission_with_links_review_and_publication', {
      p_submission_id: publication.submissionId ?? null,
      p_submitter_address: submitterAddress,
      p_token_id: input.tokenId,
      p_title: input.title,
      p_summary: input.summary,
      p_body_markdown: input.bodyMarkdown,
      p_tags: input.tags,
      p_character_ids: input.characterIds,
      p_location_ids: input.locationIds,
      p_links: linkRpcPayload(input.links),
      p_published_slug: publication.publishedSlug,
      p_published_at: publication.publishedAt,
    });

    throwOnError(error, 'Failed to create and publish lore submission');
    if (!submissionId) throw new Error('Failed to create and publish lore submission: no row returned');
    return fetchRequiredDetail(this, submissionId, 'Failed to create and publish lore submission');
  }

  async findById(submissionId: string): Promise<LoreSubmission | null> {
    const { data, error } = await getClient()
      .from('lore_submissions')
      .select(SUBMISSION_COLUMNS)
      .eq('id', submissionId)
      .maybeSingle();

    throwOnError(error, 'Failed to fetch lore submission');
    return data ? toSubmission(data) : null;
  }

  async findDetail(submissionId: string): Promise<LoreSubmissionDetailDto | null> {
    const submission = await this.findById(submissionId);
    if (!submission) return null;

    const [links, reviews] = await Promise.all([
      this.listLinks(submissionId),
      this.listReviews(submissionId),
    ]);

    return { submission, links, reviews };
  }

  async listForSubmitter(submitterAddress: string): Promise<LoreSubmission[]> {
    const { data, error } = await getClient()
      .from('lore_submissions')
      .select(SUBMISSION_COLUMNS)
      .eq('submitter_address', submitterAddress)
      .order('created_at', { ascending: false });

    throwOnError(error, 'Failed to list lore submissions');
    return (data ?? []).map(toSubmission);
  }

  async listPublishedForEffectiveLore(): Promise<LoreSubmissionDetailDto[]> {
    const { data, error } = await getClient()
      .from('lore_submissions')
      .select(SUBMISSION_COLUMNS)
      .eq('visibility', 'public')
      .in('status', ['public', 'canonized'])
      .not('published_slug', 'is', null)
      .order('published_at', { ascending: true });

    throwOnError(error, 'Failed to list published lore submissions');

    const submissions: LoreSubmission[] = (data ?? []).map(toSubmission);
    return Promise.all(submissions.map(async (submission: LoreSubmission) => ({
      submission,
      links: await this.listLinks(submission.id),
      reviews: [],
    })));
  }

  async listAdmin(filters: LoreSubmissionAdminListFilters): Promise<LoreSubmissionAdminListResult> {
    const from = (filters.page - 1) * filters.perPage;
    const to = from + filters.perPage - 1;
    let query = getClient()
      .from('lore_submissions')
      .select(SUBMISSION_COLUMNS, { count: 'exact' })
      .order('submitted_at', { ascending: false })
      .range(from, to);

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.submitter) query = query.eq('submitter_address', filters.submitter);
    if (filters.query) {
      const escaped = filters.query.replace(/[%_]/g, (char) => `\\${char}`);
      query = query.or(`title.ilike.%${escaped}%,summary.ilike.%${escaped}%,token_id.eq.${escaped}`);
    }

    const { data, error, count } = await query;
    throwOnError(error, 'Failed to list admin lore submissions');

    return {
      submissions: (data ?? []).map(toSubmission),
      total: count ?? 0,
      page: filters.page,
      perPage: filters.perPage,
    };
  }

  async countRecentBySubmitter(submitterAddress: string, sinceIso: string): Promise<number> {
    const { error, count } = await getClient()
      .from('lore_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('submitter_address', submitterAddress)
      .gte('created_at', sinceIso);

    throwOnError(error, 'Failed to count recent lore submissions');
    return count ?? 0;
  }

  async findOpenBySubmitterAndToken(submitterAddress: string, tokenId: string): Promise<LoreSubmission | null> {
    const { data, error } = await getClient()
      .from('lore_submissions')
      .select(SUBMISSION_COLUMNS)
      .eq('submitter_address', submitterAddress)
      .eq('token_id', tokenId)
      .neq('status', 'closed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    throwOnError(error, 'Failed to find existing lore submission');
    return data ? toSubmission(data) : null;
  }

  async slugExists(slug: string, excludeSubmissionId?: string): Promise<boolean> {
    let query = getClient()
      .from('lore_submissions')
      .select('id')
      .eq('published_slug', slug)
      .limit(1);

    if (excludeSubmissionId) query = query.neq('id', excludeSubmissionId);

    const { data, error } = await query;
    throwOnError(error, 'Failed to check lore submission slug');
    return Boolean(data?.length);
  }

  async updateCuration(
    submissionId: string,
    updates: LoreSubmissionCurationUpdate,
    adminAddress: string,
  ): Promise<LoreSubmissionDetailDto | null> {
    const { data: updatedSubmissionId, error } = await getClient().rpc('update_lore_submission_curation_with_review', {
      p_submission_id: submissionId,
      p_updates: jsonObjectFromRecord(updates as Record<string, unknown>),
      p_actor_address: adminAddress,
    });

    throwOnError(error, 'Failed to update lore submission curation');
    if (!updatedSubmissionId) return null;
    return fetchRequiredDetail(this, updatedSubmissionId, 'Failed to update lore submission curation');
  }

  async updateStatusConditional(
    submissionId: string,
    expectedStatuses: LoreSubmissionStatus[],
    updates: LoreSubmissionStatusUpdate,
    review: Omit<LoreSubmissionReviewInput, 'submissionId' | 'fromStatus' | 'toStatus'>,
  ): Promise<LoreSubmissionDetailDto | null> {
    const { data: updatedSubmissionId, error } = await getClient().rpc('transition_lore_submission_with_review', {
      p_submission_id: submissionId,
      p_expected_statuses: expectedStatuses,
      p_updates: jsonObjectFromRecord(updates as Record<string, unknown>),
      p_actor_address: review.actorAddress,
      p_action: review.action,
      p_note: review.note ?? null,
    });

    throwOnError(error, 'Failed to update lore submission status');
    if (!updatedSubmissionId) return null;
    return fetchRequiredDetail(this, updatedSubmissionId, 'Failed to update lore submission status');
  }

  async reviseSubmission(
    submissionId: string,
    input: CreateLoreSubmissionInput,
    actorAddress: string,
  ): Promise<LoreSubmissionDetailDto | null> {
    const { data: updatedSubmissionId, error } = await getClient().rpc('revise_lore_submission_with_links_and_review', {
      p_submission_id: submissionId,
      p_actor_address: actorAddress,
      p_token_id: input.tokenId,
      p_title: input.title,
      p_summary: input.summary,
      p_body_markdown: input.bodyMarkdown,
      p_tags: input.tags,
      p_character_ids: input.characterIds,
      p_location_ids: input.locationIds,
      p_links: linkRpcPayload(input.links),
    });

    throwOnError(error, 'Failed to revise lore submission');
    if (!updatedSubmissionId) return null;
    return fetchRequiredDetail(this, updatedSubmissionId, 'Failed to revise lore submission');
  }

  async revisePublishedSubmission(
    submissionId: string,
    input: CreateLoreSubmissionInput,
    actorAddress: string,
    publication: LoreSubmissionPublicationInput,
  ): Promise<LoreSubmissionDetailDto | null> {
    const { data: updatedSubmissionId, error } = await getClient().rpc('revise_lore_submission_with_links_review_and_publication', {
      p_submission_id: publication.submissionId ?? submissionId,
      p_actor_address: actorAddress,
      p_token_id: input.tokenId,
      p_title: input.title,
      p_summary: input.summary,
      p_body_markdown: input.bodyMarkdown,
      p_tags: input.tags,
      p_character_ids: input.characterIds,
      p_location_ids: input.locationIds,
      p_links: linkRpcPayload(input.links),
      p_published_slug: publication.publishedSlug,
      p_published_at: publication.publishedAt,
    });

    throwOnError(error, 'Failed to revise and publish lore submission');
    if (!updatedSubmissionId) return null;
    return fetchRequiredDetail(this, updatedSubmissionId, 'Failed to revise and publish lore submission');
  }

  async listLinks(submissionId: string): Promise<LoreSubmissionLink[]> {
    const { data, error } = await getClient()
      .from('lore_submission_links')
      .select(LINK_COLUMNS)
      .eq('submission_id', submissionId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    throwOnError(error, 'Failed to list lore submission links');
    return (data ?? []).map(toLink);
  }

  async replaceLinks(submissionId: string, links: NormalizedLoreSubmissionLinkInput[]): Promise<LoreSubmissionLink[]> {
    const client = getClient();
    const deleteResult = await client
      .from('lore_submission_links')
      .delete()
      .eq('submission_id', submissionId);
    throwOnError(deleteResult.error, 'Failed to replace lore submission links');

    if (links.length === 0) return [];

    const { data, error } = await client
      .from('lore_submission_links')
      .insert(linkInsertRows(submissionId, links))
      .select(LINK_COLUMNS)
      .order('sort_order', { ascending: true });

    throwOnError(error, 'Failed to insert lore submission links');
    return (data ?? []).map(toLink);
  }

  async listReviews(submissionId: string): Promise<LoreSubmissionReview[]> {
    const { data, error } = await getClient()
      .from('lore_submission_reviews')
      .select(REVIEW_COLUMNS)
      .eq('submission_id', submissionId)
      .order('created_at', { ascending: true });

    throwOnError(error, 'Failed to list lore submission reviews');
    return (data ?? []).map(toReview);
  }

  async addReview(input: LoreSubmissionReviewInput): Promise<LoreSubmissionReview> {
    const { data, error } = await getClient()
      .from('lore_submission_reviews')
      .insert({
        submission_id: input.submissionId,
        actor_address: input.actorAddress,
        action: input.action,
        from_status: input.fromStatus,
        to_status: input.toStatus,
        note: input.note ?? null,
      })
      .select(REVIEW_COLUMNS)
      .single();

    throwOnError(error, 'Failed to write lore submission review');
    if (!data) throw new Error('Failed to write lore submission review: no row returned');
    return toReview(data);
  }
}

export const loreSubmissionRepository = new LoreSubmissionRepository();
