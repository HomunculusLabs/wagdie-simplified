/**
 * @jest-environment node
 */

import {
  findPublicOutputDenylistViolation,
} from '@/lib/eliza/locationRooms/generation/publicOutputContract'

describe('location room public output contract', () => {
  it('allows physical rolling language while blocking explicit dice mechanics', () => {
    expect(findPublicOutputDenylistViolation('Salt rolls across the floor toward the cellar stair.', {
      allowGenericCheckWord: true,
    })).toBeNull()

    expect(findPublicOutputDenylistViolation('I rolled a d20 and make an attack check against Maw.', {
      allowGenericCheckWord: true,
    })).toMatchObject({ reason: 'explicit roll/check mechanics' })
  })

  it('matches contextual ids by safe normalized boundaries instead of raw substrings', () => {
    expect(findPublicOutputDenylistViolation('The bar door opens and the gate chain drops.', {
      contextualIds: ['bar', 'gate'],
    })).toBeNull()

    expect(findPublicOutputDenylistViolation('The ash marks answer too clearly.', {
      contextualIds: ['ash-marks'],
    })).toBeNull()

    expect(findPublicOutputDenylistViolation('The read the runes option answers too clearly.', {
      contextualIds: ['read-the-runes'],
    })).toMatchObject({ reason: 'contextual id' })
  })
})
