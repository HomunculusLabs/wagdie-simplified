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

function formatParticipants(participants: LocationRoomParticipant[]): string {
  return participants
    .map((participant) => `- ${participant.name} (#${participant.tokenId})`)
    .join('\n')
}

function formatTranscript(messages: LocationRoomMessage[]): string {
  if (messages.length === 0) {
    return 'No public room messages yet.'
  }

  return messages
    .map((message) => `${message.authorName}: ${message.content}`)
    .join('\n')
}

function formatNarrativeContext(input: GenerateOfficialLocationRoomTurnInput): string[] {
  const context = input.narrativeContext
  if (!context) return []

  return [
    '',
    'Private game-master narrative context:',
    `Continuity summary: ${context.stateSummary || 'No established continuity yet.'}`,
    `Current objective: ${context.currentObjective || 'None.'}`,
    'Open threads:',
    context.openThreads.length > 0
      ? context.openThreads.map((thread) => `- ${thread}`).join('\n')
      : 'None.',
    `Private instruction for this utterance: ${context.speakerInstruction}`,
    context.publicNarration
      ? `Public game-master narration just posted: ${context.publicNarration}`
      : 'No public game-master narration was posted for this beat.',
  ]
}

export function buildOfficialLocationRoomPrompt(input: GenerateOfficialLocationRoomTurnInput): string {
  return [
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
  ].join('\n')
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
      const response = await this.messaging.sendSessionMessage({
        sessionId: session.sessionId,
        content: buildOfficialLocationRoomPrompt(input),
        metadata: {
          source: 'wagdie-location-room',
          roomId: input.room.id,
          locationId: input.room.locationId,
          speakerTokenId: input.speaker.tokenId,
          officialAgentId: record.id,
        },
      })
      const collected = await this.messaging.collectStreamedResponseText(response, {
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
