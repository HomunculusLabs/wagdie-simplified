import { locationRoomRepository, type LocationRoomRepository } from '../repository'
import {
  locationRoomGameplayRepository,
  type LocationRoomGameplayRepository,
} from './repository'
import type {
  GameplayDeathReview,
  GameplayDeathReviewStatus,
  GameplayRewardClaim,
  GameplayRewardClaimStatus,
  GameplayRoomState,
} from './types'

export const GAMEPLAY_DEATH_REVIEW_OUTCOMES = [
  'reject_death',
  'gameplay_only',
  'approve_finality',
] as const

export type GameplayDeathReviewOutcome = typeof GAMEPLAY_DEATH_REVIEW_OUTCOMES[number]

export class AdminGameplayLocationNotFoundError extends Error {
  constructor(locationId: string) {
    super(`Location not found: ${locationId}`)
    this.name = 'AdminGameplayLocationNotFoundError'
  }
}

export class GameplayDeathReviewNotFoundError extends Error {
  constructor(reviewId: string) {
    super(`Gameplay death review not found: ${reviewId}`)
    this.name = 'GameplayDeathReviewNotFoundError'
  }
}

export class GameplayDeathReviewConflictError extends Error {
  constructor(message = 'Gameplay death review has already been decided') {
    super(message)
    this.name = 'GameplayDeathReviewConflictError'
  }
}

export type InspectRoomGameplayResult = {
  location: { id: string; name: string }
  room: Awaited<ReturnType<LocationRoomRepository['findRoomByLocationId']>>
  state: GameplayRoomState | null
  activeEncounter: Awaited<ReturnType<LocationRoomGameplayRepository['findActiveEncounterByRoomId']>>
  turns: Awaited<ReturnType<LocationRoomGameplayRepository['listRecentTurnsByRoomId']>>
  rewardClaims: GameplayRewardClaim[]
}

export type ListDeathReviewsInput = {
  reviewStatus?: GameplayDeathReviewStatus | 'all'
  locationId?: string | null
  limit?: number
}

function isDeathReviewOutcome(value: unknown): value is GameplayDeathReviewOutcome {
  return typeof value === 'string' && (GAMEPLAY_DEATH_REVIEW_OUTCOMES as readonly string[]).includes(value)
}

function normalizeWallet(value: string): string {
  return value.trim().toLowerCase()
}

function nowIso(now = new Date()): string {
  return now.toISOString()
}

function restoreCharacterPlayability(state: GameplayRoomState, tokenId: number, now: Date): GameplayRoomState['characters'] {
  const character = state.characters[String(tokenId)]
  if (!character) return state.characters

  const restoredHp = Math.max(1, character.hp, Math.ceil(Math.max(1, character.maxHp) / 2))
  return {
    ...state.characters,
    [String(tokenId)]: {
      ...character,
      hp: restoredHp,
      status: 'alive',
      updatedAt: nowIso(now),
    },
  }
}

function reviewStatusForOutcome(outcome: GameplayDeathReviewOutcome): GameplayDeathReviewStatus {
  if (outcome === 'reject_death') return 'rejected'
  if (outcome === 'gameplay_only') return 'gameplay_only'
  return 'finality_approved'
}

function claimStatusForOutcome(outcome: GameplayDeathReviewOutcome): GameplayRewardClaimStatus {
  if (outcome === 'reject_death') return 'rejected'
  if (outcome === 'gameplay_only') return 'voided'
  return 'released'
}

function attachRewardClaims(
  reviews: GameplayDeathReview[],
  claims: GameplayRewardClaim[]
): GameplayDeathReview[] {
  const claimsByReviewId = new Map(claims.map((claim) => [claim.deathReviewId, claim]))
  return reviews.map((review) => ({
    ...review,
    rewardClaim: claimsByReviewId.get(review.id) ?? null,
  }))
}

export class LocationRoomGameplayAdminService {
  constructor(
    private readonly roomRepository: LocationRoomRepository = locationRoomRepository,
    private readonly gameplayRepository: LocationRoomGameplayRepository = locationRoomGameplayRepository
  ) {}

