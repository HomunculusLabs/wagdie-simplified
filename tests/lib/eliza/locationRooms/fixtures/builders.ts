import type { LocationRoomMembershipRepository } from '@/lib/eliza/locationRooms/membership'
import type { LocationRoomNarrativeRepository } from '@/lib/eliza/locationRooms/narrativeRepository'
import type { LocationRoomNarrativeState } from '@/lib/eliza/locationRooms/narrativeTypes'
import type { LocationRoomRepository } from '@/lib/eliza/locationRooms/repository'
import type {
  LocationRoom,
  LocationRoomMessage,
  LocationRoomParticipant,
  LocationRoomTick,
} from '@/lib/eliza/locationRooms/types'
import type { LocationRoomGameplayRepository } from '@/lib/eliza/locationRooms/gameplay/repository'
import type { GameplayEncounter, GameplayRoomState, GameplayRun } from '@/lib/eliza/locationRooms/gameplay/types'

export const LOCATION_ROOM_SERVICE_TEST_NOW = '2026-05-11T12:00:00.000Z'

export function room(overrides: Partial<LocationRoom> = {}): LocationRoom {
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
    createdAt: LOCATION_ROOM_SERVICE_TEST_NOW,
    updatedAt: LOCATION_ROOM_SERVICE_TEST_NOW,
    ...overrides,
  }
}

export function participant(
  tokenId: number,
  name = `Character #${tokenId}`,
  overrides: Partial<LocationRoomParticipant> = {}
): LocationRoomParticipant {
  return {
    tokenId,
    name,
    imageUrl: null,
    backgroundStory: null,
    ownerAddress: `0x${tokenId}`,
    stakerAddress: null,
    locationId: 'loc-1',
    ...overrides,
  }
}

export function message(overrides: Partial<LocationRoomMessage>): LocationRoomMessage {
  return {
    id: `msg-${overrides.sequence ?? 1}`,
    roomId: 'room-1',
    locationId: 'loc-1',
    tickId: null,
    sequence: 1,
    visibility: 'public',
    authorKind: 'agent',
    tokenId: 1,
    officialAgentId: 'agent-1',
    authorName: 'Character #1',
    content: 'hello',
    metadata: {},
    createdAt: LOCATION_ROOM_SERVICE_TEST_NOW,
    ...overrides,
  }
}

export function tick(overrides: Partial<LocationRoomTick> = {}): LocationRoomTick {
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
    nextAttemptAt: LOCATION_ROOM_SERVICE_TEST_NOW,
    lockedAt: LOCATION_ROOM_SERVICE_TEST_NOW,
    lockedBy: 'worker',
    selectedTokenId: null,
    startedAt: LOCATION_ROOM_SERVICE_TEST_NOW,
    completedAt: null,
    lastError: null,
    createdAt: LOCATION_ROOM_SERVICE_TEST_NOW,
    updatedAt: LOCATION_ROOM_SERVICE_TEST_NOW,
    ...overrides,
  }
}

export function gameplayRun(overrides: Partial<GameplayRun> = {}): GameplayRun {
  return {
    id: 'run-1',
    roomId: 'room-1',
    locationId: 'loc-1',
    status: 'active',
    targetCompletedTurns: 100,
    completedTurns: 0,
    startedByActor: 'admin',
    startedByWallet: '0xadmin',
    startedByTokenId: null,
    lastTickId: null,
    lastAdvancedAt: null,
    completedAt: null,
    stopReason: null,
    lastError: null,
    metadata: {},
    createdAt: LOCATION_ROOM_SERVICE_TEST_NOW,
    updatedAt: LOCATION_ROOM_SERVICE_TEST_NOW,
    ...overrides,
  }
}

export function gameplayEncounter(overrides: Partial<GameplayEncounter> = {}): GameplayEncounter {
  return {
    id: 'encounter-1',
    roomId: 'room-1',
    locationId: 'loc-1',
    status: 'active',
    difficulty: 'normal',
    roundNumber: 1,
    publicTitle: 'Bell Maw',
    publicSummary: 'A maw unfolds.',
    monsterState: [],
    rewardPlan: {},
    mechanics: {},
    metadata: {},
    lastError: null,
    createdAt: LOCATION_ROOM_SERVICE_TEST_NOW,
    updatedAt: LOCATION_ROOM_SERVICE_TEST_NOW,
    completedAt: null,
    ...overrides,
  }
}

export function gameplayState(overrides: Partial<GameplayRoomState> = {}): GameplayRoomState {
  return {
    id: 'state-1',
    roomId: 'room-1',
    locationId: 'loc-1',
    status: 'active_encounter',
    activeEncounterId: 'encounter-1',
    characters: {
      '1': { tokenId: 1, name: 'Ash', hp: 10, maxHp: 10, status: 'alive', xp: 0, temporaryBoons: [], wounds: [] },
      '2': { tokenId: 2, name: 'Bone', hp: 10, maxHp: 10, status: 'alive', xp: 0, temporaryBoons: [], wounds: [] },
    },
    rewards: {},
    metadata: {},
    createdAt: LOCATION_ROOM_SERVICE_TEST_NOW,
    updatedAt: LOCATION_ROOM_SERVICE_TEST_NOW,
    ...overrides,
  }
}

