import type {
  PublicLocationRoomGameplayActionRoll,
  PublicLocationRoomGameplayDeath,
  PublicLocationRoomGameplayRetaliation,
  PublicLocationRoomGameplayRollActor,
  PublicLocationRoomGameplayRollDie,
  PublicLocationRoomGameplayRollEffect,
  PublicLocationRoomGameplayRollTarget,
  PublicLocationRoomGameplayRolls,
} from '../types'
import type { GameplayMechanicalOutcomeSummary } from './gameMasterGameplayGenerator'

type PublicActionOutcome = PublicLocationRoomGameplayActionRoll['outcome']
type PublicEncounterStatus = PublicLocationRoomGameplayRolls['encounterStatusAfter']

const ACTION_OUTCOMES = new Set<PublicActionOutcome>([
  'critical_success',
  'success',
  'partial_success',
  'failure',
  'critical_failure',
  'unknown',
])

const ENCOUNTER_STATUSES = new Set<PublicEncounterStatus>([
  'active',
  'victory',
  'defeat',
  'fled',
  'abandoned',
  'unknown',
])

const CHECK_SOURCES = new Set(['fixed', 'contextual', 'inferred'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function publicString(value: unknown, maxLength = 80): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

function publicNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function publicInteger(value: unknown): number | null {
  const numeric = publicNumber(value)
  return numeric == null ? null : Math.round(numeric)
}

function publicBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function sanitizeOutcome(value: unknown): PublicActionOutcome {
  return ACTION_OUTCOMES.has(value as PublicActionOutcome) ? value as PublicActionOutcome : 'unknown'
}

function sanitizeEncounterStatus(value: unknown): PublicEncounterStatus {
  return ENCOUNTER_STATUSES.has(value as PublicEncounterStatus) ? value as PublicEncounterStatus : 'unknown'
}

function publicCheckSource(value: unknown): string | undefined {
  return CHECK_SOURCES.has(value as string) ? value as string : undefined
}

function publicRollDie(value: unknown): PublicLocationRoomGameplayRollDie | null {
  if (!isRecord(value)) return null
  const formula = publicString(value.formula, 40)
  const total = publicNumber(value.total)
  if (formula == null && total == null) return null

  return { formula, total }
}

function characterTarget(tokenId: unknown, name: unknown = null): PublicLocationRoomGameplayRollTarget | null {
  const normalizedTokenId = publicInteger(tokenId)
  if (normalizedTokenId == null) return null

  return {
    kind: 'character',
    id: String(normalizedTokenId),
    tokenId: normalizedTokenId,
    name: publicString(name),
  }
}

function monsterTarget(id: unknown, name: unknown = null): PublicLocationRoomGameplayRollTarget | null {
  const normalizedId = publicString(id)
  if (!normalizedId) return null

  return {
    kind: 'monster',
    id: normalizedId,
    name: publicString(name),
  }
}

function actorFromToken(tokenId: unknown): PublicLocationRoomGameplayRollActor {
  const normalizedTokenId = publicInteger(tokenId)
  return {
    kind: normalizedTokenId == null ? 'unknown' : 'character',
    id: normalizedTokenId == null ? null : String(normalizedTokenId),
    tokenId: normalizedTokenId,
    name: null,
  }
}

function monsterActor(id: unknown): PublicLocationRoomGameplayRollActor {
  const normalizedId = publicString(id)
  return {
    kind: normalizedId == null ? 'unknown' : 'monster',
    id: normalizedId,
    name: null,
  }
}

function inferActionTarget(deltas: Record<string, unknown>, actionRoll: Record<string, unknown>): PublicLocationRoomGameplayRollTarget | null {
  const damage = isRecord(deltas.actionDamage) ? deltas.actionDamage : null
  if (damage) {
    const target = monsterTarget(damage.monsterId)
    if (target) return target
  }

  const healing = isRecord(deltas.healing) ? deltas.healing : null
  if (healing) {
    const target = characterTarget(healing.tokenId)
    if (target) return target
  }

  const targetKind = publicString(actionRoll.targetKind)
  if (targetKind === 'scene') {
    return { kind: 'environment', id: null, name: null }
  }

  if (targetKind === 'none') return null

  return targetKind ? { kind: 'unknown', id: null, name: null } : null
}

function actionRollFromSummary(summary: GameplayMechanicalOutcomeSummary): PublicLocationRoomGameplayActionRoll | null {
  const deltas = summary.mechanicalDeltas
  const actionRoll = isRecord(deltas.actionRoll) ? deltas.actionRoll : null
  if (!actionRoll) return null

  const actionType = publicString(deltas.actionType, 40) ?? 'unknown'
  const roll = publicRollDie(actionRoll.roll)

  const checkType = publicString(actionRoll.checkType, 40)
  const checkLabel = publicString(actionRoll.checkLabel, 80)
  const checkSource = publicCheckSource(actionRoll.checkSource)
  const contextualCheckId = publicString(actionRoll.contextualCheckId, 64)

  return {
    actionType,
    ...(checkType ? { checkType } : {}),
    ...(checkLabel ? { checkLabel } : {}),
    ...(checkSource ? { checkSource } : {}),
    ...(contextualCheckId ? { contextualCheckId } : {}),
    actor: actorFromToken(deltas.actorTokenId),
    target: inferActionTarget(deltas, actionRoll),
    roll,
    modifier: publicNumber(actionRoll.modifier),
    total: publicNumber(actionRoll.total),
    dc: publicNumber(actionRoll.dc),
    tier: sanitizeOutcome(actionRoll.tier),
    outcome: sanitizeOutcome(actionRoll.tier),
  }
}

function publicEffectsFromDeltas(deltas: Record<string, unknown>): PublicLocationRoomGameplayRollEffect[] {
  const effects: PublicLocationRoomGameplayRollEffect[] = []
  const damage = isRecord(deltas.actionDamage) ? deltas.actionDamage : null
  const damageAmount = damage ? publicNumber(damage.amount) : null

  if (damage && damageAmount != null && damageAmount > 0) {
    const target = monsterTarget(damage.monsterId)
    effects.push({
      kind: 'damage',
      target,
      amount: damageAmount,
      status: null,
      summary: target?.id ? `Damage dealt to ${target.id}: ${damageAmount}` : `Damage dealt: ${damageAmount}`,
    })
  }

  const healing = isRecord(deltas.healing) ? deltas.healing : null
  const healingAmount = healing ? publicNumber(healing.amount) : null

  if (healing && healingAmount != null && healingAmount > 0) {
    const target = characterTarget(healing.tokenId)
    effects.push({
      kind: 'healing',
      target,
      amount: healingAmount,
      status: null,
      summary: target?.tokenId != null ? `Healing restored to #${target.tokenId}: ${healingAmount}` : `Healing restored: ${healingAmount}`,
    })
  }

  return effects
}

function retaliationFromDeltas(deltas: Record<string, unknown>): PublicLocationRoomGameplayRetaliation | null {
  const retaliation = isRecord(deltas.monsterRetaliation) ? deltas.monsterRetaliation : null
  if (!retaliation) return null

  const actor = monsterActor(retaliation.monsterId)
  const target = characterTarget(retaliation.tokenId)
  const hit = publicBoolean(retaliation.hit)
  const amount = publicNumber(retaliation.amount)
  const targetAc = publicNumber(retaliation.targetAc)

  return {
    actor,
    target,
    attackRoll: isRecord(retaliation.attackRoll) ? publicRollDie(retaliation.attackRoll.roll) : null,
    damageRoll: publicRollDie(retaliation.damageRoll),
    targetAc,
    hit,
    amount,
    summary: [
      actor.id ? `Retaliation from ${actor.id}` : 'Retaliation',
      target?.tokenId != null ? `against #${target.tokenId}` : null,
      targetAc != null ? `vs AC ${targetAc}` : null,
      hit == null ? null : hit ? 'hit' : 'miss',
      amount != null && amount > 0 ? `for ${amount} damage` : null,
    ].filter(Boolean).join(' '),
  }
}

function deathsFromSummary(summary: GameplayMechanicalOutcomeSummary): PublicLocationRoomGameplayDeath[] {
  if (!Array.isArray(summary.deaths)) return []

  return summary.deaths
    .map((tokenId) => characterTarget(tokenId))
    .filter((target): target is PublicLocationRoomGameplayRollTarget => Boolean(target))
    .map((target) => ({
      target,
      summary: target.tokenId != null ? `Character #${target.tokenId} died` : 'A character died',
    }))
}

export function projectPublicGameplayRolls(
  summary: GameplayMechanicalOutcomeSummary
): PublicLocationRoomGameplayRolls | null {
  const action = actionRollFromSummary(summary)
  if (!action) return null

  return {
    action,
    publicEffects: publicEffectsFromDeltas(summary.mechanicalDeltas),
    retaliation: retaliationFromDeltas(summary.mechanicalDeltas),
    deaths: deathsFromSummary(summary),
    encounterStatusAfter: sanitizeEncounterStatus(summary.encounterStatusAfter),
  }
}

function sanitizeActor(value: unknown): PublicLocationRoomGameplayRollActor | null {
  if (!isRecord(value)) return null
  const kind = value.kind === 'character' || value.kind === 'monster' || value.kind === 'game_master' || value.kind === 'unknown'
    ? value.kind
    : 'unknown'

  return {
    kind,
    id: publicString(value.id),
    tokenId: value.tokenId == null ? undefined : publicInteger(value.tokenId),
    name: publicString(value.name),
  }
}

function sanitizeTarget(value: unknown): PublicLocationRoomGameplayRollTarget | null {
  if (value == null) return null
  if (!isRecord(value)) return null
  const kind = value.kind === 'character' || value.kind === 'monster' || value.kind === 'environment' || value.kind === 'unknown'
    ? value.kind
    : 'unknown'

  return {
    kind,
    id: publicString(value.id),
    tokenId: value.tokenId == null ? undefined : publicInteger(value.tokenId),
    name: publicString(value.name),
  }
}

function sanitizeAction(value: unknown): PublicLocationRoomGameplayActionRoll | null {
  if (!isRecord(value)) return null
  const actor = sanitizeActor(value.actor)
  if (!actor) return null

  const checkType = publicString(value.checkType, 40)
  const checkLabel = publicString(value.checkLabel, 80)
  const checkSource = publicCheckSource(value.checkSource)
  const contextualCheckId = publicString(value.contextualCheckId, 64)

  return {
    actionType: publicString(value.actionType, 40) ?? 'unknown',
    ...(checkType ? { checkType } : {}),
    ...(checkLabel ? { checkLabel } : {}),
    ...(checkSource ? { checkSource } : {}),
    ...(contextualCheckId ? { contextualCheckId } : {}),
    actor,
    target: sanitizeTarget(value.target),
    roll: publicRollDie(value.roll),
    modifier: publicNumber(value.modifier),
    total: publicNumber(value.total),
    dc: publicNumber(value.dc),
    tier: sanitizeOutcome(value.tier ?? value.outcome),
    outcome: sanitizeOutcome(value.outcome ?? value.tier),
  }
}

function sanitizeEffect(value: unknown): PublicLocationRoomGameplayRollEffect | null {
  if (!isRecord(value)) return null
  const kind = value.kind === 'damage' || value.kind === 'healing' || value.kind === 'status' || value.kind === 'narrative'
    ? value.kind
    : null
  const summary = publicString(value.summary, 200)
  if (!kind || !summary) return null

  return {
    kind,
    target: sanitizeTarget(value.target),
    amount: publicNumber(value.amount),
    status: publicString(value.status, 80),
    summary,
  }
}

function sanitizeRetaliation(value: unknown): PublicLocationRoomGameplayRetaliation | null {
  if (value == null) return null
  if (!isRecord(value)) return null
  const actor = sanitizeActor(value.actor)
  if (!actor) return null
  const summary = publicString(value.summary, 200) ?? 'Retaliation'

  return {
    actor,
    target: sanitizeTarget(value.target),
    attackRoll: publicRollDie(value.attackRoll),
    damageRoll: publicRollDie(value.damageRoll),
    targetAc: publicNumber(value.targetAc),
    hit: publicBoolean(value.hit),
    amount: publicNumber(value.amount),
    summary,
  }
}

function sanitizeDeath(value: unknown): PublicLocationRoomGameplayDeath | null {
  if (!isRecord(value)) return null
  const target = sanitizeTarget(value.target)
  const summary = publicString(value.summary, 200)
  if (!target || !summary) return null

  return { target, summary }
}

export function sanitizePublicGameplayRolls(value: unknown): PublicLocationRoomGameplayRolls | null {
  if (!isRecord(value)) return null

  const action = sanitizeAction(value.action)
  if (!action) return null

  return {
    action,
    publicEffects: Array.isArray(value.publicEffects)
      ? value.publicEffects.map(sanitizeEffect).filter((effect): effect is PublicLocationRoomGameplayRollEffect => Boolean(effect))
      : [],
    retaliation: sanitizeRetaliation(value.retaliation),
    deaths: Array.isArray(value.deaths)
      ? value.deaths.map(sanitizeDeath).filter((death): death is PublicLocationRoomGameplayDeath => Boolean(death))
      : [],
    encounterStatusAfter: sanitizeEncounterStatus(value.encounterStatusAfter),
  }
}

export function isPublicGameplayRolls(value: unknown): value is PublicLocationRoomGameplayRolls {
  return sanitizePublicGameplayRolls(value) != null
}
