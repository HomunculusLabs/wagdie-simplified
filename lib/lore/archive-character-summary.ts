import type { LoreCharacter, LoreEvent } from './types';

export const LORE_CHARACTER_ARCHIVE_PAGE_SIZE = 24;

export type LoreCharacterCompactAppearance = Pick<
  LoreEvent,
  'id' | 'slug' | 'kind' | 'title' | 'summary' | 'occurredAt' | 'publishedAt' | 'timelineOrder' | 'canon'
>;

export interface LoreCharacterArchiveItem {
  character: LoreCharacter;
  appearanceCount: number;
  officialAppearanceCount: number;
  communityAppearanceCount: number;
  firstAppearance?: LoreCharacterCompactAppearance;
  latestAppearance?: LoreCharacterCompactAppearance;
}

export const describeLoreCharacterAppearances = (
  officialCount: number,
  communityCount: number,
): string => {
  const total = officialCount + communityCount;
  if (total === 0) return 'No recorded appearances';
  if (officialCount > 0 && communityCount > 0) {
    return `${total} mixed official and community appearances`;
  }

  const provenance = officialCount > 0 ? 'official' : 'community';
  return `${total} ${provenance} ${total === 1 ? 'appearance' : 'appearances'}`;
};

export interface LoreCharacterArchivePage {
  items: LoreCharacterArchiveItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface BuildLoreCharacterArchiveOptions {
  characters: LoreCharacter[];
  allEvents: LoreEvent[];
  matchingEvents: LoreEvent[];
  filtered: boolean;
  page?: number;
  pageSize?: number;
  sort?: 'date' | 'title';
}

interface AppearanceIndexEntry {
  appearanceCount: number;
  officialAppearanceCount: number;
  communityAppearanceCount: number;
  firstAppearance?: LoreCharacterCompactAppearance;
  latestAppearance?: LoreCharacterCompactAppearance;
}

const compactAppearance = (event: LoreEvent): LoreCharacterCompactAppearance => ({
  id: event.id,
  slug: event.slug,
  kind: event.kind,
  title: event.title,
  summary: event.summary,
  occurredAt: event.occurredAt,
  publishedAt: event.publishedAt,
  timelineOrder: event.timelineOrder,
  canon: event.canon,
});

const compareAppearances = (
  left: LoreCharacterCompactAppearance,
  right: LoreCharacterCompactAppearance,
): number => (
  left.timelineOrder - right.timelineOrder ||
  left.title.localeCompare(right.title) ||
  left.id.localeCompare(right.id)
);

const compareArchiveItems = (
  left: LoreCharacterArchiveItem,
  right: LoreCharacterArchiveItem,
): number => {
  const nameOrder = left.character.name.localeCompare(right.character.name);
  if (nameOrder !== 0) return nameOrder;

  const leftTokenId = left.character.tokenId ?? Number.POSITIVE_INFINITY;
  const rightTokenId = right.character.tokenId ?? Number.POSITIVE_INFINITY;
  return leftTokenId - rightTokenId || left.character.id.localeCompare(right.character.id);
};

/**
 * Builds the Archive character presentation in one event/appearance pass. Counts always
 * come from the complete effective event set; matching events only choose filtered cards.
 */
export const buildLoreCharacterArchive = ({
  characters,
  allEvents,
  matchingEvents,
  filtered,
  page = 1,
  pageSize = LORE_CHARACTER_ARCHIVE_PAGE_SIZE,
  sort = 'date',
}: BuildLoreCharacterArchiveOptions): LoreCharacterArchivePage => {
  const appearanceIndex = new Map<string, AppearanceIndexEntry>();

  allEvents.forEach((event) => {
    const appearance = compactAppearance(event);
    new Set(event.characterIds).forEach((characterId) => {
      const current = appearanceIndex.get(characterId) ?? {
        appearanceCount: 0,
        officialAppearanceCount: 0,
        communityAppearanceCount: 0,
      };

      current.appearanceCount += 1;
      if (event.kind === 'official') {
        current.officialAppearanceCount += 1;
      } else {
        current.communityAppearanceCount += 1;
      }

      if (!current.firstAppearance || compareAppearances(appearance, current.firstAppearance) < 0) {
        current.firstAppearance = appearance;
      }
      if (!current.latestAppearance || compareAppearances(appearance, current.latestAppearance) > 0) {
        current.latestAppearance = appearance;
      }
      appearanceIndex.set(characterId, current);
    });
  });

  const matchingCharacterIds = filtered
    ? new Set(matchingEvents.flatMap((event) => event.characterIds))
    : undefined;

  const allItems = characters
    .filter((character) => !matchingCharacterIds || matchingCharacterIds.has(character.id))
    .map((character): LoreCharacterArchiveItem => {
      const appearances = appearanceIndex.get(character.id);
      return {
        character,
        appearanceCount: appearances?.appearanceCount ?? 0,
        officialAppearanceCount: appearances?.officialAppearanceCount ?? 0,
        communityAppearanceCount: appearances?.communityAppearanceCount ?? 0,
        firstAppearance: appearances?.firstAppearance,
        latestAppearance: appearances?.latestAppearance,
      };
    })
    .sort((left, right) => {
      if (sort === 'title') return compareArchiveItems(left, right);
      const rightOrder = right.latestAppearance?.timelineOrder ?? Number.NEGATIVE_INFINITY;
      const leftOrder = left.latestAppearance?.timelineOrder ?? Number.NEGATIVE_INFINITY;
      return rightOrder - leftOrder || compareArchiveItems(left, right);
    });

  const safePageSize = Number.isSafeInteger(pageSize) && pageSize > 0
    ? pageSize
    : LORE_CHARACTER_ARCHIVE_PAGE_SIZE;
  const totalItems = allItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const requestedPage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const clampedPage = totalItems === 0 ? 1 : Math.min(requestedPage, totalPages);
  const start = (clampedPage - 1) * safePageSize;

  return {
    items: allItems.slice(start, start + safePageSize),
    page: clampedPage,
    pageSize: safePageSize,
    totalItems,
    totalPages,
  };
};
