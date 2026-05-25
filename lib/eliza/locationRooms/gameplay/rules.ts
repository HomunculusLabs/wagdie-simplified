import { elizaConfig, type ElizaLocationRoomGameplayDifficulty } from '@/lib/eliza/config'
import { rollDiceFormula, type GameplayRandomSource, type SupportedDiceFormula } from './dice'
import {
  GAMEPLAY_ACTION_TYPES,
  GAMEPLAY_CHECK_TYPES,
  type GameplayActionEnvelope,
  type GameplayActionTarget,
  type GameplayActionType,
  type GameplayCharacterState,
  type GameplayCharacterStateMap,
  type GameplayCheckType,
  type GameplayContextualCheckOption,
  type GameplayCoreStatKey,
  type GameplayDiceRollResult,
  type GameplayEffectiveStats,
  type GameplayEncounter,
  type GameplayEncounterStatus,
  type GameplayModifierSource,
  type GameplayMonsterState,
  type GameplayPerformanceCounterUpdate,
  type GameplayRewardPlan,
  type GameplayRollChoice,
  type GameplayRollModifierBreakdown,
  type GameplayStatContribution,
} from './types'

export type GameplaySuccessTier = 'critical_failure' | 'failure' | 'partial_success' | 'success' | 'critical_success'

export type GameplayActionValidationContext = {
  legalMonsterIds?: string[]
  legalCharacterTokenIds?: number[]
  contextualChecks?: GameplayContextualCheckOption[]
  publicSpeechMaxLength?: number
  intentSummaryMaxLength?: number
}

export type GameplayActionValidationResult =
  | { ok: true; action: GameplayActionEnvelope }
  | { ok: false; error: string }

export type GameplayRollPlan = {
  formula: 'd20'
  dc: number
  modifier: number
  targetKind: 'monster' | 'character' | 'scene' | 'none'
  checkType: GameplayCheckType
  checkLabel: string
  checkSource: GameplayRollChoice['source']
  contextualCheckId?: string | null
  modifierBreakdown?: GameplayRollModifierBreakdown
}

export type GameplayRollResolution = GameplayRollPlan & {
  roll: GameplayDiceRollResult
  total: number
  tier: GameplaySuccessTier
}

export type GameplayEncounterProposal = Partial<{
  title: string
  summary: string
  difficulty: ElizaLocationRoomGameplayDifficulty
  monsterCount: number
  monsterName: string
  monsterArchetype: string
  totalMonsterHp: number
  monsterAc: number
  monsterAttackBonus: number
  monsterDamageFormula: SupportedDiceFormula | string
  sceneDc: number
  rewardXpPerCharacter: number
  temporaryBoons: unknown
  narrativeRewards: unknown
  victoryText: string
  contextualChecks: unknown
}>

export type NormalizeEncounterOptions = {
  partySize: number
  averageLevel?: number
  difficulty?: ElizaLocationRoomGameplayDifficulty
  maxMonsterCount?: number
  maxTotalMonsterHp?: number
  maxXpPerCharacter?: number
  maxTemporaryBoons?: number
  maxNarrativeRewards?: number
}

export type NormalizedGameplayEncounter = {
  difficulty: ElizaLocationRoomGameplayDifficulty
  publicTitle: string
  publicSummary: string
  monsters: GameplayMonsterState[]
  rewardPlan: GameplayRewardPlan
  mechanics: {
    budget: number
    sceneDc: number
    contextualChecks: GameplayContextualCheckOption[]
    normalizedFromProposal: boolean
  }
}

export type ResolveGameplayTurnMechanicsInput = {
  actorTokenId: number
  action: GameplayActionEnvelope
  encounter: Pick<GameplayEncounter, 'status' | 'difficulty' | 'roundNumber' | 'monsterState' | 'rewardPlan' | 'mechanics' | 'metadata'>
  characters: GameplayCharacterStateMap
  rng?: GameplayRandomSource
  maxEncounterRounds?: number
  statsEnabled?: boolean
}

export type GameplayTurnMechanicalDeltas = {
  actorTokenId: number
  actionType: GameplayActionType
  actionRoll: GameplayRollResolution
  actionDamage?: { monsterId: string; amount: number; statContribution?: GameplayStatContribution | null } | null
  healing?: { tokenId: number; amount: number; statContribution?: GameplayStatContribution | null } | null
  monsterRetaliation?: {
    monsterId: string
    tokenId: number
    amount: number
    attackRoll?: GameplayRollResolution | null
    damageRoll?: GameplayDiceRollResult | null
    targetAc?: number | null
    hit?: boolean
  } | null
  charactersBefore: GameplayCharacterStateMap
  charactersAfter: GameplayCharacterStateMap
  monstersBefore: GameplayMonsterState[]
  monstersAfter: GameplayMonsterState[]
  deaths: number[]
  rewardAssignments: Array<{ tokenId: number; xp: number; temporaryBoons: string[] }>
  rewardsApplied: boolean
  encounterStatusBefore: GameplayEncounterStatus
  encounterStatusAfter: GameplayEncounterStatus
  roundNumberBefore: number
  roundNumberAfter: number
  performanceUpdates?: GameplayPerformanceCounterUpdate[]
}

export type ResolveGameplayTurnMechanicsResult = {
  diceResults: GameplayDiceRollResult[]
  mechanicalDeltas: GameplayTurnMechanicalDeltas
}

const DEFAULT_PUBLIC_SPEECH_MAX_LENGTH = 500
const DEFAULT_INTENT_SUMMARY_MAX_LENGTH = 240
const DEFAULT_MAX_MONSTER_COUNT = 6
const DEFAULT_MAX_TOTAL_MONSTER_HP = 180
const DEFAULT_MAX_XP_PER_CHARACTER = 100
const DEFAULT_MAX_TEMPORARY_BOONS = 2
const DEFAULT_MAX_NARRATIVE_REWARDS = 3