  isDeathReviewOutcome(value: unknown): value is GameplayDeathReviewOutcome {
    return isDeathReviewOutcome(value)
  }

  async inspectRoomGameplay(locationId: string, limit = 10): Promise<InspectRoomGameplayResult> {
    const location = await this.roomRepository.getLocation(locationId)
    if (!location) {
      throw new AdminGameplayLocationNotFoundError(locationId)
    }

    const room = await this.roomRepository.findRoomByLocationId(locationId)
    if (!room) {
      return {
        location,
        room: null,
        state: null,
        activeEncounter: null,
        turns: [],
        rewardClaims: [],
      }
    }

    const [state, activeEncounter, turns, rewardClaims] = await Promise.all([
      this.gameplayRepository.findStateByRoomId(room.id),
      this.gameplayRepository.findActiveEncounterByRoomId(room.id),
      this.gameplayRepository.listRecentTurnsByRoomId(room.id, limit),
      this.gameplayRepository.listRewardClaims({ roomId: room.id, limit }),
    ])

    return {
      location,
      room,
      state,
      activeEncounter,
      turns,
      rewardClaims,
    }
  }

  async listDeathReviews(input: ListDeathReviewsInput = {}): Promise<GameplayDeathReview[]> {
    const reviews = await this.gameplayRepository.listDeathReviews(input)
    if (reviews.length === 0) return []

    const claims = await this.gameplayRepository.listRewardClaims({
      deathReviewIds: reviews.map((review) => review.id),
      limit: reviews.length,
    })
    return attachRewardClaims(reviews, claims)
  }

  async updateDeathReviewOutcome(params: {
    reviewId: string
    outcome: GameplayDeathReviewOutcome
    adminWallet: string
    now?: Date
  }): Promise<GameplayDeathReview> {
    const review = await this.gameplayRepository.findDeathReviewById(params.reviewId)
    if (!review) {
      throw new GameplayDeathReviewNotFoundError(params.reviewId)
    }

    if (review.reviewStatus !== 'pending') {
      throw new GameplayDeathReviewConflictError()
    }

    const now = params.now ?? new Date()
    const decidedAt = nowIso(now)
    const adminWallet = normalizeWallet(params.adminWallet)

    if (params.outcome === 'reject_death') {
      const state = await this.gameplayRepository.findStateByRoomId(review.roomId)
      if (state) {
        await this.gameplayRepository.updateState({ id: review.roomId }, {
          characters: restoreCharacterPlayability(state, review.tokenId, now),
          metadata: {
            ...state.metadata,
            lastDeathReviewOverride: {
              reviewId: review.id,
              tokenId: review.tokenId,
              outcome: params.outcome,
              adminWallet,
              decidedAt,
            },
          },
        })
      }
    }

    const existingClaim = await this.gameplayRepository.findRewardClaimByDeathReviewId(review.id)
    const claimMetadata: Record<string, unknown> = {
      ...(existingClaim?.metadata ?? {}),
      finalOutcome: params.outcome,
    }
    if (params.outcome === 'gameplay_only') {
      claimMetadata.reason = 'gameplay_only_no_token_finality'
    }

    const updatedClaim = await this.gameplayRepository.updateRewardClaimStatusByDeathReviewId(review.id, {
      status: claimStatusForOutcome(params.outcome),
      releaseAdminWallet: params.outcome === 'approve_finality' ? adminWallet : null,
      releasedAt: params.outcome === 'approve_finality' ? decidedAt : null,
      metadata: claimMetadata,
      lastError: null,
    })

    const updatedReview = await this.gameplayRepository.updateDeathReview(review.id, {
      gameplayDeathStatus: params.outcome === 'reject_death' ? 'restored' : 'dead',
      reviewStatus: reviewStatusForOutcome(params.outcome),
      adminWallet,
      decidedAt,
      burnSyncStatus: params.outcome === 'approve_finality' ? 'pending' : 'not_applicable',
      metadata: {
        ...review.metadata,
        finalOutcome: params.outcome,
      },
      lastError: null,
    })

    return {
      ...updatedReview,
      rewardClaim: updatedClaim,
    }
  }
}

export const locationRoomGameplayAdminService = new LocationRoomGameplayAdminService()