export function makeRepository(overrides: Partial<jest.Mocked<LocationRoomRepository>> = {}): jest.Mocked<LocationRoomRepository> {
  const baseRoom = room()
  const baseTick = tick()
  const appended = message({ id: 'msg-new', sequence: 3, tokenId: 1, content: 'The room stirs.' })

  return {
    getLocation: jest.fn(async () => ({ id: 'loc-1', name: 'The Bell Gate' })),
    getLocationDetails: jest.fn(async () => ({
      id: 'loc-1',
      name: 'The Bell Gate',
      chainLocationId: null,
      active: null,
      metadata: {},
      createdAt: LOCATION_ROOM_SERVICE_TEST_NOW,
      updatedAt: LOCATION_ROOM_SERVICE_TEST_NOW,
    })),
    listLocationsByIds: jest.fn(async () => []),
    findRoomById: jest.fn(async () => baseRoom),
    findRoomByLocationId: jest.fn(async () => baseRoom),
    ensureRoomForLocation: jest.fn(async () => baseRoom),
    listDueRooms: jest.fn(async () => [baseRoom]),
    enqueueTick: jest.fn(async (input) => ({
      tick: tick({
        status: 'pending',
        attempts: 0,
        lockedAt: null,
        lockedBy: null,
        startedAt: null,
        triggerType: input.triggerType,
        requestedByWallet: input.requestedByWallet ?? null,
        requestedByTokenId: input.requestedByTokenId ?? null,
        gameplayRunId: input.gameplayRunId ?? null,
        turnIntent: input.turnIntent ?? 'auto',
      }),
      deduped: false,
    })),
    promoteOpenTickIntent: jest.fn(async (input) => tick({ id: input.tickId, roomId: input.roomId, turnIntent: input.turnIntent })),
    attachTickToGameplayRun: jest.fn(async (input) => tick({ gameplayRunId: input.gameplayRunId })),
    countCompletedGameplayTurnsForRun: jest.fn(async () => 0),
    findOpenTickForRoom: jest.fn(async () => null),
    findRecentCompletedOwnerTick: jest.fn(async () => null),
    findOldestProcessableTickForRoom: jest.fn(async () => baseTick),
    findNonStaleProcessingTickForRoom: jest.fn(async () => null),
    claimTick: jest.fn(async (_tickId) => baseTick),
    claimDueTicks: jest.fn(async () => [baseTick]),
    listActiveTicksForRoom: jest.fn(async () => [baseTick]),
    listRecentTicksForRoom: jest.fn(async () => [baseTick]),
    getPublicMessageStats: jest.fn(async () => ({ messageCount: 0, latestSequence: null, latestCreatedAt: null })),
    getPublicAuthorMessageStats: jest.fn(async () => ({
      messageCount: 0,
      gameMasterMessageCount: 0,
      agentMessageCount: 0,
      latestGameMasterMessageCreatedAt: null,
      latestAgentMessageCreatedAt: null,
    })),
    markTickSelected: jest.fn(async (_tickId, tokenId) => tick({ selectedTokenId: tokenId })),
    appendMessage: jest.fn(async () => appended),
    markTickCompleted: jest.fn(async () => tick({ status: 'completed', completedAt: LOCATION_ROOM_SERVICE_TEST_NOW })),
    markTickSkipped: jest.fn(async () => tick({ status: 'skipped', completedAt: LOCATION_ROOM_SERVICE_TEST_NOW })),
    markTickFailed: jest.fn(async () => tick({ status: 'failed' })),
    markTickDead: jest.fn(async () => tick({ status: 'dead', completedAt: LOCATION_ROOM_SERVICE_TEST_NOW })),
    updateRoomAfterProcessedTick: jest.fn(async () => room({ tickCount: 1, lastTickAt: LOCATION_ROOM_SERVICE_TEST_NOW })),
    recordRoomError: jest.fn(async () => undefined),
    listPublicMessages: jest.fn(async () => ({ messages: [], total: 0, page: 1, pageSize: 20, hasMore: false })),
    listRecentPublicMessages: jest.fn(async () => []),
    ...overrides,
  }
}

export function makeMembership(participants = [participant(1, 'Ash'), participant(2, 'Bone')]): jest.Mocked<LocationRoomMembershipRepository> {
  return {
    listEligibleParticipantsByLocation: jest.fn(async () => participants),
    listEligibleLocationIds: jest.fn(async () => ['loc-1']),
    walletHasEligibleParticipant: jest.fn(async () => true),
  }
}

