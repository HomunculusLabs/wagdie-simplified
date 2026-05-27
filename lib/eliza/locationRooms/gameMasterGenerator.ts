import { elizaConfig } from '@/lib/eliza/config'
import { normalizeLocationAdventureCatalog } from '@/lib/domain/location/metadata'
import {
  createOfficialElizaMessagingClient,
  normalizeOfficialResponseText,
  type OfficialElizaMessagingClient,
} from '@/lib/eliza/official/messaging'
import {
  OFFICIAL_ELIZA_MESSAGE_MAX_BYTES,
  clampOfficialElizaText,
  clampOfficialElizaTextPreservingSuffix,
  sanitizeOfficialElizaText,
} from '@/lib/eliza/official/text'
import { normalizeSceneCheckRequest } from './sceneChecks/rules'
import {
  buildRecentSceneCheckPatternLines,
  hasDuplicateRecentOutcomeOpening,
} from './sceneChecks/recentPatterns'
import {
  SCENE_CHECK_ACTION_INTENTS,
  type NormalizedSceneCheckRequest,
  type SceneCheckResolution,
} from './sceneChecks/types'
import {
  normalizeSceneCheckEscalation,
  visibleSceneCheckEscalationCatalogEntries,
} from './encounterEscalation'
import {
  LOCATION_ROOM_COMBAT_READINESS_VALUES,
  LOCATION_ROOM_TTRPG_PHASES,
  type LocationRoom,
  type PublicLocationRoomGameplayRolls,
  type LocationRoomCombatReadiness,
  type LocationRoomEncounterSeed,
  type LocationRoomMessage,
  type LocationRoomParticipant,
  type LocationRoomPublicAuthorMessageStats,
  type LocationRoomRequestedGameplayAction,
  type LocationRoomSceneCheckEscalation,
  type LocationRoomTick,
  type LocationRoomTtrpgPhase,
} from './types'
import {
  normalizeCombatReadiness,
  normalizeEncounterSeed,
  normalizeAdventureMemory,
  normalizeAdventurePatch,
  normalizeNarrativeSceneCheckEscalationMetadata,
  normalizeNarrativeTtrpgMetadata,
  normalizeRequestedGameplayAction,
  normalizeThreatLevel,
  normalizeTtrpgPhase,
  retrieveAdventureCatalogEntries,
  type LocationRoomAdventurePatch,
  type LocationRoomNarrativeState,
  type LocationRoomNarrativeStateSnapshot,
  type LocationRoomNarrativeTtrpgMetadataPatch,
  type LocationRoomSpatialContext,
} from './narrativeTypes'

export type GameMasterBeatLimits = {
  publicNarrationMaxLength: number
  stateSummaryMaxLength: number
  openThreadsMaxCount: number
  openThreadMaxLength: number
}

export type GameMasterGenerationResponseFlags = {
  empty: boolean
  hasJsonObject: boolean
  fencedJson: boolean
  startsWithJsonObject: boolean
}

export type GameMasterGenerationDiagnostics = {
  status: 'accepted' | 'repaired' | 'repair_failed'
  repairAttempted: boolean
  repaired: boolean
  fallbackUsed?: boolean
  initialErrorCategory?: string
  repairErrorCategory?: string
  initialResponseLength?: number
  repairResponseLength?: number
  initialResponseFlags?: GameMasterGenerationResponseFlags
  repairResponseFlags?: GameMasterGenerationResponseFlags
}

export type GameMasterBeatOutput = {
  gameMasterAgentId: string
  publicNarration: string | null
  speakerInstruction: string
  stateAfter: LocationRoomNarrativeStateSnapshot
  ttrpgPhase: LocationRoomTtrpgPhase
  combatReadiness: LocationRoomCombatReadiness
  threatLevel: number | null
  requestedGameplayAction: LocationRoomRequestedGameplayAction | null
  encounterSeed: LocationRoomEncounterSeed | null
  sceneCheckRequest: NormalizedSceneCheckRequest | null
  adventurePatch: LocationRoomAdventurePatch
  metadata: {
    currentObjective?: string | null
    featuredTokenIds?: number[]
    selectedSpeakerTokenId?: number
    rawResponseLength?: number
    ttrpgPhase?: LocationRoomTtrpgPhase
    combatReadiness?: LocationRoomCombatReadiness
    threatLevel?: number | null
    requestedGameplayAction?: LocationRoomRequestedGameplayAction | null
    encounterSeed?: LocationRoomEncounterSeed | null
    sceneCheckRequest?: NormalizedSceneCheckRequest | null
    sceneCheck?: {
      request?: NormalizedSceneCheckRequest | null
      proposal?: unknown
      proposalError?: unknown
    }
    adventurePatch?: LocationRoomAdventurePatch
    gmGeneration?: GameMasterGenerationDiagnostics
  }
}

export type GenerateGameMasterBeatInput = {
  gameMasterAgentId: string
  room: LocationRoom
  tick: LocationRoomTick
  participants: LocationRoomParticipant[]
  speaker: LocationRoomParticipant
  recentMessages: LocationRoomMessage[]
  narrativeState: LocationRoomNarrativeState
  progressionContext?: GameMasterBeatProgressionContext
}

export type GenerateGameMasterSceneCheckOutcomeInput = {
  gameMasterAgentId: string
  room: LocationRoom
  tick: LocationRoomTick
  participants: LocationRoomParticipant[]
  speaker: LocationRoomParticipant
  recentMessages: LocationRoomMessage[]
  narrativeState: LocationRoomNarrativeState
  characterAction: string
  sceneCheckId: string
  resolution: SceneCheckResolution
  publicRolls: PublicLocationRoomGameplayRolls
}

export type GameMasterSceneCheckOutcomeOutput = {
  gameMasterAgentId: string
  publicNarration: string
  stateAfter: LocationRoomNarrativeStateSnapshot
  adventurePatch: LocationRoomAdventurePatch
  escalation?: LocationRoomSceneCheckEscalation
  ttrpgMetadataPatch?: LocationRoomNarrativeTtrpgMetadataPatch
  metadata: {
    rawResponseLength?: number
    fallbackUsed?: boolean
    adventurePatch?: LocationRoomAdventurePatch
    sceneCheckEscalation?: LocationRoomSceneCheckEscalation
  }
}

export type GameMasterBeatProgressionContext = {
  requirePublicNarration: boolean
  requireOpeningPublicNarration: boolean
  requireEscalationBeyondOpening: boolean
  publicNarrationRequirementReason:
    | 'no_prior_public_game_master_message'
    | 'repeated_activity_without_visible_escalation'
    | 'recurring_public_gm_beat_cadence'
    | null
  roomTickCount: number
  publicMessageCount: number
  publicGameMasterMessageCount: number
  publicAgentMessageCount: number
  publicGmBeatCadenceDue: boolean
  publicMessagesSinceLastGmBeat: number
  publicAgentMessagesSinceLastGmBeat: number
  publicSceneChecksSinceLastGmBeat: number
}

type ParsedBeat = Record<string, unknown>

const DEFAULT_GM_AUTHOR_NAME = 'Game Master'
const OPENING_PUBLIC_NARRATION_MIN_CHARS = 280
const OPENING_PUBLIC_NARRATION_MIN_SENTENCES = 3
const GM_PROMPT_TRANSCRIPT_MAX_CHARS = 800
const GM_PROMPT_STATE_SUMMARY_MAX_CHARS = 450
const GM_PROMPT_OBJECTIVE_MAX_CHARS = 240
const GM_PROMPT_OPEN_THREADS_MAX_CHARS = 500
const GM_PROMPT_ENCOUNTER_SEED_MAX_CHARS = 300
const GM_PROMPT_CONTRACT_MARKER = 'Return only JSON with this contract:'
const GM_SCENE_CHECK_OUTCOME_CONTRACT_MARKER = 'Return only a JSON object with this exact scene-check outcome contract:'
const OFFICIAL_ELIZA_PROMPT_TRUNCATION_NOTICE = '\n\n[Earlier context truncated to fit the Official ElizaOS safety budget.]\n\n'

function countSentenceLikeSegments(value: string): number {
  return value
    .split(/[.!?]+\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .length
}

function trimToLimit(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = normalizeOfficialResponseText(value)
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) return null
  return normalized.slice(0, limit).trim() || null
}

function parseOptionalString(value: unknown, limit: number): string | null {
  return trimToLimit(value, limit)
}

function parseRequiredString(value: unknown, limit: number, fieldName: string): string {
  const parsed = trimToLimit(value, limit)
  if (!parsed) {
    throw new Error(`Game-master beat response missing ${fieldName}`)
  }

  return parsed
}

function parseOpenThreads(value: unknown, limits: GameMasterBeatLimits): string[] {
  if (!Array.isArray(value) || limits.openThreadsMaxCount <= 0) return []

  const threads: string[] = []
  for (const item of value) {
    const thread = trimToLimit(item, limits.openThreadMaxLength)
    if (!thread) continue
    threads.push(thread)
    if (threads.length >= limits.openThreadsMaxCount) break
  }

  return threads
}

function parseTokenIds(value: unknown, fieldName: string): number[] {
  if (value == null) return []
  if (!Array.isArray(value)) {
    throw new Error(`Game-master beat response ${fieldName} must be an array`)
  }

  return value.map((item) => {
    const tokenId = typeof item === 'number' ? item : Number(item)
    if (!Number.isInteger(tokenId)) {
      throw new Error(`Game-master beat response ${fieldName} contains a non-integer token id`)
    }
    return tokenId
  })
}

function assertEligibleTokenIds(tokenIds: number[], eligibleTokenIds: Set<number>, fieldName: string): void {
  const ineligible = tokenIds.filter((tokenId) => !eligibleTokenIds.has(tokenId))
  if (ineligible.length > 0) {
    throw new Error(`Game-master beat response ${fieldName} referenced ineligible token id ${ineligible[0]}`)
  }
}

function parseTtrpgPhase(value: unknown): LocationRoomTtrpgPhase {
  if (value == null || value === '') return normalizeTtrpgPhase(value)
  if (typeof value !== 'string' || !LOCATION_ROOM_TTRPG_PHASES.includes(value as LocationRoomTtrpgPhase)) {
    throw new Error('Game-master beat response ttrpgPhase must be story, exploration, threat, or aftermath')
  }
  if (value === 'combat') {
    throw new Error('Game-master beat response ttrpgPhase must use threat before combat handoff')
  }
  return value as LocationRoomTtrpgPhase
}

function parseCombatReadiness(value: unknown): LocationRoomCombatReadiness {
  if (value == null || value === '') return normalizeCombatReadiness(value)
  if (typeof value !== 'string' || !LOCATION_ROOM_COMBAT_READINESS_VALUES.includes(value as LocationRoomCombatReadiness)) {
    throw new Error('Game-master beat response combatReadiness must be none, foreshadow, or ready')
  }
  return value as LocationRoomCombatReadiness
}

