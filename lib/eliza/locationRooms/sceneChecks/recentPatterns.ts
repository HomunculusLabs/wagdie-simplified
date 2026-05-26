import { GAMEPLAY_CHECK_TYPES, type GameplayCheckType } from '../gameplay/types'
import type { LocationRoomMessage } from '../types'

export const RECENT_SCENE_CHECK_CONTEXT_MAX_CHECKS = 6
export const RECENT_SCENE_CHECK_CONTEXT_MAX_OPENINGS = 4
const OUTCOME_OPENING_WORDS = 8

export type RecentSceneCheckRun = {
  checkType: GameplayCheckType
  count: number
}

export type RecentSceneCheckPattern = {
  checkTypes: GameplayCheckType[]
  repeatedRun: RecentSceneCheckRun | null
  outcomeOpenings: string[]
}

function messageMetadataRecord(message: LocationRoomMessage): Record<string, unknown> {
  return message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata)
    ? message.metadata as Record<string, unknown>
    : {}
}

function getNestedRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function isGameplayCheckType(value: unknown): value is GameplayCheckType {
  return typeof value === 'string' && (GAMEPLAY_CHECK_TYPES as readonly string[]).includes(value)
}

export function extractSceneCheckTypeFromMessage(message: LocationRoomMessage): GameplayCheckType | null {
  const metadata = messageMetadataRecord(message)
  const publicRolls = getNestedRecord(metadata.publicRolls)
  const action = getNestedRecord(publicRolls?.action)
  if (isGameplayCheckType(action?.checkType)) return action.checkType

  const rollFacts = getNestedRecord(metadata.rollFacts)
  if (isGameplayCheckType(rollFacts?.checkType)) return rollFacts.checkType

  const match = message.content.match(/\b(attack|defend|help|investigate|negotiate|flee|rest|explore|arcana|nature|perception|survival|athletics|stealth|persuasion|intimidation|medicine|history|religion)\b/i)
  const inferred = match?.[1]?.toLowerCase()
  return isGameplayCheckType(inferred) ? inferred : null
}

export function recentCheckTypeRun(checkTypes: readonly GameplayCheckType[]): RecentSceneCheckRun | null {
  const last = checkTypes[checkTypes.length - 1]
  if (!last) return null

  let count = 0
  for (let index = checkTypes.length - 1; index >= 0; index -= 1) {
    if (checkTypes[index] !== last) break
    count += 1
  }

  return count >= 2 ? { checkType: last, count } : null
}

function normalizePromptText(content: string): string {
  return content
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizedOutcomeOpening(content: string, words = OUTCOME_OPENING_WORDS): string | null {
  const normalized = normalizePromptText(content)
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return null
  const opening = normalized.split(' ').slice(0, words).join(' ')
  return opening || null
}

export function extractRecentOutcomeOpenings(
  messages: LocationRoomMessage[],
  maxOpenings = RECENT_SCENE_CHECK_CONTEXT_MAX_OPENINGS
): string[] {
  return messages
    .filter((message) => {
      const metadata = messageMetadataRecord(message)
      return message.authorKind === 'game_master' && metadata.messageKind === 'gm_outcome'
    })
    .map((message) => normalizedOutcomeOpening(message.content))
    .filter((opening): opening is string => Boolean(opening))
    .slice(-maxOpenings)
}

export function extractRecentSceneCheckPattern(
  messages: LocationRoomMessage[],
  options: { maxChecks?: number; maxOpenings?: number } = {}
): RecentSceneCheckPattern {
  const checkTypes = messages
    .map(extractSceneCheckTypeFromMessage)
    .filter((checkType): checkType is GameplayCheckType => Boolean(checkType))
    .slice(-(options.maxChecks ?? RECENT_SCENE_CHECK_CONTEXT_MAX_CHECKS))

  return {
    checkTypes,
    repeatedRun: recentCheckTypeRun(checkTypes),
    outcomeOpenings: extractRecentOutcomeOpenings(
      messages,
      options.maxOpenings ?? RECENT_SCENE_CHECK_CONTEXT_MAX_OPENINGS
    ),
  }
}

export function buildRecentSceneCheckPatternLines(messages: LocationRoomMessage[]): string[] {
  const pattern = extractRecentSceneCheckPattern(messages)

  if (pattern.checkTypes.length === 0 && pattern.outcomeOpenings.length === 0) return []

  return [
    `Recent scene-check pattern context: check types ${pattern.checkTypes.length > 0 ? pattern.checkTypes.join(' -> ') : 'None.'}; repeated run ${pattern.repeatedRun ? `${pattern.repeatedRun.checkType} x${pattern.repeatedRun.count}` : 'None.'}; GM outcome openings ${pattern.outcomeOpenings.length > 0 ? pattern.outcomeOpenings.map((opening) => `"${opening}"`).join(' | ') : 'None.'}.`,
    'Repetition guidance: avoid the same checkType/opening when another semantically valid option fits.',
  ]
}

export function hasDuplicateRecentOutcomeOpening(publicNarration: string, recentMessages: LocationRoomMessage[] | undefined): boolean {
  if (!recentMessages || recentMessages.length === 0) return false
  const opening = normalizedOutcomeOpening(publicNarration)
  if (!opening) return false
  return extractRecentOutcomeOpenings(recentMessages).includes(opening)
}