const GAMEPLAY_DIFFICULTIES = ['easy', 'normal', 'hard', 'deadly'] as const

const DIFFICULTY_MULTIPLIERS: Record<ElizaLocationRoomGameplayDifficulty, number> = {
  easy: 0.75,
  normal: 1,
  hard: 1.5,
  deadly: 2,
}

const BASE_BUDGET_BY_LEVEL: Record<number, number> = {
  1: 25,
  2: 35,
  3: 50,
  4: 75,
  5: 110,
}

const ACTION_DCS: Record<GameplayActionType, number> = {
  attack: 12,
  defend: 10,
  help: 10,
  investigate: 12,
  negotiate: 13,
  flee: 11,
  rest: 10,
}

const ACTION_MODIFIERS: Record<GameplayActionType, number> = {
  attack: 2,
  defend: 1,
  help: 1,
  investigate: 1,
  negotiate: 0,
  flee: 1,
  rest: 0,
}

export const ACTION_PRIMARY_STAT_MAPPING: Record<GameplayActionType, GameplayCoreStatKey[]> = {
  attack: ['str', 'dex'],
  defend: ['dex', 'con'],
  help: ['cha'],
  investigate: ['int', 'wis'],
  negotiate: ['cha'],
  flee: ['dex'],
  rest: ['con'],
}

export type GameplayFixedCheckConfig = {
  label: string
  baseDc: number
  primaryStats: GameplayCoreStatKey[]
  legacyModifier: number
}

export const GAMEPLAY_FIXED_CHECK_CONFIG: Record<GameplayCheckType, GameplayFixedCheckConfig> = {
  attack: { label: 'Attack', baseDc: ACTION_DCS.attack, primaryStats: ACTION_PRIMARY_STAT_MAPPING.attack, legacyModifier: ACTION_MODIFIERS.attack },
  defend: { label: 'Defend', baseDc: ACTION_DCS.defend, primaryStats: ACTION_PRIMARY_STAT_MAPPING.defend, legacyModifier: ACTION_MODIFIERS.defend },
  help: { label: 'Help', baseDc: ACTION_DCS.help, primaryStats: ACTION_PRIMARY_STAT_MAPPING.help, legacyModifier: ACTION_MODIFIERS.help },
  investigate: { label: 'Investigate', baseDc: ACTION_DCS.investigate, primaryStats: ACTION_PRIMARY_STAT_MAPPING.investigate, legacyModifier: ACTION_MODIFIERS.investigate },
  negotiate: { label: 'Negotiate', baseDc: ACTION_DCS.negotiate, primaryStats: ACTION_PRIMARY_STAT_MAPPING.negotiate, legacyModifier: ACTION_MODIFIERS.negotiate },
  flee: { label: 'Flee', baseDc: ACTION_DCS.flee, primaryStats: ACTION_PRIMARY_STAT_MAPPING.flee, legacyModifier: ACTION_MODIFIERS.flee },
  rest: { label: 'Rest', baseDc: ACTION_DCS.rest, primaryStats: ACTION_PRIMARY_STAT_MAPPING.rest, legacyModifier: ACTION_MODIFIERS.rest },
  explore: { label: 'Explore', baseDc: 12, primaryStats: ['wis', 'dex'], legacyModifier: 0 },
  arcana: { label: 'Arcana', baseDc: 13, primaryStats: ['int'], legacyModifier: 0 },
  nature: { label: 'Nature', baseDc: 12, primaryStats: ['int', 'wis'], legacyModifier: 0 },
  perception: { label: 'Perception', baseDc: 12, primaryStats: ['wis'], legacyModifier: 0 },
  survival: { label: 'Survival', baseDc: 12, primaryStats: ['wis', 'con'], legacyModifier: 0 },
  athletics: { label: 'Athletics', baseDc: 12, primaryStats: ['str'], legacyModifier: 0 },
  stealth: { label: 'Stealth', baseDc: 12, primaryStats: ['dex'], legacyModifier: 0 },
  persuasion: { label: 'Persuasion', baseDc: 13, primaryStats: ['cha'], legacyModifier: 0 },
  intimidation: { label: 'Intimidation', baseDc: 13, primaryStats: ['cha', 'str'], legacyModifier: 0 },
  medicine: { label: 'Medicine', baseDc: 12, primaryStats: ['wis', 'int'], legacyModifier: 0 },
  history: { label: 'History', baseDc: 12, primaryStats: ['int'], legacyModifier: 0 },
  religion: { label: 'Religion', baseDc: 13, primaryStats: ['int', 'wis'], legacyModifier: 0 },
}

const MAX_DAMAGE_STAT_BONUS = 3
const MAX_HEALING_STAT_BONUS = 3

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function clampInteger(value: unknown, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return min
  return Math.min(max, Math.max(min, Math.round(numeric)))
}

function finiteNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function clampString(value: unknown, fallback: string, maxLength: number): string {
  const text = typeof value === 'string' ? value.trim() : ''
  return (text || fallback).slice(0, maxLength)
}

function normalizeStringArray(value: unknown, maxCount: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxCount)
    .map((item) => item.slice(0, maxLength))
}

function isGameplayActionType(value: unknown): value is GameplayActionType {
  return typeof value === 'string' && (GAMEPLAY_ACTION_TYPES as readonly string[]).includes(value)
}

function isGameplayCheckType(value: unknown): value is GameplayCheckType {
  return typeof value === 'string' && (GAMEPLAY_CHECK_TYPES as readonly string[]).includes(value)
}

function slugifyContextualCheckId(value: unknown, fallback: string): string {
  const source = typeof value === 'string' && value.trim() ? value : fallback
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return slug || fallback.slice(0, 64)
}

