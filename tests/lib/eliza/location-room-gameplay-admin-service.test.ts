/**
 * @jest-environment node
 */

import { LocationRoomGameplayAdminService } from '@/lib/eliza/locationRooms/gameplay/adminService'
import type { LocationRoomRepository } from '@/lib/eliza/locationRooms/repository'
import type { LocationRoomGameplayRepository } from '@/lib/eliza/locationRooms/gameplay/repository'
import type { GameplayDeathReview, GameplayRewardClaim, GameplayRoomState } from '@/lib/eliza/locationRooms/gameplay/types'

const now = new Date('2026-05-22T12:00:00.000Z')

function review(overrides: Partial<GameplayDeathReview> = {}): GameplayDeathReview {
  return {
    id: 'review-1',
    roomId: 'room-1',
    locationId: 'loc-1',
    encounterId: 'encounter-1',
    turnId: 'turn-1',
    tokenId: 7,
    gameplayDeathStatus: 'dead',
    reviewStatus: 'pending',
    adminWallet: null,
    decidedAt: null,
    burnSyncStatus: 'not_applicable',
    context: {},
    metadata: {},
    lastError: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  }
}

function claim(overrides: Partial<GameplayRewardClaim> = {}): GameplayRewardClaim {
  return {
    id: 'claim-1',
    roomId: 'room-1',
    locationId: 'loc-1',
    encounterId: 'encounter-1',
    turnId: 'turn-1',
    deathReviewId: 'review-1',
    tokenId: 7,
    beneficiaryWallet: '0xowner',
    beneficiarySource: 'owner_address',
    status: 'pending_review',
    policyVersion: 'death-rewards-v1',
    performanceScore: 42,
    scoreBreakdown: {
      combat: 10,
      assist: 0,
      survival: 2,
      objective: 0,
      noncombat: 0,
      critical: 0,
      penalty: 0,
      rawScore: 12,
      difficultyMultiplier: 1,
      finalScore: 12,
      counters: {
        roundsActed: 1,
        roundsSurvived: 1,
        damageDealt: 5,
        damageTaken: 6,
        successfulAttacks: 0,
        successfulDefends: 0,
        successfulHelps: 0,
        successfulNoncombatActions: 0,
        objectiveContributions: 0,
        criticalSuccesses: 0,
        criticalFailures: 0,
        fledCount: 0,
      },
    },
    lineItems: [{ assetType: 'gameplay_reward_points', amount: 42 }],
    releaseAdminWallet: null,
    releasedAt: null,
    metadata: {},
    lastError: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  }
}

function state(): GameplayRoomState {
  return {
    id: 'state-1',
    roomId: 'room-1',
    locationId: 'loc-1',
    status: 'active_encounter',
    activeEncounterId: 'encounter-1',
    characters: {
      '7': {
        tokenId: 7,
        name: 'Ash',
        hp: 0,
        maxHp: 10,
        status: 'dead',
        xp: 0,
        temporaryBoons: [],
        wounds: ['Crushed by the bell'],
      },
    },
    rewards: {},
    metadata: {},
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }
}

function makeRoomRepository(): jest.Mocked<LocationRoomRepository> {
  return {
    getLocation: jest.fn(),
    getLocationDetails: jest.fn(),
    listLocationsByIds: jest.fn(),
    findRoomById: jest.fn(),
    findRoomByLocationId: jest.fn(),
    ensureRoomForLocation: jest.fn(),
    listDueRooms: jest.fn(),
    enqueueTick: jest.fn(),
    findRecentCompletedOwnerTick: jest.fn(),
    findOldestProcessableTickForRoom: jest.fn(),
    findNonStaleProcessingTickForRoom: jest.fn(),
    claimTick: jest.fn(),
    claimDueTicks: jest.fn(),
    listActiveTicksForRoom: jest.fn(),
    listRecentTicksForRoom: jest.fn(),
    getPublicMessageStats: jest.fn(),
    markTickSelected: jest.fn(),
    appendMessage: jest.fn(),
    markTickCompleted: jest.fn(),
    markTickSkipped: jest.fn(),
    markTickFailed: jest.fn(),
    markTickDead: jest.fn(),
    updateRoomAfterProcessedTick: jest.fn(),
    recordRoomError: jest.fn(),
    listPublicMessages: jest.fn(),
    listRecentPublicMessages: jest.fn(),
  } as jest.Mocked<LocationRoomRepository>
}

