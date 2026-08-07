import { loreCanonizationRepository } from '@/lib/repositories/lore-canonization-repository';
import {
  getActiveLoreBaseDataset,
  getActiveLoreBaseDatasetWithDiagnostics,
} from '@/lib/lore/base-query';
import {
  applyPublishedCanonizationOverrides,
  getAllEffectiveLoreCharacters,
  getAllEffectiveLoreEvents,
  getAllEffectiveLoreLocations,
  getAllEffectiveLoreSeasons,
  getEffectiveArchiveItems,
  getEffectiveCommunityEventBySlug,
  getEffectiveLoreDiagnostics,
  getEffectiveLoreEventBySlug,
  getEffectiveOfficialEventBySlug,
  getEffectiveMediaById,
  getEffectiveMediaForEvent,
  getEffectiveRelatedEntitiesForEvent,
  getEffectiveSourcesByEventId,
  getEffectiveSourcesForEvent,
  getEffectiveTokenCharacterLore,
} from '@/lib/lore/effective-query';
import { createLoreBaseDataset, getStaticLoreBaseDataset } from '@/lib/lore/base-dataset';
import { loreEvents } from '@/lib/lore/data/events';
import { loreSubmissionRepository } from '@/lib/repositories/lore-submission-repository';
import type { LoreCanonizationOverride } from '@/lib/lore/canonization-overrides';
import type {
  Canonization,
  LoreCharacter,
  LoreEvent,
  LoreLocation,
  LoreSeason,
  SourceRecord,
} from '@/lib/lore/types';
import type { LoreSubmissionDetailDto } from '@/types/lore-submission';

jest.mock('@/lib/lore/base-query', () => ({
  getActiveLoreBaseDataset: jest.fn(),
  getActiveLoreBaseDatasetWithDiagnostics: jest.fn(),
}));

jest.mock('@/lib/repositories/lore-canonization-repository', () => ({
  loreCanonizationRepository: {
    findAll: jest.fn(),
  },
}));

jest.mock('@/lib/repositories/lore-submission-repository', () => ({
  loreSubmissionRepository: {
    listPublishedForEffectiveLore: jest.fn(),
  },
}));

const staticDataset = getStaticLoreBaseDataset();
const staticEvent = loreEvents.find((event) => event.id === 'event-pilgrims-ashen-road')!;
const dbOnlyEvent: LoreEvent = {
  ...staticEvent,
  id: 'event-db-only-bell',
  slug: 'db-only-bell',
  title: 'DB Only Bell',
  summary: 'A database-only bell event.',
  characterIds: [staticDataset.characters[0].id],
  locationIds: [staticDataset.locations[0].id],
  entityRefs: [
    { kind: 'character', id: staticDataset.characters[0].id },
    { kind: 'location', id: staticDataset.locations[0].id },
  ],
};
const dbDataset = createLoreBaseDataset({
  source: 'database',
  events: [dbOnlyEvent],
  characters: staticDataset.characters,
  locations: staticDataset.locations,
  seasons: staticDataset.seasons,
  sources: staticDataset.sources,
  media: staticDataset.media,
});

const publishedCanon: Canonization = {
  status: 'canon',
  stageId: 'canonized',
  note: 'Published canon override',
  updatedAt: '2026-05-09T00:00:00.000Z',
  path: [
    { stageId: 'source_attributed', status: 'complete' },
    { stageId: 'canonized', status: 'current' },
  ],
};

const draftCanon: Canonization = {
  status: 'non_canon',
  stageId: 'rejected',
  note: 'Draft-only rejection',
  updatedAt: '2026-05-09T00:00:00.000Z',
  path: [
    { stageId: 'source_attributed', status: 'complete' },
    { stageId: 'rejected', status: 'current' },
  ],
};

