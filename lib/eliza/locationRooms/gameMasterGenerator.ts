import { elizaConfig } from '@/lib/eliza/config'
import {
  createOfficialElizaMessagingClient,
  normalizeOfficialResponseText,
  type OfficialElizaMessagingClient,
} from '@/lib/eliza/official/messaging'
import {
  LOCATION_ROOM_COMBAT_READINESS_VALUES,
  LOCATION_ROOM_TTRPG_PHASES,
  type LocationRoom,
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
  normalizeNarrativeTtrpgMetadata,
  normalizeRequestedGameplayAction,
  normalizeThreatLevel,
  normalizeTtrpgPhase,
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

function buildGameMasterBeatContractLines(input: Pick<GenerateGameMasterBeatInput, 'participants' | 'speaker' | 'progressionContext'>): string[] {
  const publicNarrationContract = input.progressionContext?.requirePublicNarration
    ? '"required public narration for observers"'
    : '"optional public narration for observers, or null"'

  return [
    'Return only a JSON object with this exact contract:',
    '{',
    `  "publicNarration": ${publicNarrationContract},`,
    '  "speakerInstruction": "private direction for only the selected speaker",',
    '  "stateSummary": "updated private continuity summary after this beat",',
    '  "currentObjective": "concrete current objective, or null only when ttrpgPhase is aftermath",',
    '  "openThreads": ["short unresolved thread"],',
    '  "ttrpgPhase": "story | exploration | threat | aftermath",',
    '  "combatReadiness": "none | foreshadow | ready",',
    '  "threatLevel": 0,',
    '  "requestedGameplayAction": null,',
    '  "encounterSeed": null,',
    '  "featuredTokenIds": [123],',
    `  "selectedSpeakerTokenId": ${input.speaker.tokenId}`,
    '}',
    '',
    'Rules:',
    '- Output JSON only: no markdown fences, no commentary, no prose outside the object.',
    '- speakerInstruction and stateSummary are required and must be non-empty.',
    '- Reference only eligible current participant token ids.',
    `- selectedSpeakerTokenId must be ${input.speaker.tokenId}; do not select another speaker.`,
    '- Keep public narration suitable for public display and avoid markdown.',
    ...(input.progressionContext?.requireOpeningPublicNarration
      ? [
        '- Opening publicNarration must be a rich table-setting GM beat: 4-6 sentences and roughly 300-650 characters.',
        '- Opening publicNarration must give players material to act on: sensory location detail, immediate situation, 2-3 interactable hooks, stakes/tension, and an unresolved prompt.',
        '- Do not make the opener a two-sentence summary. Do not solve the mystery, start combat, or speak for the selected character.',
        '- Opening speakerInstruction should give the selected character 2-3 concrete ways to respond in their own voice.',
      ]
      : []),
    '- Non-aftermath beats must include a concrete currentObjective and at least one unresolved openThreads entry.',
    ...(input.progressionContext?.requirePublicNarration
      ? ['- publicNarration is required and must be non-empty for this beat.']
      : ['- publicNarration may be null only when this beat is character-focused and no public GM narration is required.']),
    ...(input.progressionContext?.requireEscalationBeyondOpening
      ? ['- Do not leave repeated activity in flat story/none/0 state; visibly escalate without forcing start_combat.']
      : []),
    '- Preserve or refine the current objective/thread, and advance the scene with a decision, clue, complication, changed threat/readiness, or explicit consequence.',
    '- Do not spawn combat by default. Most beats should keep requestedGameplayAction null.',
    '- Use ttrpgPhase "threat" and combatReadiness "foreshadow" with threatLevel at least 1 to hint at danger without starting combat.',
    '- Use combatReadiness "ready" only with ttrpgPhase "threat" and threatLevel at least 3.',
    '- Use requestedGameplayAction "start_combat" only when the fiction clearly escalates to a fight.',
    '- start_combat requires ttrpgPhase "threat", combatReadiness "ready", and a non-null public-safe encounterSeed.',
    '- encounterSeed may include only title, summary, and stakes; never include mechanics, DCs, HP, rewards, wallets, or private chain data.',
  ]
}

function buildNarrativeStateLines(input: Pick<GenerateGameMasterBeatInput, 'narrativeState'>): string[] {
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
  if (/currentObjective|openThreads|start_combat|combatReadiness|ttrpgPhase|threatLevel|encounterSeed|requestedGameplayAction|publicNarration|flat opening|visibly escalate/i.test(message)) {
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
}

export const GAME_MASTER_AUTHOR_NAME = DEFAULT_GM_AUTHOR_NAME
export const officialGameMasterBeatGenerator = new OfficialGameMasterBeatGenerator()
