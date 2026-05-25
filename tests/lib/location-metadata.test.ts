/**
 * @jest-environment node
 */

import {
  normalizeLocationAdventureCatalog,
  normalizeLocationMetadata,
} from '@/lib/domain/location/metadata'

describe('location metadata adventure catalog', () => {
  it('omits missing or empty adventure catalogs', () => {
    expect(normalizeLocationAdventureCatalog(undefined)).toBeUndefined()
    expect(normalizeLocationAdventureCatalog({})).toBeUndefined()
    expect(normalizeLocationMetadata({ coordinates: { x: 1, y: 2 } }).adventureCatalog).toBeUndefined()
    expect(normalizeLocationMetadata({ adventureCatalog: { bad: 'raw unsafe catalog' } })).not.toHaveProperty('adventureCatalog')
  })

  it('normalizes Johnny Decimal catalog sections and seed defaults', () => {
    const metadata = normalizeLocationMetadata({
      coordinates: { x: 10, y: 20 },
      adventureCatalog: {
        defaults: {
          arcSummary: ' A bell-market conspiracy. ',
          currentStakes: ' The third bell ends bargaining. ',
          openingDecision: {
            id: ' First Contact ',
            prompt: ' Who receives your first question? ',
            options: [
              { id: 'merchant', label: 'The bell merchant' },
              { id: 'guard', label: 'The ash guard' },
            ],
          },
          discoveries: [' The bell merchant fears mirrors. ', 'The bell merchant fears mirrors.'],
          clocks: [{ id: 'third-bell', label: 'Third bell', value: 2, max: 6, summary: 'The market begins to close.' }],
        },
        '20_characters': [
          {
            id: '20.10.bell-merchant',
            title: 'Bell Merchant',
            summary: 'A merchant trading in cursed bells.',
            tags: ['Merchant', 'Bell', 'Merchant'],
            revealConditions: ['After the first bargain'],
            relatedEntryIds: ['50.10.mirror-key'],
          },
        ],
        '50_items': [
          { id: '50.10.mirror-key', summary: 'A key that reflects doors before opening them.', tags: ['key'] },
        ],
      },
    })

    expect(metadata.adventureCatalog?.defaults).toEqual({
      arcSummary: 'A bell-market conspiracy.',
      currentStakes: 'The third bell ends bargaining.',
      openingDecision: {
        id: 'first-contact',
        prompt: 'Who receives your first question?',
        options: [
          { id: 'merchant', label: 'The bell merchant' },
          { id: 'guard', label: 'The ash guard' },
        ],
      },
      discoveries: ['The bell merchant fears mirrors.'],
      clocks: [{ id: 'third-bell', label: 'Third bell', value: 2, max: 6, summary: 'The market begins to close.' }],
    })
    expect(metadata.adventureCatalog?.sections['20_characters']).toEqual([
      {
        id: '20.10.bell-merchant',
        section: '20_characters',
        title: 'Bell Merchant',
        summary: 'A merchant trading in cursed bells.',
        tags: ['merchant', 'bell'],
        revealConditions: ['After the first bargain'],
        relatedEntryIds: ['50.10.mirror-key'],
      },
    ])
    expect(metadata.adventureCatalog?.sections['50_items']).toHaveLength(1)
    expect(metadata.bounds).toEqual([[-15, -5], [35, 45]])
  })

  it('caps oversized sections and drops invalid ids or public-unsafe text', () => {
    const catalog = normalizeLocationAdventureCatalog({
      defaults: {
        arcSummary: 'Track wallet 0x1234567890123456789012345678901234567890',
        discoveries: ['Safe clue', 'HP is 3'],
        clocks: [{ id: 'alarm', label: 'Alarm', value: 99, max: 99, summary: 'Alarm rises.' }],
      },
      '30_monsters': Array.from({ length: 20 }, (_, index) => ({
        id: index === 0 ? 'Monster With Spaces' : `30.${index}.crow`,
        summary: index === 1 ? 'Raw model payload should hide.' : `Crow omen ${index}`,
        tags: ['crow'],
      })),
    })

    expect(catalog?.defaults.arcSummary).toBeNull()
    expect(catalog?.defaults.discoveries).toEqual(['Safe clue'])
    expect(catalog?.defaults.clocks).toEqual([{ id: 'alarm', label: 'Alarm', value: 12, max: 12, summary: 'Alarm rises.' }])
    expect(catalog?.sections['30_monsters']).toHaveLength(12)
    expect(catalog?.sections['30_monsters'][0].id).toBe('monster-with-spaces')
    expect(catalog?.sections['30_monsters'].some((entry) => entry.summary.includes('Raw model'))).toBe(false)
  })
})
