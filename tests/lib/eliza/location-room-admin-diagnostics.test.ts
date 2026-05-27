/**
 * @jest-environment node
 */

jest.mock('@/lib/eliza/gameMasterAgent/service', () => ({
  gameMasterAgentService: {
    resolveActiveGameMasterAgent: jest.fn(),
  },
}))

import { LocationRoomAdminDiagnosticsService } from '@/lib/eliza/locationRooms/adminDiagnostics'
import { elizaConfig } from '@/lib/eliza/config'
import type { GameMasterAgentResolution } from '@/lib/eliza/gameMasterAgent/service'
import type { LocationRoomRepository } from '@/lib/eliza/locationRooms/repository'
import type { LocationRoomMembershipRepository } from '@/lib/eliza/locationRooms/membership'
import type { LocationRoomNarrativeRepository } from '@/lib/eliza/locationRooms/narrativeRepository'
import type { LocationRoomGameplayRepository } from '@/lib/eliza/locationRooms/gameplay/repository'
import type {
  LocationRoom,
  LocationRoomLocationDetails,
  LocationRoomParticipant,
  LocationRoomTick,
} from '@/lib/eliza/locationRooms/types'
import type {
  LocationRoomNarrativeBeat,
  LocationRoomNarrativeState,
} from '@/lib/eliza/locationRooms/narrativeTypes'
import type { GameplayRun } from '@/lib/eliza/locationRooms/gameplay/types'

const now = new Date('2026-05-23T12:00:00.000Z')

function location(overrides: Partial<LocationRoomLocationDetails> = {}): LocationRoomLocationDetails {
  return {
    id: '11',
    name: "The Crow's Den",
    chainLocationId: '11',
    active: true,
    metadata: {},
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  }
}

function room(overrides: Partial<LocationRoom> = {}): LocationRoom {
  return {
    id: 'room-11',
    locationId: '11',
    officialRoomId: 'official-room-11',
    officialWorldId: 'official-world-11',
    officialUserId: 'official-user-11',
    channelId: 'wagdie-location-11',
    tickEnabled: true,
    lastTickAt: '2026-05-23T11:00:00.000Z',
    nextTickAt: '2026-05-23T13:00:00.000Z',
    tickCount: 3,
    lastError: null,
    createdAt: '2026-05-11T00:00:00.000Z',
    updatedAt: '2026-05-23T11:00:00.000Z',
    ...overrides,
  }
}

function tick(overrides: Partial<LocationRoomTick> = {}): LocationRoomTick {
  return {
    id: 'tick-1',
    roomId: 'room-11',
    locationId: '11',
    gameplayRunId: null,
    turnIntent: 'auto',
    triggerType: 'scheduled',
    requestedByWallet: null,
    requestedByTokenId: null,
    status: 'completed',
    attempts: 1,
    nextAttemptAt: '2026-05-23T11:00:00.000Z',
    lockedAt: null,
    lockedBy: null,
    selectedTokenId: 7,
    startedAt: '2026-05-23T11:00:00.000Z',
    completedAt: '2026-05-23T11:01:00.000Z',
    lastError: null,
    createdAt: '2026-05-23T11:00:00.000Z',
    updatedAt: '2026-05-23T11:01:00.000Z',
    ...overrides,
  }
}

function narrativeState(overrides: Partial<LocationRoomNarrativeState> = {}): LocationRoomNarrativeState {
  return {
    id: 'narrative-state-1',
    roomId: 'room-11',
    locationId: '11',
    stateSummary: 'The bell waits above the bone toll.',
    currentObjective: 'Answer the toll.',
    openThreads: ['The bellkeeper watches.'],
    metadata: {
      ttrpgPhase: 'exploration',
      combatReadiness: 'foreshadow',
      threatLevel: 2,
      requestedGameplayAction: null,
      lastEncounterSeed: null,
      lastCombatTriggerBeatId: null,
      consumedCombatTriggerBeatId: null,
    },
    createdAt: '2026-05-23T11:00:00.000Z',
    updatedAt: '2026-05-23T11:01:00.000Z',
    ...overrides,
  }
}

function narrativeBeat(overrides: Partial<LocationRoomNarrativeBeat> = {}): LocationRoomNarrativeBeat {
  return {
    id: 'beat-1',
    roomId: 'room-11',
    locationId: '11',
    tickId: 'tick-1',
    status: 'completed',
    selectedTokenId: 7,
    gameMasterAgentId: 'gm-agent-1',
    publicNarration: 'The bell answers.',
    speakerInstruction: 'Answer carefully.',
    stateBefore: {},
    stateAfter: {
      stateSummary: 'The bell waits above the bone toll.',
      currentObjective: 'Answer the toll.',
      openThreads: ['The bellkeeper watches.'],
    },
    metadata: {},
    lastError: null,
    createdAt: '2026-05-23T11:00:00.000Z',
    updatedAt: '2026-05-23T11:01:00.000Z',
    completedAt: '2026-05-23T11:01:00.000Z',
    ...overrides,
  }
}

