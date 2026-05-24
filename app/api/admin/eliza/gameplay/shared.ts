import { NextResponse } from 'next/server'
import { isAuthError, requireAdmin, type AuthResult } from '@/lib/api/auth'
import { jsonNoStoreError } from '@/lib/api/responses'
import {
  AdminGameplayLocationNotFoundError,
  GameplayDeathReviewConflictError,
  GameplayDeathReviewNotFoundError,
  type InspectRoomGameplayResult,
} from '@/lib/eliza/locationRooms/gameplay/adminService'
import type {
  GameplayDeathReview,
  GameplayEncounter,
  GameplayRewardClaim,
  GameplayRewardClaimSummary,
  GameplayRun,
  GameplayTurn,
} from '@/lib/eliza/locationRooms/gameplay/types'

const SAFE_GAMEPLAY_ERROR_MESSAGE = 'Gameplay operation failed. Check server logs for details.'

export async function requireAdminNoStore(): Promise<AuthResult | NextResponse> {
  const auth = await requireAdmin()
  if (isAuthError(auth)) {
    auth.headers.set('Cache-Control', 'no-store')
  }

  return auth
}

export function serializeRewardClaimSummary(claim: GameplayRewardClaim | GameplayRewardClaimSummary | null | undefined) {
  if (!claim) return null

  return {
    id: claim.id,
    deathReviewId: claim.deathReviewId,
    status: claim.status,
    beneficiaryWallet: claim.beneficiaryWallet,
    beneficiarySource: claim.beneficiarySource,
    tokenId: claim.tokenId,
    performanceScore: claim.performanceScore,
    scoreBreakdown: claim.scoreBreakdown,
    lineItems: claim.lineItems,
    policyVersion: claim.policyVersion,
    releaseAdminWallet: claim.releaseAdminWallet,
    releasedAt: claim.releasedAt,
    lastError: claim.lastError ? SAFE_GAMEPLAY_ERROR_MESSAGE : null,
    createdAt: claim.createdAt,
    updatedAt: claim.updatedAt,
  }
}

export function serializeDeathReview(review: GameplayDeathReview) {
  return {
    id: review.id,
    roomId: review.roomId,
    locationId: review.locationId,
    encounterId: review.encounterId,
    turnId: review.turnId,
    tokenId: review.tokenId,
    gameplayDeathStatus: review.gameplayDeathStatus,
    reviewStatus: review.reviewStatus,
    adminWallet: review.adminWallet,
    decidedAt: review.decidedAt,
    burnSyncStatus: review.burnSyncStatus,
    context: review.context,
    metadata: review.metadata,
    rewardClaim: serializeRewardClaimSummary(review.rewardClaim),
    lastError: review.lastError ? SAFE_GAMEPLAY_ERROR_MESSAGE : null,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  }
}

function serializeEncounter(encounter: GameplayEncounter | null) {
  if (!encounter) return null

  return {
    id: encounter.id,
    roomId: encounter.roomId,
    locationId: encounter.locationId,
    status: encounter.status,
    difficulty: encounter.difficulty,
    roundNumber: encounter.roundNumber,
    publicTitle: encounter.publicTitle,
    publicSummary: encounter.publicSummary,
    monsterState: encounter.monsterState,
    rewardPlan: encounter.rewardPlan,
    mechanics: encounter.mechanics,
    metadata: encounter.metadata,
    lastError: encounter.lastError ? SAFE_GAMEPLAY_ERROR_MESSAGE : null,
    createdAt: encounter.createdAt,
    updatedAt: encounter.updatedAt,
    completedAt: encounter.completedAt,
  }
}

function serializeRun(run: GameplayRun | null | undefined) {
  if (!run) return null

  return {
    id: run.id,
    status: run.status,
    targetCompletedTurns: run.targetCompletedTurns,
    completedTurns: run.completedTurns,
    remainingTurns: Math.max(0, run.targetCompletedTurns - run.completedTurns),
    startedByActor: run.startedByActor,
    startedByTokenId: run.startedByTokenId,
    lastTickId: run.lastTickId,
    lastAdvancedAt: run.lastAdvancedAt,
    completedAt: run.completedAt,
    stopReason: run.stopReason,
    lastError: run.lastError ? SAFE_GAMEPLAY_ERROR_MESSAGE : null,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  }
}

function serializeTurn(turn: GameplayTurn) {
  return {
    id: turn.id,
    roomId: turn.roomId,
    locationId: turn.locationId,
    tickId: turn.tickId,
    encounterId: turn.encounterId,
    status: turn.status,
    selectedTokenId: turn.selectedTokenId,
    action: turn.action,
    diceResults: turn.diceResults,
    mechanicalDeltas: turn.mechanicalDeltas,
    publicMessageIds: turn.publicMessageIds,
    outcomeSummary: turn.outcomeSummary,
    metadata: turn.metadata,
    lastError: turn.lastError ? SAFE_GAMEPLAY_ERROR_MESSAGE : null,
    createdAt: turn.createdAt,
    updatedAt: turn.updatedAt,
    completedAt: turn.completedAt,
  }
}

export function serializeGameplayInspection(result: InspectRoomGameplayResult) {
  return {
    location: result.location,
    room: result.room ? {
      id: result.room.id,
      locationId: result.room.locationId,
      locationName: result.location.name,
      tickEnabled: result.room.tickEnabled,
      lastTickAt: result.room.lastTickAt,
      nextTickAt: result.room.nextTickAt,
      tickCount: result.room.tickCount,
      createdAt: result.room.createdAt,
      updatedAt: result.room.updatedAt,
    } : null,
    state: result.state ? {
      roomId: result.state.roomId,
      locationId: result.state.locationId,
      status: result.state.status,
      activeEncounterId: result.state.activeEncounterId,
      characters: result.state.characters,
      rewards: result.state.rewards,
      metadata: result.state.metadata,
      createdAt: result.state.createdAt,
      updatedAt: result.state.updatedAt,
    } : null,
    activeEncounter: serializeEncounter(result.activeEncounter),
    turns: result.turns.map(serializeTurn),
    rewardClaims: result.rewardClaims.map(serializeRewardClaimSummary),
    activeRun: serializeRun(result.activeRun),
    recentRuns: result.recentRuns.map(serializeRun),
    count: result.turns.length,
  }
}

export function gameplayAdminErrorResponse(error: unknown, fallback = 'Failed to manage gameplay state'): NextResponse {
  if (error instanceof AdminGameplayLocationNotFoundError) {
    return jsonNoStoreError('Location not found', 404)
  }

  if (error instanceof GameplayDeathReviewNotFoundError) {
    return jsonNoStoreError('Gameplay death review not found', 404)
  }

  if (error instanceof GameplayDeathReviewConflictError) {
    return jsonNoStoreError(error.message, 409)
  }

  console.error('[Admin Gameplay API] Error:', error)
  return jsonNoStoreError(fallback, 500)
}
