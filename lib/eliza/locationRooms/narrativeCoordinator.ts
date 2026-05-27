import { gameMasterAgentService } from '@/lib/eliza/gameMasterAgent/service'
import {
  GAME_MASTER_AUTHOR_NAME,
  GameMasterBeatGenerationError,
  GameMasterSceneCheckOutcomeGenerationError,
  buildGameMasterBeatProgressionContext,
  officialGameMasterBeatGenerator,
  validateGameMasterBeatProgressionContract,
  type GameMasterBeatGenerator,
  type GameMasterBeatOutput,
  type GameMasterSceneCheckOutcomeOutput,
  type GameMasterBeatProgressionContext,
  type GameMasterGenerationDiagnostics,
  type GameMasterGenerationRecoveryKey,
  type GameMasterGenerationResponseFlags,
} from './gameMasterGenerator'
import {
  normalizeSceneCheckEscalation,
  ttrpgPatchForSceneCheckEscalation,
} from './encounterEscalation'
import {
  locationRoomNarrativeRepository,
  type LocationRoomNarrativeRepository,
} from './narrativeRepository'
import {
  mergeAdventureMetadata,
  mergeNarrativeSceneCheckMetadata,
  mergeNarrativeTtrpgMetadata,
  normalizeAdventureMemory,
  refreshAdventureCatalogMetadataFromLocation,
  normalizeAdventurePatch,
  normalizeDeclaredAction,
  normalizeNarrativeSceneCheckEscalationMetadata,
  normalizeNarrativeSceneCheckMetadata,
  normalizeNarrativeTtrpgMetadata,
  recordAdventureDeclaredAction,
  toNarrativeStateSnapshot,
  type LocationRoomAdventureMemory,
  type LocationRoomAdventurePatch,
  type LocationRoomDeclaredAction,
  type LocationRoomNarrativeBeat,
  type LocationRoomNarrativeStateSnapshot,
} from './narrativeTypes'
import {
  locationRoomRepository,
  type LocationRoomRepository,
} from './repository'
import {
  officialLocationRoomTurnGenerator,
  normalizeLocationRoomGeneratedContent,
  type OfficialLocationRoomTurnGenerator,
} from './officialTurnGenerator'
import type { GameplayCheckType } from './gameplay/types'
import {
  adjudicateSceneCheck,
  resolveSceneCheck,
} from './sceneChecks/rules'
import { projectPublicSceneCheckRolls } from './sceneChecks/publicRolls'
import { extractRecentSceneCheckPattern } from './sceneChecks/recentPatterns'
import type {
  SceneCheckAdjudication,
  SceneCheckFallback,
} from './sceneChecks/types'
import type {
  LocationRoom,
  LocationRoomMessage,
  LocationRoomNarrativeTurnContext,
  LocationRoomParticipant,
  LocationRoomSceneCheckEscalation,
  LocationRoomTick,
  PublicLocationRoomGameplayRolls,
} from './types'

export type ProcessNarrativeLocationRoomTurnInput = {
  room: LocationRoom
  tick: LocationRoomTick
  speaker: LocationRoomParticipant
  participants: LocationRoomParticipant[]
  recentMessages: LocationRoomMessage[]
}

export type ProcessNarrativeLocationRoomTurnResult = {
  selectedTokenId: number
  /** Final public message appended by the narrative tick. */
  messageId: string
  /** Scene-check subflow public message ids, in order: character_action, roll_card, gm_outcome. */
  messageIds?: string[]
  sceneCheckId?: string | null
  publicGameMasterBeatAppended?: boolean
  /** Public-safe routing diagnostics for service logs; contains no prompt or payload bodies. */
  sceneCheckDiagnostics?: {
    requestPresent: boolean
    proposalPresent: boolean
    proposalErrorPresent: boolean
    selected: boolean
    skipReason?: string | null
  }
}

export interface LocationRoomNarrativeCoordinator {
  processTurn(input: ProcessNarrativeLocationRoomTurnInput): Promise<ProcessNarrativeLocationRoomTurnResult>
  markTickFailed(tickId: string, error: unknown, options?: { dead?: boolean }): Promise<void>
}

export interface GameMasterAgentResolver {
  resolveRuntimeGameMasterAgentId(): Promise<string>
}

function isUsableGeneratedBeat(beat: LocationRoomNarrativeBeat): boolean {
  return Boolean(beat.speakerInstruction && getStateAfterSnapshot(beat.stateAfter))
}

function getStateAfterSnapshot(value: unknown): LocationRoomNarrativeStateSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  const stateSummary = typeof candidate.stateSummary === 'string'
    ? candidate.stateSummary.trim()
    : typeof candidate.state_summary === 'string'
      ? candidate.state_summary.trim()
      : ''

  if (!stateSummary) return null

  const currentObjective = typeof candidate.currentObjective === 'string'
    ? candidate.currentObjective.trim() || null
    : typeof candidate.current_objective === 'string'
      ? candidate.current_objective.trim() || null
      : null
  const openThreads = Array.isArray(candidate.openThreads)
    ? candidate.openThreads.filter((thread): thread is string => typeof thread === 'string' && thread.trim().length > 0)
        .map((thread) => thread.trim())
    : Array.isArray(candidate.open_threads)
      ? candidate.open_threads.filter((thread): thread is string => typeof thread === 'string' && thread.trim().length > 0)
          .map((thread) => thread.trim())
      : []

  return {
    stateSummary,
    currentObjective,
    openThreads,
  }
}

function beatToOutput(
  beat: LocationRoomNarrativeBeat,
  fallbackGameMasterAgentId: string,
  progressionContext: GameMasterBeatProgressionContext
): GameMasterBeatOutput {
  const stateAfter = getStateAfterSnapshot(beat.stateAfter)
  if (!beat.speakerInstruction || !stateAfter) {
    throw new Error('Location room narrative beat is missing generated output')
  }

  const ttrpg = normalizeNarrativeTtrpgMetadata(beat.metadata)
  const sceneCheck = normalizeNarrativeSceneCheckMetadata(beat.metadata)

  const output = {
    gameMasterAgentId: beat.gameMasterAgentId ?? fallbackGameMasterAgentId,
    publicNarration: beat.publicNarration,
    speakerInstruction: beat.speakerInstruction,
    stateAfter,
    ttrpgPhase: ttrpg.ttrpgPhase,
    combatReadiness: ttrpg.combatReadiness,
    threatLevel: ttrpg.threatLevel,
    requestedGameplayAction: ttrpg.requestedGameplayAction,
    encounterSeed: ttrpg.lastEncounterSeed,
    sceneCheckRequest: sceneCheck.request,
    adventurePatch: normalizeAdventurePatch(beat.metadata.adventurePatch ?? {
      currentStakes: stateAfter.currentObjective ?? 'The scene carries unresolved pressure.',
    }),
    metadata: mergeNarrativeSceneCheckMetadata(beat.metadata, { request: sceneCheck.request }),
  }

  validateGameMasterBeatProgressionContract({
    ...output,
    progressionContext,
  })
  return output
}

