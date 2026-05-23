import { elizaConfig, type ElizaLocationRoomGameplayConcordModifierConfig } from '@/lib/eliza/config'
import type { NFTAttribute } from '@/types/character'
import type { GameplayCharacterConcordContext, GameplayCharacterSheet } from './characterSheetResolver'
import type {
  GameplayActionType,
  GameplayEffectiveStatKey,
  GameplayEffectiveStats,
  GameplayModifierSource,
  GameplayModifierSourceKind,
  GameplayModifierTarget,
  GameplaySourceStats,
} from './types'

export type GameplayModifierCaps = {
  maxEquipmentModifierPerRoll: number
  maxNftTraitModifierPerRoll: number
  maxSearedConcordModifierPerRoll: number
  maxTotalNonStatModifierPerRoll: number
  maxEffectiveAcBonus: number
  concordAllowlist: readonly ElizaLocationRoomGameplayConcordModifierConfig[]
}

export type ResolveGameplayModifiersResult = {
  effectiveStats: GameplayEffectiveStats
  modifierSources: GameplayModifierSource[]
}

const CORE_STAT_TARGETS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
const EFFECTIVE_STAT_TARGETS = [...CORE_STAT_TARGETS, 'maxHp', 'ac', 'speed'] as const
const ACTION_TARGETS = ['attack', 'defend', 'help', 'investigate', 'negotiate', 'flee', 'rest'] as const
const RECOGNIZED_NFT_TRAIT_TYPES = new Set(['armor', 'back', 'mask', 'weapon', 'alignment'])

function clampInteger(value: unknown, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(max, Math.max(min, Math.round(numeric)))
}

