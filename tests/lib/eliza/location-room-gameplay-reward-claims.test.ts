/**
 * @jest-environment node
 */

import { elizaConfig } from '@/lib/eliza/config'
import {
  calculateGameplayDeathRewardClaim,
  resolveRewardClaimBeneficiary,
} from '@/lib/eliza/locationRooms/gameplay/rewardClaims'
import type { GameplayCharacterState } from '@/lib/eliza/locationRooms/gameplay/types'

function character(overrides: Partial<GameplayCharacterState> = {}): GameplayCharacterState {
  return {
    tokenId: 7,
    name: 'Ash',
    hp: 0,
    maxHp: 10,
    status: 'dead',
    xp: 0,
    temporaryBoons: [],
    wounds: [],
    ownerAddress: '0xOwner',
    stakerAddress: null,
    performance: {
      roundsActed: 3,
      roundsSurvived: 2,
      damageDealt: 12,
      damageTaken: 9,
      successfulAttacks: 2,
      successfulDefends: 1,
      successfulHelps: 1,
      successfulNoncombatActions: 1,
      objectiveContributions: 2,
      criticalSuccesses: 1,
      criticalFailures: 0,
      fledCount: 0,
    },
    ...overrides,
  }
}

describe('gameplay reward claims', () => {
  it('calculates score breakdown and always includes gameplay reward points', () => {
    const result = calculateGameplayDeathRewardClaim({
      character: character(),
      difficulty: 'normal',
      config: {
        ...elizaConfig.locationRooms.gameplay.deathRewards,
        enabled: true,
        pointsMultiplier: 2,
        pointsCap: 200,
        concordEntitlementTiers: [],
      },
    })

    expect(result).toMatchObject({
      policyVersion: 'death-rewards-v1',
      performanceScore: expect.any(Number),
      lineItems: [expect.objectContaining({ assetType: 'gameplay_reward_points' })],
    })
    expect(result.lineItems[0]).toMatchObject({
      amount: result.performanceScore * 2,
    })
    expect(result.scoreBreakdown.counters).toMatchObject({ damageDealt: 12, successfulAttacks: 2 })
  })

  it('adds only the highest configured concord entitlement tier reached by score', () => {
    const result = calculateGameplayDeathRewardClaim({
      character: character(),
      difficulty: 'deadly',
      config: {
        ...elizaConfig.locationRooms.gameplay.deathRewards,
        enabled: true,
        pointsMultiplier: 1,
        pointsCap: 100,
        concordEntitlementTiers: [
          { minScore: 50, chainId: 1, contractAddress: '0xminor', concordId: 100, amount: 1 },
          { minScore: 80, chainId: 1, contractAddress: '0xmajor', concordId: 200, amount: 1 },
        ],
      },
    })

    expect(result.performanceScore).toBeGreaterThanOrEqual(80)
    expect(result.lineItems).toEqual(expect.arrayContaining([
      { assetType: 'erc1155_concord_entitlement', chainId: 1, contractAddress: '0xmajor', concordId: 200, amount: 1 },
    ]))
    expect(result.lineItems).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ assetType: 'erc1155_concord_entitlement', concordId: 100 }),
    ]))
  })

  it('freezes the death-time staker wallet before falling back to owner wallet', () => {
    expect(resolveRewardClaimBeneficiary(character({ stakerAddress: '0xStaker' }), undefined)).toEqual({
      wallet: '0xstaker',
      source: 'staker_address',
    })
    expect(resolveRewardClaimBeneficiary(character({ ownerAddress: null, stakerAddress: null }), {
      ownerAddress: '0xParticipantOwner',
      stakerAddress: null,
    })).toEqual({
      wallet: '0xparticipantowner',
      source: 'owner_address',
    })
  })
})