function uniqueContextualCheckId(baseId: string, used: Set<string>): string {
  let id = baseId.slice(0, 64)
  let suffix = 2
  while (used.has(id)) {
    const suffixText = `-${suffix}`
    id = `${baseId.slice(0, 64 - suffixText.length)}${suffixText}`
    suffix += 1
  }
  used.add(id)
  return id
}

function shouldUseStatAwareMechanics(statsEnabled?: boolean, effectiveStats?: GameplayEffectiveStats | null): effectiveStats is GameplayEffectiveStats {
  return (statsEnabled ?? elizaConfig.locationRooms.gameplay.stats.enabled) === true && Boolean(effectiveStats)
}

function clampGameplayStatModifier(value: number): number {
  return clampInteger(value, -5, 5)
}

export function calculateGameplayStatModifier(statValue: number): number {
  return clampGameplayStatModifier(Math.floor((statValue - 10) / 2))
}

function selectPrimaryStat(
  checkType: GameplayCheckType,
  effectiveStats: GameplayEffectiveStats
): { stat: GameplayCoreStatKey; value: number; modifier: number; primaryStats: GameplayCoreStatKey[] } {
  const primaryStats = GAMEPLAY_FIXED_CHECK_CONFIG[checkType].primaryStats
  const selected = primaryStats.reduce((best, stat) => {
    const value = effectiveStats[stat]
    return value > best.value ? { stat, value } : best
  }, { stat: primaryStats[0], value: effectiveStats[primaryStats[0]] })

  return {
    ...selected,
    primaryStats,
    modifier: calculateGameplayStatModifier(selected.value),
  }
}

function actionModifierSources(
  actionType: GameplayActionType,
  modifierSources: GameplayModifierSource[] | undefined,
  cap = elizaConfig.locationRooms.gameplay.stats.modifiers.maxTotalNonStatModifierPerRoll
): { total: number; sources: GameplayModifierSource[] } {
  const sources = (modifierSources ?? []).filter((source) => source.target === actionType)
  const rawTotal = sources.reduce((sum, source) => sum + source.value, 0)
  const boundedTotal = clampInteger(rawTotal, -Math.max(0, cap), Math.max(0, cap))
  return { total: boundedTotal, sources }
}

function buildLegacyModifierBreakdown(actionType: GameplayActionType, rollChoice: GameplayRollChoice): GameplayRollModifierBreakdown {
  const legacyModifier = GAMEPLAY_FIXED_CHECK_CONFIG[rollChoice.checkType].legacyModifier
  return {
    mode: 'legacy_fixed',
    actionType,
    checkType: rollChoice.checkType,
    checkLabel: rollChoice.label,
    checkSource: rollChoice.source,
    contextualCheckId: rollChoice.contextualCheckId ?? null,
    primaryStats: [],
    primaryStatValue: null,
    statModifier: 0,
    nonStatModifier: 0,
    legacyModifier,
    totalModifier: legacyModifier,
    modifierSources: [],
  }
}

function normalizeDifficulty(
  value: unknown,
  fallback: ElizaLocationRoomGameplayDifficulty = 'normal'
): ElizaLocationRoomGameplayDifficulty {
  return typeof value === 'string' && (GAMEPLAY_DIFFICULTIES as readonly string[]).includes(value)
    ? value as ElizaLocationRoomGameplayDifficulty
    : fallback
}

function normalizeTarget(value: unknown): GameplayActionTarget | null {
  if (!isRecord(value)) return null
  if (value.kind === 'monster' && typeof value.id === 'string' && value.id.trim()) {
    return { kind: 'monster', id: value.id.trim() }
  }
  if (value.kind === 'character' && Number.isInteger(value.tokenId)) {
    return { kind: 'character', tokenId: Number(value.tokenId) }
  }
  return null
}

export function inferGameplayRollChoice(actionType: GameplayActionType): GameplayRollChoice {
  const config = GAMEPLAY_FIXED_CHECK_CONFIG[actionType]
  return {
    source: 'inferred',
    checkType: actionType,
    label: config.label,
  }
}

export function normalizeGameplayContextualChecks(
  value: unknown,
  options: { sceneDc?: number; maxCount?: number } = {}
): GameplayContextualCheckOption[] {
  if (!Array.isArray(value)) return []

  const usedIds = new Set<string>()
  const maxCount = Math.max(0, Math.min(options.maxCount ?? 4, 4))
  const sceneDc = finiteNumber(options.sceneDc)
  const normalized: GameplayContextualCheckOption[] = []

  for (const candidate of value) {
    if (normalized.length >= maxCount) break
    if (!isRecord(candidate) || !isGameplayCheckType(candidate.checkType)) continue

    const config = GAMEPLAY_FIXED_CHECK_CONFIG[candidate.checkType]
    const label = clampString(candidate.label, config.label, 80)
    const baseId = slugifyContextualCheckId(candidate.id, `${candidate.checkType}-${normalized.length + 1}`)
    const id = uniqueContextualCheckId(baseId, usedIds)
    const description = typeof candidate.description === 'string'
      ? clampString(candidate.description, '', 160) || null
      : null
    const dcSource = finiteNumber(candidate.dc) ?? sceneDc ?? config.baseDc

    normalized.push({
      id,
      label,
      description,
      checkType: candidate.checkType,
      dc: clampInteger(dcSource, 8, 20),
    })
  }

  return normalized
}

export function parseGameplayContextualChecks(value: unknown): GameplayContextualCheckOption[] {
  return normalizeGameplayContextualChecks(value)
}

