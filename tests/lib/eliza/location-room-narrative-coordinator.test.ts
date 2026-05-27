/**
 * @jest-environment node
 */

jest.mock('@/lib/eliza/official/messaging', () => ({
  normalizeOfficialResponseText: (text: string) => text.trim(),
  createOfficialElizaMessagingClient: jest.fn(() => ({
    startAgent: jest.fn(),
    createSession: jest.fn(),
    sendSessionMessage: jest.fn(),
    collectStreamedResponseText: jest.fn(),
    deleteSession: jest.fn(),
  })),
}))

jest.mock('@/lib/eliza/locationRooms/officialTurnGenerator', () => ({
  officialLocationRoomTurnGenerator: { generateTurn: jest.fn() },
  normalizeLocationRoomGeneratedContent: (content: string) => content.trim() || null,
}))

jest.mock('@/lib/eliza/gameMasterAgent/service', () => ({
  gameMasterAgentService: { resolveRuntimeGameMasterAgentId: jest.fn(async () => 'gm-1') },
}))

import { DefaultLocationRoomNarrativeCoordinator } from '@/lib/eliza/locationRooms/narrativeCoordinator'
import {
  GameMasterBeatGenerationError,
  GameMasterSceneCheckOutcomeGenerationError,
  type GameMasterBeatGenerator,
  type GameMasterGenerationDiagnostics,
} from '@/lib/eliza/locationRooms/gameMasterGenerator'
import type { LocationRoomNarrativeRepository } from '@/lib/eliza/locationRooms/narrativeRepository'
import type {
  LocationRoomNarrativeBeat,
  LocationRoomNarrativeState,
} from '@/lib/eliza/locationRooms/narrativeTypes'
import type { LocationRoomRepository } from '@/lib/eliza/locationRooms/repository'
import type { OfficialLocationRoomTurnGenerator } from '@/lib/eliza/locationRooms/officialTurnGenerator'
import type { LocationRoom, LocationRoomMessage, LocationRoomParticipant, LocationRoomTick } from '@/lib/eliza/locationRooms/types'
import {
  normalizeSceneCheckRequest,
  resolveSceneCheck,
} from '@/lib/eliza/locationRooms/sceneChecks/rules'
import { projectPublicSceneCheckRolls } from '@/lib/eliza/locationRooms/sceneChecks/publicRolls'

const now = '2026-05-22T12:00:00.000Z'

