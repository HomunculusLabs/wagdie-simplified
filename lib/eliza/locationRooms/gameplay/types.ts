import type { ElizaLocationRoomGameplayDifficulty } from '@/lib/eliza/config'
import type { Equipment, NFTAttribute } from '@/types/character'
import type { LocationRoom, LocationRoomTick } from '../types'

export const GAMEPLAY_ROOM_STATUSES = ['idle', 'active_encounter', 'aftermath'] as const
export const GAMEPLAY_ENCOUNTER_STATUSES = ['active', 'victory', 'defeat', 'fled', 'abandoned'] as const
export const GAMEPLAY_TURN_STATUSES = ['planned', 'action_recorded', 'resolved', 'completed', 'failed', 'dead'] as const
export const GAMEPLAY_DEATH_REVIEW_STATUSES = ['pending', 'rejected', 'gameplay_only', 'finality_approved'] as const
export const GAMEPLAY_DEATH_STATUSES = ['dead', 'restored'] as const
export const GAMEPLAY_BURN_SYNC_STATUSES = ['not_applicable', 'pending', 'synced', 'failed'] as const
export const GAMEPLAY_REWARD_CLAIM_STATUSES = ['pending_review', 'released', 'rejected', 'voided'] as const
export const GAMEPLAY_REWARD_CLAIM_BENEFICIARY_SOURCES = ['staker_address', 'owner_address'] as const
export const GAMEPLAY_RUN_STATUSES = ['active', 'completed', 'stopped', 'failed'] as const
export const GAMEPLAY_RUN_STARTED_BY_ACTORS = ['owner', 'admin', 'scheduler', 'system'] as const
export const GAMEPLAY_ACTION_TYPES = ['attack', 'defend', 'help', 'investigate', 'negotiate', 'flee', 'rest'] as const

export type GameplayRoomStatus = typeof GAMEPLAY_ROOM_STATUSES[number]
export type GameplayEncounterStatus = typeof GAMEPLAY_ENCOUNTER_STATUSES[number]
export type GameplayTurnStatus = typeof GAMEPLAY_TURN_STATUSES[number]
export type GameplayDeathReviewStatus = typeof GAMEPLAY_DEATH_REVIEW_STATUSES[number]
export type GameplayDeathStatus = typeof GAMEPLAY_DEATH_STATUSES[number]
export type GameplayBurnSyncStatus = typeof GAMEPLAY_BURN_SYNC_STATUSES[number]
export type GameplayRewardClaimStatus = typeof GAMEPLAY_REWARD_CLAIM_STATUSES[number]
export type GameplayRewardClaimBeneficiarySource = typeof GAMEPLAY_REWARD_CLAIM_BENEFICIARY_SOURCES[number]
export type GameplayRunStatus = typeof GAMEPLAY_RUN_STATUSES[number]
export type GameplayRunStartedByActor = typeof GAMEPLAY_RUN_STARTED_BY_ACTORS[number]
export type GameplayActionType = typeof GAMEPLAY_ACTION_TYPES[number]
export type GameplayDifficulty = ElizaLocationRoomGameplayDifficulty

export type GameplayCharacterStatus = 'alive' | 'downed' | 'dead' | 'fled'

export type GameplayCoreStatKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'
export type GameplayEffectiveStatKey = GameplayCoreStatKey | 'maxHp' | 'ac' | 'speed'
export type GameplayModifierTarget = GameplayEffectiveStatKey | GameplayActionType
export type GameplayPerformanceCounterKey = keyof GameplayPerformanceCounters
export type GameplayModifierSourceKind = 'equipment' | 'nft_trait' | 'concord_effect' | 'concord_allowlist'

export type GameplaySourceStats = {
  str: number
  dex: number
  con: number
  int: number
  wis: number
  cha: number
  hp: number
  maxHp: number
  ac: number
  speed: number
  level: number
  experience: number
}

export type GameplayEffectiveStats = Omit<GameplaySourceStats, 'hp'>