function normalizeGameplayRollChoice(
  value: unknown,
  actionType: GameplayActionType,
  context: GameplayActionValidationContext
): GameplayRollChoice | { error: string } {
  if (value == null) return inferGameplayRollChoice(actionType)
  if (!isRecord(value)) return { error: 'Gameplay roll choice is malformed' }

  const source = value.source === 'contextual' ? 'contextual' : value.source === 'inferred' ? 'inferred' : 'fixed'

  if (source === 'contextual') {
    const requestedId = typeof value.contextualCheckId === 'string' ? value.contextualCheckId.trim() : ''
    if (!requestedId) return { error: 'Contextual gameplay roll choices require contextualCheckId' }

    const option = (context.contextualChecks ?? []).find((candidate) => candidate.id === requestedId)
    if (!option) return { error: 'Contextual gameplay roll choice is not available for this encounter' }

    return {
      source: 'contextual',
      checkType: option.checkType,
      contextualCheckId: option.id,
      label: option.label,
    }
  }

  if (!isGameplayCheckType(value.checkType)) {
    return { error: 'Unsupported gameplay roll check type' }
  }

  return {
    source,
    checkType: value.checkType,
    label: GAMEPLAY_FIXED_CHECK_CONFIG[value.checkType].label,
  }
}

function isLegalTarget(target: GameplayActionTarget, context: GameplayActionValidationContext): boolean {
  if (target.kind === 'monster') {
    return (context.legalMonsterIds ?? []).includes(target.id)
  }

  return (context.legalCharacterTokenIds ?? []).includes(target.tokenId)
}

export function validateGameplayActionEnvelope(
  input: unknown,
  context: GameplayActionValidationContext = {}
): GameplayActionValidationResult {
  if (!isRecord(input)) {
    return { ok: false, error: 'Gameplay action must be a JSON object' }
  }

  if (!isGameplayActionType(input.actionType)) {
    return { ok: false, error: 'Unsupported gameplay action type' }
  }

  const publicSpeechMaxLength = context.publicSpeechMaxLength ?? DEFAULT_PUBLIC_SPEECH_MAX_LENGTH
  const intentSummaryMaxLength = context.intentSummaryMaxLength ?? DEFAULT_INTENT_SUMMARY_MAX_LENGTH
  const publicSpeech = typeof input.publicSpeech === 'string' ? input.publicSpeech.trim() : ''

  if (!publicSpeech) {
    return { ok: false, error: 'Gameplay action requires public speech' }
  }

  if (publicSpeech.length > publicSpeechMaxLength) {
    return { ok: false, error: 'Gameplay action public speech is too long' }
  }

  const target = normalizeTarget(input.target)
  if (input.target != null && !target) {
    return { ok: false, error: 'Gameplay action target is malformed' }
  }

  if (target && !isLegalTarget(target, context)) {
    return { ok: false, error: 'Gameplay action target is not legal for this turn' }
  }

  if (input.actionType === 'attack' && target?.kind !== 'monster') {
    return { ok: false, error: 'Attack actions require a legal monster target' }
  }

  if (input.actionType === 'help' && target?.kind !== 'character') {
    return { ok: false, error: 'Help actions require a legal character target' }
  }

  const rollChoice = normalizeGameplayRollChoice(input.rollChoice, input.actionType, context)
  if ('error' in rollChoice) {
    return { ok: false, error: rollChoice.error }
  }

  const intentSummary = typeof input.intentSummary === 'string'
    ? input.intentSummary.trim().slice(0, intentSummaryMaxLength)
    : null

  return {
    ok: true,
    action: {
      actionType: input.actionType,
      target,
      rollChoice,
      publicSpeech,
      intentSummary,
      metadata: isRecord(input.metadata) ? input.metadata : {},
    },
  }
}

export function deriveActionRollPlan(
  action: Pick<GameplayActionEnvelope, 'actionType' | 'target' | 'rollChoice'>,
  difficulty: ElizaLocationRoomGameplayDifficulty = 'normal',
  options: {
    effectiveStats?: GameplayEffectiveStats | null
    modifierSources?: GameplayModifierSource[]
    statsEnabled?: boolean
    contextualChecks?: GameplayContextualCheckOption[]
  } = {}
): GameplayRollPlan {
  const normalizedDifficulty = normalizeDifficulty(difficulty)
  const multiplier = DIFFICULTY_MULTIPLIERS[normalizedDifficulty]
  const contextualChecks = options.contextualChecks ?? []
  const requestedChoice = action.rollChoice ?? inferGameplayRollChoice(action.actionType)
  const contextualOption = requestedChoice.source === 'contextual' && requestedChoice.contextualCheckId
    ? contextualChecks.find((option) => option.id === requestedChoice.contextualCheckId)
    : null

  if (requestedChoice.source === 'contextual' && !contextualOption) {
    throw new Error('Contextual gameplay roll choice is not available for this encounter')
  }

  const rollChoice: GameplayRollChoice = contextualOption
    ? {
        source: 'contextual',
        checkType: contextualOption.checkType,
        contextualCheckId: contextualOption.id,
        label: contextualOption.label,
      }
    : {
        source: requestedChoice.source,
        checkType: requestedChoice.checkType,
        label: GAMEPLAY_FIXED_CHECK_CONFIG[requestedChoice.checkType].label,
      }
  const baseDc = contextualOption?.dc ?? GAMEPLAY_FIXED_CHECK_CONFIG[rollChoice.checkType].baseDc
  const dc = contextualOption
    ? clampInteger(baseDc, 8, 20)
    : clampInteger(Math.round(baseDc + (multiplier - 1) * 4), 8, 20)
  const targetKind = action.target?.kind ?? (action.actionType === 'rest' ? 'none' : 'scene')
  const effectiveStats = options.effectiveStats
  const useStats = shouldUseStatAwareMechanics(options.statsEnabled, effectiveStats)

  if (!useStats) {
    const modifierBreakdown = buildLegacyModifierBreakdown(action.actionType, rollChoice)
    return {
      formula: 'd20',
      dc,
      modifier: modifierBreakdown.totalModifier,
      targetKind,
      checkType: rollChoice.checkType,
      checkLabel: rollChoice.label,
      checkSource: rollChoice.source,
      contextualCheckId: rollChoice.contextualCheckId ?? null,
      modifierBreakdown,
    }
  }

  const primary = selectPrimaryStat(rollChoice.checkType, effectiveStats)
  const nonStat = isGameplayActionType(rollChoice.checkType)
    ? actionModifierSources(rollChoice.checkType, options.modifierSources)
    : { total: 0, sources: [] }
  const totalModifier = clampInteger(primary.modifier + nonStat.total, -10, 10)
  const modifierBreakdown: GameplayRollModifierBreakdown = {
    mode: 'stat_aware',
    actionType: action.actionType,
    checkType: rollChoice.checkType,
    checkLabel: rollChoice.label,
    checkSource: rollChoice.source,
    contextualCheckId: rollChoice.contextualCheckId ?? null,
    primaryStats: primary.primaryStats,
    primaryStatValue: primary.value,
    statModifier: primary.modifier,
    nonStatModifier: nonStat.total,
    legacyModifier: GAMEPLAY_FIXED_CHECK_CONFIG[rollChoice.checkType].legacyModifier,
    totalModifier,
    modifierSources: nonStat.sources,
  }

  return {
    formula: 'd20',
    dc,
    modifier: totalModifier,
    targetKind,
    checkType: rollChoice.checkType,
    checkLabel: rollChoice.label,
    checkSource: rollChoice.source,
    contextualCheckId: rollChoice.contextualCheckId ?? null,
    modifierBreakdown,
  }
}

