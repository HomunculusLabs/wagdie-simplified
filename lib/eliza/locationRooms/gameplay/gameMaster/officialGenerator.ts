import { elizaConfig } from '@/lib/eliza/config'
import {
  createOfficialElizaMessagingClient,
  sendAndCollectOfficialEphemeralSessionMessage,
  type OfficialElizaMessagingClient,
} from '@/lib/eliza/official/messaging'
import {
  extractGenerationJsonObject,
  normalizeGenerationResponseText,
} from '../../generation/json'
import {
  acceptedGenerationDiagnostics,
  buildGenerationResponseFlags,
  repairAttemptedGenerationDiagnostics,
  repairedGenerationDiagnostics,
  repairTransportFailureDiagnostics,
  repairValidationFailureDiagnostics,
  type GenerationResponseFlags,
} from '../../generation/diagnostics'
import {
  runGenerationRepair,
  type GenerationRepairRunnerResult,
} from '../../generation/repairRunner'
import type {
  LocationRoom,
  LocationRoomEncounterSeed,
  LocationRoomMessage,
  LocationRoomParticipant,
  LocationRoomTick,
} from '../../types'
import {
  normalizeAdventureMemory,
  type LocationRoomNarrativeState,
  type LocationRoomNarrativeStateSnapshot,
} from '../../narrativeTypes'
import { GAMEPLAY_CHECK_TYPES } from '../types'
import type {
  GameplayActionEnvelope,
  GameplayDiceRollResult,
  GameplayEncounter,
  GameplayMonsterState,
  GameplayRoomState,
  GameplayTurn,
} from '../types'
import type { GameplayEncounterProposal } from '../rules'

