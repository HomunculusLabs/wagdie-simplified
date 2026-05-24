import { elizaConfig } from '@/lib/eliza/config'
import {
  createOfficialElizaMessagingClient,
  type OfficialElizaMessagingClient,
} from '@/lib/eliza/official/messaging'
import { extractGameMasterJsonObject } from '../gameMasterGenerator'
import type {
  LocationRoom,
  LocationRoomMessage,
  LocationRoomParticipant,
  LocationRoomTick,
} from '../types'
import {
  GAMEPLAY_ACTION_TYPES,
  type GameplayActionEnvelope,
  type GameplayCharacterState,
  type GameplayEncounter,
  type GameplayMonsterState,
  type GameplayRoomState,
} from './types'
import {
  parseGameplayMonsters,
  validateGameplayActionEnvelope,
  type GameplayActionValidationContext,
} from './rules'

export type GenerateGameplayActionInput = {
  room: LocationRoom
  tick: LocationRoomTick
  speaker: LocationRoomParticipant
  participants: LocationRoomParticipant[]
  recentMessages: LocationRoomMessage[]
  encounter: GameplayEncounter
  gameplayState: GameplayRoomState
  characterState: GameplayCharacterState
  visibleMonsters?: GameplayMonsterState[]
  speakerInstruction?: string | null
  validation: GameplayActionValidationContext
}

export type GenerateGameplayActionResult = {
  officialAgentId: string
  action: GameplayActionEnvelope
  rawResponseLength: number
}

export interface GameplayActionGenerator {
  generateAction(input: GenerateGameplayActionInput): Promise<GenerateGameplayActionResult>
}

function toGameplayHpBand(character: { hp: number; maxHp: number; status: string } | undefined): string {
  if (!character) return 'untracked'
  if (character.status === 'dead') return 'dead'
  if (character.status === 'fled') return 'fled'
  if (character.status === 'downed') return 'down'

  const ratio = character.hp / Math.max(1, character.maxHp)
  if (ratio <= 0.25) return 'critical'
  if (ratio <= 0.65) return 'injured'
  return 'healthy'
}

function statBand(value: number | undefined, high: number, low: number): 'notable' | 'steady' | 'strained' {
  if (typeof value !== 'number') return 'steady'
  if (value >= high) return 'notable'
  if (value <= low) return 'strained'
  return 'steady'
}

function formatSafeStatFlavor(character: GameplayCharacterState): string {
  const stats = character.effectiveStats
  if (!stats) return 'No backend stat flavor is visible; rely on public scene state only.'

  const physical = Math.max(stats.str, stats.dex, stats.con)
  const insight = Math.max(stats.int, stats.wis)
  const presence = stats.cha
  const defense = stats.ac
  const pace = stats.speed
  const fragments: string[] = []

  const physicalBand = statBand(physical, 16, 8)
  if (physicalBand === 'notable') fragments.push('physically formidable')
  if (physicalBand === 'strained') fragments.push('physically strained')

  const insightBand = statBand(insight, 16, 8)
  if (insightBand === 'notable') fragments.push('sharp-eyed')
  if (insightBand === 'strained') fragments.push('uncertain under pressure')

  const presenceBand = statBand(presence, 16, 8)
  if (presenceBand === 'notable') fragments.push('commanding presence')
  if (presenceBand === 'strained') fragments.push('socially guarded')

  const defenseBand = statBand(defense, 16, 8)
  if (defenseBand === 'notable') fragments.push('well-guarded')
  if (defenseBand === 'strained') fragments.push('poorly guarded')

  const paceBand = statBand(pace, 40, 20)
  if (paceBand === 'notable') fragments.push('swift-footed')
  if (paceBand === 'strained') fragments.push('slow-moving')

  return fragments.length > 0
    ? fragments.join(', ')
    : 'balanced capabilities'
}

function formatVisibleCharacterState(character: GameplayCharacterState | undefined): string {
  if (!character) return 'untracked'
  return `${toGameplayHpBand(character)} HP band, status ${character.status}`
}

