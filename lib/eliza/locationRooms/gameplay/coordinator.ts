import { elizaConfig } from '@/lib/eliza/config'
import {
  GAMEPLAY_GAME_MASTER_AUTHOR_NAME,
  GameMasterGameplayEncounterProposalGenerationError,
  GameMasterGameplayOutcomeGenerationError,
  formatPublicGameplayRollSummary,
  officialGameMasterGameplayGenerator,
  type GameplayEncounterProposalGenerationDiagnostics,
  type GameplayMechanicalOutcomeSummary,
  type GameplayOutcomeGenerationDiagnostics,
  type GameMasterGameplayGenerator,
} from './gameMasterGameplayGenerator'
import { projectPublicGameplayRolls } from './publicRolls'
import {
  GameplayActionGenerationError,
  officialGameplayActionGenerator,
  type GameplayActionGenerationDiagnostics,
  type GameplayActionGenerator,
} from './actionGenerator'
import {
  locationRoomGameplayRepository,
  sanitizeGameplayStoredError,
  type LocationRoomGameplayRepository,
} from './repository'
import {
  gameplayCharacterSheetResolver,
  type GameplayCharacterSheet,
  type GameplayCharacterSheetResolver,
} from './characterSheetResolver'
import { resolveGameplayModifiers } from './modifiers'
import { updateGameplayPerformanceCountersFromTurn } from './performance'
import {
  calculateGameplayDeathRewardClaim,
  resolveRewardClaimBeneficiary,
} from './rewardClaims'
import {
  normalizeEncounterProposal,
  parseGameplayContextualChecks,
  parseGameplayMonsters,
  resolveGameplayTurnMechanics,
  validateGameplayActionEnvelope,
  type GameplayActionValidationContext,
  type GameplayTurnMechanicalDeltas,
  type ResolveGameplayTurnMechanicsResult,
} from './rules'
import { defaultGameplayPerformanceCounters } from './types'
import type {
  GameplayActionEnvelope,
  GameplayCharacterState,
  GameplayCharacterStateMap,
  GameplayEncounter,
  GameplayRoomState,
  GameplayTurn,
} from './types'
import {
  locationRoomNarrativeRepository,
  type LocationRoomNarrativeRepository,
} from '../narrativeRepository'
import {
  mergeNarrativeTtrpgMetadata,
} from '../narrativeTypes'
import type { GameMasterAgentResolver } from '../narrativeCoordinator'
import {
  locationRoomRepository,
  type LocationRoomRepository,
} from '../repository'
import { selectLocationRoomSpeaker } from '../speakerSelection'
import type {
  LocationRoom,
  LocationRoomEncounterSeed,
  LocationRoomMessage,
  LocationRoomParticipant,
  LocationRoomTick,
} from '../types'

const DEFAULT_CHARACTER_MAX_HP = 10
const GAMEPLAY_SOURCE = 'location-room-gameplay'

const defaultGameMasterAgentResolver: GameMasterAgentResolver = {
  async resolveRuntimeGameMasterAgentId(): Promise<string> {
    const { gameMasterAgentService } = await import('@/lib/eliza/gameMasterAgent/service')
    return gameMasterAgentService.resolveRuntimeGameMasterAgentId()
  },
}

export type LocationRoomGameplayEncounterTrigger = {
  source: 'narrative' | 'admin'
  triggerId: string
  narrativeBeatId?: string | null
  encounterSeed?: LocationRoomEncounterSeed | null
  speakerInstruction?: string | null
}

export type ProcessGameplayLocationRoomTurnInput = {
  room: LocationRoom
  tick: LocationRoomTick
  participants: LocationRoomParticipant[]
  recentMessages: LocationRoomMessage[]
  now: Date
  gameplayRun?: {
    id: string
    targetCompletedTurns: number
  }
  encounterTrigger?: LocationRoomGameplayEncounterTrigger
}

export type ProcessGameplayLocationRoomTurnResult =
  | {
      status: 'completed'
      selectedTokenId: number | null
      messageId?: string
      messageIds: string[]
      encounterStatusAfter?: string
    }
  | {
      status: 'skipped'
      selectedTokenId: null
      reason: string
    }

export interface LocationRoomGameplayCoordinator {
  processTurn(input: ProcessGameplayLocationRoomTurnInput): Promise<ProcessGameplayLocationRoomTurnResult>
  markTickFailed(tickId: string, error: unknown, options?: { dead?: boolean }): Promise<void>
}

type SpeakerSelector = (
  participants: LocationRoomParticipant[],
  recentMessages: LocationRoomMessage[]
) => LocationRoomParticipant

function nowIso(now: Date): string {
  return now.toISOString()
}

function clampInteger(value: unknown, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return min
  return Math.min(max, Math.max(min, Math.round(numeric)))
}

function defaultCharacterState(
  participant: LocationRoomParticipant,
  now: Date,
  sheet?: GameplayCharacterSheet | null
): GameplayCharacterState {
  if (!sheet) {
    return {
      tokenId: participant.tokenId,
      name: participant.name,
      hp: DEFAULT_CHARACTER_MAX_HP,
      maxHp: DEFAULT_CHARACTER_MAX_HP,
      status: 'alive',
      xp: 0,
      temporaryBoons: [],
      wounds: [],
      updatedAt: nowIso(now),
    }
  }

  const resolved = resolveGameplayModifiers(sheet)
  const maxHp = Math.max(1, resolved.effectiveStats.maxHp)
  return {
    tokenId: participant.tokenId,
    name: participant.name || sheet.name,
    hp: clampInteger(sheet.sourceStats.hp, 0, maxHp),
    maxHp,
    status: 'alive',
    xp: 0,
    temporaryBoons: [],
    wounds: [],
    sourceStats: sheet.sourceStats,
    effectiveStats: resolved.effectiveStats,
    equipmentSnapshot: sheet.equipment,
    metadataTraits: sheet.metadataTraits,
    modifierSources: resolved.modifierSources,
    sheetSnapshotAt: sheet.sheetSnapshotAt,
    ownerAddress: sheet.ownerAddress ?? participant.ownerAddress,
    stakerAddress: sheet.stakerAddress ?? participant.stakerAddress,
    performance: defaultGameplayPerformanceCounters(),
    updatedAt: nowIso(now),
  }
}