export type GameplayModifierSource = {
  source: GameplayModifierSourceKind
  key: string
  target: GameplayModifierTarget
  value: number
  label: string
  capped?: boolean
}

export type GameplayRollModifierBreakdown = {
  mode: 'legacy_fixed' | 'stat_aware'
  actionType: GameplayActionType
  primaryStats: GameplayCoreStatKey[]
  primaryStatValue: number | null
  statModifier: number
  nonStatModifier: number
  legacyModifier: number
  totalModifier: number
  modifierSources: GameplayModifierSource[]
}

export type GameplayStatContribution = {
  source: 'stat'
  stat: GameplayCoreStatKey
  statValue: number
  modifier: number
  applied: number
  capped?: boolean
}

export type GameplayPerformanceCounters = {
  roundsActed: number
  roundsSurvived: number
  damageDealt: number
  damageTaken: number
  successfulAttacks: number
  successfulDefends: number
  successfulHelps: number
  successfulNoncombatActions: number
  objectiveContributions: number
  criticalSuccesses: number
  criticalFailures: number
  fledCount: number
}

export type GameplayEquipmentSnapshot = Equipment | null

export type GameplayCharacterSheetSnapshot = {
  tokenId: number
  name?: string | null
  sourceStats: GameplaySourceStats
  effectiveStats: GameplayEffectiveStats
  equipmentSnapshot: GameplayEquipmentSnapshot
  metadataTraits: NFTAttribute[]
  modifierSources: GameplayModifierSource[]
  sheetSnapshotAt: string
  ownerAddress?: string | null
  stakerAddress?: string | null
}

export type GameplayPerformanceCounterDelta = Partial<Record<GameplayPerformanceCounterKey, number>>

export type GameplayPerformanceCounterUpdate = {
  tokenId: number
  before: GameplayPerformanceCounters
  delta: GameplayPerformanceCounterDelta
  after: GameplayPerformanceCounters
}

export const DEFAULT_GAMEPLAY_PERFORMANCE_COUNTERS: GameplayPerformanceCounters = {
  roundsActed: 0,
  roundsSurvived: 0,
  damageDealt: 0,
  damageTaken: 0,
  successfulAttacks: 0,
  successfulDefends: 0,
  successfulHelps: 0,
  successfulNoncombatActions: 0,
  objectiveContributions: 0,
  criticalSuccesses: 0,
  criticalFailures: 0,
  fledCount: 0,
}

export function defaultGameplayPerformanceCounters(): GameplayPerformanceCounters {
  return { ...DEFAULT_GAMEPLAY_PERFORMANCE_COUNTERS }
}

export type GameplayCharacterState = {
  tokenId: number
  name?: string | null
  hp: number
  maxHp: number
  status: GameplayCharacterStatus
  xp: number
  temporaryBoons: string[]
  wounds: string[]
  sourceStats?: GameplaySourceStats
  effectiveStats?: GameplayEffectiveStats
  equipmentSnapshot?: GameplayEquipmentSnapshot
  metadataTraits?: NFTAttribute[]
  modifierSources?: GameplayModifierSource[]
  sheetSnapshotAt?: string | null
  ownerAddress?: string | null
  stakerAddress?: string | null
  performance?: GameplayPerformanceCounters
  updatedAt?: string | null
}

export type GameplayRewardClaimLineItem =
  | { assetType: 'gameplay_reward_points'; amount: number }
  | {
      assetType: 'erc1155_concord_entitlement'
      chainId: number
      contractAddress: string
      concordId: number
      amount: number
    }

export type GameplayRewardClaimScoreBreakdown = {
  combat: number
  assist: number
  survival: number
  objective: number
  noncombat: number
  critical: number
  penalty: number
  rawScore: number
  difficultyMultiplier: number
  finalScore: number
  counters: GameplayPerformanceCounters
}

