import { buildLoreCharacterArchive } from '@/lib/lore/archive-character-summary';
import type { LoreCharacter, LoreEvent } from '@/lib/lore/types';

const canon = {
  status: 'canon' as const,
  stageId: 'canonized' as const,
  path: [],
};

const character = (
  id: string,
  name: string,
  tokenId?: number,
): LoreCharacter => ({
  id,
  slug: id,
  name,
  aliases: [],
  summary: `${name} summary`,
  tokenId,
  tags: [],
});

const event = (
  id: string,
  kind: LoreEvent['kind'],
  characterIds: string[],
  timelineOrder: number,
): LoreEvent => ({
  id,
  slug: id,
  kind,
  title: `Event ${id}`,
  summary: `${id} summary`,
  body: `${id} body`,
  locationIds: [],
  characterIds,
  entityRefs: [],
  timelineOrder,
  canon: kind === 'official' ? canon : {
    status: 'community',
    stageId: 'community_recorded',
    path: [],
  },
  sourceIds: [],
  tags: [],
  keywords: [],
});

describe('buildLoreCharacterArchive', () => {
  const characters = [
    character('alpha-9', 'Alpha', 9),
    character('alpha-2', 'Alpha', 2),
    character('alpha-z', 'Alpha'),
    character('alpha-a', 'Alpha'),
    character('beta', 'Beta'),
    character('zero', 'Zero'),
  ];
  const events = [
    event('late-community', 'community', ['alpha-2'], 30),
    event('first-official', 'official', ['alpha-2', 'beta'], 10),
    event('middle-official', 'official', ['alpha-2'], 20),
  ];

  it('includes zero-appearance characters without filters and sorts by name, token, then id', () => {
    const result = buildLoreCharacterArchive({
      characters,
      allEvents: events,
      matchingEvents: events,
      filtered: false,
    });

    expect(result.items.map((item) => item.character.id)).toEqual([
      'alpha-2',
      'alpha-9',
      'alpha-a',
      'alpha-z',
      'beta',
      'zero',
    ]);
    expect(result.items.find((item) => item.character.id === 'beta')).toMatchObject({
      officialAppearanceCount: 1,
      communityAppearanceCount: 0,
    });
    expect(result.items.find((item) => item.character.id === 'zero')).toMatchObject({
      appearanceCount: 0,
      officialAppearanceCount: 0,
      communityAppearanceCount: 0,
    });
  });

  it('selects filtered character IDs but retains counts from all appearances', () => {
    const result = buildLoreCharacterArchive({
      characters,
      allEvents: events,
      matchingEvents: [events[0]],
      filtered: true,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      character: { id: 'alpha-2' },
      appearanceCount: 3,
      officialAppearanceCount: 2,
      communityAppearanceCount: 1,
      firstAppearance: { id: 'first-official' },
      latestAppearance: { id: 'late-community' },
    });
  });

  it('paginates after sorting and clamps excessive or empty pages', () => {
    const manyCharacters = Array.from({ length: 26 }, (_, index) => (
      character(`character-${String(index).padStart(2, '0')}`, `Character ${String(index).padStart(2, '0')}`)
    ));
    const page = buildLoreCharacterArchive({
      characters: manyCharacters,
      allEvents: [],
      matchingEvents: [],
      filtered: false,
      page: 99,
    });

    expect(page.page).toBe(2);
    expect(page.totalPages).toBe(2);
    expect(page.items).toHaveLength(2);

    const empty = buildLoreCharacterArchive({
      characters: manyCharacters,
      allEvents: [],
      matchingEvents: [],
      filtered: true,
      page: 8,
    });
    expect(empty).toMatchObject({ page: 1, totalItems: 0, totalPages: 1, items: [] });
  });

  it('deduplicates repeated character IDs within one event', () => {
    const result = buildLoreCharacterArchive({
      characters: [characters[0]],
      allEvents: [event('duplicate', 'official', ['alpha-9', 'alpha-9'], 1)],
      matchingEvents: [],
      filtered: false,
    });

    expect(result.items[0].appearanceCount).toBe(1);
  });
});
