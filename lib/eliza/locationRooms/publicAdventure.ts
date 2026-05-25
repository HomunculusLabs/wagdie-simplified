import type {
  PublicLocationRoomAdventure,
  PublicLocationRoomAdventureClock,
  PublicLocationRoomAdventureConsequence,
  PublicLocationRoomAdventureDecision,
  PublicLocationRoomAdventureDecisionOption,
  PublicLocationRoomAdventureDeclaredAction,
} from './types'

const PUBLIC_ADVENTURE_DECISION_OPTION_LIMIT = 4
const PUBLIC_ADVENTURE_CLOCK_LIMIT = 6
const PUBLIC_ADVENTURE_ID_MAX_LENGTH = 80
const PUBLIC_ADVENTURE_TEXT_BANNED_PATTERN = /\b(?:wallet|private\s*key|owner\s*address|staker\s*address|hit\s*points?|hp|xp|reward|loot\s*drop|death|dead|killed|fatal|finality|raw\s*model|system\s*prompt|mechanics?|mechanical\s*delta|adjudication|dc)\b|0x[a-f0-9]{20,}/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function nullablePublicText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/\s+/g, ' ').trim().slice(0, maxLength).trim()
  if (!text || PUBLIC_ADVENTURE_TEXT_BANNED_PATTERN.test(text)) return null
  return text
}

function normalizePublicId(value: unknown, fallback: string | null = null): string | null {
  const text = nullablePublicText(value, PUBLIC_ADVENTURE_ID_MAX_LENGTH)
  if (!text) return fallback
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9:._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, PUBLIC_ADVENTURE_ID_MAX_LENGTH)
  return normalized || fallback
}

function normalizeDecisionOption(value: unknown, index: number): PublicLocationRoomAdventureDecisionOption | null {
  if (!isRecord(value)) return null
  const id = normalizePublicId(value.id, `option-${index + 1}`)
  const label = nullablePublicText(value.label ?? value.title ?? value.summary, 80)
  if (!id || !label) return null
  const summary = nullablePublicText(value.summary, 180)
  return {
    id,
    label,
    ...(summary && summary !== label ? { summary } : {}),
  }
}

function normalizeDecision(value: unknown): PublicLocationRoomAdventureDecision | null {
  if (!isRecord(value)) return null
  const id = normalizePublicId(value.id, 'decision')
  const prompt = nullablePublicText(value.prompt ?? value.summary, 280)
  const options = Array.isArray(value.options)
    ? value.options
      .map((option, index) => normalizeDecisionOption(option, index))
      .filter((option): option is PublicLocationRoomAdventureDecisionOption => Boolean(option))
      .slice(0, PUBLIC_ADVENTURE_DECISION_OPTION_LIMIT)
    : []
  if (!id || !prompt || options.length === 0) return null
  const selectedOptionId = normalizePublicId(value.selectedOptionId)
  const selectedOption = selectedOptionId
    ? options.find((option) => option.id === selectedOptionId)
    : null
  return {
    id,
    prompt,
    options,
    ...(selectedOption ? { selectedOptionId: selectedOption.id, selectedOptionLabel: selectedOption.label } : {}),
  }
}

function normalizeDeclaredAction(
  value: unknown,
  activeDecision: PublicLocationRoomAdventureDecision | null
): PublicLocationRoomAdventureDeclaredAction | null {
  if (!isRecord(value)) return null
  const summary = nullablePublicText(value.summary ?? value.action ?? value.publicSummary, 240)
  if (!summary) return null
  const tokenId = typeof value.tokenId === 'number' && Number.isInteger(value.tokenId) ? value.tokenId : null
  const chosenOptionId = normalizePublicId(value.chosenOptionId)
  const chosenOption = chosenOptionId && activeDecision
    ? activeDecision.options.find((option) => option.id === chosenOptionId) ?? null
    : null
  const actionIntent = nullablePublicText(value.actionIntent ?? value.intent, 80)
  return {
    ...(tokenId != null ? { tokenId } : {}),
    summary,
    ...(chosenOption ? { chosenOptionId: chosenOption.id, chosenOptionLabel: chosenOption.label } : {}),
    ...(actionIntent ? { actionIntent } : {}),
  }
}

