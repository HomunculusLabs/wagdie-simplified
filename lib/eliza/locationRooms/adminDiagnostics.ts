import { elizaConfig } from '@/lib/eliza/config'
import { normalizeLocationAdventureCatalog } from '@/lib/domain/location/metadata'
import { LOCATION_ADVENTURE_CATALOG_SECTIONS } from '@/lib/domain/location/metadata-types'
import type { LocationAdventureCatalogSection, NormalizedLocationAdventureCatalog } from '@/lib/domain/location/metadata-types'
import {
  gameMasterAgentService,
  type GameMasterAgentResolution,
} from '@/lib/eliza/gameMasterAgent/service'
import {
  locationRoomRepository,
  type LocationRoomRepository,
} from './repository'
import {
  locationRoomMembershipRepository,
  type LocationRoomMembershipRepository,
} from './membership'
import {
  locationRoomNarrativeRepository,
  type LocationRoomNarrativeRepository,
} from './narrativeRepository'
import {
  locationRoomGameplayRepository,
  type LocationRoomGameplayRepository,
} from './gameplay/repository'
import {
  LOCATION_ROOM_TURN_INTENTS,
  type LocationRoom,
  type LocationRoomLocationDetails,
  type LocationRoomParticipant,
  type LocationRoomTick,
  type LocationRoomTurnIntent,
} from './types'
import {
  normalizeNarrativeOpenThreads,
  normalizeNarrativeTtrpgMetadata,
  type LocationRoomNarrativeBeat,
  type LocationRoomNarrativeState,
} from './narrativeTypes'
import { visibleSceneCheckEscalationCatalogEntries } from './encounterEscalation'
import type { GameMasterGenerationDiagnostics } from './gameMasterGenerator'
import type { GameplayRun } from './gameplay/types'

export type LocationRoomRecommendedNextAction =
  | 'healthy'
  | 'location_not_found'
  | 'use_canonical_location_11'
  | 'enable_location_rooms'
  | 'configure_official_elizaos'
  | 'configure_game_master'
  | 'stake_or_sync_participants'
  | 'enable_room_ticks'
  | 'trigger_location_room_tick'
  | 'run_location_room_worker'
  | 'inspect_failed_tick'
  | 'inspect_gm_repair_failure'
  | 'wait_for_retry'
  | 'wait_for_cadence'
  | 'missing_trigger_readiness'
  | 'missing_location_adventure_catalog'
  | 'combat_ready_pending_auto_tick'
  | 'missing_public_game_master_message'
  | 'wait_for_next_tick'

export type LocationRoomHealthDiagnostics = {
  generatedAt: string
  location: {
    id: string
    name: string | null
    chainLocationId: string | null
    active: boolean | null
    exists: boolean
  }
  canonical: {
    requestedLocationId: string
    canonicalLocationId: string | null
    isCanonical: boolean
    hints: string[]
  }
  config: {
    locationRoomsEnabled: boolean
    officialElizaOsConfigured: boolean
    narrativeEnabled: boolean
    gameplayEnabledForLocation: boolean
    tickIntervalMinutes: number
    maxTicksPerRun: number
  }
  gmReadiness: {
    required: boolean
    ready: boolean
    source: GameMasterAgentResolution['source']
    officialAgentId: string | null
    safeError: string | null
  }
  participants: {
    count: number
    minimumRequired: number
    sample: Array<{ tokenId: number; name: string }>
  }
  room: {
    exists: boolean
    id: string | null
    tickEnabled: boolean | null
    lastTickAt: string | null
    nextTickAt: string | null
    tickCount: number | null
    lastError: string | null
    createdAt: string | null
    updatedAt: string | null
  }
  ticks: {
    active: LocationRoomHealthTickSummary[]
    recent: LocationRoomHealthTickSummary[]
  }
  durableIntent: {
    active: LocationRoomHealthIntentTickSummary[]
    recent: LocationRoomHealthIntentTickSummary[]
    activeCounts: Record<LocationRoomTurnIntent, number>
    recentCounts: Record<LocationRoomTurnIntent, number>
    latestActiveIntent: LocationRoomTurnIntent | null
    latestRecentIntent: LocationRoomTurnIntent | null
  }
  retryCadence: {
    activeTickCount: number
    dueActiveTickId: string | null
    dueActiveTickStatus: LocationRoomTick['status'] | null
    failedTickId: string | null
    failedTickNextAttemptAt: string | null
    failedTickRetryDue: boolean | null
    failedTickNotDue: boolean
    nextTickAt: string | null
    nextTickDue: boolean | null
    minutesUntilNextTick: number | null
    tickIntervalMinutes: number
    normalCadenceWait: boolean
  }
  publicTranscript: {
    messageCount: number
    latestSequence: number | null
    latestCreatedAt: string | null
    gameMasterMessageCount: number
    agentMessageCount: number
    latestGameMasterMessageCreatedAt: string | null
    latestAgentMessageCreatedAt: string | null
  }
  narrative: {
    enabled: boolean
    link: string | null
    stateExists: boolean
    stateUpdatedAt: string | null
    currentObjective: string | null
    latestBeat: {
      status: string
      selectedTokenId: number | null
      completedAt: string | null
      lastError: string | null
      publicNarrationPresent: boolean
    } | null
  }
  narrativeVisibility: {
    latestBeatPublicNarrationPresent: boolean | null
    publicGameMasterMessageCount: number
    publicAgentMessageCount: number
    completedBeatWithoutPublicGameMasterMessage: boolean
    blocker: 'missing_public_game_master_message' | null
  }
  gmGeneration: LocationRoomHealthGameMasterGenerationSummary
  adventureCatalog: {
    source: 'narrative_state' | 'location_metadata' | 'missing'
    sectionCounts: Record<LocationAdventureCatalogSection, number>
    visibleEncounterCount: number
    visibleMonsterCount: number
    hasVisibleCombatCatalog: boolean
    narrativeStateCatalogPresent: boolean
    locationCatalogPresent: boolean
  }
  triggerReadiness: {
    stateExists: boolean
    currentObjective: string | null
    openThreadCount: number
    ttrpgPhase: ReturnType<typeof normalizeNarrativeTtrpgMetadata>['ttrpgPhase']
    combatReadiness: ReturnType<typeof normalizeNarrativeTtrpgMetadata>['combatReadiness']
    threatLevel: number | null
    requestedGameplayAction: ReturnType<typeof normalizeNarrativeTtrpgMetadata>['requestedGameplayAction']
    triggerId: string | null
    consumedTriggerId: string | null
    triggerConsumed: boolean
    hasUnconsumedTrigger: boolean
    encounterSeedPresent: boolean
    encounterSeedSource: string | null
    encounterSeedCatalogBacked: boolean
    encounterSeedCatalogEntryIds: string[]
    encounterSeedEncounterHintCount: number
    encounterSeedMonsterHintCount: number
    gameplayEnabled: boolean
    gameplayStateStatus: string | null
    activeEncounterStatus: string | null
    blockers: LocationRoomTriggerReadinessBlocker[]
  }
  promotion: {
    eligible: boolean
    blocker: LocationRoomCombatPromotionBlocker | null
    sourceBeatId: string | null
    lastCombatReadyBeatId: string | null
    lastCombatReadySceneCheckId: string | null
    lastCombatReadyAt: string | null
    lastPromotionBeatId: string | null
    lastPromotionTickId: string | null
    lastPromotionAt: string | null
  }
  gameplay: {
    enabled: boolean
    link: string | null
    stateStatus: string | null
    activeEncounterStatus: string | null
    recentTurnCount: number
    latestTurnStatus: string | null
    rewardClaimCount: number
    activeRun: LocationRoomHealthGameplayRunSummary | null
    recentRuns: LocationRoomHealthGameplayRunSummary[]
  }
  recommendedNextAction: LocationRoomRecommendedNextAction
}

