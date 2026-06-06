import type {
  LocationRoomAdventureDecision,
  LocationRoomDeclaredAction,
  LocationRoomSpatialContext,
} from './narrativeTypes'
import type {
  GameplayCheckType,
  GameplayContextualCheckOption,
  GameplayRollChoiceSource,
  GameplayRunStatus,
} from './gameplay/types'
import type {
  NormalizedSceneCheckProposal,
  NormalizedSceneCheckRequest,
} from './sceneChecks/types'

export type LocationRoomTriggerType = 'scheduled' | 'owner' | 'admin'
export type LocationRoomTickStatus = 'pending' | 'processing' | 'completed' | 'skipped' | 'failed' | 'dead'
export type LocationRoomMessageVisibility = 'public' | 'internal'
export type LocationRoomAuthorKind = 'agent' | 'system' | 'wallet' | 'admin' | 'scheduler' | 'game_master'

export const LOCATION_ROOM_TTRPG_PHASES = ['story', 'exploration', 'threat', 'combat', 'aftermath'] as const
export type LocationRoomTtrpgPhase = typeof LOCATION_ROOM_TTRPG_PHASES[number]

export const LOCATION_ROOM_COMBAT_READINESS_VALUES = ['none', 'foreshadow', 'ready'] as const
export type LocationRoomCombatReadiness = typeof LOCATION_ROOM_COMBAT_READINESS_VALUES[number]

export const LOCATION_ROOM_TURN_INTENTS = ['auto', 'story', 'combat'] as const
export type LocationRoomTurnIntent = typeof LOCATION_ROOM_TURN_INTENTS[number]

export const LOCATION_ROOM_MESSAGE_DOMAINS = ['narrative', 'combat'] as const
export type LocationRoomMessageDomain = typeof LOCATION_ROOM_MESSAGE_DOMAINS[number]

export const LOCATION_ROOM_MESSAGE_KINDS = [
  'gm_beat',
  'character_reaction',
  'gm_setup',
  'character_action',
  'roll_card',
  'gm_outcome',
] as const
export type LocationRoomMessageKind = typeof LOCATION_ROOM_MESSAGE_KINDS[number]

export type LocationRoomRequestedGameplayAction = 'start_combat'

export const LOCATION_ROOM_ENCOUNTER_SEED_SOURCES = ['gm', 'location_catalog', 'fallback', 'admin'] as const
export type LocationRoomEncounterSeedSource = typeof LOCATION_ROOM_ENCOUNTER_SEED_SOURCES[number]

export const LOCATION_ROOM_SCENE_CHECK_ESCALATION_DECISIONS = ['none', 'danger', 'combat_ready'] as const
export type LocationRoomSceneCheckEscalationDecision = typeof LOCATION_ROOM_SCENE_CHECK_ESCALATION_DECISIONS[number]

export const LOCATION_ROOM_SCENE_CHECK_DANGER_KINDS = [
  'trap',
  'hazard',
  'pursuit',
  'social_threat',
  'monster_pressure',
  'environment',
  'unknown',
] as const
export type LocationRoomSceneCheckDangerKind = typeof LOCATION_ROOM_SCENE_CHECK_DANGER_KINDS[number]

export type LocationRoomEncounterSeed = {
  title?: string | null
  summary?: string | null
  stakes?: string | null
  source?: LocationRoomEncounterSeedSource | null
  catalogEntryIds?: string[]
  encounterHints?: string[]
  monsterHints?: string[]
}

export type LocationRoomSceneCheckEscalation = {
  decision: LocationRoomSceneCheckEscalationDecision
  dangerKind: LocationRoomSceneCheckDangerKind
  reason: string | null
  threatLevel?: number | null
  encounterSeed?: LocationRoomEncounterSeed | null
  catalogEntryIds?: string[]
}

