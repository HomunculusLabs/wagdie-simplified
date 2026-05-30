import { elizaConfig } from '@/lib/eliza/config'
import {
  createOfficialElizaMessagingClient,
  sendAndCollectOfficialEphemeralSessionMessage,
  type OfficialElizaMessagingClient,
} from '@/lib/eliza/official/messaging'
import { extractGenerationJsonObject } from '../generation/json'
import type {
  LocationRoom,
  LocationRoomMessage,
  LocationRoomParticipant,
  LocationRoomTick,
} from '../types'
import {
  GAMEPLAY_ACTION_TYPES,
  GAMEPLAY_CHECK_TYPES,
  type GameplayActionEnvelope,
  type GameplayCharacterState,
  type GameplayEncounter,
  type GameplayMonsterState,
  type GameplayRoomState,
} from './types'
import {
  GAMEPLAY_FIXED_CHECK_CONFIG,
  parseGameplayContextualChecks,
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

export type GameplayActionGenerationDiagnostics = {
  status: 'accepted' | 'repaired' | 'repair_failed'
  repairAttempted: boolean
  repaired: boolean
  initialErrorCategory?: GameplayActionSemanticErrorCategory | 'transport_error' | 'character_resolution_error'
  repairErrorCategory?: GameplayActionSemanticErrorCategory
  transportStage?: 'resolve_character' | 'start_agent' | 'initial_collect' | 'repair_collect'
  initialResponseLength?: number
  repairResponseLength?: number
}

export type GenerateGameplayActionResult = {
  officialAgentId: string | null
  action: GameplayActionEnvelope
  rawResponseLength: number
  generationDiagnostics?: GameplayActionGenerationDiagnostics
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

function formatRecentSpeakerOpenings(messages: LocationRoomMessage[], speaker: LocationRoomParticipant): string {
  const openings = messages
    .filter((message) => message.tokenId === speaker.tokenId && typeof message.content === 'string')
    .slice(-3)
    .map((message) => message.content.replace(/\s+/g, ' ').trim().split(' ').slice(0, 8).join(' '))
    .filter((opening) => opening.length > 0)

  return openings.length > 0
    ? openings.map((opening) => `- ${opening}`).join('\n')
    : 'No recent openings from this character.'
}

function formatMonsters(monsters: GameplayMonsterState[]): string {
  if (monsters.length === 0) return 'No visible monsters.'
  return monsters.map((monster) => {
    return `- ${monster.name} (${monster.id}): ${toGameplayHpBand(monster)} HP band, status ${monster.status}, archetype ${monster.archetype}`
  }).join('\n')
}

function formatFixedChecks(): string {
  return GAMEPLAY_CHECK_TYPES.map((checkType) => {
    const config = GAMEPLAY_FIXED_CHECK_CONFIG[checkType]
    return `- ${checkType}: ${config.label} (primary stats ${config.primaryStats.join('/')}, base DC ${config.baseDc})`
  }).join('\n')
}

function formatContextualChecks(encounter: GameplayEncounter): string {
  const contextualChecks = parseGameplayContextualChecks(
    (encounter.mechanics as Record<string, unknown> | undefined)?.contextualChecks
  )
  if (contextualChecks.length === 0) return 'No contextual checks are currently offered.'

  return contextualChecks.map((check) => [
    `- ${check.id}: ${check.label}`,
    `(checkType ${check.checkType}, DC ${check.dc})`,
    check.description ? `— ${check.description}` : null,
  ].filter(Boolean).join(' ')).join('\n')
}

export type GameplayActionSemanticErrorCategory =
  | 'empty_response'
  | 'missing_json_object'
  | 'invalid_json'
  | 'missing_required_field'
  | 'target_constraint'
  | 'roll_choice_constraint'
  | 'validation_error'
  | 'repair_transport_error'

export class GameplayActionSemanticError extends Error {
  constructor(
    message: string,
    readonly category: GameplayActionSemanticErrorCategory,
    options?: { cause?: unknown }
  ) {
    super(message)
    this.name = 'GameplayActionSemanticError'
    this.cause = options?.cause
  }
}

function categorizeGameplayActionResponseError(error: unknown): GameplayActionSemanticErrorCategory {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (/empty/i.test(message)) return 'empty_response'
  if (/did not contain a JSON object/i.test(message)) return 'missing_json_object'
  if (/invalid JSON/i.test(message)) return 'invalid_json'
  if (/public speech|Unsupported gameplay action type|must be a JSON object/i.test(message)) return 'missing_required_field'
  if (/target|Attack actions require|Help actions require/i.test(message)) return 'target_constraint'
  if (/roll choice|check type|contextual/i.test(message)) return 'roll_choice_constraint'
  return 'validation_error'
}

function toGameplayActionSemanticError(error: unknown): GameplayActionSemanticError {
  if (error instanceof GameplayActionSemanticError) {
    return error
  }

  const message = error instanceof Error ? error.message : String(error ?? 'Gameplay action response was invalid')
  return new GameplayActionSemanticError(
    message,
    categorizeGameplayActionResponseError(error),
    { cause: error }
  )
}

type GameplayActionRepairDiagnostics = {
  category: GameplayActionSemanticErrorCategory
  message: string
  responseLength: number
}

function sanitizeActionErrorMessage(message: string): string {
  return message.replace(/\s+/g, ' ').slice(0, 240)
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
    'Recent openings from you to avoid repeating:',
    formatRecentSpeakerOpenings(input.recentMessages, input.speaker),
    '',
    input.speakerInstruction ? `Private GM instruction: ${input.speakerInstruction}` : 'No private GM instruction for this turn.',
    '',
    `Available action types: ${GAMEPLAY_ACTION_TYPES.join(', ')}`,
    'Action type is your tactical intent/effect. Roll choice is the backend mechanical check you want resolved for that action.',
    '',
    'Available fixed roll checks:',
    formatFixedChecks(),
    '',
    'Available contextual roll checks from this encounter:',
    formatContextualChecks(input.encounter),
    'If you choose a contextual roll check, use exactly one offered contextualCheckId. Do not invent contextual ids, labels, DCs, or mechanics.',
    'Return only JSON with this exact contract:',
    '{',
    '  "actionType": "attack|defend|help|investigate|negotiate|flee|rest",',
    '  "target": { "kind": "monster", "id": "monster-1" },',
    '  "rollChoice": { "source": "fixed", "checkType": "explore" },',
    '  "publicSpeech": "short public in-character speech with concrete target/room detail",',
    '  "intentSummary": "short private intent"',
    '}',
    '',
    'Rules:',
    '- Return JSON only. The first non-whitespace character must be { and the last must be }.',
    '- Attack requires a legal monster target. Help requires a legal character target.',
    '- If live monsters are visible and the GM has not instructed a nonviolent objective, prefer attack/defend/help over passive investigate.',
    '- Scene investigation alone does not defeat monsters; use attack when trying to end the encounter.',
    '- Fixed rollChoice checkType must be one of the listed fixed checks, such as attack, defend, help, investigate, arcana, or nature.',
    '- Contextual rollChoice must use an offered contextualCheckId; the server ignores any agent-supplied contextual label/DC/check type.',
    '- publicSpeech is required, public-safe, and must name or clearly point to a visible target, ally, obstacle, room feature, or immediate tactic from this encounter. Avoid repeating recent opening words or generic lines such as "I strike" without specific target/room detail.',
    '- Do not repeat your recent opening words, generic attack lines, or weak openings such as "I strike", "I hold the line", "I study the room", or "I move forward" unless you add specific target/room detail.',
    '- Do not include markdown, speaker labels, or out-of-world explanations.',
  ].filter((line): line is string => line !== null).join('\n')
}

function buildGameplayActionRepairPrompt(
  input: GenerateGameplayActionInput,
  diagnostics: GameplayActionRepairDiagnostics
): string {
  const monsters = input.visibleMonsters ?? parseGameplayMonsters(input.encounter.monsterState)
  const legalMonsterIds = input.validation.legalMonsterIds?.length
    ? input.validation.legalMonsterIds.join(', ')
    : 'none'
  const legalCharacterTokenIds = input.validation.legalCharacterTokenIds?.length
    ? input.validation.legalCharacterTokenIds.map(String).join(', ')
    : 'none'

  return [
    'Your previous autonomous gameplay action response could not be accepted by the server.',
    'This is a semantic repair attempt, not a transport retry. Return a fresh legal action now.',
    `Safe error category: ${diagnostics.category}`,
    `Safe error message: ${sanitizeActionErrorMessage(diagnostics.message)}`,
    `Rejected response length: ${diagnostics.responseLength}`,
    '',
    `You are ${input.speaker.name} (#${input.speaker.tokenId}).`,
    `Encounter: ${input.encounter.publicTitle ?? 'Untitled encounter'}`,
    input.encounter.publicSummary ? `Encounter summary: ${input.encounter.publicSummary}` : null,
    '',
    `Legal monster target ids: ${legalMonsterIds}`,
    `Legal character token ids: ${legalCharacterTokenIds}`,
    '',
    'Visible monsters:',
    formatMonsters(monsters),
    '',
    'Recent openings from you to avoid repeating:',
    formatRecentSpeakerOpenings(input.recentMessages, input.speaker),
    '',
    'Available fixed roll checks:',
    formatFixedChecks(),
    '',
    'Available contextual roll checks from this encounter:',
    formatContextualChecks(input.encounter),
    '',
    'Return only JSON with this exact contract:',
    '{',
    '  "actionType": "attack|defend|help|investigate|negotiate|flee|rest",',
    '  "target": { "kind": "monster", "id": "monster-1" },',
    '  "rollChoice": { "source": "fixed", "checkType": "attack" },',
    '  "publicSpeech": "short public in-character speech with concrete target/room detail",',
    '  "intentSummary": "short private intent"',
    '}',
    '',
    'Repair rules:',
    '- JSON only: no markdown, prose wrapper, speaker label, or explanation.',
    '- The first non-whitespace character must be { and the last must be }.',
    '- actionType must be one of the listed action types.',
    '- Attack must target one legal monster id; help must target one legal character token id.',
    '- Fixed rollChoice checkType must be one listed fixed check.',
    '- Contextual rollChoice must use exactly one offered contextualCheckId if you choose contextual.',
    '- publicSpeech is required, public-safe, and must name or clearly point to a visible target, ally, obstacle, room feature, or immediate tactic from this encounter. Avoid repeating recent opening words or generic lines such as "I strike" without specific target/room detail.',
  ].filter((line): line is string => line !== null).join('\n')
}

export function parseGameplayActionResponseStrict(
  raw: string,
  validation: GameplayActionValidationContext
): { action: GameplayActionEnvelope; rawResponseLength: number } {
  let parsed: Record<string, unknown>
  try {
    parsed = extractGenerationJsonObject(raw, 'Gameplay action response')
  } catch (error) {
    throw toGameplayActionSemanticError(error)
  }

  const result = validateGameplayActionEnvelope(parsed, validation)
  if (!result.ok) {
    throw new GameplayActionSemanticError(
      result.error,
      categorizeGameplayActionResponseError(new Error(result.error))
    )
  }

  return {
    action: result.action,
    rawResponseLength: raw.length,
  }
}

export function normalizeGameplayActionResponse(
  raw: string,
  validation: GameplayActionValidationContext
): { action: GameplayActionEnvelope; rawResponseLength: number } {
  return parseGameplayActionResponseStrict(raw, validation)
}

function withGameplayActionRepairMetadata(
  action: GameplayActionEnvelope,
  initialError: GameplayActionSemanticError
): GameplayActionEnvelope {
  return {
    ...action,
    metadata: {
      ...(action.metadata ?? {}),
      semanticRepairAttempted: true,
      repairedFromSemanticFailure: true,
      initialErrorCategory: initialError.category,
    },
  }
}

export class GameplayActionGenerationError extends Error {
  constructor(
    message: string,
    readonly diagnostics: GameplayActionGenerationDiagnostics,
    options?: { cause?: unknown }
  ) {
    super(message)
    this.name = 'GameplayActionGenerationError'
    this.cause = options?.cause
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
    let officialAgentId: string | null = null
    let transportStage: GameplayActionGenerationDiagnostics['transportStage'] = 'resolve_character'
    let collectedText = ''

    try {
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
      officialAgentId = record.id

      transportStage = 'start_agent'
      await this.messaging.startAgent(record.id)
      const sessionMetadata = {
        source: 'wagdie-location-room-gameplay-action',
        roomId: input.room.id,
        locationId: input.room.locationId,
        tickId: input.tick.id,
        speakerTokenId: input.speaker.tokenId,
        officialAgentId: record.id,
      }
      transportStage = 'initial_collect'
      const collected = await sendAndCollectOfficialEphemeralSessionMessage(this.messaging, {
        session: {
          agentId: record.id,
          userId: input.room.officialUserId,
          metadata: sessionMetadata,
        },
        message: {
          content: buildGameplayActionPrompt(input),
          transport: 'http',
          metadata: {
            source: 'wagdie-location-room-gameplay-action',
            roomId: input.room.id,
            locationId: input.room.locationId,
            tickId: input.tick.id,
            speakerTokenId: input.speaker.tokenId,
            officialAgentId: record.id,
          },
        },
        logContext: sessionMetadata,
      })
      collectedText = collected.text

      try {
        const normalized = parseGameplayActionResponseStrict(collectedText, input.validation)

        return {
          officialAgentId: record.id,
          action: normalized.action,
          rawResponseLength: normalized.rawResponseLength,
          generationDiagnostics: {
            status: 'accepted',
            repairAttempted: false,
            repaired: false,
            initialResponseLength: collectedText.length,
          },
        }
      } catch (initialError) {
        const initialSemanticError = toGameplayActionSemanticError(initialError)
        const repairMetadata = {
          ...sessionMetadata,
          source: 'wagdie-location-room-gameplay-action-repair',
          repairAttempted: true,
          initialErrorCategory: initialSemanticError.category,
        }
        let repairText = ''

        try {
          transportStage = 'repair_collect'
          const repaired = await sendAndCollectOfficialEphemeralSessionMessage(this.messaging, {
            session: {
              agentId: record.id,
              userId: input.room.officialUserId,
              metadata: repairMetadata,
            },
            message: {
              content: buildGameplayActionRepairPrompt(input, {
                category: initialSemanticError.category,
                message: initialSemanticError.message,
                responseLength: collectedText.length,
              }),
              transport: 'http',
              metadata: repairMetadata,
            },
            logContext: repairMetadata,
          })
          repairText = repaired.text
          const normalized = parseGameplayActionResponseStrict(repairText, input.validation)

          return {
            officialAgentId: record.id,
            action: withGameplayActionRepairMetadata(normalized.action, initialSemanticError),
            rawResponseLength: normalized.rawResponseLength,
            generationDiagnostics: {
              status: 'repaired',
              repairAttempted: true,
              repaired: true,
              initialErrorCategory: initialSemanticError.category,
              initialResponseLength: collectedText.length,
              repairResponseLength: repairText.length,
            },
          }
        } catch (repairError) {
          const repairErrorCategory = repairError instanceof GameplayActionSemanticError
            ? repairError.category
            : 'repair_transport_error'
          throw new GameplayActionGenerationError(
            `Gameplay action repair failed (initial: ${initialSemanticError.category}, repair: ${repairErrorCategory})`,
            {
              status: 'repair_failed',
              repairAttempted: true,
              repaired: false,
              initialErrorCategory: initialSemanticError.category,
              repairErrorCategory,
              transportStage: repairErrorCategory === 'repair_transport_error' ? 'repair_collect' : undefined,
              initialResponseLength: collectedText.length,
              repairResponseLength: repairText.length,
            },
            { cause: repairError }
          )
        }
      }
    } catch (error) {
      if (error instanceof GameplayActionGenerationError) {
        throw error
      }
      const initialErrorCategory = transportStage === 'resolve_character'
        ? 'character_resolution_error'
        : 'transport_error'
      throw new GameplayActionGenerationError(
        'Gameplay action generation failed before valid model output was available',
        {
          status: 'repair_failed',
          repairAttempted: false,
          repaired: false,
          initialErrorCategory,
          transportStage,
          initialResponseLength: collectedText.length,
        },
        { cause: error }
      )
    }
  }
}

export const officialGameplayActionGenerator = new OfficialGameplayActionGenerator()
