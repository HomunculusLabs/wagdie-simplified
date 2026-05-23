import { elizaConfig } from '@/lib/eliza/config'
import type { LocationRoomParticipant } from '../types'
import { defaultGameplayPerformanceCounters } from './types'
import type {
  GameplayCharacterState,
  GameplayDifficulty,
  GameplayPerformanceCounters,
  GameplayRewardClaimBeneficiarySource,
  GameplayRewardClaimLineItem,
  GameplayRewardClaimScoreBreakdown,
} from './types'

type DeathRewardConfig = typeof elizaConfig.locationRooms.gameplay.deathRewards

export type GameplayDeathRewardCalculation = {
  policyVersion: string
  performanceScore: number
  scoreBreakdown: GameplayRewardClaimScoreBreakdown
  lineItems: GameplayRewardClaimLineItem[]
}

export type GameplayRewardClaimBeneficiary = {
  wallet: string
  source: GameplayRewardClaimBeneficiarySource
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizedCounters(counters: GameplayPerformanceCounters | undefined): GameplayPerformanceCounters {
  return {
    ...defaultGameplayPerformanceCounters(),
    ...(counters ?? {}),
  }
}

function normalizeWallet(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase()
  return trimmed || null
}

export function resolveRewardClaimBeneficiary(
  character: GameplayCharacterState | undefined,
  participant: Pick<LocationRoomParticipant, 'ownerAddress' | 'stakerAddress'> | undefined
): GameplayRewardClaimBeneficiary | null {
  const stakerWallet = normalizeWallet(character?.stakerAddress ?? participant?.stakerAddress)
  if (stakerWallet) {
    return { wallet: stakerWallet, source: 'staker_address' }
  }

  const ownerWallet = normalizeWallet(character?.ownerAddress ?? participant?.ownerAddress)
  if (ownerWallet) {
    return { wallet: ownerWallet, source: 'owner_address' }
  }

  return null
}

export function calculateGameplayDeathRewardClaim(params: {
  character: GameplayCharacterState
  difficulty: GameplayDifficulty
  config?: DeathRewardConfig
}): GameplayDeathRewardCalculation {
  const config = params.config ?? elizaConfig.locationRooms.gameplay.deathRewards
  const counters = normalizedCounters(params.character.performance)

  const combat = Math.min(30, counters.damageDealt * 2 + counters.successfulAttacks * 4)
  const assist = Math.min(20, counters.successfulHelps * 6 + counters.successfulDefends * 3)
  const survival = Math.min(20, counters.roundsSurvived * 2)
  const objective = Math.min(15, counters.objectiveContributions * 5)
  const noncombat = Math.min(10, counters.successfulNoncombatActions * 4)
  const critical = Math.min(10, counters.criticalSuccesses * 5) - Math.min(10, counters.criticalFailures * 5)
  const penalty = Math.min(15, counters.fledCount * 10)
  const rawScore = combat + assist + survival + objective + noncombat + critical - penalty
  const difficultyMultiplier = config.difficultyMultipliers[params.difficulty] ?? 1
  const finalScore = clamp(Math.round(rawScore * difficultyMultiplier), 0, 100)

  const scoreBreakdown: GameplayRewardClaimScoreBreakdown = {
    combat,
    assist,
    survival,
    objective,
    noncombat,
    critical,
    penalty,
    rawScore,
    difficultyMultiplier,
    finalScore,
    counters,
  }

  const pointsAmount = clamp(Math.round(finalScore * config.pointsMultiplier), 0, config.pointsCap)
  const lineItems: GameplayRewardClaimLineItem[] = [
    { assetType: 'gameplay_reward_points', amount: pointsAmount },
  ]

  const tier = [...config.concordEntitlementTiers]
    .filter((candidate) => finalScore >= candidate.minScore)
    .sort((a, b) => b.minScore - a.minScore)[0]

  if (tier) {
    lineItems.push({
      assetType: 'erc1155_concord_entitlement',
      chainId: tier.chainId,
      contractAddress: tier.contractAddress,
      concordId: tier.concordId,
      amount: tier.amount,
    })
  }

  return {
    policyVersion: config.policyVersion,
    performanceScore: finalScore,
    scoreBreakdown,
    lineItems,
  }
}
