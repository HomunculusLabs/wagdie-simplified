import * as React from 'react';
import {
  getActiveLoreBaseDatasetWithDiagnostics,
  type LoreBaseQueryDiagnostics,
} from './base-query';
import {
  createLoreBaseDataset,
  sortLoreCharacters,
  sortLoreEvents,
  sortLoreLocations,
  sortLoreSeasons,
  type LoreBaseDataset,
} from './base-dataset';
import { adaptLoreSubmissionToEffectiveLore, type AdaptedLoreSubmission } from './submissions/adapter';
import { loreCanonizationRepository } from '@/lib/repositories/lore-canonization-repository';
import { loreSubmissionRepository } from '@/lib/repositories/lore-submission-repository';
import type {
  LoreCanonizationOverride,
  LoreCanonizationOverrideSet,
} from './canonization-overrides';
import type {
  EffectiveTokenAppearanceSummary,
  EffectiveTokenCharacterLore,
  EffectiveTokenCharacterSummary,
  EffectiveTokenLocationSummary,
  EffectiveTokenSeasonSummary,
  EffectiveTokenSourceSummary,
  LoreArchiveFilters,
  LoreCharacter,
  LoreCharacterConnection,
  LoreEvent,
  LoreLocation,
  LoreMedia,
  LoreResolvedEntity,
  LoreSeason,
  SourceRecord,
} from './types';

export const applyPublishedCanonizationOverrides = (
  events: LoreEvent[],
  overrideSets: LoreCanonizationOverrideSet[],
): LoreEvent[] => {
  const publishedEntries: Array<[string, LoreCanonizationOverride]> = overrideSets.flatMap((overrideSet) => (
    overrideSet.publishedOverride
      ? [[overrideSet.eventId, overrideSet.publishedOverride] as [string, LoreCanonizationOverride]]
      : []
  ));
  const publishedByEventId = new Map(publishedEntries);

  return events.map((event) => {
    const publishedOverride = publishedByEventId.get(event.id);
    return publishedOverride ? { ...event, canon: publishedOverride.canon } : event;
  });
};

export type EffectiveLoreFetchStatus = 'ok' | 'error';

export interface EffectiveLoreFetchDiagnostics {
  status: EffectiveLoreFetchStatus;
  count: number;
  error?: string;
}

export interface EffectiveLoreSubmissionFetchDiagnostics extends EffectiveLoreFetchDiagnostics {
  adaptedCount: number;
}

export type EffectiveLoreCollisionReason =
  | 'base-event-id'
  | 'base-event-slug'
  | 'effective-submission-id'
  | 'effective-submission-slug';

export interface EffectiveLoreCollisionDiagnostic {
  id: string;
  slug: string;
  reason: EffectiveLoreCollisionReason;
}

export interface EffectiveLoreDiagnostics {
  generatedAt: string;
  base: LoreBaseQueryDiagnostics & {
    counts: {
      events: number;
      characters: number;
      locations: number;
      seasons: number;
      sources: number;
      media: number;
    };
  };
  overrides: EffectiveLoreFetchDiagnostics;
  submissions: EffectiveLoreSubmissionFetchDiagnostics;
  collisions: {
    skippedCount: number;
    skipped: EffectiveLoreCollisionDiagnostic[];
  };
  cache: {
    reactCacheAvailable: boolean;
    publicHelpersBypassCacheInTests: boolean;
    note: string;
  };
}

let hasWarnedAboutOverrideFallback = false;
let hasWarnedAboutSubmissionFallback = false;
let hasWarnedAboutSubmissionCollision = false;

const summarizeQueryError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message.slice(0, 240);
  }

  return String(error).slice(0, 240);
};

const fetchPublishedOverrideSetsWithDiagnostics = async (): Promise<{
  overrideSets: LoreCanonizationOverrideSet[];
  diagnostics: EffectiveLoreFetchDiagnostics;
}> => {
  try {
    const overrideSets = await loreCanonizationRepository.findAll();
    return {
      overrideSets,
      diagnostics: { status: 'ok', count: overrideSets.length },
    };
  } catch (error) {
    const summarizedError = summarizeQueryError(error);
    if (!hasWarnedAboutOverrideFallback) {
      hasWarnedAboutOverrideFallback = true;
      console.warn(
        `Falling back to static lore canonization; published overrides unavailable: ${summarizedError}`,
      );
    }

    return {
      overrideSets: [],
      diagnostics: { status: 'error', count: 0, error: summarizedError },
    };
  }
};

