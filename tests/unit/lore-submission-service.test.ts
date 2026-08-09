import {
  LoreSubmissionConflictError,
  LoreSubmissionForbiddenError,
  LoreSubmissionRateLimitError,
  LoreSubmissionService,
  LoreSubmissionValidationError,
} from '@/lib/services/lore-submission-service';
import { createLoreBaseDataset, getStaticLoreBaseDataset } from '@/lib/lore/base-dataset';
import type { LoreSubmissionRepository } from '@/lib/repositories/lore-submission-repository';
import type { LoreSubmission, LoreSubmissionDetailDto } from '@/types/lore-submission';

jest.mock('@/lib/auth/admin', () => ({
  isAdmin: jest.fn(() => false),
}));

const wallet = '0xabcdef0000000000000000000000000000000001';
const admin = '0xabcdef00000000000000000000000000000000ad';
const staticDataset = getStaticLoreBaseDataset();
const dbOnlyCharacter = {
  ...staticDataset.characters[0],
  id: 'character-db-only-submission',
  slug: 'db-only-submission-character',
  name: 'DB Only Submission Character',
};
const dbOnlyLocation = {
  ...staticDataset.locations[0],
  id: 'location-db-only-submission',
  slug: 'db-only-submission-location',
  name: 'DB Only Submission Location',
};
const dbOnlySeason = {
  ...staticDataset.seasons[0],
  id: 'season-db-only-submission',
  slug: 'db-only-submission-season',
  title: 'DB Only Submission Season',
};
const dbDataset = createLoreBaseDataset({
  source: 'database',
  events: staticDataset.events,
  characters: [...staticDataset.characters, dbOnlyCharacter],
  locations: [...staticDataset.locations, dbOnlyLocation],
  seasons: [...staticDataset.seasons, dbOnlySeason],
  sources: staticDataset.sources,
  media: staticDataset.media,
});
const loadStaticDataset = jest.fn(async () => staticDataset);
const loadDbDataset = jest.fn(async () => dbDataset);

function submission(overrides: Partial<LoreSubmission> = {}): LoreSubmission {
  return {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    submitter_address: wallet,
    token_id: '42',
    title: 'A Fallen Bell Rings',
    summary: 'A community account of a strange bell echoing after the searing.',
    body_markdown: 'A bell rang beneath the ash.',
    tags: ['bell'],
    curated_title: null,
    curated_summary: null,
    curated_body_markdown: null,
    curated_tags: null,
    season_id: null,
    character_ids: [],
    location_ids: [],
    status: 'submitted',
    review_note: null,
    status_reason: null,
    last_admin_address: null,
    published_slug: null,
    visibility: 'pending',
    published_kind: null,
    canon_status: 'community',
    canon_stage_id: 'community_recorded',
    canon_note: null,
    canon_path: [],
    publication_snapshot: null,
    created_at: '2026-05-09T00:00:00.000Z',
    updated_at: '2026-05-09T00:00:00.000Z',
    submitted_at: '2026-05-09T00:00:00.000Z',
    reviewed_at: null,
    published_at: null,
    canonized_at: null,
    closed_at: null,
    ...overrides,
  };
}

function detail(overrides: Partial<LoreSubmission> = {}): LoreSubmissionDetailDto {
  return {
    submission: submission(overrides),
    links: [],
    reviews: [],
  };
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    tokenId: '42',
    title: 'A Fallen Bell Rings',
    summary: 'A community account of a strange bell echoing after the searing.',
    bodyMarkdown: 'A bell rang beneath the ash.',
    tags: ['Bell'],
    links: [{ url: 'https://example.com/source' }],
    ...overrides,
  };
}

function createRepository(overrides: Partial<Record<keyof LoreSubmissionRepository, jest.Mock>> = {}) {
  return {
    createSubmission: jest.fn(async () => detail()),
    createPublishedSubmission: jest.fn(async () => detail({
      status: 'public',
      visibility: 'public',
      published_kind: 'community',
      published_slug: 'a-fallen-bell-rings',
    })),
    listForSubmitter: jest.fn(async () => []),
    findDetail: jest.fn(async () => detail()),
    findById: jest.fn(async () => submission()),
    listAdmin: jest.fn(async () => ({ submissions: [], total: 0, page: 1, perPage: 25 })),
    countRecentBySubmitter: jest.fn(async () => 0),
    findOpenBySubmitterAndToken: jest.fn(async () => null),
    slugExists: jest.fn(async () => false),
    updateCuration: jest.fn(async () => detail()),
    updateStatusConditional: jest.fn(async () => detail({ status: 'public' })),
    reviseSubmission: jest.fn(async () => detail({ status: 'submitted' })),
    revisePublishedSubmission: jest.fn(async () => detail({
      status: 'public',
      visibility: 'public',
      published_kind: 'community',
      published_slug: 'a-revised-bell-rings',
    })),
    addReview: jest.fn(async () => ({
      id: 'review-1',
      submission_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      actor_address: admin,
      action: 'admin_note',
      from_status: 'submitted',
      to_status: 'submitted',
      note: 'note',
      created_at: '2026-05-09T00:00:00.000Z',
    })),
    ...overrides,
  } as unknown as jest.Mocked<LoreSubmissionRepository>;
}