function parseThreatLevel(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error('Game-master beat response threatLevel must be a number from 0 to 5')
  }
  const normalized = normalizeThreatLevel(value)
  if (normalized == null) {
    throw new Error('Game-master beat response threatLevel must be a number from 0 to 5')
  }
  return normalized
}

function parseRequestedGameplayAction(value: unknown): LocationRoomRequestedGameplayAction | null {
  if (value == null || value === '') return null
  const normalized = normalizeRequestedGameplayAction(value)
  if (normalized !== 'start_combat') {
    throw new Error('Game-master beat response requestedGameplayAction must be null or start_combat')
  }
  return normalized
}

function parseEncounterSeed(value: unknown): LocationRoomEncounterSeed | null {
  if (value == null || value === '') return null
  const normalized = normalizeEncounterSeed(value)
  if (!normalized) {
    throw new Error('Game-master beat response encounterSeed must include public-safe title, summary, or stakes')
  }
  return normalized
}

function parseSceneCheckRequest(value: unknown): NormalizedSceneCheckRequest | null {
  if (value == null || value === '') return null
  const normalized = normalizeSceneCheckRequest(value)
  if (!normalized.ok) {
    throw new Error(`Game-master beat response sceneCheckRequest is invalid: ${normalized.error}`)
  }
  return normalized.value
}

function isFlatOpeningState(input: {
  ttrpgPhase: LocationRoomTtrpgPhase
  combatReadiness: LocationRoomCombatReadiness
  threatLevel: number | null
}): boolean {
  return input.ttrpgPhase === 'story' &&
    input.combatReadiness === 'none' &&
    (input.threatLevel == null || input.threatLevel <= 0)
}

function messageMetadataRecord(message: LocationRoomMessage): Record<string, unknown> {
  return message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata)
    ? message.metadata as Record<string, unknown>
    : {}
}

function publicMessageKind(message: LocationRoomMessage): string | null {
  const metadata = messageMetadataRecord(message)
  const kind = metadata.messageKind
  if (typeof kind === 'string' && kind.trim()) return kind.trim()
  if (message.authorKind === 'game_master') return 'gm_beat'
  if (message.authorKind === 'agent') return 'character_reaction'
  return null
}

function publicGameMasterBeatCadence(
  recentMessages: LocationRoomMessage[],
  hasPriorPublicGameMasterBeat: boolean
): {
  due: boolean
  messagesSinceLastGmBeat: number
  agentMessagesSinceLastGmBeat: number
  sceneChecksSinceLastGmBeat: number
} {
  const latestPublicMessages = recentMessages.filter((message) => message.visibility === 'public')
  const lastGmBeatIndex = latestPublicMessages.map(publicMessageKind).lastIndexOf('gm_beat')
  if (lastGmBeatIndex < 0 && !hasPriorPublicGameMasterBeat) {
    return { due: false, messagesSinceLastGmBeat: 0, agentMessagesSinceLastGmBeat: 0, sceneChecksSinceLastGmBeat: 0 }
  }

  const sinceLastGmBeat = lastGmBeatIndex >= 0
    ? latestPublicMessages.slice(lastGmBeatIndex + 1)
    : latestPublicMessages
  const messageKinds = sinceLastGmBeat.map(publicMessageKind)
  const agentMessagesSinceLastGmBeat = messageKinds.filter((kind) => kind === 'character_reaction' || kind === 'character_action').length
  const sceneChecksSinceLastGmBeat = messageKinds.filter((kind) => kind === 'roll_card' || kind === 'gm_outcome').length
  const messagesSinceLastGmBeat = sinceLastGmBeat.length
  const cadenceConfig = elizaConfig.locationRooms.narrative
  const thresholdMet = agentMessagesSinceLastGmBeat >= cadenceConfig.publicGmBeatMaxAgentMessages ||
    sceneChecksSinceLastGmBeat >= cadenceConfig.publicGmBeatMaxSceneChecks
  return {
    due: thresholdMet && messagesSinceLastGmBeat >= cadenceConfig.publicGmBeatMinMessagesBetween,
    messagesSinceLastGmBeat,
    agentMessagesSinceLastGmBeat,
    sceneChecksSinceLastGmBeat,
  }
}

export function buildGameMasterBeatProgressionContext(input: {
  room: Pick<LocationRoom, 'tickCount'>
  narrativeState: LocationRoomNarrativeState
  publicAuthorMessageStats: LocationRoomPublicAuthorMessageStats
  recentMessages?: LocationRoomMessage[]
}): GameMasterBeatProgressionContext {
  const ttrpg = normalizeNarrativeTtrpgMetadata(input.narrativeState.metadata)
  const requireOpeningPublicNarration = input.publicAuthorMessageStats.gameMasterMessageCount === 0
  const flatOpeningState = isFlatOpeningState({
    ttrpgPhase: ttrpg.ttrpgPhase,
    combatReadiness: ttrpg.combatReadiness,
    threatLevel: ttrpg.threatLevel,
  })
  const requireEscalationBeyondOpening = flatOpeningState &&
    (input.room.tickCount >= 2 || input.publicAuthorMessageStats.messageCount >= 3)
  const cadence = publicGameMasterBeatCadence(input.recentMessages ?? [], input.publicAuthorMessageStats.gameMasterMessageCount > 0)
  const requirePublicNarration = requireOpeningPublicNarration || requireEscalationBeyondOpening || cadence.due

  return {
    requirePublicNarration,
    requireOpeningPublicNarration,
    requireEscalationBeyondOpening,
    publicNarrationRequirementReason: requireOpeningPublicNarration
      ? 'no_prior_public_game_master_message'
      : requireEscalationBeyondOpening
        ? 'repeated_activity_without_visible_escalation'
        : cadence.due
          ? 'recurring_public_gm_beat_cadence'
          : null,
    roomTickCount: input.room.tickCount,
    publicMessageCount: input.publicAuthorMessageStats.messageCount,
    publicGameMasterMessageCount: input.publicAuthorMessageStats.gameMasterMessageCount,
    publicAgentMessageCount: input.publicAuthorMessageStats.agentMessageCount,
    publicGmBeatCadenceDue: cadence.due,
    publicMessagesSinceLastGmBeat: cadence.messagesSinceLastGmBeat,
    publicAgentMessagesSinceLastGmBeat: cadence.agentMessagesSinceLastGmBeat,
    publicSceneChecksSinceLastGmBeat: cadence.sceneChecksSinceLastGmBeat,
  }
}

const GENERIC_NARRATIVE_PHRASES = [
  'room shifts',
  'scene shifts',
  'pressure gathers',
  'danger gathers',
  'repeated hesitation',
  'something moves just out of sight',
  'standing still',
  'the room answers',
  'the room waits',
  'the room notices',
] as const

const CONCRETE_NARRATIVE_ANCHOR_PATTERN = /\b(?:altar|arch|ash|bar|beam|bell|bell rope|bench|blade|boat|book|bridge|candle|cart|cask|casks|cave|cellar|chain|chamber|chest|corridor|courtyard|crate|crow|crows|dock|door|doorway|feather|feathers|floor|floorboard|floorboards|forest|fountain|gate|glyph|grate|hall|idol|key|landing|lantern|lanterns|ledge|lever|lock|mark|marks|mask|mirror|passage|path|pit|platform|pool|rafter|rafters|river|road|rookery|roof|rope|route|salt|scratch|scratches|seam|shelf|shrine|shutter|shutters|stair|stairs|statue|stream|symbol|table|taproom|threshold|throne|torch|tower|track|tracks|tree|tunnel|wagon|wall|well|window)\b/i

function weakGenericNarrativePhrase(value: string): string | null {
  const normalized = value.toLowerCase().replace(/\s+/g, ' ')
  return GENERIC_NARRATIVE_PHRASES.find((phrase) => normalized.includes(phrase)) ?? null
}

function validateConcreteNarrativeText(
  value: string,
  options: { label: string; requireConcreteAnchor?: boolean }
): void {
  const normalized = normalizeOfficialResponseText(value).replace(/\s+/g, ' ').trim()
  if (!normalized) return

  const hasAnchor = CONCRETE_NARRATIVE_ANCHOR_PATTERN.test(normalized)
  const weakPhrase = weakGenericNarrativePhrase(normalized)
  if (weakPhrase && !hasAnchor) {
    throw new Error(`${options.label} uses generic pressure language without a concrete visible anchor: ${weakPhrase}`)
  }
  if (options.requireConcreteAnchor && !hasAnchor) {
    throw new Error(`${options.label} must name a concrete visible object, route, or threat anchor`)
  }
}

export function validateGameMasterBeatProgressionContract(output: {
  publicNarration?: string | null
  speakerInstruction?: string | null
  stateAfter: LocationRoomNarrativeStateSnapshot
  ttrpgPhase: LocationRoomTtrpgPhase
  combatReadiness: LocationRoomCombatReadiness
  threatLevel: number | null
  requestedGameplayAction: LocationRoomRequestedGameplayAction | null
  encounterSeed: LocationRoomEncounterSeed | null
  sceneCheckRequest?: NormalizedSceneCheckRequest | null
  adventurePatch?: LocationRoomAdventurePatch | null
  progressionContext?: GameMasterBeatProgressionContext
}): void {
  if (output.progressionContext?.requirePublicNarration && !output.publicNarration?.trim()) {
    throw new Error('Game-master beat response publicNarration is required by progression context')
  }

  if (output.progressionContext?.requireOpeningPublicNarration) {
    const publicNarration = output.publicNarration?.trim() ?? ''
    if (publicNarration.length < OPENING_PUBLIC_NARRATION_MIN_CHARS) {
      throw new Error('Game-master beat response opening publicNarration is too short for a useful scene opener')
    }
    if (countSentenceLikeSegments(publicNarration) < OPENING_PUBLIC_NARRATION_MIN_SENTENCES) {
      throw new Error('Game-master beat response opening publicNarration must include a fuller multi-sentence scene opener')
    }
  }

  if (
    output.progressionContext?.requireEscalationBeyondOpening &&
    isFlatOpeningState(output)
  ) {
    throw new Error('Game-master beat response must visibly escalate beyond flat opening state')
  }

  if (output.publicNarration?.trim()) {
    validateConcreteNarrativeText(output.publicNarration, {
      label: 'Game-master beat response publicNarration',
      requireConcreteAnchor: Boolean(output.progressionContext?.requirePublicNarration),
    })
  }

  if (output.ttrpgPhase !== 'aftermath') {
    if (!output.stateAfter.currentObjective) {
      throw new Error('Game-master beat response missing currentObjective for non-aftermath progression')
    }
    if (output.stateAfter.openThreads.length === 0) {
      throw new Error('Game-master beat response missing openThreads for non-aftermath progression')
    }

    const adventurePatch = output.adventurePatch ?? {}
    const hasAdventureMemoryPressure = Boolean(
      adventurePatch.activeDecision ||
      adventurePatch.currentStakes ||
      (adventurePatch.consequenceLedger?.length ?? 0) > 0 ||
      adventurePatch.lastOutcome ||
      (adventurePatch.discoveries?.length ?? 0) > 0 ||
      (adventurePatch.clocks?.length ?? 0) > 0
    )
    const publicNarrationReflectsPressure = Boolean(output.publicNarration?.trim() && output.publicNarration.trim().length >= 20)
    const characterDirectionReflectsPressure = Boolean(output.speakerInstruction?.trim() && output.speakerInstruction.trim().length >= 20)
    const pressureCanBeCarriedByCharacterTurn = !output.progressionContext?.requirePublicNarration && characterDirectionReflectsPressure
    const hasStoryPressure = Boolean(
      (hasAdventureMemoryPressure && (publicNarrationReflectsPressure || pressureCanBeCarriedByCharacterTurn)) ||
      output.sceneCheckRequest ||
      output.requestedGameplayAction === 'start_combat'
    )
    if (!hasStoryPressure) {
      throw new Error('Game-master beat response missing narrated story pressure for non-aftermath progression')
    }
  }

  if (output.combatReadiness === 'foreshadow' && (output.threatLevel == null || output.threatLevel < 1)) {
    throw new Error('Game-master beat response combatReadiness foreshadow requires threatLevel at least 1')
  }

  if (output.combatReadiness === 'ready') {
    if (output.ttrpgPhase !== 'threat') {
      throw new Error('Game-master beat response combatReadiness ready requires ttrpgPhase threat')
    }
    if (output.threatLevel == null || output.threatLevel < 3) {
      throw new Error('Game-master beat response combatReadiness ready requires threatLevel at least 3')
    }
  }

  if (output.requestedGameplayAction === 'start_combat' && output.sceneCheckRequest) {
    throw new Error('Game-master beat response must not combine start_combat with sceneCheckRequest')
  }

  if (output.requestedGameplayAction === 'start_combat') {
    if (output.ttrpgPhase !== 'threat') {
      throw new Error('Game-master beat response start_combat requires ttrpgPhase threat')
    }
    if (output.combatReadiness !== 'ready') {
      throw new Error('Game-master beat response start_combat requires combatReadiness ready')
    }
    if (!output.encounterSeed) {
      throw new Error('Game-master beat response start_combat requires public-safe encounterSeed')
    }
  }
}