export type GameplayRewardClaimSummary = {
  id: string
  deathReviewId: string
  status: GameplayRewardClaimStatus
  beneficiaryWallet: string
  beneficiarySource: GameplayRewardClaimBeneficiarySource
  tokenId: number
  performanceScore: number
  scoreBreakdown: GameplayRewardClaimScoreBreakdown
  lineItems: GameplayRewardClaimLineItem[]
  policyVersion: string
  releaseAdminWallet: string | null
  releasedAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export type GameplayRewardClaim = GameplayRewardClaimSummary & {
  roomId: string
  locationId: string
  encounterId: string
  turnId: string | null
  metadata: Record<string, unknown>
}

export type GameplayRun = {
  id: string
  roomId: string
  locationId: string
  status: GameplayRunStatus
  targetCompletedTurns: number
  completedTurns: number
  startedByActor: GameplayRunStartedByActor
  startedByWallet: string | null
  startedByTokenId: number | null
  lastTickId: string | null
  lastAdvancedAt: string | null
  completedAt: string | null
  stopReason: string | null
  lastError: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type GameplayCharacterStateMap = Record<string, GameplayCharacterState>

export type GameplayMonsterState = {
  id: string
  name: string
  archetype: string
  hp: number
  maxHp: number
  ac: number
  attackBonus: number
  damageFormula: string
  status: 'alive' | 'dead'
  metadata?: Record<string, unknown>
}

export type GameplayRewardPlan = {
  xpPerCharacter: number
  temporaryBoons: string[]
  narrativeRewards: string[]
  victoryText: string | null
  metadata?: Record<string, unknown>
}

export type GameplayRoomState = {
  id: string
  roomId: string
  locationId: string
  status: GameplayRoomStatus
  activeEncounterId: string | null
  characters: GameplayCharacterStateMap
  rewards: Record<string, unknown>
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type GameplayEncounter = {
  id: string
  roomId: string
  locationId: string
  status: GameplayEncounterStatus
  difficulty: GameplayDifficulty
  roundNumber: number
  publicTitle: string | null
  publicSummary: string | null
  monsterState: unknown
  rewardPlan: unknown
  mechanics: Record<string, unknown>
  metadata: Record<string, unknown>
  lastError: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export type GameplayActionTarget =
  | { kind: 'monster'; id: string }
  | { kind: 'character'; tokenId: number }

export type GameplayActionEnvelope = {
  actionType: GameplayActionType
  target?: GameplayActionTarget | null
  publicSpeech: string
  intentSummary?: string | null
  metadata?: Record<string, unknown>
}

export type GameplayDieRoll = {
  sides: number
  value: number
}

export type GameplayDiceRollResult = {
  formula: string
  rolls: GameplayDieRoll[]
  total: number
}

export type GameplayTurn = {
  id: string
  roomId: string
  locationId: string
  tickId: string
  encounterId: string | null
  status: GameplayTurnStatus
  selectedTokenId: number | null
  action: Record<string, unknown>
  diceResults: GameplayDiceRollResult[]
  mechanicalDeltas: Record<string, unknown>
  publicMessageIds: string[]
  outcomeSummary: string | null
  metadata: Record<string, unknown>
  lastError: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export type GameplayDeathReview = {
  id: string
  roomId: string
  locationId: string
  encounterId: string
  turnId: string | null
  tokenId: number
  gameplayDeathStatus: GameplayDeathStatus
  reviewStatus: GameplayDeathReviewStatus
  adminWallet: string | null
  decidedAt: string | null
  burnSyncStatus: GameplayBurnSyncStatus
  context: Record<string, unknown>
  metadata: Record<string, unknown>
  lastError: string | null
  createdAt: string
  updatedAt: string
  rewardClaim?: GameplayRewardClaim | null
}

export type EnsureGameplayRoomStateInput = {
  room: Pick<LocationRoom, 'id' | 'locationId'>
  characters?: GameplayCharacterStateMap
  metadata?: Record<string, unknown>
}

export type CreateOrReuseGameplayRunInput = {
  room: Pick<LocationRoom, 'id' | 'locationId'>
  targetCompletedTurns: number
  startedByActor: GameplayRunStartedByActor
  startedByWallet?: string | null
  startedByTokenId?: number | null
  metadata?: Record<string, unknown>
}

export type CreateOrReuseGameplayRunResult = {
  run: GameplayRun
  reused: boolean
}

export type UpdateGameplayRunProgressInput = {
  completedTurns: number
  lastTickId?: string | null
  lastAdvancedAt?: string | null
  metadata?: Record<string, unknown>
}

export type MarkGameplayRunTerminalInput = {
  stopReason: string
  completedTurns?: number
  lastTickId?: string | null
  lastAdvancedAt?: string | null
  lastError?: string | null
  completedAt?: string | null
  metadata?: Record<string, unknown>
}

export type CreateGameplayEncounterInput = {
  room: Pick<LocationRoom, 'id' | 'locationId'>
  difficulty: GameplayDifficulty
  publicTitle?: string | null
  publicSummary?: string | null
  monsterState: unknown
  rewardPlan: unknown
  mechanics?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export type CreateOrReuseGameplayTurnInput = {
  room: Pick<LocationRoom, 'id' | 'locationId'>
  tick: Pick<LocationRoomTick, 'id'>
  encounterId?: string | null
  selectedTokenId?: number | null
  metadata?: Record<string, unknown>
}

export type UpdateGameplayRoomStateInput = Partial<{
  status: GameplayRoomStatus
  activeEncounterId: string | null
  characters: GameplayCharacterStateMap
  rewards: Record<string, unknown>
  metadata: Record<string, unknown>
}>

export type UpdateGameplayEncounterInput = Partial<{
  status: GameplayEncounterStatus
  difficulty: GameplayDifficulty
  roundNumber: number
  publicTitle: string | null
  publicSummary: string | null
  monsterState: unknown
  rewardPlan: unknown
  mechanics: Record<string, unknown>
  metadata: Record<string, unknown>
  lastError: string | null
  completedAt: string | null
}>

export type StoreGameplayTurnOutcomeInput = Partial<{
  status: GameplayTurnStatus
  selectedTokenId: number | null
  action: GameplayActionEnvelope | Record<string, unknown>
  diceResults: GameplayDiceRollResult[]
  mechanicalDeltas: Record<string, unknown>
  publicMessageIds: string[]
  outcomeSummary: string | null
  metadata: Record<string, unknown>
  completedAt: string | null
}>

export type CreatePendingDeathReviewInput = {
  room: Pick<LocationRoom, 'id' | 'locationId'>
  encounterId: string
  turnId?: string | null
  tokenId: number
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export type ListGameplayDeathReviewsInput = {
  reviewStatus?: GameplayDeathReviewStatus | 'all'
  locationId?: string | null
  limit?: number
}

export type UpdateGameplayDeathReviewInput = Partial<{
  gameplayDeathStatus: GameplayDeathStatus
  reviewStatus: GameplayDeathReviewStatus
  adminWallet: string | null
  decidedAt: string | null
  burnSyncStatus: GameplayBurnSyncStatus
  context: Record<string, unknown>
  metadata: Record<string, unknown>
  lastError: string | null
}>

export type CreateOrReuseRewardClaimInput = {
  deathReview: GameplayDeathReview
  beneficiaryWallet: string
  beneficiarySource: GameplayRewardClaimBeneficiarySource
  policyVersion: string
  performanceScore: number
  scoreBreakdown: GameplayRewardClaimScoreBreakdown
  lineItems: GameplayRewardClaimLineItem[]
  metadata?: Record<string, unknown>
}

export type ListGameplayRewardClaimsInput = {
  status?: GameplayRewardClaimStatus | 'all'
  locationId?: string | null
  roomId?: string | null
  tokenId?: number | null
  deathReviewId?: string | null
  deathReviewIds?: string[]
  turnIds?: string[]
  limit?: number
}

export type UpdateGameplayRewardClaimStatusInput = {
  status: GameplayRewardClaimStatus
  releaseAdminWallet?: string | null
  releasedAt?: string | null
  metadata?: Record<string, unknown>
  lastError?: string | null
}