function applySheetSnapshotToExistingCharacter(
  existing: GameplayCharacterState,
  participant: LocationRoomParticipant,
  sheet: GameplayCharacterSheet,
  now: Date
): GameplayCharacterState {
  const resolved = resolveGameplayModifiers(sheet)
  const maxHp = Math.max(1, resolved.effectiveStats.maxHp)
  const hp = clampInteger(existing.hp, 0, maxHp)

  return {
    ...existing,
    tokenId: participant.tokenId,
    name: participant.name || sheet.name,
    hp,
    maxHp,
    sourceStats: sheet.sourceStats,
    effectiveStats: resolved.effectiveStats,
    equipmentSnapshot: sheet.equipment,
    metadataTraits: sheet.metadataTraits,
    modifierSources: resolved.modifierSources,
    sheetSnapshotAt: sheet.sheetSnapshotAt,
    ownerAddress: sheet.ownerAddress ?? participant.ownerAddress,
    stakerAddress: sheet.stakerAddress ?? participant.stakerAddress,
    performance: existing.performance ?? defaultGameplayPerformanceCounters(),
    updatedAt: nowIso(now),
  }
}

function isPlayableCharacter(character: GameplayCharacterState | undefined): boolean {
  return Boolean(character && character.status !== 'dead' && character.status !== 'fled' && character.hp > 0)
}

async function reconcileCharacters(
  state: GameplayRoomState,
  participants: LocationRoomParticipant[],
  now: Date,
  sheetResolver: GameplayCharacterSheetResolver
): Promise<{ characters: GameplayCharacterStateMap; changed: boolean }> {
  let changed = false
  const characters: GameplayCharacterStateMap = { ...state.characters }
  const shouldRefreshSheets = elizaConfig.locationRooms.gameplay.stats.enabled &&
    elizaConfig.locationRooms.gameplay.stats.refreshSheetOnReconcile
  const sheets = shouldRefreshSheets
    ? await sheetResolver.resolveSheets(participants.map((participant) => participant.tokenId), { now })
    : new Map<number, GameplayCharacterSheet>()

  for (const participant of participants) {
    const key = String(participant.tokenId)
    const existing = characters[key]
    const sheet = sheets.get(participant.tokenId) ?? null
    if (!existing) {
      characters[key] = defaultCharacterState(participant, now, sheet)
      changed = true
      continue
    }

    const next = sheet
      ? applySheetSnapshotToExistingCharacter(existing, participant, sheet, now)
      : existing.name !== participant.name
        ? {
            ...existing,
            name: participant.name,
            updatedAt: nowIso(now),
          }
        : existing

    if (JSON.stringify(next) !== JSON.stringify(existing)) {
      characters[key] = next
      changed = true
    }
  }

  return { characters, changed }
}

function livingParticipants(
  participants: LocationRoomParticipant[],
  state: GameplayRoomState
): LocationRoomParticipant[] {
  return participants.filter((participant) => isPlayableCharacter(state.characters[String(participant.tokenId)]))
}

function filterCharactersToParticipants(
  characters: GameplayCharacterStateMap,
  participants: LocationRoomParticipant[]
): GameplayCharacterStateMap {
  const participantIds = new Set(participants.map((participant) => participant.tokenId))
  return Object.fromEntries(
    Object.entries(characters).filter(([, character]) => participantIds.has(character.tokenId))
  )
}

function coerceGameplayAction(value: Record<string, unknown>, context: GameplayActionValidationContext): GameplayActionEnvelope | null {
  const validated = validateGameplayActionEnvelope(value, context)

  return validated.ok ? validated.action : null
}

function hasStoredMechanics(turn: GameplayTurn): boolean {
  return Boolean(
    turn.mechanicalDeltas &&
    typeof turn.mechanicalDeltas === 'object' &&
    Object.keys(turn.mechanicalDeltas).length > 0 &&
    Array.isArray((turn.mechanicalDeltas as { deaths?: unknown }).deaths)
  )
}

function mechanicalDeltasFromTurn(turn: GameplayTurn): GameplayTurnMechanicalDeltas {
  return turn.mechanicalDeltas as unknown as GameplayTurnMechanicalDeltas
}

function messageIdsWith(existing: string[], id: string): string[] {
  return existing.includes(id) ? existing : [...existing, id]
}

function rollCardContent(publicRolls: ReturnType<typeof projectPublicGameplayRolls>): string {
  const action = publicRolls?.action
  const checkLabel = action?.checkLabel?.trim() || action?.checkType?.replace(/_/g, ' ') || action?.actionType?.replace(/_/g, ' ')
  const total = typeof action?.total === 'number' ? ` total ${action.total}` : null
  const dc = typeof action?.dc === 'number' ? ` vs DC ${action.dc}` : null
  const outcome = action?.outcome && action.outcome !== 'unknown'
    ? ` — ${action.outcome.replace(/_/g, ' ')}`
    : null

  return [
    checkLabel ? `The ${checkLabel} check resolves` : 'The roll resolves',
    total,
    dc,
    outcome,
  ].filter(Boolean).join('') + '.'
}

