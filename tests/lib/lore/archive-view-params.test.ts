import {
  buildLoreArchiveHref,
  parseArchiveCharacterPage,
  parseArchiveViewParams,
} from '@/lib/lore/archive-view-params';

describe('Archive view URL contract', () => {
  it('defaults missing and invalid views to the canonical timeline', () => {
    expect(parseArchiveViewParams(undefined)).toEqual({ view: 'timeline', page: 1 });
    expect(parseArchiveViewParams({ view: 'unknown', page: '8' })).toEqual({ view: 'timeline', page: 1 });
  });

  it('accepts only positive integer character pages', () => {
    expect(parseArchiveCharacterPage('2')).toBe(2);
    expect(parseArchiveCharacterPage('0')).toBe(1);
    expect(parseArchiveCharacterPage('-4')).toBe(1);
    expect(parseArchiveCharacterPage('1.5')).toBe(1);
    expect(parseArchiveCharacterPage('not-a-page')).toBe(1);
  });

  it('reads the first array value and ignores page outside the character view', () => {
    expect(parseArchiveViewParams({ view: ['characters', 'timeline'], page: ['3', '9'] }))
      .toEqual({ view: 'characters', page: 3 });
    expect(parseArchiveViewParams(new URLSearchParams('page=7')))
      .toEqual({ view: 'timeline', page: 1 });
  });

  it('omits the default timeline view and character page one', () => {
    expect(buildLoreArchiveHref()).toBe('/lore');
    expect(buildLoreArchiveHref({ view: 'timeline', page: 9 })).toBe('/lore');
    expect(buildLoreArchiveHref({ view: 'characters' })).toBe('/lore?view=characters');
    expect(buildLoreArchiveHref({ view: 'characters', page: 1 })).toBe('/lore?view=characters');
  });

  it('preserves filters for view and character pagination links', () => {
    const filters = {
      season: 'the-first-season',
      keyword: 'ash crown',
      canonStatus: 'community' as const,
    };

    expect(buildLoreArchiveHref({ view: 'characters', filters }))
      .toBe('/lore?view=characters&season=the-first-season&keyword=ash+crown&canonStatus=community');
    expect(buildLoreArchiveHref({ view: 'characters', filters, page: 4 }))
      .toBe('/lore?view=characters&season=the-first-season&keyword=ash+crown&canonStatus=community&page=4');
    expect(buildLoreArchiveHref({ view: 'timeline', filters, page: 4 }))
      .toBe('/lore?season=the-first-season&keyword=ash+crown&canonStatus=community');
  });
});