function toGameMasterBeatMetadata(output: GameMasterBeatOutput): Record<string, unknown> {
  return {
    ...output.metadata,
    ttrpgPhase: output.ttrpgPhase,
    combatReadiness: output.combatReadiness,
    threatLevel: output.threatLevel,
    requestedGameplayAction: output.requestedGameplayAction,
    encounterSeed: output.encounterSeed,
    sceneCheckRequest: output.sceneCheckRequest,
    sceneCheck: {
      ...output.metadata.sceneCheck,
      request: output.sceneCheckRequest,
    },
    adventurePatch: output.adventurePatch,
  }
}

function adventureSourceIdForBeat(beatId: string): string {
  return `beat:${beatId}`
}

function adventureSourceIdForSceneCheck(sceneCheckId: string): string {
  return `scene_check:${sceneCheckId}`
}

function withAdventurePatchSource(value: unknown, sourceId: string): LocationRoomAdventurePatch {
  const patch = normalizeAdventurePatch(value, { sourceId })
  return normalizeAdventurePatch({
    ...patch,
    consequenceLedger: patch.consequenceLedger?.map((consequence, index) => ({
      ...consequence,
      source: sourceId,
      id: `${sourceId}:consequence:${index + 1}`,
    })),
  }, { sourceId })
}

function withSourcedGameMasterPatch(output: GameMasterBeatOutput, sourceId: string): GameMasterBeatOutput {
  const adventurePatch = withAdventurePatchSource(output.adventurePatch, sourceId)
  return {
    ...output,
    adventurePatch,
    metadata: {
      ...output.metadata,
      adventurePatch,
    },
  }
}

function buildLastBeatOutcome(output: GameMasterBeatOutput, sourceId: string): LocationRoomAdventurePatch {
  const summary = output.publicNarration || output.stateAfter.currentObjective || output.stateAfter.stateSummary
  return normalizeAdventurePatch({
    lastOutcome: {
      kind: 'beat',
      sourceId,
      summary,
    },
  }, { sourceId })
}

function buildLastSceneCheckOutcome(input: {
  sceneSourceId: string
  tier: string
  summary: string
}): LocationRoomAdventurePatch {
  return normalizeAdventurePatch({
    lastOutcome: {
      kind: 'scene_check',
      sourceId: input.sceneSourceId,
      tier: input.tier,
      summary: input.summary,
    },
  }, { sourceId: input.sceneSourceId })
}

function preserveUnrelatedCombatTriggerForSceneCheck(input: {
  metadata: Record<string, unknown>
  patch: ReturnType<typeof ttrpgPatchForSceneCheckEscalation>
  beatId: string
  sceneCheckId: string
  sceneSourceId: string
}): ReturnType<typeof ttrpgPatchForSceneCheckEscalation> {
  const current = normalizeNarrativeTtrpgMetadata(input.metadata)
  const triggerId = current.lastCombatTriggerBeatId
  const hasUnconsumedExplicitTrigger = current.requestedGameplayAction === 'start_combat' &&
    Boolean(triggerId) &&
    current.consumedCombatTriggerBeatId !== triggerId
  const belongsToCurrentSceneCheckPath = triggerId === input.beatId ||
    triggerId === input.sceneCheckId ||
    triggerId === input.sceneSourceId

  if (!hasUnconsumedExplicitTrigger || belongsToCurrentSceneCheckPath) return input.patch

  const safePatch = { ...input.patch }
  delete safePatch.ttrpgPhase
  delete safePatch.combatReadiness
  delete safePatch.threatLevel
  delete safePatch.requestedGameplayAction
  delete safePatch.lastEncounterSeed
  delete safePatch.lastCombatTriggerBeatId
  return safePatch
}

function sceneCheckEscalationStorageExtra(input: {
  metadata: Record<string, unknown>
  sceneCheckId: string
  escalation: LocationRoomSceneCheckEscalation
}): Record<string, unknown> {
  const stored = normalizeNarrativeSceneCheckEscalationMetadata(input.metadata)
  const entries = Object.entries({
    ...stored.sceneCheckEscalations,
    [input.sceneCheckId]: input.escalation,
  }).slice(-8)
  return {
    sceneCheckEscalations: Object.fromEntries(entries),
    lastSceneCheckEscalation: input.escalation,
  }
}

function storeableDeclaredAction(
  action: LocationRoomDeclaredAction | null | undefined,
  content: string,
  activeDecision: LocationRoomAdventureMemory['activeDecision']
): LocationRoomDeclaredAction | null {
  return normalizeDeclaredAction(action ?? { summary: content }, { activeDecision })
}

type StoredBeatCharacterAction = {
  content: string
  officialAgentId: string | null
  authorName: string | null
}

function normalizeStoredBeatCharacterAction(value: unknown): StoredBeatCharacterAction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  const content = typeof source.content === 'string' ? source.content.replace(/\s+/g, ' ').trim() : ''
  if (!content) return null
  return {
    content: content.slice(0, 500).trim(),
    officialAgentId: typeof source.officialAgentId === 'string' && source.officialAgentId.trim()
      ? source.officialAgentId.trim()
      : null,
    authorName: typeof source.authorName === 'string' && source.authorName.trim()
      ? source.authorName.trim().slice(0, 120)
      : null,
  }
}

function storeableCharacterAction(input: {
  content: string
  officialAgentId: string | null
  authorName: string
}): StoredBeatCharacterAction {
  return {
    content: input.content,
    officialAgentId: input.officialAgentId,
    authorName: input.authorName,
  }
}

function mergeNormalAdventureMetadata(input: {
  metadata: Record<string, unknown>
  gmPatch: LocationRoomAdventurePatch
  declaredAction: LocationRoomDeclaredAction | null
  tokenId: number
  beatId: string
  output: GameMasterBeatOutput
}): Record<string, unknown> {
  const beatSourceId = adventureSourceIdForBeat(input.beatId)
  let metadata = mergeAdventureMetadata(input.metadata, input.gmPatch, { sourceId: beatSourceId })
  metadata = recordAdventureDeclaredAction(metadata, input.declaredAction, {
    tokenId: input.tokenId,
    beatId: input.beatId,
  })
  metadata = mergeAdventureMetadata(metadata, buildLastBeatOutcome(input.output, beatSourceId), { sourceId: beatSourceId })
  return metadata
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

const SAFE_GM_GENERATION_RECOVERIES = new Set<GameMasterGenerationRecoveryKey>([
  'adventure_patch_defaulted_from_model_prose',
  'scene_check_request_dropped_invalid_optional',
  'scene_check_adventure_patch_defaulted_from_model_prose',
  'scene_check_escalation_normalized',
])

function normalizeDiagnosticsCategory(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return SAFE_GM_GENERATION_ERROR_CATEGORIES.has(value) ? value : undefined
}

function normalizeDiagnosticsTransportStage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return SAFE_GM_GENERATION_TRANSPORT_STAGES.has(value) ? value : undefined
}