function room(overrides: Partial<LocationRoom> = {}): LocationRoom {
  return {
    id: 'room-1',
    locationId: 'loc-1',
    officialRoomId: 'official-room-1',
    officialWorldId: 'official-world-1',
    officialUserId: 'official-user-1',
    channelId: 'wagdie-location-loc-1',
    tickEnabled: true,
    lastTickAt: null,
    nextTickAt: null,
    tickCount: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function tick(overrides: Partial<LocationRoomTick> = {}): LocationRoomTick {
  return {
    id: 'tick-1',
    roomId: 'room-1',
    locationId: 'loc-1',
    gameplayRunId: null,
    turnIntent: 'auto',
    triggerType: 'scheduled',
    requestedByWallet: null,
    requestedByTokenId: null,
    status: 'processing',
    attempts: 1,
    nextAttemptAt: now,
    lockedAt: now,
    lockedBy: 'worker',
    selectedTokenId: 1,
    startedAt: now,
    completedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function participant(tokenId: number, name = `Character #${tokenId}`): LocationRoomParticipant {
  return {
    tokenId,
    name,
    imageUrl: null,
    backgroundStory: null,
    ownerAddress: `0x${tokenId}`,
    stakerAddress: null,
    locationId: 'loc-1',
  }
}

function message(overrides: Partial<LocationRoomMessage> = {}): LocationRoomMessage {
  return {
    id: 'msg-character',
    roomId: 'room-1',
    locationId: 'loc-1',
    tickId: 'tick-1',
    sequence: 2,
    visibility: 'public',
    authorKind: 'agent',
    tokenId: 1,
    officialAgentId: 'agent-1',
    authorName: 'Ash',
    content: 'I hear it.',
    metadata: {},
    createdAt: now,
    ...overrides,
  }
}

function sceneCheckRollMessage(checkType: string, sequence: number): LocationRoomMessage {
  return message({
    id: `msg-roll-${sequence}`,
    sequence,
    authorKind: 'game_master',
    tokenId: null,
    officialAgentId: 'gm-1',
    authorName: 'Game Master',
    content: `The scene ${checkType} check resolves total 12 vs DC 14.`,
    metadata: {
      messageKind: 'roll_card',
      publicRolls: {
        action: { checkType },
      },
    },
  })
}

function narrativeState(): LocationRoomNarrativeState {
  return {
    id: 'state-1',
    roomId: 'room-1',
    locationId: 'loc-1',
    stateSummary: 'The bell has begun.',
    currentObjective: 'Find it.',
    openThreads: ['Who rings it?'],
    metadata: {},
    createdAt: now,
    updatedAt: now,
  }
}

function beat(overrides: Partial<LocationRoomNarrativeBeat> = {}): LocationRoomNarrativeBeat {
  return {
    id: 'beat-1',
    roomId: 'room-1',
    locationId: 'loc-1',
    tickId: 'tick-1',
    status: 'planned',
    selectedTokenId: 1,
    gameMasterAgentId: 'gm-1',
    publicNarration: null,
    speakerInstruction: null,
    stateBefore: {},
    stateAfter: {},
    metadata: {},
    lastError: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    ...overrides,
  }
}

function makeRepository(): jest.Mocked<LocationRoomRepository> {
  return {
    getLocation: jest.fn(),
    getLocationDetails: jest.fn(),
    listLocationsByIds: jest.fn(),
    findRoomById: jest.fn(),
    findRoomByLocationId: jest.fn(),
    ensureRoomForLocation: jest.fn(),
    listDueRooms: jest.fn(),
    enqueueTick: jest.fn(),
    promoteOpenTickIntent: jest.fn(),
    findRecentCompletedOwnerTick: jest.fn(),
    findOldestProcessableTickForRoom: jest.fn(),
    findNonStaleProcessingTickForRoom: jest.fn(),
    claimTick: jest.fn(),
    claimDueTicks: jest.fn(),
    listActiveTicksForRoom: jest.fn(),
    listRecentTicksForRoom: jest.fn(),
    getPublicMessageStats: jest.fn(),
    getPublicAuthorMessageStats: jest.fn(async () => ({
      messageCount: 0,
      gameMasterMessageCount: 0,
      agentMessageCount: 0,
      latestGameMasterMessageCreatedAt: null,
      latestAgentMessageCreatedAt: null,
    })),
    markTickSelected: jest.fn(),
    appendMessage: jest.fn(async (input) => message({
      id: input.authorKind === 'game_master' ? 'msg-gm' : 'msg-character',
      authorKind: input.authorKind,
      tokenId: input.tokenId ?? null,
      officialAgentId: input.officialAgentId ?? null,
      authorName: input.authorName,
      content: input.content,
    })),
    markTickCompleted: jest.fn(),
    markTickSkipped: jest.fn(),
    markTickFailed: jest.fn(),
    markTickDead: jest.fn(),
    updateRoomAfterProcessedTick: jest.fn(),
    recordRoomError: jest.fn(),
    listPublicMessages: jest.fn(),
    listRecentPublicMessages: jest.fn(),
  }
}

function usePriorGameMasterMessage(repository: jest.Mocked<LocationRoomRepository>): void {
  repository.getPublicAuthorMessageStats.mockResolvedValueOnce({
    messageCount: 2,
    gameMasterMessageCount: 1,
    agentMessageCount: 1,
    latestGameMasterMessageCreatedAt: now,
    latestAgentMessageCreatedAt: now,
  })
}

function makeGameMasterAgentResolver(agentId = 'gm-1') {
  return {
    resolveRuntimeGameMasterAgentId: jest.fn(async () => agentId),
  }
}

function makeNarrativeRepository(existingBeat = beat()): jest.Mocked<LocationRoomNarrativeRepository> {
  const state = narrativeState()
  return {
    findStateByRoomId: jest.fn(async () => state),
    ensureStateForRoom: jest.fn(async () => state),
    updateState: jest.fn(async (_room, input) => ({
      ...state,
      stateSummary: input.stateSummary ?? state.stateSummary,
      currentObjective: input.currentObjective ?? state.currentObjective,
      openThreads: input.openThreads ?? state.openThreads,
    })),
    findBeatByTickId: jest.fn(async () => existingBeat),
    listRecentBeatsByRoomId: jest.fn(async () => [existingBeat]),
    createOrReuseBeat: jest.fn(async () => existingBeat),
    storeBeatGameMasterOutput: jest.fn(async (_beatId, output) => beat({
      ...existingBeat,
      gameMasterAgentId: output.gameMasterAgentId ?? null,
      publicNarration: output.publicNarration ?? null,
      speakerInstruction: output.speakerInstruction ?? null,
      stateAfter: output.stateAfter ?? {},
      metadata: output.metadata ?? {},
    })),
    patchBeatMetadata: jest.fn(async (_beatId, metadata) => beat({
      ...existingBeat,
      metadata,
    })),
    markBeatGameMasterMessageAppended: jest.fn(async (_beatId, output) => beat({
      status: 'game_master_message_appended',
      gameMasterAgentId: output.gameMasterAgentId ?? null,
      publicNarration: output.publicNarration ?? null,
      speakerInstruction: output.speakerInstruction ?? null,
      stateAfter: output.stateAfter ?? {},
      metadata: output.metadata ?? {},
    })),
    markBeatCharacterAppended: jest.fn(async () => beat({ status: 'character_appended' })),
    markBeatCompleted: jest.fn(async () => beat({ status: 'completed', completedAt: now })),
    markBeatFailed: jest.fn(async () => beat({ status: 'failed', lastError: 'failed' })),
    markBeatDead: jest.fn(async () => beat({ status: 'dead', lastError: 'dead', completedAt: now })),
  }
}

describe('location room narrative coordinator', () => {
  const participants = [participant(1, 'Ash'), participant(2, 'Bone')]

  it('plans a beat, appends game-master then character messages, updates state, and completes the beat', async () => {
    const repository = makeRepository()
    usePriorGameMasterMessage(repository)
    const narrativeRepository = makeNarrativeRepository()
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(async () => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: 'The bell tolls once.',
        speakerInstruction: 'Answer with dread.',
        stateAfter: {
          stateSummary: 'The bell has called Ash.',
          currentObjective: 'Answer the toll.',
          openThreads: ['Who rang it?'],
        },
        ttrpgPhase: 'threat',
        combatReadiness: 'ready',
        threatLevel: 4,
        requestedGameplayAction: 'start_combat',
        encounterSeed: { title: 'The Bell Horror', summary: 'A bell-born horror steps from the gate.', stakes: 'Silence the toll.' },
        sceneCheckRequest: null,
        adventurePatch: { currentStakes: 'Silence the toll.' },
        metadata: { featuredTokenIds: [1] },
      })),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({ officialAgentId: 'agent-1', content: 'I hear it in my bones.' })),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository,
      narrativeRepository,
      gameMasterGenerator,
      turnGenerator,
      makeGameMasterAgentResolver('gm-1')
    )

    const result = await coordinator.processTurn({
      room: room(),
      tick: tick(),
      speaker: participants[0],
      participants,
      recentMessages: [],
    })

    expect(result).toEqual({ selectedTokenId: 1, messageId: 'msg-character', publicGameMasterBeatAppended: true })
    expect(gameMasterGenerator.generateBeat).toHaveBeenCalledWith(expect.objectContaining({
      gameMasterAgentId: 'gm-1',
      tick: expect.objectContaining({ id: 'tick-1' }),
    }))
    expect(narrativeRepository.storeBeatGameMasterOutput).toHaveBeenCalledWith('beat-1', expect.objectContaining({
      publicNarration: 'The bell tolls once.',
      speakerInstruction: 'Answer with dread.',
      metadata: expect.objectContaining({
        ttrpgPhase: 'threat',
        combatReadiness: 'ready',
        threatLevel: 4,
        requestedGameplayAction: 'start_combat',
        encounterSeed: expect.objectContaining({ title: 'The Bell Horror' }),
      }),
    }))
    expect(repository.appendMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      authorKind: 'game_master',
      officialAgentId: 'gm-1',
      content: 'The bell tolls once.',
      tickId: 'tick-1',
      dedupeKey: 'narrative:beat-1:gm_beat',
      metadata: expect.objectContaining({
        messageDomain: 'narrative',
        messageKind: 'gm_beat',
        ttrpgPhase: 'threat',
      }),
    }))
    expect(turnGenerator.generateTurn).toHaveBeenCalledWith(expect.objectContaining({
      narrativeContext: expect.objectContaining({
        speakerInstruction: 'Answer with dread.',
        stateSummary: 'The bell has called Ash.',
      }),
    }))
    expect(repository.appendMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({
      authorKind: 'agent',
      tokenId: 1,
      content: 'I hear it in my bones.',
      tickId: 'tick-1',
      metadata: expect.objectContaining({
        messageDomain: 'narrative',
        messageKind: 'character_reaction',
        ttrpgPhase: 'threat',
      }),
    }))
    expect(narrativeRepository.updateState).toHaveBeenCalledWith(expect.objectContaining({ id: 'room-1' }), expect.objectContaining({
      stateSummary: 'The bell has called Ash.',
      currentObjective: 'Answer the toll.',
      openThreads: ['Who rang it?'],
      metadata: expect.objectContaining({
        ttrpgPhase: 'threat',
        combatReadiness: 'ready',
        requestedGameplayAction: 'start_combat',
        lastEncounterSeed: expect.objectContaining({ title: 'The Bell Horror' }),
        lastCombatTriggerBeatId: 'beat-1',
      }),
    }))
    expect(narrativeRepository.markBeatCompleted).toHaveBeenCalledWith('beat-1')
  })

  it('stamps combat-ready source metadata for a normal ready beat without direct combat', async () => {
    const repository = makeRepository()
    usePriorGameMasterMessage(repository)
    const narrativeRepository = makeNarrativeRepository()
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(async () => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: 'The roost grows claws in the rafters.',
        speakerInstruction: 'React to the ready threat without forcing combat yet.',
        stateAfter: {
          stateSummary: 'The roost is ready to break into violence.',
          currentObjective: 'Hold the taproom line.',
          openThreads: ['What drops from the rafters?'],
        },
        ttrpgPhase: 'threat',
        combatReadiness: 'ready',
        threatLevel: 3,
        requestedGameplayAction: null,
        encounterSeed: { title: 'Rafter Crows', summary: 'Crows gather above.', stakes: 'Hold the line.' },
        sceneCheckRequest: null,
        adventurePatch: { currentStakes: 'Hold the taproom line.' },
        metadata: {},
      })),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({ officialAgentId: 'agent-1', content: 'I lift my blade toward the rafters.' })),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository,
      narrativeRepository,
      gameMasterGenerator,
      turnGenerator,
      makeGameMasterAgentResolver('gm-1')
    )

    await coordinator.processTurn({
      room: room(),
      tick: tick(),
      speaker: participants[0],
      participants,
      recentMessages: [message({ authorKind: 'game_master', tokenId: null })],
    })

    expect(narrativeRepository.updateState).toHaveBeenCalledWith(expect.objectContaining({ id: 'room-1' }), expect.objectContaining({
      metadata: expect.objectContaining({
        ttrpgPhase: 'threat',
        combatReadiness: 'ready',
        threatLevel: 3,
        requestedGameplayAction: null,
        lastCombatTriggerBeatId: null,
        lastCombatReadyBeatId: 'beat-1',
        lastCombatReadyAt: expect.any(String),
        lastEncounterSeed: expect.objectContaining({ title: 'Rafter Crows' }),
      }),
    }))
  })

  it('persists private adventure memory while omitting routine public adventure metadata for a normal narrative beat', async () => {
    const repository = makeRepository()
    usePriorGameMasterMessage(repository)
    const narrativeRepository = makeNarrativeRepository()
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(async () => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: 'A brass door waits under the bell.',
        speakerInstruction: 'Choose how to answer the door.',
        stateAfter: {
          stateSummary: 'The party has found a bell-marked brass door.',
          currentObjective: 'Decide how to open the brass door.',
          openThreads: ['What waits behind the brass door?'],
        },
        ttrpgPhase: 'exploration',
        combatReadiness: 'none',
        threatLevel: 1,
        requestedGameplayAction: null,
        encounterSeed: null,
        sceneCheckRequest: null,
        adventurePatch: {
          currentStakes: 'Opening the brass door may wake what listens beyond it.',
          activeDecision: {
            id: 'brass-door',
            prompt: 'How should Ash approach the brass door?',
            options: [
              { id: 'listen', label: 'Listen first' },
              { id: 'force', label: 'Force it open' },
            ],
          },
          consequenceLedger: [{
            id: 'door-wakes',
            source: 'model-source',
            summary: 'The bell mark begins to hum when approached.',
            status: 'open' as const,
          }],
          clocks: [{ id: 'bell-pressure', label: 'Bell pressure', value: 1, max: 4, summary: 'The bell grows more insistent.' }],
        },
        metadata: {},
      })),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({
        officialAgentId: 'agent-1',
        content: 'I shoulder the door before it can think.',
        declaredAction: {
          summary: 'Ash chooses to force the brass door open.',
          chosenOptionId: 'force',
          actionIntent: 'force_entry',
        },
      })),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository,
      narrativeRepository,
      gameMasterGenerator,
      turnGenerator,
      makeGameMasterAgentResolver('gm-1')
    )

    await coordinator.processTurn({
      room: room(),
      tick: tick(),
      speaker: participants[0],
      participants,
      recentMessages: [message({ authorKind: 'game_master', tokenId: null })],
    })

    expect(narrativeRepository.storeBeatGameMasterOutput).toHaveBeenCalledWith('beat-1', expect.objectContaining({
      metadata: expect.objectContaining({
        adventurePatch: expect.objectContaining({
          currentStakes: 'Opening the brass door may wake what listens beyond it.',
          consequenceLedger: [expect.objectContaining({
            source: 'beat:beat-1',
            id: 'beat:beat-1:consequence:1',
          })],
        }),
      }),
    }))
    expect(narrativeRepository.patchBeatMetadata).toHaveBeenCalledWith('beat-1', expect.objectContaining({
      declaredAction: expect.objectContaining({
        summary: 'Ash chooses to force the brass door open.',
        chosenOptionId: 'force',
      }),
    }))
    expect(repository.appendMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      authorKind: 'game_master',
      metadata: expect.not.objectContaining({ publicAdventure: expect.anything() }),
    }))
    expect(repository.appendMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({
      authorKind: 'agent',
      metadata: expect.not.objectContaining({ publicAdventure: expect.anything() }),
    }))
    expect(narrativeRepository.updateState).toHaveBeenCalledWith(expect.objectContaining({ id: 'room-1' }), expect.objectContaining({
      metadata: expect.objectContaining({
        adventure: expect.objectContaining({
          currentStakes: 'Opening the brass door may wake what listens beyond it.',
          activeDecision: expect.objectContaining({
            selectedOptionId: 'force',
            selectedOptionLabel: 'Force it open',
          }),
          lastDeclaredAction: expect.objectContaining({
            tokenId: 1,
            beatId: 'beat-1',
            chosenOptionId: 'force',
          }),
          lastOutcome: expect.objectContaining({
            kind: 'beat',
            sourceId: 'beat:beat-1',
          }),
          consequenceLedger: [expect.objectContaining({ source: 'beat:beat-1' })],
        }),
      }),
    }))
  })

  it('forces a recurring public game-master beat when cadence thresholds are crossed without starting combat', async () => {
    const repository = makeRepository()
    repository.getPublicAuthorMessageStats.mockResolvedValueOnce({
      messageCount: 6,
      gameMasterMessageCount: 1,
      agentMessageCount: 5,
      latestGameMasterMessageCreatedAt: now,
      latestAgentMessageCreatedAt: now,
    })
    const narrativeRepository = makeNarrativeRepository()
    narrativeRepository.ensureStateForRoom.mockResolvedValueOnce({
      ...narrativeState(),
      metadata: {
        ttrpgPhase: 'exploration',
        combatReadiness: 'none',
        threatLevel: 1,
        adventure: {
          spatialContext: {
            currentArea: 'Crow\'s Den taproom threshold',
            landmarks: ['ash-marked bar'],
            routes: ['cellar stair behind the bar'],
            unresolvedSpatialQuestions: [],
          },
        },
      },
    })
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(async () => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: 'The Crow\'s Den settles back into view: the ash-marked bar, the cellar stair behind it, and the cold threshold all wait for a choice.',
        speakerInstruction: 'Answer from the re-anchored taproom without starting combat.',
        stateAfter: {
          stateSummary: 'The Crow\'s Den taproom is re-anchored around the bar and cellar stair.',
          currentObjective: 'Choose whether to test the cellar stair or hold the threshold.',
          openThreads: ['What waits below the cellar stair?'],
        },
        ttrpgPhase: 'exploration',
        combatReadiness: 'none',
        threatLevel: 1,
        requestedGameplayAction: null,
        encounterSeed: null,
        sceneCheckRequest: null,
        adventurePatch: {
          currentStakes: 'The taproom pressure is visible but not yet combat.',
          spatialContext: {
            currentArea: 'Crow\'s Den taproom threshold',
            landmarks: ['ash-marked bar'],
            routes: ['cellar stair behind the bar'],
            unresolvedSpatialQuestions: ['What waits below the cellar stair?'],
          },
        },
        metadata: {},
      })),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({
        officialAgentId: 'agent-1',
        content: 'I keep one hand on the bar and watch the cellar stair.',
        declaredAction: { summary: 'Ash watches the cellar stair from the bar.', actionIntent: 'watch' },
      })),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository,
      narrativeRepository,
      gameMasterGenerator,
      turnGenerator,
      makeGameMasterAgentResolver('gm-1')
    )
    const recentMessages = [
      message({ id: 'msg-gm-1', sequence: 1, authorKind: 'game_master', tokenId: null, metadata: { messageKind: 'gm_beat' } }),
      ...[2, 3, 4, 5, 6].map((sequence) => message({
        id: `msg-agent-${sequence}`,
        sequence,
        metadata: { messageKind: sequence === 3 ? 'character_action' : 'character_reaction' },
      })),
    ]

    const result = await coordinator.processTurn({
      room: room({ tickCount: 12 }),
      tick: tick(),
      speaker: participants[0],
      participants,
      recentMessages,
    })

    expect(result).toEqual({ selectedTokenId: 1, messageId: 'msg-character', publicGameMasterBeatAppended: true })
    expect(gameMasterGenerator.generateBeat).toHaveBeenCalledWith(expect.objectContaining({
      progressionContext: expect.objectContaining({
        requirePublicNarration: true,
        publicNarrationRequirementReason: 'recurring_public_gm_beat_cadence',
        publicGmBeatCadenceDue: true,
      }),
    }))
    expect(repository.appendMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      authorKind: 'game_master',
      content: expect.stringContaining('cellar stair'),
      metadata: expect.objectContaining({ messageKind: 'gm_beat' }),
    }))
    expect(turnGenerator.generateTurn).toHaveBeenCalledWith(expect.objectContaining({
      narrativeContext: expect.objectContaining({
        spatialContext: expect.objectContaining({
          currentArea: 'Crow\'s Den taproom threshold',
          routes: ['cellar stair behind the bar'],
        }),
      }),
    }))
    expect(narrativeRepository.updateState).toHaveBeenCalledWith(expect.objectContaining({ id: 'room-1' }), expect.objectContaining({
      metadata: expect.objectContaining({
        requestedGameplayAction: null,
        lastCombatTriggerBeatId: null,
        adventure: expect.objectContaining({
          spatialContext: expect.objectContaining({
            currentArea: 'Crow\'s Den taproom threshold',
            routes: ['cellar stair behind the bar'],
          }),
        }),
      }),
    }))
  })

  it('suppresses routine optional public game-master narration after the opener while keeping private direction', async () => {
    const repository = makeRepository()
    usePriorGameMasterMessage(repository)
    const narrativeRepository = makeNarrativeRepository()
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(async () => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: 'The bell rope twitches above the bar before anyone can mistake the silence for safety.',
        speakerInstruction: 'Use the private pressure to choose a response without needing a public GM beat.',
        stateAfter: {
          stateSummary: 'The same quiet pressure hangs over the room.',
          currentObjective: 'Let Ash decide how to answer the quiet pressure.',
          openThreads: ['What does the room want next?'],
        },
        ttrpgPhase: 'story',
        combatReadiness: 'none',
        threatLevel: 0,
        requestedGameplayAction: null,
        encounterSeed: null,
        sceneCheckRequest: null,
        adventurePatch: { currentStakes: 'The room is waiting for a concrete character choice.' },
        metadata: {},
      })),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({
        officialAgentId: 'agent-1',
        content: 'I find myself afraid and mark time by the cold doorway.',
        declaredAction: { summary: 'Ash finds himself afraid and marks time by the cold doorway.', actionIntent: 'reflect' },
      })),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository,
      narrativeRepository,
      gameMasterGenerator,
      turnGenerator,
      makeGameMasterAgentResolver('gm-1')
    )

    const result = await coordinator.processTurn({
      room: room(),
      tick: tick(),
      speaker: participants[0],
      participants,
      recentMessages: [message({ authorKind: 'game_master', tokenId: null })],
    })

    expect(result).toEqual({ selectedTokenId: 1, messageId: 'msg-character' })
    expect(narrativeRepository.storeBeatGameMasterOutput).toHaveBeenCalledWith('beat-1', expect.objectContaining({
      publicNarration: 'The bell rope twitches above the bar before anyone can mistake the silence for safety.',
      speakerInstruction: 'Use the private pressure to choose a response without needing a public GM beat.',
    }))
    expect(repository.appendMessage).toHaveBeenCalledTimes(1)
    expect(repository.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
      authorKind: 'agent',
      content: 'I find myself afraid and mark time by the cold doorway.',
      metadata: expect.objectContaining({ messageKind: 'character_reaction' }),
    }))
    expect(turnGenerator.generateTurn).toHaveBeenCalledWith(expect.objectContaining({
      narrativeContext: expect.objectContaining({
        publicNarration: null,
        speakerInstruction: 'Use the private pressure to choose a response without needing a public GM beat.',
        sceneCheck: expect.objectContaining({ mode: 'optional', request: null }),
      }),
    }))
  })

  it('reuses a previously appended game-master beat on retry without regenerating or duplicating cadence narration', async () => {
    const repository = makeRepository()
    repository.getPublicAuthorMessageStats.mockResolvedValueOnce({
      messageCount: 6,
      gameMasterMessageCount: 1,
      agentMessageCount: 5,
      latestGameMasterMessageCreatedAt: now,
      latestAgentMessageCreatedAt: now,
    })
    const narrativeRepository = makeNarrativeRepository(beat({
      status: 'game_master_message_appended',
      gameMasterAgentId: 'gm-1',
      publicNarration: 'The bell tolls once.',
      speakerInstruction: 'Answer with dread.',
      stateAfter: {
        stateSummary: 'The bell has called Ash.',
        currentObjective: 'Answer the toll.',
        openThreads: ['Who rang it?'],
      },
    }))
    narrativeRepository.ensureStateForRoom.mockResolvedValueOnce({
      ...narrativeState(),
      metadata: { ttrpgPhase: 'exploration', combatReadiness: 'none', threatLevel: 1 },
    })
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({ officialAgentId: 'agent-1', content: 'Still I hear it.' })),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository,
      narrativeRepository,
      gameMasterGenerator,
      turnGenerator,
      makeGameMasterAgentResolver('gm-1')
    )

    await coordinator.processTurn({
      room: room(),
      tick: tick({ attempts: 2 }),
      speaker: participants[0],
      participants,
      recentMessages: [
        message({ id: 'msg-gm-1', sequence: 1, authorKind: 'game_master', tokenId: null, metadata: { messageKind: 'gm_beat' } }),
        ...[2, 3, 4, 5, 6].map((sequence) => message({
          id: `msg-agent-${sequence}`,
          sequence,
          metadata: { messageKind: 'character_reaction' },
        })),
      ],
    })

    expect(gameMasterGenerator.generateBeat).not.toHaveBeenCalled()
    expect(repository.appendMessage).toHaveBeenCalledTimes(1)
    expect(repository.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
      authorKind: 'agent',
      content: 'Still I hear it.',
    }))
  })

  it('reuses stored character action metadata on retry without regenerating the character turn', async () => {
    const repository = makeRepository()
    usePriorGameMasterMessage(repository)
    const narrativeRepository = makeNarrativeRepository(beat({
      status: 'game_master_message_appended',
      gameMasterAgentId: 'gm-1',
      publicNarration: 'The stored door waits.',
      speakerInstruction: 'Use the stored character action.',
      stateAfter: {
        stateSummary: 'A stored choice waits at the door.',
        currentObjective: 'Resolve the stored choice.',
        openThreads: ['What opens?'],
      },
      metadata: {
        adventurePatch: {
          currentStakes: 'The stored door may still wake.',
          activeDecision: {
            id: 'stored-door',
            prompt: 'How does Ash handle the stored door?',
            options: [
              { id: 'listen', label: 'Listen first' },
              { id: 'force', label: 'Force it open' },
            ],
          },
        },
        characterAction: {
          content: 'Stored Ash forces the door.',
          officialAgentId: 'agent-1',
          authorName: 'Ash',
        },
        declaredAction: {
          summary: 'Ash follows the stored choice to force the door.',
          chosenOptionId: 'force',
          actionIntent: 'force_entry',
        },
      },
    }))
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository,
      narrativeRepository,
      gameMasterGenerator,
      turnGenerator,
      makeGameMasterAgentResolver('gm-1')
    )

    await coordinator.processTurn({
      room: room(),
      tick: tick({ attempts: 2 }),
      speaker: participants[0],
      participants,
      recentMessages: [message({ authorKind: 'game_master', tokenId: null })],
    })

    expect(gameMasterGenerator.generateBeat).not.toHaveBeenCalled()
    expect(turnGenerator.generateTurn).not.toHaveBeenCalled()
    expect(repository.appendMessage).toHaveBeenCalledTimes(1)
    expect(repository.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
      authorKind: 'agent',
      content: 'Stored Ash forces the door.',
      dedupeKey: 'narrative:beat-1:character_reaction',
      metadata: expect.not.objectContaining({ publicAdventure: expect.anything() }),
    }))
    expect(narrativeRepository.updateState).toHaveBeenCalledWith(expect.objectContaining({ id: 'room-1' }), expect.objectContaining({
      metadata: expect.objectContaining({
        adventure: expect.objectContaining({
          activeDecision: expect.objectContaining({ selectedOptionId: 'force' }),
          lastDeclaredAction: expect.objectContaining({ summary: 'Ash follows the stored choice to force the door.' }),
        }),
      }),
    }))
  })

  it('reuses stored generated output on retry and appends an eligible game-master message if it was not marked appended', async () => {
    const repository = makeRepository()
    usePriorGameMasterMessage(repository)
    const narrativeRepository = makeNarrativeRepository(beat({
      status: 'failed',
      gameMasterAgentId: 'gm-1',
      publicNarration: 'The stored bell tolls once.',
      speakerInstruction: 'Use the stored instruction.',
      stateAfter: {
        stateSummary: 'The stored state survives retry.',
        currentObjective: 'Keep retry idempotent.',
        openThreads: ['Stored unresolved thread.'],
      },
      metadata: {
        ttrpgPhase: 'threat',
        combatReadiness: 'ready',
        threatLevel: 4,
        requestedGameplayAction: 'start_combat',
        encounterSeed: { title: 'Stored Bell Horror', summary: 'The stored threat is ready.', stakes: 'Survive the retry.' },
        adventurePatch: { currentStakes: 'Survive the retry.' },
      },
    }))
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({ officialAgentId: 'agent-1', content: 'The stored path holds.' })),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository,
      narrativeRepository,
      gameMasterGenerator,
      turnGenerator,
      makeGameMasterAgentResolver('gm-1')
    )

    await coordinator.processTurn({
      room: room(),
      tick: tick({ attempts: 2 }),
      speaker: participants[0],
      participants,
      recentMessages: [],
    })

    expect(gameMasterGenerator.generateBeat).not.toHaveBeenCalled()
    expect(repository.appendMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      authorKind: 'game_master',
      content: 'The stored bell tolls once.',
    }))
    expect(turnGenerator.generateTurn).toHaveBeenCalledWith(expect.objectContaining({
      narrativeContext: expect.objectContaining({
        speakerInstruction: 'Use the stored instruction.',
        stateSummary: 'The stored state survives retry.',
      }),
    }))
  })

  it('rejects a first/no-prior-GM beat missing public narration before character output', async () => {
    const repository = makeRepository()
    const narrativeRepository = makeNarrativeRepository()
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(async () => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: null,
        speakerInstruction: 'Speak into the silence.',
        stateAfter: {
          stateSummary: 'The room remains silent.',
          currentObjective: 'Find the bell.',
          openThreads: ['Who rang it?'],
        },
        ttrpgPhase: 'exploration',
        combatReadiness: 'none',
        threatLevel: 0,
        requestedGameplayAction: null,
        encounterSeed: null,
        sceneCheckRequest: null,
        adventurePatch: { currentStakes: 'Find the bell.' },
        metadata: {},
      })),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository,
      narrativeRepository,
      gameMasterGenerator,
      turnGenerator,
      makeGameMasterAgentResolver('gm-1')
    )

    await expect(coordinator.processTurn({
      room: room(),
      tick: tick(),
      speaker: participants[0],
      participants,
      recentMessages: [],
    })).rejects.toThrow('publicNarration')

    expect(repository.appendMessage).not.toHaveBeenCalled()
    expect(turnGenerator.generateTurn).not.toHaveBeenCalled()
    expect(narrativeRepository.storeBeatGameMasterOutput).not.toHaveBeenCalled()
  })

  it('marks a failed game-master repair on the beat without appending public output', async () => {
    const repository = makeRepository()
    const narrativeRepository = makeNarrativeRepository()
    const diagnostics: GameMasterGenerationDiagnostics = {
      status: 'repair_failed',
      repairAttempted: true,
      repaired: false,
      initialErrorCategory: 'invalid_json',
      repairErrorCategory: 'progression_contract',
      initialResponseLength: 12,
      repairResponseLength: 83,
      initialResponseFlags: {
        empty: false,
        hasJsonObject: true,
        fencedJson: false,
        startsWithJsonObject: true,
      },
      repairResponseFlags: {
        empty: false,
        hasJsonObject: true,
        fencedJson: false,
        startsWithJsonObject: true,
      },
    }
    const error = new GameMasterBeatGenerationError('Game-master beat repair failed (initial: invalid_json, repair: progression_contract)', diagnostics)
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(async () => {
        throw error
      }),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository,
      narrativeRepository,
      gameMasterGenerator,
      turnGenerator,
      makeGameMasterAgentResolver('gm-1')
    )

    await expect(coordinator.processTurn({
      room: room(),
      tick: tick(),
      speaker: participants[0],
      participants,
      recentMessages: [],
    })).rejects.toThrow('Game-master beat repair failed')

    expect(narrativeRepository.markBeatFailed).toHaveBeenCalledWith('beat-1', error, {
      metadata: expect.objectContaining({
        gmGeneration: diagnostics,
      }),
    })
    expect(repository.appendMessage).not.toHaveBeenCalled()
    expect(turnGenerator.generateTurn).not.toHaveBeenCalled()
    expect(narrativeRepository.updateState).not.toHaveBeenCalled()
    expect(narrativeRepository.storeBeatGameMasterOutput).not.toHaveBeenCalled()
  })

  it('rejects stored generated output missing required first public narration', async () => {
    const repository = makeRepository()
    const narrativeRepository = makeNarrativeRepository(beat({
      status: 'failed',
      gameMasterAgentId: 'gm-1',
      publicNarration: null,
      speakerInstruction: 'Use the stored instruction.',
      stateAfter: {
        stateSummary: 'The stored state has no public GM narration.',
        currentObjective: 'Keep retry idempotent.',
        openThreads: ['Stored unresolved thread.'],
      },
    }))
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository,
      narrativeRepository,
      gameMasterGenerator,
      turnGenerator,
      makeGameMasterAgentResolver('gm-1')
    )

    await expect(coordinator.processTurn({
      room: room(),
      tick: tick({ attempts: 2 }),
      speaker: participants[0],
      participants,
      recentMessages: [],
    })).rejects.toThrow('publicNarration')

    expect(gameMasterGenerator.generateBeat).not.toHaveBeenCalled()
    expect(repository.appendMessage).not.toHaveBeenCalled()
    expect(turnGenerator.generateTurn).not.toHaveBeenCalled()
    expect(narrativeRepository.updateState).not.toHaveBeenCalled()
  })

  it('rejects stored generated output that no longer satisfies the guided progression contract', async () => {
    const repository = makeRepository()
    usePriorGameMasterMessage(repository)
    const narrativeRepository = makeNarrativeRepository(beat({
      status: 'failed',
      gameMasterAgentId: 'gm-1',
      publicNarration: 'The stored bell tolls once.',
      speakerInstruction: 'Use the stored instruction.',
      stateAfter: {
        stateSummary: 'The stored state is too weak.',
        currentObjective: 'Keep retry idempotent.',
        openThreads: [],
      },
    }))
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository,
      narrativeRepository,
      gameMasterGenerator,
      turnGenerator,
      makeGameMasterAgentResolver('gm-1')
    )

    await expect(coordinator.processTurn({
      room: room(),
      tick: tick({ attempts: 2 }),
      speaker: participants[0],
      participants,
      recentMessages: [],
    })).rejects.toThrow('openThreads')

    expect(gameMasterGenerator.generateBeat).not.toHaveBeenCalled()
    expect(repository.appendMessage).not.toHaveBeenCalled()
    expect(turnGenerator.generateTurn).not.toHaveBeenCalled()
    expect(narrativeRepository.updateState).not.toHaveBeenCalled()
  })

  it('rejects stored generated output that remains flat when repeated activity requires escalation', async () => {
    const repository = makeRepository()
    repository.getPublicAuthorMessageStats.mockResolvedValueOnce({
      messageCount: 3,
      gameMasterMessageCount: 1,
      agentMessageCount: 2,
      latestGameMasterMessageCreatedAt: now,
      latestAgentMessageCreatedAt: now,
    })
    const narrativeRepository = makeNarrativeRepository(beat({
      status: 'failed',
      gameMasterAgentId: 'gm-1',
      publicNarration: 'The stored bell repeats.',
      speakerInstruction: 'Use the stored instruction.',
      stateAfter: {
        stateSummary: 'The stored state remains flat.',
        currentObjective: 'Keep retry idempotent.',
        openThreads: ['Stored unresolved thread.'],
      },
      metadata: {
        ttrpgPhase: 'story',
        combatReadiness: 'none',
        threatLevel: 0,
      },
    }))
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository,
      narrativeRepository,
      gameMasterGenerator,
      turnGenerator,
      makeGameMasterAgentResolver('gm-1')
    )

    await expect(coordinator.processTurn({
      room: room({ tickCount: 2 }),
      tick: tick({ attempts: 2 }),
      speaker: participants[0],
      participants,
      recentMessages: [message({ authorKind: 'game_master', tokenId: null })],
    })).rejects.toThrow('visibly escalate')

    expect(gameMasterGenerator.generateBeat).not.toHaveBeenCalled()
    expect(repository.appendMessage).not.toHaveBeenCalled()
    expect(turnGenerator.generateTurn).not.toHaveBeenCalled()
    expect(narrativeRepository.updateState).not.toHaveBeenCalled()
  })

  it('returns the appended character message even when post-append narrative bookkeeping fails', async () => {
    const repository = makeRepository()
    repository.getPublicAuthorMessageStats.mockResolvedValueOnce({
      messageCount: 2,
      gameMasterMessageCount: 1,
      agentMessageCount: 1,
      latestGameMasterMessageCreatedAt: now,
      latestAgentMessageCreatedAt: now,
    })
    const narrativeRepository = makeNarrativeRepository()
    narrativeRepository.updateState.mockRejectedValueOnce(new Error('state unavailable'))
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(async () => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: null,
        speakerInstruction: 'Answer the existing GM lead with a concrete public character action.',
        stateAfter: {
          stateSummary: 'State after public character output.',
          currentObjective: 'Follow the existing GM lead.',
          openThreads: ['Who answers next?'],
        },
        ttrpgPhase: 'story',
        combatReadiness: 'none',
        threatLevel: null,
        requestedGameplayAction: null,
        encounterSeed: null,
        sceneCheckRequest: null,
        adventurePatch: { currentStakes: 'Find the bell.' },
        metadata: {},
      })),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({ officialAgentId: 'agent-1', content: 'I have already spoken.' })),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository,
      narrativeRepository,
      gameMasterGenerator,
      turnGenerator,
      makeGameMasterAgentResolver('gm-1')
    )

    const result = await coordinator.processTurn({
      room: room(),
      tick: tick(),
      speaker: participants[0],
      participants,
      recentMessages: [],
    })

    expect(result).toEqual({ selectedTokenId: 1, messageId: 'msg-character' })
    expect(repository.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
      authorKind: 'agent',
      content: 'I have already spoken.',
    }))
    expect(narrativeRepository.markBeatFailed).toHaveBeenCalledWith('beat-1', expect.any(Error))
    expect(narrativeRepository.markBeatCompleted).not.toHaveBeenCalled()
  })

  it('generates scene-check rolls from risky investigative declared actions without combat or routine GM beat', async () => {
    const repository = makeRepository()
    usePriorGameMasterMessage(repository)
    repository.appendMessage.mockImplementation(async (input) => message({
      id: `msg-${repository.appendMessage.mock.calls.length}`,
      authorKind: input.authorKind,
      tokenId: input.tokenId ?? null,
      officialAgentId: input.officialAgentId ?? null,
      authorName: input.authorName,
      content: input.content,
      metadata: input.metadata ?? {},
    }))
    const narrativeRepository = makeNarrativeRepository()
    narrativeRepository.ensureStateForRoom.mockResolvedValueOnce({
      ...narrativeState(),
      metadata: {
        ttrpgPhase: 'exploration',
        combatReadiness: 'none',
        threatLevel: 0,
      },
    })
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(async () => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: 'The bell rope twitches above the bar before anyone can mistake the silence for safety.',
        speakerInstruction: 'If Ash inspects the scratches, let the uncertainty resolve as a scene check.',
        stateAfter: {
          stateSummary: 'Scratches on the wall may hide a route or warning.',
          currentObjective: 'Decide whether to inspect the scratches.',
          openThreads: ['What made the scratches?'],
        },
        ttrpgPhase: 'exploration',
        combatReadiness: 'none',
        threatLevel: 0,
        requestedGameplayAction: null,
        encounterSeed: null,
        sceneCheckRequest: null,
        adventurePatch: { currentStakes: 'The scratches may reveal the safest route.' },
        metadata: {},
      })),
      generateSceneCheckOutcome: jest.fn(async ({ resolution }) => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: `The scratches answer ${resolution.roll.tier}.`,
        stateAfter: {
          stateSummary: 'The scratched marks have been inspected.',
          currentObjective: 'Choose whether to follow what the scratches imply.',
          openThreads: ['What waits beyond the scratched route?'],
        },
        adventurePatch: {
          consequenceLedger: [{ id: 'scratches-answer', source: 'scene', summary: 'The scratches reveal a route at a cost.', status: 'complication' as const, tier: resolution.roll.tier }],
        },
        metadata: {},
      })),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({
        officialAgentId: 'agent-1',
        content: 'I inspect the scratches and try to decipher where they point.',
        declaredAction: {
          summary: 'Ash inspects the scratches and tries to decipher where they point.',
          actionIntent: 'inspect scratches',
        },
        sceneCheckProposal: null,
      })),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository,
      narrativeRepository,
      gameMasterGenerator,
      turnGenerator,
      makeGameMasterAgentResolver('gm-1')
    )

    const result = await coordinator.processTurn({
      room: room(),
      tick: tick(),
      speaker: participants[0],
      participants,
      recentMessages: [message({ authorKind: 'game_master', tokenId: null })],
    })

    expect(turnGenerator.generateTurn).toHaveBeenCalledWith(expect.objectContaining({
      narrativeContext: expect.objectContaining({
        publicNarration: null,
        sceneCheck: expect.objectContaining({ mode: 'optional' }),
      }),
    }))
    expect(result).toEqual(expect.objectContaining({
      selectedTokenId: 1,
      messageId: 'msg-3',
      messageIds: ['msg-1', 'msg-2', 'msg-3'],
      sceneCheckId: 'scene_check:beat-1',
    }))
    expect(repository.appendMessage.mock.calls.map(([input]) => input.metadata?.messageKind)).toEqual([
      'character_action',
      'roll_card',
      'gm_outcome',
    ])
    expect(repository.appendMessage.mock.calls.map(([input]) => input.authorKind)).toEqual([
      'agent',
      'game_master',
      'game_master',
    ])
    expect(repository.appendMessage.mock.calls[1][0].metadata?.publicRolls).toEqual(expect.objectContaining({
      rollContext: 'scene_check',
      sceneCheck: expect.objectContaining({
        sceneCheckId: 'scene_check:beat-1',
        adjudicationSource: 'backend',
        adjudicationReason: 'backend_fallback',
      }),
      action: expect.objectContaining({
        actionType: 'recall_lore',
        checkType: 'arcana',
      }),
    }))
    expect(repository.appendMessage.mock.calls[0][0].metadata).not.toHaveProperty('publicAdventure')
    expect(repository.appendMessage.mock.calls[1][0].metadata).not.toHaveProperty('publicAdventure')
    expect(repository.appendMessage.mock.calls[2][0].metadata).not.toHaveProperty('publicAdventure')
    expect(gameMasterGenerator.generateSceneCheckOutcome).toHaveBeenCalled()
  })

  it('persists scene-check outcome escalation as combat-ready metadata without creating a combat trigger', async () => {
    const request = normalizeSceneCheckRequest({
      id: 'ash-marks',
      actionIntent: 'search',
      rollChoice: { source: 'fixed', checkType: 'perception' },
    })
    if (!request.ok) throw new Error(request.error)
    const repository = makeRepository()
    usePriorGameMasterMessage(repository)
    repository.appendMessage.mockImplementation(async (input) => message({
      id: `msg-${repository.appendMessage.mock.calls.length}`,
      authorKind: input.authorKind,
      tokenId: input.tokenId ?? null,
      officialAgentId: input.officialAgentId ?? null,
      authorName: input.authorName,
      content: input.content,
      metadata: input.metadata ?? {},
    }))
    const narrativeRepository = makeNarrativeRepository()
    narrativeRepository.ensureStateForRoom.mockResolvedValueOnce({
      ...narrativeState(),
      metadata: { ttrpgPhase: 'exploration', combatReadiness: 'none', threatLevel: 0 },
    })
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(async () => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: null,
        speakerInstruction: 'Search the ash marks.',
        stateAfter: {
          stateSummary: 'The ash marks invite a search.',
          currentObjective: 'Search the ash marks.',
          openThreads: ['What do the marks hide?'],
        },
        ttrpgPhase: 'exploration',
        combatReadiness: 'none',
        threatLevel: 0,
        requestedGameplayAction: null,
        encounterSeed: null,
        sceneCheckRequest: request.value,
        adventurePatch: { currentStakes: 'Search the ash marks.' },
        metadata: { sceneCheck: { request: request.value, proposal: null, proposalError: null } },
      })),
      generateSceneCheckOutcome: jest.fn(async () => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: 'The ash marks answer with pressure: attention turns hostile, the route narrows, and the group must choose how to answer the watcher.',
        stateAfter: {
          stateSummary: 'The ash marks have turned the watcher toward the stair.',
          currentObjective: 'Choose how to answer the watcher.',
          openThreads: ['Does the group hold the stair or draw the watcher away?'],
        },
        adventurePatch: {
          consequenceLedger: [{ id: 'watcher-turns', source: 'scene', summary: 'The watcher turns toward the stair.', status: 'complication' as const, tier: 'failure' }],
        },
        escalation: {
          decision: 'combat_ready',
          dangerKind: 'monster_pressure',
          reason: 'The watcher is now close enough for the next GM beat to choose combat.',
          threatLevel: 4,
          encounterSeed: {
            title: 'Ash Watcher',
            summary: 'A hostile watcher presses toward the stair.',
            stakes: 'Hold the stair or draw it away.',
          },
          catalogEntryIds: ['80.10.ash-watcher'],
        },
        ttrpgMetadataPatch: {
          ttrpgPhase: 'threat',
          combatReadiness: 'ready',
          threatLevel: 4,
          requestedGameplayAction: null,
          lastEncounterSeed: {
            title: 'Ash Watcher',
            summary: 'A hostile watcher presses toward the stair.',
            stakes: 'Hold the stair or draw it away.',
          },
        },
        metadata: {},
      })),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({
        officialAgentId: 'agent-1',
        content: 'I search the ash for the hidden watcher.',
        declaredAction: { summary: 'Ash searches the ash for the hidden watcher.', actionIntent: 'search' },
      })),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository,
      narrativeRepository,
      gameMasterGenerator,
      turnGenerator,
      makeGameMasterAgentResolver('gm-1'),
      () => 0
    )

    await coordinator.processTurn({
      room: room(),
      tick: tick(),
      speaker: participants[0],
      participants,
      recentMessages: [message({ authorKind: 'game_master', tokenId: null })],
    })

    expect(repository.appendMessage.mock.calls[2][0].metadata).toEqual(expect.objectContaining({
      messageKind: 'gm_outcome',
      sceneCheckEscalation: expect.objectContaining({ decision: 'combat_ready' }),
    }))
    expect(narrativeRepository.updateState).toHaveBeenCalledWith(expect.objectContaining({ id: 'room-1' }), expect.objectContaining({
      metadata: expect.objectContaining({
        ttrpgPhase: 'threat',
        combatReadiness: 'ready',
        threatLevel: 4,
        requestedGameplayAction: null,
        lastCombatTriggerBeatId: null,
        lastCombatReadyBeatId: 'beat-1',
        lastCombatReadySceneCheckId: 'scene_check:beat-1:ash-marks',
        lastCombatReadyAt: expect.any(String),
        lastEncounterSeed: expect.objectContaining({ title: 'Ash Watcher' }),
        lastSceneCheckEscalation: expect.objectContaining({
          decision: 'combat_ready',
          dangerKind: 'monster_pressure',
          threatLevel: 4,
        }),
        sceneCheckEscalations: expect.objectContaining({
          'scene_check:beat-1:ash-marks': expect.objectContaining({ decision: 'combat_ready' }),
        }),
      }),
    }))
  })

  it('preserves an unrelated unconsumed explicit combat trigger after scene-check outcome escalation', async () => {
    const request = normalizeSceneCheckRequest({
      id: 'ash-marks',
      actionIntent: 'search',
      rollChoice: { source: 'fixed', checkType: 'perception' },
    })
    if (!request.ok) throw new Error(request.error)
    const repository = makeRepository()
    usePriorGameMasterMessage(repository)
    repository.appendMessage.mockImplementation(async (input) => message({
      id: `msg-${repository.appendMessage.mock.calls.length}`,
      authorKind: input.authorKind,
      tokenId: input.tokenId ?? null,
      officialAgentId: input.officialAgentId ?? null,
      authorName: input.authorName,
      content: input.content,
      metadata: input.metadata ?? {},
    }))
    const narrativeRepository = makeNarrativeRepository()
    narrativeRepository.ensureStateForRoom.mockResolvedValueOnce({
      ...narrativeState(),
      metadata: {
        ttrpgPhase: 'threat',
        combatReadiness: 'ready',
        threatLevel: 5,
        requestedGameplayAction: 'start_combat',
        lastCombatTriggerBeatId: 'beat-explicit',
        consumedCombatTriggerBeatId: null,
        lastEncounterSeed: {
          title: 'Waiting Maw',
          summary: 'An existing combat trigger waits at the gate.',
          stakes: 'Answer the gate.',
        },
      },
    })
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(async () => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: null,
        speakerInstruction: 'Search the ash marks.',
        stateAfter: {
          stateSummary: 'The ash marks invite a search.',
          currentObjective: 'Search the ash marks.',
          openThreads: ['What do the marks hide?'],
        },
        ttrpgPhase: 'exploration',
        combatReadiness: 'none',
        threatLevel: 0,
        requestedGameplayAction: null,
        encounterSeed: null,
        sceneCheckRequest: request.value,
        adventurePatch: { currentStakes: 'Search the ash marks.' },
        metadata: { sceneCheck: { request: request.value, proposal: null, proposalError: null } },
      })),
      generateSceneCheckOutcome: jest.fn(async () => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: 'The ash marks answer with pressure: attention turns hostile, the route narrows, and the group must choose how to answer the watcher.',
        stateAfter: {
          stateSummary: 'The ash marks have turned the watcher toward the stair.',
          currentObjective: 'Choose how to answer the watcher.',
          openThreads: ['Does the group hold the stair or draw the watcher away?'],
        },
        adventurePatch: {
          consequenceLedger: [{ id: 'watcher-turns', source: 'scene', summary: 'The watcher turns toward the stair.', status: 'complication' as const, tier: 'failure' }],
        },
        escalation: {
          decision: 'combat_ready',
          dangerKind: 'monster_pressure',
          reason: 'The watcher is now close enough for the next GM beat to choose combat.',
          threatLevel: 4,
          encounterSeed: {
            title: 'Ash Watcher',
            summary: 'A hostile watcher presses toward the stair.',
            stakes: 'Hold the stair or draw it away.',
          },
        },
        metadata: {},
      })),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({
        officialAgentId: 'agent-1',
        content: 'I search the ash for the hidden watcher.',
        declaredAction: { summary: 'Ash searches the ash for the hidden watcher.', actionIntent: 'search' },
      })),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository,
      narrativeRepository,
      gameMasterGenerator,
      turnGenerator,
      makeGameMasterAgentResolver('gm-1'),
      () => 0
    )

    await coordinator.processTurn({
      room: room(),
      tick: tick(),
      speaker: participants[0],
      participants,
      recentMessages: [message({ authorKind: 'game_master', tokenId: null })],
    })

    expect(narrativeRepository.updateState).toHaveBeenCalledWith(expect.objectContaining({ id: 'room-1' }), expect.objectContaining({
      metadata: expect.objectContaining({
        ttrpgPhase: 'threat',
        combatReadiness: 'ready',
        threatLevel: 5,
        requestedGameplayAction: 'start_combat',
        lastCombatTriggerBeatId: 'beat-explicit',
        consumedCombatTriggerBeatId: null,
        lastCombatReadyBeatId: 'beat-1',
        lastCombatReadySceneCheckId: 'scene_check:beat-1:ash-marks',
        lastCombatReadyAt: expect.any(String),
        lastEncounterSeed: expect.objectContaining({ title: 'Waiting Maw' }),
        lastSceneCheckEscalation: expect.objectContaining({ decision: 'combat_ready' }),
      }),
    }))
  })

  it('avoids a third consecutive backend-inferred perception check when another valid fallback fits', async () => {
    const repository = makeRepository()
    usePriorGameMasterMessage(repository)
    repository.appendMessage.mockImplementation(async (input) => message({
      id: `msg-${repository.appendMessage.mock.calls.length}`,
      authorKind: input.authorKind,
      tokenId: input.tokenId ?? null,
      officialAgentId: input.officialAgentId ?? null,
      authorName: input.authorName,
      content: input.content,
      metadata: input.metadata ?? {},
    }))
    const narrativeRepository = makeNarrativeRepository()
    narrativeRepository.ensureStateForRoom.mockResolvedValueOnce({
      ...narrativeState(),
      metadata: { ttrpgPhase: 'exploration', combatReadiness: 'none', threatLevel: 0 },
    })
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(async () => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: null,
        speakerInstruction: 'Let Ash choose how to inspect the marked shelf.',
        stateAfter: {
          stateSummary: 'A marked shelf may hide a clue or route.',
          currentObjective: 'Decide how to inspect the marked shelf.',
          openThreads: ['What does the shelf conceal?'],
        },
        ttrpgPhase: 'exploration',
        combatReadiness: 'none',
        threatLevel: 0,
        requestedGameplayAction: null,
        encounterSeed: null,
        sceneCheckRequest: null,
        adventurePatch: { currentStakes: 'The shelf may reveal a safer route.' },
        metadata: {},
      })),
      generateSceneCheckOutcome: jest.fn(async ({ resolution }) => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: `The marked shelf answers ${resolution.roll.checkType}.`,
        stateAfter: {
          stateSummary: 'The marked shelf has answered the inspection.',
          currentObjective: 'Choose what to do with the revealed shelf mark.',
          openThreads: ['What watches the shelf?'],
        },
        adventurePatch: {
          consequenceLedger: [{ id: 'shelf-answer', source: 'scene', summary: 'The shelf reveals a route at a cost.', status: 'complication' as const, tier: resolution.roll.tier }],
        },
        metadata: {},
      })),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({
        officialAgentId: 'agent-1',
        content: 'I search the shelf and inspect the scratches around its latch.',
        declaredAction: {
          summary: 'Ash searches the shelf and inspects the scratches around its latch.',
          actionIntent: 'search inspect',
        },
        sceneCheckProposal: null,
      })),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository,
      narrativeRepository,
      gameMasterGenerator,
      turnGenerator,
      makeGameMasterAgentResolver('gm-1')
    )

    await coordinator.processTurn({
      room: room(),
      tick: tick(),
      speaker: participants[0],
      participants,
      recentMessages: [sceneCheckRollMessage('perception', 1), sceneCheckRollMessage('perception', 2)],
    })

    expect(repository.appendMessage.mock.calls[1][0].metadata?.publicRolls).toEqual(expect.objectContaining({
      sceneCheck: expect.objectContaining({ adjudicationReason: 'backend_fallback' }),
      action: expect.objectContaining({ checkType: 'investigate' }),
    }))
  })

  it('avoids a third consecutive backend-inferred investigate check when a visual examine alternative fits', async () => {
    const repository = makeRepository()
    usePriorGameMasterMessage(repository)
    repository.appendMessage.mockImplementation(async (input) => message({
      id: `msg-${repository.appendMessage.mock.calls.length}`,
      authorKind: input.authorKind,
      tokenId: input.tokenId ?? null,
      officialAgentId: input.officialAgentId ?? null,
      authorName: input.authorName,
      content: input.content,
      metadata: input.metadata ?? {},
    }))
    const narrativeRepository = makeNarrativeRepository()
    narrativeRepository.ensureStateForRoom.mockResolvedValueOnce({
      ...narrativeState(),
      metadata: { ttrpgPhase: 'exploration', combatReadiness: 'none', threatLevel: 0 },
    })
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(async () => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: null,
        speakerInstruction: 'Let Ash inspect the marked wall.',
        stateAfter: {
          stateSummary: 'A marked wall may hide a visible clue.',
          currentObjective: 'Inspect the marked wall.',
          openThreads: ['What does the wall show?'],
        },
        ttrpgPhase: 'exploration',
        combatReadiness: 'none',
        threatLevel: 0,
        requestedGameplayAction: null,
        encounterSeed: null,
        sceneCheckRequest: null,
        adventurePatch: { currentStakes: 'The wall marks may reveal a route.' },
        metadata: {},
      })),
      generateSceneCheckOutcome: jest.fn(async ({ resolution }) => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: `The marked wall answers ${resolution.roll.checkType}.`,
        stateAfter: {
          stateSummary: 'The marked wall changes the room.',
          currentObjective: 'Choose what to do with the mark.',
          openThreads: ['What waits behind the wall?'],
        },
        adventurePatch: { consequenceLedger: [{ id: 'wall-answer', source: 'scene', summary: 'The wall mark changes the next choice.', status: 'complication' as const, tier: resolution.roll.tier }] },
        metadata: {},
      })),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({
        officialAgentId: 'agent-1',
        content: 'I inspect the marked wall and scan the scratches for a visible seam.',
        declaredAction: {
          summary: 'Ash inspects the marked wall and scans the scratches for a visible seam.',
          actionIntent: 'inspect wall',
        },
        sceneCheckProposal: null,
      })),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(repository, narrativeRepository, gameMasterGenerator, turnGenerator, makeGameMasterAgentResolver('gm-1'))

    await coordinator.processTurn({
      room: room(),
      tick: tick(),
      speaker: participants[0],
      participants,
      recentMessages: [sceneCheckRollMessage('investigate', 1), sceneCheckRollMessage('investigate', 2)],
    })

    expect(repository.appendMessage.mock.calls[1][0].metadata?.publicRolls).toEqual(expect.objectContaining({
      sceneCheck: expect.objectContaining({ adjudicationReason: 'backend_fallback' }),
      action: expect.objectContaining({ checkType: 'perception' }),
    }))
  })

  it('preserves a repeated backend-inferred perception check when no valid fallback alternative fits', async () => {
    const repository = makeRepository()
    usePriorGameMasterMessage(repository)
    repository.appendMessage.mockImplementation(async (input) => message({
      id: `msg-${repository.appendMessage.mock.calls.length}`,
      authorKind: input.authorKind,
      tokenId: input.tokenId ?? null,
      officialAgentId: input.officialAgentId ?? null,
      authorName: input.authorName,
      content: input.content,
      metadata: input.metadata ?? {},
    }))
    const narrativeRepository = makeNarrativeRepository()
    narrativeRepository.ensureStateForRoom.mockResolvedValueOnce({
      ...narrativeState(),
      metadata: { ttrpgPhase: 'exploration', combatReadiness: 'none', threatLevel: 0 },
    })
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(async () => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: null,
        speakerInstruction: 'Let Ash search for the hidden bell.',
        stateAfter: {
          stateSummary: 'The hidden bell may be somewhere nearby.',
          currentObjective: 'Search for the hidden bell.',
          openThreads: ['Where is the bell?'],
        },
        ttrpgPhase: 'exploration',
        combatReadiness: 'none',
        threatLevel: 0,
        requestedGameplayAction: null,
        encounterSeed: null,
        sceneCheckRequest: null,
        adventurePatch: { currentStakes: 'Finding the bell matters before it tolls again.' },
        metadata: {},
      })),
      generateSceneCheckOutcome: jest.fn(async ({ resolution }) => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: `The hidden bell answers ${resolution.roll.checkType}.`,
        stateAfter: {
          stateSummary: 'The search for the hidden bell changes the room.',
          currentObjective: 'Choose what to do about the bell.',
          openThreads: ['What wakes if it tolls?'],
        },
        adventurePatch: {
          consequenceLedger: [{ id: 'bell-answer', source: 'scene', summary: 'The search leaves a consequence.', status: 'complication' as const, tier: resolution.roll.tier }],
        },
        metadata: {},
      })),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({
        officialAgentId: 'agent-1',
        content: 'I search for the hidden bell in the dust.',
        declaredAction: { summary: 'Ash searches for the hidden bell in the dust.', actionIntent: 'search' },
        sceneCheckProposal: null,
      })),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository,
      narrativeRepository,
      gameMasterGenerator,
      turnGenerator,
      makeGameMasterAgentResolver('gm-1')
    )

    await coordinator.processTurn({
      room: room(),
      tick: tick(),
      speaker: participants[0],
      participants,
      recentMessages: [sceneCheckRollMessage('perception', 1), sceneCheckRollMessage('perception', 2)],
    })

    expect(repository.appendMessage.mock.calls[1][0].metadata?.publicRolls).toEqual(expect.objectContaining({
      sceneCheck: expect.objectContaining({ adjudicationReason: 'backend_fallback' }),
      action: expect.objectContaining({ checkType: 'perception' }),
    }))
  })

  it('does not override a GM-requested check to avoid repetition', async () => {
    const request = normalizeSceneCheckRequest({
      id: 'shelf-search',
      actionIntent: 'search',
      rollChoice: { source: 'fixed', checkType: 'perception' },
    })
    if (!request.ok) throw new Error(request.error)

    const repository = makeRepository()
    usePriorGameMasterMessage(repository)
    repository.appendMessage.mockImplementation(async (input) => message({
      id: `msg-${repository.appendMessage.mock.calls.length}`,
      authorKind: input.authorKind,
      tokenId: input.tokenId ?? null,
      officialAgentId: input.officialAgentId ?? null,
      authorName: input.authorName,
      content: input.content,
      metadata: input.metadata ?? {},
    }))
    const narrativeRepository = makeNarrativeRepository()
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(async () => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: null,
        speakerInstruction: 'Search the shelf exactly as requested.',
        stateAfter: {
          stateSummary: 'The shelf calls for a direct search.',
          currentObjective: 'Search the shelf.',
          openThreads: ['What is hidden there?'],
        },
        ttrpgPhase: 'exploration',
        combatReadiness: 'none',
        threatLevel: 0,
        requestedGameplayAction: null,
        encounterSeed: null,
        sceneCheckRequest: request.value,
        adventurePatch: { currentStakes: 'The shelf may hide a route.' },
        metadata: { sceneCheck: { request: request.value, proposal: null, proposalError: null } },
      })),
      generateSceneCheckOutcome: jest.fn(async ({ resolution }) => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: `The requested shelf check answers ${resolution.roll.checkType}.`,
        stateAfter: {
          stateSummary: 'The requested search changed the room.',
          currentObjective: 'Answer the changed shelf.',
          openThreads: ['What does the shelf hide?'],
        },
        adventurePatch: { consequenceLedger: [{ id: 'requested', source: 'scene', summary: 'The request resolves.', status: 'complication' as const, tier: resolution.roll.tier }] },
        metadata: {},
      })),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({
        officialAgentId: 'agent-1',
        content: 'I search the shelf and inspect its latch.',
        declaredAction: { summary: 'Ash searches the shelf and inspects its latch.', actionIntent: 'search inspect' },
      })),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(repository, narrativeRepository, gameMasterGenerator, turnGenerator, makeGameMasterAgentResolver('gm-1'))

    const result = await coordinator.processTurn({
      room: room(),
      tick: tick(),
      speaker: participants[0],
      participants,
      recentMessages: [sceneCheckRollMessage('perception', 1), sceneCheckRollMessage('perception', 2)],
    })

    expect(result.sceneCheckDiagnostics).toEqual(expect.objectContaining({ requestPresent: true, selected: true }))
    expect(repository.appendMessage.mock.calls[1][0].metadata?.publicRolls).toEqual(expect.objectContaining({
      sceneCheck: expect.objectContaining({ adjudicationReason: 'gm_request' }),
      action: expect.objectContaining({ checkType: 'perception' }),
    }))
  })

  it('does not override a valid character scene-check proposal to avoid repetition', async () => {
    const repository = makeRepository()
    usePriorGameMasterMessage(repository)
    repository.appendMessage.mockImplementation(async (input) => message({
      id: `msg-${repository.appendMessage.mock.calls.length}`,
      authorKind: input.authorKind,
      tokenId: input.tokenId ?? null,
      officialAgentId: input.officialAgentId ?? null,
      authorName: input.authorName,
      content: input.content,
      metadata: input.metadata ?? {},
    }))
    const narrativeRepository = makeNarrativeRepository()
    narrativeRepository.ensureStateForRoom.mockResolvedValueOnce({
      ...narrativeState(),
      metadata: { ttrpgPhase: 'exploration', combatReadiness: 'none', threatLevel: 0 },
    })
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(async () => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: null,
        speakerInstruction: 'Let Ash propose the shelf check.',
        stateAfter: {
          stateSummary: 'The shelf can be searched or inspected.',
          currentObjective: 'Choose how to test the shelf.',
          openThreads: ['What waits inside the shelf?'],
        },
        ttrpgPhase: 'exploration',
        combatReadiness: 'none',
        threatLevel: 0,
        requestedGameplayAction: null,
        encounterSeed: null,
        sceneCheckRequest: null,
        adventurePatch: { currentStakes: 'The shelf may answer a careful approach.' },
        metadata: {},
      })),
      generateSceneCheckOutcome: jest.fn(async ({ resolution }) => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: `The proposed shelf check answers ${resolution.roll.checkType}.`,
        stateAfter: {
          stateSummary: 'The proposed check changed the shelf.',
          currentObjective: 'Answer the shelf.',
          openThreads: ['What remains hidden?'],
        },
        adventurePatch: { consequenceLedger: [{ id: 'proposal', source: 'scene', summary: 'The proposal resolves.', status: 'complication' as const, tier: resolution.roll.tier }] },
        metadata: {},
      })),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({
        officialAgentId: 'agent-1',
        content: 'I search the shelf and inspect its latch.',
        declaredAction: { summary: 'Ash searches the shelf and inspects its latch.', actionIntent: 'search inspect' },
        sceneCheckProposal: {
          actionIntent: 'search',
          intentSummary: 'Ash searches the shelf and inspects its latch.',
          rollChoice: { source: 'fixed', checkType: 'perception' },
        },
      })),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(repository, narrativeRepository, gameMasterGenerator, turnGenerator, makeGameMasterAgentResolver('gm-1'))

    const result = await coordinator.processTurn({
      room: room(),
      tick: tick(),
      speaker: participants[0],
      participants,
      recentMessages: [sceneCheckRollMessage('perception', 1), sceneCheckRollMessage('perception', 2)],
    })

    expect(result.sceneCheckDiagnostics).toEqual(expect.objectContaining({ proposalPresent: true, selected: true }))
    expect(repository.appendMessage.mock.calls[1][0].metadata?.publicRolls).toEqual(expect.objectContaining({
      sceneCheck: expect.objectContaining({ adjudicationReason: 'character_proposal' }),
      action: expect.objectContaining({ checkType: 'perception' }),
    }))
  })

  it('fails scene-check outcome generation loudly without appending a static GM outcome', async () => {
    const request = normalizeSceneCheckRequest({
      id: 'cellar-stair',
      actionIntent: 'search',
      rollChoice: { source: 'fixed', checkType: 'perception' },
    })
    if (!request.ok) throw new Error(request.error)

    const repository = makeRepository()
    usePriorGameMasterMessage(repository)
    repository.appendMessage.mockImplementation(async (input) => message({
      id: `msg-${repository.appendMessage.mock.calls.length}`,
      authorKind: input.authorKind,
      tokenId: input.tokenId ?? null,
      officialAgentId: input.officialAgentId ?? null,
      authorName: input.authorName,
      content: input.content,
      metadata: input.metadata ?? {},
    }))
    const narrativeRepository = makeNarrativeRepository()
    const diagnostics: GameMasterGenerationDiagnostics = {
      status: 'repair_failed',
      repairAttempted: true,
      repaired: false,
      initialErrorCategory: 'invalid_json',
      repairErrorCategory: 'progression_contract',
      initialResponseLength: 10,
      repairResponseLength: 20,
    }
    const outcomeError = new GameMasterSceneCheckOutcomeGenerationError('scene-check repair failed with raw model text hidden', diagnostics)
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(async () => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: null,
        speakerInstruction: 'Search the cellar stair without resolving it safely.',
        stateAfter: {
          stateSummary: 'The cellar stair waits behind the bar.',
          currentObjective: 'Search the cellar stair.',
          openThreads: ['What blocks the stair?'],
        },
        ttrpgPhase: 'exploration',
        combatReadiness: 'none',
        threatLevel: 0,
        requestedGameplayAction: null,
        encounterSeed: null,
        sceneCheckRequest: request.value,
        adventurePatch: { currentStakes: 'The cellar stair may offer a route down.' },
        metadata: { sceneCheck: { request: request.value, proposal: null, proposalError: null } },
      })),
      generateSceneCheckOutcome: jest.fn(async () => {
        throw outcomeError
      }),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({
        officialAgentId: 'agent-1',
        content: 'I search the cellar stair behind the bar and test whether the route is safe.',
        declaredAction: {
          summary: 'Ash searches the cellar stair behind the bar and tests whether the route is safe.',
          actionIntent: 'search route',
        },
      })),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository,
      narrativeRepository,
      gameMasterGenerator,
      turnGenerator,
      makeGameMasterAgentResolver('gm-1'),
      () => 0
    )

    await expect(coordinator.processTurn({
      room: room(),
      tick: tick(),
      speaker: participants[0],
      participants,
      recentMessages: [message({ authorKind: 'game_master', tokenId: null })],
    })).rejects.toThrow('scene-check repair failed')

    expect(repository.appendMessage.mock.calls.map(([input]) => input.metadata?.messageKind)).toEqual([
      'character_action',
      'roll_card',
    ])
    expect(repository.appendMessage.mock.calls.some(([input]) => input.metadata?.messageKind === 'gm_outcome')).toBe(false)
    expect(gameMasterGenerator.generateSceneCheckOutcome).toHaveBeenCalled()
    expect(narrativeRepository.markBeatFailed).toHaveBeenCalledWith('beat-1', outcomeError, {
      metadata: expect.objectContaining({
        gmGeneration: diagnostics,
        sceneCheck: expect.objectContaining({
          resolution: expect.any(Object),
          publicRolls: expect.any(Object),
          messageIds: expect.objectContaining({
            characterAction: 'msg-1',
            rollCard: 'msg-2',
          }),
        }),
      }),
    })
    expect(narrativeRepository.updateState).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'room-1' }), expect.objectContaining({
      stateSummary: expect.any(String),
    }))
  })

  it('retries only the missing scene-check GM outcome using stored action and roll facts', async () => {
    const request = normalizeSceneCheckRequest({
      id: 'ash-marks',
      actionIntent: 'search',
      rollChoice: { source: 'fixed', checkType: 'perception' },
    })
    if (!request.ok) throw new Error(request.error)

    const adjudication = {
      decision: 'run' as const,
      source: 'game_master' as const,
      adjudicationSource: 'game_master' as const,
      requestSource: 'game_master' as const,
      reason: 'gm_request' as const,
      actorTokenId: 1,
      actorName: 'Ash',
      actionIntent: request.value.actionIntent,
      gameplayActionType: request.value.gameplayActionType,
      rollChoice: request.value.rollChoice,
      contextualChecks: request.value.contextualChecks,
      difficulty: request.value.difficulty,
      request: request.value,
      proposal: null,
    }
    const sceneCheckId = 'scene_check:beat-1:ash-marks'
    const resolution = resolveSceneCheck({ adjudication, rng: () => 0 })
    const publicRolls = projectPublicSceneCheckRolls(resolution, { sceneCheckId })
    const repository = makeRepository()
    usePriorGameMasterMessage(repository)
    repository.appendMessage.mockImplementation(async (input) => message({
      id: 'msg-outcome',
      authorKind: input.authorKind,
      tokenId: input.tokenId ?? null,
      officialAgentId: input.officialAgentId ?? null,
      authorName: input.authorName,
      content: input.content,
      metadata: input.metadata ?? {},
    }))
    const narrativeRepository = makeNarrativeRepository(beat({
      status: 'failed',
      gameMasterAgentId: 'gm-1',
      publicNarration: null,
      speakerInstruction: 'Use the stored scene check.',
      stateAfter: {
        stateSummary: 'The ash marks invite a search.',
        currentObjective: 'Search the ash marks.',
        openThreads: ['What do the marks hide?'],
      },
      metadata: {
        ttrpgPhase: 'exploration',
        combatReadiness: 'none',
        threatLevel: 0,
        requestedGameplayAction: null,
        encounterSeed: null,
        adventurePatch: { currentStakes: 'Search the ash marks.' },
        sceneCheckRequest: request.value,
        sceneCheck: {
          id: sceneCheckId,
          request: request.value,
          proposal: null,
          proposalError: null,
          adjudication,
          resolution,
          publicRolls,
          messageIds: {
            characterAction: 'msg-action-existing',
            rollCard: 'msg-roll-existing',
          },
          characterAction: {
            content: 'I search the ash marks for a hidden sign.',
            officialAgentId: 'agent-1',
            authorName: 'Ash',
          },
          gmOutcome: null,
        },
      },
    }))
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(),
      generateSceneCheckOutcome: jest.fn(async (input) => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: `The stored roll outcome answers ${input.resolution.roll.tier}.`,
        stateAfter: {
          stateSummary: 'The stored roll has an outcome.',
          currentObjective: 'Choose whether to follow the sign.',
          openThreads: ['What follows the sign?'],
        },
        adventurePatch: { currentStakes: 'Follow what the stored roll revealed.' },
        metadata: { gmGeneration: { status: 'accepted', repairAttempted: false, repaired: false } },
      })),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(),
    }
    const rng = jest.fn(() => 0.99)
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository,
      narrativeRepository,
      gameMasterGenerator,
      turnGenerator,
      makeGameMasterAgentResolver('gm-1'),
      rng
    )

    const result = await coordinator.processTurn({
      room: room(),
      tick: tick({ attempts: 2 }),
      speaker: participants[0],
      participants,
      recentMessages: [message({ authorKind: 'game_master', tokenId: null })],
    })

    expect(result).toEqual(expect.objectContaining({
      messageId: 'msg-outcome',
      messageIds: ['msg-action-existing', 'msg-roll-existing', 'msg-outcome'],
      sceneCheckId,
    }))
    expect(gameMasterGenerator.generateBeat).not.toHaveBeenCalled()
    expect(turnGenerator.generateTurn).not.toHaveBeenCalled()
    expect(rng).not.toHaveBeenCalled()
    expect(repository.appendMessage).toHaveBeenCalledTimes(1)
    expect(repository.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
      dedupeKey: 'scene_check:beat-1:gm_outcome',
      metadata: expect.objectContaining({ messageKind: 'gm_outcome' }),
    }))
    expect(gameMasterGenerator.generateSceneCheckOutcome).toHaveBeenCalledWith(expect.objectContaining({
      characterAction: 'I search the ash marks for a hidden sign.',
      resolution,
      publicRolls,
    }))
  })

  it('does not duplicate a stored scene-check GM outcome message on bookkeeping retry', async () => {
    const request = normalizeSceneCheckRequest({
      id: 'ash-marks',
      actionIntent: 'search',
      rollChoice: { source: 'fixed', checkType: 'perception' },
    })
    if (!request.ok) throw new Error(request.error)

    const adjudication = {
      decision: 'run' as const,
      source: 'game_master' as const,
      adjudicationSource: 'game_master' as const,
      requestSource: 'game_master' as const,
      reason: 'gm_request' as const,
      actorTokenId: 1,
      actorName: 'Ash',
      actionIntent: request.value.actionIntent,
      gameplayActionType: request.value.gameplayActionType,
      rollChoice: request.value.rollChoice,
      contextualChecks: request.value.contextualChecks,
      difficulty: request.value.difficulty,
      request: request.value,
      proposal: null,
    }
    const sceneCheckId = 'scene_check:beat-1:ash-marks'
    const resolution = resolveSceneCheck({ adjudication, rng: () => 0 })
    const publicRolls = projectPublicSceneCheckRolls(resolution, { sceneCheckId })
    const repository = makeRepository()
    usePriorGameMasterMessage(repository)
    const narrativeRepository = makeNarrativeRepository(beat({
      status: 'failed',
      gameMasterAgentId: 'gm-1',
      publicNarration: null,
      speakerInstruction: 'Use the stored scene check.',
      stateAfter: {
        stateSummary: 'The ash marks invite a search.',
        currentObjective: 'Search the ash marks.',
        openThreads: ['What do the marks hide?'],
      },
      metadata: {
        ttrpgPhase: 'exploration',
        combatReadiness: 'none',
        threatLevel: 0,
        requestedGameplayAction: null,
        encounterSeed: null,
        adventurePatch: { currentStakes: 'Search the ash marks.' },
        sceneCheckRequest: request.value,
        sceneCheck: {
          id: sceneCheckId,
          request: request.value,
          proposal: null,
          proposalError: null,
          adjudication,
          resolution,
          publicRolls,
          messageIds: {
            characterAction: 'msg-action-existing',
            rollCard: 'msg-roll-existing',
            gmOutcome: 'msg-outcome-existing',
          },
          characterAction: {
            content: 'I search the ash marks for a hidden sign.',
            officialAgentId: 'agent-1',
            authorName: 'Ash',
          },
          gmOutcome: {
            gameMasterAgentId: 'gm-1',
            publicNarration: 'The stored outcome already reached the room.',
            stateAfter: {
              stateSummary: 'The stored outcome has resolved.',
              currentObjective: 'Choose whether to follow the sign.',
              openThreads: ['What follows the sign?'],
            },
            metadata: { adventurePatch: { currentStakes: 'Follow the stored sign.' } },
          },
        },
      },
    }))
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(),
      generateSceneCheckOutcome: jest.fn(),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository,
      narrativeRepository,
      gameMasterGenerator,
      turnGenerator,
      makeGameMasterAgentResolver('gm-1')
    )

    const result = await coordinator.processTurn({
      room: room(),
      tick: tick({ attempts: 2 }),
      speaker: participants[0],
      participants,
      recentMessages: [message({ authorKind: 'game_master', tokenId: null })],
    })

    expect(result).toEqual(expect.objectContaining({
      messageId: 'msg-outcome-existing',
      messageIds: ['msg-action-existing', 'msg-roll-existing', 'msg-outcome-existing'],
      sceneCheckId,
    }))
    expect(repository.appendMessage).not.toHaveBeenCalled()
    expect(gameMasterGenerator.generateBeat).not.toHaveBeenCalled()
    expect(gameMasterGenerator.generateSceneCheckOutcome).not.toHaveBeenCalled()
    expect(turnGenerator.generateTurn).not.toHaveBeenCalled()
    expect(narrativeRepository.markBeatCompleted).toHaveBeenCalledWith('beat-1')
  })

  it('executes scene checks as character action, roll card, then GM outcome with durable roll metadata', async () => {
    const request = normalizeSceneCheckRequest({
      id: 'ash-marks',
      actionIntent: 'search',
      rollChoice: { source: 'fixed', checkType: 'perception' },
    })
    if (!request.ok) throw new Error(request.error)

    const repository = makeRepository()
    usePriorGameMasterMessage(repository)
    const events: string[] = []
    repository.appendMessage.mockImplementation(async (input) => {
      const id = `msg-${events.filter((event) => event.startsWith('append:')).length + 1}`
      events.push(`append:${String(input.metadata?.messageKind)}`)
      return message({
        id,
        authorKind: input.authorKind,
        tokenId: input.tokenId ?? null,
        officialAgentId: input.officialAgentId ?? null,
        authorName: input.authorName,
        content: input.content,
        metadata: input.metadata ?? {},
      })
    })
    const narrativeRepository = makeNarrativeRepository()
    narrativeRepository.patchBeatMetadata.mockImplementation(async (_beatId, metadata) => {
      if ((metadata.sceneCheck as any)?.resolution) events.push('patch:resolution')
      return beat({ metadata })
    })
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(async () => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: null,
        speakerInstruction: 'Search the ash marks.',
        stateAfter: {
          stateSummary: 'The ash marks invite a search.',
          currentObjective: 'Search the ash marks.',
          openThreads: ['What do the marks hide?'],
        },
        ttrpgPhase: 'exploration',
        combatReadiness: 'none',
        threatLevel: 0,
        requestedGameplayAction: null,
        encounterSeed: null,
        sceneCheckRequest: request.value,
        adventurePatch: { currentStakes: 'Search the ash marks.' },
        metadata: { sceneCheck: { request: request.value, proposal: null, proposalError: null } },
      })),
      generateSceneCheckOutcome: jest.fn(async ({ resolution }) => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: `The ash answers ${resolution.roll.tier}.`,
        stateAfter: {
          stateSummary: 'The ash marks have answered the search.',
          currentObjective: 'Choose whether to follow the revealed sign.',
          openThreads: ['What follows the sign?'],
        },
        adventurePatch: {
          consequenceLedger: [{ id: 'revealed-sign', source: 'scene', summary: 'The ash reveals a sign worth following.', status: 'advantage' as const, tier: resolution.roll.tier }],
        },
        metadata: { rawResponseLength: 42 },
      })),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({
        officialAgentId: 'agent-1',
        content: 'I search the ash for a hidden sign.',
        declaredAction: {
          summary: 'Ash searches the ash for a hidden sign.',
          actionIntent: 'search',
        },
      })),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository,
      narrativeRepository,
      gameMasterGenerator,
      turnGenerator,
      makeGameMasterAgentResolver('gm-1')
    )

    const result = await coordinator.processTurn({
      room: room(),
      tick: tick(),
      speaker: participants[0],
      participants,
      recentMessages: [message({ authorKind: 'game_master', tokenId: null })],
    })

    expect(result).toEqual(expect.objectContaining({
      selectedTokenId: 1,
      messageId: 'msg-3',
      messageIds: ['msg-1', 'msg-2', 'msg-3'],
      sceneCheckId: 'scene_check:beat-1:ash-marks',
    }))
    expect(repository.appendMessage.mock.calls.map(([input]) => input.metadata?.messageKind)).toEqual([
      'character_action',
      'roll_card',
      'gm_outcome',
    ])
    expect(repository.appendMessage.mock.calls.map(([input]) => input.metadata?.messageDomain)).toEqual([
      'narrative',
      'narrative',
      'narrative',
    ])
    expect(repository.appendMessage.mock.calls[0][0].metadata).not.toHaveProperty('publicAdventure')
    expect(repository.appendMessage.mock.calls[1][0].metadata?.publicRolls).toEqual(expect.objectContaining({
      rollContext: 'scene_check',
      sceneCheck: expect.objectContaining({ sceneCheckId: 'scene_check:beat-1:ash-marks' }),
    }))
    expect(repository.appendMessage.mock.calls[2][0].metadata).not.toHaveProperty('publicAdventure')
    expect(events.indexOf('patch:resolution')).toBeLessThan(events.indexOf('append:roll_card'))
    expect(gameMasterGenerator.generateSceneCheckOutcome).toHaveBeenCalledWith(expect.objectContaining({
      narrativeState: expect.objectContaining({
        stateSummary: 'The ash marks invite a search.',
        currentObjective: 'Search the ash marks.',
        openThreads: ['What do the marks hide?'],
      }),
    }))
    expect(narrativeRepository.updateState).toHaveBeenCalledWith(expect.objectContaining({ id: 'room-1' }), expect.objectContaining({
      stateSummary: 'The ash marks have answered the search.',
      metadata: expect.objectContaining({
        source: 'location-room-scene-check',
        lastSceneCheckId: 'scene_check:beat-1:ash-marks',
        adventure: expect.objectContaining({
          lastDeclaredAction: expect.objectContaining({
            summary: 'Ash searches the ash for a hidden sign.',
          }),
          lastOutcome: expect.objectContaining({
            kind: 'scene_check',
            sourceId: 'scene_check:scene_check:beat-1:ash-marks',
          }),
          consequenceLedger: [expect.objectContaining({
            source: 'scene_check:scene_check:beat-1:ash-marks',
          })],
        }),
      }),
    }))
  })

  it('reuses stored scene-check resolution and character action on retry without rerolling', async () => {
    const request = normalizeSceneCheckRequest({
      id: 'ash-marks',
      actionIntent: 'search',
      rollChoice: { source: 'fixed', checkType: 'perception' },
    })
    if (!request.ok) throw new Error(request.error)
    const adjudication = {
      decision: 'run' as const,
      source: 'game_master' as const,
      adjudicationSource: 'game_master' as const,
      requestSource: 'game_master' as const,
      reason: 'gm_request' as const,
      actorTokenId: 1,
      actorName: 'Ash',
      actionIntent: request.value.actionIntent,
      gameplayActionType: request.value.gameplayActionType,
      rollChoice: request.value.rollChoice,
      contextualChecks: request.value.contextualChecks,
      difficulty: request.value.difficulty,
      request: request.value,
      proposal: null,
    }
    const storedResolution = resolveSceneCheck({ adjudication, rng: () => 0 })
    storedResolution.roll.roll.total = 99
    storedResolution.roll.total = 101
    const storedPublicRolls = projectPublicSceneCheckRolls(storedResolution, { sceneCheckId: 'scene_check:beat-1:ash-marks' })

    const repository = makeRepository()
    usePriorGameMasterMessage(repository)
    repository.appendMessage.mockImplementation(async (input) => message({
      id: `msg-${repository.appendMessage.mock.calls.length}`,
      authorKind: input.authorKind,
      tokenId: input.tokenId ?? null,
      officialAgentId: input.officialAgentId ?? null,
      authorName: input.authorName,
      content: input.content,
      metadata: input.metadata ?? {},
    }))
    const narrativeRepository = makeNarrativeRepository(beat({
      status: 'failed',
      gameMasterAgentId: 'gm-1',
      publicNarration: null,
      speakerInstruction: 'Use stored output.',
      stateAfter: {
        stateSummary: 'Stored state.',
        currentObjective: 'Stored objective.',
        openThreads: ['Stored thread.'],
      },
      metadata: {
        sceneCheckRequest: request.value,
        sceneCheckEscalations: {
          'scene_check:beat-1:ash-marks': {
            decision: 'combat_ready',
            dangerKind: 'monster_pressure',
            reason: 'Stored escalation is authoritative.',
            threatLevel: 4,
            encounterSeed: { title: 'Stored Watcher', summary: 'The stored seed remains stable.' },
          },
        },
        lastSceneCheckEscalation: {
          decision: 'combat_ready',
          dangerKind: 'monster_pressure',
          reason: 'Stored escalation is authoritative.',
          threatLevel: 4,
          encounterSeed: { title: 'Stored Watcher', summary: 'The stored seed remains stable.' },
        },
        sceneCheck: {
          id: 'scene_check:beat-1:ash-marks',
          request: request.value,
          proposal: null,
          proposalError: null,
          adjudication,
          resolution: storedResolution,
          publicRolls: storedPublicRolls,
          characterAction: {
            content: 'Stored character action.',
            officialAgentId: 'agent-1',
            authorName: 'Ash',
          },
        },
      },
    }))
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(),
      generateSceneCheckOutcome: jest.fn(async () => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: 'Stored roll outcome narrated.',
        stateAfter: {
          stateSummary: 'Stored roll changed state.',
          currentObjective: 'Follow it.',
          openThreads: ['What follows?'],
        },
        adventurePatch: { currentStakes: 'Follow what the stored roll revealed.' },
        escalation: {
          decision: 'combat_ready',
          dangerKind: 'monster_pressure',
          reason: 'This regenerated seed must not replace stored escalation.',
          threatLevel: 5,
          encounterSeed: { title: 'Regenerated Watcher', summary: 'Should not win.' },
        },
        metadata: {},
      })),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(),
    }
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository,
      narrativeRepository,
      gameMasterGenerator,
      turnGenerator,
      makeGameMasterAgentResolver('gm-1')
    )

    await coordinator.processTurn({
      room: room(),
      tick: tick({ attempts: 2 }),
      speaker: participants[0],
      participants,
      recentMessages: [message({ authorKind: 'game_master', tokenId: null })],
    })

    expect(gameMasterGenerator.generateBeat).not.toHaveBeenCalled()
    expect(turnGenerator.generateTurn).not.toHaveBeenCalled()
    expect(repository.appendMessage.mock.calls[0][0].content).toBe('Stored character action.')
    expect((repository.appendMessage.mock.calls[1][0].metadata?.publicRolls as any).action.roll.total).toBe(99)
    expect(narrativeRepository.updateState).toHaveBeenCalledWith(expect.objectContaining({ id: 'room-1' }), expect.objectContaining({
      metadata: expect.objectContaining({
        combatReadiness: 'ready',
        threatLevel: 4,
        requestedGameplayAction: null,
        lastCombatTriggerBeatId: null,
        lastCombatReadyBeatId: 'beat-1',
        lastCombatReadySceneCheckId: 'scene_check:beat-1:ash-marks',
        lastCombatReadyAt: expect.any(String),
        lastEncounterSeed: expect.objectContaining({ title: 'Stored Watcher' }),
        sceneCheckEscalations: expect.objectContaining({
          'scene_check:beat-1:ash-marks': expect.objectContaining({
            encounterSeed: expect.objectContaining({ title: 'Stored Watcher' }),
          }),
        }),
      }),
    }))
  })

  it('marks an existing beat failed or dead for service retry bookkeeping', async () => {
    const narrativeRepository = makeNarrativeRepository(beat())
    const coordinator = new DefaultLocationRoomNarrativeCoordinator(
      makeRepository(),
      narrativeRepository,
      { generateBeat: jest.fn() },
      { generateTurn: jest.fn() }
    )

    await coordinator.markTickFailed('tick-1', new Error('bad beat'))
    await coordinator.markTickFailed('tick-1', new Error('bad beat'), { dead: true })

    expect(narrativeRepository.findBeatByTickId).toHaveBeenCalledWith('tick-1')
    expect(narrativeRepository.markBeatFailed).toHaveBeenCalledWith('beat-1', expect.any(Error))
    expect(narrativeRepository.markBeatDead).toHaveBeenCalledWith('beat-1', expect.any(Error))
  })
})