function normalizeConsequenceStatus(value: unknown): PublicLocationRoomAdventureConsequence['status'] | undefined {
  return value === 'open' || value === 'resolved' || value === 'advantage' || value === 'complication'
    ? value
    : undefined
}

function normalizeConsequenceTier(value: unknown): PublicLocationRoomAdventureConsequence['tier'] | undefined {
  return value === 'critical_success' ||
    value === 'success' ||
    value === 'partial_success' ||
    value === 'failure' ||
    value === 'critical_failure' ||
    value === 'unknown'
    ? value
    : undefined
}

function normalizeConsequence(value: unknown): PublicLocationRoomAdventureConsequence | null {
  if (!isRecord(value)) return null
  const summary = nullablePublicText(value.summary ?? value.description, 320)
  if (!summary) return null
  const status = normalizeConsequenceStatus(value.status)
  const tier = normalizeConsequenceTier(value.tier)
  return {
    summary,
    ...(status ? { status } : {}),
    ...(tier ? { tier } : {}),
  }
}

function normalizeClock(value: unknown, index: number): PublicLocationRoomAdventureClock | null {
  if (!isRecord(value)) return null
  const id = normalizePublicId(value.id, `clock-${index + 1}`)
  const label = nullablePublicText(value.label ?? value.title, 100)
  const summary = nullablePublicText(value.summary ?? value.description ?? label, 240)
  const rawMax = typeof value.max === 'number' || typeof value.max === 'string' ? Number(value.max) : 6
  const max = Math.max(1, Math.min(12, Number.isFinite(rawMax) ? Math.round(rawMax) : 6))
  const rawValue = typeof value.value === 'number' || typeof value.value === 'string' ? Number(value.value) : 0
  const clockValue = Math.max(0, Math.min(max, Number.isFinite(rawValue) ? Math.round(rawValue) : 0))
  if (!id || !label || !summary) return null
  return { id, label, value: clockValue, max, summary }
}

function latestConsequenceFromLedger(value: unknown): PublicLocationRoomAdventureConsequence | null {
  if (!Array.isArray(value)) return null
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const consequence = normalizeConsequence(value[index])
    if (consequence) return consequence
  }
  return null
}

export type PublicAdventureVisibilityMetadata = {
  /** Server-owned future feature flag; routine/legacy publicAdventure remains hidden without this exact value. */
  publicAdventureVisibility?: unknown
  publicAdventure?: unknown
}

function isFeaturedPublicAdventureMetadata(metadata: PublicAdventureVisibilityMetadata): boolean {
  return metadata.publicAdventureVisibility === 'featured'
}

export function sanitizePublicLocationRoomAdventure(value: unknown): PublicLocationRoomAdventure | null {
  if (!isRecord(value)) return null
  const stakes = nullablePublicText(value.stakes ?? value.currentStakes, 300)
  const activeDecision = normalizeDecision(value.activeDecision)
  const declaredAction = normalizeDeclaredAction(value.declaredAction ?? value.lastDeclaredAction, activeDecision)
  const consequence = normalizeConsequence(value.consequence ?? value.lastOutcome) ?? latestConsequenceFromLedger(value.consequenceLedger)
  const clocks = Array.isArray(value.clocks)
    ? value.clocks
      .map((clock, index) => normalizeClock(clock, index))
      .filter((clock): clock is PublicLocationRoomAdventureClock => Boolean(clock))
      .slice(0, PUBLIC_ADVENTURE_CLOCK_LIMIT)
    : []

  const adventure: PublicLocationRoomAdventure = {
    ...(stakes ? { stakes } : {}),
    ...(activeDecision ? { activeDecision } : {}),
    ...(declaredAction ? { declaredAction } : {}),
    ...(consequence ? { consequence } : {}),
    ...(clocks.length > 0 ? { clocks } : {}),
  }

  return Object.keys(adventure).length > 0 ? adventure : null
}

export function projectFeaturedPublicLocationRoomAdventure(
  metadata: PublicAdventureVisibilityMetadata | null | undefined
): PublicLocationRoomAdventure | null {
  if (!metadata || !isFeaturedPublicAdventureMetadata(metadata)) return null
  return sanitizePublicLocationRoomAdventure(metadata.publicAdventure)
}
