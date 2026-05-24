/**
 * @jest-environment node
 */

const order = jest.fn()
const eq = jest.fn(() => ({ order }))
const select = jest.fn(() => ({ eq }))
const from = jest.fn(() => ({ select }))

jest.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: jest.fn(() => ({ from })),
}))

jest.mock('@/lib/utils/blockchain', () => ({
  isBurnedOwner: jest.fn((_ownerAddress: string | null, burned: boolean | null) => Boolean(burned)),
}))

import { CHARACTERS_TABLE } from '@/lib/db/tables'
import { SupabaseLocationRoomMembershipRepository } from '@/lib/eliza/locationRooms/membership'

describe('SupabaseLocationRoomMembershipRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    order.mockResolvedValue({
      data: [
        {
          token_id: 10,
          name: 'Albus',
          metadata: {
            image: 'ipfs://albus',
            attributes: [{ trait_type: 'Class', value: 'Cleric' }],
          },
          background_story: 'private story',
          owner_address: '0xOWNER',
          staker_address: '0xSTAKER',
          location_id: '11',
          burned: false,
          level: 2,
          str: 14,
          dex: 9,
          con: 12,
          int: 13,
          wis: 15,
          cha: 10,
          max_hp: 18,
        },
      ],
      error: null,
    })
  })

  it('selects verified character columns and maps public-safe static sheet fields', async () => {
    const repository = new SupabaseLocationRoomMembershipRepository()

    const participants = await repository.listEligibleParticipantsByLocation('11')

    expect(from).toHaveBeenCalledWith(CHARACTERS_TABLE)
    expect(select).toHaveBeenCalledWith(
      'token_id, name, metadata, background_story, owner_address, staker_address, location_id, burned, level, str, dex, con, int, wis, cha, max_hp'
    )
    expect(eq).toHaveBeenCalledWith('location_id', '11')
    expect(order).toHaveBeenCalledWith('token_id', { ascending: true })
    expect(participants).toEqual([
      expect.objectContaining({
        tokenId: 10,
        name: 'Albus',
        imageUrl: 'ipfs://albus',
        characterClass: 'Cleric',
        level: 2,
        coreStats: {
          strength: 14,
          dexterity: 9,
          constitution: 12,
          intelligence: 13,
          wisdom: 15,
          charisma: 10,
        },
        maxHp: 18,
        ac: null,
        speed: null,
      }),
    ])
  })
})