export function extractGameMasterJsonObject(raw: string, label = 'Game-master beat response'): Record<string, unknown> {
  const text = normalizeOfficialResponseText(raw)
  if (!text) {
    throw new Error(`${label} was empty`)
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fenced?.[1] ?? text
  const firstBrace = candidate.indexOf('{')
  const lastBrace = candidate.lastIndexOf('}')
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error(`${label} did not contain a JSON object`)
  }

  try {
    const parsed = JSON.parse(candidate.slice(firstBrace, lastBrace + 1))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not_object')
    }
    return parsed as Record<string, unknown>
  } catch {
    throw new Error(`${label} contained invalid JSON`)
  }
}

function extractJsonObject(raw: string): ParsedBeat {
  return extractGameMasterJsonObject(raw) as ParsedBeat
}

function buildFallbackGameMasterBeat(
  input: GenerateGameMasterBeatInput,
  gameMasterAgentId: string,
  diagnostics: GameMasterGenerationDiagnostics
): GameMasterBeatOutput {
  const limits = elizaConfig.locationRooms.narrative
  const progressionContext = input.progressionContext
  const existingThreads = input.narrativeState.openThreads
    .map((thread) => trimToLimit(thread, limits.openThreadMaxLength))
    .filter((thread): thread is string => Boolean(thread))

  const publicNarration = progressionContext?.requirePublicNarration
    ? trimToLimit(
      progressionContext.requireOpeningPublicNarration
        ? 'The Crow\'s Den answers with objects, not silence: the bell rope twitches above the bar, black feathers slip from the rafters, and salt scratches mark the cellar stair. A shutter knocks open just enough to show the rookery path while the long table creaks toward the doorway. The characters can quiet the bell, test the stair, or watch the rafters, but each choice gives the tavern a different way to answer.'
        : 'The bell rope jerks once above the bar, shaking black feathers from the rafters while the cellar stair scrapes open another inch. The visible choice changes: control the bell, test the stair, or watch the rookery path before it closes.',
      limits.publicNarrationMaxLength
    )
    : null

  const stateAfter = {
    stateSummary: trimToLimit(
      input.narrativeState.stateSummary || 'The Crow\'s Den has exposed a bell rope, rafter signs, and cellar stair that wait on the characters\' response.',
      limits.stateSummaryMaxLength
    ) ?? 'The Crow\'s Den waits on a choice around the bell, rafters, or cellar stair.',
    currentObjective: trimToLimit(
      input.narrativeState.currentObjective || `Let ${input.speaker.name} choose how to engage the bell rope, rafters, or cellar stair.`,
      limits.stateSummaryMaxLength
    ),
    openThreads: (existingThreads.length > 0 ? existingThreads : [
      'What is watching from the Crow\'s Den?',
      'Which clue or danger will the characters pursue first?',
    ]).slice(0, limits.openThreadsMaxCount),
  }

  const ttrpgPhase: LocationRoomTtrpgPhase = progressionContext?.requireEscalationBeyondOpening ? 'exploration' : 'exploration'
  const combatReadiness: LocationRoomCombatReadiness = progressionContext?.requireEscalationBeyondOpening ? 'foreshadow' : 'none'
  const threatLevel = progressionContext?.requireEscalationBeyondOpening ? 1 : 0
  const adventurePatch = normalizeAdventurePatch({
    currentStakes: 'The bell rope, rafters, and cellar stair each offer a different risk if ignored.',
    lastOutcome: {
      kind: 'beat',
      sourceId: 'fallback-game-master-beat',
      summary: 'A visible Crow\'s Den feature changed and left the next response in the characters\' hands.',
    },
  })

  validateGameMasterBeatProgressionContract({
    publicNarration,
    speakerInstruction: `Respond in ${input.speaker.name}'s own voice to the changed bell, rafters, or cellar stair.`,
    stateAfter,
    ttrpgPhase,
    combatReadiness,
    threatLevel,
    requestedGameplayAction: null,
    encounterSeed: null,
    sceneCheckRequest: null,
    adventurePatch,
    progressionContext,
  })

  return {
    gameMasterAgentId,
    publicNarration,
    speakerInstruction: trimToLimit(
      `Respond in ${input.speaker.name}'s own voice. Choose one concrete hook to engage, reveal a reaction or intention, and leave room for the next character to answer.`,
      limits.stateSummaryMaxLength
    ) ?? `Respond in ${input.speaker.name}'s own voice and choose one concrete hook to engage.`,
    stateAfter,
    ttrpgPhase,
    combatReadiness,
    threatLevel,
    requestedGameplayAction: null,
    encounterSeed: null,
    sceneCheckRequest: null,
    adventurePatch,
    metadata: {
      currentObjective: stateAfter.currentObjective,
      featuredTokenIds: [input.speaker.tokenId],
      selectedSpeakerTokenId: input.speaker.tokenId,
      ttrpgPhase,
      combatReadiness,
      threatLevel,
      requestedGameplayAction: null,
      encounterSeed: null,
      sceneCheckRequest: null,
      sceneCheck: {
        request: null,
        proposal: null,
        proposalError: null,
      },
      adventurePatch,
      gmGeneration: {
        ...diagnostics,
        status: 'repaired',
        repairAttempted: true,
        repaired: false,
        fallbackUsed: true,
      },
    },
  }
}

export function normalizeGameMasterBeatResponse(
  raw: string,
  input: Pick<GenerateGameMasterBeatInput, 'participants' | 'speaker'>,
  options: {
    gameMasterAgentId: string
    limits?: GameMasterBeatLimits
    progressionContext?: GameMasterBeatProgressionContext
  }
): GameMasterBeatOutput {
  const limits = options.limits ?? elizaConfig.locationRooms.narrative
  const parsed = extractJsonObject(raw)
  const eligibleTokenIds = new Set(input.participants.map((participant) => participant.tokenId))

  const selectedSpeakerTokenIdValue = parsed.selectedSpeakerTokenId ?? parsed.selected_token_id
  const selectedSpeakerTokenId = selectedSpeakerTokenIdValue == null
    ? undefined
    : Number(selectedSpeakerTokenIdValue)

  if (selectedSpeakerTokenId !== undefined) {
    if (!Number.isInteger(selectedSpeakerTokenId)) {
      throw new Error('Game-master beat response selectedSpeakerTokenId must be an integer')
    }
    assertEligibleTokenIds([selectedSpeakerTokenId], eligibleTokenIds, 'selectedSpeakerTokenId')
    if (selectedSpeakerTokenId !== input.speaker.tokenId) {
      throw new Error('Game-master beat response selectedSpeakerTokenId did not match the selected speaker')
    }
  }

  const featuredTokenIds = parseTokenIds(parsed.featuredTokenIds ?? parsed.featured_token_ids, 'featuredTokenIds')
  assertEligibleTokenIds(featuredTokenIds, eligibleTokenIds, 'featuredTokenIds')

  const stateSummary = parseRequiredString(
    parsed.stateSummary ?? parsed.state_summary ?? parsed.updatedContinuitySummary,
    limits.stateSummaryMaxLength,
    'stateSummary'
  )
  const currentObjective = parseOptionalString(
    parsed.currentObjective ?? parsed.current_objective,
    limits.stateSummaryMaxLength
  )
  const openThreads = parseOpenThreads(parsed.openThreads ?? parsed.open_threads, limits)
  const speakerInstruction = parseRequiredString(
    parsed.speakerInstruction ?? parsed.speaker_instruction,
    limits.stateSummaryMaxLength,
    'speakerInstruction'
  )
  const ttrpgPhase = parseTtrpgPhase(parsed.ttrpgPhase ?? parsed.ttrpg_phase)
  const combatReadiness = parseCombatReadiness(parsed.combatReadiness ?? parsed.combat_readiness)
  const threatLevel = parseThreatLevel(parsed.threatLevel ?? parsed.threat_level)
  const requestedGameplayAction = parseRequestedGameplayAction(
    parsed.requestedGameplayAction ?? parsed.requested_gameplay_action
  )
  const encounterSeed = parseEncounterSeed(parsed.encounterSeed ?? parsed.encounter_seed)
  const sceneCheckRequest = parseSceneCheckRequest(parsed.sceneCheckRequest ?? parsed.scene_check_request)
  const adventurePatch = normalizeAdventurePatch(parsed.adventurePatch ?? parsed.adventure_patch)
  const publicNarration = parseOptionalString(
    parsed.publicNarration ?? parsed.public_narration,
    limits.publicNarrationMaxLength
  )
  const stateAfter = {
    stateSummary,
    currentObjective,
    openThreads,
  }

  validateGameMasterBeatProgressionContract({
    publicNarration,
    speakerInstruction,
    stateAfter,
    ttrpgPhase,
    combatReadiness,
    threatLevel,
    requestedGameplayAction,
    encounterSeed,
    sceneCheckRequest,
    adventurePatch,
    progressionContext: options.progressionContext,
  })

  return {
    gameMasterAgentId: options.gameMasterAgentId,
    publicNarration,
    speakerInstruction,
    stateAfter,
    ttrpgPhase,
    combatReadiness,
    threatLevel,
    requestedGameplayAction,
    encounterSeed,
    sceneCheckRequest,
    adventurePatch,
    metadata: {
      currentObjective,
      featuredTokenIds,
      selectedSpeakerTokenId,
      rawResponseLength: raw.length,
      ttrpgPhase,
      combatReadiness,
      threatLevel,
      requestedGameplayAction,
      encounterSeed,
      sceneCheckRequest,
      sceneCheck: {
        request: sceneCheckRequest,
        proposal: null,
        proposalError: null,
      },
      adventurePatch,
    },
  }
}