type LocationRoomHealthGameplayRunSummary = {
  id: string
  status: GameplayRun['status']
  targetCompletedTurns: number
  completedTurns: number
  remainingTurns: number
  startedByActor: GameplayRun['startedByActor']
  startedByTokenId: number | null
  lastTickId: string | null
  lastAdvancedAt: string | null
  completedAt: string | null
  stopReason: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

type LocationRoomHealthTickSummary = {
  id: string
  status: LocationRoomTick['status']
  attempts: number
  turnIntent: LocationRoomTick['turnIntent']
  triggerType: LocationRoomTick['triggerType']
  selectedTokenId: number | null
  nextAttemptAt: string
  startedAt: string | null
  completedAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

type LocationRoomHealthIntentTickSummary = {
  id: string
  status: LocationRoomTick['status']
  turnIntent: LocationRoomTick['turnIntent']
  triggerType: LocationRoomTick['triggerType']
  nextAttemptAt: string
  completedAt: string | null
}

type LocationRoomHealthGameMasterGenerationSummary = {
  latestBeatStatus: LocationRoomNarrativeBeat['status'] | null
  status: GameMasterGenerationDiagnostics['status'] | 'not_available'
  repairAttempted: boolean
  repaired: boolean
  fallbackUsed: boolean
  recoveries: string[]
  initialErrorCategory: string | null
  repairErrorCategory: string | null
  transportStage: string | null
  initialResponseLength: number | null
  repairResponseLength: number | null
  safeError: string | null
  recentAcceptedCount: number
  recentRepairedCount: number
  recentRepairFailedCount: number
  recentRecoveredCount: number
  recentLegacyFallbackCount: number
  latestFailureCategory: string | null
  latestTransportStage: string | null
  latestRecoveries: string[]
}

type LocationRoomTriggerReadinessBlocker =
  | 'missing_narrative_state'
  | 'missing_objective'
  | 'missing_open_thread'
  | 'not_combat_ready'
  | 'missing_encounter_seed'
  | 'missing_combat_trigger'
  | 'combat_trigger_consumed'

type LocationRoomCombatPromotionBlocker =
  | 'missing_narrative_state'
  | 'gameplay_disabled_for_location'
  | 'active_encounter_exists'
  | 'existing_unconsumed_trigger'
  | 'not_combat_ready'
  | 'missing_encounter_seed'
  | 'missing_source_beat'
  | 'source_trigger_consumed'

type GameMasterResolver = Pick<typeof gameMasterAgentService, 'resolveActiveGameMasterAgent'>

export type LocationRoomAdminDiagnosticsDeps = {
  roomRepository?: LocationRoomRepository
  membershipRepository?: LocationRoomMembershipRepository
  narrativeRepository?: LocationRoomNarrativeRepository
  gameplayRepository?: LocationRoomGameplayRepository
  gameMasterResolver?: GameMasterResolver
  now?: () => Date
}

const MINIMUM_PARTICIPANTS = 2
const ACTIVE_TICK_LIMIT = 25
const RECENT_TICK_LIMIT = 10
const SAFE_ROOM_ERROR = 'Location room operation failed. Check server logs for details.'
const SAFE_TICK_ERROR = 'Location room tick failed. Check server logs for details.'
const SAFE_NARRATIVE_ERROR = 'Narrative beat failed. Check server logs for details.'
const SAFE_GAMEPLAY_ERROR = 'Gameplay operation failed. Check server logs for details.'
const CROWS_DEN_ALIAS_ID = 'crows_den'
const CROWS_DEN_CANONICAL_ID = '11'

function sanitizeStoredError(value: string | null | undefined, fallback: string): string | null {
  return value && value.trim() ? fallback : null
}

function serializeRun(run: GameplayRun): LocationRoomHealthGameplayRunSummary {
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
    lastError: sanitizeStoredError(run.lastError, SAFE_GAMEPLAY_ERROR),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  }
}

function serializeTick(tick: LocationRoomTick): LocationRoomHealthTickSummary {
  return {
    id: tick.id,
    status: tick.status,
    attempts: tick.attempts,
    turnIntent: tick.turnIntent,
    triggerType: tick.triggerType,
    selectedTokenId: tick.selectedTokenId,
    nextAttemptAt: tick.nextAttemptAt,
    startedAt: tick.startedAt,
    completedAt: tick.completedAt,
    lastError: sanitizeStoredError(tick.lastError, SAFE_TICK_ERROR),
    createdAt: tick.createdAt,
    updatedAt: tick.updatedAt,
  }
}

function serializeIntentTick(tick: LocationRoomTick): LocationRoomHealthIntentTickSummary {
  return {
    id: tick.id,
    status: tick.status,
    turnIntent: tick.turnIntent,
    triggerType: tick.triggerType,
    nextAttemptAt: tick.nextAttemptAt,
    completedAt: tick.completedAt,
  }
}

function zeroIntentCounts(): Record<LocationRoomTurnIntent, number> {
  return LOCATION_ROOM_TURN_INTENTS.reduce((counts, intent) => ({
    ...counts,
    [intent]: 0,
  }), {} as Record<LocationRoomTurnIntent, number>)
}

function countIntents(ticks: LocationRoomTick[]): Record<LocationRoomTurnIntent, number> {
  const counts = zeroIntentCounts()
  for (const tick of ticks) counts[tick.turnIntent] += 1
  return counts
}

function buildDurableIntentSummary(activeTicks: LocationRoomTick[], recentTicks: LocationRoomTick[]) {
  return {
    active: activeTicks.map(serializeIntentTick),
    recent: recentTicks.map(serializeIntentTick),
    activeCounts: countIntents(activeTicks),
    recentCounts: countIntents(recentTicks),
    latestActiveIntent: activeTicks[0]?.turnIntent ?? null,
    latestRecentIntent: recentTicks[0]?.turnIntent ?? null,
  }
}

function isDue(tick: Pick<LocationRoomTick, 'nextAttemptAt'>, now: Date): boolean {
  return new Date(tick.nextAttemptAt).getTime() <= now.getTime()
}

function buildRetryCadenceSummary(
  room: LocationRoom | null,
  activeTicks: LocationRoomTick[],
  now: Date,
  tickIntervalMinutes: number
): LocationRoomHealthDiagnostics['retryCadence'] {
  const dueActiveTick = activeTicks.find((tick) => isDue(tick, now)) ?? null
  const failedTick = activeTicks.find((tick) => tick.status === 'failed') ?? null
  const failedTickRetryDue = failedTick ? isDue(failedTick, now) : null
  const nextTickAt = room?.nextTickAt ?? null
  const nextTickMs = nextTickAt ? new Date(nextTickAt).getTime() : null
  const nowMs = now.getTime()
  const nextTickDue = room ? (nextTickMs === null ? true : nextTickMs <= nowMs) : null
  const minutesUntilNextTick = nextTickMs === null
    ? null
    : Math.max(0, Math.ceil((nextTickMs - nowMs) / 60000))

  return {
    activeTickCount: activeTicks.length,
    dueActiveTickId: dueActiveTick?.id ?? null,
    dueActiveTickStatus: dueActiveTick?.status ?? null,
    failedTickId: failedTick?.id ?? null,
    failedTickNextAttemptAt: failedTick?.nextAttemptAt ?? null,
    failedTickRetryDue,
    failedTickNotDue: Boolean(failedTick && !failedTickRetryDue),
    nextTickAt,
    nextTickDue,
    minutesUntilNextTick,
    tickIntervalMinutes,
    normalCadenceWait: Boolean(room?.tickEnabled && activeTicks.length === 0 && nextTickAt && nextTickDue === false),
  }
}

function safeMetadataObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

const SAFE_GM_GENERATION_ERROR_CATEGORIES = new Set([
  'empty_response',
  'missing_json_object',
  'invalid_json',
  'speaker_constraint',
  'token_constraint',
  'progression_contract',
  'missing_required_field',
  'validation_error',
  'repair_transport_error',
])

const SAFE_GM_GENERATION_TRANSPORT_STAGES = new Set([
  'start_agent',
  'create_session',
  'send_message',
  'collect_stream',
  'create_repair_session',
  'repair_send_message',
  'repair_collect_stream',
])

const SAFE_GM_GENERATION_RECOVERIES = new Set([
  'adventure_patch_defaulted_from_model_prose',
  'scene_check_request_dropped_invalid_optional',
  'scene_check_adventure_patch_defaulted_from_model_prose',
  'scene_check_escalation_normalized',
])

function safeKnownValue(value: unknown, allowed: Set<string>): string | null {
  return typeof value === 'string' && allowed.has(value) ? value : null
}

function safeErrorCategory(value: unknown): string | null {
  return safeKnownValue(value, SAFE_GM_GENERATION_ERROR_CATEGORIES)
}

function safeTransportStage(value: unknown): string | null {
  return safeKnownValue(value, SAFE_GM_GENERATION_TRANSPORT_STAGES)
}

function safeLength(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(0, Math.floor(value))
}

function safeRecoveryList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  for (const item of value) {
    const safe = safeKnownValue(item, SAFE_GM_GENERATION_RECOVERIES)
    if (safe) seen.add(safe)
  }
  return Array.from(seen).slice(0, 8)
}