function formatParticipants(participants: LocationRoomParticipant[], gameplayState: GameplayRoomState): string {
  return participants.map((participant) => {
    const state = gameplayState.characters[String(participant.tokenId)]
    return `- ${participant.name} (#${participant.tokenId}): ${formatVisibleCharacterState(state)}`
  }).join('\n')
}

function formatTranscript(messages: LocationRoomMessage[]): string {
  if (messages.length === 0) return 'No public room messages yet.'
  return messages.map((message) => {
    const token = message.tokenId == null ? '' : ` #${message.tokenId}`
    return `${message.authorName}${token}: ${message.content}`
  }).join('\n')
}

function formatMonsters(monsters: GameplayMonsterState[]): string {
  if (monsters.length === 0) return 'No visible monsters.'
  return monsters.map((monster) => {
    return `- ${monster.name} (${monster.id}): ${toGameplayHpBand(monster)} HP band, status ${monster.status}, archetype ${monster.archetype}`
  }).join('\n')
}

export function buildGameplayActionPrompt(input: GenerateGameplayActionInput): string {
  const monsters = input.visibleMonsters ?? parseGameplayMonsters(input.encounter.monsterState)

  return [
    'You are taking an autonomous D&D-style gameplay turn in a public WAGDIE location room.',
    `You are ${input.speaker.name} (#${input.speaker.tokenId}).`,
    `Tick id: ${input.tick.id}`,
    `Encounter: ${input.encounter.publicTitle ?? 'Untitled encounter'}`,
    input.encounter.publicSummary ? `Encounter summary: ${input.encounter.publicSummary}` : null,
    '',
    'Your current visible gameplay state:',
    formatVisibleCharacterState(input.characterState),
    `Safe stat flavor: ${formatSafeStatFlavor(input.characterState)}`,
    '',
    'Visible participants:',
    formatParticipants(input.participants, input.gameplayState),
    '',
    'Visible monsters:',
    formatMonsters(monsters),
    '',
    'Recent public transcript:',
    formatTranscript(input.recentMessages),
    '',
    input.speakerInstruction ? `Private GM instruction: ${input.speakerInstruction}` : 'No private GM instruction for this turn.',
    '',
    `Available action types: ${GAMEPLAY_ACTION_TYPES.join(', ')}`,
    'Return only JSON with this exact contract:',
    '{',
    '  "actionType": "attack|defend|help|investigate|negotiate|flee|rest",',
    '  "target": { "kind": "monster", "id": "monster-1" },',
    '  "publicSpeech": "short public in-character speech",',
    '  "intentSummary": "short private intent"',
    '}',
    '',
    'Rules:',
    '- Attack requires a legal monster target. Help requires a legal character target.',
    '- publicSpeech is required and must be suitable for public display.',
    '- Do not include markdown, speaker labels, or out-of-world explanations.',
  ].filter((line): line is string => line !== null).join('\n')
}

export function normalizeGameplayActionResponse(
  raw: string,
  validation: GameplayActionValidationContext
): { action: GameplayActionEnvelope; rawResponseLength: number } {
  let parsed: Record<string, unknown> | null = null
  try {
    parsed = extractGameMasterJsonObject(raw, 'Gameplay action response')
  } catch {
    // Character agents sometimes answer in-character prose instead of the JSON
    // action envelope. Keep gameplay moving by treating the prose as a cautious
    // investigate action rather than failing the whole room tick.
  }

  if (parsed) {
    const result = validateGameplayActionEnvelope(parsed, validation)
    if (!result.ok) {
      throw new Error(result.error)
    }

    return {
      action: result.action,
      rawResponseLength: raw.length,
    }
  }

  const publicSpeechMaxLength = validation.publicSpeechMaxLength ?? elizaConfig.locationRooms.gameplay.publicSpeechMaxLength
  const intentSummaryMaxLength = validation.intentSummaryMaxLength ?? elizaConfig.locationRooms.gameplay.actionIntentMaxLength
  const fallbackSpeech = raw.trim().replace(/^```(?:json)?|```$/g, '').trim().slice(0, publicSpeechMaxLength)

  return {
    action: {
      actionType: 'investigate',
      target: null,
      publicSpeech: fallbackSpeech || 'I watch the room carefully and search for what changed.',
      intentSummary: 'Fallback investigate action from non-JSON character response'.slice(0, intentSummaryMaxLength),
      metadata: { fallbackFromNonJsonResponse: true },
    },
    rawResponseLength: raw.length,
  }
}

