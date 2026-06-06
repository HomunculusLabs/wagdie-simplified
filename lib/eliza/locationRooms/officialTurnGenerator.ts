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
  LocationRoomPublicGenerationDiagnostics,
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
const DECLARED_ACTION_FORWARD_PATTERN = /\b(?:choose|chooses|press|presses|push|pushes|move|moves|step|steps|cross|crosses|open|opens|force|forces|draw|draws|raise|raises|block|blocks|shield|shields|follow|follows|track|tracks|search|searches|examine|examines|inspect|inspects|test|tests|ask|asks|question|questions|bargain|bargains|confront|confronts|protect|protects|retreat|retreats|withdraw|withdraws|pry|pries|climb|climbs|descend|descends|enter|enters|listen|listens|watch|watches|mark|marks|take|takes|grab|grabs|cut|cuts|throw|throws|whisper|whispers|crawl|crawls|sneak|sneaks|strike|strikes|shove|shoves|interpret|interprets|read|reads|study|studies|touch|touches|pull|pulls|carry|carries|drag|drags|hide|hides|lead|leads|signal|signals|warn|warns|hold|holds|brace|braces|bar|bars|unlock|unlocks|light|lights|extinguish|extinguishes|burn|burns|break|breaks|tie|ties|untie|unties|offer|offers|trade|trades|circle|circles|approach|approaches|leave|leaves|return|returns|answer|answers|resist|resists|quiet|quiets|bait|baits|investigate|investigates|navigate|navigates|recall|recalls)\b/i
const PASSIVE_DECLARED_ACTION_PATTERN = /^\s*(?:[^:]{1,40}:\s*)?(?:i\s+|we\s+)?(?:agree|nod|wait|react|hesitate|do nothing|say nothing|stand still|stay still|remain silent|keep watching|keep listening)\s*[.!?]*\s*$/i

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
    'Active decisions are GM-authored: choose a listed option only when your declared action commits to it; do not invent, close, or resolve options yourself.',
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
    '- Make declaredAction concrete and action-forward: move, inspect, open, ask, bargain, protect, retreat, test, or otherwise change position/pressure. Do not submit passive agreement/reaction only.',
    '- publicSpeech may react in character, but declaredAction must state what you do next in the fiction.',
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
      ? 'Return the requested JSON object with publicSpeech and a concrete declaredAction that moves the scene forward.'
      : 'Write exactly one short in-world utterance as your character.',
    input.narrativeContext
      ? 'Keep publicSpeech under two sentences. Avoid passive agreement-only turns; declare a concrete action unless the GM active decision already captures your commitment. Do not include markdown, speaker labels, stage directions, out-of-world explanations, dice results, DCs, HP, rewards, death, or finality.'
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

