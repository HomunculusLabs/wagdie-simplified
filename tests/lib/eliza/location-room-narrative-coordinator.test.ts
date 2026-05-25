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

    expect(result).toEqual({ selectedTokenId: 1, messageId: 'msg-character' })
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

  it('reuses a previously appended game-master beat on retry without regenerating it', async () => {
    const repository = makeRepository()
    usePriorGameMasterMessage(repository)
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
      recentMessages: [message({ authorKind: 'game_master', tokenId: null })],
    })

    expect(gameMasterGenerator.generateBeat).not.toHaveBeenCalled()
    expect(repository.appendMessage).toHaveBeenCalledTimes(1)
    expect(repository.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
      authorKind: 'agent',
      content: 'Still I hear it.',
    }))
  })

  it('reuses stored generated output on retry and appends the game-master message if it was not marked appended', async () => {
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
        speakerInstruction: 'Speak once.',
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
        metadata: { rawResponseLength: 42 },
      })),
    }
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({ officialAgentId: 'agent-1', content: 'I search the ash for a hidden sign.' })),
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
    expect(repository.appendMessage.mock.calls[1][0].metadata?.publicRolls).toEqual(expect.objectContaining({
      rollContext: 'scene_check',
      sceneCheck: expect.objectContaining({ sceneCheckId: 'scene_check:beat-1:ash-marks' }),
    }))
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