function sceneCheckOutcomeMetadata(beat: LocationRoomNarrativeBeat | null | undefined): Record<string, unknown> | null {
  const sceneCheck = safeMetadataObject(beat?.metadata.sceneCheck)
  const outcome = safeMetadataObject(sceneCheck?.gmOutcome)
  return safeMetadataObject(outcome?.metadata)
}

function generationRecordsForBeat(beat: LocationRoomNarrativeBeat | null | undefined): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = []
  const beatGeneration = safeMetadataObject(beat?.metadata.gmGeneration)
  if (beatGeneration) records.push(beatGeneration)
  const outcomeGeneration = safeMetadataObject(sceneCheckOutcomeMetadata(beat)?.gmGeneration)
  if (outcomeGeneration) records.push(outcomeGeneration)
  return records
}

function countLegacyFallbackOccurrences(beat: LocationRoomNarrativeBeat): number {
  let count = 0
  if (beat.metadata.fallbackUsed === true) count += 1
  for (const record of generationRecordsForBeat(beat)) {
    if (record.fallbackUsed === true) count += 1
  }
  const outcomeMetadata = sceneCheckOutcomeMetadata(beat)
  if (outcomeMetadata?.fallbackUsed === true) count += 1
  return count
}

function nullableMetadataId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function safeIsoLike(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : null
}

function nestedLocationMetadataCatalog(metadata: Record<string, unknown> | null | undefined): unknown {
  const locationMetadata = safeMetadataObject(metadata?.locationMetadata)
  return locationMetadata?.adventureCatalog
}

