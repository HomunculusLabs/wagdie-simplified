import { elizaConfig } from '@/lib/eliza/config'
import {
  GAMEPLAY_GAME_MASTER_AUTHOR_NAME,
  officialGameMasterGameplayGenerator,
  type GameMasterGameplayGenerator,
} from './gameMasterGameplayGenerator'
import {
  officialGameplayActionGenerator,
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
  parseGameplayMonsters,
  resolveGameplayTurnMechanics,
  validateGameplayActionEnvelope,
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
import type { GameMasterAgentResolver } from '../narrativeCoordinator'
import {
  locationRoomRepository,
  type LocationRoomRepository,
} from '../repository'
import { selectLocationRoomSpeaker } from '../speakerSelection'
import type {
  LocationRoom,
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

export type ProcessGameplayLocationRoomTurnInput = {
  room: LocationRoom
  tick: LocationRoomTick
  participants: LocationRoomParticipant[]
  recentMessages: LocationRoomMessage[]
  now: Date
}

export type ProcessGameplayLocationRoomTurnResult =
  | {
      status: 'completed'
      selectedTokenId: number | null
      messageId?: string
      messageIds: string[]
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

function coerceGameplayAction(value: Record<string, unknown>, context: {
  legalMonsterIds: string[]
  legalCharacterTokenIds: number[]
}): GameplayActionEnvelope | null {
  const validated = validateGameplayActionEnvelope(value, {
    ...context,
    publicSpeechMaxLength: elizaConfig.locationRooms.gameplay.publicSpeechMaxLength,
    intentSummaryMaxLength: elizaConfig.locationRooms.gameplay.actionIntentMaxLength,
  })

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

function activeMonsterIds(encounter: GameplayEncounter): string[] {
  return parseGameplayMonsters(encounter.monsterState)
    .filter((monster) => monster.status === 'alive' && monster.hp > 0)
    .map((monster) => monster.id)
}

function terminalCompletedAt(status: string, now: Date): string | null | undefined {
  return status === 'active' ? null : nowIso(now)
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
    const narrativeState = await this.narrativeRepository.ensureStateForRoom({ room: input.room })
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

    if (!encounter) {
      const playableParticipants = livingParticipants(input.participants, gameplayState)
      if (playableParticipants.length < 2) {
        return {
          status: 'skipped',
          selectedTokenId: null,
          reason: 'insufficient_living_gameplay_participants',
        }
      }

      const proposalOutput = await this.gameMasterGenerator.generateEncounterProposal({
        gameMasterAgentId,
        room: input.room,
        tick: input.tick,
        participants: playableParticipants,
        recentMessages: input.recentMessages,
        narrativeState,
        gameplayState,
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
      const normalized = normalizeEncounterProposal(proposalOutput.proposal, {
        partySize: playableParticipants.length,
        averageLevel: 1,
        difficulty: elizaConfig.locationRooms.gameplay.defaultDifficulty,
        maxMonsterCount: elizaConfig.locationRooms.gameplay.monsterBudget.maxMonsterCount,
        maxTotalMonsterHp: elizaConfig.locationRooms.gameplay.monsterBudget.maxTotalMonsterHp,
        maxXpPerCharacter: elizaConfig.locationRooms.gameplay.rewardBudget.maxXpPerCharacter,
        maxTemporaryBoons: elizaConfig.locationRooms.gameplay.rewardBudget.maxTemporaryBoons,
        maxNarrativeRewards: elizaConfig.locationRooms.gameplay.rewardBudget.maxNarrativeRewards,
      })

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
          publicSetupNarration: proposalOutput.publicSetupNarration,
        },
      })
      setupNarration = proposalOutput.publicSetupNarration ?? normalized.publicSummary
      createdEncounterThisTick = encounter.metadata.createdByTickId === input.tick.id
      gameplayState = await this.gameplayRepository.updateState(input.room, {
        status: 'active_encounter',
        activeEncounterId: encounter.id,
        metadata: {
          ...gameplayState.metadata,
          lastEncounterStartedTickId: input.tick.id,
        },
      })
    }

    createdEncounterThisTick = encounter.metadata.createdByTickId === input.tick.id
    setupNarration = typeof encounter.metadata.publicSetupNarration === 'string'
      ? encounter.metadata.publicSetupNarration
      : encounter.publicSummary

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
        content: setupNarration || encounter.publicSummary || 'A threat emerges in the room.',
        visibility: 'public',
        dedupeKey: 'gameplay:gm_setup',
        metadata: {
          source: GAMEPLAY_SOURCE,
          gameplay: true,
          gameplayMessageKind: 'gm_setup',
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
      await this.gameplayRepository.updateState(input.room, {
        status: 'aftermath',
        activeEncounterId: null,
      })
      return {
        status: 'skipped',
        selectedTokenId: null,
        reason: `encounter_${encounter.status}`,
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
    let action = coerceGameplayAction(turn.action, { legalMonsterIds, legalCharacterTokenIds })
    let actionOfficialAgentId = typeof turn.metadata.officialAgentId === 'string' ? turn.metadata.officialAgentId : null

    if (!action && turnHasStoredMechanics) {
      throw new Error('Resolved gameplay turn is missing a reusable action')
    }

    if (!action) {
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
        validation: {
          legalMonsterIds,
          legalCharacterTokenIds,
          publicSpeechMaxLength: elizaConfig.locationRooms.gameplay.publicSpeechMaxLength,
          intentSummaryMaxLength: elizaConfig.locationRooms.gameplay.actionIntentMaxLength,
        },
      })
      action = generated.action
      actionOfficialAgentId = generated.officialAgentId
      turn = await this.gameplayRepository.storeTurnOutcome(turn.id, {
        status: 'action_recorded',
        selectedTokenId: speaker.tokenId,
        action,
        publicMessageIds: messageIds,
        metadata: {
          ...turn.metadata,
          officialAgentId: generated.officialAgentId,
          actionRawResponseLength: generated.rawResponseLength,
        },
      })
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
        maxEncounterRounds: elizaConfig.locationRooms.gameplay.maxEncounterRounds,
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

    const outcome = await this.gameMasterGenerator.generateOutcomeNarration({
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
      mechanicalSummary: {
        diceResults: mechanics.diceResults,
        mechanicalDeltas: deltas as unknown as Record<string, unknown>,
        encounterStatusAfter: deltas.encounterStatusAfter,
        deaths: deltas.deaths,
        rewardAssignments: deltas.rewardAssignments,
      },
    })

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
        gameplayTurnId: turn.id,
        encounterId: encounter.id,
        actionType: action.actionType,
      },
    })
    messageIds = messageIdsWith(messageIds, actionMessage.id)

    const outcomeMessage = await this.repository.appendMessage({
      roomId: input.room.id,
      locationId: input.room.locationId,
      tickId: input.tick.id,
      authorKind: 'game_master',
      tokenId: null,
      officialAgentId: outcome.gameMasterAgentId,
      authorName: GAMEPLAY_GAME_MASTER_AUTHOR_NAME,
      content: outcome.publicNarration,
      visibility: 'public',
      dedupeKey: 'gameplay:gm_outcome',
      metadata: {
        source: GAMEPLAY_SOURCE,
        gameplay: true,
        gameplayMessageKind: 'gm_outcome',
        gameplayTurnId: turn.id,
        encounterId: encounter.id,
      },
    })
    messageIds = messageIdsWith(messageIds, outcomeMessage.id)

    await this.narrativeRepository.updateState(input.room, {
      stateSummary: outcome.stateAfter.stateSummary,
      currentObjective: outcome.stateAfter.currentObjective,
      openThreads: outcome.stateAfter.openThreads,
      metadata: {
        ...narrativeState.metadata,
        source: GAMEPLAY_SOURCE,
        lastGameplayTurnId: turn.id,
        lastTickId: input.tick.id,
      },
    })

    turn = await this.gameplayRepository.storeTurnOutcome(turn.id, {
      status: 'completed',
      selectedTokenId: speaker.tokenId,
      action,
      diceResults: mechanics.diceResults,
      mechanicalDeltas: deltas as unknown as Record<string, unknown>,
      publicMessageIds: messageIds,
      outcomeSummary: outcome.publicNarration,
      metadata: {
        ...turn.metadata,
        officialAgentId: actionOfficialAgentId ?? undefined,
        gameMasterAgentId: outcome.gameMasterAgentId,
        outcomeRawResponseLength: outcome.metadata.rawResponseLength,
      },
      completedAt: nowIso(input.now),
    })

    return {
      status: 'completed',
      selectedTokenId: speaker.tokenId,
      messageId: actionMessage.id,
      messageIds: turn.publicMessageIds,
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