function run(overrides: Partial<GameplayRun> = {}): GameplayRun {
  return {
    id: 'run-1',
    roomId: 'room-11',
    locationId: '11',
    status: 'active',
    targetCompletedTurns: 100,
    completedTurns: 12,
    startedByActor: 'admin',
    startedByWallet: '0xsecretadminwallet',
    startedByTokenId: 7,
    lastTickId: 'tick-12',
    lastAdvancedAt: '2026-05-23T11:55:00.000Z',
    completedAt: null,
    stopReason: null,
    lastError: null,
    metadata: { private: 'hidden' },
    createdAt: '2026-05-23T11:00:00.000Z',
    updatedAt: '2026-05-23T11:55:00.000Z',
    ...overrides,
  }
}

function participant(tokenId: number): LocationRoomParticipant {
  return {
    tokenId,
    name: `Character #${tokenId}`,
    imageUrl: null,
    backgroundStory: null,
    ownerAddress: `0x${tokenId}`,
    stakerAddress: null,
    locationId: '11',
  }
}

function gmResolution(overrides: Partial<GameMasterAgentResolution> = {}): GameMasterAgentResolution {
  return {
    source: 'database',
    officialAgentId: 'gm-agent-1',
    setting: null,
    envFallbackAgentId: null,
    ...overrides,
  }
}

function makeRoomRepository(overrides: Partial<jest.Mocked<LocationRoomRepository>> = {}): jest.Mocked<LocationRoomRepository> {
  const baseRoom = room()

  return {
    getLocation: jest.fn(async () => ({ id: '11', name: "The Crow's Den" })),
    getLocationDetails: jest.fn(async (locationId: string) => location({ id: locationId })),
    listLocationsByIds: jest.fn(async (ids: string[]) => ids.map((id) => location({
      id,
      name: id === 'crows_den' ? "Crow's Den" : "The Crow's Den",
      chainLocationId: id === '11' ? '11' : null,
    }))),
    findRoomById: jest.fn(async () => baseRoom),
    findRoomByLocationId: jest.fn(async () => baseRoom),
    ensureRoomForLocation: jest.fn(async () => baseRoom),
    listDueRooms: jest.fn(async () => [baseRoom]),
    enqueueTick: jest.fn(),
    promoteOpenTickIntent: jest.fn(),
    attachTickToGameplayRun: jest.fn(),
    countCompletedGameplayTurnsForRun: jest.fn(),
    findOpenTickForRoom: jest.fn(),
    findRecentCompletedOwnerTick: jest.fn(),
    findOldestProcessableTickForRoom: jest.fn(),
    findNonStaleProcessingTickForRoom: jest.fn(),
    claimTick: jest.fn(),
    claimDueTicks: jest.fn(),
    listActiveTicksForRoom: jest.fn(async () => []),
    listRecentTicksForRoom: jest.fn(async () => [tick()]),
    getPublicMessageStats: jest.fn(async () => ({
      messageCount: 1,
      latestSequence: 4,
      latestCreatedAt: '2026-05-23T11:01:00.000Z',
    })),
    getPublicAuthorMessageStats: jest.fn(async () => ({
      messageCount: 1,
      gameMasterMessageCount: 1,
      agentMessageCount: 0,
      latestGameMasterMessageCreatedAt: '2026-05-23T11:01:00.000Z',
      latestAgentMessageCreatedAt: null,
    })),
    markTickSelected: jest.fn(),
    appendMessage: jest.fn(),
    markTickCompleted: jest.fn(),
    markTickSkipped: jest.fn(),
    markTickFailed: jest.fn(),
    markTickDead: jest.fn(),
    updateRoomAfterProcessedTick: jest.fn(),
    recordRoomError: jest.fn(),
    listPublicMessages: jest.fn(),
    listRecentPublicMessages: jest.fn(),
    ...overrides,
  } as jest.Mocked<LocationRoomRepository>
}

function makeMembershipRepository(participants = [participant(7), participant(8)]): jest.Mocked<LocationRoomMembershipRepository> {
  return {
    listEligibleParticipantsByLocation: jest.fn(async () => participants),
    listEligibleLocationIds: jest.fn(async () => ['11']),
    walletHasEligibleParticipant: jest.fn(async () => true),
  }
}