function normalizeDiagnosticsRecoveries(value: unknown): GameMasterGenerationRecoveryKey[] | undefined {
  if (!Array.isArray(value)) return undefined
  const recoveries = value.filter((item): item is GameMasterGenerationRecoveryKey =>
    typeof item === 'string' && SAFE_GM_GENERATION_RECOVERIES.has(item as GameMasterGenerationRecoveryKey)
  )
  const unique = Array.from(new Set(recoveries))
  return unique.length > 0 ? unique : undefined
}

function normalizeDiagnosticsLength(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.min(100000, Math.floor(value)))
}

function normalizeDiagnosticsFlags(value: unknown): GameMasterGenerationResponseFlags | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const flags = value as Partial<Record<keyof GameMasterGenerationResponseFlags, unknown>>
  return {
    empty: flags.empty === true,
    hasJsonObject: flags.hasJsonObject === true,
    fencedJson: flags.fencedJson === true,
    startsWithJsonObject: flags.startsWithJsonObject === true,
  }
}

function sanitizeGameMasterGenerationDiagnostics(value: unknown): GameMasterGenerationDiagnostics | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Partial<Record<keyof GameMasterGenerationDiagnostics, unknown>>
  const status = source.status === 'accepted' || source.status === 'repaired' || source.status === 'repair_failed'
    ? source.status
    : null
  if (!status) return null

  return {
    status,
    repairAttempted: source.repairAttempted === true,
    repaired: source.repaired === true,
    ...(normalizeDiagnosticsCategory(source.initialErrorCategory)
      ? { initialErrorCategory: normalizeDiagnosticsCategory(source.initialErrorCategory) }
      : {}),
    ...(normalizeDiagnosticsCategory(source.repairErrorCategory)
      ? { repairErrorCategory: normalizeDiagnosticsCategory(source.repairErrorCategory) }
      : {}),
    ...(normalizeDiagnosticsTransportStage(source.transportStage)
      ? { transportStage: normalizeDiagnosticsTransportStage(source.transportStage) }
      : {}),
    ...(source.fallbackUsed === true ? { fallbackUsed: true } : {}),
    ...(normalizeDiagnosticsRecoveries(source.recoveries)
      ? { recoveries: normalizeDiagnosticsRecoveries(source.recoveries) }
      : {}),
    ...(normalizeDiagnosticsLength(source.initialResponseLength) !== undefined
      ? { initialResponseLength: normalizeDiagnosticsLength(source.initialResponseLength) }
      : {}),
    ...(normalizeDiagnosticsLength(source.repairResponseLength) !== undefined
      ? { repairResponseLength: normalizeDiagnosticsLength(source.repairResponseLength) }
      : {}),
    ...(normalizeDiagnosticsFlags(source.initialResponseFlags)
      ? { initialResponseFlags: normalizeDiagnosticsFlags(source.initialResponseFlags) }
      : {}),
    ...(normalizeDiagnosticsFlags(source.repairResponseFlags)
      ? { repairResponseFlags: normalizeDiagnosticsFlags(source.repairResponseFlags) }
      : {}),
  }
}

function getGameMasterGenerationDiagnostics(error: unknown): GameMasterGenerationDiagnostics | null {
  if (error instanceof GameMasterBeatGenerationError || error instanceof GameMasterSceneCheckOutcomeGenerationError) {
    return sanitizeGameMasterGenerationDiagnostics(error.diagnostics)
  }
  if (!error || typeof error !== 'object') return null
  return sanitizeGameMasterGenerationDiagnostics((error as { diagnostics?: unknown }).diagnostics)
}

function getSceneCheckOutcomeFailureDiagnostics(error: unknown): GameMasterGenerationDiagnostics {
  return getGameMasterGenerationDiagnostics(error) ?? {
    status: 'repair_failed',
    repairAttempted: false,
    repaired: false,
    initialErrorCategory: 'validation_error',
  }
}

function ttrpgPhaseRank(phase: GameMasterBeatOutput['ttrpgPhase']): number {
  if (phase === 'story') return 0
  if (phase === 'exploration') return 1
  if (phase === 'threat') return 2
  if (phase === 'combat') return 3
  if (phase === 'aftermath') return 4
  return 0
}

function combatReadinessRank(readiness: GameMasterBeatOutput['combatReadiness']): number {
  if (readiness === 'none') return 0
  if (readiness === 'foreshadow') return 1
  if (readiness === 'ready') return 2
  return 0
}

function isPublicGameMasterEscalation(
  narrativeState: { metadata: Record<string, unknown> },
  output: GameMasterBeatOutput
): boolean {
  const before = normalizeNarrativeTtrpgMetadata(narrativeState.metadata)
  const previousThreatLevel = before.threatLevel ?? 0
  const nextThreatLevel = output.threatLevel ?? 0

  return ttrpgPhaseRank(output.ttrpgPhase) > ttrpgPhaseRank(before.ttrpgPhase) ||
    combatReadinessRank(output.combatReadiness) > combatReadinessRank(before.combatReadiness) ||
    nextThreatLevel > previousThreatLevel
}

function shouldAppendGameMasterMessage(input: {
  beat: LocationRoomNarrativeBeat
  output: GameMasterBeatOutput
  narrativeState: { metadata: Record<string, unknown> }
  progressionContext: GameMasterBeatProgressionContext
}): boolean {
  if (!input.output.publicNarration) return false
  if (['game_master_message_appended', 'character_appended', 'completed'].includes(input.beat.status)) return false
  if (input.progressionContext.requirePublicNarration) return true
  if (input.output.requestedGameplayAction === 'start_combat') return true
  return isPublicGameMasterEscalation(input.narrativeState, input.output)
}

function isOptionalSceneCheckPhase(output: GameMasterBeatOutput): boolean {
  return !output.requestedGameplayAction &&
    (output.ttrpgPhase === 'story' || output.ttrpgPhase === 'exploration')
}

function toCharacterNarrativeContext(
  output: GameMasterBeatOutput,
  activeDecision: LocationRoomAdventureMemory['activeDecision'],
  visiblePublicNarration: string | null,
  adventureMemory: LocationRoomAdventureMemory
): LocationRoomNarrativeTurnContext {
  return {
    stateSummary: output.stateAfter.stateSummary,
    currentObjective: output.stateAfter.currentObjective,
    openThreads: output.stateAfter.openThreads,
    speakerInstruction: output.speakerInstruction,
    publicNarration: visiblePublicNarration,
    activeDecision,
    spatialContext: adventureMemory.spatialContext,
    sceneCheck: output.sceneCheckRequest
      ? {
        mode: 'requested',
        request: output.sceneCheckRequest,
        contextualChecks: output.sceneCheckRequest.contextualChecks,
      }
      : isOptionalSceneCheckPhase(output)
        ? {
          mode: 'optional',
          request: null,
          contextualChecks: [],
        }
        : null,
  }
}

type SceneCheckFallbackCandidate = Required<Pick<SceneCheckFallback, 'actionIntent' | 'summary' | 'rollChoice' | 'difficulty'>>

function addFallbackCandidate(
  candidates: SceneCheckFallbackCandidate[],
  candidate: SceneCheckFallbackCandidate
): void {
  const checkType = candidate.rollChoice?.checkType
  if (candidates.some((existing) => existing.actionIntent === candidate.actionIntent && existing.rollChoice?.checkType === checkType)) {
    return
  }
  candidates.push(candidate)
}