export type LocationRoom = {
  id: string
  locationId: string
  officialRoomId: string
  officialWorldId: string
  officialUserId: string
  channelId: string
  tickEnabled: boolean
  lastTickAt: string | null
  nextTickAt: string | null
  tickCount: number
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export type LocationRoomMessage = {
  id: string
  roomId: string
  locationId: string
  tickId: string | null
  sequence: number
  visibility: LocationRoomMessageVisibility
  authorKind: LocationRoomAuthorKind
  tokenId: number | null
  officialAgentId: string | null
  authorName: string
  content: string
  metadata: Record<string, unknown>
  createdAt: string
}

export type LocationRoomTick = {
  id: string
  roomId: string
  locationId: string
  gameplayRunId: string | null
  turnIntent: LocationRoomTurnIntent
  triggerType: LocationRoomTriggerType
  requestedByWallet: string | null
  requestedByTokenId: number | null
  status: LocationRoomTickStatus
  attempts: number
  nextAttemptAt: string
  lockedAt: string | null
  lockedBy: string | null
  selectedTokenId: number | null
  startedAt: string | null
  completedAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export type LocationRoomLocation = {
  id: string
  name: string
}

export type LocationRoomLocationDetails = LocationRoomLocation & {
  chainLocationId: string | null
  active: boolean | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type LocationRoomPublicMessageStats = {
  messageCount: number
  latestSequence: number | null
  latestCreatedAt: string | null
}

export type LocationRoomPublicAuthorMessageStats = {
  messageCount: number
  gameMasterMessageCount: number
  agentMessageCount: number
  latestGameMasterMessageCreatedAt: string | null
  latestAgentMessageCreatedAt: string | null
}

export type LocationRoomParticipant = {
  tokenId: number
  name: string
  imageUrl: string | null
  backgroundStory: string | null
  ownerAddress: string | null
  stakerAddress: string | null
  locationId: string
  /** Public-safe static sheet data sourced from character rows; never include raw equipment/mechanics here. */
  characterClass?: string | null
  level?: number | null
  coreStats?: PublicLocationRoomCoreStats | null
  maxHp?: number | null
  ac?: number | null
  speed?: number | null
}

export type PublicLocationRoomCoreStats = {
  strength: number | null
  dexterity: number | null
  constitution: number | null
  intelligence: number | null
  wisdom: number | null
  charisma: number | null
}

export type PublicLocationRoomParticipant = {
  tokenId: number
  name: string
  imageUrl: string | null
  /** Public static sheet data only; never include owner/staker wallets or private backstory here. */
  characterClass?: string | null
  level?: number | null
  coreStats?: PublicLocationRoomCoreStats | null
  maxHp?: number | null
  ac?: number | null
  speed?: number | null
}

export type PublicLocationRoomGameplayMessageKind = 'gm_setup' | 'character_action' | 'roll_card' | 'gm_outcome'
export type PublicLocationRoomGameplayRollDie = {
  formula: string | null
  total: number | null
}

export type PublicLocationRoomGameplayRollActor = {
  kind: 'character' | 'monster' | 'game_master' | 'unknown'
  id: string | null
  tokenId?: number | null
  name: string | null
}

export type PublicLocationRoomGameplayRollTarget = {
  kind: 'character' | 'monster' | 'environment' | 'unknown'
  id: string | null
  tokenId?: number | null
  name: string | null
}

export type PublicLocationRoomRollContext = 'combat' | 'scene_check'

export type PublicLocationRoomSceneCheckRollMetadata = {
  sceneCheckId?: string | null
  actionIntent?: string | null
  requestSource?: string | null
  adjudicationSource?: string | null
  adjudicationReason?: string | null
}

export type PublicLocationRoomGameplayActionRoll = {
  actionType: string
  checkType?: GameplayCheckType | string
  checkLabel?: string
  checkSource?: GameplayRollChoiceSource | string
  contextualCheckId?: string | null
  actor: PublicLocationRoomGameplayRollActor
  target: PublicLocationRoomGameplayRollTarget | null
  roll: PublicLocationRoomGameplayRollDie | null
  modifier: number | null
  total: number | null
  dc: number | null
  tier: 'critical_success' | 'success' | 'partial_success' | 'failure' | 'critical_failure' | 'unknown'
  outcome: 'critical_success' | 'success' | 'partial_success' | 'failure' | 'critical_failure' | 'unknown'
}

export type PublicLocationRoomGameplayRollEffect = {
  kind: 'damage' | 'healing' | 'status' | 'narrative'
  target: PublicLocationRoomGameplayRollTarget | null
  amount: number | null
  status: string | null
  summary: string
}

export type PublicLocationRoomGameplayRetaliation = {
  actor: PublicLocationRoomGameplayRollActor
  target: PublicLocationRoomGameplayRollTarget | null
  attackRoll: PublicLocationRoomGameplayRollDie | null
  damageRoll: PublicLocationRoomGameplayRollDie | null
  targetAc: number | null
  hit: boolean | null
  amount: number | null
  summary: string
}

export type PublicLocationRoomGameplayDeath = {
  target: PublicLocationRoomGameplayRollTarget
  summary: string
}

/**
 * Public-safe structured roll summary for encounter UI.
 * Do not expose raw mechanics, modifier sources, mechanical deltas, full metadata, or exact private state here.
 */
export type PublicLocationRoomGameplayRolls = {
  /** Optional additive marker. Omitted by legacy combat roll cards for compatibility. */
  rollContext?: PublicLocationRoomRollContext
  sceneCheck?: PublicLocationRoomSceneCheckRollMetadata | null
  action: PublicLocationRoomGameplayActionRoll
  publicEffects: PublicLocationRoomGameplayRollEffect[]
  retaliation?: PublicLocationRoomGameplayRetaliation | null
  deaths: PublicLocationRoomGameplayDeath[]
  encounterStatusAfter: 'active' | 'victory' | 'defeat' | 'fled' | 'abandoned' | 'unknown'
}

export type PublicLocationRoomAdventureDecisionOption = {
  id: string
  label: string
  summary?: string | null
}

export type PublicLocationRoomAdventureDecision = {
  id: string
  prompt: string
  options: PublicLocationRoomAdventureDecisionOption[]
  selectedOptionId?: string | null
  selectedOptionLabel?: string | null
}

export type PublicLocationRoomAdventureDeclaredAction = {
  tokenId?: number | null
  summary: string
  chosenOptionId?: string | null
  chosenOptionLabel?: string | null
  actionIntent?: string | null
}

export type PublicLocationRoomAdventureConsequence = {
  summary: string
  status?: 'open' | 'resolved' | 'advantage' | 'complication'
  tier?: 'critical_success' | 'success' | 'partial_success' | 'failure' | 'critical_failure' | 'unknown' | null
}

export type PublicLocationRoomAdventureClock = {
  id: string
  label: string
  value: number
  max: number
  summary: string
}

export type PublicLocationRoomAdventure = {
  stakes?: string | null
  activeDecision?: PublicLocationRoomAdventureDecision | null
  declaredAction?: PublicLocationRoomAdventureDeclaredAction | null
  consequence?: PublicLocationRoomAdventureConsequence | null
  clocks?: PublicLocationRoomAdventureClock[]
}

export type PublicLocationRoomMessage = {
  id: string
  sequence: number
  authorKind: LocationRoomAuthorKind
  tokenId: number | null
  authorName: string
  content: string
  createdAt: string
  messageDomain?: LocationRoomMessageDomain
  messageKind?: LocationRoomMessageKind
  ttrpgPhase?: LocationRoomTtrpgPhase
  gameplayMessageKind?: PublicLocationRoomGameplayMessageKind
  gameplayRolls?: PublicLocationRoomGameplayRolls
  adventure?: PublicLocationRoomAdventure
}

export type PublicGameplayStatusBand = 'healthy' | 'injured' | 'critical' | 'down' | 'dead' | 'fled' | 'unknown'

export type PublicLocationRoomGameplaySummary = {
  mode: 'enabled' | 'disabled'
  status: 'idle' | 'active_encounter' | 'aftermath'
  encounter: {
    publicTitle: string | null
    publicSummary: string | null
    status: 'active' | 'victory' | 'defeat' | 'fled' | 'abandoned'
    round: number
  } | null
  characters: Array<{
    tokenId: number
    name: string | null
    status: 'alive' | 'downed' | 'dead' | 'fled'
    hpBand: PublicGameplayStatusBand
  }>
  monsters: Array<{
    id: string
    name: string
    archetype: string
    status: 'alive' | 'dead'
    hpBand: PublicGameplayStatusBand
  }>
  pendingRewardSummary: {
    victoryText: string | null
    temporaryBoons: string[]
    narrativeRewards: string[]
  } | null
}

export type PublicLocationRoomSummary = {
  id: string
  locationId: string
  locationName: string
  tickEnabled: boolean
  lastTickAt: string | null
  nextTickAt: string | null
  tickCount: number
  createdAt: string
  updatedAt: string
}

export type PublicLocationRoomTtrpgSummary = {
  phase: LocationRoomTtrpgPhase
  combatReadiness: LocationRoomCombatReadiness
  threatLevel: number | null
}

export type PublicLocationRoomIdentity = {
  requestedLocationId: string
  canonicalLocationId: string
  canonicalLocationName: string
  isAlias: boolean
}

export type PublicLocationRoomActivity = {
  generatedAt: string
  messageCount: number
  latestSequence: number | null
  latestMessageCreatedAt: string | null
  /** Optional lightweight counters; omit rather than adding heavy public queries. */
  lastTickAt?: string | null
  tickCount?: number | null
  completedTurnCount?: number | null
  targetTurnCount?: number | null
}

export type PublicLocationRoomRead = {
  room: PublicLocationRoomSummary
  /** Public-safe location identity/freshness metadata; no wallet or private room internals. */
  identity?: PublicLocationRoomIdentity
  activity?: PublicLocationRoomActivity
  participants: PublicLocationRoomParticipant[]
  messages: PublicLocationRoomMessage[]
  ttrpg?: PublicLocationRoomTtrpgSummary
  gameplay?: PublicLocationRoomGameplaySummary
  pagination: {
    page: number
    pageSize: number
    total: number
    hasMore: boolean
  }
}

export type PaginatedLocationRoomMessages = {
  messages: LocationRoomMessage[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export type EnqueueScheduledTicksResult = {
  roomsChecked: number
  enqueued: number
  deduped: number
}

export type LocationRoomGameplayRunSummary = {
  id: string
  status: GameplayRunStatus
  targetCompletedTurns: number
  completedTurns: number
  remainingTurns: number
  reused?: boolean
  stopReason?: string | null
}

export type ProcessLocationRoomTickResult = {
  tickId: string
  gameplayRunId?: string | null
  status: Extract<LocationRoomTickStatus, 'completed' | 'skipped' | 'failed' | 'dead'>
  selectedTokenId: number | null
  /** Final public message appended for this tick. */
  messageId?: string
  /** Scene-check subflow public message ids when present, in append/order order. */
  messageIds?: string[]
  /** Durable scene-check id when a narrative scene check resolved during this tick. */
  sceneCheckId?: string | null
  /** True when this tick appended a public Game Master narrative beat before character/roll output. */
  publicGameMasterBeatAppended?: boolean
  reason?: string
  gameplayRun?: LocationRoomGameplayRunSummary
}

export type LocationRoomWorkerRunCounters = {
  inspected: number
  enqueued: number
  blocked: number
  updated: number
  completed: number
  stopped: number
  failed: number
}

export type LocationRoomWorkerResult = {
  enabled: boolean
  enqueued: number
  deduped: number
  processed: number
  completed: number
  skipped: number
  failed: number
  dead: number
  gameplayRuns: LocationRoomWorkerRunCounters
  results: ProcessLocationRoomTickResult[]
}

export type RequestLocationRoomTickActor = 'owner' | 'admin'

export type RequestLocationRoomTickInput = {
  actor: RequestLocationRoomTickActor
  walletAddress: string
  intent?: LocationRoomTurnIntent
  now?: Date
}

export type RequestLocationRoomTickResult = {
  roomId: string
  locationId: string
  tickId: string | null
  triggerType: Extract<LocationRoomTriggerType, 'owner' | 'admin'>
  turnIntent: LocationRoomTurnIntent
  deduped: boolean
  requestedByTokenId: number | null
  participantCount: number
  gameplayRun?: LocationRoomGameplayRunSummary
}

export type RequestLocationRoomTickProcessingStatus =
  | 'completed'
  | 'skipped'
  | 'failed'
  | 'dead'
  | 'already_processing'
  | 'not_claimable'

export type RequestLocationRoomTickProcessingSummary = {
  attempted: boolean
  status: RequestLocationRoomTickProcessingStatus
  tickId: string | null
  result?: ProcessLocationRoomTickResult
  reason?: string
}

export type RequestLocationRoomTickAndProcessResult = RequestLocationRoomTickResult & {
  processing: RequestLocationRoomTickProcessingSummary
}

export type LocationRoomNarrativeTurnSceneCheckContext = {
  mode: 'optional' | 'requested'
  request: NormalizedSceneCheckRequest | null
  contextualChecks: GameplayContextualCheckOption[]
}

export type LocationRoomNarrativeTurnContext = {
  stateSummary: string
  currentObjective: string | null
  openThreads: string[]
  speakerInstruction: string
  publicNarration?: string | null
  activeDecision?: LocationRoomAdventureDecision | null
  spatialContext?: LocationRoomSpatialContext
  sceneCheck?: LocationRoomNarrativeTurnSceneCheckContext | null
}

export type GenerateOfficialLocationRoomTurnInput = {
  room: LocationRoom
  speaker: LocationRoomParticipant
  participants: LocationRoomParticipant[]
  recentMessages: LocationRoomMessage[]
  narrativeContext?: LocationRoomNarrativeTurnContext
}

export type LocationRoomGenerationStatus = 'accepted' | 'repaired' | 'repair_failed'

export type LocationRoomGenerationResponseFlags = {
  empty: boolean
  hasJsonObject: boolean
  fencedJson: boolean
  startsWithJsonObject: boolean
}

export type LocationRoomPublicGenerationDiagnostics = {
  status: LocationRoomGenerationStatus
  repairAttempted: boolean
  repaired: boolean
  initialErrorCategory?: string
  repairErrorCategory?: string
  initialErrorMessage?: string
  repairErrorMessage?: string
  transportStage?: string
  initialResponseLength?: number
  repairResponseLength?: number
  initialResponseFlags?: LocationRoomGenerationResponseFlags
  repairResponseFlags?: LocationRoomGenerationResponseFlags
}

export type OfficialLocationRoomDeclaredActionSource = 'structured_model' | 'unstructured_model'

export type GenerateOfficialLocationRoomTurnResult = {
  officialAgentId: string
  content: string
  declaredAction?: LocationRoomDeclaredAction | null
  declaredActionSource?: OfficialLocationRoomDeclaredActionSource | null
  sceneCheckProposal?: NormalizedSceneCheckProposal | null
  sceneCheckProposalError?: string | null
  turnGeneration?: LocationRoomPublicGenerationDiagnostics
}
