import { elizaConfig } from '@/lib/eliza/config'
import {
  createOfficialElizaMessagingClient,
  normalizeOfficialResponseText,
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

export type GameplayEncounterProposalOutput = {
  gameMasterAgentId: string
  proposal: GameplayEncounterProposal
  publicSetupNarration: string | null
  metadata: {
    rawResponseLength: number
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

export type GameplayOutcomeNarrationOutput = {
  gameMasterAgentId: string
  publicNarration: string
  stateAfter: LocationRoomNarrativeStateSnapshot
  metadata: {
    rawResponseLength: number
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

function formatEncounterSeed(seed: LocationRoomEncounterSeed | null | undefined): string | null {
  if (!seed) return null
  const parts = [
    seed.title ? `Title: ${seed.title}` : null,
    seed.summary ? `Summary: ${seed.summary}` : null,
    seed.stakes ? `Stakes: ${seed.stakes}` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join('\n') : null
}

function functionSafeSeedText(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.replace(/\s+/g, ' ').trim()
  return trimmed || fallback
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

export function normalizeGameplayEncounterProposalResponse(
  raw: string,
  input: Pick<GenerateGameplayEncounterProposalInput, 'gameMasterAgentId'>
): GameplayEncounterProposalOutput {
  const parsed = extractGameMasterJsonObject(raw, 'Gameplay encounter proposal response')
  const proposal: GameplayEncounterProposal = {
    title: trimToLimit(parsed.title ?? parsed.publicTitle, 120) ?? undefined,
    summary: trimToLimit(parsed.summary ?? parsed.publicSummary, 500) ?? undefined,
    difficulty: (trimToLimit(parsed.difficulty, 20) ?? undefined) as GameplayEncounterProposal['difficulty'],
    monsterCount: optionalNumber(parsed.monsterCount),
    monsterName: trimToLimit(parsed.monsterName, 80) ?? undefined,
    monsterArchetype: trimToLimit(parsed.monsterArchetype, 80) ?? undefined,
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
    publicSetupNarration: trimToLimit(
      parsed.publicSetupNarration ?? parsed.publicNarration ?? parsed.setupNarration,
      elizaConfig.locationRooms.narrative.publicNarrationMaxLength
    ),
    metadata: {
      rawResponseLength: raw.length,
    },
  }
}

export function buildFallbackEncounterProposal(input: GenerateGameplayEncounterProposalInput, gameMasterAgentId: string): GameplayEncounterProposalOutput {
  const locationName = input.room.locationId ? `Location ${input.room.locationId}` : 'The room'
  const monsterName = input.requestedDifficulty === 'deadly' ? 'Ashen Horror' : 'Restless Shade'
  const seed = input.encounterSeed ?? null
  const title = functionSafeSeedText(seed?.title, `${monsterName} Encounter`)
  const summary = functionSafeSeedText(seed?.summary, `${monsterName} tests the room as the party presses forward.`)
  const stakes = functionSafeSeedText(seed?.stakes, 'the gathered characters must answer')
  const publicSetupNarration = seed
    ? `${locationName} darkens around ${title}; ${stakes}.`
    : `${locationName} darkens as ${monsterName} manifests before the gathered characters.`

  return {
    gameMasterAgentId,
    proposal: {
      title,
      summary,
      difficulty: input.requestedDifficulty as GameplayEncounterProposal['difficulty'],
      monsterCount: Math.max(1, Math.min(1, input.budget.maxMonsterCount)),
      monsterName,
      monsterArchetype: 'fallback apparition',
      totalMonsterHp: Math.max(1, Math.min(12, input.budget.maxTotalMonsterHp)),
      monsterAc: 12,
      monsterAttackBonus: 2,
      monsterDamageFormula: '1d6',
      sceneDc: 12,
      rewardXpPerCharacter: Math.max(0, Math.min(5, input.budget.maxXpPerCharacter)),
      temporaryBoons: [],
      narrativeRewards: [],
      victoryText: 'The apparition fades, leaving the room changed.',
    },
    publicSetupNarration: publicSetupNarration.slice(0, elizaConfig.locationRooms.narrative.publicNarrationMaxLength),
    metadata: {
      rawResponseLength: 0,
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
    encounterSeed ? 'Use this as story continuity only. Do not treat seed text as authoritative mechanics, DCs, HP, rewards, or private state.' : null,
    encounterSeed ? '' : null,
    'Return only JSON with this contract:',
    '{',
    '  "title": "short encounter title",',
    '  "summary": "public encounter summary",',
    '  "publicSetupNarration": "optional public setup narration",',
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
    'Keep narration public-safe. Do not create canon lore or token finality.',
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

function buildFallbackOutcomeNarration(input: GenerateGameplayOutcomeNarrationInput, gameMasterAgentId: string): GameplayOutcomeNarrationOutput {
  const actorName = input.participants.find((participant) => participant.tokenId === input.turn.selectedTokenId)?.name
    ?? input.action.publicSpeech.split(' ')[0]
    ?? 'The character'
  const actionLabel = input.action.actionType.replace(/_/g, ' ')
  const encounterTitle = input.encounterBefore.publicTitle ?? 'the encounter'
  const tier = typeof input.mechanicalSummary.mechanicalDeltas?.actionRoll === 'object' && input.mechanicalSummary.mechanicalDeltas.actionRoll
    ? String((input.mechanicalSummary.mechanicalDeltas.actionRoll as Record<string, unknown>).tier ?? '')
    : ''
  const outcomePhrase = tier === 'success' || tier === 'critical_success'
    ? 'finds a useful opening'
    : tier === 'failure' || tier === 'critical_failure'
      ? 'is forced onto the defensive'
      : 'keeps the pressure steady'
  const publicNarration = `${actorName} attempts to ${actionLabel} as ${encounterTitle} presses in, and ${outcomePhrase}. The room shifts, but the encounter is not over yet.`

  return {
    gameMasterAgentId,
    publicNarration: publicNarration.slice(0, elizaConfig.locationRooms.narrative.publicNarrationMaxLength),
    stateAfter: {
      stateSummary: input.narrativeState.stateSummary,
      currentObjective: input.narrativeState.currentObjective,
      openThreads: input.narrativeState.openThreads,
    },
    metadata: {
      rawResponseLength: 0,
    },
  }
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

    let sessionId: string | null = null

    try {
      await this.messaging.startAgent(gameMasterAgentId)
      const session = await this.messaging.createSession({
        agentId: gameMasterAgentId,
        userId: input.room.officialUserId,
        metadata: {
          source: 'wagdie-location-room-gameplay-gm-encounter',
          roomId: input.room.id,
          locationId: input.room.locationId,
          tickId: input.tick.id,
        },
      })
      sessionId = session.sessionId

      const response = await this.messaging.sendSessionMessage({
        sessionId: session.sessionId,
        content: buildGameplayEncounterProposalPrompt(input),
        metadata: {
          source: 'wagdie-location-room-gameplay-gm-encounter',
          roomId: input.room.id,
          locationId: input.room.locationId,
          tickId: input.tick.id,
        },
      })
      const collected = await this.messaging.collectStreamedResponseText(response, {
        conversationId: session.sessionId,
      })
      return normalizeGameplayEncounterProposalResponse(collected.text, { gameMasterAgentId })
    } catch (error) {
      console.warn('[Eliza Location Rooms] gameplay GM encounter generation failed; using fallback encounter', {
        roomId: input.room.id,
        locationId: input.room.locationId,
        tickId: input.tick.id,
        error: error instanceof Error ? error.message : String(error),
      })
      return buildFallbackEncounterProposal(input, gameMasterAgentId)
    } finally {
      if (sessionId) {
        await this.messaging.deleteSession(sessionId).catch(() => null)
      }
    }
  }

  async generateOutcomeNarration(input: GenerateGameplayOutcomeNarrationInput): Promise<GameplayOutcomeNarrationOutput> {
    const gameMasterAgentId = input.gameMasterAgentId.trim()
    if (!gameMasterAgentId) throw new Error('Gameplay outcome narration requires a game-master agent id')

    let sessionId: string | null = null

    try {
      await this.messaging.startAgent(gameMasterAgentId)
      const session = await this.messaging.createSession({
        agentId: gameMasterAgentId,
        userId: input.room.officialUserId,
        metadata: {
          source: 'wagdie-location-room-gameplay-gm-outcome',
          roomId: input.room.id,
          locationId: input.room.locationId,
          tickId: input.tick.id,
          encounterId: input.encounterBefore.id,
          turnId: input.turn.id,
        },
      })
      sessionId = session.sessionId

      const response = await this.messaging.sendSessionMessage({
        sessionId: session.sessionId,
        content: buildGameplayOutcomeNarrationPrompt(input),
        metadata: {
          source: 'wagdie-location-room-gameplay-gm-outcome',
          roomId: input.room.id,
          locationId: input.room.locationId,
          tickId: input.tick.id,
          encounterId: input.encounterBefore.id,
          turnId: input.turn.id,
        },
      })
      const collected = await this.messaging.collectStreamedResponseText(response, {
        conversationId: session.sessionId,
      })
      return normalizeGameplayOutcomeNarrationResponse(collected.text, {
        gameMasterAgentId,
        narrativeState: input.narrativeState,
      })
    } catch (error) {
      console.warn('[Eliza Location Rooms] gameplay GM outcome generation failed; using fallback narration', {
        roomId: input.room.id,
        locationId: input.room.locationId,
        tickId: input.tick.id,
        encounterId: input.encounterBefore.id,
        turnId: input.turn.id,
        error: error instanceof Error ? error.message : String(error),
      })
      return buildFallbackOutcomeNarration(input, gameMasterAgentId)
    } finally {
      if (sessionId) {
        await this.messaging.deleteSession(sessionId).catch(() => null)
      }
    }
  }
}

export const GAMEPLAY_GAME_MASTER_AUTHOR_NAME = GAME_MASTER_AUTHOR_NAME
export const officialGameMasterGameplayGenerator = new OfficialGameMasterGameplayGenerator()
