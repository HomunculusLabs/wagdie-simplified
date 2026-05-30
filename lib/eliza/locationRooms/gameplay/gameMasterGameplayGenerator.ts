import { elizaConfig } from '@/lib/eliza/config'
import {
  createOfficialElizaMessagingClient,
  normalizeOfficialResponseText,
  sendAndCollectOfficialEphemeralSessionMessage,
  type OfficialElizaMessagingClient,
} from '@/lib/eliza/official/messaging'
import {
  GAME_MASTER_AUTHOR_NAME,
  extractGameMasterJsonObject,
} from '../gameMasterGenerator'
import type {
  LocationRoom,
  LocationRoomEncounterSeed,
  LocationRoomMessage,
  LocationRoomParticipant,
  LocationRoomTick,
} from '../types'
import type {
  LocationRoomNarrativeState,
  LocationRoomNarrativeStateSnapshot,
} from '../narrativeTypes'
import { GAMEPLAY_CHECK_TYPES } from './types'
import type {
  GameplayActionEnvelope,
  GameplayDiceRollResult,
  GameplayEncounter,
  GameplayMonsterState,
  GameplayRoomState,
  GameplayTurn,
} from './types'
import type { GameplayEncounterProposal } from './rules'

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

export type GameplayEncounterProposalGenerationResponseFlags = {
  empty: boolean
  hasJsonObject: boolean
  fencedJson: boolean
  startsWithJsonObject: boolean
}

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

export type GameplayOutcomeGenerationResponseFlags = {
  empty: boolean
  hasJsonObject: boolean
  fencedJson: boolean
  startsWithJsonObject: boolean
}

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
  const normalized = normalizeOfficialResponseText(value)
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
  const text = normalizeOfficialResponseText(raw)
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
  if (/weak|generic|consequence|filler/i.test(message)) return 'weak_narration'
  return 'validation_error'
}

function diagnosticsForOutcomeInitialFailure(
  raw: string,
  error: unknown
): GameplayOutcomeGenerationDiagnostics {
  return {
    status: 'repair_failed',
    repairAttempted: true,
    repaired: false,
    initialErrorCategory: categorizeOutcomeNarrationError(error),
    initialResponseLength: raw.length,
    initialResponseFlags: responseFlags(raw),
  }
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

export function validateGameplayOutcomeNarrationQuality(
  output: GameplayOutcomeNarrationOutput,
  input: GenerateGameplayOutcomeNarrationInput
): { ok: true } | { ok: false; error: string } {
  const narration = output.publicNarration.replace(/\s+/g, ' ').trim()
  if (!narration) return { ok: false, error: 'Gameplay outcome narration is empty' }

  const lower = narration.toLowerCase()
  const deltas = input.mechanicalSummary.mechanicalDeltas as Record<string, unknown>
  const actionRoll = isRecord(deltas.actionRoll) ? deltas.actionRoll : null
  const actionDamage = isRecord(deltas.actionDamage) ? deltas.actionDamage : null
  const healing = isRecord(deltas.healing) ? deltas.healing : null
  const retaliation = isRecord(deltas.monsterRetaliation) ? deltas.monsterRetaliation : null
  const actorName = participantNameByTokenId(input.participants, input.turn.selectedTokenId)
  const targetMonsterName = selectedOutcomeMonsterName(input)
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
  const encounterStatusAfter = input.mechanicalSummary.encounterStatusAfter || input.encounterAfter.status
  const terminal = encounterStatusAfter !== 'active' || input.encounterAfter.status !== 'active'
  const deaths = input.mechanicalSummary.deaths.length > 0
  const victory = encounterStatusAfter === 'victory' || input.encounterAfter.status === 'victory'
  const fled = encounterStatusAfter === 'fled' || input.encounterAfter.status === 'fled'
  const defeat = encounterStatusAfter === 'defeat' || input.encounterAfter.status === 'defeat'

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
  if (/^a threat (gathers|emerges)\b/.test(normalized)) return 'default public setup or summary'
  if (/^the room (darkens|shifts)\b/.test(normalized)) return 'generic room setup'
  return null
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
  return {
    status: 'repair_failed',
    repairAttempted: true,
    repaired: false,
    initialErrorCategory: categorizeEncounterProposalError(error),
    initialResponseLength: raw.length,
    initialResponseFlags: proposalResponseFlags(raw),
  }
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
    encounterSeed ? 'Prefer seed source, catalog entry ids, encounter hints, and monster hints before inventing generic encounter flavor.' : null,
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
    '- Contextual checks are optional and must use allowed check types only.',
  ].filter((line): line is string => line !== null).join('\n')
}