function terminalEncounterNarration(status: string, encounter: GameplayEncounter): string {
  const title = encounter.publicTitle?.trim() || 'The encounter'
  if (status === 'fled') {
    return `${title} ends in retreat. The room falls into aftermath as the survivors scatter from the threat.`
  }

  return `${title} ends in defeat. The room falls silent, and the Game Master marks the aftermath of the fallen party.`
}

function activeMonsterIds(encounter: GameplayEncounter): string[] {
  return parseGameplayMonsters(encounter.monsterState)
    .filter((monster) => monster.status === 'alive' && monster.hp > 0)
    .map((monster) => monster.id)
}

function terminalCompletedAt(status: string, now: Date): string | null | undefined {
  return status === 'active' ? null : nowIso(now)
}

function isValidEncounterTrigger(
  trigger: LocationRoomGameplayEncounterTrigger | null | undefined
): trigger is LocationRoomGameplayEncounterTrigger {
  return Boolean(
    trigger &&
    (trigger.source === 'narrative' || trigger.source === 'admin') &&
    typeof trigger.triggerId === 'string' &&
    trigger.triggerId.trim().length > 0
  )
}

function triggerSpeakerInstruction(
  trigger: LocationRoomGameplayEncounterTrigger | null | undefined,
  encounter: GameplayEncounter
): string | null {
  if (typeof trigger?.speakerInstruction === 'string' && trigger.speakerInstruction.trim()) {
    return trigger.speakerInstruction.trim()
  }
  const stored = encounter.metadata.triggerSpeakerInstruction
  return typeof stored === 'string' && stored.trim() ? stored.trim() : null
}

type UnexpectedGenerationFailureDiagnostics = {
  status: 'repair_failed'
  repairAttempted: false
  repaired: false
  initialErrorCategory: 'unexpected_error'
}

function unexpectedGenerationFailureDiagnostics(): UnexpectedGenerationFailureDiagnostics {
  return {
    status: 'repair_failed',
    repairAttempted: false,
    repaired: false,
    initialErrorCategory: 'unexpected_error',
  }
}

function safeOutcomeGenerationFailureMetadata(error: unknown): {
  status: 'repair_failed'
  diagnostics: GameplayOutcomeGenerationDiagnostics | UnexpectedGenerationFailureDiagnostics
} {
  if (error instanceof GameMasterGameplayOutcomeGenerationError) {
    return {
      status: 'repair_failed',
      diagnostics: error.diagnostics,
    }
  }

  return {
    status: 'repair_failed',
    diagnostics: unexpectedGenerationFailureDiagnostics(),
  }
}

function safeActionGenerationFailureMetadata(error: unknown): {
  status: 'repair_failed'
  diagnostics: GameplayActionGenerationDiagnostics | UnexpectedGenerationFailureDiagnostics
} {
  if (error instanceof GameplayActionGenerationError) {
    return {
      status: 'repair_failed',
      diagnostics: error.diagnostics,
    }
  }

  return {
    status: 'repair_failed',
    diagnostics: unexpectedGenerationFailureDiagnostics(),
  }
}

function safeEncounterProposalGenerationFailureMetadata(error: unknown): {
  status: 'repair_failed'
  diagnostics: GameplayEncounterProposalGenerationDiagnostics | UnexpectedGenerationFailureDiagnostics
} {
  if (error instanceof GameMasterGameplayEncounterProposalGenerationError) {
    return {
      status: 'repair_failed',
      diagnostics: error.diagnostics,
    }
  }

  return {
    status: 'repair_failed',
    diagnostics: unexpectedGenerationFailureDiagnostics(),
  }
}

