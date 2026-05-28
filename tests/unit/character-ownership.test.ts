import { canEditCharacterForAddress, isCharacterHeldByAddress } from '@/lib/domain/character/ownership'
import type { Character } from '@/types/character'

const character = {
  token_id: 1,
  owner_address: '0xOwner',
  staker_address: '0xStaker',
} as Character

describe('isCharacterHeldByAddress', () => {
  it('matches owner and staker addresses case-insensitively', () => {
    expect(isCharacterHeldByAddress(character, '0xowner')).toBe(true)
    expect(isCharacterHeldByAddress(character, '0xstaker')).toBe(true)
  })

  it('does not treat admins as holders unless their wallet owns or stakes the character', () => {
    expect(isCharacterHeldByAddress(character, '0xAdmin')).toBe(false)
  })
})

describe('canEditCharacterForAddress', () => {
  it('allows an admin with an address to edit', () => {
    expect(canEditCharacterForAddress(character, '0xAdmin', true)).toBe(true)
  })

  it('matches owner address case-insensitively', () => {
    expect(canEditCharacterForAddress(character, '0xowner', false)).toBe(true)
  })

  it('matches staker address case-insensitively', () => {
    expect(canEditCharacterForAddress(character, '0xstaker', false)).toBe(true)
  })

  it('rejects non-owner, non-staker, non-admin users', () => {
    expect(canEditCharacterForAddress(character, '0xOther', false)).toBe(false)
  })

  it('returns false when character is missing', () => {
    expect(canEditCharacterForAddress(null, '0xAdmin', true)).toBe(false)
  })

  it('returns false when user address is missing', () => {
    expect(canEditCharacterForAddress(character, null, true)).toBe(false)
  })
})