function catalogFromMetadata(metadata: Record<string, unknown> | null | undefined): NormalizedLocationAdventureCatalog | undefined {
  return normalizeLocationAdventureCatalog(metadata?.adventureCatalog)
}

function catalogFromNarrativeMetadata(metadata: Record<string, unknown> | null | undefined): NormalizedLocationAdventureCatalog | undefined {
  return normalizeLocationAdventureCatalog(metadata?.adventureCatalog) ??
    normalizeLocationAdventureCatalog(nestedLocationMetadataCatalog(metadata))
}

function buildAdventureCatalogSummary(
  location: LocationRoomLocationDetails | null,
  narrativeState: LocationRoomNarrativeState | null
): LocationRoomHealthDiagnostics['adventureCatalog'] {
  const narrativeCatalog = catalogFromNarrativeMetadata(narrativeState?.metadata)
  const locationCatalog = catalogFromMetadata(location?.metadata)
  const effectiveCatalog = narrativeCatalog ?? locationCatalog
  const sectionCounts = {} as Record<LocationAdventureCatalogSection, number>
  for (const section of LOCATION_ADVENTURE_CATALOG_SECTIONS) {
    sectionCounts[section] = effectiveCatalog?.sections[section]?.length ?? 0
  }
  const visibleEncounterCount = effectiveCatalog
    ? visibleSceneCheckEscalationCatalogEntries(effectiveCatalog.sections['80_encounters'] ?? []).length
    : 0
  const visibleMonsterCount = effectiveCatalog
    ? visibleSceneCheckEscalationCatalogEntries(effectiveCatalog.sections['30_monsters'] ?? []).length
    : 0

  return {
    source: narrativeCatalog ? 'narrative_state' : locationCatalog ? 'location_metadata' : 'missing',
    sectionCounts,
    visibleEncounterCount,
    visibleMonsterCount,
    hasVisibleCombatCatalog: visibleEncounterCount > 0 || visibleMonsterCount > 0,
    narrativeStateCatalogPresent: Boolean(narrativeCatalog),
    locationCatalogPresent: Boolean(locationCatalog),
  }
}

function isCombatReadySourceBeat(beat: LocationRoomNarrativeBeat): boolean {
  if (beat.status !== 'completed') return false
  const metadata = beat.metadata ?? {}
  const sceneCheckEscalation = safeMetadataObject(metadata.sceneCheckEscalation)
  const lastSceneCheckEscalation = safeMetadataObject(metadata.lastSceneCheckEscalation)
  return metadata.combatReadiness === 'ready' ||
    sceneCheckEscalation?.decision === 'combat_ready' ||
    lastSceneCheckEscalation?.decision === 'combat_ready'
}

function resolvePromotionSource(input: {
  narrativeState: LocationRoomNarrativeState | null
  recentBeats: LocationRoomNarrativeBeat[]
}): { sourceBeatId: string | null; consumedSource: boolean } {
  const metadata = input.narrativeState?.metadata ?? {}
  const ttrpg = normalizeNarrativeTtrpgMetadata(metadata)
  const explicitReadyBeatId = nullableMetadataId(metadata.lastCombatReadyBeatId)
  if (explicitReadyBeatId) {
    const explicitBeat = input.recentBeats.find((beat) => beat.id === explicitReadyBeatId)
    if (!explicitBeat || !isCombatReadySourceBeat(explicitBeat)) {
      return { sourceBeatId: null, consumedSource: false }
    }
    return {
      sourceBeatId: explicitReadyBeatId,
      consumedSource: ttrpg.consumedCombatTriggerBeatId === explicitReadyBeatId,
    }
  }

  const lastBeatId = nullableMetadataId(metadata.lastBeatId)
  if (lastBeatId) {
    const lastBeat = input.recentBeats.find((beat) => beat.id === lastBeatId)
    if (lastBeat && isCombatReadySourceBeat(lastBeat)) {
      return {
        sourceBeatId: lastBeatId,
        consumedSource: ttrpg.consumedCombatTriggerBeatId === lastBeatId,
      }
    }
  }

  const sourceBeat = input.recentBeats.find((beat) =>
    beat.id !== ttrpg.consumedCombatTriggerBeatId && isCombatReadySourceBeat(beat)
  )
  return {
    sourceBeatId: sourceBeat?.id ?? null,
    consumedSource: false,
  }
}

function buildPromotionSummary(
  narrativeState: LocationRoomNarrativeState | null,
  gameplayEnabled: boolean,
  activeEncounterStatus: string | null,
  recentBeats: LocationRoomNarrativeBeat[]
): LocationRoomHealthDiagnostics['promotion'] {
  const metadata = narrativeState?.metadata ?? {}
  const ttrpg = normalizeNarrativeTtrpgMetadata(metadata)
  const triggerConsumed = Boolean(ttrpg.lastCombatTriggerBeatId && ttrpg.consumedCombatTriggerBeatId === ttrpg.lastCombatTriggerBeatId)
  const hasUnconsumedTrigger = ttrpg.requestedGameplayAction === 'start_combat' && Boolean(ttrpg.lastCombatTriggerBeatId) && !triggerConsumed
  const source = resolvePromotionSource({ narrativeState, recentBeats })
  let blocker: LocationRoomCombatPromotionBlocker | null = null

  if (!narrativeState) blocker = 'missing_narrative_state'
  else if (!gameplayEnabled) blocker = 'gameplay_disabled_for_location'
  else if (activeEncounterStatus) blocker = 'active_encounter_exists'
  else if (hasUnconsumedTrigger) blocker = 'existing_unconsumed_trigger'
  else if (ttrpg.ttrpgPhase !== 'threat' || ttrpg.combatReadiness !== 'ready' || (ttrpg.threatLevel ?? 0) < 3 || ttrpg.requestedGameplayAction === 'start_combat') blocker = 'not_combat_ready'
  else if (!ttrpg.lastEncounterSeed) blocker = 'missing_encounter_seed'
  else if (source.consumedSource) blocker = 'source_trigger_consumed'
  else if (!source.sourceBeatId) blocker = 'missing_source_beat'

  return {
    eligible: blocker === null,
    blocker,
    sourceBeatId: source.consumedSource ? null : source.sourceBeatId,
    lastCombatReadyBeatId: nullableMetadataId(metadata.lastCombatReadyBeatId),
    lastCombatReadySceneCheckId: nullableMetadataId(metadata.lastCombatReadySceneCheckId),
    lastCombatReadyAt: safeIsoLike(metadata.lastCombatReadyAt),
    lastPromotionBeatId: nullableMetadataId(metadata.lastCombatReadyPromotionBeatId),
    lastPromotionTickId: nullableMetadataId(metadata.lastCombatReadyPromotionTickId),
    lastPromotionAt: safeIsoLike(metadata.lastCombatReadyPromotionAt),
  }
}

