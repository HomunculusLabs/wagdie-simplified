import { createOfficialServerClient } from '@/lib/eliza/client'
import { resolveCharacterByTokenId } from '@/lib/eliza/characterResolver'
import { elizaConfig } from '@/lib/eliza/config'
import {
  createOfficialElizaMessagingClient,
  normalizeOfficialResponseText,
  sendAndCollectOfficialEphemeralSessionMessage,
  type OfficialElizaMessagingClient,
} from '@/lib/eliza/official/messaging'
import {
  OFFICIAL_ELIZA_MESSAGE_MAX_BYTES,
  clampOfficialElizaText,
  clampOfficialElizaTextPreservingSuffix,
  sanitizeOfficialElizaText,
} from '@/lib/eliza/official/text'
import { extractGameMasterJsonObject } from './gameMasterGenerator'
import { GAMEPLAY_CHECK_TYPES } from './gameplay/types'
import { normalizeSceneCheckProposal } from './sceneChecks/rules'
import { SCENE_CHECK_ACTION_INTENTS } from './sceneChecks/types'
import { normalizeDeclaredAction } from './narrativeTypes'
import type { LocationRoomAdventureDecision, LocationRoomSpatialContext } from './narrativeTypes'
import type {
  GenerateOfficialLocationRoomTurnInput,
  GenerateOfficialLocationRoomTurnResult,
  LocationRoomMessage,
  LocationRoomNarrativeTurnSceneCheckContext,
  LocationRoomParticipant,
} from './types'

const MAX_ROOM_UTTERANCE_CHARS = 500
const CHARACTER_PROMPT_TRANSCRIPT_MAX_CHARS = 900
const CHARACTER_PROMPT_STATE_SUMMARY_MAX_CHARS = 450
const CHARACTER_PROMPT_OBJECTIVE_MAX_CHARS = 240
const CHARACTER_PROMPT_OPEN_THREADS_MAX_CHARS = 400
const CHARACTER_PROMPT_NARRATION_MAX_CHARS = 650
const CHARACTER_PROMPT_INSTRUCTION_MAX_CHARS = 450
const CHARACTER_PROMPT_DECISION_MAX_CHARS = 520
const CHARACTER_PROMPT_CONTRACT_MARKER = 'Return JSON only with this contract:'
const OFFICIAL_ELIZA_PROMPT_TRUNCATION_NOTICE = '\n\n[Earlier context truncated to fit the Official ElizaOS safety budget.]\n\n'

function truncatePromptValue(value: string, limit: number): string {
  const normalized = sanitizeOfficialElizaText(value).replace(/\s+/g, ' ').trim()
  return clampOfficialElizaText(normalized, { maxBytes: limit })
}

