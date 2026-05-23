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
  LocationRoomMessage,
  LocationRoomParticipant,
  LocationRoomTick,
} from '../types'
import type {
  LocationRoomNarrativeState,
  LocationRoomNarrativeStateSnapshot,
} from '../narrativeTypes'
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
    facts.push(
      `Action roll used backend stat-aware ${String(modifierBreakdown.actionType ?? 'action')} context (${primaryStats}); total modifier ${String(modifierBreakdown.totalModifier ?? 'unknown')}.`
    )
  } else if (modifierBreakdown?.mode === 'legacy_fixed') {
    facts.push('Action roll used legacy fixed backend modifiers; no stat sheet authority was delegated to the GM.')
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
  return [
    'You are the private game master for a public WAGDIE location-room gameplay encounter.',
    'Propose encounter flavor and rewards. The backend will clamp all numeric mechanics; do not assume your numbers are authoritative.',
    '',
    `Room id: ${input.room.id}`,
    `Location id: ${input.room.locationId}`,
    `Tick id: ${input.tick.id}`,
    `Requested difficulty: ${input.requestedDifficulty}`,
    `Budget: partySize=${input.budget.partySize}, maxMonsterCount=${input.budget.maxMonsterCount}, maxTotalMonsterHp=${input.budget.maxTotalMonsterHp}, maxXpPerCharacter=${input.budget.maxXpPerCharacter}`,
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
    '  "rewardXpPerCharacter": 10,',
    '  "temporaryBoons": ["short boon"],',
    '  "narrativeRewards": ["short reward"],',
    '  "victoryText": "public victory text"',
    '}',
    '',
    'Keep narration public-safe. Do not create canon lore or token finality.',
  ].join('\n')
}

export function buildGameplayOutcomeNarrationPrompt(input: GenerateGameplayOutcomeNarrationInput): string {
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

    try {
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
    } finally {
      await this.messaging.deleteSession(session.sessionId).catch(() => null)
    }
  }

  async generateOutcomeNarration(input: GenerateGameplayOutcomeNarrationInput): Promise<GameplayOutcomeNarrationOutput> {
    const gameMasterAgentId = input.gameMasterAgentId.trim()
    if (!gameMasterAgentId) throw new Error('Gameplay outcome narration requires a game-master agent id')

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

    try {
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
    } finally {
      await this.messaging.deleteSession(session.sessionId).catch(() => null)
    }
  }
}

export const GAMEPLAY_GAME_MASTER_AUTHOR_NAME = GAME_MASTER_AUTHOR_NAME
export const officialGameMasterGameplayGenerator = new OfficialGameMasterGameplayGenerator()
