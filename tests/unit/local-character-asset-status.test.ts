import { hasLocalCharacterImage } from '@/lib/data/local-character-asset-status'

describe('local character asset status', () => {
  it('does not treat token range membership as verified local image proof', () => {
    expect(hasLocalCharacterImage(1)).toBe(false)
    expect(hasLocalCharacterImage(6666)).toBe(false)
  })

  it('rejects invalid token IDs', () => {
    expect(hasLocalCharacterImage(0)).toBe(false)
    expect(hasLocalCharacterImage(1.5)).toBe(false)
  })
})