export function normalizeGameplayEncounterProposalResponse(
  raw: string,
  input: Pick<GenerateGameplayEncounterProposalInput, 'gameMasterAgentId'>
): GameplayEncounterProposalOutput {
  const parsed = extractGameMasterJsonObject(raw, 'Gameplay encounter proposal response')
  const title = requireEncounterPublicText(trimToLimit(parsed.title ?? parsed.publicTitle, 120), 'title')
  const summary = requireEncounterPublicText(trimToLimit(parsed.summary ?? parsed.publicSummary, 500), 'summary')
  const monsterName = requireEncounterPublicText(trimToLimit(parsed.monsterName, 80), 'monsterName')
  const monsterArchetype = requireEncounterPublicText(trimToLimit(parsed.monsterArchetype, 80), 'monsterArchetype')
  const publicSetupNarration = requireEncounterPublicText(trimToLimit(
    parsed.publicSetupNarration ?? parsed.publicNarration ?? parsed.setupNarration,
    elizaConfig.locationRooms.narrative.publicNarrationMaxLength
  ), 'publicSetupNarration')

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
    victoryText: trimToLimit(parsed.victoryText, 240) ?? undefined,
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
  const parsed = extractGameMasterJsonObject(raw, 'Gameplay outcome narration response')
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
    encounterSeed ? 'Prefer seed source, catalog entry ids, encounter hints, and monster hints before inventing generic encounter flavor. Treat hints as public-safe inspiration only.' : null,
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
    'Do not use fallback/default copy such as "A dreadful encounter", "A threat gathers in the room", "A threat emerges in the room", "WAGDIE horror", "lurking threat", "fallback apparition", "Ashen Horror", or "Restless Shade".',
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

    try {
      const output = normalizeGameplayEncounterProposalResponse(collectedText, { gameMasterAgentId })
      return attachProposalGenerationDiagnostics(output, {
        status: 'accepted',
        repairAttempted: false,
        repaired: false,
        initialResponseLength: collectedText.length,
        initialResponseFlags: proposalResponseFlags(collectedText),
      }, collectedText.length)
    } catch (initialError) {
      const diagnostics = diagnosticsForProposalInitialFailure(collectedText, initialError)
      let repairText = ''

      try {
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
        repairText = repaired.text
      } catch (repairTransportError) {
        throw new GameMasterGameplayEncounterProposalGenerationError(
          'Gameplay encounter proposal repair failed during Official ElizaOS transport',
          {
            ...diagnostics,
            status: 'repair_failed',
            repairAttempted: true,
            repaired: false,
            repairErrorCategory: 'repair_transport_error',
            transportStage: 'repair_collect',
            repairResponseLength: repairText.length,
            repairResponseFlags: proposalResponseFlags(repairText),
          },
          { cause: repairTransportError }
        )
      }

      try {
        const repairedOutput = normalizeGameplayEncounterProposalResponse(repairText, { gameMasterAgentId })
        return attachProposalGenerationDiagnostics(repairedOutput, {
          ...diagnostics,
          status: 'repaired',
          repairAttempted: true,
          repaired: true,
          repairResponseLength: repairText.length,
          repairResponseFlags: proposalResponseFlags(repairText),
        }, repairText.length)
      } catch (repairError) {
        const repairGenerationError = toEncounterProposalGenerationError(repairError)
        throw new GameMasterGameplayEncounterProposalGenerationError(
          `Gameplay encounter proposal repair failed (initial: ${diagnostics.initialErrorCategory ?? 'validation_error'}, repair: ${repairGenerationError.diagnostics.initialErrorCategory ?? 'validation_error'})`,
          {
            ...diagnostics,
            status: 'repair_failed',
            repairAttempted: true,
            repaired: false,
            repairErrorCategory: repairGenerationError.diagnostics.initialErrorCategory ?? 'validation_error',
            repairResponseLength: repairText.length,
            repairResponseFlags: proposalResponseFlags(repairText),
          },
          { cause: repairError }
        )
      }
    }
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

    try {
      const output = requireValidatedOutcomeNarration(collectedText, input, gameMasterAgentId)
      return attachOutcomeGenerationDiagnostics(output, {
        status: 'accepted',
        repairAttempted: false,
        repaired: false,
        initialResponseLength: collectedText.length,
        initialResponseFlags: responseFlags(collectedText),
      }, collectedText.length)
    } catch (initialError) {
      const diagnostics = diagnosticsForOutcomeInitialFailure(collectedText, initialError)
      let repairText = ''

      try {
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
        repairText = repaired.text
      } catch (repairTransportError) {
        const failedDiagnostics: GameplayOutcomeGenerationDiagnostics = {
          ...diagnostics,
          status: 'repair_failed',
          repairAttempted: true,
          repaired: false,
          repairErrorCategory: 'repair_transport_error',
          transportStage: 'repair_collect',
          repairResponseLength: repairText.length,
          repairResponseFlags: responseFlags(repairText),
        }
        throw new GameMasterGameplayOutcomeGenerationError(
          `Gameplay outcome narration repair failed (initial: ${failedDiagnostics.initialErrorCategory}, repair: ${failedDiagnostics.repairErrorCategory})`,
          failedDiagnostics,
          { cause: repairTransportError }
        )
      }

      try {
        const output = requireValidatedOutcomeNarration(repairText, input, gameMasterAgentId)
        return attachOutcomeGenerationDiagnostics(output, {
          ...diagnostics,
          status: 'repaired',
          repairAttempted: true,
          repaired: true,
          repairResponseLength: repairText.length,
          repairResponseFlags: responseFlags(repairText),
        }, repairText.length)
      } catch (repairError) {
        const failedDiagnostics: GameplayOutcomeGenerationDiagnostics = {
          ...diagnostics,
          status: 'repair_failed',
          repairAttempted: true,
          repaired: false,
          repairErrorCategory: categorizeOutcomeNarrationError(repairError),
          repairResponseLength: repairText.length,
          repairResponseFlags: responseFlags(repairText),
        }
        throw new GameMasterGameplayOutcomeGenerationError(
          `Gameplay outcome narration repair failed (initial: ${failedDiagnostics.initialErrorCategory}, repair: ${failedDiagnostics.repairErrorCategory})`,
          failedDiagnostics,
          { cause: repairError }
        )
      }
    }
  }
}

export const GAMEPLAY_GAME_MASTER_AUTHOR_NAME = GAME_MASTER_AUTHOR_NAME
export const officialGameMasterGameplayGenerator = new OfficialGameMasterGameplayGenerator()