function clampSourceValue(value: number, maxAbs: number): { value: number; capped: boolean } {
  const max = Math.max(0, Math.round(maxAbs))
  const cappedValue = clampInteger(value, -max, max)
  return { value: cappedValue, capped: cappedValue !== value }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isEffectiveStatTarget(value: unknown): value is GameplayEffectiveStatKey {
  return typeof value === 'string' && (EFFECTIVE_STAT_TARGETS as readonly string[]).includes(value)
}

function isActionTarget(value: unknown): value is GameplayActionType {
  return typeof value === 'string' && (ACTION_TARGETS as readonly string[]).includes(value)
}

function isModifierTarget(value: unknown): value is GameplayModifierTarget {
  return isEffectiveStatTarget(value) || isActionTarget(value)
}

function toEffectiveStats(sourceStats: GameplaySourceStats): GameplayEffectiveStats {
  return {
    str: sourceStats.str,
    dex: sourceStats.dex,
    con: sourceStats.con,
    int: sourceStats.int,
    wis: sourceStats.wis,
    cha: sourceStats.cha,
    maxHp: sourceStats.maxHp,
    ac: sourceStats.ac,
    speed: sourceStats.speed,
    level: sourceStats.level,
    experience: sourceStats.experience,
  }
}

function addSource(
  sources: GameplayModifierSource[],
  source: GameplayModifierSourceKind,
  key: string,
  target: GameplayModifierTarget,
  value: number,
  label: string,
  capped = false
): void {
  if (value === 0) return
  sources.push({ source, key, target, value, label: label.slice(0, 120), capped })
}

function applyStatModifier(
  stats: GameplayEffectiveStats,
  target: GameplayEffectiveStatKey,
  value: number,
  acBonusState: { applied: number },
  caps: GameplayModifierCaps
): { applied: number; capped: boolean } {
  if (target === 'ac') {
    const remaining = Math.max(0, caps.maxEffectiveAcBonus - acBonusState.applied)
    const applied = Math.max(-caps.maxEffectiveAcBonus, Math.min(remaining, value))
    stats.ac = clampInteger(stats.ac + applied, 1, 30)
    acBonusState.applied += Math.max(0, applied)
    return { applied, capped: applied !== value }
  }

  const bounds: Record<GameplayEffectiveStatKey, { min: number; max: number }> = {
    str: { min: 1, max: 30 },
    dex: { min: 1, max: 30 },
    con: { min: 1, max: 30 },
    int: { min: 1, max: 30 },
    wis: { min: 1, max: 30 },
    cha: { min: 1, max: 30 },
    maxHp: { min: 1, max: 999 },
    ac: { min: 1, max: 30 },
    speed: { min: 0, max: 120 },
  }
  const before = stats[target]
  stats[target] = clampInteger(before + value, bounds[target].min, bounds[target].max)
  return { applied: stats[target] - before, capped: stats[target] - before !== value }
}

function addActionModifier(
  sources: GameplayModifierSource[],
  totals: Map<GameplayActionType, number>,
  source: GameplayModifierSourceKind,
  key: string,
  target: GameplayActionType,
  value: number,
  label: string,
  caps: GameplayModifierCaps,
  sourceCap: number
): void {
  const sourceBounded = clampSourceValue(value, sourceCap)
  const current = totals.get(target) ?? 0
  const cap = Math.max(0, Math.round(caps.maxTotalNonStatModifierPerRoll))
  const desiredTotal = Math.max(-cap, Math.min(cap, current + sourceBounded.value))
  const applied = desiredTotal - current
  if (applied === 0) return
  totals.set(target, desiredTotal)
  addSource(sources, source, key, target, applied, label, sourceBounded.capped || applied !== value)
}

function firstTraitValue(traits: NFTAttribute[], traitType: string): string | null {
  const trait = traits.find((candidate) => candidate.trait_type.trim().toLowerCase() === traitType)
  if (!trait) return null
  return String(trait.value).trim() || null
}

function addEquipmentModifiers(
  sheet: GameplayCharacterSheet,
  result: ResolveGameplayModifiersResult,
  actionTotals: Map<GameplayActionType, number>,
  acBonusState: { applied: number },
  caps: GameplayModifierCaps
): void {
  if ((sheet.equipment?.weapons?.length ?? 0) > 0) {
    addActionModifier(
      result.modifierSources,
      actionTotals,
      'equipment',
      'weapon',
      'attack',
      1,
      'Equipped weapon',
      caps,
      caps.maxEquipmentModifierPerRoll
    )
  }

  if ((sheet.equipment?.armor?.length ?? 0) > 0) {
    const bounded = clampSourceValue(1, caps.maxEquipmentModifierPerRoll)
    const applied = applyStatModifier(result.effectiveStats, 'ac', bounded.value, acBonusState, caps)
    addSource(
      result.modifierSources,
      'equipment',
      'armor',
      'ac',
      applied.applied,
      'Equipped armor',
      bounded.capped || applied.capped
    )
  }
}

function addTraitModifiers(
  sheet: GameplayCharacterSheet,
  result: ResolveGameplayModifiersResult,
  actionTotals: Map<GameplayActionType, number>,
  acBonusState: { applied: number },
  caps: GameplayModifierCaps
): void {
  const recognizedTraits = sheet.metadataTraits.filter((trait) =>
    RECOGNIZED_NFT_TRAIT_TYPES.has(trait.trait_type.trim().toLowerCase())
  )
  if (recognizedTraits.length === 0) return

  if (firstTraitValue(recognizedTraits, 'weapon')) {
    addActionModifier(
      result.modifierSources,
      actionTotals,
      'nft_trait',
      'Weapon',
      'attack',
      1,
      'Recognized weapon trait',
      caps,
      caps.maxNftTraitModifierPerRoll
    )
  }

  if (firstTraitValue(recognizedTraits, 'armor')) {
    const bounded = clampSourceValue(1, caps.maxNftTraitModifierPerRoll)
    const applied = applyStatModifier(result.effectiveStats, 'ac', bounded.value, acBonusState, caps)
    addSource(
      result.modifierSources,
      'nft_trait',
      'Armor',
      'ac',
      applied.applied,
      'Recognized armor trait',
      bounded.capped || applied.capped
    )
  }
}

function structuredConcordModifier(concordContext: GameplayCharacterConcordContext): {
  target: GameplayModifierTarget
  value: number
  label: string
} | null {
  const concord = concordContext.concord
  if (!concord || concord.effect_type !== 'stat_boost') return null

  const metadata = isRecord(concord.metadata)
    ? concord.metadata
    : isRecord(concord.effect_metadata)
      ? concord.effect_metadata
      : null
  if (!metadata) return null

  const target = metadata.target ?? metadata.stat ?? metadata.action
  if (!isModifierTarget(target)) return null

  const value = Number(metadata.value ?? metadata.amount ?? metadata.modifier)
  if (!Number.isFinite(value)) return null

  return {
    target,
    value: Math.round(value),
    label: typeof concord.name === 'string' && concord.name.trim()
      ? concord.name.trim()
      : `Seared Concord #${concordContext.concordId}`,
  }
}

function allowlistedConcordModifier(
  concordContext: GameplayCharacterConcordContext,
  caps: GameplayModifierCaps
): {
  target: GameplayModifierTarget
  value: number
  label: string
} | null {
  const configured = caps.concordAllowlist.find((entry) => entry.concordId === concordContext.concordId)
  if (!configured || !isModifierTarget(configured.target)) return null
  return {
    target: configured.target,
    value: configured.value,
    label: configured.label?.trim() || `Configured Concord #${concordContext.concordId}`,
  }
}

function addConcordModifiers(
  sheet: GameplayCharacterSheet,
  result: ResolveGameplayModifiersResult,
  actionTotals: Map<GameplayActionType, number>,
  acBonusState: { applied: number },
  caps: GameplayModifierCaps
): void {
  for (const concordContext of sheet.concords) {
    if (!concordContext.isSeared || concordContext.quantity <= 0) continue

    const structured = structuredConcordModifier(concordContext)
    const allowlisted = allowlistedConcordModifier(concordContext, caps)
    const modifier = structured ?? allowlisted
    if (!modifier) continue

    const key = String(concordContext.concordId)
    const source: GameplayModifierSourceKind = structured ? 'concord_effect' : 'concord_allowlist'
    if (isActionTarget(modifier.target)) {
      addActionModifier(
        result.modifierSources,
        actionTotals,
        source,
        key,
        modifier.target,
        modifier.value,
        modifier.label,
        caps,
        caps.maxSearedConcordModifierPerRoll
      )
      continue
    }

    const bounded = clampSourceValue(modifier.value, caps.maxSearedConcordModifierPerRoll)
    const applied = applyStatModifier(result.effectiveStats, modifier.target, bounded.value, acBonusState, caps)
    addSource(
      result.modifierSources,
      source,
      key,
      modifier.target,
      applied.applied,
      modifier.label,
      bounded.capped || applied.capped
    )
  }
}

export function resolveGameplayModifiers(
  sheet: GameplayCharacterSheet,
  caps: GameplayModifierCaps = elizaConfig.locationRooms.gameplay.stats.modifiers
): ResolveGameplayModifiersResult {
  const result: ResolveGameplayModifiersResult = {
    effectiveStats: toEffectiveStats(sheet.sourceStats),
    modifierSources: [],
  }
  const actionTotals = new Map<GameplayActionType, number>()
  const acBonusState = { applied: 0 }

  addEquipmentModifiers(sheet, result, actionTotals, acBonusState, caps)
  addTraitModifiers(sheet, result, actionTotals, acBonusState, caps)
  addConcordModifiers(sheet, result, actionTotals, acBonusState, caps)

  return result
}
