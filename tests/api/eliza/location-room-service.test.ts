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
  gameMasterAgentService: {
    resolveRuntimeGameMasterAgentId: jest.fn(async () => 'gm-agent-1'),
  },
}))

import {
  LocationRoomGameplayConfigError,
  LocationRoomManualTickIntentForbiddenError,
  LocationRoomService,
  isLocationRoomGameplayEnabledForLocation,
  selectLocationRoomSpeaker,
} from '@/lib/eliza/locationRooms/service'
import { elizaConfig } from '@/lib/eliza/config'
import type { LocationRoom, LocationRoomMessage, LocationRoomParticipant, LocationRoomTick } from '@/lib/eliza/locationRooms/types'
import type { LocationRoomRepository } from '@/lib/eliza/locationRooms/repository'
import type { LocationRoomMembershipRepository } from '@/lib/eliza/locationRooms/membership'
import type { OfficialLocationRoomTurnGenerator } from '@/lib/eliza/locationRooms/officialTurnGenerator'
import type { LocationRoomNarrativeCoordinator } from '@/lib/eliza/locationRooms/narrativeCoordinator'
import type { LocationRoomNarrativeRepository } from '@/lib/eliza/locationRooms/narrativeRepository'
import type { LocationRoomNarrativeState } from '@/lib/eliza/locationRooms/narrativeTypes'
import type { LocationRoomGameplayCoordinator } from '@/lib/eliza/locationRooms/gameplay/coordinator'
import type { LocationRoomGameplayRepository } from '@/lib/eliza/locationRooms/gameplay/repository'
import type { GameplayEncounter, GameplayRoomState, GameplayRun } from '@/lib/eliza/locationRooms/gameplay/types'

const now = '2026-05-11T12:00:00.000Z'

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

