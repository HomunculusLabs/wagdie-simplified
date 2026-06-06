import {
  buildAbsoluteCurrentCharacterImageUrl,
  buildBaseCharacterImageVersion,
  buildCurrentCharacterImagePath,
  buildSearedCharacterImageVersion,
} from '@/lib/services/assets/character-current-image-urls'

describe('character current image URL helpers', () => {
  it('pins verified base versions to base-{sha16}', () => {
    expect(buildBaseCharacterImageVersion('A'.repeat(64))).toBe('base-aaaaaaaaaaaaaaaa')
  })

  it('pins seared versions to seared-{tx8}-log{logIndex}-{sha16}', () => {
    expect(buildSearedCharacterImageVersion(`0x${'b'.repeat(64)}`, 7, 'c'.repeat(64))).toBe(
      'seared-bbbbbbbb-log7-cccccccccccccccc'
    )
  })

  it('builds app-relative and absolute current image URLs', () => {
    const version = 'base-1234567890abcdef'

    expect(buildCurrentCharacterImagePath(30, version)).toBe(
      '/images/characters/current/30.png?v=base-1234567890abcdef'
    )
    expect(buildAbsoluteCurrentCharacterImageUrl(30, version, 'https://example.com/')).toBe(
      'https://example.com/images/characters/current/30.png?v=base-1234567890abcdef'
    )
  })
})