function makeNarrativeRepository(
  overrides: Partial<jest.Mocked<LocationRoomNarrativeRepository>> = {}
): jest.Mocked<LocationRoomNarrativeRepository> {
  return {
    findStateByRoomId: jest.fn(async () => null),
    ensureStateForRoom: jest.fn(),
    updateState: jest.fn(),
    findBeatByTickId: jest.fn(),
    listRecentBeatsByRoomId: jest.fn(async () => []),
    createOrReuseBeat: jest.fn(),
    storeBeatGameMasterOutput: jest.fn(),
    markBeatGameMasterMessageAppended: jest.fn(),
    markBeatCharacterAppended: jest.fn(),
    markBeatCompleted: jest.fn(),
    markBeatFailed: jest.fn(),
    markBeatDead: jest.fn(),
    ...overrides,
  } as jest.Mocked<LocationRoomNarrativeRepository>
}

function makeGameplayRepository(): jest.Mocked<LocationRoomGameplayRepository> {
  return {
    findActiveRunByRoomId: jest.fn(async () => null),
    findRunById: jest.fn(async () => null),
    listRecentRunsByRoomId: jest.fn(async () => []),
    listActiveRunsForWorker: jest.fn(async () => []),
    createOrReuseActiveRun: jest.fn(),
    updateRunProgress: jest.fn(),
    markRunCompleted: jest.fn(),
    markRunStopped: jest.fn(),
    markRunFailed: jest.fn(),
    findStateByRoomId: jest.fn(async () => null),
    ensureStateForRoom: jest.fn(),
    updateState: jest.fn(),
    updateCharacterState: jest.fn(),
    findActiveEncounterByRoomId: jest.fn(async () => null),
    findEncounterById: jest.fn(),
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
    findDeathReviewById: jest.fn(),
    updateDeathReview: jest.fn(),
    createOrReuseRewardClaim: jest.fn(),
    findRewardClaimByDeathReviewId: jest.fn(),
    listRewardClaims: jest.fn(async () => []),
    updateRewardClaimStatusByDeathReviewId: jest.fn(),
  } as jest.Mocked<LocationRoomGameplayRepository>
}

function makeService(overrides: {
  roomRepository?: jest.Mocked<LocationRoomRepository>
  membershipRepository?: jest.Mocked<LocationRoomMembershipRepository>
  narrativeRepository?: jest.Mocked<LocationRoomNarrativeRepository>
  gameplayRepository?: jest.Mocked<LocationRoomGameplayRepository>
  gameMasterResolver?: { resolveActiveGameMasterAgent: jest.Mock }
} = {}) {
  return new LocationRoomAdminDiagnosticsService({
    roomRepository: overrides.roomRepository ?? makeRoomRepository(),
    membershipRepository: overrides.membershipRepository ?? makeMembershipRepository(),
    narrativeRepository: overrides.narrativeRepository ?? makeNarrativeRepository(),
    gameplayRepository: overrides.gameplayRepository ?? makeGameplayRepository(),
    gameMasterResolver: overrides.gameMasterResolver ?? {
      resolveActiveGameMasterAgent: jest.fn(async () => gmResolution()),
    },
    now: () => now,
  })
}