export function determineSuccessTier(naturalRoll: number, total: number, dc: number): GameplaySuccessTier {
  if (naturalRoll <= 1) return 'critical_failure'
  if (naturalRoll >= 20) return 'critical_success'
  if (total >= dc + 5) return 'critical_success'
  if (total >= dc) return 'success'
  if (total >= dc - 5) return 'partial_success'
  return 'failure'
}

export function resolveActionRoll(
  action: Pick<GameplayActionEnvelope, 'actionType' | 'target' | 'rollChoice'>,
  options: {
    difficulty?: ElizaLocationRoomGameplayDifficulty
    rng?: GameplayRandomSource
    effectiveStats?: GameplayEffectiveStats | null
    modifierSources?: GameplayModifierSource[]
    statsEnabled?: boolean
    contextualChecks?: GameplayContextualCheckOption[]
  } = {}
): GameplayRollResolution {
  const plan = deriveActionRollPlan(action, options.difficulty ?? 'normal', {
    effectiveStats: options.effectiveStats,
    modifierSources: options.modifierSources,
    statsEnabled: options.statsEnabled,
    contextualChecks: options.contextualChecks,
  })
  const roll = rollDiceFormula(plan.formula, options.rng)
  const total = roll.total + plan.modifier

  return {
    ...plan,
    roll,
    total,
    tier: determineSuccessTier(roll.total, total, plan.dc),
  }
}

function positiveStatContribution(
  stat: GameplayCoreStatKey,
  statValue: number,
  cap: number
): GameplayStatContribution | null {
  const modifier = calculateGameplayStatModifier(statValue)
  const applied = clampInteger(Math.max(0, modifier), 0, cap)
  if (applied <= 0) return null

  return {
    source: 'stat',
    stat,
    statValue,
    modifier,
    applied,
    capped: applied !== Math.max(0, modifier),
  }
}

function actionStatContribution(
  actionType: GameplayActionType,
  effectiveStats: GameplayEffectiveStats | null | undefined,
  cap: number,
  statsEnabled?: boolean
): GameplayStatContribution | null {
  if (!shouldUseStatAwareMechanics(statsEnabled, effectiveStats)) return null
  const selected = selectPrimaryStat(actionType, effectiveStats)
  return positiveStatContribution(selected.stat, selected.value, cap)
}

export function calculateActionDamage(
  action: Pick<GameplayActionEnvelope, 'actionType'>,
  tier: GameplaySuccessTier,
  rng: GameplayRandomSource = Math.random,
  options: { effectiveStats?: GameplayEffectiveStats | null; statsEnabled?: boolean } = {}
): { amount: number; roll: GameplayDiceRollResult | null; statContribution?: GameplayStatContribution | null } {
  if (action.actionType !== 'attack') {
    return { amount: 0, roll: null, statContribution: null }
  }

  if (tier === 'failure' || tier === 'critical_failure') {
    return { amount: 0, roll: null, statContribution: null }
  }

  const formula: SupportedDiceFormula = tier === 'critical_success' ? '2d6' : '1d6'
  const roll = rollDiceFormula(formula, rng)
  const multiplier = tier === 'partial_success' ? 0.5 : 1
  const statContribution = actionStatContribution(action.actionType, options.effectiveStats, MAX_DAMAGE_STAT_BONUS, options.statsEnabled)

  return {
    amount: Math.max(1, Math.floor(roll.total * multiplier) + (statContribution?.applied ?? 0)),
    roll,
    statContribution,
  }
}

export function applyCharacterHpDelta(
  character: GameplayCharacterState,
  hpDelta: number
): { character: GameplayCharacterState; died: boolean; revived: boolean } {
  const previousStatus = character.status
  const previousHp = character.hp
  const nextHp = clampInteger(previousHp + hpDelta, 0, Math.max(1, character.maxHp))
  const nextStatus = nextHp <= 0 ? 'dead' : previousStatus === 'dead' ? 'alive' : previousStatus

  return {
    character: {
      ...character,
      hp: nextHp,
      status: nextStatus,
    },
    died: previousStatus !== 'dead' && nextStatus === 'dead',
    revived: previousStatus === 'dead' && nextStatus !== 'dead',
  }
}

