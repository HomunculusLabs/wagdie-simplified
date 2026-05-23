import {
  defaultGameplayPerformanceCounters,
  type GameplayCharacterState,
  type GameplayCharacterStateMap,
  type GameplayPerformanceCounterDelta,
  type GameplayPerformanceCounters,
  type GameplayPerformanceCounterUpdate,
} from './types'
import type { GameplayTurnMechanicalDeltas, GameplaySuccessTier } from './rules'

const NONCOMBAT_ACTIONS = new Set(['investigate', 'negotiate', 'rest'])
const OBJECTIVE_ACTIONS = new Set(['help', 'investigate', 'negotiate'])

function cloneCounters(counters: GameplayPerformanceCounters | undefined): GameplayPerformanceCounters {
  return {
    ...defaultGameplayPerformanceCounters(),
    ...(counters ?? {}),
  }
}

function add(delta: GameplayPerformanceCounterDelta, key: keyof GameplayPerformanceCounters, value: number): void {
  if (value === 0) return
  delta[key] = (delta[key] ?? 0) + value
}

function isSuccessfulTier(tier: GameplaySuccessTier): boolean {
  return tier === 'partial_success' || tier === 'success' || tier === 'critical_success'
}

function isStrongSuccessTier(tier: GameplaySuccessTier): boolean {
  return tier === 'success' || tier === 'critical_success'
}

function applyDelta(
  character: GameplayCharacterState,
  delta: GameplayPerformanceCounterDelta
): { character: GameplayCharacterState; update: GameplayPerformanceCounterUpdate | null } {
  const before = cloneCounters(character.performance)
  const after = { ...before }
  let changed = false

  for (const [key, value] of Object.entries(delta) as Array<[keyof GameplayPerformanceCounters, number | undefined]>) {
    if (!value) continue
    after[key] = Math.max(0, Math.round(after[key] + value))
    changed = true
  }

  if (!changed) {
    return { character: { ...character, performance: before }, update: null }
  }

  return {
    character: { ...character, performance: after },
    update: {
      tokenId: character.tokenId,
      before,
      delta,
      after,
    },
  }
}

export function updateGameplayPerformanceCountersFromTurn(
  deltas: GameplayTurnMechanicalDeltas
): { characters: GameplayCharacterStateMap; performanceUpdates: GameplayPerformanceCounterUpdate[] } {
  const deltaByTokenId = new Map<number, GameplayPerformanceCounterDelta>()
  const ensureDelta = (tokenId: number): GameplayPerformanceCounterDelta => {
    const existing = deltaByTokenId.get(tokenId)
    if (existing) return existing
    const created: GameplayPerformanceCounterDelta = {}
    deltaByTokenId.set(tokenId, created)
    return created
  }

  const actorDelta = ensureDelta(deltas.actorTokenId)
  add(actorDelta, 'roundsActed', 1)

  for (const character of Object.values(deltas.charactersAfter)) {
    if (character.status !== 'dead' && character.status !== 'fled' && character.hp > 0) {
      add(ensureDelta(character.tokenId), 'roundsSurvived', 1)
    }
  }

  if (deltas.actionDamage && deltas.actionDamage.amount > 0) {
    add(actorDelta, 'damageDealt', deltas.actionDamage.amount)
  }

  if (deltas.monsterRetaliation && deltas.monsterRetaliation.amount > 0) {
    add(ensureDelta(deltas.monsterRetaliation.tokenId), 'damageTaken', deltas.monsterRetaliation.amount)
  }

  const tier = deltas.actionRoll.tier
  if (tier === 'critical_success') {
    add(actorDelta, 'criticalSuccesses', 1)
  } else if (tier === 'critical_failure') {
    add(actorDelta, 'criticalFailures', 1)
  }

  if (deltas.actionType === 'attack' && isSuccessfulTier(tier) && (deltas.actionDamage?.amount ?? 0) > 0) {
    add(actorDelta, 'successfulAttacks', 1)
  }

  if (deltas.actionType === 'defend' && isStrongSuccessTier(tier)) {
    add(actorDelta, 'successfulDefends', 1)
  }

  if (deltas.actionType === 'help' && isStrongSuccessTier(tier)) {
    add(actorDelta, 'successfulHelps', 1)
  }

  if (NONCOMBAT_ACTIONS.has(deltas.actionType) && isStrongSuccessTier(tier)) {
    add(actorDelta, 'successfulNoncombatActions', 1)
  }

  if (OBJECTIVE_ACTIONS.has(deltas.actionType) && isStrongSuccessTier(tier)) {
    add(actorDelta, 'objectiveContributions', 1)
  }

  const actorBefore = deltas.charactersBefore[String(deltas.actorTokenId)]
  const actorAfter = deltas.charactersAfter[String(deltas.actorTokenId)]
  if (deltas.actionType === 'flee' && actorBefore?.status !== 'fled' && actorAfter?.status === 'fled') {
    add(actorDelta, 'fledCount', 1)
  }

  if (deltas.encounterStatusAfter === 'victory' && deltas.encounterStatusBefore !== 'victory') {
    for (const character of Object.values(deltas.charactersAfter)) {
      if (character.status !== 'dead' && character.status !== 'fled' && character.hp > 0) {
        add(ensureDelta(character.tokenId), 'objectiveContributions', 1)
      }
    }
  }

  const characters = { ...deltas.charactersAfter }
  const performanceUpdates: GameplayPerformanceCounterUpdate[] = []

  for (const [tokenId, delta] of deltaByTokenId) {
    const key = String(tokenId)
    const character = characters[key]
    if (!character) continue
    const applied = applyDelta(character, delta)
    characters[key] = applied.character
    if (applied.update) performanceUpdates.push(applied.update)
  }

  return { characters, performanceUpdates }
}
