import { getSearingCharacterName, isSearingCharacterSeared } from '@/components/searing/searing-page-utils'
import type { Character } from '@/types/character'

describe('searing page utils', () => {
  it('resolves character names in the same priority as the page', () => {
    expect(getSearingCharacterName({ token_id: 7, name: 'Display Name', metadata: { name: 'Metadata Name' } })).toBe('Display Name')
    expect(getSearingCharacterName({ token_id: 8, metadata: { name: 'Metadata Name' } })).toBe('Metadata Name')
    expect(getSearingCharacterName({ token_id: 9 })).toBe('WAGDIE #9')
  })

  it('detects all seared metadata markers', () => {
    const base = { token_id: 1 } satisfies Character

    expect(isSearingCharacterSeared(base)).toBe(false)
    expect(isSearingCharacterSeared({ ...base, metadata: { isSeared: true } })).toBe(true)
    expect(isSearingCharacterSeared({ ...base, metadata: { searImage: '/seared.png' } })).toBe(true)
    expect(isSearingCharacterSeared({
      ...base,
      metadata: { searing_materialization: { seared_image_url: '/materialized.png' } },
    })).toBe(true)
  })
})
