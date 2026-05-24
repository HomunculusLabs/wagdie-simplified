import { elizaConfig } from '@/lib/eliza/config'
import {
  createOfficialElizaMessagingClient,
  normalizeOfficialResponseText,
  type OfficialElizaMessagingClient,
} from '@/lib/eliza/official/messaging'
import type {
  LocationRoom,
  LocationRoomCombatReadiness,
  LocationRoomEncounterSeed,
  LocationRoomMessage,
  LocationRoomParticipant,
  LocationRoomRequestedGameplayAction,
  LocationRoomTick,
  LocationRoomTtrpgPhase,
} from './types'
import {
  normalizeCombatReadiness,
  normalizeEncounterSeed,
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
}

type ParsedBeat = Record<string, unknown>

const DEFAULT_GM_AUTHOR_NAME = 'Game Master'

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
  const ttrpgPhase = normalizeTtrpgPhase(parsed.ttrpgPhase ?? parsed.ttrpg_phase)
  const combatReadiness = normalizeCombatReadiness(parsed.combatReadiness ?? parsed.combat_readiness)
  const threatLevel = normalizeThreatLevel(parsed.threatLevel ?? parsed.threat_level)
  const requestedGameplayAction = normalizeRequestedGameplayAction(
    parsed.requestedGameplayAction ?? parsed.requested_gameplay_action
  )
  const encounterSeed = normalizeEncounterSeed(parsed.encounterSeed ?? parsed.encounter_seed)

  return {
    gameMasterAgentId: options.gameMasterAgentId,
    publicNarration: parseOptionalString(
      parsed.publicNarration ?? parsed.public_narration,
      limits.publicNarrationMaxLength
    ),
    speakerInstruction,
    stateAfter: {
      stateSummary,
      currentObjective,
      openThreads,
    },
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

function formatParticipants(participants: LocationRoomParticipant[]): string {
  return participants
    .map((participant) => `- ${participant.name} (#${participant.tokenId})`)
    .join('\n')
}

function formatTranscript(messages: LocationRoomMessage[]): string {
  if (messages.length === 0) return 'No public room messages yet.'

  return messages
    .map((message) => {
      const token = message.tokenId == null ? '' : ` #${message.tokenId}`
      return `${message.authorName}${token}: ${message.content}`
    })
    .join('\n')
}

function formatOpenThreads(threads: string[]): string {
  if (threads.length === 0) return 'None.'
  return threads.map((thread) => `- ${thread}`).join('\n')
}

export function buildGameMasterBeatPrompt(input: GenerateGameMasterBeatInput): string {
  return [
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
    'Current private narrative state:',
    `Continuity summary: ${input.narrativeState.stateSummary || 'No established continuity yet.'}`,
    `Current objective: ${input.narrativeState.currentObjective || 'None.'}`,
    'Open threads:',
    formatOpenThreads(input.narrativeState.openThreads),
    '',
    'Return only a JSON object with this exact contract:',
    '{',
    '  "publicNarration": "optional public narration for observers, or null",',
    '  "speakerInstruction": "private direction for only the selected speaker",',
    '  "stateSummary": "updated private continuity summary after this beat",',
    '  "currentObjective": "current objective, or null",',
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
    '- speakerInstruction and stateSummary are required and must be non-empty.',
    '- Reference only eligible current participant token ids.',
    '- Keep public narration suitable for public display and avoid markdown.',
    '- The selected speaker must remain the selected speaker above.',
    '- Do not spawn combat by default. Most beats should keep requestedGameplayAction null.',
    '- Use ttrpgPhase "threat" and combatReadiness "foreshadow" to hint at danger without starting combat.',
    '- Use combatReadiness "ready" and requestedGameplayAction "start_combat" only when the fiction clearly escalates to a fight.',
    '- encounterSeed may be a public-safe object with title, summary, and stakes; never include mechanics, DCs, HP, rewards, or private chain data.',
  ].join('\n')
}

export interface GameMasterBeatGenerator {
  generateBeat(input: GenerateGameMasterBeatInput): Promise<GameMasterBeatOutput>
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
      const response = await this.messaging.sendSessionMessage({
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
      })
      const collected = await this.messaging.collectStreamedResponseText(response, {
        conversationId: session.sessionId,
      })

      return normalizeGameMasterBeatResponse(collected.text, input, {
        gameMasterAgentId,
      })
    } finally {
      await this.messaging.deleteSession(session.sessionId).catch(() => null)
    }
  }
}

export const GAME_MASTER_AUTHOR_NAME = DEFAULT_GM_AUTHOR_NAME
export const officialGameMasterBeatGenerator = new OfficialGameMasterBeatGenerator()