function truncatePromptValue(value: string, limit: number): string {
  const normalized = sanitizeOfficialElizaText(value).replace(/\s+/g, ' ').trim()
  return clampOfficialElizaText(normalized, { maxBytes: limit })
}

function clampGameMasterPrompt(prompt: string): string {
  return clampOfficialElizaTextPreservingSuffix(prompt, {
    suffixMarker: GM_PROMPT_CONTRACT_MARKER,
    maxBytes: OFFICIAL_ELIZA_MESSAGE_MAX_BYTES,
    truncationNotice: OFFICIAL_ELIZA_PROMPT_TRUNCATION_NOTICE,
  })
}

function formatParticipants(participants: LocationRoomParticipant[]): string {
  const maxParticipants = 12
  const visible = participants.slice(0, maxParticipants)
  const lines = visible.map((participant) => `- ${truncatePromptValue(participant.name, 80)} (#${participant.tokenId})`)
  if (participants.length > visible.length) {
    lines.push(`- …${participants.length - visible.length} additional eligible participants omitted for prompt size.`)
  }
  return lines.join('\n')
}

function formatTranscript(messages: LocationRoomMessage[]): string {
  if (messages.length === 0) return 'No public room messages yet.'

  const lines: string[] = []
  let total = 0

  for (const message of [...messages].reverse()) {
    const token = message.tokenId == null ? '' : ` #${message.tokenId}`
    const line = `${message.authorName}${token}: ${truncatePromptValue(message.content, 360)}`
    if (lines.length > 0 && total + line.length + 1 > GM_PROMPT_TRANSCRIPT_MAX_CHARS) {
      break
    }
    lines.unshift(line)
    total += line.length + 1
  }

  if (lines.length < messages.length) {
    lines.unshift(`Earlier transcript omitted for prompt size; showing latest ${lines.length} public message(s).`)
  }

  return lines.join('\n')
}

function formatOpenThreads(threads: string[]): string {
  if (threads.length === 0) return 'None.'
  const lines: string[] = []
  let total = 0
  for (const thread of threads) {
    const line = `- ${truncatePromptValue(thread, 160)}`
    if (lines.length > 0 && total + line.length + 1 > GM_PROMPT_OPEN_THREADS_MAX_CHARS) break
    lines.push(line)
    total += line.length + 1
  }
  return lines.join('\n') || 'None.'
}

function formatEncounterSeed(seed: LocationRoomEncounterSeed | null): string {
  if (!seed) return 'None.'
  return truncatePromptValue([
    seed.title ? `Title: ${seed.title}` : null,
    seed.summary ? `Summary: ${seed.summary}` : null,
    seed.stakes ? `Stakes: ${seed.stakes}` : null,
    seed.source ? `Source: ${seed.source}` : null,
    seed.catalogEntryIds?.length ? `Catalog: ${seed.catalogEntryIds.join(', ')}` : null,
    seed.encounterHints?.length ? `Encounter hints: ${seed.encounterHints.join(' | ')}` : null,
    seed.monsterHints?.length ? `Monster hints: ${seed.monsterHints.join(' | ')}` : null,
  ].filter(Boolean).join(' | ') || 'None.', GM_PROMPT_ENCOUNTER_SEED_MAX_CHARS)
}

function formatSceneCheckEscalation(escalation: LocationRoomSceneCheckEscalation | null): string {
  if (!escalation) return 'None.'
  return truncatePromptValue([
    `Decision: ${escalation.decision}`,
    `Danger kind: ${escalation.dangerKind}`,
    escalation.threatLevel != null ? `Threat: ${escalation.threatLevel}` : null,
    escalation.reason ? `Reason: ${escalation.reason}` : null,
    escalation.catalogEntryIds?.length ? `Catalog: ${escalation.catalogEntryIds.join(', ')}` : null,
    escalation.encounterSeed ? `Seed: ${formatEncounterSeed(escalation.encounterSeed)}` : null,
  ].filter(Boolean).join(' | '), 420)
}

function buildProgressionContextLines(context?: GameMasterBeatProgressionContext): string[] {
  if (!context) {
    return [
      'Public narration is optional unless the current room context requires a visible game-master beat.',
    ]
  }

  const lines = [
    'Progression context:',
    `Room tick count: ${context.roomTickCount}`,
    `Public messages: ${context.publicMessageCount} total, ${context.publicGameMasterMessageCount} game-master, ${context.publicAgentMessageCount} agent.`,
    `Since last public GM beat: ${context.publicMessagesSinceLastGmBeat} public messages, ${context.publicAgentMessagesSinceLastGmBeat} character/action messages, ${context.publicSceneChecksSinceLastGmBeat} roll/outcome messages.`,
  ]

  if (context.requirePublicNarration) {
    const reason = context.publicNarrationRequirementReason === 'no_prior_public_game_master_message'
      ? 'no prior public Game Master message exists.'
      : context.publicNarrationRequirementReason === 'recurring_public_gm_beat_cadence'
        ? 'recurring public GM beat cadence is due after character/roll/outcome activity.'
        : 'repeated room activity is still in flat opening state.'
    lines.push('Public narration is REQUIRED for this beat.')
    lines.push(`Reason: ${reason}`)
    if (context.publicNarrationRequirementReason === 'recurring_public_gm_beat_cadence') {
      lines.push('Cadence beat guidance: name one changed visible object or route, then give one actionable choice; do not rely on abstract pressure or room-shift language unless anchored to a concrete feature.')
    }
  } else {
    lines.push('Public narration is optional for this beat because a public Game Master message already exists and the scene is not stuck in flat opening state.')
  }

  if (context.requireEscalationBeyondOpening) {
    lines.push('This room has repeated activity while still in a flat opening state.')
    lines.push('Do not return ttrpgPhase="story" with combatReadiness="none" and threatLevel 0/null.')
    lines.push('Escalate visibly without forcing combat: use exploration, threat, combatReadiness "foreshadow", or threatLevel at least 1.')
    lines.push('requestedGameplayAction may remain null unless fiction clearly demands combat.')
  }

  return lines
}

function buildCombatReadyDecisionLines(ttrpg: ReturnType<typeof normalizeNarrativeTtrpgMetadata>): string[] {
  if (ttrpg.combatReadiness !== 'ready') return []
  return [
    'Combat-ready pressure is present from prior fiction.',
    '- Decide case-by-case whether this beat keeps danger as narrative pressure or emits requestedGameplayAction="start_combat".',
    '- If the fiction now clearly demands structured combat, you may use requestedGameplayAction="start_combat" with the last encounter seed.',
    '- If you keep readiness as narrative pressure, backend promotion may start combat on a later eligible auto tick after sustained readiness.',
  ]
}

function buildSceneCheckContractLines(): string[] {
  return [
    'Optional non-combat scene checks:',
    '- sceneCheckRequest: one non-combat roll/null for risky inspect/search/examine/decipher actions; actionIntent options and fixed rollChoice.checkType options are allowed.',
    '- contextualChecks: use only provided public-safe id/label/checkType/dc/description; backend sanitizes.',
    '- requestedGameplayAction is combat-only; never combine start_combat with sceneCheckRequest.',
  ]
}

function buildGameMasterBeatContractLines(input: Pick<GenerateGameMasterBeatInput, 'participants' | 'speaker' | 'progressionContext'>): string[] {
  const publicNarrationContract = input.progressionContext?.requirePublicNarration
    ? '"required public narration for observers"'
    : '"optional public narration for observers, or null"'

  return [
    'Return only JSON with this contract:',
    `{ "publicNarration": ${publicNarrationContract}, "speakerInstruction": "speaker-only direction", "stateSummary": "updated continuity", "currentObjective": "objective or null", "openThreads": ["thread"], "ttrpgPhase": "story | exploration | threat | aftermath", "combatReadiness": "none | foreshadow | ready", "threatLevel": 0, "requestedGameplayAction": null, "encounterSeed": null, "sceneCheckRequest": null, "adventurePatch": {"currentStakes":"risk","consequence":{"summary":"aftermath","status":"open"},"discoveries":["clue"],"clockUpdates":[{"id":"id","value":1,"max":6}],"spatialContext":{"currentArea":null,"landmarks":[],"routes":[],"unresolvedSpatialQuestions":[]}}, "featuredTokenIds": [123], "selectedSpeakerTokenId": ${input.speaker.tokenId} }`,
    '',
    'Rules:',
    '- JSON only; no markdown/prose outside object.',
    '- speakerInstruction/stateSummary required; use eligible token ids.',
    `- selectedSpeakerTokenId must be ${input.speaker.tokenId}.`,
    '- Keep public narration public-safe.',
    '- PublicNarration: concrete object/route/threat; no generic pressure-only copy.',
    ...(input.progressionContext?.requireOpeningPublicNarration
      ? [
        '- Opening publicNarration must be a rich table-setting GM beat: 3-5 sentences and roughly 300-650 characters.',
        '- Opening publicNarration must give players material to act on: sensory location detail, immediate situation, 2-3 interactable hooks, stakes/tension, and an unresolved prompt.',
        '- Do not make the opener a two-sentence summary. Do not solve the mystery, start combat, or speak for the selected character.',
        '- Opening speakerInstruction should give the selected character 2-3 concrete ways to respond in their own voice.',
      ]
      : []),
    '- Non-aftermath beats must include a concrete currentObjective and at least one unresolved openThreads entry.',
    '- Non-aftermath beats need narrated story pressure: adventurePatch reflected in prose/character direction, sceneCheckRequest, or combat.',
    '- adventurePatch is private continuity memory, not public UI copy; activeDecision is rare.',
    '- Keep publicNarration natural GM prose; do not list hidden memory labels.',
    '- clockUpdates use absolute values when a private clock changes.',
    '- Use adventurePatch.spatialContext additively for visible currentArea, landmarks, routes, and spatial questions; keep entries public-safe/bounded.',
    ...(input.progressionContext?.requirePublicNarration
      ? ['- publicNarration is required and must be non-empty for this beat; if this is cadence-only, re-anchor the visible scene without forcing combat.']
      : ['- publicNarration should be null for routine post-opener beats; use it only for visible transition/escalation, combat handoff, or explicitly necessary public narration.']),
    ...(input.progressionContext?.requireEscalationBeyondOpening
      ? ['- Do not leave repeated activity in flat story/none/0 state; visibly escalate without forcing start_combat.']
      : []),
    '- Use catalog entries only as bounded private inspiration; live adventure memory is more authoritative.',
    '- Most beats keep requestedGameplayAction null; start combat only when the current fiction supports a clear fight.',
    '- If current combatReadiness is ready from prior fiction or scene-check escalation, choose case-by-case: keep structured danger in narrative, or request start_combat when the fiction now clearly demands combat.',
    '- requestedGameplayAction "start_combat" requires clear fights plus threat/ready/threatLevel >= 3 and encounterSeed.',
    ...buildSceneCheckContractLines(),
  ]
}