function clampOfficialPrompt(prompt: string, preserveNarrativeContract: boolean): string {
  if (!preserveNarrativeContract) {
    return clampOfficialElizaText(prompt, { maxBytes: OFFICIAL_ELIZA_MESSAGE_MAX_BYTES })
  }

  return clampOfficialElizaTextPreservingSuffix(prompt, {
    suffixMarker: CHARACTER_PROMPT_CONTRACT_MARKER,
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

function formatSceneCheckContext(context: LocationRoomNarrativeTurnSceneCheckContext | null | undefined): string[] {
  if (!context) return []

  const request = context.request
  const contextualChecks = context.contextualChecks ?? request?.contextualChecks ?? []

  return [
    '',
    'Optional scene-check context:',
    request
      ? `Game Master requested: ${request.actionIntent}${request.summary ? ` — ${truncatePromptValue(request.summary, 240)}` : ''}.`
      : 'No specific Game Master check request; propose a check only for a clearly roll-worthy story action.',
    `Scene-check action intents: ${SCENE_CHECK_ACTION_INTENTS.join(', ')}.`,
    `Fixed rollChoice check types: ${GAMEPLAY_CHECK_TYPES.join(', ')}.`,
    'Contextual roll checks offered for this scene:',
    contextualChecks.length > 0
      ? contextualChecks.map((check) => `- ${check.id}: ${check.label} (checkType ${check.checkType}, DC ${check.dc})${check.description ? ` — ${check.description}` : ''}`).join('\n')
      : 'None.',
    'Use sceneCheckProposal only when your action is roll-worthy. Shape: {"actionIntent":"investigate","intentSummary":"what you try","rollChoice":{"source":"fixed","checkType":"perception"}}.',
    'For contextual checks, use {"rollChoice":{"source":"contextual","contextualCheckId":"offered-id"}} and do not invent ids, labels, DCs, dice, or mechanics.',
    'If you only speak/react normally, set sceneCheckProposal to null.',
  ]
}

function formatActiveDecision(decision: LocationRoomAdventureDecision | null | undefined): string[] {
  if (!decision) return ['Active visible decision: None.']
  const options = decision.options
    .map((option) => `- ${option.id}: ${option.label}${option.summary ? ` — ${option.summary}` : ''}`)
    .join('\n')
  return [
    'Active visible decision:',
    truncatePromptValue(`${decision.id}: ${decision.prompt}`, CHARACTER_PROMPT_DECISION_MAX_CHARS),
    'Valid chosenOptionId values:',
    truncatePromptValue(options, CHARACTER_PROMPT_DECISION_MAX_CHARS),
  ]
}

function formatVisibleSpatialContext(context: LocationRoomSpatialContext | null | undefined): string[] {
  if (!context || (!context.currentArea && context.landmarks.length === 0 && context.routes.length === 0)) {
    return ['Visible spatial context: None.']
  }
  return [
    'Visible spatial context:',
    `Current area: ${truncatePromptValue(context.currentArea || 'Unknown.', 140)}`,
    `Visible landmarks: ${context.landmarks.length > 0 ? truncatePromptValue(context.landmarks.join(' | '), 300) : 'None.'}`,
    `Known routes: ${context.routes.length > 0 ? truncatePromptValue(context.routes.join(' | '), 360) : 'None.'}`,
  ]
}

function formatNarrativeTurnContract(context: GenerateOfficialLocationRoomTurnInput['narrativeContext']): string[] {
  if (!context) return []
  const allowsSceneCheck = Boolean(context.sceneCheck)
  return [
    '',
    'Return JSON only with this contract:',
    '{',
    '  "publicSpeech": "short public in-character utterance",',
    '  "declaredAction": {"summary":"what you intend to do next in the fiction","chosenOptionId":null,"actionIntent":"brief narrative intent"}',
    allowsSceneCheck ? '  ,"sceneCheckProposal": null' : '',
    '}',
    '- declaredAction.summary is required and should be narrative intent only; it does not trigger dice by itself.',
    context.activeDecision
      ? '- chosenOptionId may be one of the listed active decision option ids, or null if you choose a different freeform action.'
      : '- No active decision is available, so chosenOptionId must be null or omitted.',
    allowsSceneCheck
      ? '- sceneCheckProposal is allowed only for clearly roll-worthy actions in the scene-check context; otherwise set it to null.'
      : '- Do not include sceneCheckProposal because there is no scene-check context.',
  ].filter((line): line is string => Boolean(line))
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
    ...formatVisibleSpatialContext(context.spatialContext),
    ...formatActiveDecision(context.activeDecision),
    ...formatSceneCheckContext(context.sceneCheck),
    ...formatNarrativeTurnContract(context),
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
    input.narrativeContext
      ? 'Return the requested JSON object with publicSpeech and declaredAction.'
      : 'Write exactly one short in-world utterance as your character.',
    input.narrativeContext
      ? 'Keep publicSpeech under two sentences. Do not include markdown, speaker labels, stage directions, out-of-world explanations, dice results, DCs, HP, rewards, death, or finality.'
      : 'Keep it under two sentences. Do not use markdown, speaker labels, JSON, stage directions, or out-of-world explanations.',
  ].join('\n'), Boolean(input.narrativeContext))
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

export function normalizeOfficialLocationRoomTurnResponse(
  raw: string,
  options: {
    sceneCheckContext?: LocationRoomNarrativeTurnSceneCheckContext | null
    narrativeContext?: boolean
    activeDecision?: LocationRoomAdventureDecision | null
  } = {}
): Omit<GenerateOfficialLocationRoomTurnResult, 'officialAgentId'> {
  const sceneCheckContext = options.sceneCheckContext ?? null
  const activeDecision = options.activeDecision ?? null
  const requiresStructured = options.narrativeContext === true || Boolean(sceneCheckContext)

  if (!requiresStructured) {
    return {
      content: normalizeLocationRoomGeneratedContent(raw) ?? '',
      declaredAction: null,
      sceneCheckProposal: null,
      sceneCheckProposalError: null,
    }
  }

  let parsed: Record<string, unknown> | null = null
  try {
    parsed = extractGameMasterJsonObject(raw, 'Location-room character turn response')
  } catch {
    const content = normalizeLocationRoomGeneratedContent(raw) ?? ''
    return {
      content,
      declaredAction: content ? normalizeDeclaredAction({ summary: content }, { activeDecision }) : null,
      sceneCheckProposal: null,
      sceneCheckProposalError: null,
    }
  }

  const content = typeof parsed.publicSpeech === 'string'
    ? normalizeLocationRoomGeneratedContent(parsed.publicSpeech) ?? ''
    : ''
  const declaredAction = normalizeDeclaredAction(parsed.declaredAction ?? parsed.declared_action, { activeDecision }) ??
    (content ? normalizeDeclaredAction({ summary: content }, { activeDecision }) : null)

  if (!sceneCheckContext) {
    return {
      content,
      declaredAction,
      sceneCheckProposal: null,
      sceneCheckProposalError: null,
    }
  }

  const rawProposal = parsed.sceneCheckProposal ?? parsed.scene_check_proposal

  if (rawProposal == null || rawProposal === '') {
    return {
      content,
      declaredAction,
      sceneCheckProposal: null,
      sceneCheckProposalError: null,
    }
  }

  const proposal = normalizeSceneCheckProposal(rawProposal, {
    contextualChecks: sceneCheckContext.contextualChecks ?? sceneCheckContext.request?.contextualChecks ?? [],
  })

  if (!proposal.ok) {
    return {
      content,
      declaredAction,
      sceneCheckProposal: null,
      sceneCheckProposalError: proposal.error,
    }
  }

  return {
    content,
    declaredAction,
    sceneCheckProposal: proposal.value,
    sceneCheckProposalError: null,
  }
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
    const sessionMetadata = {
      source: 'wagdie-location-room',
      roomId: input.room.id,
      locationId: input.room.locationId,
      officialRoomId: input.room.officialRoomId,
      officialWorldId: input.room.officialWorldId,
      speakerTokenId: input.speaker.tokenId,
      officialAgentId: record.id,
    }

    const collected = await sendAndCollectOfficialEphemeralSessionMessage(this.messaging, {
      session: {
        agentId: record.id,
        userId: input.room.officialUserId,
        metadata: sessionMetadata,
      },
      message: {
        content: buildOfficialLocationRoomPrompt(input),
        transport: 'http',
        metadata: {
          source: 'wagdie-location-room',
          roomId: input.room.id,
          locationId: input.room.locationId,
          speakerTokenId: input.speaker.tokenId,
          officialAgentId: record.id,
        },
      },
      logContext: sessionMetadata,
    })
      const normalized = normalizeOfficialLocationRoomTurnResponse(collected.text, {
        narrativeContext: Boolean(input.narrativeContext),
        activeDecision: input.narrativeContext?.activeDecision ?? null,
        sceneCheckContext: input.narrativeContext?.sceneCheck ?? null,
      })

      if (!normalized.content) {
        throw new Error('Official ElizaOS generated an empty location-room turn')
      }

      return {
        officialAgentId: record.id,
        ...normalized,
      }
  }
}

export const officialLocationRoomTurnGenerator = new ElizaOfficialLocationRoomTurnGenerator()