function summarizeGmGeneration(
  beat: LocationRoomNarrativeBeat | null,
  recentBeats: LocationRoomNarrativeBeat[] = beat ? [beat] : []
): LocationRoomHealthGameMasterGenerationSummary {
  const records = generationRecordsForBeat(beat)
  const gmGeneration = records[records.length - 1] ?? null
  const status = gmGeneration?.status === 'accepted' || gmGeneration?.status === 'repaired' || gmGeneration?.status === 'repair_failed'
    ? gmGeneration.status
    : 'not_available'

  let recentAcceptedCount = 0
  let recentRepairedCount = 0
  let recentRepairFailedCount = 0
  let recentRecoveredCount = 0
  let recentLegacyFallbackCount = 0
  let latestFailureCategory: string | null = null
  let latestTransportStage: string | null = null
  let latestRecoveries: string[] = []

  for (const recentBeat of recentBeats) {
    recentLegacyFallbackCount += countLegacyFallbackOccurrences(recentBeat)
    for (const record of generationRecordsForBeat(recentBeat)) {
      if (record.status === 'accepted') recentAcceptedCount += 1
      if (record.status === 'repaired') recentRepairedCount += 1
      if (record.status === 'repair_failed') recentRepairFailedCount += 1
      const recoveries = safeRecoveryList(record.recoveries)
      if (recoveries.length > 0) {
        recentRecoveredCount += 1
        if (latestRecoveries.length === 0) latestRecoveries = recoveries
      }
      if (!latestFailureCategory && record.status === 'repair_failed') {
        latestFailureCategory = safeErrorCategory(record.repairErrorCategory) ?? safeErrorCategory(record.initialErrorCategory)
      }
      if (!latestTransportStage) latestTransportStage = safeTransportStage(record.transportStage)
    }
  }

  return {
    latestBeatStatus: beat?.status ?? null,
    status,
    repairAttempted: gmGeneration?.repairAttempted === true,
    repaired: gmGeneration?.repaired === true,
    fallbackUsed: gmGeneration?.fallbackUsed === true,
    recoveries: safeRecoveryList(gmGeneration?.recoveries),
    initialErrorCategory: safeErrorCategory(gmGeneration?.initialErrorCategory),
    repairErrorCategory: safeErrorCategory(gmGeneration?.repairErrorCategory),
    transportStage: safeTransportStage(gmGeneration?.transportStage),
    initialResponseLength: safeLength(gmGeneration?.initialResponseLength),
    repairResponseLength: safeLength(gmGeneration?.repairResponseLength),
    safeError: sanitizeStoredError(beat?.lastError, SAFE_NARRATIVE_ERROR),
    recentAcceptedCount,
    recentRepairedCount,
    recentRepairFailedCount,
    recentRecoveredCount,
    recentLegacyFallbackCount,
    latestFailureCategory,
    latestTransportStage,
    latestRecoveries,
  }
}

function buildTriggerReadinessSummary(
  narrativeState: LocationRoomNarrativeState | null,
  gameplayEnabled: boolean,
  gameplayStateStatus: string | null,
  activeEncounterStatus: string | null
): LocationRoomHealthDiagnostics['triggerReadiness'] {
  const ttrpg = normalizeNarrativeTtrpgMetadata(narrativeState?.metadata)
  const openThreads = normalizeNarrativeOpenThreads(narrativeState?.openThreads)
  const triggerId = ttrpg.lastCombatTriggerBeatId
  const consumedTriggerId = ttrpg.consumedCombatTriggerBeatId
  const triggerConsumed = Boolean(triggerId && consumedTriggerId === triggerId)
  const hasUnconsumedTrigger = ttrpg.requestedGameplayAction === 'start_combat' && Boolean(triggerId) && !triggerConsumed
  const seed = ttrpg.lastEncounterSeed
  const blockers: LocationRoomTriggerReadinessBlocker[] = []

  if (!narrativeState) {
    blockers.push('missing_narrative_state')
  } else {
    if (!narrativeState.currentObjective) blockers.push('missing_objective')
    if (ttrpg.ttrpgPhase !== 'aftermath' && openThreads.length === 0) blockers.push('missing_open_thread')
  }

  if (ttrpg.requestedGameplayAction === 'start_combat') {
    if (ttrpg.ttrpgPhase !== 'threat' || ttrpg.combatReadiness !== 'ready') blockers.push('not_combat_ready')
    if (!ttrpg.lastEncounterSeed) blockers.push('missing_encounter_seed')
    if (!triggerId) blockers.push('missing_combat_trigger')
    if (triggerConsumed) blockers.push('combat_trigger_consumed')
  }

  return {
    stateExists: Boolean(narrativeState),
    currentObjective: narrativeState?.currentObjective ?? null,
    openThreadCount: openThreads.length,
    ttrpgPhase: ttrpg.ttrpgPhase,
    combatReadiness: ttrpg.combatReadiness,
    threatLevel: ttrpg.threatLevel,
    requestedGameplayAction: ttrpg.requestedGameplayAction,
    triggerId,
    consumedTriggerId,
    triggerConsumed,
    hasUnconsumedTrigger,
    encounterSeedPresent: Boolean(seed),
    encounterSeedSource: seed?.source ?? null,
    encounterSeedCatalogBacked: seed?.source === 'location_catalog' || Boolean(seed?.catalogEntryIds?.length),
    encounterSeedCatalogEntryIds: seed?.catalogEntryIds ?? [],
    encounterSeedEncounterHintCount: seed?.encounterHints?.length ?? 0,
    encounterSeedMonsterHintCount: seed?.monsterHints?.length ?? 0,
    gameplayEnabled,
    gameplayStateStatus,
    activeEncounterStatus,
    blockers,
  }
}