const makeOverride = (
  canon: Canonization,
  publicationStatus: LoreCanonizationOverride['publicationStatus'],
  eventId = staticEvent.id,
): LoreCanonizationOverride => ({
  eventId,
  canon,
  publicationStatus,
  updatedBy: '0xAdmin',
  publishedBy: publicationStatus === 'published' ? '0xAdmin' : undefined,
  publishedAt: publicationStatus === 'published' ? '2026-05-09T00:00:00.000Z' : undefined,
  updatedAt: '2026-05-09T00:00:00.000Z',
  createdAt: '2026-05-09T00:00:00.000Z',
});

const makeCharacter = (overrides: Partial<LoreCharacter>): LoreCharacter => ({
  id: 'character-test',
  slug: 'character-test',
  name: 'Test Character',
  aliases: [],
  summary: 'A test character.',
  tags: [],
  ...overrides,
});

const makeLocation = (overrides: Partial<LoreLocation>): LoreLocation => ({
  id: 'location-test',
  slug: 'location-test',
  name: 'Test Location',
  aliases: [],
  summary: 'A test location.',
  tags: [],
  ...overrides,
});

const makeSeason = (overrides: Partial<LoreSeason>): LoreSeason => ({
  id: 'season-test',
  slug: 'season-test',
  title: 'Test Season',
  summary: 'A test season.',
  order: 0,
  ...overrides,
});

const makeSource = (overrides: Partial<SourceRecord>): SourceRecord => ({
  id: 'source-test',
  kind: 'website',
  title: 'Test Source',
  attribution: 'Test archive.',
  ...overrides,
});

const makeEvent = (overrides: Partial<LoreEvent>): LoreEvent => ({
  ...staticEvent,
  id: 'event-test',
  slug: 'event-test',
  title: 'Test Event',
  summary: 'A test event.',
  body: 'A test event body.',
  seasonId: undefined,
  locationIds: [],
  characterIds: [],
  entityRefs: [],
  timelineOrder: 0,
  sourceIds: [],
  mediaIds: [],
  tags: [],
  keywords: [],
  ...overrides,
});

const mockBaseDatasetLoad = (
  dataset = staticDataset,
  diagnosticsOverrides: Partial<Awaited<ReturnType<typeof getActiveLoreBaseDatasetWithDiagnostics>>['diagnostics']> = {},
): void => {
  const diagnostics = {
    configuredSource: 'auto' as const,
    activeSource: dataset.source,
    fallback: { used: false },
    ...diagnosticsOverrides,
  };

  (getActiveLoreBaseDataset as jest.Mock).mockResolvedValue(dataset);
  (getActiveLoreBaseDatasetWithDiagnostics as jest.Mock).mockResolvedValue({ dataset, diagnostics });
};

const makeSubmissionDetail = (
  overrides: Partial<LoreSubmissionDetailDto['submission']> = {},
  links: LoreSubmissionDetailDto['links'] = [],
): LoreSubmissionDetailDto => {
  const id = overrides.id ?? 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const timestamp = '2026-05-09T16:00:00.000Z';

  return {
    submission: {
      id,
      submitter_address: '0xsubmitter',
      token_id: '42',
      title: 'Community Token Tale',
      summary: 'A public community submission tied to a token owner.',
      body_markdown: 'The token appeared in a community story.',
      tags: ['community'],
      curated_title: null,
      curated_summary: null,
      curated_body_markdown: null,
      curated_tags: null,
      season_id: 'season-community-chronicles',
      character_ids: [],
      location_ids: [],
      status: 'public',
      review_note: null,
      status_reason: null,
      last_admin_address: null,
      published_slug: 'community-token-tale',
      visibility: 'public',
      published_kind: 'community',
      canon_status: 'community',
      canon_stage_id: 'community_recorded',
      canon_note: null,
      canon_path: [{ stageId: 'community_recorded', status: 'current' }],
      publication_snapshot: null,
      created_at: timestamp,
      updated_at: timestamp,
      submitted_at: timestamp,
      reviewed_at: timestamp,
      published_at: timestamp,
      canonized_at: null,
      closed_at: null,
      ...overrides,
    },
    links: links.map((link) => ({ ...link, submission_id: id })),
    reviews: [],
  };
};