export function calculateEncounterBudget(options: {
  partySize: number
  averageLevel?: number
  difficulty?: ElizaLocationRoomGameplayDifficulty
}): number {
  const partySize = clampInteger(options.partySize, 1, 20)
  const level = clampInteger(options.averageLevel ?? 1, 1, 5)
  const difficulty = normalizeDifficulty(options.difficulty)
  return Math.round(partySize * BASE_BUDGET_BY_LEVEL[level] * DIFFICULTY_MULTIPLIERS[difficulty])
}

export function normalizeRewardPlan(
  proposal: GameplayEncounterProposal = {},
  options: NormalizeEncounterOptions
): GameplayRewardPlan {
  const partySize = clampInteger(options.partySize, 1, 20)
  const budget = calculateEncounterBudget(options)
  const maxXp = options.maxXpPerCharacter ?? DEFAULT_MAX_XP_PER_CHARACTER
  const derivedXp = Math.max(0, Math.round(budget / partySize))

  return {
    xpPerCharacter: clampInteger(proposal.rewardXpPerCharacter ?? derivedXp, 0, maxXp),
    temporaryBoons: normalizeStringArray(
      proposal.temporaryBoons,
      options.maxTemporaryBoons ?? DEFAULT_MAX_TEMPORARY_BOONS,
      80
    ),
    narrativeRewards: normalizeStringArray(
      proposal.narrativeRewards,
      options.maxNarrativeRewards ?? DEFAULT_MAX_NARRATIVE_REWARDS,
      120
    ),
    victoryText: typeof proposal.victoryText === 'string'
      ? clampString(proposal.victoryText, '', 240) || null
      : null,
    metadata: {},
  }
}

export function parseGameplayMonsters(value: unknown): GameplayMonsterState[] {
  if (!Array.isArray(value)) return []

  return value.filter((monster): monster is GameplayMonsterState => {
    if (!isRecord(monster)) return false
    return typeof monster.id === 'string' &&
      typeof monster.name === 'string' &&
      typeof monster.archetype === 'string' &&
      Number.isFinite(Number(monster.hp)) &&
      Number.isFinite(Number(monster.maxHp)) &&
      Number.isFinite(Number(monster.ac)) &&
      Number.isFinite(Number(monster.attackBonus)) &&
      typeof monster.damageFormula === 'string' &&
      (monster.status === 'alive' || monster.status === 'dead')
  }).map((monster) => ({
    ...monster,
    hp: clampInteger(monster.hp, 0, Math.max(1, Number(monster.maxHp))),
    maxHp: clampInteger(monster.maxHp, 1, 999),
    ac: clampInteger(monster.ac, 1, 30),
    attackBonus: clampInteger(monster.attackBonus, -10, 20),
    damageFormula: monster.damageFormula === '1d4' || monster.damageFormula === '1d6' ||
      monster.damageFormula === '1d8' || monster.damageFormula === '2d6'
      ? monster.damageFormula
      : '1d6',
    metadata: isRecord(monster.metadata) ? monster.metadata : {},
  }))
}

export function parseGameplayRewardPlan(value: unknown): GameplayRewardPlan {
  if (!isRecord(value)) {
    return normalizeRewardPlan({}, { partySize: 1 })
  }

  return {
    xpPerCharacter: clampInteger(value.xpPerCharacter, 0, DEFAULT_MAX_XP_PER_CHARACTER),
    temporaryBoons: normalizeStringArray(value.temporaryBoons, DEFAULT_MAX_TEMPORARY_BOONS, 80),
    narrativeRewards: normalizeStringArray(value.narrativeRewards, DEFAULT_MAX_NARRATIVE_REWARDS, 120),
    victoryText: typeof value.victoryText === 'string'
      ? clampString(value.victoryText, '', 240) || null
      : null,
    metadata: isRecord(value.metadata) ? value.metadata : {},
  }
}

export function normalizeEncounterProposal(
  proposal: GameplayEncounterProposal = {},
  options: NormalizeEncounterOptions
): NormalizedGameplayEncounter {
  const difficulty = normalizeDifficulty(proposal.difficulty, normalizeDifficulty(options.difficulty))
  const partySize = clampInteger(options.partySize, 1, 20)
  const budget = calculateEncounterBudget({
    partySize,
    averageLevel: options.averageLevel ?? 1,
    difficulty,
  })
  const maxMonsterCount = Math.max(1, Math.min(options.maxMonsterCount ?? DEFAULT_MAX_MONSTER_COUNT, partySize * 2))
  const monsterCount = clampInteger(proposal.monsterCount ?? Math.max(1, Math.ceil(partySize / 2)), 1, maxMonsterCount)
  const maxTotalHp = Math.min(options.maxTotalMonsterHp ?? DEFAULT_MAX_TOTAL_MONSTER_HP, Math.max(8, budget * 3))
  const totalHp = clampInteger(proposal.totalMonsterHp ?? budget, monsterCount, maxTotalHp)
  const baseHp = Math.max(1, Math.floor(totalHp / monsterCount))
  const remainder = totalHp - baseHp * monsterCount
  const monsterAc = clampInteger(proposal.monsterAc ?? 12 + DIFFICULTY_MULTIPLIERS[difficulty], 8, 18)
  const attackBonus = clampInteger(proposal.monsterAttackBonus ?? DIFFICULTY_MULTIPLIERS[difficulty] + 1, -1, 8)
  const damageFormula = proposal.monsterDamageFormula === '1d4' ||
    proposal.monsterDamageFormula === '1d6' ||
    proposal.monsterDamageFormula === '1d8' ||
    proposal.monsterDamageFormula === '2d6'
    ? proposal.monsterDamageFormula
    : '1d6'

  const monsterName = clampString(proposal.monsterName, 'WAGDIE horror', 80)
  const monsterArchetype = clampString(proposal.monsterArchetype, 'lurking threat', 80)
  const sceneDc = clampInteger(proposal.sceneDc ?? 12, 8, 20)
  const monsters: GameplayMonsterState[] = Array.from({ length: monsterCount }, (_, index) => {
    const hp = baseHp + (index < remainder ? 1 : 0)
    return {
      id: `monster-${index + 1}`,
      name: monsterCount === 1 ? monsterName : `${monsterName} ${index + 1}`,
      archetype: monsterArchetype,
      hp,
      maxHp: hp,
      ac: monsterAc,
      attackBonus,
      damageFormula,
      status: 'alive',
    }
  })

  return {
    difficulty,
    publicTitle: clampString(proposal.title, 'A dreadful encounter', 120),
    publicSummary: clampString(proposal.summary, 'A threat gathers in the room.', 500),
    monsters,
    rewardPlan: normalizeRewardPlan(proposal, options),
    mechanics: {
      budget,
      sceneDc,
      contextualChecks: normalizeGameplayContextualChecks(proposal.contextualChecks, { sceneDc }),
      normalizedFromProposal: true,
    },
  }
}