function isGameplayEnabledForLocation(locationId: string): boolean {
  const gameplay = elizaConfig.locationRooms.gameplay
  if (!gameplay.enabled) return false

  const normalizedLocationId = locationId.trim().toLowerCase()
  return gameplay.locationAllowlist.some((allowedLocationId) =>
    allowedLocationId.trim().toLowerCase() === normalizedLocationId
  )
}

function sampleParticipants(participants: LocationRoomParticipant[]) {
  return participants.slice(0, 5).map((participant) => ({
    tokenId: participant.tokenId,
    name: participant.name,
  }))
}

function buildCanonicalHints(
  requestedLocationId: string,
  location: LocationRoomLocationDetails | null,
  relatedLocations: LocationRoomLocationDetails[]
) {
  const normalizedRequested = requestedLocationId.trim().toLowerCase()
  const canonical = relatedLocations.find((candidate) => candidate.id === CROWS_DEN_CANONICAL_ID) ?? null
  const hints: string[] = []
  let canonicalLocationId: string | null = null

  if (normalizedRequested === CROWS_DEN_ALIAS_ID) {
    canonicalLocationId = CROWS_DEN_CANONICAL_ID
    hints.push('The legacy crows_den location is not chain-backed; use canonical location 11 for The Crow\'s Den.')
  } else if (requestedLocationId === CROWS_DEN_CANONICAL_ID) {
    canonicalLocationId = CROWS_DEN_CANONICAL_ID
    if (relatedLocations.some((candidate) => candidate.id === CROWS_DEN_ALIAS_ID)) {
      hints.push('Legacy duplicate crows_den exists; do not move staking or room state away from location 11.')
    }
  } else if (location?.chainLocationId) {
    canonicalLocationId = location.id
  }

  if (canonical && requestedLocationId !== canonical.id && normalizedRequested === CROWS_DEN_ALIAS_ID) {
    hints.push(`Canonical row found: ${canonical.name} (${canonical.id}).`)
  }

  return {
    requestedLocationId,
    canonicalLocationId,
    isCanonical: !canonicalLocationId || requestedLocationId === canonicalLocationId,
    hints,
  }
}

function recommendedNextAction(input: {
  locationExists: boolean
  canonical: LocationRoomHealthDiagnostics['canonical']
  config: LocationRoomHealthDiagnostics['config']
  gmReadiness: LocationRoomHealthDiagnostics['gmReadiness']
  participantCount: number
  room: LocationRoom | null
  activeTicks: LocationRoomTick[]
  recentTicks: LocationRoomTick[]
  publicMessageCount: number
  retryCadence: LocationRoomHealthDiagnostics['retryCadence']
  gmGeneration: LocationRoomHealthDiagnostics['gmGeneration']
  adventureCatalog: LocationRoomHealthDiagnostics['adventureCatalog']
  triggerReadiness: LocationRoomHealthDiagnostics['triggerReadiness']
  promotion: LocationRoomHealthDiagnostics['promotion']
  completedBeatWithoutPublicGameMasterMessage: boolean
}): LocationRoomRecommendedNextAction {
  if (!input.locationExists) {
    return input.canonical.canonicalLocationId ? 'use_canonical_location_11' : 'location_not_found'
  }

  if (!input.canonical.isCanonical && input.canonical.canonicalLocationId === CROWS_DEN_CANONICAL_ID) {
    return 'use_canonical_location_11'
  }

  if (!input.config.locationRoomsEnabled) return 'enable_location_rooms'
  if (!input.config.officialElizaOsConfigured) return 'configure_official_elizaos'
  if (input.gmReadiness.required && !input.gmReadiness.ready) return 'configure_game_master'
  if (input.participantCount < MINIMUM_PARTICIPANTS) return 'stake_or_sync_participants'
  if (!input.room) return 'trigger_location_room_tick'
  if (!input.room.tickEnabled) return 'enable_room_ticks'

  if (input.retryCadence.dueActiveTickId) return 'run_location_room_worker'
  if (input.gmGeneration.status === 'repair_failed') return 'inspect_gm_repair_failure'
  if (input.retryCadence.failedTickNotDue) return 'wait_for_retry'
  if (input.recentTicks.some((tick) => tick.status === 'dead')) return 'inspect_failed_tick'
  if (input.completedBeatWithoutPublicGameMasterMessage) return 'missing_public_game_master_message'
  if (input.publicMessageCount === 0) return 'trigger_location_room_tick'

  const combatAlreadyRoutable = Boolean(
    input.triggerReadiness.activeEncounterStatus ||
    input.triggerReadiness.hasUnconsumedTrigger ||
    input.promotion.eligible
  )
  if (input.config.gameplayEnabledForLocation && !input.adventureCatalog.hasVisibleCombatCatalog && !combatAlreadyRoutable) {
    return 'missing_location_adventure_catalog'
  }
  if (input.promotion.eligible && !input.retryCadence.nextTickDue) {
    return 'combat_ready_pending_auto_tick'
  }

  const triggerBlockers = input.triggerReadiness.blockers.filter((blocker) => blocker !== 'missing_narrative_state')
  if (triggerBlockers.length > 0) return 'missing_trigger_readiness'
  if (input.retryCadence.nextTickDue) return 'run_location_room_worker'
  if (input.retryCadence.normalCadenceWait) return 'wait_for_cadence'

  return 'healthy'
}

export class LocationRoomAdminDiagnosticsService {
  private readonly roomRepository: LocationRoomRepository
  private readonly membershipRepository: LocationRoomMembershipRepository
  private readonly narrativeRepository: LocationRoomNarrativeRepository
  private readonly gameplayRepository: LocationRoomGameplayRepository
  private readonly gameMasterResolver: GameMasterResolver
  private readonly now: () => Date

  constructor(deps: LocationRoomAdminDiagnosticsDeps = {}) {
    this.roomRepository = deps.roomRepository ?? locationRoomRepository
    this.membershipRepository = deps.membershipRepository ?? locationRoomMembershipRepository
    this.narrativeRepository = deps.narrativeRepository ?? locationRoomNarrativeRepository
    this.gameplayRepository = deps.gameplayRepository ?? locationRoomGameplayRepository
    this.gameMasterResolver = deps.gameMasterResolver ?? gameMasterAgentService
    this.now = deps.now ?? (() => new Date())
  }