function genericGameplaySetupReason(value: string): string | null {
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

function encounterProposalValidationError(
  message: string,
  initialErrorCategory: GameplayEncounterProposalGenerationDiagnostics['initialErrorCategory']
): GameMasterGameplayEncounterProposalGenerationError {
  return new GameMasterGameplayEncounterProposalGenerationError(message, {
    status: 'repair_failed',
    repairAttempted: false,
    repaired: false,
    initialErrorCategory,
  })
}

function requireModelSourcedGameplayText(value: unknown, label: string): string {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  if (!text) {
    throw encounterProposalValidationError(
      `Gameplay encounter ${label} missing model-sourced public text`,
      'missing_required_field'
    )
  }
  const genericReason = genericGameplaySetupReason(text)
  if (genericReason) {
    throw encounterProposalValidationError(
      `Gameplay encounter ${label} used generic fallback copy (${genericReason})`,
      'generic_public_identity'
    )
  }
  return text
}

function requireModelSourcedGameplaySetup(value: unknown): string {
  return requireModelSourcedGameplayText(value, 'setup narration')
}

function requireModelSourcedEncounterProposalIdentity(proposal: {
  title?: unknown
  summary?: unknown
  monsterName?: unknown
  monsterArchetype?: unknown
}): void {
  requireModelSourcedGameplayText(proposal.title, 'title')
  requireModelSourcedGameplayText(proposal.summary, 'summary')
  requireModelSourcedGameplayText(proposal.monsterName, 'monsterName')
  requireModelSourcedGameplayText(proposal.monsterArchetype, 'monsterArchetype')
}

function actionValidationErrorCategory(error: string): GameplayActionGenerationDiagnostics['initialErrorCategory'] {
  if (/target|Attack actions require|Help actions require/i.test(error)) return 'target_constraint'
  if (/roll choice|check type|contextual/i.test(error)) return 'roll_choice_constraint'
  if (/public speech|Unsupported gameplay action type|must be a JSON object/i.test(error)) return 'missing_required_field'
  return 'validation_error'
}

function actionValidationGenerationError(error: string): GameplayActionGenerationError {
  return new GameplayActionGenerationError(`Generated gameplay action failed validation: ${error}`, {
    status: 'repair_failed',
    repairAttempted: false,
    repaired: false,
    initialErrorCategory: actionValidationErrorCategory(error),
  })
}

function rewardClaimSummaryForContext(claim: {
  id: string
  status: string
  performanceScore: number
  policyVersion: string
  lineItems: unknown[]
}) {
  return {
    id: claim.id,
    status: claim.status,
    performanceScore: claim.performanceScore,
    policyVersion: claim.policyVersion,
    lineItems: claim.lineItems,
  }
}

export class DefaultLocationRoomGameplayCoordinator implements LocationRoomGameplayCoordinator {
  constructor(
    private readonly repository: LocationRoomRepository = locationRoomRepository,
    private readonly gameplayRepository: LocationRoomGameplayRepository = locationRoomGameplayRepository,
    private readonly narrativeRepository: LocationRoomNarrativeRepository = locationRoomNarrativeRepository,
    private readonly gameMasterGenerator: GameMasterGameplayGenerator = officialGameMasterGameplayGenerator,
    private readonly actionGenerator: GameplayActionGenerator = officialGameplayActionGenerator,
    private readonly gameMasterAgentResolver: GameMasterAgentResolver = defaultGameMasterAgentResolver,
    private readonly speakerSelector: SpeakerSelector = selectLocationRoomSpeaker,
    private readonly rng: () => number = Math.random,
    private readonly sheetResolver: GameplayCharacterSheetResolver = gameplayCharacterSheetResolver
  ) {}

  async processTurn(input: ProcessGameplayLocationRoomTurnInput): Promise<ProcessGameplayLocationRoomTurnResult> {
    const gameMasterAgentId = await this.gameMasterAgentResolver.resolveRuntimeGameMasterAgentId()
    let narrativeState = await this.narrativeRepository.ensureStateForRoom({ room: input.room })
    const effectiveMaxEncounterRounds = elizaConfig.locationRooms.gameplay.maxEncounterRounds
    let gameplayState = await this.gameplayRepository.ensureStateForRoom({ room: input.room })
    const reconciled = await reconcileCharacters(gameplayState, input.participants, input.now, this.sheetResolver)
    if (reconciled.changed) {
      gameplayState = await this.gameplayRepository.updateState(input.room, {
        characters: reconciled.characters,
        metadata: {
          ...gameplayState.metadata,
          lastReconciledTickId: input.tick.id,
        },
      })
    }

    let turn = await this.gameplayRepository.findTurnByTickId(input.tick.id)
    if (turn?.status === 'completed') {
      return {
        status: 'completed',
        selectedTokenId: turn.selectedTokenId,
        messageId: turn.publicMessageIds[0],
        messageIds: turn.publicMessageIds,
      }
    }

    let encounter = turn?.encounterId
      ? await this.gameplayRepository.findEncounterById(turn.encounterId)
      : await this.gameplayRepository.findActiveEncounterByRoomId(input.room.id)
    let setupNarration: string | null = null
    let createdEncounterThisTick = false

    if (encounter && encounter.status !== 'active' && !turn) {
      encounter = null
    }

    if (!encounter) {
      if (!isValidEncounterTrigger(input.encounterTrigger)) {
        return {
          status: 'skipped',
          selectedTokenId: null,
          reason: 'no_combat_trigger',
        }
      }

      const playableParticipants = livingParticipants(input.participants, gameplayState)
      if (playableParticipants.length < 2) {
        return {
          status: 'skipped',
          selectedTokenId: null,
          reason: 'insufficient_living_gameplay_participants',
        }
      }

      let proposalOutput: Awaited<ReturnType<GameMasterGameplayGenerator['generateEncounterProposal']>>
      let normalized: ReturnType<typeof normalizeEncounterProposal>
      try {
        proposalOutput = await this.gameMasterGenerator.generateEncounterProposal({
          gameMasterAgentId,
          room: input.room,
          tick: input.tick,
          participants: playableParticipants,
          recentMessages: input.recentMessages,
          narrativeState,
          gameplayState,
          encounterSeed: input.encounterTrigger.encounterSeed ?? null,
          requestedDifficulty: elizaConfig.locationRooms.gameplay.defaultDifficulty,
          budget: {
            partySize: playableParticipants.length,
            difficulty: elizaConfig.locationRooms.gameplay.defaultDifficulty,
            maxMonsterCount: elizaConfig.locationRooms.gameplay.monsterBudget.maxMonsterCount,
            maxTotalMonsterHp: elizaConfig.locationRooms.gameplay.monsterBudget.maxTotalMonsterHp,
            maxXpPerCharacter: elizaConfig.locationRooms.gameplay.rewardBudget.maxXpPerCharacter,
            maxTemporaryBoons: elizaConfig.locationRooms.gameplay.rewardBudget.maxTemporaryBoons,
            maxNarrativeRewards: elizaConfig.locationRooms.gameplay.rewardBudget.maxNarrativeRewards,
          },
        })
        requireModelSourcedEncounterProposalIdentity(proposalOutput.proposal)
        normalized = normalizeEncounterProposal(proposalOutput.proposal, {
          partySize: playableParticipants.length,
          averageLevel: 1,
          difficulty: elizaConfig.locationRooms.gameplay.defaultDifficulty,
          maxMonsterCount: elizaConfig.locationRooms.gameplay.monsterBudget.maxMonsterCount,
          maxTotalMonsterHp: elizaConfig.locationRooms.gameplay.monsterBudget.maxTotalMonsterHp,
          maxXpPerCharacter: elizaConfig.locationRooms.gameplay.rewardBudget.maxXpPerCharacter,
          maxTemporaryBoons: elizaConfig.locationRooms.gameplay.rewardBudget.maxTemporaryBoons,
          maxNarrativeRewards: elizaConfig.locationRooms.gameplay.rewardBudget.maxNarrativeRewards,
        })
        setupNarration = requireModelSourcedGameplaySetup(proposalOutput.publicSetupNarration)
      } catch (error) {
        const encounterProposalGenerationFailure = safeEncounterProposalGenerationFailureMetadata(error)
        await this.gameplayRepository.updateState(input.room, {
          metadata: {
            ...gameplayState.metadata,
            encounterProposalGenerationFailure,
          },
        })
        throw error
      }

      encounter = await this.gameplayRepository.createActiveEncounter({
        room: input.room,
        difficulty: normalized.difficulty,
        publicTitle: normalized.publicTitle,
        publicSummary: normalized.publicSummary,
        monsterState: normalized.monsters,
        rewardPlan: normalized.rewardPlan,
        mechanics: normalized.mechanics,
        metadata: {
          source: GAMEPLAY_SOURCE,
          createdByTickId: input.tick.id,
          gameMasterAgentId: proposalOutput.gameMasterAgentId,
          proposalMetadata: proposalOutput.metadata,
          publicSetupNarration: setupNarration,
          triggerSource: input.encounterTrigger.source,
          triggerId: input.encounterTrigger.triggerId,
          narrativeBeatId: input.encounterTrigger.narrativeBeatId ?? null,
          encounterSeed: input.encounterTrigger.encounterSeed ?? null,
          ttrpgPhase: 'combat',
          triggerSpeakerInstruction: input.encounterTrigger.speakerInstruction ?? null,
        },
      })
      createdEncounterThisTick = encounter.metadata.createdByTickId === input.tick.id
      narrativeState = await this.narrativeRepository.updateState(input.room, {
        metadata: mergeNarrativeTtrpgMetadata(narrativeState.metadata, {
          ttrpgPhase: 'combat',
          combatReadiness: 'ready',
          requestedGameplayAction: null,
          consumedCombatTriggerBeatId: input.encounterTrigger.triggerId,
          lastEncounterSeed: input.encounterTrigger.encounterSeed ?? undefined,
        }, {
          source: GAMEPLAY_SOURCE,
          lastGameplayEncounterId: encounter.id,
          lastGameplayTriggerSource: input.encounterTrigger.source,
          lastGameplayTriggerTickId: input.tick.id,
        }),
      })
      const { encounterProposalGenerationFailure: _encounterProposalGenerationFailure, ...gameplayMetadata } = gameplayState.metadata
      gameplayState = await this.gameplayRepository.updateState(input.room, {
        status: 'active_encounter',
        activeEncounterId: encounter.id,
        metadata: {
          ...gameplayMetadata,
          lastEncounterStartedTickId: input.tick.id,
          lastEncounterTriggerId: input.encounterTrigger.triggerId,
        },
      })
    }

    createdEncounterThisTick = encounter.metadata.createdByTickId === input.tick.id
    setupNarration = createdEncounterThisTick
      ? requireModelSourcedGameplaySetup(encounter.metadata.publicSetupNarration)
      : null

    if (encounter.status !== 'active' && !turn) {
      return {
        status: 'skipped',
        selectedTokenId: null,
        reason: 'no_active_gameplay_encounter',
      }
    }

    turn = turn ?? await this.gameplayRepository.createOrReuseTurn({
      room: input.room,
      tick: input.tick,
      encounterId: encounter.id,
      metadata: {
        source: GAMEPLAY_SOURCE,
        triggerType: input.tick.triggerType,
      },
    })

    const turnHasStoredMechanics = hasStoredMechanics(turn)
    let messageIds = [...turn.publicMessageIds]
    if (createdEncounterThisTick) {
      const setup = await this.repository.appendMessage({
        roomId: input.room.id,
        locationId: input.room.locationId,
        tickId: input.tick.id,
        authorKind: 'game_master',
        tokenId: null,
        officialAgentId: gameMasterAgentId,
        authorName: GAMEPLAY_GAME_MASTER_AUTHOR_NAME,
        content: setupNarration,
        visibility: 'public',
        dedupeKey: 'gameplay:gm_setup',
        metadata: {
          source: GAMEPLAY_SOURCE,
          gameplay: true,
          gameplayMessageKind: 'gm_setup',
          messageDomain: 'combat',
          messageKind: 'gm_setup',
          ttrpgPhase: 'combat',
          gameplayTurnId: turn.id,
          encounterId: encounter.id,
        },
      })
      messageIds = messageIdsWith(messageIds, setup.id)
    }

    const selectableParticipants = livingParticipants(input.participants, gameplayState)
    if (selectableParticipants.length === 0 && !turnHasStoredMechanics) {
      const terminalStatus = Object.values(gameplayState.characters).some((character) => character.status === 'fled')
        ? 'fled'
        : 'defeat'
      encounter = await this.gameplayRepository.updateEncounter(encounter.id, {
        status: terminalStatus,
        completedAt: nowIso(input.now),
      })
      gameplayState = await this.gameplayRepository.updateState(input.room, {
        status: 'aftermath',
        activeEncounterId: null,
      })
      const endingNarration = terminalEncounterNarration(encounter.status, encounter)
      const endingMessage = await this.repository.appendMessage({
        roomId: input.room.id,
        locationId: input.room.locationId,
        tickId: input.tick.id,
        authorKind: 'game_master',
        tokenId: null,
        officialAgentId: gameMasterAgentId,
        authorName: GAMEPLAY_GAME_MASTER_AUTHOR_NAME,
        content: endingNarration,
        visibility: 'public',
        dedupeKey: 'gameplay:gm_terminal_outcome',
        metadata: {
          source: GAMEPLAY_SOURCE,
          gameplay: true,
          gameplayMessageKind: 'gm_outcome',
          messageDomain: 'combat',
          messageKind: 'gm_outcome',
          ttrpgPhase: 'aftermath',
          gameplayTurnId: turn.id,
          encounterId: encounter.id,
          encounterStatusAfter: encounter.status,
        },
      })
      messageIds = messageIdsWith(messageIds, endingMessage.id)
      await this.narrativeRepository.updateState(input.room, {
        metadata: mergeNarrativeTtrpgMetadata(narrativeState.metadata, {
          ttrpgPhase: 'aftermath',
          combatReadiness: 'none',
          threatLevel: null,
          requestedGameplayAction: null,
        }, {
          source: GAMEPLAY_SOURCE,
          lastGameplayEncounterId: encounter.id,
          lastGameplayEncounterStatus: encounter.status,
          lastGameplayTerminalStatus: encounter.status,
          lastTickId: input.tick.id,
        }),
      })
      turn = await this.gameplayRepository.storeTurnOutcome(turn.id, {
        status: 'completed',
        selectedTokenId: null,
        action: {},
        diceResults: [],
        mechanicalDeltas: { encounterStatusAfter: encounter.status },
        publicMessageIds: messageIds,
        outcomeSummary: endingNarration,
        metadata: {
          ...turn.metadata,
          gameMasterAgentId,
          terminalEncounterStatus: encounter.status,
        },
        completedAt: nowIso(input.now),
      })
      return {
        status: 'completed',
        selectedTokenId: null,
        messageId: endingMessage.id,
        messageIds: turn.publicMessageIds,
        encounterStatusAfter: encounter.status,
      }
    }

    const selectedTokenId = turn.selectedTokenId ?? input.tick.selectedTokenId
    const speaker = selectedTokenId == null
      ? this.speakerSelector(selectableParticipants, input.recentMessages)
      : (turnHasStoredMechanics ? input.participants : selectableParticipants)
        .find((participant) => participant.tokenId === selectedTokenId)

    if (!speaker) {
      throw new Error('Selected gameplay speaker is no longer eligible for this location room')
    }

    if (input.tick.selectedTokenId !== speaker.tokenId) {
      await this.repository.markTickSelected(input.tick.id, speaker.tokenId)
    }

    if (turn.selectedTokenId !== speaker.tokenId) {
      turn = await this.gameplayRepository.storeTurnOutcome(turn.id, {
        selectedTokenId: speaker.tokenId,
        publicMessageIds: messageIds,
      })
    }

    const storedDeltas = turnHasStoredMechanics ? mechanicalDeltasFromTurn(turn) : null
    const legalMonsterIds = storedDeltas
      ? storedDeltas.monstersBefore.filter((monster) => monster.status === 'alive' && monster.hp > 0).map((monster) => monster.id)
      : activeMonsterIds(encounter)
    const legalCharacterTokenIds = selectableParticipants.map((participant) => participant.tokenId)
    const validationContext: GameplayActionValidationContext = {
      legalMonsterIds,
      legalCharacterTokenIds,
      publicSpeechMaxLength: elizaConfig.locationRooms.gameplay.publicSpeechMaxLength,
      intentSummaryMaxLength: elizaConfig.locationRooms.gameplay.actionIntentMaxLength,
      contextualChecks: parseGameplayContextualChecks((encounter.mechanics as Record<string, unknown> | undefined)?.contextualChecks),
    }
    let action = coerceGameplayAction(turn.action, validationContext)
    let actionOfficialAgentId = typeof turn.metadata.officialAgentId === 'string' ? turn.metadata.officialAgentId : null

    if (!action && turnHasStoredMechanics) {
      throw new Error('Resolved gameplay turn is missing a reusable action')
    }

    if (!action) {
      try {
        const generated = await this.actionGenerator.generateAction({
          room: input.room,
          tick: input.tick,
          speaker,
          participants: selectableParticipants,
          recentMessages: input.recentMessages,
          encounter,
          gameplayState,
          characterState: gameplayState.characters[String(speaker.tokenId)],
          visibleMonsters: parseGameplayMonsters(encounter.monsterState),
          validation: validationContext,
          speakerInstruction: triggerSpeakerInstruction(input.encounterTrigger, encounter),
        })
        const generatedValidation = validateGameplayActionEnvelope(generated.action, validationContext)
        if (!generatedValidation.ok) {
          throw actionValidationGenerationError(generatedValidation.error)
        }

        action = generatedValidation.action
        actionOfficialAgentId = generated.officialAgentId
        const { actionGenerationFailure: _actionGenerationFailure, ...turnMetadata } = turn.metadata
        turn = await this.gameplayRepository.storeTurnOutcome(turn.id, {
          status: 'action_recorded',
          selectedTokenId: speaker.tokenId,
          action,
          publicMessageIds: messageIds,
          metadata: {
            ...turnMetadata,
            officialAgentId: generated.officialAgentId,
            actionRawResponseLength: generated.rawResponseLength,
            ...(generated.generationDiagnostics ? { actionGenerationDiagnostics: generated.generationDiagnostics } : {}),
          },
        })
      } catch (error) {
        const actionGenerationFailure = safeActionGenerationFailureMetadata(error)
        await this.gameplayRepository.storeTurnOutcome(turn.id, {
          status: 'planned',
          selectedTokenId: speaker.tokenId,
          publicMessageIds: messageIds,
          metadata: {
            ...turn.metadata,
            actionGenerationFailure,
          },
        })
        throw error
      }
    }

    let mechanics: ResolveGameplayTurnMechanicsResult
    if (turnHasStoredMechanics && storedDeltas) {
      mechanics = {
        diceResults: turn.diceResults,
        mechanicalDeltas: storedDeltas,
      }
    } else {
      mechanics = resolveGameplayTurnMechanics({
        actorTokenId: speaker.tokenId,
        action,
        encounter,
        characters: filterCharactersToParticipants(gameplayState.characters, input.participants),
        maxEncounterRounds: effectiveMaxEncounterRounds,
        statsEnabled: elizaConfig.locationRooms.gameplay.stats.enabled,
        rng: this.rng,
      })
      const performance = updateGameplayPerformanceCountersFromTurn(mechanics.mechanicalDeltas)
      mechanics.mechanicalDeltas.charactersAfter = performance.characters
      mechanics.mechanicalDeltas.performanceUpdates = performance.performanceUpdates
      turn = await this.gameplayRepository.storeTurnOutcome(turn.id, {
        status: 'resolved',
        selectedTokenId: speaker.tokenId,
        action,
        diceResults: mechanics.diceResults,
        mechanicalDeltas: mechanics.mechanicalDeltas as unknown as Record<string, unknown>,
        publicMessageIds: messageIds,
        metadata: {
          ...turn.metadata,
          officialAgentId: actionOfficialAgentId ?? undefined,
        },
      })
    }

    const gameplayStateBeforeOutcome = gameplayState
    const encounterBeforeOutcome = encounter
    const deltas = mechanics.mechanicalDeltas
    const mergedCharactersAfter = {
      ...gameplayState.characters,
      ...deltas.charactersAfter,
    }
    gameplayState = await this.gameplayRepository.updateState(input.room, {
      status: deltas.encounterStatusAfter === 'active' ? 'active_encounter' : 'aftermath',
      activeEncounterId: deltas.encounterStatusAfter === 'active' ? encounter.id : null,
      characters: mergedCharactersAfter,
      metadata: {
        ...gameplayState.metadata,
        lastResolvedTurnId: turn.id,
      },
    })

    encounter = await this.gameplayRepository.updateEncounter(encounter.id, {
      status: deltas.encounterStatusAfter,
      roundNumber: deltas.roundNumberAfter,
      monsterState: deltas.monstersAfter,
      metadata: {
        ...encounter.metadata,
        lastResolvedTurnId: turn.id,
        rewardApplied: encounter.metadata.rewardApplied === true || deltas.rewardsApplied,
      },
      completedAt: terminalCompletedAt(deltas.encounterStatusAfter, input.now),
    })

    for (const tokenId of deltas.deaths) {
      const deathReview = await this.gameplayRepository.createPendingDeathReview({
        room: input.room,
        encounterId: encounter.id,
        turnId: turn.id,
        tokenId,
        context: {
          tickId: input.tick.id,
          selectedTokenId: speaker.tokenId,
          action,
          mechanicalSummary: {
            deaths: deltas.deaths,
            encounterStatusAfter: deltas.encounterStatusAfter,
          },
        },
        metadata: {
          source: GAMEPLAY_SOURCE,
        },
      })

      if (deathReview.reviewStatus === 'pending' && elizaConfig.locationRooms.gameplay.deathRewards.enabled) {
        const character = mergedCharactersAfter[String(tokenId)]
        const participant = input.participants.find((candidate) => candidate.tokenId === tokenId)
        const beneficiary = resolveRewardClaimBeneficiary(character, participant)
        if (character && beneficiary) {
          const calculation = calculateGameplayDeathRewardClaim({
            character,
            difficulty: encounter.difficulty,
          })
          const claim = await this.gameplayRepository.createOrReuseRewardClaim({
            deathReview,
            beneficiaryWallet: beneficiary.wallet,
            beneficiarySource: beneficiary.source,
            policyVersion: calculation.policyVersion,
            performanceScore: calculation.performanceScore,
            scoreBreakdown: calculation.scoreBreakdown,
            lineItems: calculation.lineItems,
            metadata: {
              source: GAMEPLAY_SOURCE,
              tickId: input.tick.id,
            },
          })

          if ((deathReview.context as { rewardClaim?: unknown }).rewardClaim === undefined) {
            await this.gameplayRepository.updateDeathReview(deathReview.id, {
              context: {
                ...deathReview.context,
                rewardClaim: rewardClaimSummaryForContext(claim),
              },
            })
          }
        }
      }
    }

    const mechanicalSummary: GameplayMechanicalOutcomeSummary = {
      diceResults: mechanics.diceResults,
      mechanicalDeltas: deltas as unknown as Record<string, unknown>,
      encounterStatusAfter: deltas.encounterStatusAfter,
      deaths: deltas.deaths,
      rewardAssignments: deltas.rewardAssignments,
    }

    const publicRolls = projectPublicGameplayRolls(mechanicalSummary)

    const actionMessage = await this.repository.appendMessage({
      roomId: input.room.id,
      locationId: input.room.locationId,
      tickId: input.tick.id,
      authorKind: 'agent',
      tokenId: speaker.tokenId,
      officialAgentId: actionOfficialAgentId,
      authorName: speaker.name,
      content: action.publicSpeech,
      visibility: 'public',
      dedupeKey: 'gameplay:character_action',
      metadata: {
        source: GAMEPLAY_SOURCE,
        gameplay: true,
        gameplayMessageKind: 'character_action',
        messageDomain: 'combat',
        messageKind: 'character_action',
        ttrpgPhase: 'combat',
        gameplayTurnId: turn.id,
        encounterId: encounter.id,
        actionType: action.actionType,
      },
    })
    messageIds = messageIdsWith(messageIds, actionMessage.id)

    const rollCardMessage = await this.repository.appendMessage({
      roomId: input.room.id,
      locationId: input.room.locationId,
      tickId: input.tick.id,
      authorKind: 'game_master',
      tokenId: null,
      officialAgentId: gameMasterAgentId,
      authorName: GAMEPLAY_GAME_MASTER_AUTHOR_NAME,
      content: rollCardContent(publicRolls),
      visibility: 'public',
      dedupeKey: 'gameplay:roll_card',
      metadata: {
        source: GAMEPLAY_SOURCE,
        gameplay: true,
        gameplayMessageKind: 'roll_card',
        messageDomain: 'combat',
        messageKind: 'roll_card',
        ttrpgPhase: 'combat',
        gameplayTurnId: turn.id,
        encounterId: encounter.id,
        ...(publicRolls ? { publicRolls } : {}),
      },
    })
    messageIds = messageIdsWith(messageIds, rollCardMessage.id)

    turn = await this.gameplayRepository.storeTurnOutcome(turn.id, {
      status: 'resolved',
      selectedTokenId: speaker.tokenId,
      action,
      diceResults: mechanics.diceResults,
      mechanicalDeltas: deltas as unknown as Record<string, unknown>,
      publicMessageIds: messageIds,
      metadata: {
        ...turn.metadata,
        officialAgentId: actionOfficialAgentId ?? undefined,
      },
    })

    let outcome: Awaited<ReturnType<GameMasterGameplayGenerator['generateOutcomeNarration']>>
    try {
      outcome = await this.gameMasterGenerator.generateOutcomeNarration({
        gameMasterAgentId,
        room: input.room,
        tick: input.tick,
        participants: selectableParticipants,
        recentMessages: input.recentMessages,
        narrativeState,
        gameplayStateBefore: gameplayStateBeforeOutcome,
        gameplayStateAfter: gameplayState,
        encounterBefore: encounterBeforeOutcome,
        encounterAfter: encounter,
        turn,
        action,
        mechanicalSummary,
      })
    } catch (error) {
      const outcomeGenerationFailure = safeOutcomeGenerationFailureMetadata(error)
      await this.gameplayRepository.storeTurnOutcome(turn.id, {
        status: 'resolved',
        selectedTokenId: speaker.tokenId,
        action,
        diceResults: mechanics.diceResults,
        mechanicalDeltas: deltas as unknown as Record<string, unknown>,
        publicMessageIds: messageIds,
        outcomeSummary: null,
        metadata: {
          ...turn.metadata,
          officialAgentId: actionOfficialAgentId ?? undefined,
          gameMasterAgentId,
          outcomeGenerationFailure,
        },
      })
      throw error
    }
    const outcomeContent = outcome.publicNarration

    const outcomeMessage = await this.repository.appendMessage({
      roomId: input.room.id,
      locationId: input.room.locationId,
      tickId: input.tick.id,
      authorKind: 'game_master',
      tokenId: null,
      officialAgentId: outcome.gameMasterAgentId,
      authorName: GAMEPLAY_GAME_MASTER_AUTHOR_NAME,
      content: outcomeContent,
      visibility: 'public',
      dedupeKey: 'gameplay:gm_outcome',
      metadata: {
        source: GAMEPLAY_SOURCE,
        gameplay: true,
        gameplayMessageKind: 'gm_outcome',
        messageDomain: 'combat',
        messageKind: 'gm_outcome',
        ttrpgPhase: 'combat',
        gameplayTurnId: turn.id,
        encounterId: encounter.id,
        // Compatibility/debug metadata for historical consumers; structured publicRolls now live on roll_card.
        rollSummary: formatPublicGameplayRollSummary(mechanicalSummary),
      },
    })
    messageIds = messageIdsWith(messageIds, outcomeMessage.id)

    await this.narrativeRepository.updateState(input.room, {
      stateSummary: outcome.stateAfter.stateSummary,
      currentObjective: outcome.stateAfter.currentObjective,
      openThreads: outcome.stateAfter.openThreads,
      metadata: mergeNarrativeTtrpgMetadata(narrativeState.metadata, {
        ttrpgPhase: encounter.status === 'active' ? 'combat' : 'aftermath',
        combatReadiness: encounter.status === 'active' ? 'ready' : 'none',
        threatLevel: encounter.status === 'active' ? undefined : null,
        requestedGameplayAction: null,
      }, {
        source: GAMEPLAY_SOURCE,
        lastGameplayTurnId: turn.id,
        lastGameplayEncounterId: encounter.id,
        lastGameplayEncounterStatus: encounter.status,
        lastTickId: input.tick.id,
      }),
    })

    const completedTurnMetadata: Record<string, unknown> = {
      ...turn.metadata,
      officialAgentId: actionOfficialAgentId ?? undefined,
      gameMasterAgentId: outcome.gameMasterAgentId,
      outcomeRawResponseLength: outcome.metadata.rawResponseLength,
      ...(outcome.metadata.generationDiagnostics ? { outcomeGenerationDiagnostics: outcome.metadata.generationDiagnostics } : {}),
    }
    delete completedTurnMetadata.outcomeGenerationFailure

    turn = await this.gameplayRepository.storeTurnOutcome(turn.id, {
      status: 'completed',
      selectedTokenId: speaker.tokenId,
      action,
      diceResults: mechanics.diceResults,
      mechanicalDeltas: deltas as unknown as Record<string, unknown>,
      publicMessageIds: messageIds,
      outcomeSummary: outcome.publicNarration,
      metadata: completedTurnMetadata,
      completedAt: nowIso(input.now),
    })

    return {
      status: 'completed',
      selectedTokenId: speaker.tokenId,
      messageId: actionMessage.id,
      messageIds: turn.publicMessageIds,
      encounterStatusAfter: encounter.status,
    }
  }

  async markTickFailed(tickId: string, error: unknown, options: { dead?: boolean } = {}): Promise<void> {
    const turn = await this.gameplayRepository.findTurnByTickId(tickId)
    if (!turn) return

    if (options.dead) {
      await this.gameplayRepository.markTurnDead(turn.id, error)
      return
    }

    await this.gameplayRepository.markTurnFailed(turn.id, sanitizeGameplayStoredError(error))
  }
}

export const locationRoomGameplayCoordinator = new DefaultLocationRoomGameplayCoordinator()