const fetchPublishedSubmissionLoreWithDiagnostics = async (): Promise<{
  submissionLore: AdaptedLoreSubmission[];
  diagnostics: EffectiveLoreSubmissionFetchDiagnostics;
}> => {
  try {
    const details = await loreSubmissionRepository.listPublishedForEffectiveLore();
    const submissionLore = details.flatMap((detail) => {
      const adapted = adaptLoreSubmissionToEffectiveLore(detail);
      return adapted ? [adapted] : [];
    });
    return {
      submissionLore,
      diagnostics: {
        status: 'ok',
        count: details.length,
        adaptedCount: submissionLore.length,
      },
    };
  } catch (error) {
    const summarizedError = summarizeQueryError(error);
    if (!hasWarnedAboutSubmissionFallback) {
      hasWarnedAboutSubmissionFallback = true;
      console.warn(
        `Falling back to static lore events; published submissions unavailable: ${summarizedError}`,
      );
    }

    return {
      submissionLore: [],
      diagnostics: {
        status: 'error',
        count: 0,
        adaptedCount: 0,
        error: summarizedError,
      },
    };
  }
};

interface EffectiveLoreContext {
  baseDataset: LoreBaseDataset;
  events: LoreEvent[];
  eventsById: Map<string, LoreEvent>;
  eventsBySlug: Map<string, LoreEvent>;
  sourcesById: Map<string, SourceRecord>;
  mediaById: Map<string, LoreMedia>;
}

const warnSubmissionCollisionOnce = (message: string): void => {
  if (hasWarnedAboutSubmissionCollision) return;
  hasWarnedAboutSubmissionCollision = true;
  console.warn(message);
};

const filterCollidingSubmissionLore = (
  baseDataset: LoreBaseDataset,
  submissionLore: AdaptedLoreSubmission[],
): {
  accepted: AdaptedLoreSubmission[];
  skipped: EffectiveLoreCollisionDiagnostic[];
} => {
  const eventIds = new Set(baseDataset.events.map((event) => event.id));
  const eventSlugs = new Set(baseDataset.events.map((event) => event.slug));
  const acceptedIds = new Set<string>();
  const acceptedSlugs = new Set<string>();
  const skipped: EffectiveLoreCollisionDiagnostic[] = [];

  const accepted = submissionLore.filter((record) => {
    const { id, slug } = record.event;
    let reason: EffectiveLoreCollisionReason | undefined;

    if (eventIds.has(id)) {
      reason = 'base-event-id';
    } else if (eventSlugs.has(slug)) {
      reason = 'base-event-slug';
    } else if (acceptedIds.has(id)) {
      reason = 'effective-submission-id';
    } else if (acceptedSlugs.has(slug)) {
      reason = 'effective-submission-slug';
    }

    if (reason) {
      skipped.push({ id, slug, reason });
      return false;
    }

    acceptedIds.add(id);
    acceptedSlugs.add(slug);
    return true;
  });

  if (skipped.length > 0) {
    warnSubmissionCollisionOnce(
      `Skipping published lore submissions with base/effective lore id or slug collisions: ${skipped.map((record) => `${record.id} (${record.slug})`).join(', ')}`,
    );
  }

  return { accepted, skipped };
};

const buildSubmissionTokenCharacters = (
  baseDataset: LoreBaseDataset,
  submissionLore: AdaptedLoreSubmission[],
): LoreCharacter[] => {
  const existingCharacterIds = new Set(baseDataset.characters.map((character) => character.id));
  const existingCharacterSlugs = new Set(baseDataset.characters.map((character) => character.slug));
  const created = new Set<string>();

  return submissionLore.flatMap((record) => (
    record.event.characterIds.flatMap((characterId) => {
      const match = /^character-([1-9]\d*)$/.exec(characterId);
      if (!match || existingCharacterIds.has(characterId) || created.has(characterId)) return [];

      const tokenId = Number(match[1]);
      const slug = existingCharacterSlugs.has(characterId) ? `${characterId}-token` : characterId;
      created.add(characterId);

      return [{
        id: characterId,
        slug,
        name: `WAGDIE #${tokenId}`,
        aliases: [`Token #${tokenId}`],
        summary: `Community lore record for WAGDIE #${tokenId}.`,
        tokenId,
        imageUrl: `/images/characters/${tokenId}.png`,
        externalUrl: `/characters/${tokenId}`,
        tags: ['community-submission', `token-${tokenId}`],
      } satisfies LoreCharacter];
    })
  ));
};