describe('LocationRoomAdminDiagnosticsService', () => {
  const originalEnabled = elizaConfig.locationRooms.enabled
  const originalOfficialBaseUrl = elizaConfig.official.baseUrl
  const originalNarrativeEnabled = elizaConfig.locationRooms.narrative.enabled
  const originalGameplayEnabled = elizaConfig.locationRooms.gameplay.enabled
  const originalGameplayAllowlist = [...elizaConfig.locationRooms.gameplay.locationAllowlist]
  const mutableLocationRooms = elizaConfig.locationRooms as { enabled: boolean }
  const mutableOfficial = elizaConfig.official as { baseUrl: string }
  const mutableNarrative = elizaConfig.locationRooms.narrative as { enabled: boolean }
  const mutableGameplay = elizaConfig.locationRooms.gameplay as { enabled: boolean; locationAllowlist: string[] }

  beforeEach(() => {
    mutableLocationRooms.enabled = true
    mutableOfficial.baseUrl = 'https://elizaos.example'
    mutableNarrative.enabled = false
    mutableGameplay.enabled = false
    mutableGameplay.locationAllowlist = []
  })

  afterAll(() => {
    mutableLocationRooms.enabled = originalEnabled
    mutableOfficial.baseUrl = originalOfficialBaseUrl
    mutableNarrative.enabled = originalNarrativeEnabled
    mutableGameplay.enabled = originalGameplayEnabled
    mutableGameplay.locationAllowlist = originalGameplayAllowlist
  })

  it('reports no-room diagnostics without creating a room', async () => {
    const roomRepository = makeRoomRepository({ findRoomByLocationId: jest.fn(async () => null) })
    const result = await makeService({ roomRepository }).inspectLocation('11')

    expect(roomRepository.findRoomByLocationId).toHaveBeenCalledWith('11')
    expect(roomRepository.ensureRoomForLocation).not.toHaveBeenCalled()
    expect(result.room.exists).toBe(false)
    expect(result.recommendedNextAction).toBe('trigger_location_room_tick')
  })

  it('recommends running the worker when a pending tick is due', async () => {
    const roomRepository = makeRoomRepository({
      listActiveTicksForRoom: jest.fn(async () => [tick({
        id: 'tick-pending',
        status: 'pending',
        nextAttemptAt: '2026-05-23T11:59:00.000Z',
        completedAt: null,
      })]),
    })

    const result = await makeService({ roomRepository }).inspectLocation('11')

    expect(result.ticks.active).toMatchObject([{ id: 'tick-pending', status: 'pending' }])
    expect(result.recommendedNextAction).toBe('run_location_room_worker')
  })

  it('sanitizes failed tick errors and recommends waiting for non-due retries', async () => {
    const roomRepository = makeRoomRepository({
      listActiveTicksForRoom: jest.fn(async () => [tick({
        id: 'tick-failed',
        status: 'failed',
        nextAttemptAt: '2026-05-23T12:30:00.000Z',
        completedAt: null,
        lastError: 'raw provider stack trace',
      })]),
    })

    const result = await makeService({ roomRepository }).inspectLocation('11')

    expect(result.ticks.active[0]).toMatchObject({
      id: 'tick-failed',
      status: 'failed',
      lastError: 'Location room tick failed. Check server logs for details.',
    })
    expect(JSON.stringify(result)).not.toContain('raw provider stack trace')
    expect(result.retryCadence).toMatchObject({
      failedTickId: 'tick-failed',
      failedTickRetryDue: false,
      failedTickNotDue: true,
    })
    expect(result.recommendedNextAction).toBe('wait_for_retry')
  })

  it('recommends running the worker when the room next tick is due without active ticks', async () => {
    const roomRepository = makeRoomRepository({
      findRoomByLocationId: jest.fn(async () => room({ nextTickAt: '2026-05-23T11:59:00.000Z' })),
      listActiveTicksForRoom: jest.fn(async () => []),
    })

    const result = await makeService({ roomRepository }).inspectLocation('11')

    expect(result.ticks.active).toEqual([])
    expect(result.recommendedNextAction).toBe('run_location_room_worker')
  })

  it('recommends running the worker when the room has never scheduled a next tick', async () => {
    const roomRepository = makeRoomRepository({
      findRoomByLocationId: jest.fn(async () => room({ nextTickAt: null })),
      listActiveTicksForRoom: jest.fn(async () => []),
    })

    const result = await makeService({ roomRepository }).inspectLocation('11')

    expect(result.recommendedNextAction).toBe('run_location_room_worker')
  })

  it('reports a safe GM readiness error when the resolver fails', async () => {
    mutableNarrative.enabled = true
    const result = await makeService({
      gameMasterResolver: {
        resolveActiveGameMasterAgent: jest.fn(async () => {
          throw new Error('raw GM repository failure')
        }),
      },
    }).inspectLocation('11')

    expect(result.gmReadiness).toMatchObject({
      required: true,
      ready: false,
      source: 'missing',
      safeError: 'Game-master agent readiness could not be resolved. Check server logs for details.',
    })
    expect(JSON.stringify(result)).not.toContain('raw GM repository failure')
    expect(result.recommendedNextAction).toBe('configure_game_master')
  })

  it('reports missing GM readiness when narrative mode requires one', async () => {
    mutableNarrative.enabled = true
    const result = await makeService({
      gameMasterResolver: {
        resolveActiveGameMasterAgent: jest.fn(async () => gmResolution({ source: 'missing', officialAgentId: null })),
      },
    }).inspectLocation('11')

    expect(result.gmReadiness).toMatchObject({ required: true, ready: false, source: 'missing' })
    expect(result.recommendedNextAction).toBe('configure_game_master')
  })

  it('points legacy crows_den diagnostics at canonical location 11', async () => {
    const roomRepository = makeRoomRepository({
      getLocationDetails: jest.fn(async (locationId: string) => location({
        id: locationId,
        name: "Crow's Den",
        chainLocationId: null,
        active: false,
        metadata: {
          canonical_location_id: '11',
          legacy_duplicate_of: '11',
          hidden: true,
          deactivated: true,
        },
      })),
    })

    const result = await makeService({ roomRepository }).inspectLocation('crows_den')

    expect(result.location).toMatchObject({ id: 'crows_den', active: false, exists: true })
    expect(result.canonical).toMatchObject({
      requestedLocationId: 'crows_den',
      canonicalLocationId: '11',
      isCanonical: false,
    })
    expect(result.recommendedNextAction).toBe('use_canonical_location_11')
  })

  it('projects durable intent, retry cadence, safe GM repair failure, and trigger readiness', async () => {
    mutableNarrative.enabled = true
    mutableGameplay.enabled = true
    mutableGameplay.locationAllowlist = ['11']
    const roomRepository = makeRoomRepository({
      listActiveTicksForRoom: jest.fn(async () => [tick({
        id: 'tick-story-failed',
        status: 'failed',
        turnIntent: 'story',
        nextAttemptAt: '2026-05-23T12:30:00.000Z',
        completedAt: null,
        lastError: 'raw retry stack',
      })]),
      listRecentTicksForRoom: jest.fn(async () => [
        tick({ id: 'tick-combat', turnIntent: 'combat', triggerType: 'admin' }),
        tick({ id: 'tick-auto', turnIntent: 'auto', triggerType: 'scheduled' }),
      ]),
    })
    const narrativeRepository = makeNarrativeRepository({
      findStateByRoomId: jest.fn(async () => narrativeState({
        metadata: {
          ttrpgPhase: 'threat',
          combatReadiness: 'ready',
          threatLevel: 5,
          requestedGameplayAction: 'start_combat',
          lastEncounterSeed: { title: 'Bell Horror' },
          lastCombatTriggerBeatId: 'beat-1',
          consumedCombatTriggerBeatId: null,
        },
      })),
      listRecentBeatsByRoomId: jest.fn(async () => [narrativeBeat({
        status: 'failed',
        lastError: 'raw malformed JSON response',
        metadata: {
          gmGeneration: {
            status: 'repair_failed',
            repairAttempted: true,
            repaired: false,
            initialErrorCategory: 'invalid_json',
            repairErrorCategory: 'progression_contract',
            initialResponseLength: 144,
            repairResponseLength: 88,
            rawResponseText: 'do not expose',
          },
        },
      })]),
    })

    const result = await makeService({ roomRepository, narrativeRepository }).inspectLocation('11')

    expect(result.durableIntent.activeCounts).toEqual({ auto: 0, story: 1, combat: 0 })
    expect(result.durableIntent.recentCounts).toEqual({ auto: 1, story: 0, combat: 1 })
    expect(result.ticks.active[0]).toMatchObject({ id: 'tick-story-failed', turnIntent: 'story' })
    expect(result.retryCadence).toMatchObject({
      failedTickId: 'tick-story-failed',
      failedTickRetryDue: false,
      failedTickNotDue: true,
    })
    expect(result.gmGeneration).toMatchObject({
      latestBeatStatus: 'failed',
      status: 'repair_failed',
      repairAttempted: true,
      repaired: false,
      initialErrorCategory: 'invalid_json',
      repairErrorCategory: 'progression_contract',
      initialResponseLength: 144,
      repairResponseLength: 88,
      safeError: 'Narrative beat failed. Check server logs for details.',
    })
    expect(result.triggerReadiness).toMatchObject({
      ttrpgPhase: 'threat',
      combatReadiness: 'ready',
      requestedGameplayAction: 'start_combat',
      triggerId: 'beat-1',
      hasUnconsumedTrigger: true,
      encounterSeedPresent: true,
      blockers: [],
    })
    expect(JSON.stringify(result)).not.toContain('raw malformed JSON response')
    expect(JSON.stringify(result)).not.toContain('do not expose')
    expect(result.recommendedNextAction).toBe('inspect_gm_repair_failure')
  })

  it('reports catalog counts, seed metadata, and auto-promotion eligibility', async () => {
    mutableNarrative.enabled = true
    mutableGameplay.enabled = true
    mutableGameplay.locationAllowlist = ['11']
    const roomRepository = makeRoomRepository({
      getLocationDetails: jest.fn(async (locationId: string) => location({
        id: locationId,
        metadata: {
          adventureCatalog: {
            sections: {
              '80_encounters': [
                { id: 'roost-fall', title: 'Roost Fall', summary: 'Crows drop from the rafters.', tags: ['crows'] },
                { id: 'roost-swarm', title: 'Roost Swarm', summary: 'A second visible swarm spills from the rafters.' },
                { id: 'hidden-roost', title: 'Hidden Roost', summary: 'A hidden roost waits.', revealConditions: ['secret'] },
              ],
              '30_monsters': [
                { id: 'ash-crow', title: 'Ash Crow', summary: 'An ash-black crow watches openly.' },
              ],
            },
          },
        },
      })),
    })
    const narrativeRepository = makeNarrativeRepository({
      findStateByRoomId: jest.fn(async () => narrativeState({
        metadata: {
          adventureCatalog: {
            sections: {
              '80_encounters': [
                { id: 'roost-fall', section: '80_encounters', title: 'Roost Fall', summary: 'Crows drop from the rafters.', tags: ['crows'], revealConditions: [], relatedEntryIds: [] },
              ],
              '30_monsters': [
                { id: 'ash-crow', section: '30_monsters', title: 'Ash Crow', summary: 'An ash-black crow watches openly.', tags: [], revealConditions: [], relatedEntryIds: [] },
              ],
            },
            defaults: { arcSummary: null, currentStakes: null, openingDecision: null, discoveries: [], clocks: [] },
          },
          ttrpgPhase: 'threat',
          combatReadiness: 'ready',
          threatLevel: 4,
          requestedGameplayAction: null,
          lastEncounterSeed: {
            title: 'Roost Fall',
            source: 'location_catalog',
            catalogEntryIds: ['roost-fall', 'ash-crow'],
            encounterHints: ['Crows drop from the rafters.'],
            monsterHints: ['An ash-black crow watches openly.'],
          },
          lastCombatReadyBeatId: 'beat-ready',
          lastCombatReadyAt: '2026-05-23T11:30:00.000Z',
          lastCombatTriggerBeatId: null,
          consumedCombatTriggerBeatId: null,
        },
      })),
      listRecentBeatsByRoomId: jest.fn(async () => [narrativeBeat({ id: 'beat-ready', metadata: { combatReadiness: 'ready' } })]),
    })

    const result = await makeService({ roomRepository, narrativeRepository }).inspectLocation('11')

    expect(result.adventureCatalog).toMatchObject({
      source: 'narrative_state',
      visibleEncounterCount: 1,
      visibleMonsterCount: 1,
      hasVisibleCombatCatalog: true,
      narrativeStateCatalogPresent: true,
      locationCatalogPresent: true,
    })
    expect(result.triggerReadiness).toMatchObject({
      encounterSeedPresent: true,
      encounterSeedSource: 'location_catalog',
      encounterSeedCatalogBacked: true,
      encounterSeedCatalogEntryIds: ['roost-fall', 'ash-crow'],
      encounterSeedEncounterHintCount: 1,
      encounterSeedMonsterHintCount: 1,
    })
    expect(result.promotion).toMatchObject({
      eligible: true,
      blocker: null,
      sourceBeatId: 'beat-ready',
      lastCombatReadyBeatId: 'beat-ready',
      lastCombatReadyAt: '2026-05-23T11:30:00.000Z',
    })
    expect(result.recommendedNextAction).toBe('combat_ready_pending_auto_tick')
  })

  it('reports nested narrative locationMetadata catalog before falling back to the location row', async () => {
    mutableNarrative.enabled = true
    mutableGameplay.enabled = true
    mutableGameplay.locationAllowlist = ['11']
    const roomRepository = makeRoomRepository({
      getLocationDetails: jest.fn(async (locationId: string) => location({
        id: locationId,
        metadata: {
          adventureCatalog: {
            sections: {
              '80_encounters': [{ id: 'row-ambush', title: 'Row Ambush', summary: 'Row metadata fallback.' }],
            },
          },
        },
      })),
    })
    const narrativeRepository = makeNarrativeRepository({
      findStateByRoomId: jest.fn(async () => narrativeState({
        metadata: {
          locationMetadata: {
            adventureCatalog: {
              sections: {
                '30_monsters': [{ id: 'nested-crow', title: 'Nested Crow', summary: 'Nested metadata crow.' }],
              },
            },
          },
          ttrpgPhase: 'exploration',
          combatReadiness: 'foreshadow',
          threatLevel: 2,
          requestedGameplayAction: null,
        },
      })),
    })

    const result = await makeService({ roomRepository, narrativeRepository }).inspectLocation('11')

    expect(result.adventureCatalog).toMatchObject({
      source: 'narrative_state',
      visibleEncounterCount: 0,
      visibleMonsterCount: 1,
      hasVisibleCombatCatalog: true,
      narrativeStateCatalogPresent: true,
      locationCatalogPresent: true,
    })
  })

  it('distinguishes missing combat catalog data from ready promotion waits', async () => {
    mutableNarrative.enabled = true
    mutableGameplay.enabled = true
    mutableGameplay.locationAllowlist = ['11']
    const narrativeRepository = makeNarrativeRepository({
      findStateByRoomId: jest.fn(async () => narrativeState({
        metadata: {
          ttrpgPhase: 'threat',
          combatReadiness: 'foreshadow',
          threatLevel: 2,
          requestedGameplayAction: null,
          lastEncounterSeed: null,
          lastCombatTriggerBeatId: null,
          consumedCombatTriggerBeatId: null,
        },
      })),
    })

    const result = await makeService({ narrativeRepository }).inspectLocation('11')

    expect(result.adventureCatalog).toMatchObject({
      source: 'missing',
      visibleEncounterCount: 0,
      visibleMonsterCount: 0,
      hasVisibleCombatCatalog: false,
    })
    expect(result.promotion).toMatchObject({ eligible: false, blocker: 'not_combat_ready' })
    expect(result.recommendedNextAction).toBe('missing_location_adventure_catalog')
  })

  it('reports missing source when explicit combat-ready beat id is not safe ready material', async () => {
    mutableNarrative.enabled = true
    mutableGameplay.enabled = true
    mutableGameplay.locationAllowlist = ['11']
    const roomRepository = makeRoomRepository({
      getLocationDetails: jest.fn(async (locationId: string) => location({
        id: locationId,
        metadata: {
          adventureCatalog: {
            sections: {
              '80_encounters': [{ id: 'safe-ambush', title: 'Safe Ambush', summary: 'Visible ambush.' }],
            },
          },
        },
      })),
    })
    const narrativeRepository = makeNarrativeRepository({
      findStateByRoomId: jest.fn(async () => narrativeState({
        metadata: {
          ttrpgPhase: 'threat',
          combatReadiness: 'ready',
          threatLevel: 4,
          requestedGameplayAction: null,
          lastCombatReadyBeatId: 'beat-ready',
          consumedCombatTriggerBeatId: null,
          lastEncounterSeed: { title: 'Unsafe Explicit Source', summary: 'Crows move openly.', stakes: 'Survive the room.' },
        },
      })),
      listRecentBeatsByRoomId: jest.fn(async () => [narrativeBeat({ id: 'beat-ready', metadata: { combatReadiness: 'foreshadow' } })]),
    })

    const result = await makeService({ roomRepository, narrativeRepository }).inspectLocation('11')

    expect(result.promotion).toMatchObject({
      eligible: false,
      blocker: 'missing_source_beat',
      sourceBeatId: null,
      lastCombatReadyBeatId: 'beat-ready',
    })
    expect(result.recommendedNextAction).toBe('wait_for_cadence')
  })

  it('does not let missing catalog advice mask an already promotable ready state', async () => {
    mutableNarrative.enabled = true
    mutableGameplay.enabled = true
    mutableGameplay.locationAllowlist = ['11']
    const narrativeRepository = makeNarrativeRepository({
      findStateByRoomId: jest.fn(async () => narrativeState({
        metadata: {
          ttrpgPhase: 'threat',
          combatReadiness: 'ready',
          threatLevel: 4,
          requestedGameplayAction: null,
          lastCombatReadyBeatId: 'beat-ready',
          consumedCombatTriggerBeatId: null,
          lastEncounterSeed: { title: 'Fallback Crow Pressure', summary: 'Crows move openly.', stakes: 'Survive the room.' },
        },
      })),
      listRecentBeatsByRoomId: jest.fn(async () => [narrativeBeat({ id: 'beat-ready', metadata: { combatReadiness: 'ready' } })]),
    })

    const result = await makeService({ narrativeRepository }).inspectLocation('11')

    expect(result.adventureCatalog).toMatchObject({
      source: 'missing',
      hasVisibleCombatCatalog: false,
    })
    expect(result.promotion).toMatchObject({ eligible: true, blocker: null, sourceBeatId: 'beat-ready' })
    expect(result.recommendedNextAction).toBe('combat_ready_pending_auto_tick')
  })

  it('recommends missing trigger/readiness when narrative progression lacks required structure', async () => {
    mutableNarrative.enabled = true
    const narrativeRepository = makeNarrativeRepository({
      findStateByRoomId: jest.fn(async () => narrativeState({
        currentObjective: null,
        openThreads: [],
        metadata: {
          ttrpgPhase: 'exploration',
          combatReadiness: 'none',
          threatLevel: 1,
          requestedGameplayAction: 'start_combat',
          lastEncounterSeed: null,
          lastCombatTriggerBeatId: null,
          consumedCombatTriggerBeatId: null,
        },
      })),
    })

    const result = await makeService({ narrativeRepository }).inspectLocation('11')

    expect(result.triggerReadiness.blockers).toEqual(expect.arrayContaining([
      'missing_objective',
      'missing_open_thread',
      'not_combat_ready',
      'missing_encounter_seed',
      'missing_combat_trigger',
    ]))
    expect(result.recommendedNextAction).toBe('missing_trigger_readiness')
  })

  it('reports public author counts, latest beat narration presence, and missing public GM action', async () => {
    mutableNarrative.enabled = true
    const roomRepository = makeRoomRepository({
      getPublicMessageStats: jest.fn(async () => ({
        messageCount: 1,
        latestSequence: 5,
        latestCreatedAt: '2026-05-23T11:02:00.000Z',
      })),
      getPublicAuthorMessageStats: jest.fn(async () => ({
        messageCount: 1,
        gameMasterMessageCount: 0,
        agentMessageCount: 1,
        latestGameMasterMessageCreatedAt: null,
        latestAgentMessageCreatedAt: '2026-05-23T11:02:00.000Z',
      })),
    })
    const narrativeRepository = makeNarrativeRepository({
      findStateByRoomId: jest.fn(async () => narrativeState()),
      listRecentBeatsByRoomId: jest.fn(async () => [narrativeBeat({
        status: 'completed',
        publicNarration: null,
        metadata: { rawResponseText: 'do not expose' },
      })]),
    })

    const result = await makeService({ roomRepository, narrativeRepository }).inspectLocation('11')

    expect(result.publicTranscript).toMatchObject({
      messageCount: 1,
      gameMasterMessageCount: 0,
      agentMessageCount: 1,
      latestGameMasterMessageCreatedAt: null,
      latestAgentMessageCreatedAt: '2026-05-23T11:02:00.000Z',
    })
    expect(result.narrative.latestBeat).toMatchObject({
      status: 'completed',
      publicNarrationPresent: false,
    })
    expect(result.narrativeVisibility).toEqual({
      latestBeatPublicNarrationPresent: false,
      publicGameMasterMessageCount: 0,
      publicAgentMessageCount: 1,
      completedBeatWithoutPublicGameMasterMessage: true,
      blocker: 'missing_public_game_master_message',
    })
    expect(result.recommendedNextAction).toBe('missing_public_game_master_message')
    expect(JSON.stringify(result)).not.toContain('do not expose')
  })

  it('reports dead recent ticks as failed ticks to inspect', async () => {
    const roomRepository = makeRoomRepository({
      listActiveTicksForRoom: jest.fn(async () => []),
      listRecentTicksForRoom: jest.fn(async () => [tick({ id: 'tick-dead', status: 'dead', lastError: 'raw terminal error' })]),
    })

    const result = await makeService({ roomRepository }).inspectLocation('11')

    expect(result.ticks.recent[0]).toMatchObject({
      id: 'tick-dead',
      status: 'dead',
      lastError: 'Location room tick failed. Check server logs for details.',
    })
    expect(result.recommendedNextAction).toBe('inspect_failed_tick')
  })

  it('reports safe active and recent gameplay run status in diagnostics', async () => {
    mutableGameplay.enabled = true
    mutableGameplay.locationAllowlist = ['11']
    const gameplayRepository = makeGameplayRepository()
    gameplayRepository.findActiveRunByRoomId.mockResolvedValue(run({ lastError: 'raw active run failure' }))
    gameplayRepository.listRecentRunsByRoomId.mockResolvedValue([
      run({ id: 'run-1', status: 'active', completedTurns: 12 }),
      run({ id: 'run-completed', status: 'completed', completedTurns: 100, stopReason: 'target_reached', completedAt: '2026-05-23T12:00:00.000Z' }),
      run({ id: 'run-failed', status: 'failed', completedTurns: 2, stopReason: 'tick_dead', lastError: 'raw failed run failure', completedAt: '2026-05-23T12:05:00.000Z' }),
    ])

    const result = await makeService({ gameplayRepository }).inspectLocation('11')

    expect(gameplayRepository.findActiveRunByRoomId).toHaveBeenCalledWith('room-11')
    expect(gameplayRepository.listRecentRunsByRoomId).toHaveBeenCalledWith('room-11', 5)
    expect(result.gameplay.activeRun).toMatchObject({
      id: 'run-1',
      status: 'active',
      targetCompletedTurns: 100,
      completedTurns: 12,
      remainingTurns: 88,
      startedByActor: 'admin',
      startedByTokenId: 7,
      lastTickId: 'tick-12',
      lastError: 'Gameplay operation failed. Check server logs for details.',
    })
    expect(result.gameplay.recentRuns).toEqual([
      expect.objectContaining({ id: 'run-1', status: 'active', remainingTurns: 88, lastError: null }),
      expect.objectContaining({ id: 'run-completed', status: 'completed', remainingTurns: 0, stopReason: 'target_reached' }),
      expect.objectContaining({ id: 'run-failed', status: 'failed', remainingTurns: 98, stopReason: 'tick_dead', lastError: 'Gameplay operation failed. Check server logs for details.' }),
    ])
    expect(JSON.stringify(result)).not.toContain('startedByWallet')
    expect(JSON.stringify(result)).not.toContain('0xsecretadminwallet')
    expect(JSON.stringify(result)).not.toContain('raw active run failure')
    expect(JSON.stringify(result)).not.toContain('raw failed run failure')
    expect(JSON.stringify(result)).not.toContain('private')
  })

  it('reports cadence wait for canonical rooms with participants, messages, and no active due ticks', async () => {
    const result = await makeService().inspectLocation('11')

    expect(result.location).toMatchObject({ id: '11', chainLocationId: '11', exists: true })
    expect(result.participants.count).toBe(2)
    expect(result.publicTranscript.messageCount).toBe(1)
    expect(result.retryCadence.normalCadenceWait).toBe(true)
    expect(result.recommendedNextAction).toBe('wait_for_cadence')
  })
})