function cloneCharacterMap(characters: GameplayCharacterStateMap): GameplayCharacterStateMap {
  return Object.fromEntries(Object.entries(characters).map(([tokenId, character]) => [
    tokenId,
    {
      ...character,
      temporaryBoons: [...character.temporaryBoons],
      wounds: [...character.wounds],
      performance: character.performance ? { ...character.performance } : undefined,
      sourceStats: character.sourceStats ? { ...character.sourceStats } : undefined,
      effectiveStats: character.effectiveStats ? { ...character.effectiveStats } : undefined,
      equipmentSnapshot: character.equipmentSnapshot ? { ...character.equipmentSnapshot } : character.equipmentSnapshot,
      metadataTraits: character.metadataTraits ? [...character.metadataTraits] : undefined,
      modifierSources: character.modifierSources ? [...character.modifierSources] : undefined,
    },
  ]))
}

function determineEncounterStatus(
  characters: GameplayCharacterStateMap,
  monsters: GameplayMonsterState[],
  roundNumberAfter: number,
  maxEncounterRounds: number
): GameplayEncounterStatus {
  if (monsters.length > 0 && monsters.every((monster) => monster.status === 'dead' || monster.hp <= 0)) {
    return 'victory'
  }

  const currentCharacters = Object.values(characters)
  const playable = currentCharacters.filter((character) => character.status !== 'dead' && character.hp > 0)
  if (currentCharacters.length > 0 && playable.length === 0) {
    return 'defeat'
  }

  if (playable.length > 0 && playable.every((character) => character.status === 'fled')) {
    return 'fled'
  }

  if (roundNumberAfter > maxEncounterRounds) {
    return 'abandoned'
  }

  return 'active'
}

