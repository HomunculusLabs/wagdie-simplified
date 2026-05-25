import { elizaConfig } from '@/lib/eliza/config'
import { normalizeLocationAdventureCatalog } from '@/lib/domain/location/metadata'
import {
  createOfficialElizaMessagingClient,
  normalizeOfficialResponseText,
  type OfficialElizaMessagingClient,
} from '@/lib/eliza/official/messaging'
import { GAMEPLAY_CHECK_TYPES } from './gameplay/types'
import { normalizeSceneCheckRequest } from './sceneChecks/rules'
import {
  SCENE_CHECK_ACTION_INTENTS,
  type NormalizedSceneCheckRequest,
  type SceneCheckResolution,
} from './sceneChecks/types'
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
  type LocationRoomTick,
  type LocationRoomTtrpgPhase,
} from './types'
import {
  normalizeCombatReadiness,
  normalizeEncounterSeed,
  normalizeAdventureMemory,
  normalizeAdventurePatch,
  normalizeNarrativeTtrpgMetadata,
  normalizeRequestedGameplayAction,
  normalizeThreatLevel,
  normalizeTtrpgPhase,
  retrieveAdventureCatalogEntries,
  type LocationRoomAdventurePatch,
  type LocationRoomNarrativeState,
  type LocationRoomNarrativeStateSnapshot,
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
  metadata: {
    rawResponseLength?: number
    fallbackUsed?: boolean
    adventurePatch?: LocationRoomAdventurePatch
  }
}

export type GameMasterBeatProgressionContext = {
  requirePublicNarration: boolean
  requireOpeningPublicNarration: boolean
  requireEscalationBeyondOpening: boolean
  publicNarrationRequirementReason:
    | 'no_prior_public_game_master_message'
    | 'repeated_activity_without_visible_escalation'
    | null
  roomTickCount: number
  publicMessageCount: number
  publicGameMasterMessageCount: number
  publicAgentMessageCount: number
}

type ParsedBeat = Record<string, unknown>

const DEFAULT_GM_AUTHOR_NAME = 'Game Master'
const OPENING_PUBLIC_NARRATION_MIN_CHARS = 280
const OPENING_PUBLIC_NARRATION_MIN_SENTENCES = 4
const GM_PROMPT_TRANSCRIPT_MAX_CHARS = 800
const GM_PROMPT_STATE_SUMMARY_MAX_CHARS = 450
const GM_PROMPT_OBJECTIVE_MAX_CHARS = 240
const GM_PROMPT_OPEN_THREADS_MAX_CHARS = 500
const GM_PROMPT_ENCOUNTER_SEED_MAX_CHARS = 300
const OFFICIAL_ELIZA_MESSAGE_MAX_CHARS = 3900
const GM_PROMPT_CONTRACT_MARKER = 'Return only a JSON object with this exact contract:'
const GM_SCENE_CHECK_OUTCOME_CONTRACT_MARKER = 'Return only a JSON object with this exact scene-check outcome contract:'

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