const augmentBaseDatasetWithSubmissionCharacters = (
  baseDataset: LoreBaseDataset,
  submissionLore: AdaptedLoreSubmission[],
): LoreBaseDataset => {
  const submissionCharacters = buildSubmissionTokenCharacters(baseDataset, submissionLore);
  if (submissionCharacters.length === 0) return baseDataset;

  return createLoreBaseDataset({
    source: baseDataset.source,
    events: baseDataset.events,
    characters: [...baseDataset.characters, ...submissionCharacters],
    locations: baseDataset.locations,
    seasons: baseDataset.seasons,
    sources: baseDataset.sources,
    media: baseDataset.media,
  });
};

interface EffectiveLoreBuildSnapshot {
  context: EffectiveLoreContext;
  diagnostics: EffectiveLoreDiagnostics;
}

const countBaseDatasetRecords = (baseDataset: LoreBaseDataset): EffectiveLoreDiagnostics['base']['counts'] => ({
  events: baseDataset.events.length,
  characters: baseDataset.characters.length,
  locations: baseDataset.locations.length,
  seasons: baseDataset.seasons.length,
  sources: baseDataset.sources.length,
  media: baseDataset.media.length,
});

const buildEffectiveLoreSnapshotUncached = async (): Promise<EffectiveLoreBuildSnapshot> => {
  const [baseResult, overrideResult, submissionResult] = await Promise.all([
    getActiveLoreBaseDatasetWithDiagnostics(),
    fetchPublishedOverrideSetsWithDiagnostics(),
    fetchPublishedSubmissionLoreWithDiagnostics(),
  ]);
  const { dataset: baseDataset, diagnostics: baseDiagnostics } = baseResult;
  const { overrideSets, diagnostics: overrideDiagnostics } = overrideResult;
  const { submissionLore, diagnostics: submissionDiagnostics } = submissionResult;
  const { accepted: acceptedSubmissionLore, skipped } = filterCollidingSubmissionLore(baseDataset, submissionLore);
  const effectiveBaseDataset = augmentBaseDatasetWithSubmissionCharacters(baseDataset, acceptedSubmissionLore);
  const baseEvents = applyPublishedCanonizationOverrides([...effectiveBaseDataset.events], overrideSets);
  const events = [
    ...baseEvents,
    ...acceptedSubmissionLore.map((record) => record.event),
  ].sort(sortLoreEvents);

  const sourcesById = new Map<string, SourceRecord>(effectiveBaseDataset.sources.map((source) => [source.id, source]));
  const mediaById = new Map<string, LoreMedia>(effectiveBaseDataset.media.map((media) => [media.id, media]));

  acceptedSubmissionLore.forEach((record) => {
    record.sources.forEach((source) => {
      if (!sourcesById.has(source.id)) {
        sourcesById.set(source.id, source);
      }
    });

    record.media.forEach((media) => {
      if (!mediaById.has(media.id)) {
        mediaById.set(media.id, media);
      }
    });
  });

  return {
    context: {
      baseDataset: effectiveBaseDataset,
      events,
      eventsById: new Map(events.map((event) => [event.id, event])),
      eventsBySlug: new Map(events.map((event) => [event.slug, event])),
      sourcesById,
      mediaById,
    },
    diagnostics: {
      generatedAt: new Date().toISOString(),
      base: {
        ...baseDiagnostics,
        counts: countBaseDatasetRecords(baseDataset),
      },
      overrides: overrideDiagnostics,
      submissions: submissionDiagnostics,
      collisions: {
        skippedCount: skipped.length,
        skipped,
      },
      cache: {
        reactCacheAvailable: Boolean(reactCache),
        publicHelpersBypassCacheInTests: process.env.NODE_ENV === 'test',
        note: 'Public helpers use React.cache when available outside tests; this diagnostics path rebuilds uncached state for operator freshness checks.',
      },
    },
  };
};