function formatAdventureDecision(decision: ReturnType<typeof normalizeAdventureMemory>['activeDecision']): string {
  if (!decision) return 'None.'
  const options = decision.options
    .map((option) => `${option.id}: ${option.label}`)
    .join(' | ')
  const selected = decision.selectedOptionId ? ` | selected: ${decision.selectedOptionId}` : ''
  return truncatePromptValue(`${decision.id}: ${decision.prompt} | options: ${options}${selected}`, 140)
}

function formatSpatialContext(context: LocationRoomSpatialContext): string[] {
  const hasSpatialSignal = Boolean(
    context.currentArea ||
    context.landmarks.length > 0 ||
    context.routes.length > 0 ||
    context.unresolvedSpatialQuestions.length > 0
  )
  if (!hasSpatialSignal) return ['Spatial context: None.']
  return [
    'Spatial context (public-safe visible continuity; use as additive guidance):',
    `Current area: ${truncatePromptValue(context.currentArea || 'Unknown.', 160)}`,
    `Landmarks: ${context.landmarks.length > 0 ? truncatePromptValue(context.landmarks.join(' | '), 360) : 'None.'}`,
    `Routes: ${context.routes.length > 0 ? truncatePromptValue(context.routes.join(' | '), 420) : 'None.'}`,
    `Unresolved spatial questions: ${context.unresolvedSpatialQuestions.length > 0 ? truncatePromptValue(context.unresolvedSpatialQuestions.join(' | '), 320) : 'None.'}`,
  ]
}

function formatCompactSpatialContext(context: LocationRoomSpatialContext): string[] {
  const hasSpatialSignal = Boolean(context.currentArea || context.landmarks.length > 0 || context.routes.length > 0)
  if (!hasSpatialSignal) return []
  return [
    `Spatial context: area ${truncatePromptValue(context.currentArea || 'Unknown.', 80)}; landmarks ${truncatePromptValue(context.landmarks.join(' | ') || 'None.', 120)}; routes ${truncatePromptValue(context.routes.join(' | ') || 'None.', 140)}.`,
  ]
}

function formatAdventureMemoryLines(input: Pick<GenerateGameMasterBeatInput, 'narrativeState' | 'speaker'>): string[] {
  const adventure = normalizeAdventureMemory(input.narrativeState.metadata)
  const rawCatalog = input.narrativeState.metadata.adventureCatalog ??
    (typeof input.narrativeState.metadata.locationMetadata === 'object' && input.narrativeState.metadata.locationMetadata !== null && !Array.isArray(input.narrativeState.metadata.locationMetadata)
      ? (input.narrativeState.metadata.locationMetadata as Record<string, unknown>).adventureCatalog
      : undefined)
  const catalog = normalizeLocationAdventureCatalog(rawCatalog)
  const catalogEntries = retrieveAdventureCatalogEntries(catalog, {
    currentObjective: input.narrativeState.currentObjective,
    activeDecision: adventure.activeDecision,
    openThreads: input.narrativeState.openThreads,
    recentOutcomeSummary: adventure.lastOutcome?.summary,
    selectedTokenId: input.speaker.tokenId,
  })

  return [
    'Quiet private adventure memory (continuity guidance, not public panel copy):',
    `Active decision: ${formatAdventureDecision(adventure.activeDecision)}`,
    ...formatSpatialContext(adventure.spatialContext),
    'Relevant catalog inspiration (private; do not recite):',
    catalogEntries.length > 0
      ? catalogEntries.slice(0, 3).map((entry) => `- [${entry.section}] ${entry.id}${entry.title ? ` ${entry.title}` : ''}: ${truncatePromptValue(entry.summary, 90)}${entry.tags.length ? ` (tags: ${entry.tags.slice(0, 3).join(', ')})` : ''}`).join('\n')
      : 'None available.',
    `Arc summary: ${truncatePromptValue(adventure.arcSummary || 'None.', 500)}`,
    `Current stakes: ${truncatePromptValue(adventure.currentStakes || 'None.', 300)}`,
    adventure.consequenceLedger.length > 0
      ? `Consequence ledger: ${truncatePromptValue(adventure.consequenceLedger.map((entry) => `${entry.id} [${entry.status}${entry.tier ? `/${entry.tier}` : ''}]: ${entry.summary}`).join(' | '), 360)}`
      : 'Consequence ledger: None.',
    adventure.discoveries.length > 0
      ? `Discoveries: ${truncatePromptValue(adventure.discoveries.join(' | '), 520)}`
      : 'Discoveries: None.',
    adventure.clocks.length > 0
      ? `Clocks: ${truncatePromptValue(adventure.clocks.map((clock) => `${clock.id} ${clock.label} ${clock.value}/${clock.max}: ${clock.summary}`).join(' | '), 560)}`
      : 'Clocks: None.',
    adventure.lastDeclaredAction
      ? `Last declared action: #${adventure.lastDeclaredAction.tokenId} ${truncatePromptValue(adventure.lastDeclaredAction.summary, 240)}${adventure.lastDeclaredAction.chosenOptionId ? ` (option ${adventure.lastDeclaredAction.chosenOptionId})` : ''}`
      : 'Last declared action: None.',
    adventure.lastOutcome
      ? `Last outcome: ${adventure.lastOutcome.kind} ${adventure.lastOutcome.sourceId}${adventure.lastOutcome.tier ? `/${adventure.lastOutcome.tier}` : ''}: ${truncatePromptValue(adventure.lastOutcome.summary, 260)}`
      : 'Last outcome: None.',
  ]
}

function buildNarrativeStateLines(input: Pick<GenerateGameMasterBeatInput, 'narrativeState' | 'speaker'>): string[] {
  const ttrpg = normalizeNarrativeTtrpgMetadata(input.narrativeState.metadata)
  const sceneCheckEscalation = normalizeNarrativeSceneCheckEscalationMetadata(input.narrativeState.metadata)
  return [
    'Current private narrative state:',
    `Continuity summary: ${truncatePromptValue(input.narrativeState.stateSummary || 'No established continuity yet.', GM_PROMPT_STATE_SUMMARY_MAX_CHARS)}`,
    `Current objective: ${truncatePromptValue(input.narrativeState.currentObjective || 'None.', GM_PROMPT_OBJECTIVE_MAX_CHARS)}`,
    'Open threads:',
    formatOpenThreads(input.narrativeState.openThreads),
    `TTRPG phase: ${ttrpg.ttrpgPhase}`,
    `Combat readiness: ${ttrpg.combatReadiness}`,
    `Threat level: ${ttrpg.threatLevel ?? 'None.'}`,
    `Requested gameplay action: ${ttrpg.requestedGameplayAction ?? 'None.'}`,
    `Last encounter seed: ${formatEncounterSeed(ttrpg.lastEncounterSeed)}`,
    `Last scene-check escalation: ${formatSceneCheckEscalation(sceneCheckEscalation.lastSceneCheckEscalation)}`,
    ...buildCombatReadyDecisionLines(ttrpg),
    ...formatAdventureMemoryLines(input),
  ]
}

export function buildGameMasterBeatPrompt(input: GenerateGameMasterBeatInput): string {
  return clampGameMasterPrompt([
    'You are the private game master for a public WAGDIE location room.',
    'Plan exactly one narrative beat for the selected speaker. Do not directly create canon lore.',
    'Keep adventurePatch private; public transcript output should be natural narration, not visible state labels.',
    '',
    `Room id: ${input.room.id}`,
    `Location id: ${input.room.locationId}`,
    `Official room id: ${input.room.officialRoomId}`,
    `Channel id: ${input.room.channelId}`,
    `Tick id: ${input.tick.id}`,
    `Selected speaker: ${input.speaker.name} (#${input.speaker.tokenId})`,
    '',
    'Eligible current participants:',
    formatParticipants(input.participants),
    '',
    ...formatCompactSpatialContext(normalizeAdventureMemory(input.narrativeState.metadata).spatialContext),
    ...(input.progressionContext?.publicGmBeatCadenceDue
      ? ['', 'Cadence due: recurring public GM beat cadence is due; re-anchor visible space without starting combat unless an explicit combat trigger is justified.']
      : []),
    '',
    ...buildRecentSceneCheckPatternLines(input.recentMessages),
    '',
    'Recent public transcript:',
    formatTranscript(input.recentMessages),
    '',
    ...buildNarrativeStateLines(input),
    '',
    ...buildProgressionContextLines(input.progressionContext),
    '',
    ...buildGameMasterBeatContractLines(input),
  ].join('\n'))
}

function formatSceneCheckRollFacts(input: Pick<GenerateGameMasterSceneCheckOutcomeInput, 'resolution' | 'sceneCheckId' | 'characterAction'>): string[] {
  const roll = input.resolution.roll
  return [
    `Scene check id: ${input.sceneCheckId}`,
    `Actor: ${input.resolution.actorName ?? `#${input.resolution.actorTokenId}`} (#${input.resolution.actorTokenId})`,
    `Character action: ${truncatePromptValue(input.characterAction, 420)}`,
    `Action intent: ${input.resolution.actionIntent}`,
    `Check: ${roll.checkLabel} (${roll.checkType}, source ${roll.checkSource})`,
    `d20: ${roll.roll.total}`,
    `Modifier: ${roll.modifier}`,
    `Total: ${roll.total}`,
    `DC: ${roll.dc}`,
    `Outcome tier: ${roll.tier}`,
    `Request source: ${input.resolution.requestSource ?? 'none'}`,
    `Adjudication source: ${input.resolution.adjudicationSource}`,
  ]
}

function formatSceneCheckEscalationCatalogCandidates(narrativeState: LocationRoomNarrativeState): string[] {
  const rawCatalog = narrativeState.metadata.adventureCatalog ??
    (typeof narrativeState.metadata.locationMetadata === 'object' && narrativeState.metadata.locationMetadata !== null && !Array.isArray(narrativeState.metadata.locationMetadata)
      ? (narrativeState.metadata.locationMetadata as Record<string, unknown>).adventureCatalog
      : undefined)
  const catalog = normalizeLocationAdventureCatalog(rawCatalog)
  if (!catalog) return ['Escalation catalog candidates (80_encounters / 30_monsters): None available.']
  const encounterEntries = visibleSceneCheckEscalationCatalogEntries(catalog.sections['80_encounters'] ?? []).slice(0, 3)
  const monsterEntries = visibleSceneCheckEscalationCatalogEntries(catalog.sections['30_monsters'] ?? []).slice(0, 3)
  const candidateLines = [
    ...encounterEntries.map((entry) => `- [80_encounters] ${entry.id}${entry.title ? ` ${entry.title}` : ''}: ${truncatePromptValue(entry.summary, 120)}`),
    ...monsterEntries.map((entry) => `- [30_monsters] ${entry.id}${entry.title ? ` ${entry.title}` : ''}: ${truncatePromptValue(entry.summary, 120)}`),
  ]
  return [
    'Escalation catalog candidates (private; prefer for encounterSeed/catalogEntryIds when relevant):',
    candidateLines.length > 0 ? candidateLines.join('\n') : 'None available.',
  ]
}