function buildFallbackActionFromOfficialError(input: GenerateGameplayActionInput, error: unknown): GameplayActionEnvelope {
  const publicSpeechMaxLength = input.validation.publicSpeechMaxLength ?? elizaConfig.locationRooms.gameplay.publicSpeechMaxLength
  const intentSummaryMaxLength = input.validation.intentSummaryMaxLength ?? elizaConfig.locationRooms.gameplay.actionIntentMaxLength
  const errorName = error instanceof Error ? error.name : 'UnknownError'

  return {
    actionType: 'defend',
    target: null,
    publicSpeech: `${input.speaker.name} braces against the room's pressure and watches for the next opening.`.slice(0, publicSpeechMaxLength),
    intentSummary: 'Fallback defend action after official character agent stream failure'.slice(0, intentSummaryMaxLength),
    metadata: {
      fallbackFromOfficialError: true,
      errorName,
    },
  }
}

export class OfficialGameplayActionGenerator implements GameplayActionGenerator {
  constructor(
    private readonly messaging: OfficialElizaMessagingClient = createOfficialElizaMessagingClient({
      baseUrl: elizaConfig.official.baseUrl,
      apiKey: elizaConfig.official.apiKey,
      timeout: elizaConfig.timeout,
    })
  ) {}

  async generateAction(input: GenerateGameplayActionInput): Promise<GenerateGameplayActionResult> {
    const [{ createOfficialServerClient }, { resolveCharacterByTokenId }] = await Promise.all([
      import('@/lib/eliza/client'),
      import('@/lib/eliza/characterResolver'),
    ])
    const officialClient = createOfficialServerClient()
    const record = await resolveCharacterByTokenId({
      elizaClient: officialClient,
      tokenId: String(input.speaker.tokenId),
      wagdieDefaults: {
        name: input.speaker.name,
        backgroundStory: input.speaker.backgroundStory,
      },
    })

    await this.messaging.startAgent(record.id)
    const session = await this.messaging.createSession({
      agentId: record.id,
      userId: input.room.officialUserId,
      metadata: {
        source: 'wagdie-location-room-gameplay-action',
        roomId: input.room.id,
        locationId: input.room.locationId,
        tickId: input.tick.id,
        speakerTokenId: input.speaker.tokenId,
        officialAgentId: record.id,
      },
    })

    try {
      try {
        const response = await this.messaging.sendSessionMessage({
          sessionId: session.sessionId,
          content: buildGameplayActionPrompt(input),
          metadata: {
            source: 'wagdie-location-room-gameplay-action',
            roomId: input.room.id,
            locationId: input.room.locationId,
            tickId: input.tick.id,
            speakerTokenId: input.speaker.tokenId,
            officialAgentId: record.id,
          },
        })
        const collected = await this.messaging.collectStreamedResponseText(response, {
          conversationId: session.sessionId,
        })
        const normalized = normalizeGameplayActionResponse(collected.text, input.validation)

        return {
          officialAgentId: record.id,
          action: normalized.action,
          rawResponseLength: normalized.rawResponseLength,
        }
      } catch (error) {
        console.warn('[Eliza Location Rooms] gameplay action stream failed; using fallback action', {
          roomId: input.room.id,
          locationId: input.room.locationId,
          tickId: input.tick.id,
          speakerTokenId: input.speaker.tokenId,
          error: error instanceof Error ? error.message : String(error),
        })
        return {
          officialAgentId: record.id,
          action: buildFallbackActionFromOfficialError(input, error),
          rawResponseLength: 0,
        }
      }
    } finally {
      await this.messaging.deleteSession(session.sessionId).catch(() => null)
    }
  }
}

export const officialGameplayActionGenerator = new OfficialGameplayActionGenerator()