export function resolveGameplayTurnMechanics(
  input: ResolveGameplayTurnMechanicsInput
): ResolveGameplayTurnMechanicsResult {
  const rng = input.rng ?? Math.random
  const charactersBefore = cloneCharacterMap(input.characters)
  const charactersAfter = cloneCharacterMap(input.characters)
  const actor = charactersAfter[String(input.actorTokenId)]
  if (!actor || actor.status === 'dead' || actor.status === 'fled' || actor.hp <= 0) {
    throw new Error('Gameplay actor is not alive for this turn')
  }

  const monstersBefore = parseGameplayMonsters(input.encounter.monsterState)
  const monstersAfter = monstersBefore.map((monster) => ({
    ...monster,
    metadata: { ...(monster.metadata ?? {}) },
  }))
  if (monstersAfter.length === 0) {
    throw new Error('Active gameplay encounter has no valid monsters')
  }

  const statsEnabled = input.statsEnabled ?? elizaConfig.locationRooms.gameplay.stats.enabled
  const actorEffectiveStats = actor.effectiveStats ?? null
  const actorModifierSources = actor.modifierSources ?? []
  const diceResults: GameplayDiceRollResult[] = []
  const actionRoll = resolveActionRoll(input.action, {
    difficulty: input.encounter.difficulty,
    effectiveStats: actorEffectiveStats,
    modifierSources: actorModifierSources,
    statsEnabled,
    contextualChecks: parseGameplayContextualChecks((input.encounter.mechanics as Record<string, unknown> | undefined)?.contextualChecks),
    rng,
  })
  diceResults.push(actionRoll.roll)

  let actionDamage: GameplayTurnMechanicalDeltas['actionDamage'] = null
  let healing: GameplayTurnMechanicalDeltas['healing'] = null
  let monsterRetaliation: GameplayTurnMechanicalDeltas['monsterRetaliation'] = null

  if (input.action.actionType === 'attack' && input.action.target?.kind === 'monster') {
    const targetId = input.action.target.id
    const target = monstersAfter.find((monster) => monster.id === targetId)
    if (!target || target.status === 'dead') {
      throw new Error('Gameplay attack target is not active')
    }

    const damage = calculateActionDamage(input.action, actionRoll.tier, rng, {
      effectiveStats: actorEffectiveStats,
      statsEnabled,
    })
    if (damage.roll) diceResults.push(damage.roll)
    if (damage.amount > 0) {
      target.hp = Math.max(0, target.hp - damage.amount)
      if (target.hp <= 0) target.status = 'dead'
      actionDamage = { monsterId: target.id, amount: damage.amount, statContribution: damage.statContribution ?? null }
    }
  }

  if (input.action.actionType === 'rest' && ['success', 'critical_success'].includes(actionRoll.tier)) {
    const healRoll = rollDiceFormula('1d4', rng)
    diceResults.push(healRoll)
    const statContribution = actionStatContribution('rest', actorEffectiveStats, MAX_HEALING_STAT_BONUS, statsEnabled)
    const amount = (actionRoll.tier === 'critical_success' ? healRoll.total + 1 : healRoll.total) +
      (statContribution?.applied ?? 0)
    const beforeHp = actor.hp
    const healed = applyCharacterHpDelta(actor, amount)
    charactersAfter[String(input.actorTokenId)] = healed.character
    healing = { tokenId: input.actorTokenId, amount: healed.character.hp - beforeHp, statContribution }
  }

  if (input.action.actionType === 'flee' && ['success', 'critical_success'].includes(actionRoll.tier)) {
    charactersAfter[String(input.actorTokenId)] = {
      ...charactersAfter[String(input.actorTokenId)],
      status: 'fled',
    }
  }

  if (actionRoll.tier === 'failure' || actionRoll.tier === 'critical_failure') {
    const monster = monstersAfter.find((candidate) => candidate.status === 'alive' && candidate.hp > 0)
    if (monster) {
      if (shouldUseStatAwareMechanics(statsEnabled, actorEffectiveStats)) {
        const targetAc = clampInteger(actorEffectiveStats.ac, 1, 30)
        const retaliationAttackRoll = rollDiceFormula('d20', rng)
        const retaliationTotal = retaliationAttackRoll.total + monster.attackBonus
        const attackRoll: GameplayRollResolution = {
          formula: 'd20',
          dc: targetAc,
          modifier: monster.attackBonus,
          targetKind: 'character',
          checkType: 'attack',
          checkLabel: 'Monster Attack',
          checkSource: 'inferred',
          contextualCheckId: null,
          roll: retaliationAttackRoll,
          total: retaliationTotal,
          tier: determineSuccessTier(retaliationAttackRoll.total, retaliationTotal, targetAc),
        }
        diceResults.push(retaliationAttackRoll)
        const hit = retaliationAttackRoll.total >= 20 || (retaliationAttackRoll.total > 1 && retaliationTotal >= targetAc)
        let damageRoll: GameplayDiceRollResult | null = null
        let amount = 0

        if (hit) {
          damageRoll = rollDiceFormula(monster.damageFormula, rng)
          diceResults.push(damageRoll)
          amount = actionRoll.tier === 'critical_failure'
            ? damageRoll.total + Math.max(0, monster.attackBonus)
            : Math.max(1, Math.floor(damageRoll.total / 2))
          const damaged = applyCharacterHpDelta(charactersAfter[String(input.actorTokenId)], -amount)
          charactersAfter[String(input.actorTokenId)] = damaged.character
        }

        monsterRetaliation = {
          monsterId: monster.id,
          tokenId: input.actorTokenId,
          amount,
          attackRoll,
          damageRoll,
          targetAc,
          hit,
        }
      } else {
        const retaliationRoll = rollDiceFormula(monster.damageFormula, rng)
        diceResults.push(retaliationRoll)
        const amount = actionRoll.tier === 'critical_failure'
          ? retaliationRoll.total + Math.max(0, monster.attackBonus)
          : Math.max(1, Math.floor(retaliationRoll.total / 2))
        const damaged = applyCharacterHpDelta(charactersAfter[String(input.actorTokenId)], -amount)
        charactersAfter[String(input.actorTokenId)] = damaged.character
        monsterRetaliation = {
          monsterId: monster.id,
          tokenId: input.actorTokenId,
          amount,
          damageRoll: retaliationRoll,
          hit: true,
        }
      }
    }
  }

  const deaths = Object.values(charactersAfter)
    .filter((character) => {
      const before = charactersBefore[String(character.tokenId)]
      return character.status === 'dead' && before?.status !== 'dead'
    })
    .map((character) => character.tokenId)

  const roundNumberBefore = input.encounter.roundNumber
  const roundNumberAfter = roundNumberBefore + 1
  let encounterStatusAfter = determineEncounterStatus(
    charactersAfter,
    monstersAfter,
    roundNumberAfter,
    input.maxEncounterRounds ?? 12
  )

  const rewardPlan = parseGameplayRewardPlan(input.encounter.rewardPlan)
  const rewardsAlreadyApplied = input.encounter.metadata.rewardApplied === true
  const rewardAssignments: GameplayTurnMechanicalDeltas['rewardAssignments'] = []
  let rewardsApplied = false

  if (encounterStatusAfter === 'victory' && !rewardsAlreadyApplied) {
    for (const character of Object.values(charactersAfter)) {
      if (character.status === 'dead' || character.status === 'fled' || character.hp <= 0) continue
      const boons = rewardPlan.temporaryBoons.filter((boon) => !character.temporaryBoons.includes(boon))
      charactersAfter[String(character.tokenId)] = {
        ...character,
        xp: character.xp + rewardPlan.xpPerCharacter,
        temporaryBoons: [...character.temporaryBoons, ...boons],
      }
      rewardAssignments.push({
        tokenId: character.tokenId,
        xp: rewardPlan.xpPerCharacter,
        temporaryBoons: boons,
      })
    }
    rewardsApplied = rewardAssignments.length > 0
  }

  if (input.encounter.status !== 'active') {
    encounterStatusAfter = input.encounter.status
  }

  return {
    diceResults,
    mechanicalDeltas: {
      actorTokenId: input.actorTokenId,
      actionType: input.action.actionType,
      actionRoll,
      actionDamage,
      healing,
      monsterRetaliation,
      charactersBefore,
      charactersAfter,
      monstersBefore,
      monstersAfter,
      deaths,
      rewardAssignments,
      rewardsApplied,
      encounterStatusBefore: input.encounter.status,
      encounterStatusAfter,
      roundNumberBefore,
      roundNumberAfter,
    },
  }
}