function officialTurnResponseFlags(raw: string) {
  const text = normalizeOfficialResponseText(raw)
  return {
    empty: text.length === 0,
    hasJsonObject: text.indexOf('{') >= 0 && text.lastIndexOf('}') > text.indexOf('{'),
    fencedJson: /```(?:json)?/i.test(text),
    startsWithJsonObject: text.trim().startsWith('{'),
  }
}

function categorizeOfficialTurnResponseError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (/empty/i.test(message)) return 'empty_response'
  if (/did not contain a JSON object/i.test(message)) return 'missing_json_object'
  if (/invalid JSON/i.test(message)) return 'invalid_json'
  if (/publicSpeech/i.test(message)) return 'missing_public_speech'
  if (/declaredAction/i.test(message)) return 'invalid_declared_action'
  if (/scene-check proposal/i.test(message)) return 'scene_check_proposal_invalid_optional'
  return 'validation_error'
}

function officialTurnDiagnosticsForInitialFailure(raw: string, error: unknown): LocationRoomPublicGenerationDiagnostics {
  return {
    status: 'repair_failed',
    repairAttempted: true,
    repaired: false,
    initialErrorCategory: categorizeOfficialTurnResponseError(error),
    initialResponseLength: raw.length,
    initialResponseFlags: officialTurnResponseFlags(raw),
  }
}

function isActionForwardDeclaredAction(summary: string, chosenOptionLabel: string | null | undefined): boolean {
  const normalized = normalizeOfficialResponseText(summary).replace(/\s+/g, ' ').trim()
  if (!normalized) return false
  if (PASSIVE_DECLARED_ACTION_PATTERN.test(normalized)) return false
  const optionLabel = chosenOptionLabel
    ? normalizeOfficialResponseText(chosenOptionLabel).replace(/\s+/g, ' ').trim()
    : ''
  return DECLARED_ACTION_FORWARD_PATTERN.test(normalized) || Boolean(optionLabel && DECLARED_ACTION_FORWARD_PATTERN.test(optionLabel))
}

function buildOfficialLocationRoomTurnRepairPrompt(
  input: GenerateOfficialLocationRoomTurnInput,
  diagnostics: LocationRoomPublicGenerationDiagnostics
): string {
  if (!input.narrativeContext) {
    return clampOfficialPrompt([
      'Repair the failed WAGDIE character utterance.',
      `Failure category: ${diagnostics.initialErrorCategory ?? 'validation_error'}`,
      `Previous response length: ${diagnostics.initialResponseLength ?? 0}`,
      '',
      'Minimal context:',
      `Location id: ${input.room.locationId}.`,
      `Speaker: ${truncatePromptValue(input.speaker.name, 80)} (#${input.speaker.tokenId}).`,
      '',
      'Repair rules:',
      '- Write exactly one short in-world utterance as the character.',
      '- Do not use JSON, markdown, speaker labels, stage directions, or out-of-world explanations.',
      '- Do not synthesize dice, DCs, HP, rewards, death, wallets, or finality.',
    ].join('\n'), false)
  }

  return clampOfficialPrompt([
    'Repair the failed WAGDIE character turn with one compact JSON object.',
    `Failure category: ${diagnostics.initialErrorCategory ?? 'validation_error'}`,
    `Previous response length: ${diagnostics.initialResponseLength ?? 0}`,
    '',
    'Minimal context:',
    `Location id: ${input.room.locationId}.`,
    `Speaker: ${truncatePromptValue(input.speaker.name, 80)} (#${input.speaker.tokenId}).`,
    ...formatNarrativeContext(input),
    '',
    'Repair rules:',
    '- Return exactly one JSON object: first character { and last character }. No markdown, commentary, speaker labels, or prose outside the object.',
    '- Do not return only publicSpeech. declaredAction is mandatory even when the character only speaks.',
    '- publicSpeech is required, non-empty, public-safe, and under two sentences.',
    '- declaredAction is required as a JSON object with a non-empty summary of the intended fictional action.',
    '- declaredAction.summary must name a concrete next action using an action verb such as search, inspect, move, open, ask, warn, protect, retreat, test, or follow.',
    '- declaredAction must be action-forward, not passive agreement/reaction only.',
    '- Do not synthesize dice, DCs, HP, rewards, death, wallets, or finality.',
    '- If sceneCheckProposal is allowed, set it to null unless the action is clearly roll-worthy and matches the offered checks.',
    '',
    CHARACTER_PROMPT_CONTRACT_MARKER,
    'Valid example: {"publicSpeech":"The ash is pointing below us.","declaredAction":{"summary":"Search the stair for the source of the ash marks.","chosenOptionId":null,"actionIntent":"search"},"sceneCheckProposal":null}',
    'Schema:',
    JSON.stringify({
      publicSpeech: 'short public in-character utterance',
      declaredAction: { summary: 'concrete next action with an action verb', chosenOptionId: null, actionIntent: 'search' },
      sceneCheckProposal: input.narrativeContext?.sceneCheck ? null : undefined,
    }),
  ].join('\n'), true)
}

export class OfficialLocationRoomTurnGenerationError extends Error {
  constructor(
    message: string,
    readonly diagnostics: LocationRoomPublicGenerationDiagnostics,
    options?: { cause?: unknown }
  ) {
    super(message)
    this.name = 'OfficialLocationRoomTurnGenerationError'
    this.cause = options?.cause
  }
}

