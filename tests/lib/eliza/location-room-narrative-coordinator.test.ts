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
import type { GameMasterBeatGenerator } from '@/lib/eliza/locationRooms/gameMasterGenerator'
import type { LocationRoomNarrativeRepository } from '@/lib/eliza/locationRooms/narrativeRepository'
import type {
  LocationRoomNarrativeBeat,
  LocationRoomNarrativeState,
} from '@/lib/eliza/locationRooms/narrativeTypes'
import type { LocationRoomRepository } from '@/lib/eliza/locationRooms/repository'
import type { OfficialLocationRoomTurnGenerator } from '@/lib/eliza/locationRooms/officialTurnGenerator'
import type { LocationRoom, LocationRoomMessage, LocationRoomParticipant, LocationRoomTick } from '@/lib/eliza/locationRooms/types'

const now = '2026-05-22T12:00:00.000Z'

function room(): LocationRoom {
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
  }
}

function tick(overrides: Partial<LocationRoomTick> = {}): LocationRoomTick {
  return {
    id: 'tick-1',
    roomId: 'room-1',
    locationId: 'loc-1',
    gameplayRunId: null,
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
    findRecentCompletedOwnerTick: jest.fn(),
    findOldestProcessableTickForRoom: jest.fn(),
    findNonStaleProcessingTickForRoom: jest.fn(),
    claimTick: jest.fn(),
    claimDueTicks: jest.fn(),
    listActiveTicksForRoom: jest.fn(),
    listRecentTicksForRoom: jest.fn(),
    getPublicMessageStats: jest.fn(),
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
    }))
    expect(repository.appendMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      authorKind: 'game_master',
      officialAgentId: 'gm-1',
      content: 'The bell tolls once.',
      tickId: 'tick-1',
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
    }))
    expect(narrativeRepository.updateState).toHaveBeenCalledWith(expect.objectContaining({ id: 'room-1' }), expect.objectContaining({
      stateSummary: 'The bell has called Ash.',
      currentObjective: 'Answer the toll.',
      openThreads: ['Who rang it?'],
    }))
    expect(narrativeRepository.markBeatCompleted).toHaveBeenCalledWith('beat-1')
  })

  it('reuses a previously appended game-master beat on retry without regenerating it', async () => {
    const repository = makeRepository()
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
    const narrativeRepository = makeNarrativeRepository(beat({
      status: 'failed',
      gameMasterAgentId: 'gm-1',
      publicNarration: 'The stored bell tolls once.',
      speakerInstruction: 'Use the stored instruction.',
      stateAfter: {
        stateSummary: 'The stored state survives retry.',
        currentObjective: 'Keep retry idempotent.',
        openThreads: [],
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

  it('returns the appended character message even when post-append narrative bookkeeping fails', async () => {
    const repository = makeRepository()
    const narrativeRepository = makeNarrativeRepository()
    narrativeRepository.updateState.mockRejectedValueOnce(new Error('state unavailable'))
    const gameMasterGenerator: jest.Mocked<GameMasterBeatGenerator> = {
      generateBeat: jest.fn(async () => ({
        gameMasterAgentId: 'gm-1',
        publicNarration: null,
        speakerInstruction: 'Speak once.',
        stateAfter: {
          stateSummary: 'State after public character output.',
          currentObjective: null,
          openThreads: [],
        },
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