describe('published lore effective query', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBaseDatasetLoad(staticDataset);
    (loreCanonizationRepository.findAll as jest.Mock).mockResolvedValue([]);
    (loreSubmissionRepository.listPublishedForEffectiveLore as jest.Mock).mockResolvedValue([]);
  });

  it('applies published overrides while ignoring draft overrides', () => {
    const [event] = applyPublishedCanonizationOverrides([staticEvent as LoreEvent], [
      {
        eventId: staticEvent.id,
        draftOverride: makeOverride(draftCanon, 'draft'),
        publishedOverride: makeOverride(publishedCanon, 'published'),
      },
    ]);

    expect(event.canon.status).toBe('canon');
    expect(event.canon.stageId).toBe('canonized');
    expect(event.canon.note).toBe('Published canon override');
  });

  it('keeps static canonization when only a draft override exists', async () => {
    (loreCanonizationRepository.findAll as jest.Mock).mockResolvedValueOnce([
      {
        eventId: staticEvent.id,
        draftOverride: makeOverride(draftCanon, 'draft'),
      },
    ]);

    const items = await getEffectiveArchiveItems({ canonStatus: 'non_canon' });

    expect(items.some((event) => event.id === staticEvent.id)).toBe(false);
    expect(loreCanonizationRepository.findAll).toHaveBeenCalledTimes(1);
  });

  it('makes published overrides visible to archive filters', async () => {
    (loreCanonizationRepository.findAll as jest.Mock).mockResolvedValueOnce([
      {
        eventId: staticEvent.id,
        draftOverride: makeOverride(draftCanon, 'draft'),
        publishedOverride: makeOverride(publishedCanon, 'published'),
      },
    ]);

    const items = await getEffectiveArchiveItems({ canonStatus: 'canon', canonStage: 'canonized' });

    expect(items.some((event) => event.id === staticEvent.id)).toBe(true);
  });

  it('uses DB-backed base events and filter/entity indexes from the active base dataset', async () => {
    mockBaseDatasetLoad(dbDataset);

    const events = await getAllEffectiveLoreEvents();
    const archiveItems = await getEffectiveArchiveItems({
      character: staticDataset.characters[0].slug,
      location: staticDataset.locations[0].slug,
    });
    const seasonItems = await getEffectiveArchiveItems({
      season: staticDataset.seasons.find((season) => season.id === dbOnlyEvent.seasonId)!.slug,
    });
    const keywordItems = await getEffectiveArchiveItems({ keyword: 'database-only' });
    const relatedEntities = await getEffectiveRelatedEntitiesForEvent(dbOnlyEvent);
    const [characters, locations, seasons] = await Promise.all([
      getAllEffectiveLoreCharacters(),
      getAllEffectiveLoreLocations(),
      getAllEffectiveLoreSeasons(),
    ]);
    const sourcesByEventId = await getEffectiveSourcesByEventId([dbOnlyEvent]);
    const media = await getEffectiveMediaById(staticDataset.media[0].id);

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(dbOnlyEvent.id);
    expect(archiveItems.map((event) => event.id)).toEqual([dbOnlyEvent.id]);
    expect(seasonItems.map((event) => event.id)).toEqual([dbOnlyEvent.id]);
    expect(keywordItems.map((event) => event.id)).toEqual([dbOnlyEvent.id]);
    expect(characters.map((character) => character.id)).toContain(staticDataset.characters[0].id);
    expect(locations.map((location) => location.id)).toContain(staticDataset.locations[0].id);
    expect(seasons.map((season) => season.id)).toContain(dbOnlyEvent.seasonId);
    expect(sourcesByEventId[dbOnlyEvent.id].map((source) => source.id)).toEqual(dbOnlyEvent.sourceIds);
    expect(media?.id).toBe(staticDataset.media[0].id);
    expect(relatedEntities).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'character', slug: staticDataset.characters[0].slug }),
      expect.objectContaining({ kind: 'location', slug: staticDataset.locations[0].slug }),
    ]));
  });

  it('applies published canonization overrides to DB-backed base events', async () => {
    mockBaseDatasetLoad(dbDataset);
    (loreCanonizationRepository.findAll as jest.Mock).mockResolvedValueOnce([
      {
        eventId: dbOnlyEvent.id,
        publishedOverride: makeOverride(publishedCanon, 'published', dbOnlyEvent.id),
      },
    ]);

    const event = await getEffectiveLoreEventBySlug(dbOnlyEvent.slug);

    expect(event?.canon.status).toBe('canon');
    expect(event?.canon.stageId).toBe('canonized');
  });

  it('does not let published submission id or slug collisions override base lore', async () => {
    mockBaseDatasetLoad(dbDataset);
    (loreSubmissionRepository.listPublishedForEffectiveLore as jest.Mock).mockResolvedValue([
      {
        submission: {
          id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          submitter_address: '0xsubmitter',
          token_id: '42',
          title: 'Collision',
          summary: 'A colliding community submission.',
          body_markdown: 'This should not replace base lore.',
          tags: ['collision'],
          curated_title: null,
          curated_summary: null,
          curated_body_markdown: null,
          curated_tags: null,
          season_id: dbOnlyEvent.seasonId,
          character_ids: dbOnlyEvent.characterIds,
          location_ids: dbOnlyEvent.locationIds,
          status: 'public',
          review_note: null,
          status_reason: null,
          last_admin_address: null,
          published_slug: dbOnlyEvent.slug,
          visibility: 'public',
          published_kind: 'community',
          canon_status: 'community',
          canon_stage_id: 'community_recorded',
          canon_note: null,
          canon_path: [{ stageId: 'community_recorded', status: 'current' }],
          publication_snapshot: null,
          created_at: '2026-05-09T16:00:00.000Z',
          updated_at: '2026-05-09T16:00:00.000Z',
          submitted_at: '2026-05-09T16:00:00.000Z',
          reviewed_at: '2026-05-09T16:00:00.000Z',
          published_at: '2026-05-09T16:00:00.000Z',
          canonized_at: null,
          closed_at: null,
        },
        links: [],
        reviews: [],
      },
    ]);

    const event = await getEffectiveLoreEventBySlug(dbOnlyEvent.slug);
    const events = await getAllEffectiveLoreEvents();

    expect(event?.id).toBe(dbOnlyEvent.id);
    expect(events).toHaveLength(1);
  });

  it('includes DB-backed published submissions in archive and effective source/media resolution', async () => {
    (loreSubmissionRepository.listPublishedForEffectiveLore as jest.Mock).mockResolvedValue([
      {
        submission: {
          id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          submitter_address: '0xsubmitter',
          token_id: '42',
          title: 'Bell Glow Witness',
          summary: 'A public community submission tied to a token owner.',
          body_markdown: 'The bell glowed in witness reports.',
          tags: ['bell'],
          curated_title: null,
          curated_summary: null,
          curated_body_markdown: null,
          curated_tags: null,
          season_id: 'season-community-chronicles',
          character_ids: ['character-5'],
          location_ids: ['location-ashen-road'],
          status: 'public',
          review_note: null,
          status_reason: null,
          last_admin_address: null,
          published_slug: 'bell-glow-witness',
          visibility: 'public',
          published_kind: 'community',
          canon_status: 'community',
          canon_stage_id: 'community_recorded',
          canon_note: null,
          canon_path: [{ stageId: 'community_recorded', status: 'current' }],
          publication_snapshot: null,
          created_at: '2026-05-09T16:00:00.000Z',
          updated_at: '2026-05-09T16:00:00.000Z',
          submitted_at: '2026-05-09T16:00:00.000Z',
          reviewed_at: '2026-05-09T16:00:00.000Z',
          published_at: '2026-05-09T16:00:00.000Z',
          canonized_at: null,
          closed_at: null,
        },
        links: [
          {
            id: 'link-1',
            submission_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            role: 'source_media',
            link_type: 'youtube',
            original_url: 'https://youtu.be/dQw4w9WgXcQ',
            normalized_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            display_title: 'Bell witness video',
            platform: 'YouTube',
            author: null,
            published_at: '2026-05-09T15:00:00.000Z',
            archived_url: 'https://archive.example/bell',
            attribution: 'Submitted by 0xsubmitter.',
            preservation_note: 'Archive URL supplied by submitter.',
            metadata: {
              youtubeVideoId: 'dQw4w9WgXcQ',
              youtubeEmbedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
            },
            sort_order: 0,
            created_at: '2026-05-09T16:00:00.000Z',
            updated_at: '2026-05-09T16:00:00.000Z',
          },
        ],
        reviews: [],
      },
    ]);

    const events = await getAllEffectiveLoreEvents();
    const event = events.find((item) => item.slug === 'bell-glow-witness');

    expect(event).toBeDefined();
    expect(event!.kind).toBe('community');
    expect(event!.characterIds).toContain('character-5');

    const archiveItems = await getEffectiveArchiveItems({ character: 'character-5' });
    expect(archiveItems.some((item) => item.slug === 'bell-glow-witness')).toBe(true);

    const sources = await getEffectiveSourcesForEvent(event!);
    const media = await getEffectiveMediaForEvent(event!);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      kind: 'video',
      title: 'Bell witness video',
      archivedUrl: 'https://archive.example/bell',
      mediaIds: [media[0].id],
    });
    expect(media).toHaveLength(1);
    expect(media[0]).toMatchObject({
      kind: 'video',
      title: 'Bell witness video',
      url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      archivedUrl: 'https://archive.example/bell',
    });
  });

  it('reflects public, canonized, decanonized, and hidden submission states in effective archive visibility', async () => {
    const baseSubmission = makeSubmissionDetail({
      id: 'eeeeeeee-ffff-0000-1111-222222222222',
      title: 'Bell State Witness',
      summary: 'A community record used to lock publication state visibility.',
      body_markdown: 'The bell state changed under operator action.',
      published_slug: 'bell-state-witness',
      token_id: '4242',
      character_ids: [],
      location_ids: ['location-ashen-road'],
      status: 'public',
      visibility: 'public',
      published_kind: 'community',
      canon_status: 'community',
      canon_stage_id: 'community_recorded',
      canonized_at: null,
      closed_at: null,
    });

    const mockPublishedSubmissions = (detail: LoreSubmissionDetailDto) => {
      (loreSubmissionRepository.listPublishedForEffectiveLore as jest.Mock).mockResolvedValueOnce([detail]);
    };

    mockPublishedSubmissions(baseSubmission);
    await expect(getEffectiveArchiveItems({ keyword: 'bell state' })).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({
        slug: 'bell-state-witness',
        kind: 'community',
        canon: expect.objectContaining({ status: 'community', stageId: 'community_recorded' }),
      })]),
    );

    mockPublishedSubmissions(makeSubmissionDetail({
      ...baseSubmission.submission,
      status: 'canonized',
      published_kind: 'official',
      canon_status: 'canon',
      canon_stage_id: 'canonized',
      canonized_at: '2026-05-10T00:00:00.000Z',
    }));
    await expect(getEffectiveOfficialEventBySlug('bell-state-witness')).resolves.toEqual(
      expect.objectContaining({
        slug: 'bell-state-witness',
        kind: 'official',
        canon: expect.objectContaining({ status: 'canon', stageId: 'canonized' }),
      }),
    );

    mockPublishedSubmissions(makeSubmissionDetail({
      ...baseSubmission.submission,
      status: 'public',
      published_kind: 'community',
      canon_status: 'community',
      canon_stage_id: 'community_recorded',
      canonized_at: null,
    }));
    await expect(getEffectiveCommunityEventBySlug('bell-state-witness')).resolves.toEqual(
      expect.objectContaining({
        slug: 'bell-state-witness',
        kind: 'community',
        canon: expect.objectContaining({ status: 'community', stageId: 'community_recorded' }),
      }),
    );

    mockPublishedSubmissions(makeSubmissionDetail({
      ...baseSubmission.submission,
      status: 'closed',
      visibility: 'hidden',
      published_kind: 'community',
      closed_at: '2026-05-11T00:00:00.000Z',
    }));
    await expect(getEffectiveLoreEventBySlug('bell-state-witness')).resolves.toBeUndefined();
  });

  it('returns undefined for invalid or unmatched token ids', async () => {
    await expect(getEffectiveTokenCharacterLore(0)).resolves.toBeUndefined();
    expect(getActiveLoreBaseDatasetWithDiagnostics).not.toHaveBeenCalled();

    await expect(getEffectiveTokenCharacterLore(987654321)).resolves.toBeUndefined();
    expect(getActiveLoreBaseDatasetWithDiagnostics).toHaveBeenCalledTimes(1);
  });

  it('resolves token lore with deterministic match and appearance ordering plus first-seen dedupe', async () => {
    const tokenId = 777;
    const characters = [
      makeCharacter({
        id: 'beta-token-match',
        slug: 'beta-token-match',
        name: 'Beta Token Match',
        tokenId,
      }),
      makeCharacter({
        id: `character-${tokenId}`,
        slug: `character-${tokenId}`,
        name: 'Synthetic Token Match',
      }),
      makeCharacter({
        id: 'alpha-token-match',
        slug: 'alpha-token-match',
        name: 'Alpha Token Match',
        tokenId,
        firstAppearanceEventId: 'event-missing-first-appearance',
      }),
    ];
    const locations = [
      makeLocation({ id: 'location-a', slug: 'location-a', name: 'A First Location' }),
      makeLocation({ id: 'location-b', slug: 'location-b', name: 'B Second Location' }),
    ];
    const seasons = [
      makeSeason({ id: 'season-late', slug: 'season-late', title: 'Late Season', order: 20 }),
      makeSeason({ id: 'season-early', slug: 'season-early', title: 'Early Season', order: 10 }),
    ];
    const sources = [
      makeSource({ id: 'source-a', title: 'A First Source' }),
      makeSource({ id: 'source-b', title: 'B Second Source' }),
    ];
    const events = [
      makeEvent({
        id: 'event-late',
        slug: 'event-late',
        title: 'Late Witness',
        timelineOrder: 20,
        seasonId: 'season-late',
        characterIds: ['beta-token-match'],
        locationIds: ['location-b'],
        sourceIds: ['source-b'],
      }),
      makeEvent({
        id: 'event-zulu',
        slug: 'event-zulu',
        title: 'Zulu Witness',
        timelineOrder: 10,
        seasonId: 'season-late',
        characterIds: ['alpha-token-match'],
        locationIds: ['location-b'],
        sourceIds: ['source-b'],
      }),
      makeEvent({
        id: 'event-ashen',
        slug: 'event-ashen',
        title: 'Ashen Arrival',
        timelineOrder: 10,
        seasonId: 'season-early',
        characterIds: [`character-${tokenId}`],
        locationIds: ['location-a', 'location-b'],
        sourceIds: ['source-a', 'source-b'],
      }),
      makeEvent({
        id: 'event-unmatched',
        slug: 'event-unmatched',
        title: 'Unmatched Event',
        timelineOrder: 1,
        characterIds: ['someone-else'],
        locationIds: ['location-a'],
        sourceIds: ['source-a'],
      }),
    ];

    mockBaseDatasetLoad(createLoreBaseDataset({
      source: 'database',
      events,
      characters,
      locations,
      seasons,
      sources,
      media: [],
    }));

    const lore = await getEffectiveTokenCharacterLore(tokenId);

    expect(lore).toBeDefined();
    expect(lore!.character.id).toBe('alpha-token-match');
    expect(lore!.matchedCharacterIds).toEqual([
      'alpha-token-match',
      'beta-token-match',
      `character-${tokenId}`,
    ]);
    expect(lore!.appearances.map((appearance) => appearance.id)).toEqual([
      'event-ashen',
      'event-zulu',
      'event-late',
    ]);
    expect(lore!.firstAppearance?.id).toBe('event-ashen');
    expect(lore!.locations.map((location) => location.id)).toEqual(['location-a', 'location-b']);
    expect(lore!.sources.map((source) => source.id)).toEqual(['source-a', 'source-b']);
    expect(lore!.sourceCount).toBe(2);
    expect(lore!.seasons.map((season) => season.id)).toEqual(['season-early', 'season-late']);
  });

  it('uses a matched firstAppearanceEventId before falling back to ordered appearances', async () => {
    const tokenId = 778;
    const character = makeCharacter({
      id: 'direct-first-appearance',
      slug: 'direct-first-appearance',
      name: 'Direct First Appearance',
      tokenId,
      firstAppearanceEventId: 'event-second',
    });
    const events = [
      makeEvent({
        id: 'event-first',
        slug: 'event-first',
        title: 'First Ordered Event',
        timelineOrder: 1,
        characterIds: [character.id],
      }),
      makeEvent({
        id: 'event-second',
        slug: 'event-second',
        title: 'Declared First Appearance',
        timelineOrder: 2,
        characterIds: [character.id],
      }),
    ];

    mockBaseDatasetLoad(createLoreBaseDataset({
      source: 'database',
      events,
      characters: [character],
      locations: [],
      seasons: [],
      sources: [],
      media: [],
    }));

    const lore = await getEffectiveTokenCharacterLore(tokenId);

    expect(lore?.appearances.map((appearance) => appearance.id)).toEqual(['event-first', 'event-second']);
    expect(lore?.firstAppearance?.id).toBe('event-second');
  });

  it('resolves token-only published submissions through synthesized character records', async () => {
    const tokenId = 8888;
    (loreSubmissionRepository.listPublishedForEffectiveLore as jest.Mock).mockResolvedValue([
      makeSubmissionDetail({
        id: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
        token_id: String(tokenId),
        title: 'Published Token Only Tale',
        summary: 'A token-only published tale.',
        body_markdown: 'Only the token id links this tale to a character.',
        published_slug: 'published-token-only-tale',
        character_ids: [],
        location_ids: ['location-ashen-road'],
      }, [
        {
          id: 'link-token-only',
          submission_id: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
          role: 'source',
          link_type: 'generic',
          original_url: 'https://example.com/token-only',
          normalized_url: 'https://example.com/token-only',
          display_title: 'Token only source',
          platform: 'Example',
          author: null,
          published_at: '2026-05-09T15:00:00.000Z',
          archived_url: null,
          attribution: 'Submitted source.',
          preservation_note: null,
          metadata: {},
          sort_order: 0,
          created_at: '2026-05-09T16:00:00.000Z',
          updated_at: '2026-05-09T16:00:00.000Z',
        },
      ]),
    ]);

    const lore = await getEffectiveTokenCharacterLore(tokenId);

    expect(lore?.character).toMatchObject({
      id: `character-${tokenId}`,
      slug: `character-${tokenId}`,
      name: `WAGDIE #${tokenId}`,
      tokenId,
      externalUrl: `/characters/${tokenId}`,
    });
    expect(lore?.matchedCharacterIds).toEqual([`character-${tokenId}`]);
    expect(lore?.appearances.map((appearance) => appearance.slug)).toEqual(['published-token-only-tale']);
    expect(lore?.locations.map((location) => location.id)).toEqual(['location-ashen-road']);
    expect(lore?.sources).toEqual([expect.objectContaining({
      title: 'Token only source',
      url: 'https://example.com/token-only',
    })]);
    expect(lore?.sourceCount).toBe(1);
  });

  it('ignores unpublished or non-public submissions when resolving token lore', async () => {
    const tokenId = 9999;
    (loreSubmissionRepository.listPublishedForEffectiveLore as jest.Mock).mockResolvedValue([
      makeSubmissionDetail({
        id: 'cccccccc-dddd-eeee-ffff-000000000000',
        token_id: String(tokenId),
        status: 'submitted',
        visibility: 'pending',
        published_slug: 'draft-token-tale',
        character_ids: [],
      }),
    ]);

    await expect(getEffectiveTokenCharacterLore(tokenId)).resolves.toBeUndefined();
  });

  it('reports DB base fallback diagnostics', async () => {
    mockBaseDatasetLoad(staticDataset, {
      activeSource: 'static',
      fallback: { used: true, reason: 'database unavailable' },
    });

    const diagnostics = await getEffectiveLoreDiagnostics();

    expect(diagnostics.generatedAt).toEqual(expect.any(String));
    expect(diagnostics.base).toMatchObject({
      configuredSource: 'auto',
      activeSource: 'static',
      fallback: { used: true, reason: 'database unavailable' },
      counts: {
        events: staticDataset.events.length,
        characters: staticDataset.characters.length,
      },
    });
  });

  it('reports override fetch failure diagnostics', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (loreCanonizationRepository.findAll as jest.Mock).mockRejectedValueOnce(new Error('override store down'));

    const diagnostics = await getEffectiveLoreDiagnostics();

    expect(diagnostics.overrides).toEqual({
      status: 'error',
      count: 0,
      error: 'override store down',
    });
    expect(diagnostics.submissions).toMatchObject({ status: 'ok', count: 0, adaptedCount: 0 });
    warnSpy.mockRestore();
  });

  it('reports submission fetch failure diagnostics', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (loreSubmissionRepository.listPublishedForEffectiveLore as jest.Mock).mockRejectedValueOnce(
      new Error('submission store down'),
    );

    const diagnostics = await getEffectiveLoreDiagnostics();

    expect(diagnostics.submissions).toEqual({
      status: 'error',
      count: 0,
      adaptedCount: 0,
      error: 'submission store down',
    });
    expect(diagnostics.overrides).toMatchObject({ status: 'ok', count: 0 });
    warnSpy.mockRestore();
  });

  it('reports published submission collision diagnostics', async () => {
    mockBaseDatasetLoad(dbDataset);
    (loreSubmissionRepository.listPublishedForEffectiveLore as jest.Mock).mockResolvedValue([
      makeSubmissionDetail({
        id: 'dddddddd-eeee-ffff-0000-111111111111',
        title: 'Collision',
        summary: 'A colliding community submission.',
        body_markdown: 'This should not replace base lore.',
        published_slug: dbOnlyEvent.slug,
        season_id: dbOnlyEvent.seasonId,
        character_ids: dbOnlyEvent.characterIds,
        location_ids: dbOnlyEvent.locationIds,
      }),
    ]);

    const diagnostics = await getEffectiveLoreDiagnostics();

    expect(diagnostics.submissions).toMatchObject({ status: 'ok', count: 1, adaptedCount: 1 });
    expect(diagnostics.collisions).toEqual({
      skippedCount: 1,
      skipped: [{
        id: 'lore-submission:dddddddd-eeee-ffff-0000-111111111111',
        slug: dbOnlyEvent.slug,
        reason: 'base-event-slug',
      }],
    });
  });
});