export function buildGameMasterBeatProgressionContext(input: {
  room: Pick<LocationRoom, 'tickCount'>
  narrativeState: LocationRoomNarrativeState
  publicAuthorMessageStats: LocationRoomPublicAuthorMessageStats
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
  const requirePublicNarration = requireOpeningPublicNarration || requireEscalationBeyondOpening

  return {
    requirePublicNarration,
    requireOpeningPublicNarration,
    requireEscalationBeyondOpening,
    publicNarrationRequirementReason: requireOpeningPublicNarration
      ? 'no_prior_public_game_master_message'
      : requireEscalationBeyondOpening
        ? 'repeated_activity_without_visible_escalation'
        : null,
    roomTickCount: input.room.tickCount,
    publicMessageCount: input.publicAuthorMessageStats.messageCount,
    publicGameMasterMessageCount: input.publicAuthorMessageStats.gameMasterMessageCount,
    publicAgentMessageCount: input.publicAuthorMessageStats.agentMessageCount,
  }
}

export function validateGameMasterBeatProgressionContract(output: {
  publicNarration?: string | null
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

  if (output.ttrpgPhase !== 'aftermath') {
    if (!output.stateAfter.currentObjective) {
      throw new Error('Game-master beat response missing currentObjective for non-aftermath progression')
    }
    if (output.stateAfter.openThreads.length === 0) {
      throw new Error('Game-master beat response missing openThreads for non-aftermath progression')
    }

    const adventurePatch = output.adventurePatch ?? {}
    const hasStoryPressure = Boolean(
      adventurePatch.activeDecision ||
      adventurePatch.currentStakes ||
      (adventurePatch.consequenceLedger?.length ?? 0) > 0 ||
      (adventurePatch.discoveries?.length ?? 0) > 0 ||
      (adventurePatch.clocks?.length ?? 0) > 0 ||
      output.sceneCheckRequest ||
      output.requestedGameplayAction === 'start_combat'
    )
    if (!hasStoryPressure) {
      throw new Error('Game-master beat response missing adventurePatch story pressure for non-aftermath progression')
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
        ? 'A cold hush settles over the Crow\'s Den as the room seems to notice the gathered dead all at once. Salt-stained boards creak under no visible foot, and a guttering lantern throws three clear choices into view: the dark stair, the watched doorway, and the table where fresh scratches mark a warning. The air offers no answer, only pressure, as if the place is waiting for someone to choose what fear is worth following. Whatever happens next should come from the characters, but the room has made it clear that standing still will not keep them safe.'
        : 'The room shifts before anyone can mistake the silence for safety. Something in the Crow\'s Den changes position just out of sight, leaving the characters with a clear choice to investigate, withdraw, or challenge what is watching them.',
      limits.publicNarrationMaxLength
    )
    : null

  const stateAfter = {
    stateSummary: trimToLimit(
      input.narrativeState.stateSummary || 'The Crow\'s Den has opened into an unresolved scene that waits on the characters\' response.',
      limits.stateSummaryMaxLength
    ) ?? 'The Crow\'s Den waits on the characters\' response.',
    currentObjective: trimToLimit(
      input.narrativeState.currentObjective || `Let ${input.speaker.name} choose how to engage with the room's immediate danger.`,
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
    currentStakes: 'The room will answer delay with a sharper omen.',
    activeDecision: {
      id: 'fallback-immediate-choice',
      prompt: `How does ${input.speaker.name} answer the room's immediate pressure?`,
      options: [
        { id: 'investigate', label: 'Investigate the nearest clue', summary: 'Study the most visible sign before moving deeper.' },
        { id: 'confront', label: 'Confront the watcher', summary: 'Call out or challenge what seems to be observing the room.' },
        { id: 'withdraw', label: 'Withdraw carefully', summary: 'Create distance while keeping the mystery in view.' },
      ],
    },
  })

  validateGameMasterBeatProgressionContract({
    publicNarration,
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
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, Math.max(0, limit - 1)).trim()}…`
}

function clampGameMasterPrompt(prompt: string): string {
  if (prompt.length <= OFFICIAL_ELIZA_MESSAGE_MAX_CHARS) return prompt

  const markerIndex = prompt.indexOf(GM_PROMPT_CONTRACT_MARKER)
  if (markerIndex < 0) {
    return prompt.slice(0, OFFICIAL_ELIZA_MESSAGE_MAX_CHARS - 1).trimEnd() + '…'
  }

  const contract = prompt.slice(markerIndex)
  const separator = '\n\n[Earlier context truncated to fit the ElizaOS 4000-character message limit.]\n\n'
  const availableContextChars = OFFICIAL_ELIZA_MESSAGE_MAX_CHARS - contract.length - separator.length

  if (availableContextChars <= 0) {
    return contract.slice(0, OFFICIAL_ELIZA_MESSAGE_MAX_CHARS - 1).trimEnd() + '…'
  }

  return `${prompt.slice(0, availableContextChars).trimEnd()}${separator}${contract}`
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
  ].filter(Boolean).join(' | ') || 'None.', GM_PROMPT_ENCOUNTER_SEED_MAX_CHARS)
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
  ]

  if (context.requirePublicNarration) {
    const reason = context.publicNarrationRequirementReason === 'no_prior_public_game_master_message'
      ? 'no prior public Game Master message exists.'
      : 'repeated room activity is still in flat opening state.'
    lines.push('Public narration is REQUIRED for this beat.')
    lines.push(`Reason: ${reason}`)
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

function buildSceneCheckContractLines(): string[] {
  return [
    'Optional non-combat scene checks:',
    '- sceneCheckRequest may request one story/exploration roll; use null when none.',
    `- actionIntent options: ${SCENE_CHECK_ACTION_INTENTS.join(', ')}.`,
    `- fixed rollChoice.checkType options: ${GAMEPLAY_CHECK_TYPES.join(', ')}.`,
    '- contextualChecks may include public-safe id, label, checkType, dc, description; backend sanitizes mechanics.',
    '- requestedGameplayAction is combat-only; do not combine start_combat with sceneCheckRequest.',
  ]
}

function buildGameMasterBeatContractLines(input: Pick<GenerateGameMasterBeatInput, 'participants' | 'speaker' | 'progressionContext'>): string[] {
  const publicNarrationContract = input.progressionContext?.requirePublicNarration
    ? '"required public narration for observers"'
    : '"optional public narration for observers, or null"'

  return [
    'Return only a JSON object with this exact contract:',
    '{',
    `  "publicNarration": ${publicNarrationContract},`,
    '  "speakerInstruction": "speaker-only direction",',
    '  "stateSummary": "updated continuity",',
    '  "currentObjective": "objective or null in aftermath",',
    '  "openThreads": ["thread"],',
    '  "ttrpgPhase": "story | exploration | threat | aftermath",',
    '  "combatReadiness": "none | foreshadow | ready",',
    '  "threatLevel": 0,',
    '  "requestedGameplayAction": null,',
    '  "encounterSeed": null,',
    '  "sceneCheckRequest": null,',
    '  "adventurePatch": {"currentStakes":"risk","activeDecision":{"id":"id","prompt":"choice","options":[{"id":"id","label":"option"}]},"consequence":{"summary":"aftermath","status":"open","tier":"unknown"},"discoveries":["clue"],"clockUpdates":[{"id":"id","label":"clock","value":1,"max":6,"summary":"pressure"}]},',
    '  "featuredTokenIds": [123],',
    `  "selectedSpeakerTokenId": ${input.speaker.tokenId}`,
    '}',
    '',
    'Rules:',
    '- Output JSON only; no markdown/prose outside object.',
    '- speakerInstruction/stateSummary required; use eligible token ids.',
    `- selectedSpeakerTokenId must be ${input.speaker.tokenId}; do not select another speaker.`,
    '- Keep public narration public-safe and avoid markdown.',
    ...(input.progressionContext?.requireOpeningPublicNarration
      ? [
        '- Opening publicNarration must be a rich table-setting GM beat: 4-6 sentences and roughly 300-650 characters.',
        '- Opening publicNarration must give players material to act on: sensory location detail, immediate situation, 2-3 interactable hooks, stakes/tension, and an unresolved prompt.',
        '- Do not make the opener a two-sentence summary. Do not solve the mystery, start combat, or speak for the selected character.',
        '- Opening speakerInstruction should give the selected character 2-3 concrete ways to respond in their own voice.',
      ]
      : []),
    '- Non-aftermath beats must include a concrete currentObjective and at least one unresolved openThreads entry.',
    '- Non-aftermath beats must also include story pressure: adventurePatch choice/stakes/consequence/discovery/clock, sceneCheckRequest, or combat.',
    '- Use adventurePatch for durable story memory; activeDecision is visible with 2-4 options and clockUpdates use absolute values.',
    ...(input.progressionContext?.requirePublicNarration
      ? ['- publicNarration is required and must be non-empty for this beat.']
      : ['- publicNarration may be null only when this beat is character-focused and no public GM narration is required.']),
    ...(input.progressionContext?.requireEscalationBeyondOpening
      ? ['- Do not leave repeated activity in flat story/none/0 state; visibly escalate without forcing start_combat.']
      : []),
    '- Use catalog entries as inspiration; do not reveal gated facts.',
    '- Do not spawn combat by default. Most beats keep requestedGameplayAction null.',
    '- Use requestedGameplayAction "start_combat" only for clear fights; it requires threat/ready/threatLevel >= 3 and encounterSeed.',
    ...buildSceneCheckContractLines(),
  ]
}

function formatAdventureDecision(decision: ReturnType<typeof normalizeAdventureMemory>['activeDecision']): string {
  if (!decision) return 'None.'
  const options = decision.options
    .map((option) => `${option.id}: ${option.label}${option.summary ? ` — ${option.summary}` : ''}`)
    .join(' | ')
  const selected = decision.selectedOptionId ? ` | selected: ${decision.selectedOptionId}` : ''
  return truncatePromptValue(`${decision.id}: ${decision.prompt} | options: ${options}${selected}`, 240)
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
    'Adventure memory:',
    `Arc summary: ${truncatePromptValue(adventure.arcSummary || 'None.', 500)}`,
    `Current stakes: ${truncatePromptValue(adventure.currentStakes || 'None.', 300)}`,
    'Relevant location adventure catalog:',
    catalogEntries.length > 0
      ? catalogEntries.map((entry) => `- [${entry.section}] ${entry.id}${entry.title ? ` ${entry.title}` : ''}: ${truncatePromptValue(entry.summary, 120)}${entry.tags.length ? ` (tags: ${entry.tags.join(', ')})` : ''}`).join('\n')
      : 'None available.',
    `Active decision: ${formatAdventureDecision(adventure.activeDecision)}`,
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
    ...formatAdventureMemoryLines(input),
  ]
}

export function buildGameMasterBeatPrompt(input: GenerateGameMasterBeatInput): string {
  return clampGameMasterPrompt([
    'You are the private game master for a public WAGDIE location room.',
    'Plan exactly one narrative beat for the selected speaker. Do not directly create canon lore.',
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

function buildGameMasterSceneCheckOutcomeContractLines(): string[] {
  return [
    'Return only a JSON object with this exact scene-check outcome contract:',
    '{',
    '  "publicNarration": "public GM consequence of the resolved scene check",',
    '  "stateSummary": "updated private continuity summary after the roll",',
    '  "currentObjective": "updated objective after the roll",',
    '  "openThreads": ["short unresolved thread"],',
    '  "adventurePatch": {',
    '    "currentStakes": "updated stakes, or omit",',
    '    "activeDecision": {"id":"decision-id","prompt":"visible choice prompt","options":[{"id":"option-id","label":"visible option"}]},',
    '    "consequence": {"id":"scene-check-consequence","summary":"tier-appropriate durable consequence","status":"open | resolved | advantage | complication","tier":"success"},',
    '    "discoveries": ["durable clue or reveal"],',
    '    "clockUpdates": [{"id":"clock-id","label":"clock label","value":1,"max":6,"summary":"absolute pressure after the roll"}]',
    '  }',
    '}',
    '',
    'Rules:',
    '- Output JSON only: no markdown fences, no commentary, no prose outside the object.',
    '- Use only the backend roll facts above for dice, modifier, total, DC, and outcome tier.',
    '- Do not invent, alter, or mention different dice, DCs, HP, damage, rewards, death, finality, wallets, or private chain data.',
    '- Narrate a consequence that fits the outcome tier and preserves future player agency.',
    '- Tier rules for adventurePatch:',
    '  - critical_success: major discovery, advantage, opened route, or reduced pressure.',
    '  - success: progress with low/no cost; include a discovery, advantage, clarified decision, stakes update, or clock change.',
    '  - partial_success: progress plus complication, clock pressure, or harder choice; consequence is required.',
    '  - failure: fail-forward complication, lost opportunity, or increased pressure; consequence is required.',
    '  - critical_failure: hard setback, danger escalation, major complication, or clock advance; consequence is required.',
    '- publicNarration, stateSummary, currentObjective, openThreads, and tier-appropriate adventurePatch are required.',
  ]
}

function clampGameMasterSceneCheckOutcomePrompt(prompt: string): string {
  if (prompt.length <= OFFICIAL_ELIZA_MESSAGE_MAX_CHARS) return prompt
  const markerIndex = prompt.indexOf(GM_SCENE_CHECK_OUTCOME_CONTRACT_MARKER)
  if (markerIndex < 0) return prompt.slice(0, OFFICIAL_ELIZA_MESSAGE_MAX_CHARS - 1).trimEnd() + '…'
  const contract = prompt.slice(markerIndex)
  const separator = '\n\n[Earlier context truncated to fit the ElizaOS 4000-character message limit.]\n\n'
  const availableContextChars = OFFICIAL_ELIZA_MESSAGE_MAX_CHARS - contract.length - separator.length
  if (availableContextChars <= 0) return contract.slice(0, OFFICIAL_ELIZA_MESSAGE_MAX_CHARS - 1).trimEnd() + '…'
  return `${prompt.slice(0, availableContextChars).trimEnd()}${separator}${contract}`
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
    'Recent public transcript:',
    formatTranscript(input.recentMessages),
    '',
    ...buildNarrativeStateLines(input),
    '',
    'Backend-computed roll facts:',
    ...formatSceneCheckRollFacts(input),
    '',
    ...buildGameMasterSceneCheckOutcomeContractLines(),
  ].join('\n'))
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
  input: Pick<GenerateGameMasterSceneCheckOutcomeInput, 'narrativeState' | 'resolution' | 'sceneCheckId'>,
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
    metadata: {
      rawResponseLength: raw.length,
      adventurePatch,
    },
  }
}

function fallbackSceneCheckAdventurePatch(input: GenerateGameMasterSceneCheckOutcomeInput): LocationRoomAdventurePatch {
  const roll = input.resolution.roll
  const actor = input.resolution.actorName ?? `#${input.resolution.actorTokenId}`
  const outcome = roll.tier.replace(/_/g, ' ')
  const baseSummary = `${actor}'s ${roll.checkLabel.toLowerCase()} check resolved as ${outcome}; the room must now answer that result.`
  const status = roll.tier === 'critical_success' || roll.tier === 'success' ? 'advantage' : 'complication'
  const consequenceSummary = roll.tier === 'critical_success'
    ? `${actor}'s attempt opens a strong advantage or clear route for the next choice.`
    : roll.tier === 'success'
      ? `${actor}'s attempt creates progress with a clean clue or safer position.`
      : roll.tier === 'partial_success'
        ? `${actor}'s attempt makes progress, but it also adds pressure the room cannot ignore.`
        : roll.tier === 'failure'
          ? `${actor}'s attempt fails forward into a complication that changes the next choice.`
          : `${actor}'s attempt triggers a hard setback that escalates the room's danger.`

  return normalizeAdventurePatch({
    currentStakes: 'The room is now shaped by the resolved scene check.',
    consequence: {
      id: 'scene-check-outcome',
      summary: consequenceSummary,
      status,
      tier: roll.tier,
    },
    discoveries: roll.tier === 'critical_success' || roll.tier === 'success'
      ? [baseSummary]
      : [],
  }, { sourceId: input.sceneCheckId })
}

function buildFallbackGameMasterSceneCheckOutcome(
  input: GenerateGameMasterSceneCheckOutcomeInput,
  gameMasterAgentId: string
): GameMasterSceneCheckOutcomeOutput {
  const limits = elizaConfig.locationRooms.narrative
  const roll = input.resolution.roll
  const actor = input.resolution.actorName ?? `#${input.resolution.actorTokenId}`
  const outcome = roll.tier.replace(/_/g, ' ')
  const adventurePatch = fallbackSceneCheckAdventurePatch(input)
  const publicNarration = trimToLimit(
    `${actor}'s ${roll.checkLabel.toLowerCase()} check resolves as ${outcome} (${roll.total} vs DC ${roll.dc}). The scene answers the attempt without changing the roll: the result becomes the next clear pressure for the room to address.`,
    limits.publicNarrationMaxLength
  ) ?? 'The scene check resolves, and the room shifts around the result.'

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
    metadata: {
      fallbackUsed: true,
      adventurePatch,
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