function buildSceneCheckFallbackCandidates(input: {
  summary: string
  text: string
}): SceneCheckFallbackCandidate[] {
  const candidates: SceneCheckFallbackCandidate[] = []
  const { summary, text } = input

  if (/\b(decipher|decode|interpret|translate)\b/.test(text) || /\bread\s+(?:the\s+|these\s+|those\s+)?(?:runes?|glyphs?|sigils?|inscriptions?|symbols?|marks?|scratches?)\b/.test(text)) {
    addFallbackCandidate(candidates, {
      actionIntent: 'recall_lore',
      summary,
      rollChoice: { source: 'fixed', checkType: 'arcana' },
      difficulty: 'normal',
    })
  }

  if (/\b(search|scour|look\s+for|seek)\b/.test(text)) {
    addFallbackCandidate(candidates, {
      actionIntent: 'search',
      summary,
      rollChoice: { source: 'fixed', checkType: 'perception' },
      difficulty: 'normal',
    })
  }

  if (/\b(track)\b/.test(text) || /\bfollow\s+(?:the\s+)?(?:trail|tracks|prints?)\b/.test(text)) {
    addFallbackCandidate(candidates, {
      actionIntent: 'track',
      summary,
      rollChoice: { source: 'fixed', checkType: 'survival' },
      difficulty: 'normal',
    })
  }

  if (/\b(inspect|examine|investigate|study|scrutinize|analy[sz]e|probe)\b/.test(text)) {
    addFallbackCandidate(candidates, {
      actionIntent: 'examine',
      summary,
      rollChoice: { source: 'fixed', checkType: 'investigate' },
      difficulty: 'normal',
    })

    if (/\b(look|watch|listen|scan|spot|notice|marks?|scratches|dust|shelf|latch|door|room|wall)\b/.test(text)) {
      addFallbackCandidate(candidates, {
        actionIntent: 'examine',
        summary,
        rollChoice: { source: 'fixed', checkType: 'perception' },
        difficulty: 'normal',
      })
    }
  }

  if (/\b(route|path|passage|exit|cross|climb|navigate|way\s+through|press\s+on)\b/.test(text)) {
    addFallbackCandidate(candidates, {
      actionIntent: 'navigate',
      summary,
      rollChoice: { source: 'fixed', checkType: 'explore' },
      difficulty: 'normal',
    })
  }

  if (/\b(sneak|hide|creep|slip|quietly|unseen|shadow)\b/.test(text)) {
    addFallbackCandidate(candidates, {
      actionIntent: 'sneak',
      summary,
      rollChoice: { source: 'fixed', checkType: 'stealth' },
      difficulty: 'normal',
    })
  }

  if (/\b(persuade|convince|plead|bargain|negotiate|parley)\b/.test(text)) {
    addFallbackCandidate(candidates, {
      actionIntent: 'persuade',
      summary,
      rollChoice: { source: 'fixed', checkType: 'persuasion' },
      difficulty: 'normal',
    })
  }

  if (/\b(intimidate|threaten|cow|command|stare\s+down)\b/.test(text)) {
    addFallbackCandidate(candidates, {
      actionIntent: 'intimidate',
      summary,
      rollChoice: { source: 'fixed', checkType: 'intimidation' },
      difficulty: 'normal',
    })
  }

  if (/\b(tend|bind|heal|wound|injury|steady|soothe)\b/.test(text)) {
    addFallbackCandidate(candidates, {
      actionIntent: 'tend',
      summary,
      rollChoice: { source: 'fixed', checkType: 'medicine' },
      difficulty: 'normal',
    })
  }

  return candidates
}

function inferSceneCheckFallbackFromDeclaredAction(input: {
  declaredAction: LocationRoomDeclaredAction | null
  content: string
  output: GameMasterBeatOutput
  recentMessages: LocationRoomMessage[]
}): SceneCheckFallback | null {
  if (!isOptionalSceneCheckPhase(input.output)) return null

  const summary = input.declaredAction?.summary?.trim() || input.content
  const actionIntent = input.declaredAction?.actionIntent?.trim() ?? ''
  const text = `${actionIntent} ${summary}`.toLowerCase()
  if (!text.trim()) return null

  const candidates = buildSceneCheckFallbackCandidates({ summary, text })
  const primary = candidates[0]
  if (!primary) return null

  const repeatedRun = extractRecentSceneCheckPattern(input.recentMessages).repeatedRun
  const primaryCheckType = primary.rollChoice?.checkType
  if (repeatedRun && repeatedRun.count >= 2 && primaryCheckType === repeatedRun.checkType) {
    const alternative = candidates.find((candidate) => candidate.rollChoice?.checkType !== repeatedRun.checkType)
    if (alternative) return alternative
  }

  return primary
}

function messageIdsWith(existing: string[], id: string): string[] {
  return existing.includes(id) ? existing : [...existing, id]
}

function sceneCheckIdForBeat(
  beat: LocationRoomNarrativeBeat,
  existingId: string | null,
  adjudication: SceneCheckAdjudication
): string {
  if (existingId) return existingId
  if (adjudication.decision !== 'run') return `scene_check:${beat.id}`
  const sourceId = adjudication.request?.id ?? adjudication.proposal?.id
  return sourceId ? `scene_check:${beat.id}:${sourceId}` : `scene_check:${beat.id}`
}

function sceneRollCardContent(publicRolls: PublicLocationRoomGameplayRolls): string {
  const action = publicRolls.action
  const checkLabel = action.checkLabel?.trim() || action.checkType?.replace(/_/g, ' ') || action.actionType.replace(/_/g, ' ')
  const total = typeof action.total === 'number' ? ` total ${action.total}` : null
  const dc = typeof action.dc === 'number' ? ` vs DC ${action.dc}` : null
  const outcome = action.outcome && action.outcome !== 'unknown'
    ? ` — ${action.outcome.replace(/_/g, ' ')}`
    : null

  return [
    checkLabel ? `The scene ${checkLabel} check resolves` : 'The scene check resolves',
    total,
    dc,
    outcome,
  ].filter(Boolean).join('') + '.'
}

type SceneCheckRng = () => number

export class DefaultLocationRoomNarrativeCoordinator implements LocationRoomNarrativeCoordinator {
  constructor(
    private readonly repository: LocationRoomRepository = locationRoomRepository,
    private readonly narrativeRepository: LocationRoomNarrativeRepository = locationRoomNarrativeRepository,
    private readonly gameMasterGenerator: GameMasterBeatGenerator = officialGameMasterBeatGenerator,
    private readonly turnGenerator: OfficialLocationRoomTurnGenerator = officialLocationRoomTurnGenerator,
    private readonly gameMasterAgentResolver: GameMasterAgentResolver = gameMasterAgentService,
    private readonly sceneCheckRng: SceneCheckRng = Math.random
  ) {}