describe('LoreSubmissionService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('auto-publishes valid token-owner submissions as public community lore', async () => {
    const repository = createRepository();
    const ownershipVerifier = jest.fn(async () => ({ owns: true, reason: 'owned' }));
    const service = new LoreSubmissionService(repository, {
      ownershipVerifier,
      loreBaseDatasetLoader: loadStaticDataset,
    });

    await service.createSubmission(validPayload(), '0xABCDEF0000000000000000000000000000000001');

    expect(ownershipVerifier).toHaveBeenCalledWith({ tokenId: '42', walletAddress: wallet });
    expect(repository.findOpenBySubmitterAndToken).toHaveBeenCalledWith(wallet, '42');
    expect(repository.countRecentBySubmitter).toHaveBeenCalledWith(wallet, expect.any(String));
    expect(repository.createSubmission).not.toHaveBeenCalled();
    expect(repository.createPublishedSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ tokenId: '42', tags: ['bell'] }),
      wallet,
      expect.objectContaining({
        submissionId: expect.any(String),
        publishedSlug: 'a-fallen-bell-rings',
        publishedAt: expect.any(String),
      }),
    );
    expect(repository.updateStatusConditional).not.toHaveBeenCalled();
  });

  it('auto-publishes valid revisions after requested changes as public community lore', async () => {
    const repository = createRepository({
      findById: jest.fn(async () => submission({ status: 'changes_requested' })),
      revisePublishedSubmission: jest.fn(async () => detail({
        status: 'public',
        visibility: 'public',
        published_kind: 'community',
        published_slug: 'a-revised-bell-rings',
      })),
    });
    const ownershipVerifier = jest.fn(async () => ({ owns: true, reason: 'owned' }));
    const service = new LoreSubmissionService(repository, {
      ownershipVerifier,
      loreBaseDatasetLoader: loadStaticDataset,
    });

    await service.reviseSubmission(
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      validPayload({
        title: 'A Revised Bell Rings',
        summary: 'A revised community account of a strange bell echoing after the searing.',
        bodyMarkdown: 'A revised bell rang beneath the ash.',
      }),
      '0xABCDEF0000000000000000000000000000000001',
    );

    expect(ownershipVerifier).toHaveBeenCalledWith({ tokenId: '42', walletAddress: wallet });
    expect(repository.reviseSubmission).not.toHaveBeenCalled();
    expect(repository.revisePublishedSubmission).toHaveBeenCalledWith(
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      expect.objectContaining({ title: 'A Revised Bell Rings', tags: ['bell'] }),
      wallet,
      expect.objectContaining({
        publishedSlug: 'a-revised-bell-rings',
        publishedAt: expect.any(String),
      }),
    );
    expect(repository.updateStatusConditional).not.toHaveBeenCalled();
  });

  it('rejects submissions when the connected wallet does not own the token', async () => {
    const service = new LoreSubmissionService(createRepository(), {
      ownershipVerifier: jest.fn(async () => ({ owns: false, reason: 'not_owner' })),
    });

    await expect(service.createSubmission(validPayload(), wallet)).rejects.toBeInstanceOf(LoreSubmissionForbiddenError);
  });

  it('fails duplicate active submissions predictably', async () => {
    const repository = createRepository({
      findOpenBySubmitterAndToken: jest.fn(async () => submission()),
    });
    const service = new LoreSubmissionService(repository, {
      ownershipVerifier: jest.fn(async () => ({ owns: true, reason: 'owned' })),
    });

    await expect(service.createSubmission(validPayload(), wallet)).rejects.toBeInstanceOf(LoreSubmissionConflictError);
  });

  it('enforces wallet-level submission abuse limits', async () => {
    const repository = createRepository({
      countRecentBySubmitter: jest.fn(async () => 5),
    });
    const service = new LoreSubmissionService(repository, {
      ownershipVerifier: jest.fn(async () => ({ owns: true, reason: 'owned' })),
      maxSubmissionsPerWindow: 5,
    });

    await expect(service.createSubmission(validPayload(), wallet)).rejects.toBeInstanceOf(LoreSubmissionRateLimitError);
  });

  it('mints deterministic suffixed slugs when publishing exceptional submitted rows', async () => {
    const repository = createRepository({
      findDetail: jest.fn(async () => detail({ curated_title: 'Genesis Mint' })),
      updateStatusConditional: jest.fn(async () => detail({ status: 'public', published_slug: 'genesis-mint-aaaaaaa' })),
    });
    const service = new LoreSubmissionService(repository, { loreBaseDatasetLoader: loadStaticDataset });

    await service.publishSubmission('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', admin, 'publish submitted edge case');

    expect(repository.updateStatusConditional).toHaveBeenCalledWith(
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      ['submitted'],
      expect.objectContaining({
        status: 'public',
        visibility: 'public',
        published_kind: 'community',
        published_slug: 'genesis-mint-aaaaaaaa',
      }),
      expect.objectContaining({ actorAddress: admin, action: 'publish', note: 'publish submitted edge case' }),
    );
  });

  it('builds the canonize transition payload exactly', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-11T12:34:56.789Z'));
    const repository = createRepository();
    const service = new LoreSubmissionService(repository, { loreBaseDatasetLoader: loadStaticDataset });

    await service.canonizeSubmission('sub-1', admin, 'make official');

    expect(repository.updateStatusConditional).toHaveBeenCalledWith(
      'sub-1',
      ['public'],
      {
        status: 'canonized',
        visibility: 'public',
        published_kind: 'official',
        canon_status: 'canon',
        canon_stage_id: 'canonized',
        canon_note: 'make official',
        review_note: 'make official',
        last_admin_address: admin,
        reviewed_at: '2026-05-11T12:34:56.789Z',
        canonized_at: '2026-05-11T12:34:56.789Z',
      },
      { actorAddress: admin, action: 'canonize', note: 'make official' },
    );
  });

  it('builds the decanonize transition payload exactly', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-11T12:34:56.789Z'));
    const repository = createRepository();
    const service = new LoreSubmissionService(repository, { loreBaseDatasetLoader: loadStaticDataset });

    await service.decanonizeSubmission('sub-1', admin);

    expect(repository.updateStatusConditional).toHaveBeenCalledWith(
      'sub-1',
      ['canonized'],
      {
        status: 'public',
        visibility: 'public',
        published_kind: 'community',
        canon_status: 'community',
        canon_stage_id: 'community_recorded',
        canon_note: null,
        review_note: null,
        last_admin_address: admin,
        reviewed_at: '2026-05-11T12:34:56.789Z',
        canonized_at: null,
      },
      { actorAddress: admin, action: 'decanonize', note: null },
    );
  });

  it('builds the unpublish transition payload exactly', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-11T12:34:56.789Z'));
    const repository = createRepository();
    const service = new LoreSubmissionService(repository, { loreBaseDatasetLoader: loadStaticDataset });

    await service.unpublishSubmission('sub-1', admin, 'hide for now');

    expect(repository.updateStatusConditional).toHaveBeenCalledWith(
      'sub-1',
      ['public'],
      {
        status: 'closed',
        visibility: 'hidden',
        published_kind: null,
        status_reason: 'hide for now',
        review_note: 'hide for now',
        last_admin_address: admin,
        reviewed_at: '2026-05-11T12:34:56.789Z',
        closed_at: '2026-05-11T12:34:56.789Z',
      },
      { actorAddress: admin, action: 'hide', note: 'hide for now' },
    );
  });

  it('builds review transition payloads exactly for request changes and close', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-11T12:34:56.789Z'));
    const repository = createRepository();
    const service = new LoreSubmissionService(repository, { loreBaseDatasetLoader: loadStaticDataset });

    await service.reviewSubmission('sub-1', { action: 'request_changes', note: 'add source' }, admin);
    await service.reviewSubmission('sub-2', { action: 'close', note: 'not usable' }, admin);

    expect(repository.updateStatusConditional).toHaveBeenNthCalledWith(
      1,
      'sub-1',
      ['submitted'],
      {
        status: 'changes_requested',
        visibility: 'pending',
        review_note: 'add source',
        status_reason: 'add source',
        last_admin_address: admin,
        reviewed_at: '2026-05-11T12:34:56.789Z',
      },
      { actorAddress: admin, action: 'request_changes', note: 'add source' },
    );
    expect(repository.updateStatusConditional).toHaveBeenNthCalledWith(
      2,
      'sub-2',
      ['submitted', 'changes_requested', 'public'],
      {
        status: 'closed',
        visibility: 'hidden',
        published_kind: null,
        review_note: 'not usable',
        status_reason: 'not usable',
        last_admin_address: admin,
        reviewed_at: '2026-05-11T12:34:56.789Z',
        closed_at: '2026-05-11T12:34:56.789Z',
      },
      { actorAddress: admin, action: 'close', note: 'not usable' },
    );
  });

  it.each([
    {
      label: 'canonize',
      run: (service: LoreSubmissionService) => service.canonizeSubmission('sub-1', admin),
      message: 'Only public community lore can be canonized',
    },
    {
      label: 'decanonize',
      run: (service: LoreSubmissionService) => service.decanonizeSubmission('sub-1', admin),
      message: 'Only canonized lore can be decanonized',
    },
    {
      label: 'unpublish',
      run: (service: LoreSubmissionService) => service.unpublishSubmission('sub-1', admin),
      message: 'Only public community lore can be unpublished',
    },
    {
      label: 'request changes',
      run: (service: LoreSubmissionService) => service.reviewSubmission('sub-1', { action: 'request_changes', note: 'fix' }, admin),
      message: 'Only submitted lore can receive change requests',
    },
    {
      label: 'close',
      run: (service: LoreSubmissionService) => service.reviewSubmission('sub-1', { action: 'close', note: 'done' }, admin),
      message: 'Submission cannot be closed from its current status',
    },
  ])('turns stale $label transitions into unchanged conflicts', async ({ run, message }) => {
    const repository = createRepository({
      updateStatusConditional: jest.fn(async () => null),
    });
    const service = new LoreSubmissionService(repository, { loreBaseDatasetLoader: loadStaticDataset });

    await expect(run(service)).rejects.toMatchObject({
      name: 'LoreSubmissionConflictError',
      message,
    });
  });

  it('accepts DB-only active base references during curation', async () => {
    const repository = createRepository();
    const service = new LoreSubmissionService(repository, { loreBaseDatasetLoader: loadDbDataset });

    await service.updateCuration('sub-1', {
      seasonId: dbOnlySeason.id,
      characterIds: [dbOnlyCharacter.id],
      locationIds: [dbOnlyLocation.id],
    }, admin);

    expect(repository.updateCuration).toHaveBeenCalledWith('sub-1', expect.objectContaining({
      season_id: dbOnlySeason.id,
      character_ids: [dbOnlyCharacter.id],
      location_ids: [dbOnlyLocation.id],
    }), admin);
  });

  it('rejects missing active base references before publication', async () => {
    const repository = createRepository({
      findDetail: jest.fn(async () => detail({
        season_id: 'season-missing',
        character_ids: ['character-missing'],
        location_ids: ['location-missing'],
      })),
    });
    const service = new LoreSubmissionService(repository, { loreBaseDatasetLoader: loadStaticDataset });

    await expect(service.publishSubmission('sub-1', admin, 'publish submitted edge case')).rejects.toMatchObject({
      details: expect.arrayContaining([
        'seasonId references missing season: season-missing',
        'characterIds references missing character: character-missing',
        'locationIds references missing location: location-missing',
      ]),
    });
    expect(repository.updateStatusConditional).not.toHaveBeenCalled();
  });

  it('rejects malformed canon paths before saving curation', async () => {
    const repository = createRepository();
    const service = new LoreSubmissionService(repository, { loreBaseDatasetLoader: loadStaticDataset });

    await expect(service.updateCuration('sub-1', {
      canonPath: [{ stageId: 'not-a-stage', status: 'current' }],
    }, admin)).rejects.toBeInstanceOf(LoreSubmissionValidationError);
    expect(repository.updateCuration).not.toHaveBeenCalled();
  });

  it('requires notes for request-changes reviews', async () => {
    const service = new LoreSubmissionService(createRepository());

    await expect(service.reviewSubmission('sub-1', { action: 'request_changes' }, admin))
      .rejects.toBeInstanceOf(LoreSubmissionValidationError);
  });
});