export function normalizeOfficialLocationRoomTurnResponse(
  raw: string,
  options: {
    sceneCheckContext?: LocationRoomNarrativeTurnSceneCheckContext | null
    narrativeContext?: boolean
    activeDecision?: LocationRoomAdventureDecision | null
  } = {}
): Omit<GenerateOfficialLocationRoomTurnResult, 'officialAgentId' | 'turnGeneration'> {
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

  const parsed = extractGameMasterJsonObject(raw, 'Location-room character turn response')
  const content = typeof parsed.publicSpeech === 'string'
    ? normalizeLocationRoomGeneratedContent(parsed.publicSpeech) ?? ''
    : ''
  if (!content) {
    throw new Error('Location-room character turn response missing required publicSpeech')
  }

  const declaredAction = normalizeDeclaredAction(parsed.declaredAction ?? parsed.declared_action, { activeDecision })
  if (!declaredAction) {
    throw new Error('Location-room character turn response missing valid declaredAction')
  }
  if (!isActionForwardDeclaredAction(declaredAction.summary, declaredAction.chosenOptionLabel)) {
    throw new Error('Location-room character turn response declaredAction must name a concrete fictional action')
  }

  if (!sceneCheckContext) {
    return {
      content,
      declaredAction,
      declaredActionSource: 'structured_model',
      sceneCheckProposal: null,
      sceneCheckProposalError: null,
    }
  }

  const rawProposal = parsed.sceneCheckProposal ?? parsed.scene_check_proposal

  if (rawProposal == null || rawProposal === '') {
    return {
      content,
      declaredAction,
      declaredActionSource: 'structured_model',
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
      declaredActionSource: 'structured_model',
      sceneCheckProposal: null,
      sceneCheckProposalError: proposal.error,
    }
  }

  return {
    content,
    declaredAction,
    declaredActionSource: 'structured_model',
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

    const sessionMetadata = {
      source: 'wagdie-location-room',
      roomId: input.room.id,
      locationId: input.room.locationId,
      officialRoomId: input.room.officialRoomId,
      officialWorldId: input.room.officialWorldId,
      speakerTokenId: input.speaker.tokenId,
      officialAgentId: record.id,
    }

    let collected: Awaited<ReturnType<OfficialElizaMessagingClient['collectStreamedResponseText']>>
    let transportStage = 'start_agent'
    try {
      await this.messaging.startAgent(record.id)
      transportStage = 'collect_stream'
      collected = await sendAndCollectOfficialEphemeralSessionMessage(this.messaging, {
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
    } catch (transportError) {
      throw new OfficialLocationRoomTurnGenerationError(
        'Official location-room turn generation failed during Official ElizaOS transport',
        {
          status: 'repair_failed',
          repairAttempted: false,
          repaired: false,
          initialErrorCategory: 'transport_error',
          transportStage,
        },
        { cause: transportError }
      )
    }

    try {
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
        turnGeneration: {
          status: 'accepted',
          repairAttempted: false,
          repaired: false,
          initialResponseLength: collected.text.length,
          initialResponseFlags: officialTurnResponseFlags(collected.text),
        },
      }
    } catch (initialError) {
      const diagnostics = officialTurnDiagnosticsForInitialFailure(collected.text, initialError)
      let repairText = ''

      try {
        const repairSessionMetadata = {
          ...sessionMetadata,
          source: 'wagdie-location-room-repair',
          repairAttempted: true,
          initialErrorCategory: diagnostics.initialErrorCategory,
        }
        const repaired = await sendAndCollectOfficialEphemeralSessionMessage(this.messaging, {
          session: {
            agentId: record.id,
            userId: input.room.officialUserId,
            metadata: repairSessionMetadata,
          },
          message: {
            content: buildOfficialLocationRoomTurnRepairPrompt(input, diagnostics),
            transport: 'http',
            metadata: {
              source: 'wagdie-location-room-repair',
              roomId: input.room.id,
              locationId: input.room.locationId,
              speakerTokenId: input.speaker.tokenId,
              officialAgentId: record.id,
              repairAttempted: true,
              initialErrorCategory: diagnostics.initialErrorCategory,
            },
          },
          logContext: repairSessionMetadata,
        })
        repairText = repaired.text
      } catch (repairTransportError) {
        const failedDiagnostics: LocationRoomPublicGenerationDiagnostics = {
          ...diagnostics,
          status: 'repair_failed',
          repairAttempted: true,
          repaired: false,
          repairErrorCategory: 'repair_transport_error',
          transportStage: 'repair_collect_stream',
          repairResponseLength: repairText.length,
          repairResponseFlags: officialTurnResponseFlags(repairText),
        }
        throw new OfficialLocationRoomTurnGenerationError(
          `Official location-room turn repair failed (initial: ${failedDiagnostics.initialErrorCategory}, repair: ${failedDiagnostics.repairErrorCategory})`,
          failedDiagnostics,
          { cause: repairTransportError }
        )
      }

      try {
        const normalized = normalizeOfficialLocationRoomTurnResponse(repairText, {
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
          turnGeneration: {
            ...diagnostics,
            status: 'repaired',
            repairAttempted: true,
            repaired: true,
            repairResponseLength: repairText.length,
            repairResponseFlags: officialTurnResponseFlags(repairText),
          },
        }
      } catch (repairError) {
        const failedDiagnostics: LocationRoomPublicGenerationDiagnostics = {
          ...diagnostics,
          status: 'repair_failed',
          repairAttempted: true,
          repaired: false,
          repairErrorCategory: categorizeOfficialTurnResponseError(repairError),
          repairResponseLength: repairText.length,
          repairResponseFlags: officialTurnResponseFlags(repairText),
        }
        throw new OfficialLocationRoomTurnGenerationError(
          `Official location-room turn repair failed (initial: ${failedDiagnostics.initialErrorCategory}, repair: ${failedDiagnostics.repairErrorCategory})`,
          failedDiagnostics,
          { cause: repairError }
        )
      }
    }
  }
}

export const officialLocationRoomTurnGenerator = new ElizaOfficialLocationRoomTurnGenerator()