function buildGameMasterSceneCheckOutcomeContractLines(): string[] {
  return [
    'Return only a JSON object with this exact scene-check outcome contract:',
    '{ "publicNarration":"public GM consequence", "stateSummary":"updated continuity", "currentObjective":"updated objective", "openThreads":["thread"], "adventurePatch":{"currentStakes":"risk","consequence":{"summary":"durable consequence","status":"open | resolved | advantage | complication","tier":"success"},"discoveries":["clue"],"clockUpdates":[],"spatialContext":{"currentArea":null,"landmarks":[],"routes":[],"unresolvedSpatialQuestions":[]}}, "escalation":{"decision":"none | danger | combat_ready","dangerKind":"trap | hazard | pursuit | social_threat | monster_pressure | environment | unknown","reason":"brief reason","threatLevel":0,"encounterSeed":{"title":"title","summary":"pressure","stakes":"stakes"},"catalogEntryIds":["80.10"]} }',
    '',
    'Rules:',
    '- Output JSON only: no markdown fences, no commentary, no prose outside the object.',
    '- Use only the backend roll facts above for dice, modifier, total, DC, and outcome tier.',
    '- Do not invent, alter, or mention different dice, DCs, HP, damage, rewards, death, finality, wallets, or private chain data.',
    '- Narrate a consequence that fits the outcome tier and preserves future player agency; keep it natural prose, not an adventure-state panel.',
    '- Vary the first sentence/opening from recent GM outcome openings while preserving roll facts; do not reuse an exact opening.',
    '- For partial_success, failure, and critical_failure, publicNarration must be substantive (roughly 180+ characters), show a visible consequence such as cost, complication, blocked route, lost opportunity, harder choice, hostile response, obligation, or a concrete danger, and leave a changed situation or next choice rather than finality.',
    '- publicNarration: concrete object/route/threat; no pressure-only opening.',
    '- Treat adventurePatch as private durable memory for the resolved roll. activeDecision remains rare and only for a genuine new fork.',
    '- escalation is raw intent; backend will normalize it. Use decision none, danger, or combat_ready case-by-case.',
    '- Scene-check outcomes must never request combat directly: do not output requestedGameplayAction or lastCombatTriggerBeatId.',
    '- combat_ready means readiness, not a direct combat request; a later GM beat may request start_combat, and backend promotion may start combat on a later eligible auto tick.',
    '- Prefer listed 80_encounters and 30_monsters catalog candidates for encounterSeed/catalogEntryIds when the roll creates danger or combat readiness.',
    '- Use adventurePatch.spatialContext additively when the roll reveals, opens, blocks, narrows, or questions visible areas/routes/landmarks.',
    '- Tier rules for adventurePatch: critical_success/success add progress or discovery; partial_success: progress plus complication; failure/critical_failure require a consequence and changed next choice.',
    '- publicNarration, stateSummary, currentObjective, openThreads, and tier-appropriate adventurePatch are required.',
  ]
}

function clampGameMasterSceneCheckOutcomePrompt(prompt: string): string {
  return clampOfficialElizaTextPreservingSuffix(prompt, {
    suffixMarker: GM_SCENE_CHECK_OUTCOME_CONTRACT_MARKER,
    maxBytes: OFFICIAL_ELIZA_MESSAGE_MAX_BYTES,
    truncationNotice: OFFICIAL_ELIZA_PROMPT_TRUNCATION_NOTICE,
  })
}

export function buildGameMasterSceneCheckOutcomePrompt(input: GenerateGameMasterSceneCheckOutcomeInput): string {
  return clampGameMasterSceneCheckOutcomePrompt([
    'You are the private game master for a public WAGDIE location room.',
    'Narrate the consequence of one already-resolved non-combat scene check. Do not directly create canon lore.',
    '',
    `Room id: ${input.room.id}`,
    `Location id: ${input.room.locationId}`,
    `Tick id: ${input.tick.id}`,
    '',
    'Backend-computed roll facts:',
    ...formatSceneCheckRollFacts(input),
    '',
    ...formatSceneCheckEscalationCatalogCandidates(input.narrativeState),
    '',
    ...formatSpatialContext(normalizeAdventureMemory(input.narrativeState.metadata).spatialContext),
    '',
    ...buildRecentSceneCheckPatternLines(input.recentMessages),
    '',
    'Recent public transcript:',
    formatTranscript(input.recentMessages),
    '',
    ...buildNarrativeStateLines(input),
    '',
    ...buildGameMasterSceneCheckOutcomeContractLines(),
  ].join('\n'))
}

const FAILURE_TIER_PUBLIC_NARRATION_MIN_CHARS = 180
const FAILURE_TIER_CONSEQUENCE_PATTERN = /\b(cost|costs|complication|complicates|pressure|danger|dangerous|blocked|blocks|lost opportunity|opportunity is lost|harder choice|hostile response|obligation|setback|threat|risk|price|consequence|route narrows|route closes|choice narrows|clock advances|attention turns|exposed|scarce|worse)\b/i
const FAILURE_TIER_AGENCY_PATTERN = /\b(now|next|must choose|can still|may still|leaves|leaving|offers|opens|forces a choice|choice|choose|decide|approach|route|path|answer|respond|press on|withdraw|bargain|risk|option|which way|what they do)\b/i
const SCENE_CHECK_OUTCOME_UNSAFE_PATTERN = /\b(hp|hit points?|damage|reward|rewards|dies?|death|fatal|fatality|finality|permanent end|no way forward|cannot continue|wallet|private chain|chain data)\b/i

function normalizeSceneCheckPublicNarrationForValidation(value: string): string {
  return normalizeOfficialResponseText(value)
    .replace(/\s+/g, ' ')
    .trim()
}

function isFailureTier(tier: SceneCheckResolution['roll']['tier']): boolean {
  return tier === 'partial_success' || tier === 'failure' || tier === 'critical_failure'
}

function validateSceneCheckOutcomePublicNarration(
  tier: SceneCheckResolution['roll']['tier'],
  publicNarration: string
): void {
  const normalized = normalizeSceneCheckPublicNarrationForValidation(publicNarration)

  if (SCENE_CHECK_OUTCOME_UNSAFE_PATTERN.test(normalized)) {
    throw new Error('Game-master scene-check outcome response publicNarration contains unsafe mechanics, reward, fatality, finality, wallet, or private chain language')
  }

  if (!isFailureTier(tier)) {
    validateConcreteNarrativeText(normalized, {
      label: 'Game-master scene-check outcome response publicNarration',
      requireConcreteAnchor: true,
    })
    return
  }

  if (normalized.length < FAILURE_TIER_PUBLIC_NARRATION_MIN_CHARS) {
    throw new Error(`Game-master scene-check outcome response publicNarration is too short for ${tier} consequence narration`)
  }

  validateConcreteNarrativeText(normalized, {
    label: 'Game-master scene-check outcome response publicNarration',
    requireConcreteAnchor: true,
  })
  if (!FAILURE_TIER_CONSEQUENCE_PATTERN.test(normalized)) {
    throw new Error(`Game-master scene-check outcome response publicNarration missing visible consequence language for ${tier}`)
  }
  if (!FAILURE_TIER_AGENCY_PATTERN.test(normalized)) {
    throw new Error(`Game-master scene-check outcome response publicNarration must preserve player agency after ${tier}`)
  }
}

function validateSceneCheckOutcomeAdventurePatch(
  tier: SceneCheckResolution['roll']['tier'],
  adventurePatch: LocationRoomAdventurePatch
): void {
  const hasConsequence = (adventurePatch.consequenceLedger?.length ?? 0) > 0
  const hasOutcomeSignal = Boolean(
    hasConsequence ||
    adventurePatch.activeDecision ||
    adventurePatch.currentStakes ||
    (adventurePatch.discoveries?.length ?? 0) > 0 ||
    (adventurePatch.clocks?.length ?? 0) > 0
  )

  if (tier === 'partial_success' || tier === 'failure' || tier === 'critical_failure') {
    if (!hasConsequence) {
      throw new Error(`Game-master scene-check outcome response missing adventurePatch consequence for ${tier}`)
    }
    return
  }

  if (!hasOutcomeSignal) {
    throw new Error(`Game-master scene-check outcome response missing adventurePatch outcome signal for ${tier}`)
  }
}

export function normalizeGameMasterSceneCheckOutcomeResponse(
  raw: string,
  input: Pick<GenerateGameMasterSceneCheckOutcomeInput, 'narrativeState' | 'resolution' | 'sceneCheckId'> & { recentMessages?: LocationRoomMessage[] },
  options: { gameMasterAgentId: string; limits?: GameMasterBeatLimits }
): GameMasterSceneCheckOutcomeOutput {
  const limits = options.limits ?? elizaConfig.locationRooms.narrative
  const parsed = extractGameMasterJsonObject(raw, 'Game-master scene-check outcome response')
  const publicNarration = parseRequiredString(parsed.publicNarration ?? parsed.public_narration, limits.publicNarrationMaxLength, 'publicNarration')
  const stateSummary = parseRequiredString(
    parsed.stateSummary ?? parsed.state_summary ?? parsed.updatedContinuitySummary,
    limits.stateSummaryMaxLength,
    'stateSummary'
  )
  const currentObjective = parseRequiredString(parsed.currentObjective ?? parsed.current_objective, limits.stateSummaryMaxLength, 'currentObjective')
  const openThreads = parseOpenThreads(parsed.openThreads ?? parsed.open_threads, limits)
  if (openThreads.length === 0) {
    throw new Error('Game-master scene-check outcome response missing openThreads')
  }
  const adventurePatch = normalizeAdventurePatch(parsed.adventurePatch ?? parsed.adventure_patch, {
    sourceId: input.sceneCheckId,
  })
  const normalizedEscalation = normalizeSceneCheckEscalation({
    narrativeState: input.narrativeState,
    rawEscalation: parsed.escalation ?? parsed.sceneCheckEscalation ?? parsed.scene_check_escalation,
    recentOutcomeSummary: publicNarration,
    fallbackSummary: publicNarration,
    rollTier: input.resolution.roll.tier,
    selectedTokenId: input.resolution.actorTokenId,
  })
  validateSceneCheckOutcomePublicNarration(input.resolution.roll.tier, publicNarration)
  if (hasDuplicateRecentOutcomeOpening(publicNarration, input.recentMessages)) {
    throw new Error('Game-master scene-check outcome response reuses a recent outcome opening')
  }
  validateSceneCheckOutcomeAdventurePatch(input.resolution.roll.tier, adventurePatch)

  return {
    gameMasterAgentId: options.gameMasterAgentId,
    publicNarration,
    stateAfter: {
      stateSummary,
      currentObjective,
      openThreads,
    },
    adventurePatch,
    escalation: normalizedEscalation.escalation,
    ttrpgMetadataPatch: normalizedEscalation.ttrpgMetadataPatch,
    metadata: {
      rawResponseLength: raw.length,
      adventurePatch,
      sceneCheckEscalation: normalizedEscalation.escalation,
    },
  }
}