function makeGameplayRepository(
  overrides: Partial<jest.Mocked<LocationRoomGameplayRepository>> = {}
): jest.Mocked<LocationRoomGameplayRepository> {
  return {
    findStateByRoomId: jest.fn(async () => state()),
    ensureStateForRoom: jest.fn(),
    updateState: jest.fn(async (_room, input) => ({ ...state(), ...input } as GameplayRoomState)),
    updateCharacterState: jest.fn(),
    findActiveEncounterByRoomId: jest.fn(),
    findEncounterById: jest.fn(),
    createActiveEncounter: jest.fn(),
    updateEncounter: jest.fn(),
    findTurnByTickId: jest.fn(),
    listRecentTurnsByRoomId: jest.fn(),
    createOrReuseTurn: jest.fn(),
    storeTurnOutcome: jest.fn(),
    markTurnFailed: jest.fn(),
    markTurnDead: jest.fn(),
    createPendingDeathReview: jest.fn(),
    listDeathReviews: jest.fn(),
    findDeathReviewById: jest.fn(async () => review()),
    updateDeathReview: jest.fn(async (_reviewId, input) => ({ ...review(), ...input } as GameplayDeathReview)),
    createOrReuseRewardClaim: jest.fn(),
    findRewardClaimByDeathReviewId: jest.fn(async () => claim()),
    listRewardClaims: jest.fn(async () => [claim()]),
    updateRewardClaimStatusByDeathReviewId: jest.fn(async (_deathReviewId, input) => ({ ...claim(), ...input } as GameplayRewardClaim)),
    ...overrides,
  } as jest.Mocked<LocationRoomGameplayRepository>
}

describe('LocationRoomGameplayAdminService', () => {
  it('rejects gameplay death and restores the character to playable state', async () => {
    const gameplayRepository = makeGameplayRepository()
    const service = new LocationRoomGameplayAdminService(makeRoomRepository(), gameplayRepository)

    const result = await service.updateDeathReviewOutcome({
      reviewId: 'review-1',
      outcome: 'reject_death',
      adminWallet: '0xAdmin',
      now,
    })

    expect(gameplayRepository.updateState).toHaveBeenCalledWith({ id: 'room-1' }, expect.objectContaining({
      characters: expect.objectContaining({
        '7': expect.objectContaining({ status: 'alive', hp: 5 }),
      }),
      metadata: expect.objectContaining({
        lastDeathReviewOverride: expect.objectContaining({
          outcome: 'reject_death',
          adminWallet: '0xadmin',
        }),
      }),
    }))
    expect(gameplayRepository.updateDeathReview).toHaveBeenCalledWith('review-1', expect.objectContaining({
      gameplayDeathStatus: 'restored',
      reviewStatus: 'rejected',
      adminWallet: '0xadmin',
      burnSyncStatus: 'not_applicable',
    }))
    expect(gameplayRepository.updateRewardClaimStatusByDeathReviewId).toHaveBeenCalledWith('review-1', expect.objectContaining({
      status: 'rejected',
      releaseAdminWallet: null,
      releasedAt: null,
    }))
    expect(result.reviewStatus).toBe('rejected')
    expect(result.rewardClaim).toMatchObject({ status: 'rejected' })
  })

  it('approves finality intent without automatic token burn details', async () => {
    const gameplayRepository = makeGameplayRepository()
    const service = new LocationRoomGameplayAdminService(makeRoomRepository(), gameplayRepository)

    const result = await service.updateDeathReviewOutcome({
      reviewId: 'review-1',
      outcome: 'approve_finality',
      adminWallet: '0xAdmin',
      now,
    })

    expect(gameplayRepository.updateState).not.toHaveBeenCalled()
    expect(gameplayRepository.updateDeathReview).toHaveBeenCalledWith('review-1', expect.objectContaining({
      gameplayDeathStatus: 'dead',
      reviewStatus: 'finality_approved',
      burnSyncStatus: 'pending',
    }))
    expect(gameplayRepository.updateRewardClaimStatusByDeathReviewId).toHaveBeenCalledWith('review-1', expect.objectContaining({
      status: 'released',
      releaseAdminWallet: '0xadmin',
      releasedAt: now.toISOString(),
    }))
    expect(result.rewardClaim).toMatchObject({ status: 'released' })
    expect(JSON.stringify(result)).not.toContain('burnTransaction')
  })

  it('marks gameplay-only outcomes as voided reward claims', async () => {
    const gameplayRepository = makeGameplayRepository()
    const service = new LocationRoomGameplayAdminService(makeRoomRepository(), gameplayRepository)

    const result = await service.updateDeathReviewOutcome({
      reviewId: 'review-1',
      outcome: 'gameplay_only',
      adminWallet: '0xAdmin',
      now,
    })

    expect(gameplayRepository.updateRewardClaimStatusByDeathReviewId).toHaveBeenCalledWith('review-1', expect.objectContaining({
      status: 'voided',
      metadata: expect.objectContaining({ reason: 'gameplay_only_no_token_finality' }),
    }))
    expect(result.rewardClaim).toMatchObject({ status: 'voided' })
  })
})