function participant(
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

function message(overrides: Partial<LocationRoomMessage>): LocationRoomMessage {
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
    createdAt: now,
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
    selectedTokenId: null,
    startedAt: now,
    completedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function gameplayRun(overrides: Partial<GameplayRun> = {}): GameplayRun {
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
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function gameplayEncounter(overrides: Partial<GameplayEncounter> = {}): GameplayEncounter {
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
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    ...overrides,
  }
}

function gameplayState(overrides: Partial<GameplayRoomState> = {}): GameplayRoomState {
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
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeRepository(overrides: Partial<jest.Mocked<LocationRoomRepository>> = {}): jest.Mocked<LocationRoomRepository> {
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
      createdAt: now,
      updatedAt: now,
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
    markTickCompleted: jest.fn(async () => tick({ status: 'completed', completedAt: now })),
    markTickSkipped: jest.fn(async () => tick({ status: 'skipped', completedAt: now })),
    markTickFailed: jest.fn(async () => tick({ status: 'failed' })),
    markTickDead: jest.fn(async () => tick({ status: 'dead', completedAt: now })),
    updateRoomAfterProcessedTick: jest.fn(async () => room({ tickCount: 1, lastTickAt: now })),
    recordRoomError: jest.fn(async () => undefined),
    listPublicMessages: jest.fn(async () => ({ messages: [], total: 0, page: 1, pageSize: 20, hasMore: false })),
    listRecentPublicMessages: jest.fn(async () => []),
    ...overrides,
  }
}

function makeMembership(participants = [participant(1, 'Ash'), participant(2, 'Bone')]): jest.Mocked<LocationRoomMembershipRepository> {
  return {
    listEligibleParticipantsByLocation: jest.fn(async () => participants),
    listEligibleLocationIds: jest.fn(async () => ['loc-1']),
    walletHasEligibleParticipant: jest.fn(async () => true),
  }
}

function makeGameplayRepository(
  overrides: Partial<jest.Mocked<LocationRoomGameplayRepository>> = {}
): jest.Mocked<LocationRoomGameplayRepository> {
  return {
    findActiveRunByRoomId: jest.fn(async () => null),
    findRunById: jest.fn(async () => null),
    listRecentRunsByRoomId: jest.fn(async () => []),
    listActiveRunsForWorker: jest.fn(async () => []),
    createOrReuseActiveRun: jest.fn(async () => ({ run: gameplayRun(), reused: false })),
    updateRunProgress: jest.fn(async (_runId, input) => gameplayRun({ completedTurns: input.completedTurns, lastTickId: input.lastTickId ?? null, lastAdvancedAt: input.lastAdvancedAt ?? null })),
    markRunCompleted: jest.fn(async (_runId, input) => gameplayRun({ status: 'completed', completedTurns: input.completedTurns ?? 100, lastTickId: input.lastTickId ?? null, lastAdvancedAt: input.lastAdvancedAt ?? null, completedAt: input.completedAt ?? now, stopReason: input.stopReason })),
    markRunStopped: jest.fn(async (_runId, input) => gameplayRun({ status: 'stopped', completedTurns: input.completedTurns ?? 0, lastTickId: input.lastTickId ?? null, lastAdvancedAt: input.lastAdvancedAt ?? null, completedAt: input.completedAt ?? now, stopReason: input.stopReason })),
    markRunFailed: jest.fn(async (_runId, input) => gameplayRun({ status: 'failed', completedTurns: input.completedTurns ?? 0, lastTickId: input.lastTickId ?? null, lastAdvancedAt: input.lastAdvancedAt ?? null, completedAt: input.completedAt ?? now, stopReason: input.stopReason, lastError: input.lastError ?? null })),
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

function narrativeState(overrides: Partial<LocationRoomNarrativeState> = {}): LocationRoomNarrativeState {
  return {
    id: 'narrative-state-1',
    roomId: 'room-1',
    locationId: 'loc-1',
    stateSummary: 'The room waits.',
    currentObjective: null,
    openThreads: [],
    metadata: {},
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeNarrativeRepository(
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

describe('location room domain service', () => {
  const originalMode = elizaConfig.mode
  const originalEnabled = elizaConfig.locationRooms.enabled
  const originalOfficialBaseUrl = elizaConfig.official.baseUrl
  const originalNarrativeEnabled = elizaConfig.locationRooms.narrative.enabled
  const originalGameMasterAgentId = elizaConfig.locationRooms.narrative.gameMasterAgentId
  const originalGameplayEnabled = elizaConfig.locationRooms.gameplay.enabled
  const originalGameplayAllowlist = [...elizaConfig.locationRooms.gameplay.locationAllowlist]
  const originalMaxTicksPerRun = elizaConfig.locationRooms.maxTicksPerRun
  const mutableElizaConfig = elizaConfig as { mode: typeof elizaConfig.mode }
  const mutableLocationRoomsConfig = elizaConfig.locationRooms as { enabled: boolean; maxTicksPerRun: number }
  const mutableOfficialConfig = elizaConfig.official as { baseUrl: string }
  const mutableNarrativeConfig = elizaConfig.locationRooms.narrative as {
    enabled: boolean
    gameMasterAgentId: string
  }
  const mutableGameplayConfig = elizaConfig.locationRooms.gameplay as {
    enabled: boolean
    locationAllowlist: string[]
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'info').mockImplementation(() => undefined)
    mutableElizaConfig.mode = originalMode
    mutableLocationRoomsConfig.enabled = true
    mutableLocationRoomsConfig.maxTicksPerRun = originalMaxTicksPerRun
    mutableOfficialConfig.baseUrl = 'https://elizaos.example'
    mutableNarrativeConfig.enabled = false
    mutableNarrativeConfig.gameMasterAgentId = ''
    mutableGameplayConfig.enabled = false
    mutableGameplayConfig.locationAllowlist = []
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(() => {
    mutableElizaConfig.mode = originalMode
    mutableLocationRoomsConfig.enabled = originalEnabled
    mutableLocationRoomsConfig.maxTicksPerRun = originalMaxTicksPerRun
    mutableOfficialConfig.baseUrl = originalOfficialBaseUrl
    mutableNarrativeConfig.enabled = originalNarrativeEnabled
    mutableNarrativeConfig.gameMasterAgentId = originalGameMasterAgentId
    mutableGameplayConfig.enabled = originalGameplayEnabled
    mutableGameplayConfig.locationAllowlist = originalGameplayAllowlist
  })

  it('selects the speaker with the fewest recent messages, then oldest last message, then lowest token id', () => {
    const participants = [participant(1), participant(2), participant(3)]
    const selected = selectLocationRoomSpeaker(participants, [
      message({ sequence: 1, tokenId: 1 }),
      message({ sequence: 2, tokenId: 2 }),
      message({ sequence: 3, tokenId: 2 }),
    ])

    expect(selected.tokenId).toBe(3)
  })

  it('serves legacy crows_den room requests from canonical location 11', async () => {
    const canonicalRoom = room({ id: 'room-11', locationId: '11' })
    const repository = makeRepository({
      getLocation: jest.fn(async (locationId: string) => locationId === '11'
        ? { id: '11', name: "The Crow's Den" }
        : null),
      ensureRoomForLocation: jest.fn(async () => canonicalRoom),
      listPublicMessages: jest.fn(async () => ({
        messages: [message({ id: 'msg-11', roomId: 'room-11', locationId: '11', sequence: 30, createdAt: '2026-05-11T12:01:00.000Z' })],
        total: 1,
        page: 1,
        pageSize: 20,
        hasMore: false,
      })),
      getPublicMessageStats: jest.fn(async () => ({
        messageCount: 2,
        latestSequence: 31,
        latestCreatedAt: '2026-05-11T12:02:00.000Z',
      })),
    })
    const membership = makeMembership([participant(1443, 'Vola')])
    const service = new LocationRoomService(repository, membership)

    const result = await service.getPublicRoom('crows_den')

    expect(repository.getLocation).toHaveBeenCalledWith('11')
    expect(repository.ensureRoomForLocation).toHaveBeenCalledWith('11')
    expect(membership.listEligibleParticipantsByLocation).toHaveBeenCalledWith('11')
    expect(result.room).toMatchObject({ id: 'room-11', locationId: '11', locationName: "The Crow's Den" })
    expect(result.identity).toEqual({
      requestedLocationId: 'crows_den',
      canonicalLocationId: '11',
      canonicalLocationName: "The Crow's Den",
      isAlias: true,
    })
    expect(result.activity).toEqual(expect.objectContaining({
      generatedAt: expect.any(String),
      messageCount: 2,
      latestSequence: 31,
      latestMessageCreatedAt: '2026-05-11T12:02:00.000Z',
      lastTickAt: null,
      tickCount: 0,
    }))
    expect(result.messages).toEqual([expect.objectContaining({ id: 'msg-11' })])
  })

  it('exposes public-safe participant sheet fields without private membership data', async () => {
    const repository = makeRepository()
    const membership = makeMembership([
      participant(1, 'Ash', {
        imageUrl: 'https://example.test/ash.png',
        backgroundStory: 'private backstory',
        ownerAddress: '0xOwner',
        stakerAddress: '0xStaker',
        characterClass: 'Cleric',
        level: 3,
        coreStats: {
          strength: 12,
          dexterity: 13,
          constitution: 14,
          intelligence: 15,
          wisdom: 16,
          charisma: 17,
        },
        maxHp: 22,
        ac: null,
        speed: null,
      }),
    ])
    const service = new LocationRoomService(repository, membership)

    const result = await service.getPublicRoom('loc-1')

    expect(result.participants).toEqual([
      {
        tokenId: 1,
        name: 'Ash',
        imageUrl: 'https://example.test/ash.png',
        characterClass: 'Cleric',
        level: 3,
        coreStats: {
          strength: 12,
          dexterity: 13,
          constitution: 14,
          intelligence: 15,
          wisdom: 16,
          charisma: 17,
        },
        maxHp: 22,
        ac: null,
        speed: null,
      },
    ])
    expect(result.participants[0]).not.toHaveProperty('ownerAddress')
    expect(result.participants[0]).not.toHaveProperty('stakerAddress')
    expect(result.participants[0]).not.toHaveProperty('backgroundStory')
  })

  it('projects public-safe TTRPG summary from narrative metadata', async () => {
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    const narrativeRepository = makeNarrativeRepository(narrativeState({
      metadata: {
        ttrpgPhase: 'threat',
        combatReadiness: 'ready',
        threatLevel: 4,
        requestedGameplayAction: 'start_combat',
        lastCombatTriggerBeatId: 'beat-secret',
        hidden: 'do-not-expose',
      },
    }))
    const service = new LocationRoomService(
      makeRepository(),
      makeMembership(),
      { generateTurn: jest.fn() },
      undefined,
      undefined,
      undefined,
      undefined,
      narrativeRepository
    )

    const result = await service.getPublicRoom('loc-1')

    expect(narrativeRepository.findStateByRoomId).toHaveBeenCalledWith('room-1')
    expect(result.ttrpg).toEqual({
      phase: 'threat',
      combatReadiness: 'ready',
      threatLevel: 4,
    })
    expect(JSON.stringify(result.ttrpg)).not.toContain('beat-secret')
    expect(JSON.stringify(result.ttrpg)).not.toContain('do-not-expose')
  })

  it('projects public message domains kinds and phases with safe historical fallbacks', async () => {
    const repository = makeRepository({
      listPublicMessages: jest.fn(async () => ({
        messages: [
          message({
            id: 'msg-narrative-gm',
            sequence: 1,
            authorKind: 'game_master',
            tokenId: null,
            metadata: {
              messageDomain: 'narrative',
              messageKind: 'gm_beat',
              ttrpgPhase: 'threat',
              privateNarrativeState: 'hidden',
            },
          }),
          message({
            id: 'msg-combat-action',
            sequence: 2,
            authorKind: 'agent',
            tokenId: 1,
            metadata: {
              messageDomain: 'combat',
              messageKind: 'character_action',
              ttrpgPhase: 'combat',
              privateMechanics: { dc: 99 },
            },
          }),
          message({
            id: 'msg-legacy-outcome',
            sequence: 3,
            authorKind: 'game_master',
            tokenId: null,
            metadata: {
              gameplayMessageKind: 'gm_outcome',
              messageDomain: 'mechanics',
              messageKind: 'debug',
              ttrpgPhase: 'private_phase',
              rawDc: 99,
            },
          }),
          message({
            id: 'msg-roll-card',
            sequence: 4,
            authorKind: 'game_master',
            tokenId: null,
            metadata: {
              gameplayMessageKind: 'roll_card',
              publicRolls: {
                action: {
                  actionType: 'investigate',
                  checkType: 'arcana',
                  checkLabel: 'Read the Runes',
                  checkSource: 'contextual',
                  contextualCheckId: 'read-the-runes',
                  actor: { kind: 'character', id: '1', tokenId: 1, name: 'Ash', private: 'hidden' },
                  target: { kind: 'environment', id: null, name: null },
                  roll: { formula: '1d20+5', total: 19, rolls: [14] },
                  modifier: 5,
                  total: 19,
                  dc: 13,
                  tier: 'success',
                  outcome: 'success',
                },
                publicEffects: [],
                retaliation: null,
                deaths: [],
                encounterStatusAfter: 'active',
              },
            },
          }),
          message({
            id: 'msg-legacy-agent',
            sequence: 5,
            authorKind: 'agent',
            tokenId: 2,
            metadata: {},
          }),
          message({
            id: 'msg-wallet',
            sequence: 6,
            authorKind: 'wallet',
            tokenId: null,
            metadata: { messageDomain: 'system', messageKind: 'mechanics', ttrpgPhase: 'secret' },
          }),
        ],
        total: 6,
        page: 1,
        pageSize: 20,
        hasMore: false,
      })),
    })
    const service = new LocationRoomService(repository, makeMembership())

    const result = await service.getPublicRoom('loc-1')

    expect(result.messages).toEqual([
      expect.objectContaining({
        id: 'msg-narrative-gm',
        messageDomain: 'narrative',
        messageKind: 'gm_beat',
        ttrpgPhase: 'threat',
      }),
      expect.objectContaining({
        id: 'msg-combat-action',
        messageDomain: 'combat',
        messageKind: 'character_action',
        ttrpgPhase: 'combat',
      }),
      expect.objectContaining({
        id: 'msg-legacy-outcome',
        gameplayMessageKind: 'gm_outcome',
        messageDomain: 'combat',
        messageKind: 'gm_outcome',
        ttrpgPhase: 'combat',
      }),
      expect.objectContaining({
        id: 'msg-roll-card',
        gameplayMessageKind: 'roll_card',
        messageDomain: 'combat',
        messageKind: 'roll_card',
        ttrpgPhase: 'combat',
        gameplayRolls: expect.objectContaining({
          action: expect.objectContaining({
            checkType: 'arcana',
            checkLabel: 'Read the Runes',
            checkSource: 'contextual',
            contextualCheckId: 'read-the-runes',
          }),
        }),
      }),
      expect.objectContaining({
        id: 'msg-legacy-agent',
        messageDomain: 'narrative',
        messageKind: 'character_reaction',
        ttrpgPhase: 'story',
      }),
      expect.objectContaining({ id: 'msg-wallet' }),
    ])
    expect(result.messages[5]).not.toHaveProperty('messageDomain')
    expect(result.messages[5]).not.toHaveProperty('messageKind')
    expect(result.messages[5]).not.toHaveProperty('ttrpgPhase')
    expect(JSON.stringify(result.messages)).not.toContain('privateNarrativeState')
    expect(JSON.stringify(result.messages)).not.toContain('privateMechanics')
    expect(JSON.stringify(result.messages)).not.toContain('rawDc')
    expect(JSON.stringify(result.messages)).not.toContain('private')
    expect(JSON.stringify(result.messages)).not.toContain('private_phase')
  })

  it('hides unfeatured publicAdventure metadata and projects only explicitly featured adventure state', async () => {
    const repository = makeRepository({
      listPublicMessages: jest.fn(async () => ({
        messages: [
          message({
            id: 'msg-legacy-adventure',
            sequence: 1,
            authorKind: 'game_master',
            tokenId: null,
            metadata: {
              publicAdventure: {
                stakes: 'Legacy publicAdventure should remain hidden unless featured.',
                activeDecision: {
                  id: 'legacy-choice',
                  prompt: 'Hidden prompt?',
                  options: [{ id: 'hidden', label: 'Hidden option' }],
                },
              },
            },
          }),
          message({
            id: 'msg-adventure',
            sequence: 2,
            authorKind: 'game_master',
            tokenId: null,
            metadata: {
              publicAdventureVisibility: 'featured',
              publicAdventure: {
                stakes: 'The bell market closes at moonrise.',
                activeDecision: {
                  id: 'market-choice',
                  prompt: 'Who do you approach?',
                  options: [
                    { id: 'merchant', label: 'Bell merchant', summary: 'Ask about the hush-map.' },
                    { id: 'guard', label: 'Ash guard' },
                    { id: 'well', label: 'Old well' },
                    { id: 'roof', label: 'Roofline' },
                    { id: 'extra', label: 'Too many options' },
                  ],
                  selectedOptionId: 'guard',
                },
                declaredAction: {
                  tokenId: 1,
                  summary: 'Ash questions the guard.',
                  chosenOptionId: 'guard',
                  chosenOptionLabel: 'Forged label',
                  actionIntent: 'parley',
                  privatePrompt: 'hidden',
                },
                consequence: {
                  summary: 'The guard demands a name before opening the stair.',
                  status: 'complication',
                  tier: 'partial_success',
                  rawDc: 99,
                },
                clocks: [
                  { id: 'market-close', label: 'Market close', value: 2, max: 6, summary: 'The third bell approaches.', private: true },
                  { id: 'unsafe', label: 'HP clock', value: 1, max: 6, summary: 'HP hidden.' },
                ],
              },
              adventure: { currentStakes: 'private durable state' },
              adventurePatch: { currentStakes: 'raw patch' },
              adjudication: { hidden: true },
              privateNarrativeState: 'do not expose',
            },
          }),
          message({
            id: 'msg-unsafe-adventure',
            sequence: 3,
            metadata: {
              publicAdventure: {
                stakes: 'Wallet 0x1234567890123456789012345678901234567890 wins rewards.',
                consequence: { summary: 'Gain reward XP.', status: 'advantage' },
              },
            },
          }),
        ],
        total: 3,
        page: 1,
        pageSize: 20,
        hasMore: false,
      })),
    })
    const service = new LocationRoomService(repository, makeMembership())

    const result = await service.getPublicRoom('loc-1')

    expect(result.messages[0]).toMatchObject({ id: 'msg-legacy-adventure' })
    expect(result.messages[0]).not.toHaveProperty('adventure')
    expect(result.messages[1]).toMatchObject({
      id: 'msg-adventure',
      adventure: {
        stakes: 'The bell market closes at moonrise.',
        activeDecision: {
          id: 'market-choice',
          prompt: 'Who do you approach?',
          options: [
            { id: 'merchant', label: 'Bell merchant', summary: 'Ask about the hush-map.' },
            { id: 'guard', label: 'Ash guard' },
            { id: 'well', label: 'Old well' },
            { id: 'roof', label: 'Roofline' },
          ],
          selectedOptionId: 'guard',
          selectedOptionLabel: 'Ash guard',
        },
        declaredAction: {
          tokenId: 1,
          summary: 'Ash questions the guard.',
          chosenOptionId: 'guard',
          chosenOptionLabel: 'Ash guard',
          actionIntent: 'parley',
        },
        consequence: {
          summary: 'The guard demands a name before opening the stair.',
          status: 'complication',
          tier: 'partial_success',
        },
        clocks: [{ id: 'market-close', label: 'Market close', value: 2, max: 6, summary: 'The third bell approaches.' }],
      },
    })
    expect(result.messages[2]).not.toHaveProperty('adventure')
    expect(JSON.stringify(result.messages)).not.toContain('Legacy publicAdventure should remain hidden')
    expect(JSON.stringify(result.messages)).not.toContain('Hidden prompt')
    expect(JSON.stringify(result.messages)).not.toContain('private durable state')
    expect(JSON.stringify(result.messages)).not.toContain('raw patch')
    expect(JSON.stringify(result.messages)).not.toContain('adjudication')
    expect(JSON.stringify(result.messages)).not.toContain('privateNarrativeState')
    expect(JSON.stringify(result.messages)).not.toContain('privatePrompt')
    expect(JSON.stringify(result.messages)).not.toContain('rawDc')
    expect(JSON.stringify(result.messages)).not.toContain('Wallet')
    expect(JSON.stringify(result.messages)).not.toContain('reward')
    expect(JSON.stringify(result.messages)).not.toContain('HP')
  })

  it('adds safe public gameplay summaries and message classification without raw mechanics metadata', async () => {
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const repository = makeRepository({
      listPublicMessages: jest.fn(async () => ({
        messages: [
          message({
            id: 'msg-gm',
            sequence: 1,
            authorKind: 'game_master',
            tokenId: null,
            authorName: 'WAGDIE Game Master',
            content: 'The marrow gate opens.',
            metadata: {
              gameplayMessageKind: 'gm_outcome',
              publicRolls: {
                action: {
                  actionType: 'attack',
                  actor: { kind: 'character', id: '1', tokenId: 1, name: 'Ash', ownerAddress: '0xHidden' },
                  target: { kind: 'monster', id: 'monster-1', name: 'Bell Horror', privateHp: 4 },
                  roll: { formula: 'd20', total: 16, rawRolls: [16] },
                  modifier: 2,
                  total: 18,
                  dc: 12,
                  tier: 'success',
                  outcome: 'success',
                },
                publicEffects: [
                  { kind: 'damage', target: { kind: 'monster', id: 'monster-1', name: 'Bell Horror' }, amount: 5, status: null, summary: 'Damage dealt: 5', privateBeforeHp: 9 },
                ],
                retaliation: null,
                deaths: [],
                encounterStatusAfter: 'active',
                mechanicalDeltas: { hidden: true },
              },
              diceResults: [{ total: 20 }],
              mechanicalDeltas: { hidden: true },
              privateInstruction: 'do not expose',
            },
          }),
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        hasMore: false,
      })),
    })
    const gameplayRepository = makeGameplayRepository({
      findActiveRunByRoomId: jest.fn(async () => gameplayRun({ completedTurns: 7, targetCompletedTurns: 100 })),
      findStateByRoomId: jest.fn(async () => ({
        id: 'state-1',
        roomId: 'room-1',
        locationId: 'loc-1',
        status: 'active_encounter',
        activeEncounterId: 'encounter-1',
        characters: {
          '1': { tokenId: 1, name: 'Ash', hp: 8, maxHp: 10, status: 'alive', xp: 0, temporaryBoons: [], wounds: [], performance: { roundsActed: 3, roundsSurvived: 3, damageDealt: 12, damageTaken: 2, successfulAttacks: 1, successfulDefends: 0, successfulHelps: 0, successfulNoncombatActions: 0, objectiveContributions: 1, criticalSuccesses: 1, criticalFailures: 0, fledCount: 0 } },
          '2': { tokenId: 2, name: 'Bone', hp: 2, maxHp: 10, status: 'alive', xp: 0, temporaryBoons: [], wounds: [] },
        },
        rewards: {
          privateLedger: true,
          rewardClaim: { performanceScore: 88, lineItems: [{ assetType: 'gameplay_reward_points', amount: 88 }] },
        },
        metadata: { model: 'hidden', claimStatus: 'pending_review' },
        createdAt: now,
        updatedAt: now,
      })),
      findEncounterById: jest.fn(async () => ({
        id: 'encounter-1',
        roomId: 'room-1',
        locationId: 'loc-1',
        status: 'active',
        difficulty: 'normal',
        roundNumber: 3,
        publicTitle: 'The Marrow Gate',
        publicSummary: 'A gate made of bells demands blood.',
        monsterState: [
          { id: 'monster-1', name: 'Bell Horror', archetype: 'lurking threat', hp: 4, maxHp: 12, ac: 12, attackBonus: 2, damageFormula: '1d6', status: 'alive' },
        ],
        rewardPlan: {
          xpPerCharacter: 25,
          temporaryBoons: ['Ashen focus'],
          narrativeRewards: ['The gate remembers your names'],
          victoryText: 'The bell falls silent.',
        },
        mechanics: { privateDc: 12 },
        metadata: { hiddenPrompt: true },
        lastError: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      })),
    })
    const service = new LocationRoomService(
      repository,
      makeMembership([participant(1, 'Ash'), participant(2, 'Bone')]),
      { generateTurn: jest.fn() },
      undefined,
      undefined,
      undefined,
      gameplayRepository
    )

    const result = await service.getPublicRoom('loc-1')

    expect(result.messages).toEqual([expect.objectContaining({
      id: 'msg-gm',
      gameplayMessageKind: 'gm_outcome',
      gameplayRolls: expect.objectContaining({
        action: expect.objectContaining({
          actionType: 'attack',
          actor: { kind: 'character', id: '1', tokenId: 1, name: 'Ash' },
          target: { kind: 'monster', id: 'monster-1', tokenId: undefined, name: 'Bell Horror' },
          roll: { formula: 'd20', total: 16 },
          total: 18,
          dc: 12,
        }),
        publicEffects: [expect.objectContaining({ kind: 'damage', amount: 5 })],
        encounterStatusAfter: 'active',
      }),
    })])
    expect(result.activity).toEqual(expect.objectContaining({
      messageCount: 1,
      latestSequence: 1,
      latestMessageCreatedAt: now,
      completedTurnCount: 7,
      targetTurnCount: 100,
    }))
    expect(result.gameplay).toMatchObject({
      mode: 'enabled',
      status: 'active_encounter',
      encounter: {
        publicTitle: 'The Marrow Gate',
        status: 'active',
        round: 3,
      },
      characters: [
        expect.objectContaining({ tokenId: 1, hpBand: 'healthy' }),
        expect.objectContaining({ tokenId: 2, hpBand: 'critical' }),
      ],
      monsters: [expect.objectContaining({ id: 'monster-1', hpBand: 'injured' })],
      pendingRewardSummary: expect.objectContaining({
        victoryText: 'The bell falls silent.',
        temporaryBoons: ['Ashen focus'],
      }),
    })
    expect(result.gameplay.characters[0]).not.toHaveProperty('hp')
    expect(result.gameplay.characters[0]).not.toHaveProperty('maxHp')
    expect(JSON.stringify(result)).not.toContain('privateInstruction')
    expect(JSON.stringify(result)).not.toContain('diceResults')
    expect(JSON.stringify(result)).not.toContain('mechanicalDeltas')
    expect(JSON.stringify(result)).not.toContain('ownerAddress')
    expect(JSON.stringify(result)).not.toContain('privateBeforeHp')
    expect(JSON.stringify(result)).not.toContain('privateHp')
    expect(JSON.stringify(result)).not.toContain('privateDc')
    expect(JSON.stringify(result)).not.toContain('hiddenPrompt')
    expect(JSON.stringify(result)).not.toContain('roundsActed')
    expect(JSON.stringify(result)).not.toContain('damageDealt')
    expect(JSON.stringify(result)).not.toContain('performanceScore')
    expect(JSON.stringify(result)).not.toContain('lineItems')
    expect(JSON.stringify(result)).not.toContain('claimStatus')
  })

  it('omits malformed stored public roll metadata from public messages', async () => {
    const repository = makeRepository({
      listPublicMessages: jest.fn(async () => ({
        messages: [
          message({
            id: 'msg-bad-rolls',
            authorKind: 'game_master',
            tokenId: null,
            metadata: {
              gameplayMessageKind: 'gm_outcome',
              publicRolls: { publicEffects: [{ kind: 'damage', amount: 999, summary: 'no action' }] },
              rollSummary: 'Rolls: legacy debug text is retained in metadata but not forwarded.',
            },
          }),
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        hasMore: false,
      })),
    })
    const service = new LocationRoomService(repository, makeMembership())

    const result = await service.getPublicRoom('loc-1')

    expect(result.messages[0]).toMatchObject({
      id: 'msg-bad-rolls',
      gameplayMessageKind: 'gm_outcome',
    })
    expect(result.messages[0]).not.toHaveProperty('gameplayRolls')
    expect(JSON.stringify(result.messages[0])).not.toContain('rollSummary')
  })

  it('omits stale gameplay summaries when the public gameplay gate is disabled', async () => {
    mutableGameplayConfig.enabled = false
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const gameplayRepository = makeGameplayRepository({
      findStateByRoomId: jest.fn(async () => ({
        id: 'state-1',
        roomId: 'room-1',
        locationId: 'loc-1',
        status: 'active_encounter',
        activeEncounterId: 'encounter-1',
        characters: {},
        rewards: {},
        metadata: {},
        createdAt: now,
        updatedAt: now,
      })),
      findEncounterById: jest.fn(async () => ({
        id: 'encounter-1',
        roomId: 'room-1',
        locationId: 'loc-1',
        status: 'active',
        difficulty: 'normal',
        roundNumber: 1,
        publicTitle: 'Hidden stale encounter',
        publicSummary: 'Should not be public while disabled.',
        monsterState: [],
        rewardPlan: {},
        mechanics: {},
        metadata: {},
        lastError: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      })),
    })
    const service = new LocationRoomService(
      makeRepository(),
      makeMembership(),
      { generateTurn: jest.fn() },
      undefined,
      undefined,
      undefined,
      gameplayRepository
    )

    const result = await service.getPublicRoom('loc-1')

    expect(result.gameplay).toBeUndefined()
    expect(gameplayRepository.findStateByRoomId).not.toHaveBeenCalled()
    expect(gameplayRepository.findEncounterById).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('Hidden stale encounter')
  })

  it('queues an owner-requested tick only when the wallet owns an eligible participant', async () => {
    const repository = makeRepository()
    const membership = makeMembership([
      participant(2, 'Bone'),
      { ...participant(1, 'Ash'), ownerAddress: '0xabc', stakerAddress: null },
    ])
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(),
    }
    const service = new LocationRoomService(repository, membership, turnGenerator)

    const result = await service.requestTick('loc-1', {
      actor: 'owner',
      walletAddress: '0xAbC',
      now: new Date(now),
    })

    expect(result).toMatchObject({
      roomId: 'room-1',
      locationId: 'loc-1',
      triggerType: 'owner',
      requestedByTokenId: 1,
      participantCount: 2,
      deduped: false,
    })
    expect(repository.enqueueTick).toHaveBeenCalledWith(expect.objectContaining({
      triggerType: 'owner',
      requestedByWallet: '0xabc',
      requestedByTokenId: 1,
      turnIntent: 'auto',
    }))
  })

  it('rejects owner-requested ticks for non-owner wallets', async () => {
    const repository = makeRepository()
    const service = new LocationRoomService(repository, makeMembership(), { generateTurn: jest.fn() })

    await expect(service.requestTick('loc-1', {
      actor: 'owner',
      walletAddress: '0xnotowner',
      now: new Date(now),
    })).rejects.toMatchObject({ name: 'LocationRoomForbiddenError' })

    expect(repository.enqueueTick).not.toHaveBeenCalled()
  })

  it('rejects manual ticks when fewer than two participants are eligible', async () => {
    const repository = makeRepository()
    const service = new LocationRoomService(
      repository,
      makeMembership([{ ...participant(1), ownerAddress: '0xabc' }]),
      { generateTurn: jest.fn() }
    )

    await expect(service.requestTick('loc-1', {
      actor: 'owner',
      walletAddress: '0xabc',
      now: new Date(now),
    })).rejects.toMatchObject({ name: 'LocationRoomInsufficientParticipantsError' })

    expect(repository.enqueueTick).not.toHaveBeenCalled()
  })

  it('enforces owner manual trigger cooldown after recent completed owner ticks', async () => {
    const recentTick = tick({
      triggerType: 'owner',
      requestedByWallet: '0xabc',
      status: 'completed',
      createdAt: new Date(new Date(now).getTime() - 60_000).toISOString(),
    })
    const repository = makeRepository({
      findRecentCompletedOwnerTick: jest.fn(async () => recentTick),
    })
    const service = new LocationRoomService(
      repository,
      makeMembership([{ ...participant(1), ownerAddress: '0xabc' }, participant(2)]),
      { generateTurn: jest.fn() }
    )

    await expect(service.requestTick('loc-1', {
      actor: 'owner',
      walletAddress: '0xabc',
      now: new Date(now),
    })).rejects.toMatchObject({ name: 'LocationRoomManualCooldownError', retryAfterSeconds: 240 })

    expect(repository.enqueueTick).not.toHaveBeenCalled()
  })

  it('allows admin-requested ticks without participant ownership', async () => {
    const repository = makeRepository()
    const service = new LocationRoomService(repository, makeMembership(), { generateTurn: jest.fn() })

    const result = await service.requestTick('loc-1', {
      actor: 'admin',
      walletAddress: '0xAdmin',
      now: new Date(now),
    })

    expect(result).toMatchObject({ triggerType: 'admin', requestedByTokenId: null })
    expect(repository.findRecentCompletedOwnerTick).not.toHaveBeenCalled()
    expect(repository.enqueueTick).toHaveBeenCalledWith(expect.objectContaining({
      triggerType: 'admin',
      requestedByWallet: '0xadmin',
      requestedByTokenId: null,
      turnIntent: 'auto',
    }))
  })

  it('rejects owner combat tick intent but lets admin combat intent create a metadata-backed trigger', async () => {
    const ownerRepository = makeRepository()
    const ownerService = new LocationRoomService(
      ownerRepository,
      makeMembership([{ ...participant(1), ownerAddress: '0xabc' }, participant(2)]),
      { generateTurn: jest.fn() }
    )

    await expect(ownerService.requestTick('loc-1', {
      actor: 'owner',
      walletAddress: '0xabc',
      intent: 'combat',
      now: new Date(now),
    })).rejects.toBeInstanceOf(LocationRoomManualTickIntentForbiddenError)
    expect(ownerRepository.enqueueTick).not.toHaveBeenCalled()

    await expect(ownerService.requestTick('loc-1', {
      actor: 'admin',
      walletAddress: '0xAdmin',
      intent: 'combat',
      now: new Date(now),
    })).rejects.toMatchObject({
      name: 'LocationRoomGameplayConfigError',
      message: 'Combat tick intent requires gameplay to be enabled for this location',
    })

    mutableElizaConfig.mode = 'official'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    const adminRepository = makeRepository()
    const narrativeRepository = makeNarrativeRepository(narrativeState({ metadata: { existing: 'kept' } }))
    const gameplayRepository = makeGameplayRepository()
    const adminService = new LocationRoomService(
      adminRepository,
      makeMembership(),
      { generateTurn: jest.fn() },
      undefined,
      undefined,
      undefined,
      gameplayRepository,
      narrativeRepository
    )

    const result = await adminService.requestTick('loc-1', {
      actor: 'admin',
      walletAddress: '0xAdmin',
      intent: 'combat',
      now: new Date(now),
    })

    expect(result).toMatchObject({ triggerType: 'admin', requestedByTokenId: null, turnIntent: 'combat' })
    expect(narrativeRepository.ensureStateForRoom).toHaveBeenCalledWith({ room: expect.objectContaining({ id: 'room-1' }) })
    expect(narrativeRepository.updateState).toHaveBeenCalledWith(expect.objectContaining({ id: 'room-1' }), expect.objectContaining({
      metadata: expect.objectContaining({
        existing: 'kept',
        source: 'location-room-manual-tick-intent',
        ttrpgPhase: 'threat',
        combatReadiness: 'ready',
        threatLevel: 5,
        requestedGameplayAction: 'start_combat',
        lastCombatTriggerBeatId: 'manual:tick-1',
        lastManualIntent: 'combat',
        lastManualIntentActor: 'admin',
      }),
    }))
    expect(adminRepository.enqueueTick).toHaveBeenCalledWith(expect.objectContaining({
      triggerType: 'admin',
      turnIntent: 'combat',
    }))
  })

  it('promotes a deduped pending manual tick by intent priority without downgrading stronger intent', async () => {
    const pendingAutoTick = tick({ id: 'tick-existing', status: 'pending', turnIntent: 'auto', lockedAt: null, lockedBy: null, startedAt: null })
    const promotedStoryTick = tick({ id: 'tick-existing', status: 'pending', turnIntent: 'story', lockedAt: null, lockedBy: null, startedAt: null })
    const storyRepository = makeRepository({
      enqueueTick: jest.fn(async () => ({ tick: null, deduped: true })),
      findOpenTickForRoom: jest.fn(async () => pendingAutoTick),
      promoteOpenTickIntent: jest.fn(async () => promotedStoryTick),
    })
    const storyService = new LocationRoomService(storyRepository, makeMembership(), { generateTurn: jest.fn() })

    const storyResult = await storyService.requestTick('loc-1', {
      actor: 'admin',
      walletAddress: '0xAdmin',
      intent: 'story',
      now: new Date(now),
    })

    expect(storyResult).toMatchObject({ deduped: true, tickId: 'tick-existing', turnIntent: 'story' })
    expect(storyRepository.promoteOpenTickIntent).toHaveBeenCalledWith({
      tickId: 'tick-existing',
      roomId: 'room-1',
      turnIntent: 'story',
    })

    const strongerStoryTick = tick({ id: 'tick-story', status: 'pending', turnIntent: 'story', lockedAt: null, lockedBy: null, startedAt: null })
    const autoRepository = makeRepository({
      enqueueTick: jest.fn(async () => ({ tick: null, deduped: true })),
      findOpenTickForRoom: jest.fn(async () => strongerStoryTick),
      promoteOpenTickIntent: jest.fn(),
    })
    const autoService = new LocationRoomService(autoRepository, makeMembership(), { generateTurn: jest.fn() })

    const autoResult = await autoService.requestTick('loc-1', {
      actor: 'admin',
      walletAddress: '0xAdmin',
      intent: 'auto',
      now: new Date(now),
    })

    expect(autoResult).toMatchObject({ deduped: true, tickId: 'tick-story', turnIntent: 'story' })
    expect(autoRepository.promoteOpenTickIntent).not.toHaveBeenCalled()

    const failedAutoTick = tick({
      id: 'tick-failed',
      status: 'failed',
      turnIntent: 'auto',
      lockedAt: null,
      lockedBy: null,
      nextAttemptAt: new Date(new Date(now).getTime() + 60_000).toISOString(),
    })
    const failedStoryTick = tick({ ...failedAutoTick, turnIntent: 'story' })
    const failedRepository = makeRepository({
      enqueueTick: jest.fn(),
      findOpenTickForRoom: jest.fn(async () => failedAutoTick),
      promoteOpenTickIntent: jest.fn(async () => failedStoryTick),
    })
    const failedService = new LocationRoomService(failedRepository, makeMembership(), { generateTurn: jest.fn() })

    const failedResult = await failedService.requestTick('loc-1', {
      actor: 'admin',
      walletAddress: '0xAdmin',
      intent: 'story',
      now: new Date(now),
    })

    expect(failedResult).toMatchObject({ deduped: true, tickId: 'tick-failed', turnIntent: 'story' })
    expect(failedRepository.enqueueTick).not.toHaveBeenCalled()
    expect(failedRepository.promoteOpenTickIntent).toHaveBeenCalledWith({
      tickId: 'tick-failed',
      roomId: 'room-1',
      turnIntent: 'story',
    })
  })

  it('does not mutate processing ticks during deduped intent promotion', async () => {
    mutableElizaConfig.mode = 'official'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    const processingTick = tick({ id: 'tick-processing', status: 'processing', turnIntent: 'auto' })
    const repository = makeRepository({
      enqueueTick: jest.fn(async () => ({ tick: null, deduped: true })),
      findOpenTickForRoom: jest.fn(async () => processingTick),
      promoteOpenTickIntent: jest.fn(),
    })
    const narrativeRepository = makeNarrativeRepository(narrativeState({ metadata: {} }))
    const service = new LocationRoomService(
      repository,
      makeMembership(),
      { generateTurn: jest.fn() },
      undefined,
      undefined,
      undefined,
      makeGameplayRepository(),
      narrativeRepository
    )

    const result = await service.requestTick('loc-1', {
      actor: 'admin',
      walletAddress: '0xAdmin',
      intent: 'combat',
      now: new Date(now),
    })

    expect(result).toMatchObject({ deduped: true, tickId: 'tick-processing', turnIntent: 'auto' })
    expect(repository.promoteOpenTickIntent).not.toHaveBeenCalled()
    expect(narrativeRepository.updateState).not.toHaveBeenCalled()
  })

  it('manual enqueue-and-process claims the newly enqueued room tick and returns terminal processing', async () => {
    const claimedTick = tick({ id: 'tick-new', status: 'processing', attempts: 1 })
    const repository = makeRepository({
      enqueueTick: jest.fn(async () => ({ tick: tick({ id: 'tick-new', status: 'pending', attempts: 0, lockedAt: null, lockedBy: null, startedAt: null }), deduped: false })),
      claimTick: jest.fn(async () => claimedTick),
    })
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({ officialAgentId: 'agent-1', content: 'Manual room stirs.' })),
    }
    const service = new LocationRoomService(repository, makeMembership(), turnGenerator)

    const result = await service.requestTickAndProcess('loc-1', {
      actor: 'admin',
      walletAddress: '0xAdmin',
      now: new Date(now),
    })

    expect(result).toMatchObject({
      triggerType: 'admin',
      deduped: false,
      tickId: 'tick-new',
      processing: {
        attempted: true,
        status: 'completed',
        tickId: 'tick-new',
        result: { status: 'completed', messageId: 'msg-new' },
      },
    })
    expect(repository.findOldestProcessableTickForRoom).not.toHaveBeenCalled()
    expect(repository.claimTick).toHaveBeenCalledWith('tick-new', expect.stringMatching(/^location-room-manual-/), new Date(now))
    expect(turnGenerator.generateTurn).toHaveBeenCalled()
  })

  it('manual gameplay initiation does not batch-drain follow-up turns in the click request', async () => {
    mutableElizaConfig.mode = 'official'
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const activeRun = gameplayRun({ id: 'run-1', targetCompletedTurns: 100, completedTurns: 0 })
    const claimedTick = tick({ id: 'tick-new', status: 'processing', attempts: 1, gameplayRunId: 'run-1' })
    const repository = makeRepository({
      enqueueTick: jest.fn(async () => ({ tick: tick({ id: 'tick-new', status: 'pending', attempts: 0, gameplayRunId: 'run-1', lockedAt: null, lockedBy: null, startedAt: null }), deduped: false })),
      claimTick: jest.fn(async () => claimedTick),
      countCompletedGameplayTurnsForRun: jest.fn(async () => 1),
    })
    const gameplayRepository = makeGameplayRepository({
      findRunById: jest.fn(async () => activeRun),
      findActiveEncounterByRoomId: jest.fn(async () => gameplayEncounter()),
      updateRunProgress: jest.fn(async (_runId, input) => gameplayRun({ ...activeRun, completedTurns: input.completedTurns, lastTickId: input.lastTickId ?? null, lastAdvancedAt: input.lastAdvancedAt ?? null })),
      findTurnByTickId: jest.fn(async () => null),
    })
    const gameplayCoordinator: jest.Mocked<LocationRoomGameplayCoordinator> = {
      processTurn: jest.fn(async () => ({
        status: 'completed',
        selectedTokenId: 1,
        messageId: 'msg-gameplay-action',
        messageIds: ['msg-gameplay-action'],
      })),
      markTickFailed: jest.fn(async () => undefined),
    }
    const service = new LocationRoomService(
      repository,
      makeMembership(),
      { generateTurn: jest.fn() },
      undefined,
      undefined,
      gameplayCoordinator,
      gameplayRepository
    )
    const automationSpy = jest.spyOn(service, 'runScheduledWorker')

    const result = await service.requestTickAndProcess('loc-1', {
      actor: 'admin',
      walletAddress: '0xAdmin',
      now: new Date(now),
    })

    expect(result.processing).toMatchObject({ attempted: true, status: 'completed', tickId: 'tick-new' })
    expect(automationSpy).not.toHaveBeenCalled()
  })

  it('manual enqueue-and-process claims a newly enqueued tick at its DB due timestamp when DB time is ahead', async () => {
    const dbDueAt = new Date(new Date(now).getTime() + 250).toISOString()
    const claimedTick = tick({ id: 'tick-new', status: 'processing', attempts: 1 })
    const repository = makeRepository({
      enqueueTick: jest.fn(async () => ({
        tick: tick({
          id: 'tick-new',
          status: 'pending',
          attempts: 0,
          nextAttemptAt: dbDueAt,
          lockedAt: null,
          lockedBy: null,
          startedAt: null,
        }),
        deduped: false,
      })),
      claimTick: jest.fn(async () => claimedTick),
    })
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({ officialAgentId: 'agent-1', content: 'Manual room stirs.' })),
    }
    const service = new LocationRoomService(repository, makeMembership(), turnGenerator)

    const result = await service.requestTickAndProcess('loc-1', {
      actor: 'admin',
      walletAddress: '0xAdmin',
      now: new Date(now),
    })

    expect(result.processing).toMatchObject({ attempted: true, status: 'completed', tickId: 'tick-new' })
    expect(repository.claimTick).toHaveBeenCalledWith(
      'tick-new',
      expect.stringMatching(/^location-room-manual-/),
      new Date(dbDueAt)
    )
  })

  it('manual enqueue-and-process processes the oldest due room tick when enqueue dedupes', async () => {
    const pendingTick = tick({ id: 'tick-existing', status: 'pending', attempts: 0, lockedAt: null, lockedBy: null, startedAt: null })
    const repository = makeRepository({
      enqueueTick: jest.fn(async () => ({ tick: null, deduped: true })),
      findOldestProcessableTickForRoom: jest.fn(async () => pendingTick),
      claimTick: jest.fn(async () => tick({ id: 'tick-existing', status: 'processing', attempts: 1 })),
    })
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({ officialAgentId: 'agent-1', content: 'Deduped room stirs.' })),
    }
    const service = new LocationRoomService(repository, makeMembership(), turnGenerator)

    const result = await service.requestTickAndProcess('loc-1', {
      actor: 'admin',
      walletAddress: '0xAdmin',
      now: new Date(now),
    })

    expect(result).toMatchObject({
      deduped: true,
      tickId: null,
      processing: { attempted: true, status: 'completed', tickId: 'tick-existing' },
    })
    expect(repository.findOldestProcessableTickForRoom).toHaveBeenCalledWith('room-1', new Date(now))
    expect(repository.claimTick).toHaveBeenCalledWith('tick-existing', expect.stringMatching(/^location-room-manual-/), new Date(now))
  })

  it('manual enqueue-and-process reports already_processing without processing unrelated room ticks', async () => {
    const processingTick = tick({ id: 'tick-processing', status: 'processing' })
    const repository = makeRepository({
      enqueueTick: jest.fn(async () => ({ tick: null, deduped: true })),
      findOldestProcessableTickForRoom: jest.fn(async () => null),
      findNonStaleProcessingTickForRoom: jest.fn(async () => processingTick),
      claimTick: jest.fn(),
      claimDueTicks: jest.fn(),
    })
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(),
    }
    const service = new LocationRoomService(repository, makeMembership(), turnGenerator)

    const result = await service.requestTickAndProcess('loc-1', {
      actor: 'admin',
      walletAddress: '0xAdmin',
      now: new Date(now),
    })

    expect(result.processing).toEqual({
      attempted: false,
      status: 'already_processing',
      tickId: 'tick-processing',
      reason: 'Tick is already owned by another worker',
    })
    expect(repository.claimTick).not.toHaveBeenCalled()
    expect(repository.claimDueTicks).not.toHaveBeenCalled()
    expect(turnGenerator.generateTurn).not.toHaveBeenCalled()
  })

  it('manual enqueue-and-process reports retry and dead states from bounded room processing', async () => {
    const failingRepository = makeRepository({
      claimTick: jest.fn(async () => tick({ id: 'tick-failed', status: 'processing', attempts: 1 })),
    })
    const failingGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => { throw new Error('manual generation failed') }),
    }
    const failingService = new LocationRoomService(failingRepository, makeMembership(), failingGenerator)

    const failed = await failingService.requestTickAndProcess('loc-1', {
      actor: 'admin',
      walletAddress: '0xAdmin',
      now: new Date(now),
    })

    const deadRepository = makeRepository({
      claimTick: jest.fn(async () => tick({ id: 'tick-dead', status: 'processing', attempts: 3 })),
    })
    const deadGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => { throw new Error('manual generation exhausted') }),
    }
    const deadService = new LocationRoomService(deadRepository, makeMembership(), deadGenerator)

    const dead = await deadService.requestTickAndProcess('loc-1', {
      actor: 'admin',
      walletAddress: '0xAdmin',
      now: new Date(now),
    })

    expect(failed.processing).toMatchObject({
      attempted: true,
      status: 'failed',
      tickId: 'tick-failed',
      result: { reason: 'retry_scheduled' },
    })
    expect(failingRepository.markTickFailed).toHaveBeenCalledWith('tick-failed', 'manual generation failed', expect.any(String))
    expect(dead.processing).toMatchObject({
      attempted: true,
      status: 'dead',
      tickId: 'tick-dead',
      result: { reason: 'attempts_exhausted' },
    })
    expect(deadRepository.markTickDead).toHaveBeenCalledWith('tick-dead', 'manual generation exhausted')
  })

  it('does not require a game-master agent id while narrative and gameplay modes are disabled', async () => {
    mutableNarrativeConfig.enabled = false
    mutableNarrativeConfig.gameMasterAgentId = ''
    mutableGameplayConfig.enabled = false
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const repository = makeRepository()
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({ officialAgentId: 'agent-1', content: 'The room stirs.' })),
    }
    const service = new LocationRoomService(repository, makeMembership(), turnGenerator)

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ completed: 1, failed: 0, dead: 0 })
    expect(isLocationRoomGameplayEnabledForLocation('loc-1')).toBe(false)
    expect(turnGenerator.generateTurn).toHaveBeenCalled()
  })

  it('requires gameplay prerequisites only for globally enabled allowlisted rooms', async () => {
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['LOC-1']
    mutableNarrativeConfig.enabled = false
    const repository = makeRepository()
    const service = new LocationRoomService(repository, makeMembership(), { generateTurn: jest.fn() })

    expect(isLocationRoomGameplayEnabledForLocation('loc-1')).toBe(true)
    expect(isLocationRoomGameplayEnabledForLocation('loc-2')).toBe(false)
    await expect(service.requestTick('loc-1', {
      actor: 'admin',
      walletAddress: '0xAdmin',
      now: new Date(now),
    })).rejects.toBeInstanceOf(LocationRoomGameplayConfigError)
    expect(repository.getLocation).not.toHaveBeenCalled()
  })

  it('accepts an allowlisted gameplay room without creating a combat run for auto intent', async () => {
    mutableElizaConfig.mode = 'official'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    const repository = makeRepository()
    const gameplayRepository = makeGameplayRepository()
    const service = new LocationRoomService(repository, makeMembership(), { generateTurn: jest.fn() }, undefined, undefined, undefined, gameplayRepository)

    const result = await service.requestTick('loc-1', {
      actor: 'admin',
      walletAddress: '0xAdmin',
      now: new Date(now),
    })

    expect(result).toMatchObject({
      triggerType: 'admin',
      deduped: false,
    })
    expect(result.gameplayRun).toBeUndefined()
    expect(gameplayRepository.createOrReuseActiveRun).not.toHaveBeenCalled()
    expect(repository.enqueueTick).toHaveBeenCalledWith(expect.objectContaining({
      gameplayRunId: null,
    }))
  })

  it('does not create or reuse combat runs for repeated auto manual ticks', async () => {
    mutableElizaConfig.mode = 'official'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    const repository = makeRepository()
    const gameplayRepository = makeGameplayRepository({
      createOrReuseActiveRun: jest.fn()
        .mockResolvedValueOnce({ run: gameplayRun({ id: 'run-1', completedTurns: 0 }), reused: false })
        .mockResolvedValueOnce({ run: gameplayRun({ id: 'run-1', completedTurns: 1 }), reused: true }),
    })
    const service = new LocationRoomService(repository, makeMembership(), { generateTurn: jest.fn() }, undefined, undefined, undefined, gameplayRepository)

    const first = await service.requestTick('loc-1', {
      actor: 'admin',
      walletAddress: '0xAdmin',
      now: new Date(now),
    })
    const second = await service.requestTick('loc-1', {
      actor: 'admin',
      walletAddress: '0xAdmin',
      now: new Date(now),
    })

    expect(gameplayRepository.createOrReuseActiveRun).not.toHaveBeenCalled()
    expect(first.gameplayRun).toBeUndefined()
    expect(second.gameplayRun).toBeUndefined()
    expect(repository.enqueueTick).toHaveBeenCalledWith(expect.objectContaining({ gameplayRunId: null }))
  })

  it('enqueues scheduled gameplay ticks without pre-attaching an active run', async () => {
    mutableElizaConfig.mode = 'official'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    const repository = makeRepository()
    const gameplayRepository = makeGameplayRepository({
      findActiveRunByRoomId: jest.fn(async () => gameplayRun({ id: 'run-active' })),
    })
    const service = new LocationRoomService(repository, makeMembership(), { generateTurn: jest.fn() }, undefined, undefined, undefined, gameplayRepository)

    await service.enqueueDueScheduledTicks(new Date(now))

    expect(repository.enqueueTick).toHaveBeenCalledWith(expect.objectContaining({
      triggerType: 'scheduled',
      gameplayRunId: null,
      turnIntent: 'auto',
    }))
    expect(gameplayRepository.findActiveRunByRoomId).not.toHaveBeenCalled()
  })

  it('does not attach a deduped auto manual tick to a combat run before routing', async () => {
    mutableElizaConfig.mode = 'official'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    const existingTick = tick({ id: 'tick-existing', status: 'pending', gameplayRunId: null })
    const attachedTick = tick({ id: 'tick-existing', status: 'pending', gameplayRunId: 'run-1' })
    const repository = makeRepository({
      enqueueTick: jest.fn(async () => ({ tick: null, deduped: true })),
      findOpenTickForRoom: jest.fn(async () => existingTick),
      attachTickToGameplayRun: jest.fn(async () => attachedTick),
    })
    const gameplayRepository = makeGameplayRepository({
      createOrReuseActiveRun: jest.fn(async () => ({ run: gameplayRun({ id: 'run-1', completedTurns: 3 }), reused: true })),
    })
    const service = new LocationRoomService(repository, makeMembership(), { generateTurn: jest.fn() }, undefined, undefined, undefined, gameplayRepository)

    const result = await service.requestTick('loc-1', {
      actor: 'admin',
      walletAddress: '0xAdmin',
      now: new Date(now),
    })

    expect(gameplayRepository.createOrReuseActiveRun).not.toHaveBeenCalled()
    expect(repository.attachTickToGameplayRun).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      deduped: true,
      tickId: 'tick-existing',
    })
    expect(result.gameplayRun).toBeUndefined()
  })

  it('does not attach or fast-forward a deduped failed auto tick before routing', async () => {
    mutableElizaConfig.mode = 'official'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    const retryAt = new Date(new Date(now).getTime() + 60_000).toISOString()
    const failedTick = tick({ id: 'tick-failed', status: 'failed', gameplayRunId: null, nextAttemptAt: retryAt })
    const attachedTick = tick({ id: 'tick-failed', status: 'failed', gameplayRunId: 'run-1', nextAttemptAt: retryAt })
    const repository = makeRepository({
      enqueueTick: jest.fn(async () => ({ tick: null, deduped: true })),
      findOpenTickForRoom: jest.fn(async () => failedTick),
      attachTickToGameplayRun: jest.fn(async () => attachedTick),
      claimTick: jest.fn(async () => null),
      findNonStaleProcessingTickForRoom: jest.fn(async () => null),
    })
    const service = new LocationRoomService(
      repository,
      makeMembership(),
      { generateTurn: jest.fn() },
      undefined,
      undefined,
      undefined,
      makeGameplayRepository()
    )

    const result = await service.requestTickAndProcess('loc-1', {
      actor: 'admin',
      walletAddress: '0xAdmin',
      now: new Date(now),
    })

    expect(repository.attachTickToGameplayRun).not.toHaveBeenCalled()
    expect(repository.claimTick).toHaveBeenCalledWith(
      'tick-1',
      expect.stringMatching(/^location-room-manual-/),
      new Date(now)
    )
    expect(result.processing).toMatchObject({
      attempted: false,
      status: 'not_claimable',
      tickId: 'tick-1',
    })
  })

  it('requires a game-master agent id only when narrative mode is enabled', async () => {
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = ''
    const repository = makeRepository()
    const failingGameMasterResolver = {
      resolveRuntimeGameMasterAgentId: jest.fn(async () => {
        throw new Error('Missing GM agent')
      }),
    }
    const service = new LocationRoomService(
      repository,
      makeMembership(),
      { generateTurn: jest.fn() },
      undefined,
      failingGameMasterResolver
    )

    await expect(service.requestTick('loc-1', {
      actor: 'admin',
      walletAddress: '0xAdmin',
      now: new Date(now),
    })).rejects.toMatchObject({ name: 'LocationRoomNarrativeConfigError' })

    expect(failingGameMasterResolver.resolveRuntimeGameMasterAgentId).toHaveBeenCalled()
    expect(repository.getLocation).not.toHaveBeenCalled()
    expect(repository.enqueueTick).not.toHaveBeenCalled()
  })

  it('runs a narrative-enabled scheduled tick through the narrative coordinator', async () => {
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    const repository = makeRepository()
    const membership = makeMembership()
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(),
    }
    const narrativeCoordinator: jest.Mocked<LocationRoomNarrativeCoordinator> = {
      processTurn: jest.fn(async () => ({ selectedTokenId: 1, messageId: 'msg-character' })),
      markTickFailed: jest.fn(async () => undefined),
    }
    const service = new LocationRoomService(repository, membership, turnGenerator, narrativeCoordinator)

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ enqueued: 1, processed: 1, completed: 1, skipped: 0, failed: 0, dead: 0 })
    expect(narrativeCoordinator.processTurn).toHaveBeenCalledWith(expect.objectContaining({
      room: expect.objectContaining({ id: 'room-1', locationId: 'loc-1' }),
      tick: expect.objectContaining({ id: 'tick-1' }),
      speaker: expect.objectContaining({ tokenId: 1 }),
      participants: expect.arrayContaining([expect.objectContaining({ tokenId: 1 })]),
      recentMessages: [],
    }))
    expect(turnGenerator.generateTurn).not.toHaveBeenCalled()
    expect(repository.appendMessage).not.toHaveBeenCalled()
    expect(repository.markTickCompleted).toHaveBeenCalledWith('tick-1')
    expect(repository.updateRoomAfterProcessedTick).toHaveBeenCalledWith(expect.objectContaining({ id: 'room-1' }), {
      tickIntervalMinutes: elizaConfig.locationRooms.activeNarrativeTickIntervalMinutes,
      now: new Date(now),
    })
  })

  it('preserves narrative scene-check result metadata and does not route it through combat', async () => {
    mutableElizaConfig.mode = 'official'
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const repository = makeRepository()
    const narrativeCoordinator: jest.Mocked<LocationRoomNarrativeCoordinator> = {
      processTurn: jest.fn(async () => ({
        selectedTokenId: 1,
        messageId: 'msg-gm-outcome',
        messageIds: ['msg-character-action', 'msg-roll-card', 'msg-gm-outcome'],
        sceneCheckId: 'scene_check:beat-1:ash-marks',
        sceneCheckDiagnostics: {
          requestPresent: true,
          proposalPresent: true,
          proposalErrorPresent: false,
          selected: true,
        },
      })),
      markTickFailed: jest.fn(async () => undefined),
    }
    const gameplayCoordinator: jest.Mocked<LocationRoomGameplayCoordinator> = {
      processTurn: jest.fn(async () => ({
        status: 'completed',
        selectedTokenId: 2,
        messageId: 'msg-gameplay-action',
      })),
      markTickFailed: jest.fn(async () => undefined),
    }
    const gameplayRepository = makeGameplayRepository({
      findActiveEncounterByRoomId: jest.fn(async () => null),
      createOrReuseActiveRun: jest.fn(),
    })
    const service = new LocationRoomService(
      repository,
      makeMembership([participant(1, 'Ash'), participant(2, 'Bone')]),
      { generateTurn: jest.fn() },
      narrativeCoordinator,
      undefined,
      gameplayCoordinator,
      gameplayRepository,
      makeNarrativeRepository()
    )

    const result = await service.runScheduledWorker(new Date(now))

    expect(result.results[0]).toMatchObject({
      status: 'completed',
      selectedTokenId: 1,
      messageId: 'msg-gm-outcome',
      messageIds: ['msg-character-action', 'msg-roll-card', 'msg-gm-outcome'],
      sceneCheckId: 'scene_check:beat-1:ash-marks',
    })
    expect(gameplayCoordinator.processTurn).not.toHaveBeenCalled()
    expect(gameplayRepository.createOrReuseActiveRun).not.toHaveBeenCalled()
    expect(gameplayRepository.createActiveEncounter).not.toHaveBeenCalled()
    expect(gameplayRepository.findTurnByTickId).not.toHaveBeenCalled()
    expect(console.info).toHaveBeenCalledWith(
      '[Eliza Location Rooms] tick route decision',
      expect.objectContaining({
        tickId: 'tick-1',
        roomId: 'room-1',
        locationId: 'loc-1',
        turnIntent: 'auto',
        gameplayGateResult: 'enabled',
        activeEncounterId: null,
        combatTriggerId: null,
        sceneCheckRequestPresent: true,
        sceneCheckProposalPresent: true,
        selectedRoute: 'narrative_scene_check',
        skipReason: null,
      })
    )
  })

  it('routes an allowlisted gameplay room through narrative when no encounter or trigger exists', async () => {
    mutableElizaConfig.mode = 'official'
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const repository = makeRepository()
    const narrativeCoordinator: jest.Mocked<LocationRoomNarrativeCoordinator> = {
      processTurn: jest.fn(async () => ({ selectedTokenId: 1, messageId: 'msg-character' })),
      markTickFailed: jest.fn(async () => undefined),
    }
    const gameplayCoordinator: jest.Mocked<LocationRoomGameplayCoordinator> = {
      processTurn: jest.fn(async () => ({
        status: 'completed',
        selectedTokenId: 2,
        messageId: 'msg-gameplay-action',
        messageIds: ['msg-gameplay-action'],
      })),
      markTickFailed: jest.fn(async () => undefined),
    }
    const service = new LocationRoomService(
      repository,
      makeMembership([participant(1, 'Ash'), participant(2, 'Bone')]),
      { generateTurn: jest.fn() },
      narrativeCoordinator,
      undefined,
      gameplayCoordinator,
      makeGameplayRepository(),
      makeNarrativeRepository()
    )

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ processed: 1, completed: 1, skipped: 0, failed: 0 })
    expect(gameplayCoordinator.processTurn).not.toHaveBeenCalled()
    expect(narrativeCoordinator.processTurn).toHaveBeenCalledWith(expect.objectContaining({
      room: expect.objectContaining({ id: 'room-1' }),
      tick: expect.objectContaining({ id: 'tick-1' }),
      speaker: expect.objectContaining({ tokenId: 1 }),
      participants: expect.arrayContaining([expect.objectContaining({ tokenId: 1 })]),
      recentMessages: [],
    }))
    expect(repository.markTickCompleted).toHaveBeenCalledWith('tick-1')
  })

  it('promotes sustained combat-ready metadata on an auto tick and routes through the existing trigger handoff', async () => {
    mutableElizaConfig.mode = 'official'
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const repository = makeRepository({
      attachTickToGameplayRun: jest.fn(async () => tick({ gameplayRunId: 'run-1' })),
      countCompletedGameplayTurnsForRun: jest.fn(async () => 1),
    })
    const narrativeRepository = makeNarrativeRepository(narrativeState({
      metadata: {
        ttrpgPhase: 'threat',
        combatReadiness: 'ready',
        threatLevel: 4,
        requestedGameplayAction: null,
        lastCombatReadyBeatId: 'beat-ready',
        consumedCombatTriggerBeatId: null,
        lastEncounterSeed: { title: 'Crow Ambush', summary: 'Crows descend.', stakes: 'Survive the roost.' },
      },
    }))
    narrativeRepository.listRecentBeatsByRoomId.mockResolvedValueOnce([
      { id: 'beat-ready', status: 'completed', metadata: { combatReadiness: 'ready' } } as any,
    ])
    const gameplayRepository = makeGameplayRepository({
      createOrReuseActiveRun: jest.fn(async () => ({ run: gameplayRun({ id: 'run-1' }), reused: false })),
      findActiveEncounterByRoomId: jest.fn(async () => null),
      findRunById: jest.fn(async () => gameplayRun({ id: 'run-1' })),
      findTurnByTickId: jest.fn(async () => null),
    })
    const gameplayCoordinator: jest.Mocked<LocationRoomGameplayCoordinator> = {
      processTurn: jest.fn(async () => ({
        status: 'completed',
        selectedTokenId: 2,
        messageId: 'msg-gameplay-action',
        messageIds: ['msg-gameplay-action'],
      })),
      markTickFailed: jest.fn(async () => undefined),
    }
    const narrativeCoordinator: jest.Mocked<LocationRoomNarrativeCoordinator> = {
      processTurn: jest.fn(),
      markTickFailed: jest.fn(async () => undefined),
    }
    const service = new LocationRoomService(
      repository,
      makeMembership(),
      { generateTurn: jest.fn() },
      narrativeCoordinator,
      undefined,
      gameplayCoordinator,
      gameplayRepository,
      narrativeRepository
    )

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ processed: 1, completed: 1, gameplayRuns: { updated: 1 } })
    expect(narrativeRepository.updateState).toHaveBeenCalledWith(expect.objectContaining({ id: 'room-1' }), expect.objectContaining({
      metadata: expect.objectContaining({
        source: 'location-room-combat-ready-promotion',
        requestedGameplayAction: 'start_combat',
        lastCombatTriggerBeatId: 'beat-ready',
        lastEncounterSeed: expect.objectContaining({ title: 'Crow Ambush' }),
        lastCombatReadyPromotion: expect.objectContaining({
          sourceBeatId: 'beat-ready',
          tickId: 'tick-1',
        }),
      }),
    }))
    expect(gameplayCoordinator.processTurn).toHaveBeenCalledWith(expect.objectContaining({
      encounterTrigger: expect.objectContaining({
        source: 'narrative',
        triggerId: 'beat-ready',
        narrativeBeatId: 'beat-ready',
        encounterSeed: expect.objectContaining({ title: 'Crow Ambush' }),
      }),
    }))
    expect(narrativeCoordinator.processTurn).not.toHaveBeenCalled()
  })

  it('does not promote combat-ready metadata on story intent', async () => {
    mutableElizaConfig.mode = 'official'
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const storyTick = tick({ turnIntent: 'story' })
    const repository = makeRepository({ claimDueTicks: jest.fn(async () => [storyTick]) })
    const narrativeRepository = makeNarrativeRepository(narrativeState({
      metadata: {
        ttrpgPhase: 'threat',
        combatReadiness: 'ready',
        threatLevel: 4,
        requestedGameplayAction: null,
        lastCombatReadyBeatId: 'beat-ready',
        consumedCombatTriggerBeatId: null,
        lastEncounterSeed: { title: 'Waiting Crows', summary: 'The rafters shift.', stakes: 'Hold the room.' },
      },
    }))
    const narrativeCoordinator: jest.Mocked<LocationRoomNarrativeCoordinator> = {
      processTurn: jest.fn(async () => ({ selectedTokenId: 1, messageId: 'msg-character' })),
      markTickFailed: jest.fn(async () => undefined),
    }
    const gameplayCoordinator: jest.Mocked<LocationRoomGameplayCoordinator> = {
      processTurn: jest.fn(),
      markTickFailed: jest.fn(async () => undefined),
    }
    const gameplayRepository = makeGameplayRepository({ findActiveEncounterByRoomId: jest.fn(async () => null) })
    const service = new LocationRoomService(
      repository,
      makeMembership(),
      { generateTurn: jest.fn() },
      narrativeCoordinator,
      undefined,
      gameplayCoordinator,
      gameplayRepository,
      narrativeRepository
    )

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ processed: 1, completed: 1 })
    expect(narrativeRepository.updateState).not.toHaveBeenCalled()
    expect(gameplayCoordinator.processTurn).not.toHaveBeenCalled()
    expect(narrativeCoordinator.processTurn).toHaveBeenCalled()
  })

  it('does not promote an explicit combat-ready source id when the beat is not safe ready material', async () => {
    mutableElizaConfig.mode = 'official'
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const narrativeRepository = makeNarrativeRepository(narrativeState({
      metadata: {
        ttrpgPhase: 'threat',
        combatReadiness: 'ready',
        threatLevel: 4,
        requestedGameplayAction: null,
        lastCombatReadyBeatId: 'beat-ready',
        consumedCombatTriggerBeatId: null,
        lastEncounterSeed: { title: 'Unsafe Explicit Crows', summary: 'The rafters shift.', stakes: 'Hold the room.' },
      },
    }))
    narrativeRepository.listRecentBeatsByRoomId.mockResolvedValueOnce([
      { id: 'beat-ready', status: 'completed', metadata: { combatReadiness: 'foreshadow' } } as any,
    ])
    const narrativeCoordinator: jest.Mocked<LocationRoomNarrativeCoordinator> = {
      processTurn: jest.fn(async () => ({ selectedTokenId: 1, messageId: 'msg-character' })),
      markTickFailed: jest.fn(async () => undefined),
    }
    const gameplayCoordinator: jest.Mocked<LocationRoomGameplayCoordinator> = {
      processTurn: jest.fn(),
      markTickFailed: jest.fn(async () => undefined),
    }
    const gameplayRepository = makeGameplayRepository({ findActiveEncounterByRoomId: jest.fn(async () => null) })
    const service = new LocationRoomService(
      makeRepository(),
      makeMembership(),
      { generateTurn: jest.fn() },
      narrativeCoordinator,
      undefined,
      gameplayCoordinator,
      gameplayRepository,
      narrativeRepository
    )

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ processed: 1, completed: 1 })
    expect(narrativeRepository.updateState).not.toHaveBeenCalled()
    expect(gameplayCoordinator.processTurn).not.toHaveBeenCalled()
    expect(narrativeCoordinator.processTurn).toHaveBeenCalled()
  })

  it('does not promote combat-ready metadata without a safe source beat', async () => {
    mutableElizaConfig.mode = 'official'
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const narrativeRepository = makeNarrativeRepository(narrativeState({
      metadata: {
        ttrpgPhase: 'threat',
        combatReadiness: 'ready',
        threatLevel: 4,
        requestedGameplayAction: null,
        consumedCombatTriggerBeatId: null,
        lastEncounterSeed: { title: 'Sourceless Crows', summary: 'The rafters shift.', stakes: 'Hold the room.' },
      },
    }))
    narrativeRepository.listRecentBeatsByRoomId.mockResolvedValueOnce([])
    const narrativeCoordinator: jest.Mocked<LocationRoomNarrativeCoordinator> = {
      processTurn: jest.fn(async () => ({ selectedTokenId: 1, messageId: 'msg-character' })),
      markTickFailed: jest.fn(async () => undefined),
    }
    const gameplayCoordinator: jest.Mocked<LocationRoomGameplayCoordinator> = {
      processTurn: jest.fn(),
      markTickFailed: jest.fn(async () => undefined),
    }
    const gameplayRepository = makeGameplayRepository({ findActiveEncounterByRoomId: jest.fn(async () => null) })
    const service = new LocationRoomService(
      makeRepository(),
      makeMembership(),
      { generateTurn: jest.fn() },
      narrativeCoordinator,
      undefined,
      gameplayCoordinator,
      gameplayRepository,
      narrativeRepository
    )

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ processed: 1, completed: 1 })
    expect(narrativeRepository.updateState).not.toHaveBeenCalled()
    expect(gameplayCoordinator.processTurn).not.toHaveBeenCalled()
    expect(narrativeCoordinator.processTurn).toHaveBeenCalled()
  })

  it('does not promote a bare lastBeatId unless the beat is a safe combat-ready source', async () => {
    mutableElizaConfig.mode = 'official'
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const narrativeRepository = makeNarrativeRepository(narrativeState({
      metadata: {
        ttrpgPhase: 'threat',
        combatReadiness: 'ready',
        threatLevel: 4,
        requestedGameplayAction: null,
        lastBeatId: 'beat-story',
        consumedCombatTriggerBeatId: null,
        lastEncounterSeed: { title: 'Unsafe Last Beat', summary: 'The rafters shift.', stakes: 'Hold the room.' },
      },
    }))
    narrativeRepository.listRecentBeatsByRoomId.mockResolvedValueOnce([
      { id: 'beat-story', status: 'completed', metadata: { combatReadiness: 'foreshadow' } } as any,
    ])
    const narrativeCoordinator: jest.Mocked<LocationRoomNarrativeCoordinator> = {
      processTurn: jest.fn(async () => ({ selectedTokenId: 1, messageId: 'msg-character' })),
      markTickFailed: jest.fn(async () => undefined),
    }
    const gameplayCoordinator: jest.Mocked<LocationRoomGameplayCoordinator> = {
      processTurn: jest.fn(),
      markTickFailed: jest.fn(async () => undefined),
    }
    const gameplayRepository = makeGameplayRepository({ findActiveEncounterByRoomId: jest.fn(async () => null) })
    const service = new LocationRoomService(
      makeRepository(),
      makeMembership(),
      { generateTurn: jest.fn() },
      narrativeCoordinator,
      undefined,
      gameplayCoordinator,
      gameplayRepository,
      narrativeRepository
    )

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ processed: 1, completed: 1 })
    expect(narrativeRepository.updateState).not.toHaveBeenCalled()
    expect(gameplayCoordinator.processTurn).not.toHaveBeenCalled()
    expect(narrativeCoordinator.processTurn).toHaveBeenCalled()
  })

  it('does not promote a combat-ready source beat that has already been consumed', async () => {
    mutableElizaConfig.mode = 'official'
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const narrativeRepository = makeNarrativeRepository(narrativeState({
      metadata: {
        ttrpgPhase: 'threat',
        combatReadiness: 'ready',
        threatLevel: 4,
        requestedGameplayAction: null,
        lastCombatReadyBeatId: 'beat-ready',
        consumedCombatTriggerBeatId: 'beat-ready',
        lastEncounterSeed: { title: 'Consumed Crows', summary: 'The rafters already broke.', stakes: 'Hold the room.' },
      },
    }))
    narrativeRepository.listRecentBeatsByRoomId.mockResolvedValueOnce([
      { id: 'beat-ready', status: 'completed', metadata: { combatReadiness: 'ready' } } as any,
    ])
    const narrativeCoordinator: jest.Mocked<LocationRoomNarrativeCoordinator> = {
      processTurn: jest.fn(async () => ({ selectedTokenId: 1, messageId: 'msg-character' })),
      markTickFailed: jest.fn(async () => undefined),
    }
    const gameplayCoordinator: jest.Mocked<LocationRoomGameplayCoordinator> = {
      processTurn: jest.fn(),
      markTickFailed: jest.fn(async () => undefined),
    }
    const gameplayRepository = makeGameplayRepository({ findActiveEncounterByRoomId: jest.fn(async () => null) })
    const service = new LocationRoomService(
      makeRepository(),
      makeMembership(),
      { generateTurn: jest.fn() },
      narrativeCoordinator,
      undefined,
      gameplayCoordinator,
      gameplayRepository,
      narrativeRepository
    )

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ processed: 1, completed: 1 })
    expect(narrativeRepository.updateState).not.toHaveBeenCalled()
    expect(gameplayCoordinator.processTurn).not.toHaveBeenCalled()
    expect(narrativeCoordinator.processTurn).toHaveBeenCalled()
  })

  it('routes an unconsumed narrative combat trigger into gameplay with seed and speaker instruction', async () => {
    mutableElizaConfig.mode = 'official'
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const repository = makeRepository({
      attachTickToGameplayRun: jest.fn(async () => tick({ gameplayRunId: 'run-1' })),
      countCompletedGameplayTurnsForRun: jest.fn(async () => 1),
    })
    const narrativeRepository = makeNarrativeRepository(narrativeState({
      metadata: {
        ttrpgPhase: 'threat',
        combatReadiness: 'ready',
        requestedGameplayAction: 'start_combat',
        lastCombatTriggerBeatId: 'beat-1',
        consumedCombatTriggerBeatId: null,
        lastEncounterSeed: { title: 'Bell Ambush', summary: 'The bell opens.', stakes: 'The room must answer.' },
      },
    }))
    narrativeRepository.listRecentBeatsByRoomId.mockResolvedValueOnce([{ id: 'beat-1', speakerInstruction: 'Strike from the bell fiction.' } as any])
    const gameplayRepository = makeGameplayRepository({
      createOrReuseActiveRun: jest.fn(async () => ({ run: gameplayRun({ id: 'run-1', targetCompletedTurns: 20 }), reused: false })),
      findActiveEncounterByRoomId: jest.fn(async () => null),
      findRunById: jest.fn(async () => gameplayRun({ id: 'run-1', targetCompletedTurns: 20 })),
      findTurnByTickId: jest.fn(async () => null),
    })
    const gameplayCoordinator: jest.Mocked<LocationRoomGameplayCoordinator> = {
      processTurn: jest.fn(async () => ({
        status: 'completed',
        selectedTokenId: 2,
        messageId: 'msg-gameplay-action',
        messageIds: ['msg-gameplay-action'],
      })),
      markTickFailed: jest.fn(async () => undefined),
    }
    const narrativeCoordinator: jest.Mocked<LocationRoomNarrativeCoordinator> = {
      processTurn: jest.fn(),
      markTickFailed: jest.fn(async () => undefined),
    }
    const service = new LocationRoomService(
      repository,
      makeMembership(),
      { generateTurn: jest.fn() },
      narrativeCoordinator,
      undefined,
      gameplayCoordinator,
      gameplayRepository,
      narrativeRepository
    )

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ processed: 1, completed: 1, gameplayRuns: { updated: 1 } })
    expect(gameplayRepository.createOrReuseActiveRun).toHaveBeenCalledWith(expect.objectContaining({
      targetCompletedTurns: 20,
      metadata: expect.objectContaining({ routeSource: 'combat_trigger', encounterTriggerId: 'beat-1' }),
    }))
    expect(repository.attachTickToGameplayRun).toHaveBeenCalledWith({ tickId: 'tick-1', roomId: 'room-1', gameplayRunId: 'run-1' })
    expect(gameplayCoordinator.processTurn).toHaveBeenCalledWith(expect.objectContaining({
      gameplayRun: { id: 'run-1', targetCompletedTurns: 20 },
      encounterTrigger: expect.objectContaining({
        source: 'narrative',
        triggerId: 'beat-1',
        narrativeBeatId: 'beat-1',
        encounterSeed: expect.objectContaining({ title: 'Bell Ambush' }),
        speakerInstruction: 'Strike from the bell fiction.',
      }),
    }))
    expect(narrativeCoordinator.processTurn).not.toHaveBeenCalled()
  })

  it('routes story intent through narrative without consuming an unconsumed combat trigger', async () => {
    mutableElizaConfig.mode = 'official'
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const storyTick = tick({ turnIntent: 'story' })
    const repository = makeRepository({
      claimDueTicks: jest.fn(async () => [storyTick]),
    })
    const narrativeRepository = makeNarrativeRepository(narrativeState({
      metadata: {
        requestedGameplayAction: 'start_combat',
        lastCombatTriggerBeatId: 'beat-1',
        consumedCombatTriggerBeatId: null,
        lastEncounterSeed: { title: 'Waiting Maw' },
      },
    }))
    const narrativeCoordinator: jest.Mocked<LocationRoomNarrativeCoordinator> = {
      processTurn: jest.fn(async () => ({ selectedTokenId: 1, messageId: 'msg-character' })),
      markTickFailed: jest.fn(async () => undefined),
    }
    const gameplayCoordinator: jest.Mocked<LocationRoomGameplayCoordinator> = {
      processTurn: jest.fn(),
      markTickFailed: jest.fn(async () => undefined),
    }
    const gameplayRepository = makeGameplayRepository({
      findActiveEncounterByRoomId: jest.fn(async () => null),
    })
    const service = new LocationRoomService(
      repository,
      makeMembership(),
      { generateTurn: jest.fn() },
      narrativeCoordinator,
      undefined,
      gameplayCoordinator,
      gameplayRepository,
      narrativeRepository
    )

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ processed: 1, completed: 1 })
    expect(gameplayCoordinator.processTurn).not.toHaveBeenCalled()
    expect(gameplayRepository.createOrReuseActiveRun).not.toHaveBeenCalled()
    expect(narrativeRepository.listRecentBeatsByRoomId).not.toHaveBeenCalled()
    expect(narrativeCoordinator.processTurn).toHaveBeenCalled()
  })

  it('routes story intent through active combat continuation when an encounter is already active', async () => {
    mutableElizaConfig.mode = 'official'
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const storyTick = tick({ turnIntent: 'story' })
    const repository = makeRepository({
      claimDueTicks: jest.fn(async () => [storyTick]),
      attachTickToGameplayRun: jest.fn(async () => tick({ turnIntent: 'story', gameplayRunId: 'run-1' })),
      countCompletedGameplayTurnsForRun: jest.fn(async () => 1),
    })
    const gameplayRepository = makeGameplayRepository({
      createOrReuseActiveRun: jest.fn(async () => ({ run: gameplayRun({ id: 'run-1' }), reused: false })),
      findActiveEncounterByRoomId: jest.fn(async () => gameplayEncounter()),
      findRunById: jest.fn(async () => gameplayRun({ id: 'run-1' })),
      findTurnByTickId: jest.fn(async () => null),
    })
    const gameplayCoordinator: jest.Mocked<LocationRoomGameplayCoordinator> = {
      processTurn: jest.fn(async () => ({
        status: 'completed',
        selectedTokenId: 2,
        messageId: 'msg-gameplay-action',
        messageIds: ['msg-gameplay-action'],
      })),
      markTickFailed: jest.fn(async () => undefined),
    }
    const narrativeCoordinator: jest.Mocked<LocationRoomNarrativeCoordinator> = {
      processTurn: jest.fn(),
      markTickFailed: jest.fn(async () => undefined),
    }
    const service = new LocationRoomService(
      repository,
      makeMembership(),
      { generateTurn: jest.fn() },
      narrativeCoordinator,
      undefined,
      gameplayCoordinator,
      gameplayRepository,
      makeNarrativeRepository()
    )

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ processed: 1, completed: 1 })
    expect(gameplayCoordinator.processTurn).toHaveBeenCalled()
    expect(narrativeCoordinator.processTurn).not.toHaveBeenCalled()
  })

  it('repairs a claimed admin combat tick with deterministic manual trigger metadata', async () => {
    mutableElizaConfig.mode = 'official'
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const combatTick = tick({ id: 'tick-admin-combat', triggerType: 'admin', turnIntent: 'combat' })
    const repository = makeRepository({
      claimDueTicks: jest.fn(async () => [combatTick]),
      attachTickToGameplayRun: jest.fn(async () => tick({ id: 'tick-admin-combat', triggerType: 'admin', turnIntent: 'combat', gameplayRunId: 'run-1' })),
      countCompletedGameplayTurnsForRun: jest.fn(async () => 1),
    })
    const narrativeRepository = makeNarrativeRepository(narrativeState({ metadata: { existing: 'kept' } }))
    const gameplayRepository = makeGameplayRepository({
      createOrReuseActiveRun: jest.fn(async () => ({ run: gameplayRun({ id: 'run-1' }), reused: false })),
      findActiveEncounterByRoomId: jest.fn(async () => null),
      findRunById: jest.fn(async () => gameplayRun({ id: 'run-1' })),
      findTurnByTickId: jest.fn(async () => null),
    })
    const gameplayCoordinator: jest.Mocked<LocationRoomGameplayCoordinator> = {
      processTurn: jest.fn(async () => ({
        status: 'completed',
        selectedTokenId: 2,
        messageId: 'msg-gameplay-action',
        messageIds: ['msg-gameplay-action'],
      })),
      markTickFailed: jest.fn(async () => undefined),
    }
    const service = new LocationRoomService(
      repository,
      makeMembership(),
      { generateTurn: jest.fn() },
      undefined,
      undefined,
      gameplayCoordinator,
      gameplayRepository,
      narrativeRepository
    )

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ processed: 1, completed: 1, gameplayRuns: { updated: 1 } })
    expect(narrativeRepository.updateState).toHaveBeenCalledWith(expect.objectContaining({ id: 'room-1' }), expect.objectContaining({
      metadata: expect.objectContaining({
        existing: 'kept',
        requestedGameplayAction: 'start_combat',
        lastCombatTriggerBeatId: 'manual:tick-admin-combat',
        lastManualIntent: 'combat',
        lastManualIntentActor: 'admin',
        lastManualIntentTickId: 'tick-admin-combat',
      }),
    }))
    expect(gameplayCoordinator.processTurn).toHaveBeenCalledWith(expect.objectContaining({
      encounterTrigger: expect.objectContaining({
        source: 'admin',
        triggerId: 'manual:tick-admin-combat',
        narrativeBeatId: null,
      }),
    }))
  })

  it('does not consume an already-consumed narrative combat trigger twice', async () => {
    mutableElizaConfig.mode = 'official'
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const narrativeRepository = makeNarrativeRepository(narrativeState({
      metadata: {
        requestedGameplayAction: 'start_combat',
        lastCombatTriggerBeatId: 'beat-1',
        consumedCombatTriggerBeatId: 'beat-1',
      },
    }))
    const narrativeCoordinator: jest.Mocked<LocationRoomNarrativeCoordinator> = {
      processTurn: jest.fn(async () => ({ selectedTokenId: 1, messageId: 'msg-character' })),
      markTickFailed: jest.fn(async () => undefined),
    }
    const gameplayCoordinator: jest.Mocked<LocationRoomGameplayCoordinator> = {
      processTurn: jest.fn(),
      markTickFailed: jest.fn(async () => undefined),
    }
    const gameplayRepository = makeGameplayRepository({
      findActiveEncounterByRoomId: jest.fn(async () => null),
    })
    const service = new LocationRoomService(
      makeRepository(),
      makeMembership(),
      { generateTurn: jest.fn() },
      narrativeCoordinator,
      undefined,
      gameplayCoordinator,
      gameplayRepository,
      narrativeRepository
    )

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ processed: 1, completed: 1 })
    expect(gameplayCoordinator.processTurn).not.toHaveBeenCalled()
    expect(gameplayRepository.createOrReuseActiveRun).not.toHaveBeenCalled()
    expect(narrativeCoordinator.processTurn).toHaveBeenCalled()
  })

  it('passes active run context into gameplay turn processing', async () => {
    mutableElizaConfig.mode = 'official'
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const runTick = tick({ id: 'tick-run', gameplayRunId: 'run-1' })
    const repository = makeRepository({
      claimDueTicks: jest.fn(async () => [runTick]),
      countCompletedGameplayTurnsForRun: jest.fn(async () => 1),
    })
    const gameplayRepository = makeGameplayRepository({
      findRunById: jest.fn(async () => gameplayRun({ id: 'run-1', targetCompletedTurns: 100, completedTurns: 0 })),
      findActiveEncounterByRoomId: jest.fn(async () => gameplayEncounter()),
      findTurnByTickId: jest.fn(async () => null),
    })
    const gameplayCoordinator: jest.Mocked<LocationRoomGameplayCoordinator> = {
      processTurn: jest.fn(async () => ({
        status: 'completed',
        selectedTokenId: 2,
        messageId: 'msg-gameplay-action',
        messageIds: ['msg-gameplay-action'],
      })),
      markTickFailed: jest.fn(async () => undefined),
    }
    const service = new LocationRoomService(
      repository,
      makeMembership([participant(1, 'Ash'), participant(2, 'Bone')]),
      { generateTurn: jest.fn() },
      undefined,
      undefined,
      gameplayCoordinator,
      gameplayRepository
    )

    await service.runScheduledWorker(new Date(now))

    expect(gameplayCoordinator.processTurn).toHaveBeenCalledWith(expect.objectContaining({
      gameplayRun: { id: 'run-1', targetCompletedTurns: 100 },
    }))
    expect(gameplayRepository.updateRunProgress).toHaveBeenCalledWith('run-1', expect.objectContaining({
      completedTurns: 1,
      lastTickId: 'tick-run',
    }))
  })

  it('keeps an active encounter run alive after the automation target is reached', async () => {
    mutableElizaConfig.mode = 'official'
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const run = gameplayRun({ id: 'run-1', targetCompletedTurns: 1, completedTurns: 0 })
    const continuationTick = tick({ id: 'tick-run-1', gameplayRunId: 'run-1', status: 'processing' })
    const repository = makeRepository({
      listDueRooms: jest.fn(async () => []),
      enqueueTick: jest.fn(async (_input) => ({ tick: tick({ id: 'tick-run-1', gameplayRunId: 'run-1', status: 'pending' }), deduped: false })),
      claimDueTicks: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([continuationTick])
        .mockResolvedValueOnce([]),
      countCompletedGameplayTurnsForRun: jest.fn()
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1),
    })
    const membership = makeMembership()
    membership.listEligibleLocationIds.mockResolvedValueOnce([])
    const gameplayRepository = makeGameplayRepository({
      listActiveRunsForWorker: jest.fn()
        .mockResolvedValueOnce([run])
        .mockResolvedValueOnce([]),
      findRunById: jest.fn(async () => run),
      findStateByRoomId: jest.fn(async () => gameplayState()),
      findActiveEncounterByRoomId: jest.fn(async () => gameplayEncounter()),
      findEncounterById: jest.fn(async () => gameplayEncounter()),
      updateRunProgress: jest.fn(async (_runId, input) => gameplayRun({ ...run, completedTurns: input.completedTurns, lastTickId: input.lastTickId ?? null, lastAdvancedAt: input.lastAdvancedAt ?? null })),
      findTurnByTickId: jest.fn(async () => ({ encounterId: 'encounter-1' } as any)),
    })
    const gameplayCoordinator: jest.Mocked<LocationRoomGameplayCoordinator> = {
      processTurn: jest.fn(async () => ({
        status: 'completed',
        selectedTokenId: 1,
        messageId: 'msg-gameplay-action',
        messageIds: ['msg-gameplay-action'],
      })),
      markTickFailed: jest.fn(async () => undefined),
    }
    const service = new LocationRoomService(
      repository,
      membership,
      { generateTurn: jest.fn() },
      undefined,
      undefined,
      gameplayCoordinator,
      gameplayRepository
    )

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({
      enqueued: 1,
      processed: 1,
      completed: 1,
      gameplayRuns: { inspected: 1, enqueued: 1, updated: 1 },
    })
    expect(repository.enqueueTick).toHaveBeenCalledWith(expect.objectContaining({
      triggerType: 'scheduled',
      gameplayRunId: 'run-1',
      turnIntent: 'combat',
    }))
    expect(gameplayRepository.updateRunProgress).toHaveBeenCalledWith('run-1', expect.objectContaining({
      completedTurns: 1,
      lastTickId: 'tick-run-1',
    }))
    expect(gameplayRepository.markRunCompleted).not.toHaveBeenCalled()
  })

  it('uses active narrative cadence after terminal combat resolves', async () => {
    mutableElizaConfig.mode = 'official'
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const runTick = tick({ id: 'tick-run', gameplayRunId: 'run-1' })
    const repository = makeRepository({
      claimDueTicks: jest.fn(async () => [runTick]),
      countCompletedGameplayTurnsForRun: jest.fn(async () => 35),
    })
    const activeRun = gameplayRun({ id: 'run-1', targetCompletedTurns: 10000, completedTurns: 34 })
    const gameplayRepository = makeGameplayRepository({
      findRunById: jest.fn(async () => activeRun),
      findActiveEncounterByRoomId: jest.fn(async () => gameplayEncounter()),
      updateRunProgress: jest.fn(async (_runId, input) => gameplayRun({ ...activeRun, completedTurns: input.completedTurns })),
      findTurnByTickId: jest.fn(async () => ({ encounterId: 'encounter-1' } as any)),
      findEncounterById: jest.fn(async () => gameplayEncounter({ status: 'victory' })),
    })
    const gameplayCoordinator: jest.Mocked<LocationRoomGameplayCoordinator> = {
      processTurn: jest.fn(async () => ({
        status: 'completed',
        selectedTokenId: 1,
        messageId: 'msg-gameplay-action',
        messageIds: ['msg-gameplay-action', 'msg-roll-card', 'msg-gm-outcome'],
        encounterStatusAfter: 'victory',
      })),
      markTickFailed: jest.fn(async () => undefined),
    }
    const service = new LocationRoomService(
      repository,
      makeMembership(),
      { generateTurn: jest.fn() },
      undefined,
      undefined,
      gameplayCoordinator,
      gameplayRepository
    )

    await service.runScheduledWorker(new Date(now))

    expect(repository.updateRoomAfterProcessedTick).toHaveBeenCalledWith(expect.objectContaining({ id: 'room-1' }), {
      tickIntervalMinutes: elizaConfig.locationRooms.activeNarrativeTickIntervalMinutes,
      now: new Date(now),
    })
    expect(gameplayRepository.markRunCompleted).toHaveBeenCalledWith('run-1', expect.objectContaining({
      stopReason: 'encounter_victory',
    }))
  })

  it('updates run progress from durable counts without double-counting an idempotent completed turn', async () => {
    mutableElizaConfig.mode = 'official'
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const runTick = tick({ id: 'tick-run', gameplayRunId: 'run-1' })
    const repository = makeRepository({
      claimDueTicks: jest.fn(async () => [runTick]),
      countCompletedGameplayTurnsForRun: jest.fn(async () => 1),
    })
    const activeRun = gameplayRun({ id: 'run-1', targetCompletedTurns: 100, completedTurns: 1 })
    const gameplayRepository = makeGameplayRepository({
      findRunById: jest.fn(async () => activeRun),
      findActiveEncounterByRoomId: jest.fn(async () => gameplayEncounter()),
      updateRunProgress: jest.fn(async (_runId, input) => gameplayRun({ ...activeRun, completedTurns: input.completedTurns })),
      findTurnByTickId: jest.fn(async () => ({
        id: 'turn-1',
        roomId: 'room-1',
        locationId: 'loc-1',
        tickId: 'tick-run',
        encounterId: null,
        status: 'completed',
        selectedTokenId: 1,
        action: {},
        diceResults: [],
        mechanicalDeltas: {},
        publicMessageIds: [],
        outcomeSummary: null,
        metadata: {},
        lastError: null,
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      })),
    })
    const gameplayCoordinator: jest.Mocked<LocationRoomGameplayCoordinator> = {
      processTurn: jest.fn(async () => ({
        status: 'completed',
        selectedTokenId: 1,
        messageId: 'msg-gameplay-action',
        messageIds: ['msg-gameplay-action'],
      })),
      markTickFailed: jest.fn(async () => undefined),
    }
    const service = new LocationRoomService(
      repository,
      makeMembership(),
      { generateTurn: jest.fn() },
      undefined,
      undefined,
      gameplayCoordinator,
      gameplayRepository
    )

    const result = await service.runScheduledWorker(new Date(now))

    expect(result.results[0].gameplayRun).toMatchObject({ id: 'run-1', completedTurns: 1, remainingTurns: 99 })
    expect(repository.countCompletedGameplayTurnsForRun).toHaveBeenCalledWith('run-1')
    expect(gameplayRepository.updateRunProgress).toHaveBeenCalledWith('run-1', expect.objectContaining({
      completedTurns: 1,
      lastTickId: 'tick-run',
    }))
    expect(gameplayRepository.markRunCompleted).not.toHaveBeenCalled()
  })

  it('drains multiple active-run ticks only within the configured worker budget', async () => {
    mutableElizaConfig.mode = 'official'
    mutableLocationRoomsConfig.maxTicksPerRun = 2
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const run = gameplayRun({ id: 'run-1', targetCompletedTurns: 10, completedTurns: 0 })
    const repository = makeRepository({
      listDueRooms: jest.fn(async () => []),
      enqueueTick: jest.fn(async () => ({ tick: tick({ status: 'pending', gameplayRunId: 'run-1' }), deduped: false })),
      claimDueTicks: jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([tick({ id: 'tick-run-1', gameplayRunId: 'run-1' })])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([tick({ id: 'tick-run-2', gameplayRunId: 'run-1' })]),
      countCompletedGameplayTurnsForRun: jest.fn()
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2),
    })
    const membership = makeMembership()
    membership.listEligibleLocationIds.mockResolvedValueOnce([])
    const gameplayRepository = makeGameplayRepository({
      listActiveRunsForWorker: jest.fn(async () => [run]),
      findRunById: jest.fn(async () => run),
      findStateByRoomId: jest.fn(async () => gameplayState()),
      findActiveEncounterByRoomId: jest.fn(async () => gameplayEncounter()),
      findEncounterById: jest.fn(async () => gameplayEncounter()),
      updateRunProgress: jest.fn(async (_runId, input) => gameplayRun({ ...run, completedTurns: input.completedTurns, lastTickId: input.lastTickId ?? null, lastAdvancedAt: input.lastAdvancedAt ?? null })),
      findTurnByTickId: jest.fn(async () => null),
    })
    const gameplayCoordinator: jest.Mocked<LocationRoomGameplayCoordinator> = {
      processTurn: jest.fn(async () => ({
        status: 'completed',
        selectedTokenId: 1,
        messageId: 'msg-gameplay-action',
        messageIds: ['msg-gameplay-action'],
      })),
      markTickFailed: jest.fn(async () => undefined),
    }
    const service = new LocationRoomService(
      repository,
      membership,
      { generateTurn: jest.fn() },
      undefined,
      undefined,
      gameplayCoordinator,
      gameplayRepository
    )

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ enqueued: 2, processed: 2, completed: 2 })
    expect(gameplayCoordinator.processTurn).toHaveBeenCalledTimes(2)
    expect(repository.enqueueTick).toHaveBeenCalledTimes(2)
    expect(repository.enqueueTick).toHaveBeenCalledWith(expect.objectContaining({
      gameplayRunId: 'run-1',
      turnIntent: 'combat',
      nextAttemptAt: new Date(now),
    }))
    expect(repository.claimDueTicks).toHaveBeenLastCalledWith(1, expect.stringMatching(/^location-room-worker-/), new Date(now), [])
  })

  it('stops a run when a gameplay encounter ends before the 100-turn target', async () => {
    mutableElizaConfig.mode = 'official'
    mutableLocationRoomsConfig.maxTicksPerRun = 1
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const runTick = tick({ id: 'tick-run', gameplayRunId: 'run-1', attempts: 1 })
    const activeRun = gameplayRun({ id: 'run-1', targetCompletedTurns: 100, completedTurns: 0 })
    const repository = makeRepository({
      claimDueTicks: jest.fn(async () => [runTick]),
      countCompletedGameplayTurnsForRun: jest.fn(async () => 1),
    })
    const gameplayRepository = makeGameplayRepository({
      findRunById: jest.fn(async () => activeRun),
      findActiveEncounterByRoomId: jest.fn(async () => gameplayEncounter()),
      updateRunProgress: jest.fn(async (_runId, input) => gameplayRun({ ...activeRun, completedTurns: input.completedTurns, lastTickId: input.lastTickId ?? null, lastAdvancedAt: input.lastAdvancedAt ?? null })),
      findTurnByTickId: jest.fn(async () => ({ encounterId: 'encounter-1' } as any)),
      findEncounterById: jest.fn(async () => ({ status: 'abandoned' } as any)),
    })
    const gameplayCoordinator: jest.Mocked<LocationRoomGameplayCoordinator> = {
      processTurn: jest.fn(async () => ({
        status: 'completed',
        selectedTokenId: 1,
        messageId: 'msg-gameplay-action',
        messageIds: ['msg-gameplay-action'],
      })),
      markTickFailed: jest.fn(async () => undefined),
    }
    const service = new LocationRoomService(
      repository,
      makeMembership(),
      { generateTurn: jest.fn() },
      undefined,
      undefined,
      gameplayCoordinator,
      gameplayRepository
    )

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ processed: 1, gameplayRuns: { updated: 0, stopped: 1 } })
    expect(result.results[0].gameplayRun).toMatchObject({ id: 'run-1', status: 'stopped', stopReason: 'encounter_abandoned' })
    expect(gameplayRepository.markRunStopped).toHaveBeenCalledWith('run-1', expect.objectContaining({
      stopReason: 'encounter_abandoned',
      completedTurns: 1,
      lastTickId: 'tick-run',
    }))
  })

  it('keeps a run active when its tick fails with retry remaining', async () => {
    mutableElizaConfig.mode = 'official'
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const runTick = tick({ id: 'tick-run-failed', gameplayRunId: 'run-1', attempts: 1 })
    const repository = makeRepository({
      claimDueTicks: jest.fn(async () => [runTick]),
    })
    const gameplayRepository = makeGameplayRepository({
      findRunById: jest.fn(async () => gameplayRun({ id: 'run-1', completedTurns: 0 })),
      findActiveEncounterByRoomId: jest.fn(async () => gameplayEncounter()),
    })
    const gameplayCoordinator: jest.Mocked<LocationRoomGameplayCoordinator> = {
      processTurn: jest.fn(async () => {
        throw new Error('temporary gameplay outage')
      }),
      markTickFailed: jest.fn(async () => undefined),
    }
    const service = new LocationRoomService(
      repository,
      makeMembership(),
      { generateTurn: jest.fn() },
      undefined,
      undefined,
      gameplayCoordinator,
      gameplayRepository
    )

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ processed: 1, failed: 1, dead: 0 })
    expect(result.results[0].gameplayRun).toMatchObject({ id: 'run-1', status: 'active', completedTurns: 0 })
    expect(repository.markTickFailed).toHaveBeenCalledWith('tick-run-failed', 'temporary gameplay outage', expect.any(String))
    expect(gameplayRepository.markRunFailed).not.toHaveBeenCalled()
    expect(gameplayRepository.markRunStopped).not.toHaveBeenCalled()
    expect(repository.enqueueTick).toHaveBeenCalledTimes(1)
  })

  it('fails a run when its tick exhausts retries and dies', async () => {
    mutableElizaConfig.mode = 'official'
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const runTick = tick({ id: 'tick-run-dead', gameplayRunId: 'run-1', attempts: 3 })
    const repository = makeRepository({
      claimDueTicks: jest.fn(async () => [runTick]),
      countCompletedGameplayTurnsForRun: jest.fn(async () => 4),
    })
    const gameplayRepository = makeGameplayRepository({
      findRunById: jest.fn(async () => gameplayRun({ id: 'run-1', completedTurns: 4 })),
      findActiveEncounterByRoomId: jest.fn(async () => gameplayEncounter()),
    })
    const gameplayCoordinator: jest.Mocked<LocationRoomGameplayCoordinator> = {
      processTurn: jest.fn(async () => {
        throw new Error('permanent gameplay outage')
      }),
      markTickFailed: jest.fn(async () => undefined),
    }
    const service = new LocationRoomService(
      repository,
      makeMembership(),
      { generateTurn: jest.fn() },
      undefined,
      undefined,
      gameplayCoordinator,
      gameplayRepository
    )

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ processed: 1, failed: 0, dead: 1 })
    expect(repository.markTickDead).toHaveBeenCalledWith('tick-run-dead', 'permanent gameplay outage')
    expect(gameplayCoordinator.markTickFailed).toHaveBeenCalledWith('tick-run-dead', expect.any(Error), { dead: true })
    expect(gameplayRepository.markRunFailed).toHaveBeenCalledWith('run-1', expect.objectContaining({
      stopReason: 'tick_dead',
      completedTurns: 4,
      lastTickId: 'tick-run-dead',
    }))
    expect(result.results[0].gameplayRun).toMatchObject({ id: 'run-1', status: 'failed', stopReason: 'tick_dead' })
  })

  it('stops an active run when continuation eligibility drops below two participants', async () => {
    mutableElizaConfig.mode = 'official'
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const run = gameplayRun({ id: 'run-1', targetCompletedTurns: 100, completedTurns: 5 })
    const repository = makeRepository({
      listDueRooms: jest.fn(async () => []),
      claimDueTicks: jest.fn(async () => []),
      countCompletedGameplayTurnsForRun: jest.fn(async () => 5),
    })
    const membership = makeMembership([participant(1, 'Ash')])
    membership.listEligibleLocationIds.mockResolvedValueOnce([])
    const gameplayRepository = makeGameplayRepository({
      listActiveRunsForWorker: jest.fn(async () => [run]),
    })
    const service = new LocationRoomService(
      repository,
      membership,
      { generateTurn: jest.fn() },
      undefined,
      undefined,
      undefined,
      gameplayRepository
    )

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ processed: 0, gameplayRuns: { inspected: 1, stopped: 1 } })
    expect(gameplayRepository.markRunStopped).toHaveBeenCalledWith('run-1', expect.objectContaining({
      stopReason: 'insufficient_participants',
      completedTurns: 5,
    }))
    expect(repository.enqueueTick).not.toHaveBeenCalled()
  })

  it('marks gameplay turns failed instead of narrative beats when gameplay generation fails', async () => {
    mutableElizaConfig.mode = 'official'
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    mutableGameplayConfig.enabled = true
    mutableGameplayConfig.locationAllowlist = ['loc-1']
    const repository = makeRepository()
    const narrativeCoordinator: jest.Mocked<LocationRoomNarrativeCoordinator> = {
      processTurn: jest.fn(),
      markTickFailed: jest.fn(async () => undefined),
    }
    const gameplayCoordinator: jest.Mocked<LocationRoomGameplayCoordinator> = {
      processTurn: jest.fn(async () => {
        throw new Error('bad gameplay action')
      }),
      markTickFailed: jest.fn(async () => undefined),
    }
    const service = new LocationRoomService(
      repository,
      makeMembership(),
      { generateTurn: jest.fn() },
      narrativeCoordinator,
      undefined,
      gameplayCoordinator,
      makeGameplayRepository({ findActiveEncounterByRoomId: jest.fn(async () => gameplayEncounter()) })
    )

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ processed: 1, failed: 1, dead: 0 })
    expect(gameplayCoordinator.markTickFailed).toHaveBeenCalledWith('tick-1', expect.any(Error))
    expect(narrativeCoordinator.markTickFailed).not.toHaveBeenCalled()
    expect(repository.markTickFailed).toHaveBeenCalledWith('tick-1', 'bad gameplay action', expect.any(String))
  })

  it('marks an existing narrative beat failed when retry speaker selection fails before generation', async () => {
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    const repository = makeRepository({
      claimDueTicks: jest.fn(async () => [tick({ selectedTokenId: 99, attempts: 2 })]),
    })
    const narrativeCoordinator: jest.Mocked<LocationRoomNarrativeCoordinator> = {
      processTurn: jest.fn(),
      markTickFailed: jest.fn(async () => undefined),
    }
    const service = new LocationRoomService(
      repository,
      makeMembership([participant(1, 'Ash'), participant(2, 'Bone')]),
      { generateTurn: jest.fn() },
      narrativeCoordinator
    )

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ processed: 1, failed: 1, dead: 0 })
    expect(narrativeCoordinator.processTurn).not.toHaveBeenCalled()
    expect(narrativeCoordinator.markTickFailed).toHaveBeenCalledWith('tick-1', expect.any(Error))
    expect(repository.markTickFailed).toHaveBeenCalledWith(
      'tick-1',
      'Selected narrative speaker is no longer eligible for this location room',
      expect.any(String)
    )
  })

  it('preserves the selected narrative speaker across retries', async () => {
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    const repository = makeRepository({
      claimDueTicks: jest.fn(async () => [tick({ selectedTokenId: 2, attempts: 2 })]),
    })
    const narrativeCoordinator: jest.Mocked<LocationRoomNarrativeCoordinator> = {
      processTurn: jest.fn(async () => ({ selectedTokenId: 2, messageId: 'msg-character' })),
      markTickFailed: jest.fn(async () => undefined),
    }
    const service = new LocationRoomService(
      repository,
      makeMembership([participant(1, 'Ash'), participant(2, 'Bone')]),
      { generateTurn: jest.fn() },
      narrativeCoordinator
    )

    await service.runScheduledWorker(new Date(now))

    expect(narrativeCoordinator.processTurn).toHaveBeenCalledWith(expect.objectContaining({
      speaker: expect.objectContaining({ tokenId: 2, name: 'Bone' }),
    }))
    expect(repository.markTickSelected).not.toHaveBeenCalled()
  })

  it('marks narrative beats failed when narrative generation fails before a character message is appended', async () => {
    mutableNarrativeConfig.enabled = true
    mutableNarrativeConfig.gameMasterAgentId = 'gm-agent-1'
    const repository = makeRepository()
    const narrativeCoordinator: jest.Mocked<LocationRoomNarrativeCoordinator> = {
      processTurn: jest.fn(async () => {
        throw new Error('bad gm json')
      }),
      markTickFailed: jest.fn(async () => undefined),
    }
    const service = new LocationRoomService(
      repository,
      makeMembership(),
      { generateTurn: jest.fn() },
      narrativeCoordinator
    )

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ processed: 1, failed: 1, dead: 0 })
    expect(narrativeCoordinator.markTickFailed).toHaveBeenCalledWith('tick-1', expect.any(Error), { dead: false })
    expect(repository.markTickFailed).toHaveBeenCalledWith('tick-1', 'bad gm json', expect.any(String))
    expect(repository.appendMessage).not.toHaveBeenCalled()
  })

  it('runs a scheduled tick, generates one turn, appends a public message, and advances room state', async () => {
    const repository = makeRepository()
    const membership = makeMembership()
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({ officialAgentId: 'agent-1', content: 'The room stirs.' })),
    }
    const service = new LocationRoomService(repository, membership, turnGenerator)

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ enqueued: 1, processed: 1, completed: 1, skipped: 0, failed: 0, dead: 0 })
    expect(repository.ensureRoomForLocation).toHaveBeenCalledWith('loc-1')
    expect(repository.enqueueTick).toHaveBeenCalledWith(expect.objectContaining({ triggerType: 'scheduled' }))
    expect(turnGenerator.generateTurn).toHaveBeenCalledWith(expect.objectContaining({ speaker: expect.objectContaining({ tokenId: 1 }) }))
    expect(repository.appendMessage).toHaveBeenCalledWith(expect.objectContaining({
      authorKind: 'agent',
      tokenId: 1,
      officialAgentId: 'agent-1',
      content: 'The room stirs.',
      visibility: 'public',
    }))
    expect(repository.markTickCompleted).toHaveBeenCalledWith('tick-1')
    expect(repository.updateRoomAfterProcessedTick).toHaveBeenCalled()
  })

  it('skips a claimed tick without generating when fewer than two eligible participants remain', async () => {
    const repository = makeRepository()
    const membership = makeMembership([participant(1)])
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(),
    }
    const service = new LocationRoomService(repository, membership, turnGenerator)

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ processed: 1, completed: 0, skipped: 1 })
    expect(turnGenerator.generateTurn).not.toHaveBeenCalled()
    expect(repository.markTickSkipped).toHaveBeenCalledWith('tick-1', 'Fewer than two eligible participants')
  })

  it('marks a claimed tick failed when membership loading throws before generation', async () => {
    const repository = makeRepository()
    const membership = makeMembership()
    membership.listEligibleParticipantsByLocation.mockRejectedValueOnce(new Error('membership unavailable'))
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(),
    }
    const service = new LocationRoomService(repository, membership, turnGenerator)

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ processed: 1, failed: 1, dead: 0 })
    expect(repository.markTickFailed).toHaveBeenCalledWith('tick-1', 'membership unavailable', expect.any(String))
    expect(turnGenerator.generateTurn).not.toHaveBeenCalled()
  })

  it('does not mark a tick failed after a public message has been appended', async () => {
    const repository = makeRepository({
      markTickCompleted: jest.fn(async () => {
        throw new Error('completion failed')
      }),
    })
    const membership = makeMembership()
    const turnGenerator: jest.Mocked<OfficialLocationRoomTurnGenerator> = {
      generateTurn: jest.fn(async () => ({ officialAgentId: 'agent-1', content: 'The room stirs.' })),
    }
    const service = new LocationRoomService(repository, membership, turnGenerator)

    const result = await service.runScheduledWorker(new Date(now))

    expect(result).toMatchObject({ processed: 1, completed: 1, failed: 0, dead: 0 })
    expect(repository.appendMessage).toHaveBeenCalledTimes(1)
    expect(repository.markTickFailed).not.toHaveBeenCalled()
  })
})