const buildEffectiveLoreContextUncached = async (): Promise<EffectiveLoreContext> => {
  return (await buildEffectiveLoreSnapshotUncached()).context;
};

const reactCache = (React as typeof React & {
  cache?: <T extends (...args: never[]) => unknown>(fn: T) => T;
}).cache;
const getCachedEffectiveLoreContext = reactCache
  ? reactCache(buildEffectiveLoreContextUncached)
  : buildEffectiveLoreContextUncached;

const buildEffectiveLoreContext = async (): Promise<EffectiveLoreContext> => {
  return process.env.NODE_ENV === 'test'
    ? buildEffectiveLoreContextUncached()
    : getCachedEffectiveLoreContext();
};

export const getEffectiveLoreDiagnostics = async (): Promise<EffectiveLoreDiagnostics> => {
  return (await buildEffectiveLoreSnapshotUncached()).diagnostics;
};

const matchesIdOrSlug = (
  ids: string[],
  filterValue: string,
  recordsById: ReadonlyMap<string, { slug: string }>,
): boolean => {
  return ids.some((id) => id === filterValue || recordsById.get(id)?.slug === filterValue);
};

const includesToken = (value: string | undefined, token: string): boolean => {
  return value?.toLocaleLowerCase().includes(token) ?? false;
};

const eventMatchesEffectiveArchiveFilters = (
  event: LoreEvent,
  context: EffectiveLoreContext,
  filters: LoreArchiveFilters = {},
): boolean => {
  const { baseDataset } = context;

  if (filters.season) {
    const seasonMatches = event.seasonId
      ? matchesIdOrSlug([event.seasonId], filters.season, baseDataset.indexes.seasonsById)
      : false;

    if (!seasonMatches) return false;
  }

  if (filters.location && !matchesIdOrSlug(event.locationIds, filters.location, baseDataset.indexes.locationsById)) {
    return false;
  }

  if (filters.character && !matchesIdOrSlug(event.characterIds, filters.character, baseDataset.indexes.charactersById)) {
    return false;
  }

  if (filters.canonStatus && event.canon.status !== filters.canonStatus) {
    return false;
  }

  if (filters.canonStage && event.canon.stageId !== filters.canonStage) {
    return false;
  }

  if (filters.keyword) {
    const token = filters.keyword.toLocaleLowerCase();
    const characters = event.characterIds.flatMap((characterId) => {
      const character = baseDataset.indexes.charactersById.get(characterId);
      return character ? [character] : [];
    });
    const locations = event.locationIds.flatMap((locationId) => {
      const location = baseDataset.indexes.locationsById.get(locationId);
      return location ? [location] : [];
    });

    const matchesKeyword = [
      event.title,
      event.summary,
      event.body,
      event.canon.stageId,
      ...event.tags,
      ...event.keywords,
      ...event.canon.path.flatMap((step) => [step.label, step.stageId, step.note]),
      ...characters.flatMap((character) => [character.name, ...character.aliases, character.summary]),
      ...locations.flatMap((location) => [location.name, location.summary, ...location.tags]),
    ].some((value) => includesToken(value, token));

    if (!matchesKeyword) return false;
  }

  return true;
};

export const getAllEffectiveLoreEvents = async (): Promise<LoreEvent[]> => {
  return [...(await buildEffectiveLoreContext()).events].sort(sortLoreEvents);
};

export const getEffectiveOfficialEvents = async (): Promise<LoreEvent[]> => {
  return (await getAllEffectiveLoreEvents()).filter((event) => event.kind === 'official');
};

export const getEffectiveCommunityEvents = async (): Promise<LoreEvent[]> => {
  return (await getAllEffectiveLoreEvents()).filter((event) => event.kind === 'community');
};

export const getEffectiveLoreEventBySlug = async (slug: string): Promise<LoreEvent | undefined> => {
  return (await buildEffectiveLoreContext()).eventsBySlug.get(slug);
};

export const getEffectiveOfficialEventBySlug = async (slug: string): Promise<LoreEvent | undefined> => {
  const event = await getEffectiveLoreEventBySlug(slug);
  return event?.kind === 'official' ? event : undefined;
};