  async processTurn(input: ProcessNarrativeLocationRoomTurnInput): Promise<ProcessNarrativeLocationRoomTurnResult> {
    const resolvedGameMasterAgentId = await this.gameMasterAgentResolver.resolveRuntimeGameMasterAgentId()
    const locationDetails = await this.repository.getLocationDetails(input.room.locationId)
    const seedMetadata = refreshAdventureCatalogMetadataFromLocation(undefined, locationDetails?.metadata)
    let narrativeState = await this.narrativeRepository.ensureStateForRoom({
      room: input.room,
      ...(seedMetadata.changed ? { metadata: seedMetadata.metadata } : {}),
    })
    const refreshedMetadata = refreshAdventureCatalogMetadataFromLocation(narrativeState.metadata, locationDetails?.metadata)
    if (refreshedMetadata.changed) {
      narrativeState = await this.narrativeRepository.updateState(input.room, {
        metadata: refreshedMetadata.metadata,
      })
    }
    const publicAuthorMessageStats = await this.repository.getPublicAuthorMessageStats(input.room.id)
    const progressionContext = buildGameMasterBeatProgressionContext({
      room: input.room,
      narrativeState,
      publicAuthorMessageStats,
      recentMessages: input.recentMessages,
    })
    const stateBefore = toNarrativeStateSnapshot(narrativeState)
    let beat = await this.narrativeRepository.createOrReuseBeat({
      room: input.room,
      tick: input.tick,
      selectedTokenId: input.speaker.tokenId,
      gameMasterAgentId: resolvedGameMasterAgentId,
      stateBefore,
      metadata: {
        source: 'location-room-narrative-coordinator',
        roomId: input.room.id,
        locationId: input.room.locationId,
      },
    })
    const beatGameMasterAgentId = beat.gameMasterAgentId ?? resolvedGameMasterAgentId
    const beatAdventureSourceId = adventureSourceIdForBeat(beat.id)

    let gameMasterOutput: GameMasterBeatOutput
    if (isUsableGeneratedBeat(beat)) {
      gameMasterOutput = withSourcedGameMasterPatch(
        beatToOutput(beat, beatGameMasterAgentId, progressionContext),
        beatAdventureSourceId
      )
    } else {
      try {
        gameMasterOutput = await this.gameMasterGenerator.generateBeat({
          gameMasterAgentId: beatGameMasterAgentId,
          room: input.room,
          tick: input.tick,
          participants: input.participants,
          speaker: input.speaker,
          recentMessages: input.recentMessages,
          narrativeState,
          progressionContext,
        })
        validateGameMasterBeatProgressionContract({
          ...gameMasterOutput,
          progressionContext,
        })
        gameMasterOutput = withSourcedGameMasterPatch(gameMasterOutput, beatAdventureSourceId)
      } catch (error) {
        const gmGeneration = getGameMasterGenerationDiagnostics(error)
        if (gmGeneration) {
          await this.narrativeRepository.markBeatFailed(beat.id, error, {
            metadata: {
              ...beat.metadata,
              gmGeneration,
            },
          }).catch(() => null)
        }
        throw error
      }

      beat = await this.narrativeRepository.storeBeatGameMasterOutput(beat.id, {
        gameMasterAgentId: gameMasterOutput.gameMasterAgentId,
        publicNarration: gameMasterOutput.publicNarration,
        speakerInstruction: gameMasterOutput.speakerInstruction,
        stateAfter: gameMasterOutput.stateAfter,
        metadata: toGameMasterBeatMetadata(gameMasterOutput),
      })
    }

    const adventureAfterGameMasterPatch = normalizeAdventureMemory(
      mergeAdventureMetadata(narrativeState.metadata, gameMasterOutput.adventurePatch, { sourceId: beatAdventureSourceId })
    )

    const shouldAppendPublicGameMasterBeat = shouldAppendGameMasterMessage({
      beat,
      output: gameMasterOutput,
      narrativeState,
      progressionContext,
    })

    if (shouldAppendPublicGameMasterBeat) {
      const publicNarration = gameMasterOutput.publicNarration
      if (!publicNarration) {
        throw new Error('Location room narrative beat is missing public narration')
      }

      await this.repository.appendMessage({
        roomId: input.room.id,
        locationId: input.room.locationId,
        tickId: input.tick.id,
        authorKind: 'game_master',
        tokenId: null,
        officialAgentId: gameMasterOutput.gameMasterAgentId,
        authorName: GAME_MASTER_AUTHOR_NAME,
        content: publicNarration,
        visibility: 'public',
        dedupeKey: `narrative:${beat.id}:gm_beat`,
        metadata: {
          source: 'location-room-game-master',
          triggerType: input.tick.triggerType,
          beatId: beat.id,
          messageDomain: 'narrative',
          messageKind: 'gm_beat',
          ttrpgPhase: gameMasterOutput.ttrpgPhase,
        },
      })

      try {
        beat = await this.narrativeRepository.markBeatGameMasterMessageAppended(beat.id, {
          gameMasterAgentId: gameMasterOutput.gameMasterAgentId,
          publicNarration: gameMasterOutput.publicNarration,
          speakerInstruction: gameMasterOutput.speakerInstruction,
          stateAfter: gameMasterOutput.stateAfter,
          metadata: toGameMasterBeatMetadata(gameMasterOutput),
        })
      } catch (error) {
        console.warn('[Location Room Narrative] Failed to mark game-master message appended after public append:', error)
      }
    }

    let storedSceneCheck = normalizeNarrativeSceneCheckMetadata(beat.metadata)
    const storedCharacterAction = normalizeStoredBeatCharacterAction(beat.metadata.characterAction)
    let content = storedSceneCheck.characterAction?.content ?? storedCharacterAction?.content ?? null
    let officialAgentId = storedSceneCheck.characterAction?.officialAgentId ?? storedCharacterAction?.officialAgentId ?? null
    let sceneCheckProposal = storedSceneCheck.proposal
    let sceneCheckProposalError = storedSceneCheck.proposalError
    let declaredAction = normalizeDeclaredAction(beat.metadata.declaredAction, {
      activeDecision: adventureAfterGameMasterPatch.activeDecision,
    })

    if (!content) {
      const visiblePublicNarrationForBeat = shouldAppendPublicGameMasterBeat || beat.status === 'game_master_message_appended'
        ? gameMasterOutput.publicNarration
        : null
      const generated = await this.turnGenerator.generateTurn({
        room: input.room,
        speaker: input.speaker,
        participants: input.participants,
        recentMessages: input.recentMessages,
        narrativeContext: toCharacterNarrativeContext(
          gameMasterOutput,
          adventureAfterGameMasterPatch.activeDecision,
          visiblePublicNarrationForBeat,
          adventureAfterGameMasterPatch
        ),
      })
      content = normalizeLocationRoomGeneratedContent(generated.content)
      officialAgentId = generated.officialAgentId
      declaredAction = storeableDeclaredAction(generated.declaredAction, content ?? '', adventureAfterGameMasterPatch.activeDecision)
      sceneCheckProposal = generated.sceneCheckProposal ?? null
      sceneCheckProposalError = generated.sceneCheckProposalError ?? null
    }

    if (!content) {
      throw new Error('Official ElizaOS generated an empty location-room turn')
    }

    declaredAction = declaredAction ?? storeableDeclaredAction(null, content, adventureAfterGameMasterPatch.activeDecision)

    const sceneCheckFallback = !gameMasterOutput.sceneCheckRequest && !sceneCheckProposal && !storedSceneCheck.resolution
      ? inferSceneCheckFallbackFromDeclaredAction({
        declaredAction,
        content,
        output: gameMasterOutput,
        recentMessages: input.recentMessages,
      })
      : null

    let sceneCheckMetadata = (gameMasterOutput.sceneCheckRequest || sceneCheckProposal || sceneCheckProposalError || storedSceneCheck.resolution || sceneCheckFallback)
      ? mergeNarrativeSceneCheckMetadata({
        ...toGameMasterBeatMetadata(gameMasterOutput),
        declaredAction,
        characterAction: storeableCharacterAction({ content, officialAgentId, authorName: input.speaker.name }),
      }, {
        id: storedSceneCheck.id,
        proposal: sceneCheckProposal ?? null,
        proposalError: sceneCheckProposalError ?? null,
        adjudication: storedSceneCheck.adjudication,
        resolution: storedSceneCheck.resolution,
        publicRolls: storedSceneCheck.publicRolls,
        messageIds: storedSceneCheck.messageIds,
        characterAction: storedSceneCheck.characterAction,
        gmOutcome: storedSceneCheck.gmOutcome,
      })
      : {
        ...toGameMasterBeatMetadata(gameMasterOutput),
        declaredAction,
        characterAction: storeableCharacterAction({ content, officialAgentId, authorName: input.speaker.name }),
      }

    if (gameMasterOutput.sceneCheckRequest || sceneCheckProposal || sceneCheckProposalError || storedSceneCheck.resolution || sceneCheckFallback) {
      try {
        beat = await this.narrativeRepository.patchBeatMetadata(beat.id, sceneCheckMetadata)
        storedSceneCheck = normalizeNarrativeSceneCheckMetadata(beat.metadata)
      } catch (error) {
        console.warn('[Location Room Narrative] Failed to patch scene-check proposal metadata:', error)
      }
    } else if (declaredAction && !beat.metadata.declaredAction) {
      try {
        beat = await this.narrativeRepository.patchBeatMetadata(beat.id, sceneCheckMetadata)
      } catch (error) {
        console.warn('[Location Room Narrative] Failed to patch declared-action metadata:', error)
      }
    }

    const adjudication = storedSceneCheck.adjudication ?? adjudicateSceneCheck({
      actorTokenId: input.speaker.tokenId,
      actorName: input.speaker.name,
      request: storedSceneCheck.request,
      proposal: sceneCheckProposal,
      fallback: sceneCheckFallback,
    })

    if (adjudication.decision === 'skip') {
      const normalAdventureMetadata = mergeNormalAdventureMetadata({
        metadata: narrativeState.metadata,
        gmPatch: gameMasterOutput.adventurePatch,
        declaredAction,
        tokenId: input.speaker.tokenId,
        beatId: beat.id,
        output: gameMasterOutput,
      })
      const message = await this.repository.appendMessage({
        roomId: input.room.id,
        locationId: input.room.locationId,
        tickId: input.tick.id,
        authorKind: 'agent',
        tokenId: input.speaker.tokenId,
        officialAgentId,
        authorName: input.speaker.name,
        content,
        visibility: 'public',
        dedupeKey: `narrative:${beat.id}:character_reaction`,
        metadata: {
          source: 'scheduled-location-room-tick',
          triggerType: input.tick.triggerType,
          narrative: true,
          beatId: beat.id,
          messageDomain: 'narrative',
          messageKind: 'character_reaction',
          ttrpgPhase: gameMasterOutput.ttrpgPhase,
          ...(gameMasterOutput.sceneCheckRequest || sceneCheckProposal || sceneCheckProposalError || sceneCheckFallback
            ? {
              sceneCheck: {
                request: gameMasterOutput.sceneCheckRequest,
                proposal: sceneCheckProposal ?? null,
                proposalError: sceneCheckProposalError ?? null,
                adjudication,
              },
              sceneCheckRequest: gameMasterOutput.sceneCheckRequest,
              sceneCheckProposal: sceneCheckProposal ?? null,
              sceneCheckProposalError: sceneCheckProposalError ?? null,
            }
            : {}),
        },
      })

      try {
        if (sceneCheckProposal || sceneCheckProposalError) {
          await this.narrativeRepository.patchBeatMetadata(beat.id, mergeNarrativeSceneCheckMetadata(sceneCheckMetadata, {
            adjudication,
          }))
        }
        await this.narrativeRepository.markBeatCharacterAppended(beat.id)
        await this.narrativeRepository.updateState(input.room, {
          stateSummary: gameMasterOutput.stateAfter.stateSummary,
          currentObjective: gameMasterOutput.stateAfter.currentObjective,
          openThreads: gameMasterOutput.stateAfter.openThreads,
          metadata: mergeNarrativeTtrpgMetadata(normalAdventureMetadata, {
            ttrpgPhase: gameMasterOutput.ttrpgPhase,
            combatReadiness: gameMasterOutput.combatReadiness,
            threatLevel: gameMasterOutput.threatLevel,
            requestedGameplayAction: gameMasterOutput.requestedGameplayAction,
            lastEncounterSeed: gameMasterOutput.encounterSeed,
            lastCombatTriggerBeatId: gameMasterOutput.requestedGameplayAction === 'start_combat'
              ? beat.id
              : null,
          }, {
            source: 'location-room-narrative-coordinator',
            lastBeatId: beat.id,
            lastTickId: input.tick.id,
            lastSelectedTokenId: input.speaker.tokenId,
            ...(gameMasterOutput.combatReadiness === 'ready' && gameMasterOutput.requestedGameplayAction !== 'start_combat'
              ? {
                lastCombatReadyBeatId: beat.id,
                lastCombatReadyAt: new Date().toISOString(),
              }
              : {}),
          }),
        })
        await this.narrativeRepository.markBeatCompleted(beat.id)
      } catch (error) {
        await this.narrativeRepository.markBeatFailed(beat.id, error).catch(() => null)
      }

      const hasSceneCheckSignal = Boolean(storedSceneCheck.request || sceneCheckProposal || storedSceneCheck.proposal || sceneCheckProposalError || storedSceneCheck.proposalError || sceneCheckFallback)
      return {
        selectedTokenId: input.speaker.tokenId,
        messageId: message.id,
        ...(shouldAppendPublicGameMasterBeat ? { publicGameMasterBeatAppended: true } : {}),
        ...(hasSceneCheckSignal
          ? {
            sceneCheckDiagnostics: {
              requestPresent: Boolean(storedSceneCheck.request),
              proposalPresent: Boolean(sceneCheckProposal ?? storedSceneCheck.proposal),
              proposalErrorPresent: Boolean(sceneCheckProposalError ?? storedSceneCheck.proposalError),
              selected: false,
              skipReason: adjudication.reason,
            },
          }
          : {}),
      }
    }

    let messageIds: string[] = []
    const sceneCheckId = sceneCheckIdForBeat(beat, storedSceneCheck.id, adjudication)
    const sceneAdventureSourceId = adventureSourceIdForSceneCheck(sceneCheckId)
    sceneCheckMetadata = mergeNarrativeSceneCheckMetadata(sceneCheckMetadata, {
      id: sceneCheckId,
      adjudication,
      characterAction: storedSceneCheck.characterAction ?? {
        content,
        officialAgentId,
        authorName: input.speaker.name,
      },
    })
    beat = await this.narrativeRepository.patchBeatMetadata(beat.id, sceneCheckMetadata)
    storedSceneCheck = normalizeNarrativeSceneCheckMetadata(beat.metadata)
    let actionAdventureMetadata = mergeAdventureMetadata(narrativeState.metadata, gameMasterOutput.adventurePatch, {
      sourceId: beatAdventureSourceId,
    })
    actionAdventureMetadata = recordAdventureDeclaredAction(actionAdventureMetadata, declaredAction, {
      tokenId: input.speaker.tokenId,
      beatId: beat.id,
    })
    let actionMessageId = storedSceneCheck.messageIds.characterAction ?? null
    const characterActionContent = storedSceneCheck.characterAction?.content ?? content
    if (!actionMessageId) {
      const actionMessage = await this.repository.appendMessage({
        roomId: input.room.id,
        locationId: input.room.locationId,
        tickId: input.tick.id,
        authorKind: 'agent',
        tokenId: input.speaker.tokenId,
        officialAgentId,
        authorName: input.speaker.name,
        content: characterActionContent,
        visibility: 'public',
        dedupeKey: `scene_check:${beat.id}:character_action`,
        metadata: {
          source: 'scheduled-location-room-tick',
          triggerType: input.tick.triggerType,
          narrative: true,
          beatId: beat.id,
          sceneCheck: true,
          sceneCheckId,
          messageDomain: 'narrative',
          messageKind: 'character_action',
          ttrpgPhase: gameMasterOutput.ttrpgPhase,
          adjudication,
          sceneCheckRequest: storedSceneCheck.request,
          sceneCheckProposal: storedSceneCheck.proposal,
          sceneCheckProposalError: storedSceneCheck.proposalError,
        },
      })
      actionMessageId = actionMessage.id
    }
    messageIds = messageIdsWith(messageIds, actionMessageId)

    let resolution = storedSceneCheck.resolution
    let publicRolls = storedSceneCheck.publicRolls
    if (!resolution) {
      resolution = resolveSceneCheck({ adjudication, rng: this.sceneCheckRng })
      publicRolls = projectPublicSceneCheckRolls(resolution, { sceneCheckId })
      beat = await this.narrativeRepository.patchBeatMetadata(beat.id, mergeNarrativeSceneCheckMetadata(beat.metadata, {
        id: sceneCheckId,
        adjudication,
        resolution,
        publicRolls,
        messageIds: {
          ...storedSceneCheck.messageIds,
          characterAction: actionMessageId,
        },
      }))
      storedSceneCheck = normalizeNarrativeSceneCheckMetadata(beat.metadata)
    } else if (!publicRolls) {
      publicRolls = projectPublicSceneCheckRolls(resolution, { sceneCheckId })
    }

    let rollCardMessageId = storedSceneCheck.messageIds.rollCard ?? null
    if (!rollCardMessageId) {
      const rollCardMessage = await this.repository.appendMessage({
        roomId: input.room.id,
        locationId: input.room.locationId,
        tickId: input.tick.id,
        authorKind: 'game_master',
        tokenId: null,
        officialAgentId: gameMasterOutput.gameMasterAgentId,
        authorName: GAME_MASTER_AUTHOR_NAME,
        content: sceneRollCardContent(publicRolls),
        visibility: 'public',
        dedupeKey: `scene_check:${beat.id}:roll_card`,
        metadata: {
          source: 'location-room-scene-check',
          triggerType: input.tick.triggerType,
          narrative: true,
          beatId: beat.id,
          sceneCheck: true,
          sceneCheckId,
          messageDomain: 'narrative',
          messageKind: 'roll_card',
          ttrpgPhase: gameMasterOutput.ttrpgPhase,
          publicRolls,
        },
      })
      rollCardMessageId = rollCardMessage.id
    }
    messageIds = messageIdsWith(messageIds, rollCardMessageId)

    beat = await this.narrativeRepository.patchBeatMetadata(beat.id, mergeNarrativeSceneCheckMetadata(beat.metadata, {
      messageIds: {
        ...storedSceneCheck.messageIds,
        characterAction: actionMessageId,
        rollCard: rollCardMessageId,
      },
      publicRolls,
    }))
    storedSceneCheck = normalizeNarrativeSceneCheckMetadata(beat.metadata)

    let outcome = storedSceneCheck.gmOutcome
    if (!outcome) {
      const outcomeNarrativeState = {
        ...narrativeState,
        stateSummary: gameMasterOutput.stateAfter.stateSummary,
        currentObjective: gameMasterOutput.stateAfter.currentObjective,
        openThreads: gameMasterOutput.stateAfter.openThreads,
      }
      const outcomeInput = {
        gameMasterAgentId: gameMasterOutput.gameMasterAgentId,
        room: input.room,
        tick: input.tick,
        participants: input.participants,
        speaker: input.speaker,
        recentMessages: input.recentMessages,
        narrativeState: outcomeNarrativeState,
        characterAction: characterActionContent,
        sceneCheckId,
        resolution,
        publicRolls,
      }
      if (!this.gameMasterGenerator.generateSceneCheckOutcome) {
        const error = new Error('Game-master scene-check outcome generator is required')
        await this.narrativeRepository.markBeatFailed(beat.id, error, {
          metadata: {
            ...beat.metadata,
            gmGeneration: getSceneCheckOutcomeFailureDiagnostics(error),
          },
        }).catch(() => null)
        throw error
      }

      let generatedOutcome: GameMasterSceneCheckOutcomeOutput
      try {
        generatedOutcome = await this.gameMasterGenerator.generateSceneCheckOutcome(outcomeInput)
      } catch (error) {
        const gmGeneration = getSceneCheckOutcomeFailureDiagnostics(error)
        await this.narrativeRepository.markBeatFailed(beat.id, error, {
          metadata: {
            ...beat.metadata,
            gmGeneration,
          },
        }).catch(() => null)
        throw error
      }

      const outcomeAdventurePatch = withAdventurePatchSource(
        generatedOutcome.adventurePatch ?? generatedOutcome.metadata?.adventurePatch,
        sceneAdventureSourceId
      )
      outcome = {
        gameMasterAgentId: generatedOutcome.gameMasterAgentId,
        publicNarration: generatedOutcome.publicNarration,
        stateAfter: generatedOutcome.stateAfter,
        metadata: {
          ...generatedOutcome.metadata,
          adventurePatch: outcomeAdventurePatch,
          sceneCheckEscalation: generatedOutcome.escalation ?? generatedOutcome.metadata?.sceneCheckEscalation,
        },
      }
      beat = await this.narrativeRepository.patchBeatMetadata(beat.id, mergeNarrativeSceneCheckMetadata(beat.metadata, {
        gmOutcome: outcome,
      }))
      storedSceneCheck = normalizeNarrativeSceneCheckMetadata(beat.metadata)
    }

    const outcomeAdventurePatch = withAdventurePatchSource(outcome.metadata?.adventurePatch, sceneAdventureSourceId)
    let sceneAdventureMetadata = actionAdventureMetadata
    sceneAdventureMetadata = mergeAdventureMetadata(sceneAdventureMetadata, outcomeAdventurePatch, {
      sourceId: sceneAdventureSourceId,
    })
    sceneAdventureMetadata = mergeAdventureMetadata(sceneAdventureMetadata, buildLastSceneCheckOutcome({
      sceneSourceId: sceneAdventureSourceId,
      tier: resolution.roll.tier,
      summary: outcome.publicNarration,
    }), { sourceId: sceneAdventureSourceId })
    const storedEscalations = normalizeNarrativeSceneCheckEscalationMetadata(beat.metadata)
    const storedEscalation = storedEscalations.sceneCheckEscalations[sceneCheckId]
    const normalizedEscalationResult = storedEscalation
      ? {
        escalation: storedEscalation,
        ttrpgMetadataPatch: ttrpgPatchForSceneCheckEscalation(storedEscalation),
      }
      : normalizeSceneCheckEscalation({
        narrativeState: {
          currentObjective: outcome.stateAfter.currentObjective,
          openThreads: outcome.stateAfter.openThreads,
          metadata: sceneAdventureMetadata,
        },
        rawEscalation: outcome.metadata?.sceneCheckEscalation,
        recentOutcomeSummary: outcome.publicNarration,
        fallbackSummary: outcome.publicNarration,
        rollTier: resolution.roll.tier,
        selectedTokenId: resolution.actorTokenId,
      })
    const sceneCheckEscalation = normalizedEscalationResult.escalation
    const sceneCheckEscalationExtra = sceneCheckEscalationStorageExtra({
      metadata: sceneAdventureMetadata,
      sceneCheckId,
      escalation: sceneCheckEscalation,
    })
    let outcomeMessageId = storedSceneCheck.messageIds.gmOutcome ?? null
    if (!outcomeMessageId) {
      const outcomeMessage = await this.repository.appendMessage({
        roomId: input.room.id,
        locationId: input.room.locationId,
        tickId: input.tick.id,
        authorKind: 'game_master',
        tokenId: null,
        officialAgentId: outcome.gameMasterAgentId,
        authorName: GAME_MASTER_AUTHOR_NAME,
        content: outcome.publicNarration,
        visibility: 'public',
        dedupeKey: `scene_check:${beat.id}:gm_outcome`,
        metadata: {
          source: 'location-room-scene-check',
          triggerType: input.tick.triggerType,
          narrative: true,
          beatId: beat.id,
          sceneCheck: true,
          sceneCheckId,
          messageDomain: 'narrative',
          messageKind: 'gm_outcome',
          ttrpgPhase: gameMasterOutput.ttrpgPhase,
          rollFacts: {
            actorTokenId: resolution.actorTokenId,
            actionIntent: resolution.actionIntent,
            checkType: resolution.roll.checkType,
            checkLabel: resolution.roll.checkLabel,
            d20: resolution.roll.roll.total,
            modifier: resolution.roll.modifier,
            total: resolution.roll.total,
            dc: resolution.roll.dc,
            tier: resolution.roll.tier,
          },
          sceneCheckEscalation,
        },
      })
      outcomeMessageId = outcomeMessage.id
    }
    messageIds = messageIdsWith(messageIds, outcomeMessageId)

    const sceneCheckTtrpgPatch = preserveUnrelatedCombatTriggerForSceneCheck({
      metadata: sceneAdventureMetadata,
      patch: {
        ttrpgPhase: gameMasterOutput.ttrpgPhase,
        combatReadiness: gameMasterOutput.combatReadiness,
        threatLevel: gameMasterOutput.threatLevel,
        lastEncounterSeed: gameMasterOutput.encounterSeed,
        ...normalizedEscalationResult.ttrpgMetadataPatch,
        requestedGameplayAction: null,
        lastCombatTriggerBeatId: null,
      },
      beatId: beat.id,
      sceneCheckId,
      sceneSourceId: sceneAdventureSourceId,
    })

    try {
      await this.narrativeRepository.patchBeatMetadata(beat.id, mergeNarrativeSceneCheckMetadata({
        ...beat.metadata,
        ...sceneCheckEscalationExtra,
      }, {
        messageIds: {
          ...storedSceneCheck.messageIds,
          characterAction: actionMessageId,
          rollCard: rollCardMessageId,
          gmOutcome: outcomeMessageId,
        },
      }))
      await this.narrativeRepository.markBeatCharacterAppended(beat.id)
      await this.narrativeRepository.updateState(input.room, {
        stateSummary: outcome.stateAfter.stateSummary,
        currentObjective: outcome.stateAfter.currentObjective,
        openThreads: outcome.stateAfter.openThreads,
        metadata: mergeNarrativeTtrpgMetadata(sceneAdventureMetadata, sceneCheckTtrpgPatch, {
          source: 'location-room-scene-check',
          lastBeatId: beat.id,
          lastTickId: input.tick.id,
          lastSelectedTokenId: input.speaker.tokenId,
          lastSceneCheckId: sceneCheckId,
          lastSceneCheckOutcome: resolution.roll.tier,
          ...sceneCheckEscalationExtra,
          ...(sceneCheckEscalation.decision === 'combat_ready'
            ? {
              lastCombatReadyBeatId: beat.id,
              lastCombatReadySceneCheckId: sceneCheckId,
              lastCombatReadyAt: new Date().toISOString(),
            }
            : {}),
        }),
      })
      await this.narrativeRepository.markBeatCompleted(beat.id)
    } catch (error) {
      await this.narrativeRepository.markBeatFailed(beat.id, error).catch(() => null)
    }

    return {
      selectedTokenId: input.speaker.tokenId,
      messageId: outcomeMessageId,
      messageIds,
      sceneCheckId,
      ...(shouldAppendPublicGameMasterBeat ? { publicGameMasterBeatAppended: true } : {}),
      sceneCheckDiagnostics: {
        requestPresent: Boolean(storedSceneCheck.request),
        proposalPresent: Boolean(storedSceneCheck.proposal),
        proposalErrorPresent: Boolean(storedSceneCheck.proposalError),
        selected: true,
      },
    }
  }

  async markTickFailed(tickId: string, error: unknown, options: { dead?: boolean } = {}): Promise<void> {
    const beat = await this.narrativeRepository.findBeatByTickId(tickId)
    if (!beat) return

    if (options.dead) {
      await this.narrativeRepository.markBeatDead(beat.id, error)
      return
    }

    await this.narrativeRepository.markBeatFailed(beat.id, error)
  }
}

export const locationRoomNarrativeCoordinator = new DefaultLocationRoomNarrativeCoordinator()