function buildFallbackSceneCheckPublicNarration(input: GenerateGameMasterSceneCheckOutcomeInput): string {
  const roll = input.resolution.roll
  const actor = input.resolution.actorName ?? `#${input.resolution.actorTokenId}`
  const checkLabel = roll.checkLabel.toLowerCase()
  const outcome = roll.tier.replace(/_/g, ' ')
  const focus = fallbackSceneCheckFocus(input)
  const rollFacts = `${actor}'s ${checkLabel} check resolves as ${outcome} (${roll.total} vs DC ${roll.dc})`

  if (roll.tier === 'critical_success') {
    return `${rollFacts}. The ${focus} gives up more than the room meant to show: the salt scratches line up with a cold draft from the cellar stair, and a black feather caught in the bell rope points toward the rafters. The group can take the stair before it settles shut, or pull the bell and force whatever is watching above to answer first.`
  }
  if (roll.tier === 'success') {
    return `${rollFacts}. The ${focus} resolves into a usable lead: salt has been dragged from the bar toward the cellar stair, and the bell rope trembles only when the rafter shadows shift. The next choice is concrete—follow the salt trail down, or bait the thing in the rafters while the stair remains open.`
  }
  if (roll.tier === 'partial_success') {
    return `${rollFacts}. The ${focus} reveals the right direction, but the Crow's Den takes payment for it: the cellar stair opens wider while the bell rope starts to swing on its own. The group has the clue, but waiting lets the rafter-shapes gather above the bar.`
  }
  if (roll.tier === 'failure') {
    return `${rollFacts}. The ${focus} gives a false read, and the tavern punishes the mistake: the cellar stair slams down one step, feathers scatter across the bar, and the bell rope twists toward the character who checked it. The easy route is blocked; the next choice is whether to force the stair or confront the rafters.`
  }
  return `${rollFacts}. The ${focus} turns openly hostile: the bell rope snaps taut, salt spills into a warning circle, and something heavy drags itself across the rafters above the cellar door. The next choice is ugly: every harder route now points through immediate danger, and either the stair or the watcher above will answer immediately.`
}

function fallbackSceneCheckFocus(input: GenerateGameMasterSceneCheckOutcomeInput): string {
  const action = input.characterAction.toLowerCase()
  const match = action.match(/\b(?:door|stair|stairs|route|path|passage|arch|shelf|latch|wall|marks?|scratches|bell|table|bar|tunnel|grate|window|threshold|cellar|landing|rafter|rafters|rookery|crow|crows|feather|feathers|taproom|cask|casks|shutter|shutters|lantern|lanterns|floorboard|floorboards|seam|salt|ash)\b/i)
  return match?.[0]
    ? match[0].replace(/s$/, '')
    : input.resolution.roll.checkLabel.toLowerCase()
}

function fallbackSceneCheckSpatialContext(input: GenerateGameMasterSceneCheckOutcomeInput): LocationRoomSpatialContext {
  const existing = normalizeAdventureMemory(input.narrativeState.metadata).spatialContext
  const focus = fallbackSceneCheckFocus(input)
  const actor = input.resolution.actorName ?? `#${input.resolution.actorTokenId}`

  if (input.resolution.roll.tier === 'critical_success' || input.resolution.roll.tier === 'success') {
    return {
      currentArea: existing.currentArea,
      landmarks: [`${focus} clarified by ${actor}'s check`],
      routes: [`opened or safer route near the ${focus}`],
      unresolvedSpatialQuestions: [],
    }
  }

  if (input.resolution.roll.tier === 'partial_success') {
    return {
      currentArea: existing.currentArea,
      landmarks: [`visible cost marks the ${focus}`],
      routes: [`narrowed route near the ${focus}`],
      unresolvedSpatialQuestions: [`Which route around the ${focus} remains safest?`],
    }
  }

  return {
    currentArea: existing.currentArea,
    landmarks: [`setback visible at the ${focus}`],
    routes: [`blocked or harder route near the ${focus}`],
    unresolvedSpatialQuestions: [`What alternate route or safer approach remains around the ${focus}?`],
  }
}

function fallbackSceneCheckAdventurePatch(input: GenerateGameMasterSceneCheckOutcomeInput): LocationRoomAdventurePatch {
  const roll = input.resolution.roll
  const actor = input.resolution.actorName ?? `#${input.resolution.actorTokenId}`
  const outcome = roll.tier.replace(/_/g, ' ')
  const focus = fallbackSceneCheckFocus(input)
  const baseSummary = `${actor}'s ${roll.checkLabel.toLowerCase()} check resolved as ${outcome}; the ${focus} now changes the next choice.`
  const status = roll.tier === 'critical_success' || roll.tier === 'success' ? 'advantage' : 'complication'
  const consequenceSummary = roll.tier === 'critical_success'
    ? `${actor}'s check reveals the cellar draft, bell rope, and rafter sign as a strong usable advantage.`
    : roll.tier === 'success'
      ? `${actor}'s check turns the ${focus} into a concrete lead toward the cellar stair or the watcher in the rafters.`
      : roll.tier === 'partial_success'
        ? `${actor}'s check reveals the lead, but the bell rope begins moving and the rafter threat gathers above it.`
        : roll.tier === 'failure'
          ? `${actor}'s check misreads the ${focus}; the cellar stair shifts, feathers scatter, and the easy route closes.`
          : `${actor}'s check triggers a hard Crow's Den setback: the bell rope, salt, and rafters all answer at once.`

  return normalizeAdventurePatch({
    currentStakes: roll.tier === 'critical_success' || roll.tier === 'success'
      ? 'The resolved scene check creates a visible opening the group can use.'
      : `The resolved scene check changes the ${focus} with a visible cost and a harder next choice.`,
    consequence: {
      id: 'scene-check-outcome',
      summary: consequenceSummary,
      status,
      tier: roll.tier,
    },
    discoveries: roll.tier === 'critical_success' || roll.tier === 'success'
      ? [baseSummary]
      : [],
    spatialContext: fallbackSceneCheckSpatialContext(input),
  }, { sourceId: input.sceneCheckId })
}

export function buildFallbackGameMasterSceneCheckOutcome(
  input: GenerateGameMasterSceneCheckOutcomeInput,
  gameMasterAgentId: string
): GameMasterSceneCheckOutcomeOutput {
  const limits = elizaConfig.locationRooms.narrative
  const roll = input.resolution.roll
  const actor = input.resolution.actorName ?? `#${input.resolution.actorTokenId}`
  const outcome = roll.tier.replace(/_/g, ' ')
  const adventurePatch = fallbackSceneCheckAdventurePatch(input)
  const publicNarration = trimToLimit(
    buildFallbackSceneCheckPublicNarration(input),
    limits.publicNarrationMaxLength
  ) ?? 'The scene check resolves, and the bell rope or cellar stair changes the next choice.'
  const rawEscalation = roll.tier === 'failure' || roll.tier === 'critical_failure'
    ? {
      decision: 'danger',
      dangerKind: roll.tier === 'critical_failure' ? 'monster_pressure' : 'unknown',
      reason: `${roll.tier}_fallback_escalation`,
    }
    : roll.tier === 'partial_success'
      ? {
        decision: 'danger',
        dangerKind: 'unknown',
        reason: 'partial_success_fallback_pressure',
      }
      : {
        decision: 'none',
        dangerKind: 'unknown',
        reason: 'successful_scene_check_no_escalation',
      }
  const normalizedEscalation = normalizeSceneCheckEscalation({
    narrativeState: input.narrativeState,
    rawEscalation,
    recentOutcomeSummary: publicNarration,
    fallbackSummary: publicNarration,
    rollTier: roll.tier,
    selectedTokenId: input.resolution.actorTokenId,
  })

  return {
    gameMasterAgentId,
    publicNarration,
    stateAfter: {
      stateSummary: trimToLimit(
        `${input.narrativeState.stateSummary || 'The room scene continues.'} ${actor}'s ${input.resolution.actionIntent.replace(/_/g, ' ')} check resolved as ${outcome}.`,
        limits.stateSummaryMaxLength
      ) ?? (input.narrativeState.stateSummary || 'The room scene continues after a resolved scene check.'),
      currentObjective: trimToLimit(
        input.narrativeState.currentObjective || 'Respond to the consequence of the resolved scene check.',
        limits.stateSummaryMaxLength
      ) ?? 'Respond to the consequence of the resolved scene check.',
      openThreads: (input.narrativeState.openThreads.length > 0
        ? input.narrativeState.openThreads
        : ['How will the room respond to the scene-check result?']
      ).slice(0, limits.openThreadsMaxCount),
    },
    adventurePatch,
    escalation: normalizedEscalation.escalation,
    ttrpgMetadataPatch: normalizedEscalation.ttrpgMetadataPatch,
    metadata: {
      fallbackUsed: true,
      adventurePatch,
      sceneCheckEscalation: normalizedEscalation.escalation,
    },
  }
}

function responseFlags(raw: string): GameMasterGenerationResponseFlags {
  const text = normalizeOfficialResponseText(raw)
  return {
    empty: text.length === 0,
    hasJsonObject: text.indexOf('{') >= 0 && text.lastIndexOf('}') > text.indexOf('{'),
    fencedJson: /```(?:json)?/i.test(text),
    startsWithJsonObject: text.trim().startsWith('{'),
  }
}

function categorizeBeatResponseError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (/empty/i.test(message)) return 'empty_response'
  if (/did not contain a JSON object/i.test(message)) return 'missing_json_object'
  if (/invalid JSON/i.test(message)) return 'invalid_json'
  if (/selectedSpeakerTokenId|selected speaker/i.test(message)) return 'speaker_constraint'
  if (/token id|featuredTokenIds/i.test(message)) return 'token_constraint'
  if (/currentObjective|openThreads|start_combat|combatReadiness|ttrpgPhase|threatLevel|encounterSeed|requestedGameplayAction|sceneCheckRequest|adventurePatch|story pressure|publicNarration|flat opening|visibly escalate/i.test(message)) {
    return 'progression_contract'
  }
  if (/missing .*speakerInstruction|missing .*stateSummary/i.test(message)) return 'missing_required_field'
  return 'validation_error'
}

function diagnosticsForInitialFailure(raw: string, error: unknown): GameMasterGenerationDiagnostics {
  return {
    status: 'repair_failed',
    repairAttempted: true,
    repaired: false,
    initialErrorCategory: categorizeBeatResponseError(error),
    initialResponseLength: raw.length,
    initialResponseFlags: responseFlags(raw),
  }
}

function buildGameMasterBeatRepairPrompt(
  input: GenerateGameMasterBeatInput,
  diagnostics: GameMasterGenerationDiagnostics
): string {
  return clampGameMasterPrompt([
    'Your previous game-master beat response failed the required JSON contract.',
    `Failure category: ${diagnostics.initialErrorCategory ?? 'validation_error'}`,
    `Previous response length: ${diagnostics.initialResponseLength ?? 0}`,
    '',
    'Repair by producing one fresh valid response. Do not explain the repair.',
    `Selected speaker remains: ${input.speaker.name} (#${input.speaker.tokenId})`,
    '',
    'Eligible current participants:',
    formatParticipants(input.participants),
    '',
    ...buildNarrativeStateLines(input),
    '',
    ...buildProgressionContextLines(input.progressionContext),
    '',
    ...buildGameMasterBeatContractLines(input),
  ].join('\n'))
}