export const getEffectiveCommunityEventBySlug = async (slug: string): Promise<LoreEvent | undefined> => {
  const event = await getEffectiveLoreEventBySlug(slug);
  return event?.kind === 'community' ? event : undefined;
};

export const getEffectiveArchiveItems = async (
  filters: LoreArchiveFilters = {},
): Promise<LoreEvent[]> => {
  const context = await buildEffectiveLoreContext();
  return context.events.filter((event) => eventMatchesEffectiveArchiveFilters(event, context, filters));
};

export const getEffectiveEventsForCharacter = async (characterId: string): Promise<LoreEvent[]> => {
  return (await getAllEffectiveLoreEvents()).filter((event) => event.characterIds.includes(characterId));
};

export const getEffectiveEventsForLocation = async (locationId: string): Promise<LoreEvent[]> => {
  return (await getAllEffectiveLoreEvents()).filter((event) => event.locationIds.includes(locationId));
};

const resolveSourcesForEvent = (
  event: LoreEvent,
  context: EffectiveLoreContext,
): SourceRecord[] => {
  return event.sourceIds.flatMap((sourceId) => {
    const source = context.sourcesById.get(sourceId);
    return source ? [source] : [];
  });
};

const summarizeEffectiveTokenCharacter = (
  character: LoreCharacter,
): EffectiveTokenCharacterSummary => ({
  id: character.id,
  slug: character.slug,
  name: character.name,
  aliases: [...character.aliases],
  summary: character.summary,
  tokenId: character.tokenId,
  imageUrl: character.imageUrl,
  externalUrl: character.externalUrl,
  origin: character.origin,
  characterClass: character.characterClass,
  alignment: character.alignment,
  level: character.level,
  tags: [...character.tags],
});

const summarizeEffectiveTokenAppearance = (
  event: LoreEvent,
  context: EffectiveLoreContext,
): EffectiveTokenAppearanceSummary => ({
  id: event.id,
  slug: event.slug,
  kind: event.kind,
  title: event.title,
  summary: event.summary,
  seasonId: event.seasonId,
  locationIds: [...event.locationIds],
  characterIds: [...event.characterIds],
  occurredAt: event.occurredAt,
  publishedAt: event.publishedAt,
  timelineOrder: event.timelineOrder,
  canon: {
    ...event.canon,
    path: event.canon.path.map((step) => ({
      ...step,
      sourceIds: step.sourceIds ? [...step.sourceIds] : undefined,
    })),
  },
  sourceIds: [...event.sourceIds],
  sourceCount: resolveSourcesForEvent(event, context).length,
  tags: [...event.tags],
});

const summarizeEffectiveTokenLocation = (
  location: LoreLocation,
): EffectiveTokenLocationSummary => ({
  id: location.id,
  slug: location.slug,
  name: location.name,
  summary: location.summary,
  imageId: location.imageId,
  tags: [...location.tags],
});

const summarizeEffectiveTokenSeason = (
  season: LoreSeason,
): EffectiveTokenSeasonSummary => ({
  id: season.id,
  slug: season.slug,
  title: season.title,
  summary: season.summary,
  order: season.order,
});

const summarizeEffectiveTokenSource = (
  source: SourceRecord,
): EffectiveTokenSourceSummary => ({
  id: source.id,
  kind: source.kind,
  title: source.title,
  url: source.url,
  archivedUrl: source.archivedUrl,
  author: source.author,
  platform: source.platform,
  publishedAt: source.publishedAt,
  capturedAt: source.capturedAt,
  attribution: source.attribution,
  preservationNote: source.preservationNote,
});

const compareEffectiveTokenCharacterMatches = (
  tokenId: number,
  syntheticCharacterId: string,
) => (a: LoreCharacter, b: LoreCharacter): number => {
  const rank = (character: LoreCharacter): number => {
    if (character.tokenId === tokenId && character.id !== syntheticCharacterId) return 0;
    if (character.id === syntheticCharacterId) return 1;
    return 2;
  };

  return rank(a) - rank(b) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
};