export function makeGameplayRepository(
  overrides: Partial<jest.Mocked<LocationRoomGameplayRepository>> = {}
): jest.Mocked<LocationRoomGameplayRepository> {
  return {
    findActiveRunByRoomId: jest.fn(async () => null),
    findRunById: jest.fn(async () => null),
    listRecentRunsByRoomId: jest.fn(async () => []),
    listActiveRunsForWorker: jest.fn(async () => []),
    createOrReuseActiveRun: jest.fn(async () => ({ run: gameplayRun(), reused: false })),
    updateRunProgress: jest.fn(async (_runId, input) => gameplayRun({ completedTurns: input.completedTurns, lastTickId: input.lastTickId ?? null, lastAdvancedAt: input.lastAdvancedAt ?? null })),
    markRunCompleted: jest.fn(async (_runId, input) => gameplayRun({ status: 'completed', completedTurns: input.completedTurns ?? 100, lastTickId: input.lastTickId ?? null, lastAdvancedAt: input.lastAdvancedAt ?? null, completedAt: input.completedAt ?? LOCATION_ROOM_SERVICE_TEST_NOW, stopReason: input.stopReason })),
    markRunStopped: jest.fn(async (_runId, input) => gameplayRun({ status: 'stopped', completedTurns: input.completedTurns ?? 0, lastTickId: input.lastTickId ?? null, lastAdvancedAt: input.lastAdvancedAt ?? null, completedAt: input.completedAt ?? LOCATION_ROOM_SERVICE_TEST_NOW, stopReason: input.stopReason })),
    markRunFailed: jest.fn(async (_runId, input) => gameplayRun({ status: 'failed', completedTurns: input.completedTurns ?? 0, lastTickId: input.lastTickId ?? null, lastAdvancedAt: input.lastAdvancedAt ?? null, completedAt: input.completedAt ?? LOCATION_ROOM_SERVICE_TEST_NOW, stopReason: input.stopReason, lastError: input.lastError ?? null })),
    findStateByRoomId: jest.fn(async () => null),
    ensureStateForRoom: jest.fn(),
    updateState: jest.fn(),
    updateCharacterState: jest.fn(),
    findActiveEncounterByRoomId: jest.fn(async () => null),
    findEncounterById: jest.fn(async () => null),
    createActiveEncounter: jest.fn(),
    updateEncounter: jest.fn(),
    findTurnByTickId: jest.fn(),
    listRecentTurnsByRoomId: jest.fn(async () => []),
    createOrReuseTurn: jest.fn(),
    storeTurnOutcome: jest.fn(),
    markTurnFailed: jest.fn(),
    markTurnDead: jest.fn(),
    createPendingDeathReview: jest.fn(),
    listDeathReviews: jest.fn(async () => []),
    findDeathReviewById: jest.fn(async () => null),
    updateDeathReview: jest.fn(),
    createOrReuseRewardClaim: jest.fn(),
    findRewardClaimByDeathReviewId: jest.fn(async () => null),
    listRewardClaims: jest.fn(async () => []),
    updateRewardClaimStatusByDeathReviewId: jest.fn(async () => null),
    ...overrides,
  } as jest.Mocked<LocationRoomGameplayRepository>
}

export function narrativeState(overrides: Partial<LocationRoomNarrativeState> = {}): LocationRoomNarrativeState {
  return {
    id: 'narrative-state-1',
    roomId: 'room-1',
    locationId: 'loc-1',
    stateSummary: 'The room waits.',
    currentObjective: null,
    openThreads: [],
    metadata: {},
    createdAt: LOCATION_ROOM_SERVICE_TEST_NOW,
    updatedAt: LOCATION_ROOM_SERVICE_TEST_NOW,
    ...overrides,
  }
}

export function makeNarrativeRepository(
  state = narrativeState()
): jest.Mocked<LocationRoomNarrativeRepository> {
  return {
    findStateByRoomId: jest.fn(async () => state),
    ensureStateForRoom: jest.fn(async () => state),
    updateState: jest.fn(async (_room, input) => ({
      ...state,
      stateSummary: input.stateSummary ?? state.stateSummary,
      currentObjective: input.currentObjective ?? state.currentObjective,
      openThreads: input.openThreads ?? state.openThreads,
      metadata: input.metadata ?? state.metadata,
    })),
    findBeatByTickId: jest.fn(async () => null),
    listRecentBeatsByRoomId: jest.fn(async () => []),
    createOrReuseBeat: jest.fn(),
    storeBeatGameMasterOutput: jest.fn(),
    markBeatGameMasterMessageAppended: jest.fn(),
    markBeatCharacterAppended: jest.fn(),
    markBeatCompleted: jest.fn(),
    markBeatFailed: jest.fn(),
    markBeatDead: jest.fn(),
  }
}