function withGenerationDiagnostics(
  output: GameMasterBeatOutput,
  diagnostics: GameMasterGenerationDiagnostics
): GameMasterBeatOutput {
  return {
    ...output,
    metadata: {
      ...output.metadata,
      gmGeneration: diagnostics,
    },
  }
}

export class GameMasterBeatGenerationError extends Error {
  constructor(
    message: string,
    readonly diagnostics: GameMasterGenerationDiagnostics,
    options?: { cause?: unknown }
  ) {
    super(message)
    this.name = 'GameMasterBeatGenerationError'
    this.cause = options?.cause
  }
}

export interface GameMasterBeatGenerator {
  generateBeat(input: GenerateGameMasterBeatInput): Promise<GameMasterBeatOutput>
  generateSceneCheckOutcome?(input: GenerateGameMasterSceneCheckOutcomeInput): Promise<GameMasterSceneCheckOutcomeOutput>
}

async function sendAndCollectOfficialMessage(
  messaging: OfficialElizaMessagingClient,
  input: Parameters<OfficialElizaMessagingClient['sendSessionMessage']>[0],
  options: Parameters<OfficialElizaMessagingClient['collectStreamedResponseText']>[1] = {}
): Promise<Awaited<ReturnType<OfficialElizaMessagingClient['collectStreamedResponseText']>>> {
  const maybeRetryingMessaging = messaging as OfficialElizaMessagingClient & {
    sendAndCollectSessionMessage?: (
      input: Parameters<OfficialElizaMessagingClient['sendSessionMessage']>[0],
      options?: Parameters<OfficialElizaMessagingClient['collectStreamedResponseText']>[1]
    ) => Promise<Awaited<ReturnType<OfficialElizaMessagingClient['collectStreamedResponseText']>>>
  }

  if (typeof maybeRetryingMessaging.sendAndCollectSessionMessage === 'function') {
    return maybeRetryingMessaging.sendAndCollectSessionMessage(input, options)
  }

  const response = await messaging.sendSessionMessage(input)
  return messaging.collectStreamedResponseText(response, options)
}

export class OfficialGameMasterBeatGenerator implements GameMasterBeatGenerator {
  constructor(
    private readonly messaging: OfficialElizaMessagingClient = createOfficialElizaMessagingClient({
      baseUrl: elizaConfig.official.baseUrl,
      apiKey: elizaConfig.official.apiKey,
      timeout: elizaConfig.timeout,
    })
  ) {}

  async generateBeat(input: GenerateGameMasterBeatInput): Promise<GameMasterBeatOutput> {
    const gameMasterAgentId = input.gameMasterAgentId.trim()
    if (!gameMasterAgentId) {
      throw new Error('Location room narrative mode requires a game-master agent id')
    }

    await this.messaging.startAgent(gameMasterAgentId)
    const session = await this.messaging.createSession({
      agentId: gameMasterAgentId,
      userId: input.room.officialUserId,
      metadata: {
        source: 'wagdie-location-room-game-master',
        roomId: input.room.id,
        locationId: input.room.locationId,
        tickId: input.tick.id,
        channelId: input.room.channelId,
        officialRoomId: input.room.officialRoomId,
        officialWorldId: input.room.officialWorldId,
        selectedSpeakerTokenId: input.speaker.tokenId,
      },
    })

    try {
      const collected = await sendAndCollectOfficialMessage(this.messaging, {
        sessionId: session.sessionId,
        content: buildGameMasterBeatPrompt(input),
        metadata: {
          source: 'wagdie-location-room-game-master',
          roomId: input.room.id,
          locationId: input.room.locationId,
          tickId: input.tick.id,
          channelId: input.room.channelId,
          selectedSpeakerTokenId: input.speaker.tokenId,
        },
      }, {
        conversationId: session.sessionId,
      })

      try {
        return withGenerationDiagnostics(normalizeGameMasterBeatResponse(collected.text, input, {
          gameMasterAgentId,
          progressionContext: input.progressionContext,
        }), {
          status: 'accepted',
          repairAttempted: false,
          repaired: false,
          initialResponseLength: collected.text.length,
          initialResponseFlags: responseFlags(collected.text),
        })
      } catch (initialError) {
        const diagnostics = diagnosticsForInitialFailure(collected.text, initialError)
        let repairText = ''

        try {
          const repairSession = await this.messaging.createSession({
            agentId: gameMasterAgentId,
            userId: input.room.officialUserId,
            metadata: {
              source: 'wagdie-location-room-game-master-repair',
              roomId: input.room.id,
              locationId: input.room.locationId,
              tickId: input.tick.id,
              channelId: input.room.channelId,
              officialRoomId: input.room.officialRoomId,
              officialWorldId: input.room.officialWorldId,
              selectedSpeakerTokenId: input.speaker.tokenId,
              repairAttempted: true,
              initialErrorCategory: diagnostics.initialErrorCategory,
            },
          })

          try {
            const repaired = await sendAndCollectOfficialMessage(this.messaging, {
              sessionId: repairSession.sessionId,
              content: buildGameMasterBeatRepairPrompt(input, diagnostics),
              metadata: {
                source: 'wagdie-location-room-game-master-repair',
                roomId: input.room.id,
                locationId: input.room.locationId,
                tickId: input.tick.id,
                channelId: input.room.channelId,
                selectedSpeakerTokenId: input.speaker.tokenId,
                repairAttempted: true,
                initialErrorCategory: diagnostics.initialErrorCategory,
              },
            }, {
              conversationId: repairSession.sessionId,
            })
            repairText = repaired.text
          } finally {
            await this.messaging.deleteSession(repairSession.sessionId).catch(() => null)
          }
        } catch (repairTransportError) {
          const failedDiagnostics: GameMasterGenerationDiagnostics = {
            ...diagnostics,
            status: 'repair_failed',
            repairAttempted: true,
            repaired: false,
            repairErrorCategory: 'repair_transport_error',
            repairResponseLength: repairText.length,
            repairResponseFlags: responseFlags(repairText),
          }
          throw new GameMasterBeatGenerationError(
            `Game-master beat repair failed (initial: ${failedDiagnostics.initialErrorCategory}, repair: ${failedDiagnostics.repairErrorCategory})`,
            failedDiagnostics,
            { cause: repairTransportError }
          )
        }

        try {
          return withGenerationDiagnostics(normalizeGameMasterBeatResponse(repairText, input, {
            gameMasterAgentId,
            progressionContext: input.progressionContext,
          }), {
            ...diagnostics,
            status: 'repaired',
            repairAttempted: true,
            repaired: true,
            repairResponseLength: repairText.length,
            repairResponseFlags: responseFlags(repairText),
          })
        } catch (repairError) {
          const failedDiagnostics: GameMasterGenerationDiagnostics = {
            ...diagnostics,
            status: 'repair_failed',
            repairAttempted: true,
            repaired: false,
            repairErrorCategory: categorizeBeatResponseError(repairError),
            repairResponseLength: repairText.length,
            repairResponseFlags: responseFlags(repairText),
          }

          if ([
            'empty_response',
            'missing_json_object',
            'invalid_json',
            'missing_required_field',
            'progression_contract',
          ].includes(failedDiagnostics.repairErrorCategory ?? '')) {
            return buildFallbackGameMasterBeat(input, gameMasterAgentId, failedDiagnostics)
          }

          throw new GameMasterBeatGenerationError(
            `Game-master beat repair failed (initial: ${failedDiagnostics.initialErrorCategory}, repair: ${failedDiagnostics.repairErrorCategory})`,
            failedDiagnostics,
            { cause: repairError }
          )
        }
      }
    } finally {
      await this.messaging.deleteSession(session.sessionId).catch(() => null)
    }
  }

  async generateSceneCheckOutcome(input: GenerateGameMasterSceneCheckOutcomeInput): Promise<GameMasterSceneCheckOutcomeOutput> {
    const gameMasterAgentId = input.gameMasterAgentId.trim()
    if (!gameMasterAgentId) {
      throw new Error('Location room narrative mode requires a game-master agent id')
    }

    await this.messaging.startAgent(gameMasterAgentId)
    let session: { sessionId: string } | null = null

    try {
      session = await this.messaging.createSession({
        agentId: gameMasterAgentId,
        userId: input.room.officialUserId,
        metadata: {
          source: 'wagdie-location-room-game-master-scene-check-outcome',
          roomId: input.room.id,
          locationId: input.room.locationId,
          tickId: input.tick.id,
          channelId: input.room.channelId,
          officialRoomId: input.room.officialRoomId,
          officialWorldId: input.room.officialWorldId,
          selectedSpeakerTokenId: input.speaker.tokenId,
          sceneCheckId: input.sceneCheckId,
        },
      })

      const collected = await sendAndCollectOfficialMessage(this.messaging, {
        sessionId: session.sessionId,
        content: buildGameMasterSceneCheckOutcomePrompt(input),
        metadata: {
          source: 'wagdie-location-room-game-master-scene-check-outcome',
          roomId: input.room.id,
          locationId: input.room.locationId,
          tickId: input.tick.id,
          channelId: input.room.channelId,
          selectedSpeakerTokenId: input.speaker.tokenId,
          sceneCheckId: input.sceneCheckId,
        },
      }, {
        conversationId: session.sessionId,
      })

      return normalizeGameMasterSceneCheckOutcomeResponse(collected.text, input, {
        gameMasterAgentId,
      })
    } catch {
      return buildFallbackGameMasterSceneCheckOutcome(input, gameMasterAgentId)
    } finally {
      if (session) {
        await this.messaging.deleteSession(session.sessionId).catch(() => null)
      }
    }
  }
}

export const GAME_MASTER_AUTHOR_NAME = DEFAULT_GM_AUTHOR_NAME
export const officialGameMasterBeatGenerator = new OfficialGameMasterBeatGenerator()