  async inspectLocation(locationId: string): Promise<LocationRoomHealthDiagnostics> {
    const now = this.now()
    const relatedIds = locationId === CROWS_DEN_ALIAS_ID || locationId === CROWS_DEN_CANONICAL_ID
      ? [CROWS_DEN_CANONICAL_ID, CROWS_DEN_ALIAS_ID]
      : []

    const [location, relatedLocations, gmResolutionResult] = await Promise.all([
      this.roomRepository.getLocationDetails(locationId),
      this.roomRepository.listLocationsByIds(relatedIds),
      this.gameMasterResolver.resolveActiveGameMasterAgent()
        .then((resolution) => ({ resolution, error: null as unknown }))
        .catch((error) => ({ resolution: null, error })),
    ])

    const canonical = buildCanonicalHints(locationId, location, relatedLocations)
    const gmResolution = gmResolutionResult.resolution ?? {
      source: 'missing' as const,
      officialAgentId: null,
      setting: null,
      envFallbackAgentId: null,
    }
    const gameplayEnabledForLocation = isGameplayEnabledForLocation(locationId)
    const config = {
      locationRoomsEnabled: elizaConfig.locationRooms.enabled,
      officialElizaOsConfigured: Boolean(elizaConfig.official.baseUrl),
      narrativeEnabled: elizaConfig.locationRooms.narrative.enabled,
      gameplayEnabledForLocation,
      tickIntervalMinutes: elizaConfig.locationRooms.tickIntervalMinutes,
      maxTicksPerRun: elizaConfig.locationRooms.maxTicksPerRun,
    }
    const gmRequired = config.narrativeEnabled || config.gameplayEnabledForLocation
    const gmReadiness = {
      required: gmRequired,
      ready: !gmRequired || Boolean(gmResolution.officialAgentId),
      source: gmResolution.source,
      officialAgentId: gmResolution.officialAgentId,
      safeError: gmResolutionResult.error
        ? 'Game-master agent readiness could not be resolved. Check server logs for details.'
        : gmRequired && !gmResolution.officialAgentId
          ? 'Game-master agent is not configured.'
          : null,
    }

    if (!location) {
      const durableIntent = buildDurableIntentSummary([], [])
      const retryCadence = buildRetryCadenceSummary(null, [], now, config.tickIntervalMinutes)
      const gmGeneration = summarizeGmGeneration(null)
      const adventureCatalog = buildAdventureCatalogSummary(null, null)
      const triggerReadiness = buildTriggerReadinessSummary(null, gameplayEnabledForLocation, null, null)
      const promotion = buildPromotionSummary(null, gameplayEnabledForLocation, null, [])

      return {
        generatedAt: now.toISOString(),
        location: {
          id: locationId,
          name: null,
          chainLocationId: null,
          active: null,
          exists: false,
        },
        canonical,
        config,
        gmReadiness,
        participants: { count: 0, minimumRequired: MINIMUM_PARTICIPANTS, sample: [] },
        room: {
          exists: false,
          id: null,
          tickEnabled: null,
          lastTickAt: null,
          nextTickAt: null,
          tickCount: null,
          lastError: null,
          createdAt: null,
          updatedAt: null,
        },
        ticks: { active: [], recent: [] },
        durableIntent,
        retryCadence,
        publicTranscript: {
          messageCount: 0,
          latestSequence: null,
          latestCreatedAt: null,
          gameMasterMessageCount: 0,
          agentMessageCount: 0,
          latestGameMasterMessageCreatedAt: null,
          latestAgentMessageCreatedAt: null,
        },
        narrative: {
          enabled: config.narrativeEnabled,
          link: null,
          stateExists: false,
          stateUpdatedAt: null,
          currentObjective: null,
          latestBeat: null,
        },
        narrativeVisibility: {
          latestBeatPublicNarrationPresent: null,
          publicGameMasterMessageCount: 0,
          publicAgentMessageCount: 0,
          completedBeatWithoutPublicGameMasterMessage: false,
          blocker: null,
        },
        gmGeneration,
        adventureCatalog,
        triggerReadiness,
        promotion,
        gameplay: {
          enabled: gameplayEnabledForLocation,
          link: null,
          stateStatus: null,
          activeEncounterStatus: null,
          recentTurnCount: 0,
          latestTurnStatus: null,
          rewardClaimCount: 0,
          activeRun: null,
          recentRuns: [],
        },
        recommendedNextAction: recommendedNextAction({
          locationExists: false,
          canonical,
          config,
          gmReadiness,
          participantCount: 0,
          room: null,
          activeTicks: [],
          recentTicks: [],
          publicMessageCount: 0,
          retryCadence,
          gmGeneration,
          adventureCatalog,
          triggerReadiness,
          promotion,
          completedBeatWithoutPublicGameMasterMessage: false,
        }),
      }
    }

    const [room, participants] = await Promise.all([
      this.roomRepository.findRoomByLocationId(locationId),
      this.membershipRepository.listEligibleParticipantsByLocation(locationId),
    ])

    const [activeTicks, recentTicks] = room
      ? await Promise.all([
        this.roomRepository.listActiveTicksForRoom(room.id, ACTIVE_TICK_LIMIT),
        this.roomRepository.listRecentTicksForRoom(room.id, RECENT_TICK_LIMIT),
      ])
      : [[], []]
    const [publicMessageStats, publicAuthorMessageStats] = room
      ? await Promise.all([
        this.roomRepository.getPublicMessageStats(room.id),
        this.roomRepository.getPublicAuthorMessageStats(room.id),
      ])
      : [{ messageCount: 0, latestSequence: null, latestCreatedAt: null }, {
        messageCount: 0,
        gameMasterMessageCount: 0,
        agentMessageCount: 0,
        latestGameMasterMessageCreatedAt: null,
        latestAgentMessageCreatedAt: null,
      }]
    const publicTranscript = {
      ...publicMessageStats,
      gameMasterMessageCount: publicAuthorMessageStats.gameMasterMessageCount,
      agentMessageCount: publicAuthorMessageStats.agentMessageCount,
      latestGameMasterMessageCreatedAt: publicAuthorMessageStats.latestGameMasterMessageCreatedAt,
      latestAgentMessageCreatedAt: publicAuthorMessageStats.latestAgentMessageCreatedAt,
    }

    const [
      narrativeState,
      latestBeats,
      gameplayState,
      activeEncounter,
      gameplayTurns,
      rewardClaims,
      activeRun,
      recentRuns,
    ] = room
      ? await Promise.all([
        config.narrativeEnabled ? this.narrativeRepository.findStateByRoomId(room.id) : Promise.resolve(null),
        config.narrativeEnabled ? this.narrativeRepository.listRecentBeatsByRoomId(room.id, 10) : Promise.resolve([]),
        gameplayEnabledForLocation ? this.gameplayRepository.findStateByRoomId(room.id) : Promise.resolve(null),
        gameplayEnabledForLocation ? this.gameplayRepository.findActiveEncounterByRoomId(room.id) : Promise.resolve(null),
        gameplayEnabledForLocation ? this.gameplayRepository.listRecentTurnsByRoomId(room.id, 5) : Promise.resolve([]),
        gameplayEnabledForLocation ? this.gameplayRepository.listRewardClaims({ roomId: room.id, limit: 5 }) : Promise.resolve([]),
        gameplayEnabledForLocation ? this.gameplayRepository.findActiveRunByRoomId(room.id) : Promise.resolve(null),
        gameplayEnabledForLocation ? this.gameplayRepository.listRecentRunsByRoomId(room.id, 5) : Promise.resolve([]),
      ])
      : [null, [], null, null, [], [], null, []] as const

    const latestBeat = latestBeats[0] ?? null
    const latestBeatPublicNarrationPresent = latestBeat
      ? Boolean(latestBeat.publicNarration?.trim())
      : null
    const completedBeatWithoutPublicGameMasterMessage = Boolean(
      latestBeat &&
      latestBeat.status === 'completed' &&
      publicAuthorMessageStats.gameMasterMessageCount === 0 &&
      publicAuthorMessageStats.agentMessageCount > 0
    )
    const durableIntent = buildDurableIntentSummary(activeTicks, recentTicks)
    const retryCadence = buildRetryCadenceSummary(room, activeTicks, now, config.tickIntervalMinutes)
    const gmGeneration = summarizeGmGeneration(latestBeat, latestBeats)
    const adventureCatalog = buildAdventureCatalogSummary(location, narrativeState)
    const triggerReadiness = buildTriggerReadinessSummary(
      narrativeState,
      gameplayEnabledForLocation,
      gameplayState?.status ?? null,
      activeEncounter?.status ?? null
    )
    const promotion = buildPromotionSummary(
      narrativeState,
      gameplayEnabledForLocation,
      activeEncounter?.status ?? null,
      latestBeats
    )
    const diagnostics: LocationRoomHealthDiagnostics = {
      generatedAt: now.toISOString(),
      location: {
        id: location.id,
        name: location.name,
        chainLocationId: location.chainLocationId,
        active: location.active,
        exists: true,
      },
      canonical,
      config,
      gmReadiness,
      participants: {
        count: participants.length,
        minimumRequired: MINIMUM_PARTICIPANTS,
        sample: sampleParticipants(participants),
      },
      room: {
        exists: Boolean(room),
        id: room?.id ?? null,
        tickEnabled: room?.tickEnabled ?? null,
        lastTickAt: room?.lastTickAt ?? null,
        nextTickAt: room?.nextTickAt ?? null,
        tickCount: room?.tickCount ?? null,
        lastError: sanitizeStoredError(room?.lastError, SAFE_ROOM_ERROR),
        createdAt: room?.createdAt ?? null,
        updatedAt: room?.updatedAt ?? null,
      },
      ticks: {
        active: activeTicks.map(serializeTick),
        recent: recentTicks.map(serializeTick),
      },
      durableIntent,
      retryCadence,
      publicTranscript,
      narrative: {
        enabled: config.narrativeEnabled,
        link: room ? `/api/admin/eliza/location-rooms/${encodeURIComponent(locationId)}/narrative` : null,
        stateExists: Boolean(narrativeState),
        stateUpdatedAt: narrativeState?.updatedAt ?? null,
        currentObjective: narrativeState?.currentObjective ?? null,
        latestBeat: latestBeat ? {
          status: latestBeat.status,
          selectedTokenId: latestBeat.selectedTokenId,
          completedAt: latestBeat.completedAt,
          lastError: sanitizeStoredError(latestBeat.lastError, SAFE_NARRATIVE_ERROR),
          publicNarrationPresent: latestBeatPublicNarrationPresent === true,
        } : null,
      },
      narrativeVisibility: {
        latestBeatPublicNarrationPresent,
        publicGameMasterMessageCount: publicAuthorMessageStats.gameMasterMessageCount,
        publicAgentMessageCount: publicAuthorMessageStats.agentMessageCount,
        completedBeatWithoutPublicGameMasterMessage,
        blocker: completedBeatWithoutPublicGameMasterMessage ? 'missing_public_game_master_message' : null,
      },
      gmGeneration,
      adventureCatalog,
      triggerReadiness,
      promotion,
      gameplay: {
        enabled: gameplayEnabledForLocation,
        link: room ? `/api/admin/eliza/location-rooms/${encodeURIComponent(locationId)}/gameplay` : null,
        stateStatus: gameplayState?.status ?? null,
        activeEncounterStatus: activeEncounter?.status ?? null,
        recentTurnCount: gameplayTurns.length,
        latestTurnStatus: gameplayTurns[0]?.status ?? null,
        rewardClaimCount: rewardClaims.length,
        activeRun: activeRun ? serializeRun(activeRun) : null,
        recentRuns: recentRuns.map(serializeRun),
      },
      recommendedNextAction: 'healthy',
    }

    diagnostics.recommendedNextAction = recommendedNextAction({
      locationExists: true,
      canonical,
      config,
      gmReadiness,
      participantCount: participants.length,
      room,
      activeTicks,
      recentTicks,
      publicMessageCount: publicTranscript.messageCount,
      retryCadence,
      gmGeneration,
      adventureCatalog,
      triggerReadiness,
      promotion,
      completedBeatWithoutPublicGameMasterMessage,
    })

    return diagnostics
  }
}

export const locationRoomAdminDiagnosticsService = new LocationRoomAdminDiagnosticsService()