export const getEffectiveTokenCharacterLore = async (
  tokenId: number,
): Promise<EffectiveTokenCharacterLore | undefined> => {
  if (!Number.isSafeInteger(tokenId) || tokenId <= 0) return undefined;

  const context = await buildEffectiveLoreContext();
  const syntheticCharacterId = `character-${tokenId}`;
  const matchedCharacters = context.baseDataset.characters
    .filter((character) => character.tokenId === tokenId || character.id === syntheticCharacterId)
    .sort(compareEffectiveTokenCharacterMatches(tokenId, syntheticCharacterId));

  if (matchedCharacters.length === 0) return undefined;

  const primaryCharacter = matchedCharacters[0];
  const matchedCharacterIds = matchedCharacters.map((character) => character.id);
  const matchedCharacterIdSet = new Set(matchedCharacterIds);
  const appearances = context.events
    .filter((event) => event.characterIds.some((characterId) => matchedCharacterIdSet.has(characterId)))
    .sort(sortLoreEvents);
  const appearanceSummaries = appearances.map((event) => summarizeEffectiveTokenAppearance(event, context));
  const firstAppearance = primaryCharacter.firstAppearanceEventId
    ? appearanceSummaries.find((appearance) => appearance.id === primaryCharacter.firstAppearanceEventId)
    : undefined;

  const locationsByFirstSeen = new Map<string, LoreLocation>();
  const sourceByFirstSeen = new Map<string, SourceRecord>();
  const seasonIds = new Set<string>();

  appearances.forEach((event) => {
    if (event.seasonId) {
      seasonIds.add(event.seasonId);
    }

    event.locationIds.forEach((locationId) => {
      const location = context.baseDataset.indexes.locationsById.get(locationId);
      if (location && !locationsByFirstSeen.has(location.id)) {
        locationsByFirstSeen.set(location.id, location);
      }
    });

    resolveSourcesForEvent(event, context).forEach((source) => {
      if (!sourceByFirstSeen.has(source.id)) {
        sourceByFirstSeen.set(source.id, source);
      }
    });
  });

  const seasons = [...seasonIds]
    .flatMap((seasonId) => {
      const season = context.baseDataset.indexes.seasonsById.get(seasonId);
      return season ? [season] : [];
    })
    .sort(sortLoreSeasons)
    .map(summarizeEffectiveTokenSeason);
  const sources = [...sourceByFirstSeen.values()].map(summarizeEffectiveTokenSource);

  return {
    character: summarizeEffectiveTokenCharacter(primaryCharacter),
    matchedCharacterIds,
    appearances: appearanceSummaries,
    firstAppearance: firstAppearance ?? appearanceSummaries[0],
    locations: [...locationsByFirstSeen.values()].map(summarizeEffectiveTokenLocation),
    seasons,
    sources,
    sourceCount: sources.length,
  };
};

export const getEffectiveSourcesForEvent = async (event: LoreEvent): Promise<SourceRecord[]> => {
  return resolveSourcesForEvent(event, await buildEffectiveLoreContext());
};

export const getEffectiveSourcesByEventId = async (
  events: LoreEvent[],
): Promise<Record<string, SourceRecord[]>> => {
  const context = await buildEffectiveLoreContext();

  return Object.fromEntries(events.map((event) => [event.id, resolveSourcesForEvent(event, context)]));
};

export const getEffectiveMediaById = async (mediaId: string): Promise<LoreMedia | undefined> => {
  return (await buildEffectiveLoreContext()).mediaById.get(mediaId);
};

export const getEffectiveMediaForEvent = async (event: LoreEvent): Promise<LoreMedia[]> => {
  const context = await buildEffectiveLoreContext();
  const sources = resolveSourcesForEvent(event, context);
  const sourceMediaIds = sources.flatMap((source) => source.mediaIds ?? []);
  const mediaIds = [...new Set([...(event.mediaIds ?? []), ...sourceMediaIds])];

  return mediaIds.flatMap((mediaId) => {
    const media = context.mediaById.get(mediaId);
    return media ? [media] : [];
  });
};

