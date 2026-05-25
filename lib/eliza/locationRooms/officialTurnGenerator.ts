import { createOfficialServerClient } from '@/lib/eliza/client'
import { resolveCharacterByTokenId } from '@/lib/eliza/characterResolver'
import { elizaConfig } from '@/lib/eliza/config'
import {
  createOfficialElizaMessagingClient,
  normalizeOfficialResponseText,
  type OfficialElizaMessagingClient,
} from '@/lib/eliza/official/messaging'
import type {
  GenerateOfficialLocationRoomTurnInput,
  GenerateOfficialLocationRoomTurnResult,
  LocationRoomMessage,
  LocationRoomParticipant,
} from './types'

const MAX_ROOM_UTTERANCE_CHARS = 500
const CHARACTER_PROMPT_TRANSCRIPT_MAX_CHARS = 900
const CHARACTER_PROMPT_STATE_SUMMARY_MAX_CHARS = 450
const CHARACTER_PROMPT_OBJECTIVE_MAX_CHARS = 240
const CHARACTER_PROMPT_OPEN_THREADS_MAX_CHARS = 400
const CHARACTER_PROMPT_NARRATION_MAX_CHARS = 650
const CHARACTER_PROMPT_INSTRUCTION_MAX_CHARS = 450
const OFFICIAL_ELIZA_MESSAGE_MAX_CHARS = 3900

function truncatePromptValue(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, Math.max(0, limit - 1)).trim()}…`
}

function clampOfficialPrompt(prompt: string): string {
  if (prompt.length <= OFFICIAL_ELIZA_MESSAGE_MAX_CHARS) return prompt
  return `${prompt.slice(0, OFFICIAL_ELIZA_MESSAGE_MAX_CHARS - 1).trimEnd()}…`
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
  if (messages.length === 0) {
    return 'No public room messages yet.'
  }

  const lines: string[] = []
  let total = 0

  for (const message of [...messages].reverse()) {
    const line = `${message.authorName}: ${truncatePromptValue(message.content, 360)}`
    if (lines.length > 0 && total + line.length + 1 > CHARACTER_PROMPT_TRANSCRIPT_MAX_CHARS) {
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

function formatNarrativeContext(input: GenerateOfficialLocationRoomTurnInput): string[] {
  const context = input.narrativeContext
  if (!context) return []

  return [
    '',
    'Private game-master narrative context:',
    `Continuity summary: ${truncatePromptValue(context.stateSummary || 'No established continuity yet.', CHARACTER_PROMPT_STATE_SUMMARY_MAX_CHARS)}`,
    `Current objective: ${truncatePromptValue(context.currentObjective || 'None.', CHARACTER_PROMPT_OBJECTIVE_MAX_CHARS)}`,
    'Open threads:',
    context.openThreads.length > 0
      ? truncatePromptValue(context.openThreads.map((thread) => `- ${thread}`).join('\n'), CHARACTER_PROMPT_OPEN_THREADS_MAX_CHARS)
      : 'None.',
    `Private instruction for this utterance: ${truncatePromptValue(context.speakerInstruction, CHARACTER_PROMPT_INSTRUCTION_MAX_CHARS)}`,
    context.publicNarration
      ? `Public game-master narration just posted: ${truncatePromptValue(context.publicNarration, CHARACTER_PROMPT_NARRATION_MAX_CHARS)}`
      : 'No public game-master narration was posted for this beat.',
  ]
}

export function buildOfficialLocationRoomPrompt(input: GenerateOfficialLocationRoomTurnInput): string {
  return clampOfficialPrompt([
    'You are participating in a public WAGDIE location room.',
    `Location id: ${input.room.locationId}.`,
    `You are speaking as ${input.speaker.name} (#${input.speaker.tokenId}).`,
    '',
    'Current staked participants:',
    formatParticipants(input.participants),
    '',
    'Recent public transcript:',
    formatTranscript(input.recentMessages),
    ...formatNarrativeContext(input),
    '',
    'Write exactly one short in-world utterance as your character.',
    'Keep it under two sentences. Do not use markdown, speaker labels, JSON, stage directions, or out-of-world explanations.',
  ].join('\n'))
}

export function normalizeLocationRoomGeneratedContent(content: string): string | null {
  const normalized = normalizeOfficialResponseText(content)
    .replace(/^assistant\s*:/i, '')
    .replace(/^[-*\s"“”']+|["“”']+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) return null

  return normalized.slice(0, MAX_ROOM_UTTERANCE_CHARS).trim() || null
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

export interface OfficialLocationRoomTurnGenerator {
  generateTurn(input: GenerateOfficialLocationRoomTurnInput): Promise<GenerateOfficialLocationRoomTurnResult>
}

export class ElizaOfficialLocationRoomTurnGenerator implements OfficialLocationRoomTurnGenerator {
  constructor(
    private readonly messaging: OfficialElizaMessagingClient = createOfficialElizaMessagingClient({
      baseUrl: elizaConfig.official.baseUrl,
      apiKey: elizaConfig.official.apiKey,
      timeout: elizaConfig.timeout,
    })
  ) {}

  async generateTurn(input: GenerateOfficialLocationRoomTurnInput): Promise<GenerateOfficialLocationRoomTurnResult> {
    const officialClient = createOfficialServerClient()
    const tokenId = String(input.speaker.tokenId)
    const record = await resolveCharacterByTokenId({
      elizaClient: officialClient,
      tokenId,
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
        source: 'wagdie-location-room',
        roomId: input.room.id,
        locationId: input.room.locationId,
        officialRoomId: input.room.officialRoomId,
        officialWorldId: input.room.officialWorldId,
        speakerTokenId: input.speaker.tokenId,
        officialAgentId: record.id,
      },
    })

    try {
      const collected = await sendAndCollectOfficialMessage(this.messaging, {
        sessionId: session.sessionId,
        content: buildOfficialLocationRoomPrompt(input),
        metadata: {
          source: 'wagdie-location-room',
          roomId: input.room.id,
          locationId: input.room.locationId,
          speakerTokenId: input.speaker.tokenId,
          officialAgentId: record.id,
        },
      }, {
        conversationId: session.sessionId,
      })
      const content = normalizeLocationRoomGeneratedContent(collected.text)

      if (!content) {
        throw new Error('Official ElizaOS generated an empty location-room turn')
      }

      return {
        officialAgentId: record.id,
        content,
      }
    } finally {
      await this.messaging.deleteSession(session.sessionId).catch(() => null)
    }
  }
}

export const officialLocationRoomTurnGenerator = new ElizaOfficialLocationRoomTurnGenerator()