const CHARACTER_DIALOGUE_NARRATION_PATTERN = /\b(?:says?|said|asks?|asked|answers?|answered|replies?|replied|whispers?|whispered|shouts?|shouted|calls?|called|cries?|cried|mutters?|muttered|murmurs?|murmured|tells?|told|speaks?|spoke)\b[\s,:;'"“”‘’.-]{0,24}(?:["“”‘’']|that\b|to\b)|(?:["“”][^"“”]{2,160}["“”]\s*,?\s*)\b(?:says?|said|asks?|asked|answers?|answered|replies?|replied|whispers?|whispered|shouts?|shouted|calls?|called|cries?|cried|mutters?|muttered|murmurs?|murmured)\b/i

export type GameplayEncounterBudgetPrompt = {
  partySize: number
  difficulty: string
  maxMonsterCount: number
  maxTotalMonsterHp: number
  maxXpPerCharacter: number
  maxTemporaryBoons: number
  maxNarrativeRewards: number
}

export type GenerateGameplayEncounterProposalInput = {
  gameMasterAgentId: string
  room: LocationRoom
  tick: LocationRoomTick
  participants: LocationRoomParticipant[]
  recentMessages: LocationRoomMessage[]
  narrativeState: LocationRoomNarrativeState
  gameplayState: GameplayRoomState
  encounterSeed?: LocationRoomEncounterSeed | null
  requestedDifficulty: string
  budget: GameplayEncounterBudgetPrompt
}

export type GameplayEncounterProposalGenerationErrorCategory =
  | 'empty_response'
  | 'missing_json_object'
  | 'invalid_json'
  | 'missing_required_field'
  | 'generic_public_identity'
  | 'transport_error'
  | 'repair_transport_error'
  | 'validation_error'

export type GameplayEncounterProposalGenerationResponseFlags = GenerationResponseFlags

export type GameplayEncounterProposalGenerationDiagnostics = {
  status: 'accepted' | 'repaired' | 'repair_failed'
  repairAttempted: boolean
  repaired: boolean
  initialErrorCategory?: GameplayEncounterProposalGenerationErrorCategory
  repairErrorCategory?: GameplayEncounterProposalGenerationErrorCategory
  transportStage?: 'initial_collect' | 'repair_collect'
  initialResponseLength?: number
  repairResponseLength?: number
  initialResponseFlags?: GameplayEncounterProposalGenerationResponseFlags
  repairResponseFlags?: GameplayEncounterProposalGenerationResponseFlags
}

export type GameplayEncounterProposalOutput = {
  gameMasterAgentId: string
  proposal: GameplayEncounterProposal
  publicSetupNarration: string | null
  metadata: {
    rawResponseLength: number
    generationDiagnostics?: GameplayEncounterProposalGenerationDiagnostics
  }
}

export class GameMasterGameplayEncounterProposalGenerationError extends Error {
  constructor(
    message: string,
    readonly diagnostics: GameplayEncounterProposalGenerationDiagnostics,
    options?: { cause?: unknown }
  ) {
    super(message)
    this.name = 'GameMasterGameplayEncounterProposalGenerationError'
    this.cause = options?.cause
  }
}

export type GameplayMechanicalOutcomeSummary = {
  diceResults: GameplayDiceRollResult[]
  mechanicalDeltas: Record<string, unknown>
  encounterStatusAfter: string
  deaths: number[]
  rewardAssignments?: unknown[]
}

export type GenerateGameplayOutcomeNarrationInput = {
  gameMasterAgentId: string
  room: LocationRoom
  tick: LocationRoomTick
  participants: LocationRoomParticipant[]
  recentMessages: LocationRoomMessage[]
  narrativeState: LocationRoomNarrativeState
  gameplayStateBefore: GameplayRoomState
  gameplayStateAfter: GameplayRoomState
  encounterBefore: GameplayEncounter
  encounterAfter: GameplayEncounter
  turn: GameplayTurn
  action: GameplayActionEnvelope
  mechanicalSummary: GameplayMechanicalOutcomeSummary
}

export type GameplayOutcomeGenerationErrorCategory =
  | 'empty_response'
  | 'missing_json_object'
  | 'invalid_json'
  | 'missing_required_field'
  | 'weak_narration'
  | 'validation_error'
  | 'transport_error'
  | 'repair_transport_error'

export type GameplayOutcomeGenerationResponseFlags = GenerationResponseFlags

export type GameplayOutcomeGenerationDiagnostics = {
  status: 'accepted' | 'repaired' | 'repair_failed'
  repairAttempted: boolean
  repaired: boolean
  initialErrorCategory?: GameplayOutcomeGenerationErrorCategory
  repairErrorCategory?: GameplayOutcomeGenerationErrorCategory
  transportStage?: 'initial_collect' | 'repair_collect'
  initialResponseLength?: number
  repairResponseLength?: number
  initialResponseFlags?: GameplayOutcomeGenerationResponseFlags
  repairResponseFlags?: GameplayOutcomeGenerationResponseFlags
}

export type GameplayOutcomeNarrationOutput = {
  gameMasterAgentId: string
  publicNarration: string
  stateAfter: LocationRoomNarrativeStateSnapshot
  metadata: {
    rawResponseLength: number
    generationDiagnostics?: GameplayOutcomeGenerationDiagnostics
  }
}

export class GameMasterGameplayOutcomeGenerationError extends Error {
  constructor(
    message: string,
    readonly diagnostics: GameplayOutcomeGenerationDiagnostics,
    options?: { cause?: unknown }
  ) {
    super(message)
    this.name = 'GameMasterGameplayOutcomeGenerationError'
    this.cause = options?.cause
  }
}

export interface GameMasterGameplayGenerator {
  generateEncounterProposal(input: GenerateGameplayEncounterProposalInput): Promise<GameplayEncounterProposalOutput>
  generateOutcomeNarration(input: GenerateGameplayOutcomeNarrationInput): Promise<GameplayOutcomeNarrationOutput>
}

function trimToLimit(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = normalizeGenerationResponseText(value)
    .replace(/\s+/g, ' ')
    .trim()
  return normalized ? normalized.slice(0, limit).trim() || null : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numericValue(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizeMonsterStates(value: unknown): GameplayMonsterState[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): GameplayMonsterState[] => {
    if (!isRecord(item)) return []
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : null
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : id
    const archetype = typeof item.archetype === 'string' && item.archetype.trim() ? item.archetype.trim() : 'monster'
    const hp = numericValue(item.hp)
    const maxHp = numericValue(item.maxHp)
    const ac = numericValue(item.ac)
    const attackBonus = numericValue(item.attackBonus)
    const damageFormula = typeof item.damageFormula === 'string' && item.damageFormula.trim() ? item.damageFormula.trim() : '1d6'
    const status = item.status === 'dead' ? 'dead' : 'alive'
    if (!id || !name || hp == null || maxHp == null || ac == null || attackBonus == null) return []
    return [{
      id,
      name,
      archetype,
      hp,
      maxHp,
      ac,
      attackBonus,
      damageFormula,
      status,
      metadata: isRecord(item.metadata) ? item.metadata : undefined,
    }]
  })
}

function monsterNameById(encounter: GameplayEncounter, monsterId: unknown): string | null {
  if (typeof monsterId !== 'string' || !monsterId.trim()) return null
  return normalizeMonsterStates(encounter.monsterState).find((monster) => monster.id === monsterId)?.name ?? monsterId
}

function optionalNumber(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
}

function formatParticipants(participants: LocationRoomParticipant[]): string {
  return participants.map((participant) => `- ${participant.name} (#${participant.tokenId})`).join('\n')
}

function formatTranscript(messages: LocationRoomMessage[]): string {
  if (messages.length === 0) return 'No public room messages yet.'
  return messages.map((message) => {
    const token = message.tokenId == null ? '' : ` #${message.tokenId}`
    return `${message.authorName}${token}: ${message.content}`
  }).join('\n')
}

function formatNarrativeState(state: LocationRoomNarrativeState): string {
  return [
    `Continuity summary: ${state.stateSummary || 'No established continuity yet.'}`,
    `Current objective: ${state.currentObjective || 'None.'}`,
    state.openThreads.length > 0
      ? `Open threads:\n${state.openThreads.map((thread) => `- ${thread}`).join('\n')}`
      : 'Open threads: None.',
  ].join('\n')
}

function formatSeedList(label: string, values: string[] | undefined): string | null {
  if (!values?.length) return null
  return `${label}:\n${values.map((value) => `- ${value}`).join('\n')}`
}

function formatEncounterSeed(seed: LocationRoomEncounterSeed | null | undefined): string | null {
  if (!seed) return null
  const parts = [
    seed.title ? `Title: ${seed.title}` : null,
    seed.summary ? `Summary: ${seed.summary}` : null,
    seed.stakes ? `Stakes: ${seed.stakes}` : null,
    seed.source ? `Seed source: ${seed.source}` : null,
    seed.catalogEntryIds?.length ? `Catalog entry ids: ${seed.catalogEntryIds.join(', ')}` : null,
    formatSeedList('Encounter hints', seed.encounterHints),
    formatSeedList('Monster hints', seed.monsterHints),
  ].filter(Boolean)
  return parts.length > 0 ? parts.join('\n') : null
}

function splitHintTitle(value: string | null | undefined): string | null {
  const text = trimToLimit(value, 120)
  if (!text) return null
  return text.split(':')[0]?.trim() || null
}

function splitHintBody(value: string | null | undefined): string | null {
  const text = trimToLimit(value, 320)
  if (!text) return null
  const index = text.indexOf(':')
  return index >= 0 ? text.slice(index + 1).trim() || text : text
}

function seededEncounterProposalFallback(
  input: GenerateGameplayEncounterProposalInput,
  diagnostics: GameplayEncounterProposalGenerationDiagnostics,
  rawResponseLength: number
): GameplayEncounterProposalOutput | null {
  const seed = input.encounterSeed
  if (!seed) return null

  const encounterHint = seed.encounterHints?.[0]
  const monsterHint = seed.monsterHints?.[0]
  const title = trimToLimit(seed.title, 120) ?? splitHintTitle(encounterHint)
  const summary = trimToLimit(seed.summary, 500) ?? splitHintBody(encounterHint)
  const monsterName = splitHintTitle(monsterHint) ?? splitHintTitle(seed.title) ?? null
  const monsterArchetype = splitHintTitle(monsterHint) ?? 'seeded location horror'
  if (!title || !summary || !monsterName) return null

  const setupParts = [
    summary,
    `The ${monsterName} moves from its hiding place toward the nearest exposed line.`,
  ].filter((part): part is string => Boolean(part))
  const publicSetupNarration = trimToLimit(
    setupParts.join(' '),
    elizaConfig.locationRooms.narrative.publicNarrationMaxLength
  )
  if (!publicSetupNarration) return null

  const proposal: GameplayEncounterProposal = {
    title,
    summary,
    difficulty: input.requestedDifficulty as GameplayEncounterProposal['difficulty'],
    monsterCount: 1,
    monsterName,
    monsterArchetype: trimToLimit(monsterArchetype, 80) ?? 'seeded location horror',
    totalMonsterHp: Math.max(1, Math.min(input.budget.maxTotalMonsterHp, Math.round(input.budget.maxTotalMonsterHp / 2))),
    monsterAc: 12,
    monsterAttackBonus: 2,
    monsterDamageFormula: '1d6',
    sceneDc: 12,
    rewardXpPerCharacter: Math.max(0, Math.min(input.budget.maxXpPerCharacter, 3)),
    temporaryBoons: [],
    narrativeRewards: seed.stakes
      ? [trimToLimit(seed.stakes, 120)].filter((value): value is string => Boolean(value))
      : [],
    victoryText: trimToLimit(`The ${monsterName} breaks away from ${title}, leaving the route changed but not resolved.`, 240) ?? undefined,
  }

  return {
    gameMasterAgentId: input.gameMasterAgentId,
    proposal,
    publicSetupNarration,
    metadata: {
      rawResponseLength,
      generationDiagnostics: {
        ...diagnostics,
        status: 'repaired',
        repairAttempted: true,
        repaired: true,
      },
    },
  }
}

function formatDiceRollResult(result: GameplayDiceRollResult): string {
  const values = result.rolls.map((roll) => roll.value).join(' + ')
  return `${result.formula} [${values}] = ${result.total}`
}

function formatSignedModifier(value: unknown): string | null {
  const modifier = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(modifier) || modifier === 0) return null
  return modifier > 0 ? `+ ${modifier}` : `- ${Math.abs(modifier)}`
}

function formatSuccessTier(value: unknown): string {
  return String(value ?? 'unknown').replace(/_/g, ' ')
}

export function formatPublicGameplayRollSummary(summary: GameplayMechanicalOutcomeSummary): string | null {
  const deltas = summary.mechanicalDeltas as Record<string, unknown>
  const actionRoll = deltas.actionRoll as Record<string, unknown> | undefined
  const actionDamage = deltas.actionDamage as Record<string, unknown> | null | undefined
  const healing = deltas.healing as Record<string, unknown> | null | undefined
  const retaliation = deltas.monsterRetaliation as Record<string, unknown> | null | undefined
  const parts: string[] = []

  if (actionRoll) {
    const roll = actionRoll.roll as GameplayDiceRollResult | undefined
    const modifier = formatSignedModifier(actionRoll.modifier)
    const total = typeof actionRoll.total === 'number' ? actionRoll.total : Number(actionRoll.total)
    const dc = typeof actionRoll.dc === 'number' ? actionRoll.dc : Number(actionRoll.dc)
    const rollText = roll ? formatDiceRollResult(roll) : null
    const totalText = Number.isFinite(total) ? `total ${total}` : null
    const dcText = Number.isFinite(dc) ? `vs DC ${dc}` : null
    const tierText = formatSuccessTier(actionRoll.tier)
    const checkLabel = typeof actionRoll.checkLabel === 'string' && actionRoll.checkLabel.trim()
      ? actionRoll.checkLabel.trim()
      : 'Action'
    parts.push([
      checkLabel,
      rollText,
      modifier,
      totalText,
      dcText,
      `— ${tierText}`,
    ].filter(Boolean).join(' '))
  }

  if (actionDamage && typeof actionDamage.amount === 'number' && actionDamage.amount > 0) {
    parts.push(`Damage: ${actionDamage.amount}`)
  }

  if (healing && typeof healing.amount === 'number' && healing.amount > 0) {
    parts.push(`Healing: ${healing.amount}`)
  }

  if (retaliation) {
    const attackRoll = retaliation.attackRoll as Record<string, unknown> | null | undefined
    const attackDice = attackRoll?.roll as GameplayDiceRollResult | undefined
    const targetAc = typeof retaliation.targetAc === 'number' ? retaliation.targetAc : Number(retaliation.targetAc)
    const hit = typeof retaliation.hit === 'boolean' ? (retaliation.hit ? 'hit' : 'miss') : null
    const amount = typeof retaliation.amount === 'number' ? retaliation.amount : Number(retaliation.amount)
    const attackText = attackDice ? formatDiceRollResult(attackDice) : null
    const acText = Number.isFinite(targetAc) ? `vs AC ${targetAc}` : null
    const amountText = Number.isFinite(amount) && amount > 0 ? `damage ${amount}` : null
    parts.push([
      'Retaliation',
      attackText,
      acText,
      hit ? `— ${hit}` : null,
      amountText,
    ].filter(Boolean).join(' '))
  }

  if (parts.length === 0 && summary.diceResults.length > 0) {
    parts.push(...summary.diceResults.map((roll, index) => `Roll ${index + 1}: ${formatDiceRollResult(roll)}`))
  }

  return parts.length > 0 ? `Rolls: ${parts.join('; ')}` : null
}

function sanitizedMechanicalSummary(summary: GameplayMechanicalOutcomeSummary): Record<string, unknown> {
  const deltas = summary.mechanicalDeltas as Record<string, unknown>
  const actionRoll = deltas.actionRoll as Record<string, unknown> | undefined
  const actionDamage = deltas.actionDamage as Record<string, unknown> | null | undefined
  const healing = deltas.healing as Record<string, unknown> | null | undefined
  const retaliation = deltas.monsterRetaliation as Record<string, unknown> | null | undefined

  return {
    diceResults: summary.diceResults,
    encounterStatusAfter: summary.encounterStatusAfter,
    deaths: summary.deaths,
    rewardAssignments: summary.rewardAssignments,
    actionRoll: actionRoll ? {
      formula: actionRoll.formula,
      dc: actionRoll.dc,
      modifier: actionRoll.modifier,
      targetKind: actionRoll.targetKind,
      checkType: actionRoll.checkType,
      checkLabel: actionRoll.checkLabel,
      checkSource: actionRoll.checkSource,
      contextualCheckId: actionRoll.contextualCheckId,
      total: actionRoll.total,
      tier: actionRoll.tier,
      modifierBreakdown: actionRoll.modifierBreakdown,
    } : null,
    actionDamage: actionDamage ? {
      monsterId: actionDamage.monsterId,
      amount: actionDamage.amount,
      statContribution: actionDamage.statContribution,
    } : null,
    healing: healing ? {
      tokenId: healing.tokenId,
      amount: healing.amount,
      statContribution: healing.statContribution,
    } : null,
    monsterRetaliation: retaliation ? {
      monsterId: retaliation.monsterId,
      tokenId: retaliation.tokenId,
      amount: retaliation.amount,
      targetAc: retaliation.targetAc,
      hit: retaliation.hit,
    } : null,
  }
}

function formatBackendStatAwareSummary(summary: GameplayMechanicalOutcomeSummary): string {
  const deltas = summary.mechanicalDeltas as Record<string, unknown>
  const actionRoll = deltas.actionRoll as Record<string, unknown> | undefined
  const modifierBreakdown = actionRoll?.modifierBreakdown as Record<string, unknown> | undefined
  const actionDamage = deltas.actionDamage as Record<string, unknown> | null | undefined
  const healing = deltas.healing as Record<string, unknown> | null | undefined
  const retaliation = deltas.monsterRetaliation as Record<string, unknown> | null | undefined
  const facts: string[] = []

  if (modifierBreakdown?.mode === 'stat_aware') {
    const primaryStats = Array.isArray(modifierBreakdown.primaryStats)
      ? modifierBreakdown.primaryStats.filter((item): item is string => typeof item === 'string').join('/')
      : 'unknown'
    const checkLabel = typeof actionRoll?.checkLabel === 'string'
      ? actionRoll.checkLabel
      : String(modifierBreakdown.checkLabel ?? modifierBreakdown.actionType ?? 'action')
    const checkType = String(actionRoll?.checkType ?? modifierBreakdown.checkType ?? modifierBreakdown.actionType ?? 'unknown')
    const checkSource = String(actionRoll?.checkSource ?? modifierBreakdown.checkSource ?? 'unknown')
    const contextualId = typeof actionRoll?.contextualCheckId === 'string' && actionRoll.contextualCheckId
      ? ` contextual id ${actionRoll.contextualCheckId};`
      : ''
    facts.push(
      `Action roll used backend stat-aware ${checkLabel} check (${checkType}, ${checkSource};${contextualId} primary stats ${primaryStats}); total modifier ${String(modifierBreakdown.totalModifier ?? 'unknown')}.`
    )
  } else if (modifierBreakdown?.mode === 'legacy_fixed') {
    const checkLabel = typeof actionRoll?.checkLabel === 'string'
      ? actionRoll.checkLabel
      : String(modifierBreakdown.checkLabel ?? modifierBreakdown.actionType ?? 'action')
    const checkType = String(actionRoll?.checkType ?? modifierBreakdown.checkType ?? modifierBreakdown.actionType ?? 'unknown')
    const checkSource = String(actionRoll?.checkSource ?? modifierBreakdown.checkSource ?? 'unknown')
    const contextualId = typeof actionRoll?.contextualCheckId === 'string' && actionRoll.contextualCheckId
      ? ` Contextual check id: ${actionRoll.contextualCheckId}.`
      : ''
    facts.push(`Action roll used backend ${checkLabel} check (${checkType}, ${checkSource}) with legacy fixed backend modifiers; no stat sheet authority was delegated to the GM.${contextualId}`)
  }

  const damageContribution = actionDamage?.statContribution as Record<string, unknown> | null | undefined
  if (damageContribution) {
    facts.push(`Backend applied a stat contribution to damage from ${String(damageContribution.stat ?? 'a stat')}.`)
  }

  const healingContribution = healing?.statContribution as Record<string, unknown> | null | undefined
  if (healingContribution) {
    facts.push(`Backend applied a stat contribution to healing from ${String(healingContribution.stat ?? 'a stat')}.`)
  }

  if (retaliation && typeof retaliation.hit === 'boolean') {
    const hitText = retaliation.hit ? 'hit' : 'missed'
    facts.push(`Monster retaliation ${hitText} against the backend-computed defense context.`)
  }

  if (Array.isArray(deltas.performanceUpdates) && deltas.performanceUpdates.length > 0) {
    facts.push('Backend updated private performance counters for reward scoring; do not narrate exact scores or claims unless explicitly present in public facts.')
  }

  return facts.length > 0 ? facts.join('\n') : 'No stat-aware backend summary was provided for this turn.'
}

function responseFlags(raw: string): GameplayOutcomeGenerationResponseFlags {
  const text = normalizeGenerationResponseText(raw)
  return {
    empty: text.length === 0,
    hasJsonObject: text.indexOf('{') >= 0 && text.lastIndexOf('}') > text.indexOf('{'),
    fencedJson: /```(?:json)?/i.test(text),
    startsWithJsonObject: text.trim().startsWith('{'),
  }
}

function proposalResponseFlags(raw: string): GameplayEncounterProposalGenerationResponseFlags {
  const flags = responseFlags(raw)
  return {
    empty: flags.empty,
    hasJsonObject: flags.hasJsonObject,
    fencedJson: flags.fencedJson,
    startsWithJsonObject: flags.startsWithJsonObject,
  }
}

function categorizeOutcomeNarrationError(error: unknown): GameplayOutcomeGenerationErrorCategory {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (/empty/i.test(message)) return 'empty_response'
  if (/did not contain a JSON object/i.test(message)) return 'missing_json_object'
  if (/invalid JSON/i.test(message)) return 'invalid_json'
  if (/missing publicNarration|required/i.test(message)) return 'missing_required_field'
  if (/weak|generic|consequence|filler|specific combat target|location or catalog anchor|visible tactic|battlefield state/i.test(message)) return 'weak_narration'
  return 'validation_error'
}

function diagnosticsForOutcomeInitialFailure(
  raw: string,
  error: unknown
): GameplayOutcomeGenerationDiagnostics {
  return repairAttemptedGenerationDiagnostics(raw, categorizeOutcomeNarrationError(error), responseFlags(raw))
}

function attachOutcomeGenerationDiagnostics(
  output: GameplayOutcomeNarrationOutput,
  diagnostics: GameplayOutcomeGenerationDiagnostics,
  rawResponseLength: number
): GameplayOutcomeNarrationOutput {
  return {
    ...output,
    metadata: {
      ...output.metadata,
      rawResponseLength,
      generationDiagnostics: diagnostics,
    },
  }
}

function participantNameByTokenId(participants: LocationRoomParticipant[], tokenId: number | null | undefined): string | null {
  if (tokenId == null) return null
  return participants.find((participant) => participant.tokenId === tokenId)?.name ?? null
}

function selectedOutcomeMonsterName(input: GenerateGameplayOutcomeNarrationInput): string | null {
  const deltas = input.mechanicalSummary.mechanicalDeltas as Record<string, unknown>
  const actionDamage = isRecord(deltas.actionDamage) ? deltas.actionDamage : null
  const retaliation = isRecord(deltas.monsterRetaliation) ? deltas.monsterRetaliation : null
  const monsterId = actionDamage?.monsterId ?? retaliation?.monsterId ?? (input.action.target?.kind === 'monster' ? input.action.target.id : null)
  return monsterNameById(input.encounterBefore, monsterId)
}

function includesWordish(haystack: string, value: string | null | undefined): boolean {
  const normalized = value?.replace(/\s+/g, ' ').trim().toLowerCase()
  return Boolean(normalized && haystack.includes(normalized))
}

function outcomeLocationAnchorTerms(input: GenerateGameplayOutcomeNarrationInput, targetNames: Array<string | null>): string[] {
  const excluded = new Set(targetNames
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => normalizeAnchorTerm(value).split(' ')))
  const terms = new Set<string>()
  addAnchorTerms(input.encounterBefore.publicTitle, terms)
  addAnchorTerms((input.encounterBefore as { publicSummary?: string | null }).publicSummary, terms)
  const seed = input.encounterBefore.metadata?.encounterSeed as LocationRoomEncounterSeed | null | undefined
  if (seed) {
    addAnchorTerms(seed.title, terms)
    addAnchorTerms(seed.summary, terms)
    for (const hint of seed.encounterHints ?? []) addAnchorTerms(hint, terms)
    for (const hint of seed.monsterHints ?? []) addAnchorTerms(hint, terms)
  }
  const adventure = normalizeAdventureMemory(input.narrativeState.metadata)
  addAnchorTerms(adventure.spatialContext.currentArea, terms)
  for (const value of adventure.spatialContext.landmarks) addAnchorTerms(value, terms)
  for (const value of adventure.spatialContext.routes) addAnchorTerms(value, terms)

  return [...terms]
    .map(normalizeAnchorTerm)
    .filter((term) => term.length >= 4 && !excluded.has(term) && !/^(?:maw|monster|horror|threat|danger|encounter)$/.test(term))
    .slice(0, 24)
}

function hasAnyAnchorTerm(narration: string, terms: string[]): boolean {
  if (terms.length === 0) return true
  const normalized = ` ${normalizeAnchorTerm(narration)} `
  return terms.some((term) => normalized.includes(` ${normalizeAnchorTerm(term)} `))
}

function participantNameForActionTarget(input: GenerateGameplayOutcomeNarrationInput): string | null {
  return input.action.target?.kind === 'character'
    ? participantNameByTokenId(input.participants, input.action.target.tokenId)
    : null
}

export function validateGameplayOutcomeNarrationQuality(
  output: GameplayOutcomeNarrationOutput,
  input: GenerateGameplayOutcomeNarrationInput
): { ok: true } | { ok: false; error: string } {
  const narration = output.publicNarration.replace(/\s+/g, ' ').trim()
  if (!narration) return { ok: false, error: 'Gameplay outcome narration is empty' }
  if (CHARACTER_DIALOGUE_NARRATION_PATTERN.test(narration)) {
    return { ok: false, error: 'Gameplay outcome narration must not narrate character dialogue' }
  }

  const lower = narration.toLowerCase()
  const deltas = input.mechanicalSummary.mechanicalDeltas as Record<string, unknown>
  const actionRoll = isRecord(deltas.actionRoll) ? deltas.actionRoll : null
  const actionDamage = isRecord(deltas.actionDamage) ? deltas.actionDamage : null
  const healing = isRecord(deltas.healing) ? deltas.healing : null
  const retaliation = isRecord(deltas.monsterRetaliation) ? deltas.monsterRetaliation : null
  const actorName = participantNameByTokenId(input.participants, input.turn.selectedTokenId)
  const targetMonsterName = selectedOutcomeMonsterName(input)
  const targetCharacterName = participantNameForActionTarget(input)
  const actionSpeech = input.action.publicSpeech.replace(/\s+/g, ' ').trim().toLowerCase()

  if (actionSpeech && lower === actionSpeech) {
    return { ok: false, error: 'Gameplay outcome narration repeats the action without a visible consequence' }
  }

  const genericFiller = /\b(the room shifts|pressure remains|backend result|result echoes|encounter is not over|something happens|the situation changes|the fight continues)\b/i.test(narration)
  const consequenceWords = /\b(lands?|hits?|miss(?:es|ed)?|strikes?|cuts?|tears?|breaks?|staggers?|reels?|drives?|pins?|forces?|guards?|protects?|blocks?|opens?|exposes?|reveals?|heals?|restores?|recovers?|wounds?|bleeds?|falls?|dies?|collapses?|ends?|escapes?|flees?|retaliates?|answers?|counter(?:s|strike)?|costs?|loses?|gains?|ground|space|opening|advantage|off-balance|back)\b/i.test(narration)
  const factAnchor =
    includesWordish(lower, actorName) ||
    includesWordish(lower, targetMonsterName) ||
    includesWordish(lower, input.encounterBefore.publicTitle) ||
    lower.includes(input.action.actionType.replace(/_/g, ' ')) ||
    (typeof actionRoll?.tier === 'string' && lower.includes(String(actionRoll.tier).replace(/_/g, ' ')))

  const damageAmount = numericValue(actionDamage?.amount) ?? 0
  const healingAmount = numericValue(healing?.amount) ?? 0
  const retaliationHit = typeof retaliation?.hit === 'boolean' ? retaliation.hit : null
  const retaliationAmount = numericValue(retaliation?.amount) ?? 0
  const primaryTargetNames = [targetMonsterName, targetCharacterName].filter((value): value is string => Boolean(value))
  const requiredTargetNames = primaryTargetNames.length > 0
    ? primaryTargetNames
    : [actorName].filter((value): value is string => Boolean(value))
  const hasSpecificTarget = requiredTargetNames.some((name) => includesWordish(lower, name)) ||
    (requiredTargetNames.length === 0 && includesWordish(lower, input.encounterBefore.publicTitle))
  const locationAnchors = outcomeLocationAnchorTerms(input, requiredTargetNames)
  const visibleTactic = /\b(strikes?|cuts?|slashes?|drives?|pins?|blocks?|guards?|shields?|hooks?|shoves?|pulls?|draws?|circles?|ducks?|braces?|parries?|counters?|retaliates?|presses?|forces?|heals?|restores?|drags?|carries?|retreats?|withdraws?|flee(?:s|ing)?|runs?|dives?|weaves?|sidesteps?|throws?|grabs?|holds?)\b/i.test(narration)
  const battlefieldStateChange = /\b(line|ground|space|opening|cover|route|threshold|door|wall|floor|table|rafters?|stairs?|bridge|circle|formation|position|distance|path|exit|back|aside|off-balance|pinned|blocked|exposed|separated|cornered|reels?|staggers?|breaks?|splinters?|buckles?|collapses?|opens?|closes?|shifts?)\b/i.test(narration)
  const encounterStatusAfter = input.mechanicalSummary.encounterStatusAfter || input.encounterAfter.status
  const terminal = encounterStatusAfter !== 'active' || input.encounterAfter.status !== 'active'
  const deaths = input.mechanicalSummary.deaths.length > 0
  const victory = encounterStatusAfter === 'victory' || input.encounterAfter.status === 'victory'
  const fled = encounterStatusAfter === 'fled' || input.encounterAfter.status === 'fled'
  const defeat = encounterStatusAfter === 'defeat' || input.encounterAfter.status === 'defeat'

  if (!hasSpecificTarget) {
    return { ok: false, error: 'Gameplay outcome narration lacks a specific combat target anchor' }
  }

  if (!hasAnyAnchorTerm(narration, locationAnchors)) {
    return { ok: false, error: 'Gameplay outcome narration lacks a concrete location or catalog anchor' }
  }

  if (!visibleTactic) {
    return { ok: false, error: 'Gameplay outcome narration lacks a visible tactic' }
  }

  if (!battlefieldStateChange) {
    return { ok: false, error: 'Gameplay outcome narration lacks changed battlefield state' }
  }

  if (/\b(kills?|slays?|dead|dies|death|corpse|finality)\b/i.test(narration) && !deaths) {
    return { ok: false, error: 'Gameplay outcome narration invents death not present in backend facts' }
  }

  if (/\b(victory|wins?|won|fight is won|battle is won|danger collapses|no standing threat|ends? the fight|ending the fight)\b/i.test(narration) && !victory) {
    return { ok: false, error: 'Gameplay outcome narration invents victory not present in backend facts' }
  }

  if (/\b(flees?|fled|escapes?|escape route)\b/i.test(narration) && !fled) {
    return { ok: false, error: 'Gameplay outcome narration invents flee state not present in backend facts' }
  }

  if (/\b(defeat|defeated|party falls|characters fall)\b/i.test(narration) && !defeat) {
    return { ok: false, error: 'Gameplay outcome narration invents defeat not present in backend facts' }
  }

  const injurySupported = damageAmount > 0 || retaliationAmount > 0 || deaths
  if (/\b(takes? \d+ damage|damage|wounds?|bleeds?|blood|tears? through|cuts? into|hit lands|lands? a hit)\b/i.test(narration) && !injurySupported) {
    return { ok: false, error: 'Gameplay outcome narration invents injury or damage not present in backend facts' }
  }

  const backendConsequenceAnchor =
    (damageAmount > 0 && /\b(damage|hit|hits|strike|strikes|wound|wounds|reel|reels|staggers?|bleeds?|breaks?)\b/i.test(narration)) ||
    (healingAmount > 0 && /\b(heal|heals|restore|restores|recover|recovers|vitality|breath)\b/i.test(narration)) ||
    (retaliation && /\b(retaliat|counter|answers?|hits?|miss(?:es|ed)?|wide|damage|strikes?)\b/i.test(narration)) ||
    (retaliationHit === true && retaliationAmount > 0 && /\b(damage|hit|hits|wound|wounds|drives?)\b/i.test(narration)) ||
    (retaliationHit === false && /\b(miss(?:es|ed)?|wide|skids?|fails?|deflects?)\b/i.test(narration)) ||
    (deaths && /\b(dead|dies|death|falls?|collapses?|burns?)\b/i.test(narration)) ||
    (terminal && /\b(victory|ends?|ending|collapses?|breaks?|fled|flees|defeat|aftermath|no standing threat|danger collapses)\b/i.test(narration))

  if (genericFiller && !backendConsequenceAnchor) {
    return { ok: false, error: 'Gameplay outcome narration is generic filler without visible consequence' }
  }

  if (!consequenceWords && !backendConsequenceAnchor) {
    return { ok: false, error: 'Gameplay outcome narration does not state a visible consequence' }
  }

  if (!factAnchor && !backendConsequenceAnchor) {
    return { ok: false, error: 'Gameplay outcome narration lacks a backend-supported action, actor, target, or result anchor' }
  }

  return { ok: true }
}

function requireValidatedOutcomeNarration(
  raw: string,
  input: GenerateGameplayOutcomeNarrationInput,
  gameMasterAgentId: string
): GameplayOutcomeNarrationOutput {
  const output = normalizeGameplayOutcomeNarrationResponse(raw, {
    gameMasterAgentId,
    narrativeState: input.narrativeState,
  })
  const validation = validateGameplayOutcomeNarrationQuality(output, input)
  if (!validation.ok) {
    throw new Error(validation.error)
  }
  return output
}

function buildGameplayOutcomeNarrationRepairPrompt(
  input: GenerateGameplayOutcomeNarrationInput,
  diagnostics: GameplayOutcomeGenerationDiagnostics
): string {
  const deltas = input.mechanicalSummary.mechanicalDeltas as Record<string, unknown>
  const actionRoll = isRecord(deltas.actionRoll) ? deltas.actionRoll : null
  const actionDamage = isRecord(deltas.actionDamage) ? deltas.actionDamage : null
  const healing = isRecord(deltas.healing) ? deltas.healing : null
  const retaliation = isRecord(deltas.monsterRetaliation) ? deltas.monsterRetaliation : null
  const actorName = participantNameByTokenId(input.participants, input.turn.selectedTokenId) ?? 'The acting character'
  const targetMonsterName = selectedOutcomeMonsterName(input) ?? 'no selected monster target'
  const rollSummary = formatPublicGameplayRollSummary(input.mechanicalSummary) ?? 'No public roll-card summary was projected.'

  return [
    'Your previous WAGDIE combat outcome narration could not be accepted.',
    'This is one semantic repair attempt. Return a fresh JSON-only narration that follows backend facts.',
    `Safe error category: ${diagnostics.initialErrorCategory ?? 'validation_error'}`,
    '',
    `Actor: ${actorName} (#${String(input.turn.selectedTokenId ?? 'unknown')})`,
    `Action type: ${input.action.actionType}`,
    `Action public speech: ${input.action.publicSpeech}`,
    `Selected target monster: ${targetMonsterName}`,
    `Encounter before: ${input.encounterBefore.publicTitle ?? 'Untitled encounter'} (${input.encounterBefore.status})`,
    `Encounter after: ${input.encounterAfter.publicTitle ?? input.encounterBefore.publicTitle ?? 'Untitled encounter'} (${input.encounterAfter.status})`,
    `Encounter status after mechanics: ${input.mechanicalSummary.encounterStatusAfter}`,
    '',
    'Roll card owns structured mechanics; prose should describe visible consequence only.',
    'The repaired combat prose must name a specific target, include a concrete location/catalog anchor, show a visible tactic, leave the battlefield visibly changed, and avoid character dialogue.',
    `Public roll-card summary: ${rollSummary}`,
    '',
    'Backend consequence facts:',
    `- Action roll tier: ${String(actionRoll?.tier ?? 'unknown')}`,
    `- Action damage: ${String(actionDamage?.amount ?? 0)}${actionDamage?.monsterId ? ` to ${String(actionDamage.monsterId)}` : ''}`,
    `- Healing: ${String(healing?.amount ?? 0)}${healing?.tokenId ? ` to #${String(healing.tokenId)}` : ''}`,
    retaliation ? `- Monster retaliation: ${retaliation.hit === true ? 'hit' : retaliation.hit === false ? 'miss' : 'unknown'} for ${String(retaliation.amount ?? 0)}` : '- Monster retaliation: none recorded',
    `- Death token ids: ${input.mechanicalSummary.deaths.length ? input.mechanicalSummary.deaths.join(', ') : 'none'}`,
    '',
    'Return only JSON with this contract:',
    '{',
    '  "publicNarration": "public consequence-first combat outcome narration",',
    '  "stateSummary": "updated private continuity summary",',
    '  "currentObjective": "current objective, or null",',
    '  "openThreads": ["short unresolved thread"]',
    '}',
    '',
    'Repair rules:',
    '- JSON only; no markdown or explanation.',
    '- Name a visible consequence: contact, miss, damage, healing, retaliation, protection, movement, death, victory, flee state, or other backend-supported result.',
    '- Name the target/actor, include an anchor such as the encounter title, seeded landmark, route, or catalog monster/place, show the tactic, and state what line/ground/cover/route/position changes.',
    '- No character dialogue; preserve character speech for the character action message.',
    '- Do not invent HP, XP, rewards, finality, new dice, new checks, or monster abilities.',
    '- Do not repeat the roll-card numbers unless needed for plain language; the roll card remains the structured mechanics surface.',
    '- Avoid generic filler such as "the room shifts", "pressure remains", or "the encounter is not over".',
  ].join('\n')
}

function genericEncounterPublicCopyReason(value: string): string | null {
  const normalized = value.replace(/\s+/g, ' ').trim().toLowerCase()
  if (!normalized) return 'empty'
  if (normalized === 'a dreadful encounter') return 'default public title'
  if (normalized === 'wagdie horror') return 'default monster name'
  if (normalized === 'lurking threat') return 'default monster archetype'
  if (normalized === 'fallback apparition') return 'fallback monster archetype'
  if (normalized === 'ashen horror' || normalized === 'restless shade') return 'legacy fallback monster name'
  if (normalized === 'escalating danger' || normalized === 'location encounter' || normalized === 'location catalog encounter' || normalized === 'generic trouble') return 'generic encounter title'
  if (/^a threat (gathers|emerges)\b/.test(normalized)) return 'default public setup or summary'
  if (/^the room (darkens|shifts)\b/.test(normalized)) return 'generic room setup'
  if (/\b(?:shadowy figure|unknown threat|generic threat|faceless threat|nameless threat|unseen enemy|enemy appears|creatures? attacks?|monsters? attacks?|dark shape|something attacks|something moves just out of sight|threat emerges|danger emerges|hostile presence|the thing in the dark|the room answers with danger)\b/.test(normalized)) return 'generic threat identity'
  return null
}

const GENERIC_ANCHOR_WORDS = new Set([
  'about', 'above', 'after', 'again', 'against', 'along', 'answer', 'answers', 'around', 'before', 'behind', 'below', 'beneath', 'between', 'closes', 'concrete', 'current', 'danger', 'emerges', 'enemy', 'encounter', 'falls', 'fallback', 'from', 'generic', 'horror', 'into', 'keeps', 'location', 'monster', 'opens', 'presses', 'recent', 'room', 'snaps', 'specific', 'spatial', 'summary', 'threat', 'through', 'under', 'unknown', 'visible', 'with',
])

function normalizeAnchorTerm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function addAnchorTerms(raw: string | null | undefined, terms: Set<string>): void {
  const text = trimToLimit(raw, 240)
  if (!text) return
  const candidates = [text, text.split(':')[0]]
  for (const candidate of candidates) {
    const normalized = normalizeAnchorTerm(candidate.replace(/^\d+(?:\.\d+)*[._-]*/, ''))
    const words = normalized.split(' ').filter(Boolean)
    if (words.length > 1 && words.length <= 5 && normalized.length >= 4) terms.add(normalized)
    for (const word of words) {
      if (word.length >= 4 && !GENERIC_ANCHOR_WORDS.has(word) && !/^(?:active|open|closed|anchors|consequences?)$/.test(word)) {
        terms.add(word)
      }
    }
  }
}

function encounterAnchorTerms(input: {
  encounterSeed?: LocationRoomEncounterSeed | null
  narrativeState?: LocationRoomNarrativeState | null
}): string[] {
  const terms = new Set<string>()
  addAnchorTerms(input.encounterSeed?.title, terms)
  addAnchorTerms(input.encounterSeed?.summary, terms)
  addAnchorTerms(input.encounterSeed?.stakes, terms)
  for (const hint of input.encounterSeed?.encounterHints ?? []) addAnchorTerms(hint, terms)
  for (const hint of input.encounterSeed?.monsterHints ?? []) addAnchorTerms(hint, terms)

  const adventure = input.narrativeState?.metadata && typeof input.narrativeState.metadata === 'object'
    ? (input.narrativeState.metadata.adventure as Record<string, unknown> | undefined)
    : undefined
  const spatial = adventure && typeof adventure.spatialContext === 'object' && adventure.spatialContext !== null
    ? adventure.spatialContext as Record<string, unknown>
    : null
  addAnchorTerms(typeof spatial?.currentArea === 'string' ? spatial.currentArea : null, terms)
  for (const key of ['landmarks', 'routes']) {
    const values = Array.isArray(spatial?.[key]) ? spatial?.[key] as unknown[] : []
    for (const value of values) addAnchorTerms(typeof value === 'string' ? value : null, terms)
  }
  return [...terms].slice(0, 24)
}

function requireEncounterAnchorText(
  value: string,
  label: string,
  terms: string[]
): void {
  if (terms.length === 0) return
  const normalized = ` ${normalizeAnchorTerm(value)} `
  const matched = terms.some((term) => normalized.includes(` ${normalizeAnchorTerm(term)} `))
  if (matched) return
  throw new GameMasterGameplayEncounterProposalGenerationError(
    `Gameplay encounter proposal ${label} lacked a concrete location/catalog anchor`,
    {
      status: 'repair_failed',
      repairAttempted: false,
      repaired: false,
      initialErrorCategory: 'generic_public_identity',
    }
  )
}

function requireEncounterPublicText(
  value: string | null | undefined,
  label: string,
  options: { rejectGeneric?: boolean } = { rejectGeneric: true }
): string {
  const text = value?.replace(/\s+/g, ' ').trim()
  if (!text) {
    throw new GameMasterGameplayEncounterProposalGenerationError(
      `Gameplay encounter proposal missing ${label}`,
      {
        status: 'repair_failed',
        repairAttempted: false,
        repaired: false,
        initialErrorCategory: 'missing_required_field',
      }
    )
  }
  if (CHARACTER_DIALOGUE_NARRATION_PATTERN.test(text)) {
    throw new GameMasterGameplayEncounterProposalGenerationError(
      `Gameplay encounter proposal ${label} must not narrate character dialogue`,
      {
        status: 'repair_failed',
        repairAttempted: false,
        repaired: false,
        initialErrorCategory: 'validation_error',
      }
    )
  }
  if (options.rejectGeneric !== false) {
    const genericReason = genericEncounterPublicCopyReason(text)
    if (genericReason) {
      throw new GameMasterGameplayEncounterProposalGenerationError(
        `Gameplay encounter proposal ${label} used generic fallback copy (${genericReason})`,
        {
          status: 'repair_failed',
          repairAttempted: false,
          repaired: false,
          initialErrorCategory: 'generic_public_identity',
        }
      )
    }
  }
  return text
}

function categorizeEncounterProposalError(error: unknown): GameplayEncounterProposalGenerationErrorCategory {
  if (error instanceof GameMasterGameplayEncounterProposalGenerationError) {
    return error.diagnostics.initialErrorCategory ?? error.diagnostics.repairErrorCategory ?? 'validation_error'
  }
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (/empty/i.test(message)) return 'empty_response'
  if (/did not contain a JSON object/i.test(message)) return 'missing_json_object'
  if (/invalid JSON/i.test(message)) return 'invalid_json'
  if (/missing|required/i.test(message)) return 'missing_required_field'
  if (/generic fallback|default public|default monster|fallback monster|legacy fallback/i.test(message)) return 'generic_public_identity'
  return 'validation_error'
}

function toEncounterProposalGenerationError(
  error: unknown,
  status: GameplayEncounterProposalGenerationDiagnostics['status'] = 'repair_failed'
): GameMasterGameplayEncounterProposalGenerationError {
  if (error instanceof GameMasterGameplayEncounterProposalGenerationError) {
    return error
  }
  const category = categorizeEncounterProposalError(error)
  return new GameMasterGameplayEncounterProposalGenerationError(
    error instanceof Error ? error.message : 'Gameplay encounter proposal response was invalid',
    {
      status,
      repairAttempted: false,
      repaired: false,
      initialErrorCategory: category,
    },
    { cause: error }
  )
}

function diagnosticsForProposalInitialFailure(
  raw: string,
  error: unknown
): GameplayEncounterProposalGenerationDiagnostics {
  return repairAttemptedGenerationDiagnostics(raw, categorizeEncounterProposalError(error), proposalResponseFlags(raw))
}

function attachProposalGenerationDiagnostics(
  output: GameplayEncounterProposalOutput,
  diagnostics: GameplayEncounterProposalGenerationDiagnostics,
  rawResponseLength: number
): GameplayEncounterProposalOutput {
  return {
    ...output,
    metadata: {
      ...output.metadata,
      rawResponseLength,
      generationDiagnostics: diagnostics,
    },
  }
}

function buildGameplayEncounterProposalRepairPrompt(
  input: GenerateGameplayEncounterProposalInput,
  diagnostics: GameplayEncounterProposalGenerationDiagnostics
): string {
  const encounterSeed = formatEncounterSeed(input.encounterSeed)
  return [
    'Your previous WAGDIE gameplay encounter proposal could not be accepted by the server.',
    'This is one hidden semantic repair attempt. Return a fresh strict proposal now.',
    `Safe error category: ${diagnostics.initialErrorCategory ?? 'validation_error'}`,
    `Rejected response length: ${String(diagnostics.initialResponseLength ?? 0)}`,
    '',
    `Room id: ${input.room.id}`,
    `Location id: ${input.room.locationId}`,
    `Tick id: ${input.tick.id}`,
    `Requested difficulty: ${input.requestedDifficulty}`,
    `Budget: partySize=${input.budget.partySize}, maxMonsterCount=${input.budget.maxMonsterCount}, maxTotalMonsterHp=${input.budget.maxTotalMonsterHp}, maxXpPerCharacter=${input.budget.maxXpPerCharacter}`,
    `Allowed contextual check types: ${GAMEPLAY_CHECK_TYPES.join(', ')}`,
    '',
    'Eligible living participants:',
    formatParticipants(input.participants),
    '',
    'Recent public transcript:',
    formatTranscript(input.recentMessages),
    '',
    'Private narrative state:',
    formatNarrativeState(input.narrativeState),
    '',
    encounterSeed ? 'Narrative encounter seed, public-safe and non-authoritative:' : null,
    encounterSeed,
    encounterSeed ? 'Prefer seed source, catalog entry ids, encounter hints, monster hints, spatial anchors, and recent consequences before inventing encounter flavor.' : null,
    '',
    'Return only JSON with this contract:',
    '{',
    '  "title": "specific public encounter title",',
    '  "summary": "specific public encounter summary",',
    '  "publicSetupNarration": "specific public setup narration to append before combat actions",',
    '  "difficulty": "easy|normal|hard|deadly",',
    '  "monsterCount": 1,',
    '  "monsterName": "specific monster display name",',
    '  "monsterArchetype": "specific monster flavor archetype",',
    '  "totalMonsterHp": 20,',
    '  "monsterAc": 12,',
    '  "monsterAttackBonus": 2,',
    '  "monsterDamageFormula": "1d6",',
    '  "sceneDc": 12,',
    '  "contextualChecks": [{ "id": "read-the-runes", "label": "Read the Runes", "description": "Interpret the room-specific sigils.", "checkType": "arcana", "dc": 13 }],',
    '  "rewardXpPerCharacter": 10,',
    '  "temporaryBoons": ["short boon"],',
    '  "narrativeRewards": ["short reward"],',
    '  "victoryText": "public victory text"',
    '}',
    '',
    'Repair rules:',
    '- JSON only; no markdown or explanation.',
    '- title, summary, publicSetupNarration, monsterName, and monsterArchetype are required.',
    '- Do not use literal fallback/default copy such as "A dreadful encounter", "A threat gathers in the room", "A threat emerges in the room", "WAGDIE horror", "lurking threat", "fallback apparition", "Ashen Horror", or "Restless Shade".',
    '- Keep all public text specific to the room transcript, narrative state, or seed.',
    '- If seed/hints/spatial anchors are present, title/summary and setup narration must visibly include one concrete anchor from them.',
    '- No character dialogue in title, summary, setup narration, or victory text.',
    '- Contextual checks are optional and must use allowed check types only.',
  ].filter((line): line is string => line !== null).join('\n')
}

export function normalizeGameplayEncounterProposalResponse(
  raw: string,
  input: Pick<GenerateGameplayEncounterProposalInput, 'gameMasterAgentId'> & Partial<Pick<GenerateGameplayEncounterProposalInput, 'encounterSeed' | 'narrativeState'>>
): GameplayEncounterProposalOutput {
  const parsed = extractGenerationJsonObject(raw, 'Gameplay encounter proposal response')
  const title = requireEncounterPublicText(trimToLimit(parsed.title ?? parsed.publicTitle, 120), 'title')
  const summary = requireEncounterPublicText(trimToLimit(parsed.summary ?? parsed.publicSummary, 500), 'summary')
  const monsterName = requireEncounterPublicText(trimToLimit(parsed.monsterName, 80), 'monsterName')
  const monsterArchetype = requireEncounterPublicText(trimToLimit(parsed.monsterArchetype, 80), 'monsterArchetype')
  const publicSetupNarration = requireEncounterPublicText(trimToLimit(
    parsed.publicSetupNarration ?? parsed.publicNarration ?? parsed.setupNarration,
    elizaConfig.locationRooms.narrative.publicNarrationMaxLength
  ), 'publicSetupNarration')
  const victoryText = trimToLimit(parsed.victoryText, 240) ?? undefined
  if (victoryText && CHARACTER_DIALOGUE_NARRATION_PATTERN.test(victoryText)) {
    throw new GameMasterGameplayEncounterProposalGenerationError(
      'Gameplay encounter proposal victoryText must not narrate character dialogue',
      {
        status: 'repair_failed',
        repairAttempted: false,
        repaired: false,
        initialErrorCategory: 'validation_error',
      }
    )
  }
  const anchorTerms = encounterAnchorTerms(input)
  requireEncounterAnchorText(`${title} ${summary}`, 'title/summary', anchorTerms)
  requireEncounterAnchorText(publicSetupNarration, 'publicSetupNarration', anchorTerms)

  const proposal: GameplayEncounterProposal = {
    title,
    summary,
    difficulty: (trimToLimit(parsed.difficulty, 20) ?? undefined) as GameplayEncounterProposal['difficulty'],
    monsterCount: optionalNumber(parsed.monsterCount),
    monsterName,
    monsterArchetype,
    totalMonsterHp: optionalNumber(parsed.totalMonsterHp),
    monsterAc: optionalNumber(parsed.monsterAc),
    monsterAttackBonus: optionalNumber(parsed.monsterAttackBonus),
    monsterDamageFormula: trimToLimit(parsed.monsterDamageFormula, 20) ?? undefined,
    sceneDc: optionalNumber(parsed.sceneDc),
    rewardXpPerCharacter: optionalNumber(parsed.rewardXpPerCharacter),
    temporaryBoons: stringArray(parsed.temporaryBoons),
    narrativeRewards: stringArray(parsed.narrativeRewards),
    victoryText,
    contextualChecks: Array.isArray(parsed.contextualChecks) ? parsed.contextualChecks : undefined,
  }

  return {
    gameMasterAgentId: input.gameMasterAgentId,
    proposal,
    publicSetupNarration,
    metadata: {
      rawResponseLength: raw.length,
    },
  }
}

export function normalizeGameplayOutcomeNarrationResponse(
  raw: string,
  input: Pick<GenerateGameplayOutcomeNarrationInput, 'gameMasterAgentId' | 'narrativeState'>
): GameplayOutcomeNarrationOutput {
  const parsed = extractGenerationJsonObject(raw, 'Gameplay outcome narration response')
  const publicNarration = trimToLimit(
    parsed.publicNarration ?? parsed.public_narration,
    elizaConfig.locationRooms.narrative.publicNarrationMaxLength
  )
  if (!publicNarration) {
    throw new Error('Gameplay outcome narration response missing publicNarration')
  }

  const stateSummary = trimToLimit(
    parsed.stateSummary ?? parsed.state_summary ?? parsed.updatedContinuitySummary,
    elizaConfig.locationRooms.narrative.stateSummaryMaxLength
  ) ?? input.narrativeState.stateSummary

  const currentObjective = trimToLimit(
    parsed.currentObjective ?? parsed.current_objective,
    elizaConfig.locationRooms.narrative.stateSummaryMaxLength
  ) ?? input.narrativeState.currentObjective

  const openThreads = stringArray(parsed.openThreads ?? parsed.open_threads)
    ?.slice(0, elizaConfig.locationRooms.narrative.openThreadsMaxCount)
    .map((thread) => thread.slice(0, elizaConfig.locationRooms.narrative.openThreadMaxLength)) ?? input.narrativeState.openThreads

  return {
    gameMasterAgentId: input.gameMasterAgentId,
    publicNarration,
    stateAfter: {
      stateSummary,
      currentObjective,
      openThreads,
    },
    metadata: {
      rawResponseLength: raw.length,
    },
  }
}

export function buildGameplayEncounterProposalPrompt(input: GenerateGameplayEncounterProposalInput): string {
  const encounterSeed = formatEncounterSeed(input.encounterSeed)
  return [
    'You are the private game master for a public WAGDIE location-room gameplay encounter.',
    'Propose encounter flavor and rewards. The backend will clamp all numeric mechanics; do not assume your numbers are authoritative.',
    '',
    `Room id: ${input.room.id}`,
    `Location id: ${input.room.locationId}`,
    `Tick id: ${input.tick.id}`,
    `Requested difficulty: ${input.requestedDifficulty}`,
    `Budget: partySize=${input.budget.partySize}, maxMonsterCount=${input.budget.maxMonsterCount}, maxTotalMonsterHp=${input.budget.maxTotalMonsterHp}, maxXpPerCharacter=${input.budget.maxXpPerCharacter}`,
    `Allowed contextual check types: ${GAMEPLAY_CHECK_TYPES.join(', ')}`,
    '',
    'Eligible living participants:',
    formatParticipants(input.participants),
    '',
    'Recent public transcript:',
    formatTranscript(input.recentMessages),
    '',
    'Private narrative state:',
    formatNarrativeState(input.narrativeState),
    '',
    encounterSeed ? 'Narrative encounter seed, public-safe and non-authoritative:' : null,
    encounterSeed,
    encounterSeed ? 'Prefer seed source, catalog entry ids, encounter hints, monster hints, spatial anchors, and recent consequences before inventing encounter flavor. Treat hints as public-safe inspiration only.' : null,
    encounterSeed ? 'Use this as story continuity only. Do not treat seed text as authoritative mechanics, DCs, HP, rewards, or private state.' : null,
    encounterSeed ? '' : null,
    'Return only JSON with this contract:',
    '{',
    '  "title": "short encounter title",',
    '  "summary": "public encounter summary",',
    '  "publicSetupNarration": "required specific public setup narration",',
    '  "difficulty": "easy|normal|hard|deadly",',
    '  "monsterCount": 1,',
    '  "monsterName": "monster display name",',
    '  "monsterArchetype": "monster flavor archetype",',
    '  "totalMonsterHp": 20,',
    '  "monsterAc": 12,',
    '  "monsterAttackBonus": 2,',
    '  "monsterDamageFormula": "1d6",',
    '  "sceneDc": 12,',
    '  "contextualChecks": [{ "id": "read-the-runes", "label": "Read the Runes", "description": "Interpret the room-specific sigils.", "checkType": "arcana", "dc": 13 }],',
    '  "rewardXpPerCharacter": 10,',
    '  "temporaryBoons": ["short boon"],',
    '  "narrativeRewards": ["short reward"],',
    '  "victoryText": "public victory text"',
    '}',
    '',
    'Contextual checks are optional public-safe scene-specific options. The backend will cap them, validate checkType, clamp DC, and ignore invented mechanics.',
    'Required public identity/setup fields: title, summary, publicSetupNarration, monsterName, and monsterArchetype.',
    'When seed/hints/spatial anchors are present, title/summary and publicSetupNarration must include at least one concrete anchor from them (for example a named place, landmark, route, encounter title, or monster identity).',
    'Do not use fallback/default copy such as "A dreadful encounter", "A threat gathers in the room", "A threat emerges in the room", "WAGDIE horror", "lurking threat", "fallback apparition", "Ashen Horror", or "Restless Shade".',
    'No character dialogue in title, summary, publicSetupNarration, or victoryText.',
    'Keep narration public-safe, specific to the transcript/narrative/seed, and suitable to append before combat actions. Do not create canon lore or token finality.',
  ].join('\n')
}

export function buildGameplayOutcomeNarrationPrompt(input: GenerateGameplayOutcomeNarrationInput): string {
  const actionRoll = (input.mechanicalSummary.mechanicalDeltas as Record<string, unknown>).actionRoll as Record<string, unknown> | undefined
  const selectedCheckFacts = actionRoll
    ? [
        `Selected check type: ${String(actionRoll.checkType ?? 'unknown')}`,
        `Selected check label: ${String(actionRoll.checkLabel ?? actionRoll.checkType ?? 'unknown')}`,
        `Selected check source: ${String(actionRoll.checkSource ?? 'unknown')}`,
        typeof actionRoll.contextualCheckId === 'string' && actionRoll.contextualCheckId
          ? `Contextual check id: ${actionRoll.contextualCheckId}`
          : null,
        `Roll total: ${String(actionRoll.total ?? 'unknown')}`,
        `DC: ${String(actionRoll.dc ?? 'unknown')}`,
        `Tier: ${String(actionRoll.tier ?? 'unknown')}`,
      ].filter(Boolean).join('\n')
    : 'No selected check facts were provided.'

  return [
    'You are the private game master narrating a WAGDIE gameplay turn outcome.',
    'Narrate only the backend-computed result. Do not assign HP, death, XP, rewards, dice, or mechanics beyond the facts provided.',
    'The roll card is the structured mechanics surface; your prose should describe visible fictional consequence without re-explaining every number.',
    'Combat prose must be kinetic and consequence-first: every success lands, moves, breaks, pins, drives back, reveals leverage, or changes position; every failure costs ground, invites retaliation, separates allies, worsens danger, or forces a hard choice.',
    'Every combat outcome must name a specific target/actor, include a concrete location/catalog anchor from the encounter title, seed, spatial context, or visible landmark, show a visible tactic, and state the changed battlefield state (line, ground, cover, route, position, or exit).',
    'No character dialogue in GM outcome prose; preserve character speech for the character action message.',
    'Avoid passive filler such as "the room shifts", "pressure remains", or restating that the encounter is not over. Name the visible action and the immediate consequence.',
    '',
    `Room id: ${input.room.id}`,
    `Location id: ${input.room.locationId}`,
    `Tick id: ${input.tick.id}`,
    `Encounter: ${input.encounterBefore.publicTitle ?? 'Untitled encounter'} (${input.encounterBefore.status})`,
    `Selected action: ${input.action.actionType}`,
    `Public speech: ${input.action.publicSpeech}`,
    '',
    'Backend-selected check facts:',
    selectedCheckFacts,
    '',
    'Backend-computed stat-aware summary:',
    formatBackendStatAwareSummary(input.mechanicalSummary),
    '',
    'Backend-computed mechanical summary:',
    JSON.stringify(sanitizedMechanicalSummary(input.mechanicalSummary), null, 2),
    '',
    'Recent public transcript:',
    formatTranscript(input.recentMessages),
    '',
    'Private narrative state before outcome:',
    formatNarrativeState(input.narrativeState),
    '',
    'Return only JSON with this contract:',
    '{',
    '  "publicNarration": "public outcome narration",',
    '  "stateSummary": "updated private continuity summary",',
    '  "currentObjective": "current objective, or null",',
    '  "openThreads": ["short unresolved thread"]',
    '}',
  ].join('\n')
}

export class OfficialGameMasterGameplayGenerator implements GameMasterGameplayGenerator {
  constructor(
    private readonly messaging: OfficialElizaMessagingClient = createOfficialElizaMessagingClient({
      baseUrl: elizaConfig.official.baseUrl,
      apiKey: elizaConfig.official.apiKey,
      timeout: elizaConfig.timeout,
    })
  ) {}

  async generateEncounterProposal(input: GenerateGameplayEncounterProposalInput): Promise<GameplayEncounterProposalOutput> {
    const gameMasterAgentId = input.gameMasterAgentId.trim()
    if (!gameMasterAgentId) throw new Error('Gameplay encounter proposal requires a game-master agent id')

    const sessionMetadata = {
      source: 'wagdie-location-room-gameplay-gm-encounter',
      roomId: input.room.id,
      locationId: input.room.locationId,
      tickId: input.tick.id,
    }

    let collectedText = ''
    try {
      await this.messaging.startAgent(gameMasterAgentId)
      const collected = await sendAndCollectOfficialEphemeralSessionMessage(this.messaging, {
        session: {
          agentId: gameMasterAgentId,
          userId: input.room.officialUserId,
          metadata: sessionMetadata,
        },
        message: {
          content: buildGameplayEncounterProposalPrompt(input),
          transport: 'http',
          metadata: sessionMetadata,
        },
        logContext: sessionMetadata,
      })
      collectedText = collected.text
    } catch (transportError) {
      throw new GameMasterGameplayEncounterProposalGenerationError(
        'Gameplay encounter proposal failed during Official ElizaOS transport',
        {
          status: 'repair_failed',
          repairAttempted: false,
          repaired: false,
          initialErrorCategory: 'transport_error',
          transportStage: 'initial_collect',
        },
        { cause: transportError }
      )
    }

    let result: GenerationRepairRunnerResult<GameplayEncounterProposalOutput, GameplayEncounterProposalGenerationDiagnostics>
    try {
      result = await runGenerationRepair<GameplayEncounterProposalOutput, GameplayEncounterProposalGenerationDiagnostics>({
        initialText: collectedText,
        parseInitial: (text) => normalizeGameplayEncounterProposalResponse(text, {
          gameMasterAgentId,
          encounterSeed: input.encounterSeed,
          narrativeState: input.narrativeState,
        }),
        buildAcceptedDiagnostics: (text) => acceptedGenerationDiagnostics(text, proposalResponseFlags(text)),
        buildInitialFailureDiagnostics: diagnosticsForProposalInitialFailure,
        collectRepairText: async (diagnostics) => {
          const repairMetadata = {
            ...sessionMetadata,
            source: 'wagdie-location-room-gameplay-gm-encounter-repair',
            repairAttempted: true,
            initialErrorCategory: diagnostics.initialErrorCategory,
          }
          const repaired = await sendAndCollectOfficialEphemeralSessionMessage(this.messaging, {
            session: {
              agentId: gameMasterAgentId,
              userId: input.room.officialUserId,
              metadata: repairMetadata,
            },
            message: {
              content: buildGameplayEncounterProposalRepairPrompt(input, diagnostics),
              transport: 'http',
              metadata: repairMetadata,
            },
            logContext: repairMetadata,
          })
          return repaired.text
        },
        parseRepair: (text) => normalizeGameplayEncounterProposalResponse(text, {
          gameMasterAgentId,
          encounterSeed: input.encounterSeed,
          narrativeState: input.narrativeState,
        }),
        buildRepairedDiagnostics: (diagnostics, repairText) => repairedGenerationDiagnostics(
          diagnostics,
          repairText,
          proposalResponseFlags(repairText)
        ),
        buildRepairCollectionFailureDiagnostics: (diagnostics, repairText) => repairTransportFailureDiagnostics(
          diagnostics,
          repairText,
          'repair_transport_error',
          'repair_collect',
          proposalResponseFlags(repairText)
        ),
        buildRepairValidationFailureDiagnostics: (diagnostics, repairText, repairError) => {
          const repairGenerationError = toEncounterProposalGenerationError(repairError)
          return repairValidationFailureDiagnostics(
            diagnostics,
            repairText,
            repairGenerationError.diagnostics.initialErrorCategory ?? 'validation_error',
            proposalResponseFlags(repairText)
          )
        },
        createRepairCollectionError: ({ diagnostics, cause }) => new GameMasterGameplayEncounterProposalGenerationError(
          'Gameplay encounter proposal repair failed during Official ElizaOS transport',
          diagnostics,
          { cause }
        ),
        createRepairValidationError: ({ diagnostics, cause }) => new GameMasterGameplayEncounterProposalGenerationError(
          `Gameplay encounter proposal repair failed (initial: ${diagnostics.initialErrorCategory ?? 'validation_error'}, repair: ${diagnostics.repairErrorCategory ?? 'validation_error'})`,
          diagnostics,
          { cause }
        ),
      })
    } catch (error) {
      if (error instanceof GameMasterGameplayEncounterProposalGenerationError) {
        const fallback = seededEncounterProposalFallback(
          input,
          error.diagnostics,
          error.diagnostics.repairResponseLength ?? error.diagnostics.initialResponseLength ?? collectedText.length
        )
        if (fallback) return fallback
      }
      throw error
    }

    return attachProposalGenerationDiagnostics(result.output, result.diagnostics, result.responseText.length)
  }

  async generateOutcomeNarration(input: GenerateGameplayOutcomeNarrationInput): Promise<GameplayOutcomeNarrationOutput> {
    const gameMasterAgentId = input.gameMasterAgentId.trim()
    if (!gameMasterAgentId) throw new Error('Gameplay outcome narration requires a game-master agent id')

    const sessionMetadata = {
      source: 'wagdie-location-room-gameplay-gm-outcome',
      roomId: input.room.id,
      locationId: input.room.locationId,
      tickId: input.tick.id,
      encounterId: input.encounterBefore.id,
      turnId: input.turn.id,
    }

    let collectedText = ''
    try {
      await this.messaging.startAgent(gameMasterAgentId)
      const collected = await sendAndCollectOfficialEphemeralSessionMessage(this.messaging, {
        session: {
          agentId: gameMasterAgentId,
          userId: input.room.officialUserId,
          metadata: sessionMetadata,
        },
        message: {
          content: buildGameplayOutcomeNarrationPrompt(input),
          transport: 'http',
          metadata: sessionMetadata,
        },
        logContext: sessionMetadata,
      })
      collectedText = collected.text
    } catch (transportError) {
      const diagnostics: GameplayOutcomeGenerationDiagnostics = {
        status: 'repair_failed',
        repairAttempted: false,
        repaired: false,
        initialErrorCategory: 'transport_error',
        transportStage: 'initial_collect',
      }
      throw new GameMasterGameplayOutcomeGenerationError(
        'Gameplay outcome narration failed during Official ElizaOS transport',
        diagnostics,
        { cause: transportError }
      )
    }

    const result = await runGenerationRepair<GameplayOutcomeNarrationOutput, GameplayOutcomeGenerationDiagnostics>({
      initialText: collectedText,
      parseInitial: (text) => requireValidatedOutcomeNarration(text, input, gameMasterAgentId),
      buildAcceptedDiagnostics: (text) => acceptedGenerationDiagnostics(text, responseFlags(text)),
      buildInitialFailureDiagnostics: diagnosticsForOutcomeInitialFailure,
      collectRepairText: async (diagnostics) => {
        const repairMetadata = {
          ...sessionMetadata,
          source: 'wagdie-location-room-gameplay-gm-outcome-repair',
          repairAttempted: true,
          initialErrorCategory: diagnostics.initialErrorCategory,
        }
        const repaired = await sendAndCollectOfficialEphemeralSessionMessage(this.messaging, {
          session: {
            agentId: gameMasterAgentId,
            userId: input.room.officialUserId,
            metadata: repairMetadata,
          },
          message: {
            content: buildGameplayOutcomeNarrationRepairPrompt(input, diagnostics),
            transport: 'http',
            metadata: repairMetadata,
          },
          logContext: repairMetadata,
        })
        return repaired.text
      },
      parseRepair: (text) => requireValidatedOutcomeNarration(text, input, gameMasterAgentId),
      buildRepairedDiagnostics: (diagnostics, repairText) => repairedGenerationDiagnostics(
        diagnostics,
        repairText,
        responseFlags(repairText)
      ),
      buildRepairCollectionFailureDiagnostics: (diagnostics, repairText) => repairTransportFailureDiagnostics(
        diagnostics,
        repairText,
        'repair_transport_error',
        'repair_collect',
        responseFlags(repairText)
      ),
      buildRepairValidationFailureDiagnostics: (diagnostics, repairText, repairError) => repairValidationFailureDiagnostics(
        diagnostics,
        repairText,
        categorizeOutcomeNarrationError(repairError),
        responseFlags(repairText)
      ),
      createRepairCollectionError: ({ diagnostics, cause }) => new GameMasterGameplayOutcomeGenerationError(
        `Gameplay outcome narration repair failed (initial: ${diagnostics.initialErrorCategory}, repair: ${diagnostics.repairErrorCategory})`,
        diagnostics,
        { cause }
      ),
      createRepairValidationError: ({ diagnostics, cause }) => new GameMasterGameplayOutcomeGenerationError(
        `Gameplay outcome narration repair failed (initial: ${diagnostics.initialErrorCategory}, repair: ${diagnostics.repairErrorCategory})`,
        diagnostics,
        { cause }
      ),
    })

    return attachOutcomeGenerationDiagnostics(result.output, result.diagnostics, result.responseText.length)
  }
}

export const GAMEPLAY_GAME_MASTER_AUTHOR_NAME = 'Game Master'
export const officialGameMasterGameplayGenerator = new OfficialGameMasterGameplayGenerator()