export const getEffectiveCharacterConnections = async (
  characterId: string,
): Promise<LoreCharacterConnection[]> => {
  const context = await buildEffectiveLoreContext();
  const appearances = context.events.filter((event) => event.characterIds.includes(characterId));
  const sharedEventIdsByCharacter = new Map<string, Set<string>>();

  appearances.forEach((event) => {
    event.characterIds.forEach((coCharacterId) => {
      if (coCharacterId === characterId) return;

      const sharedEventIds = sharedEventIdsByCharacter.get(coCharacterId) ?? new Set<string>();
      sharedEventIds.add(event.id);
      sharedEventIdsByCharacter.set(coCharacterId, sharedEventIds);
    });
  });

  return [...sharedEventIdsByCharacter.entries()]
    .map(([coCharacterId, sharedEventIds]) => {
      const character = context.baseDataset.indexes.charactersById.get(coCharacterId);
      if (!character) return undefined;

      return {
        character,
        sharedEvents: appearances.filter((event) => sharedEventIds.has(event.id)),
      } satisfies LoreCharacterConnection;
    })
    .filter((connection): connection is LoreCharacterConnection => Boolean(connection))
    .sort((a, b) => (
      b.sharedEvents.length - a.sharedEvents.length || a.character.name.localeCompare(b.character.name)
    ));
};

export const getEffectiveCharacterBySlug = async (slug: string): Promise<LoreCharacter | undefined> => {
  return (await buildEffectiveLoreContext()).baseDataset.indexes.charactersBySlug.get(slug);
};

export const getEffectiveLocationBySlug = async (slug: string): Promise<LoreLocation | undefined> => {
  return (await buildEffectiveLoreContext()).baseDataset.indexes.locationsBySlug.get(slug);
};

export const getAllEffectiveLoreCharacters = async (): Promise<LoreCharacter[]> => {
  return [...(await buildEffectiveLoreContext()).baseDataset.characters].sort(sortLoreCharacters);
};

export const getAllEffectiveLoreLocations = async (): Promise<LoreLocation[]> => {
  return [...(await buildEffectiveLoreContext()).baseDataset.locations].sort(sortLoreLocations);
};

export const getAllEffectiveLoreSeasons = async (): Promise<LoreSeason[]> => {
  return [...(await buildEffectiveLoreContext()).baseDataset.seasons].sort(sortLoreSeasons);
};

export const getEffectiveRelatedEntitiesForEvent = async (
  event: LoreEvent,
): Promise<LoreResolvedEntity[]> => {
  const context = await buildEffectiveLoreContext();

  return event.entityRefs.map((entityRef) => {
    if (entityRef.kind === 'character') {
      const character = context.baseDataset.indexes.charactersById.get(entityRef.id);
      return {
        ...entityRef,
        name: character?.name ?? entityRef.label ?? entityRef.id,
        slug: character?.slug,
        summary: character?.summary,
      };
    }

    if (entityRef.kind === 'location') {
      const location = context.baseDataset.indexes.locationsById.get(entityRef.id);
      return {
        ...entityRef,
        name: location?.name ?? entityRef.label ?? entityRef.id,
        slug: location?.slug,
        summary: location?.summary,
      };
    }

    if (entityRef.kind === 'event') {
      const relatedEvent = context.eventsById.get(entityRef.id);
      return {
        ...entityRef,
        name: relatedEvent?.title ?? entityRef.label ?? entityRef.id,
        slug: relatedEvent?.slug,
        summary: relatedEvent?.summary,
      };
    }

    return {
      ...entityRef,
      name: entityRef.label ?? entityRef.id,
    };
  });
};

export const getEffectiveSourcesForLocation = async (location: LoreLocation): Promise<SourceRecord[]> => {
  const context = await buildEffectiveLoreContext();
  return (location.sourceIds ?? []).flatMap((sourceId) => {
    const source = context.sourcesById.get(sourceId);
    return source ? [source] : [];
  });
};

export const getEffectiveMediaForLocation = async (location: LoreLocation): Promise<LoreMedia[]> => {
  const context = await buildEffectiveLoreContext();
  const sources = (location.sourceIds ?? []).flatMap((sourceId) => {
    const source = context.sourcesById.get(sourceId);
    return source ? [source] : [];
  });
  const mediaIds = [...new Set([
    ...(location.imageId ? [location.imageId] : []),
    ...sources.flatMap((source) => source.mediaIds ?? []),
  ])];

  return mediaIds.flatMap((mediaId) => {
    const media = context.mediaById.get(mediaId);
    return media ? [media] : [];
  });
};
