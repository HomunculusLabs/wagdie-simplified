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

import { elizaConfig } from '@/lib/eliza/config'
import { DefaultLocationRoomGameplayCoordinator } from '@/lib/eliza/locationRooms/gameplay/coordinator'
import type {
  GameplayCharacterSheet,
  GameplayCharacterSheetResolver,
} from '@/lib/eliza/locationRooms/gameplay/characterSheetResolver'
import type { GameMasterGameplayGenerator } from '@/lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator'
import type { GameplayActionGenerator } from '@/lib/eliza/locationRooms/gameplay/actionGenerator'
import type { LocationRoomGameplayRepository } from '@/lib/eliza/locationRooms/gameplay/repository'
import type {
  GameplayDeathReview,
  GameplayEncounter,
  GameplayRewardClaim,
  GameplayRoomState,
  GameplayTurn,
} from '@/lib/eliza/locationRooms/gameplay/types'
import type { LocationRoomNarrativeRepository } from '@/lib/eliza/locationRooms/narrativeRepository'
import type { LocationRoomNarrativeState } from '@/lib/eliza/locationRooms/narrativeTypes'
import type { LocationRoomRepository } from '@/lib/eliza/locationRooms/repository'
import type { LocationRoom, LocationRoomMessage, LocationRoomParticipant, LocationRoomTick } from '@/lib/eliza/locationRooms/types'

const now = new Date('2026-05-22T12:00:00.000Z')

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
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
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
    nextAttemptAt: now.toISOString(),
    lockedAt: now.toISOString(),
    lockedBy: 'worker',
    selectedTokenId: null,
    startedAt: now.toISOString(),
    completedAt: null,
    lastError: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
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

function combatTrigger(overrides = {}) {
  return {
    source: 'narrative' as const,
    triggerId: 'beat-trigger-1',
    narrativeBeatId: 'beat-trigger-1',
    encounterSeed: { title: 'Seeded Maw', summary: 'The bell seed opens.', stakes: 'Ash must answer.' },
    speakerInstruction: 'Carry forward the bell threat.',
    ...overrides,
  }
}

function sheet(tokenId: number, overrides: Partial<GameplayCharacterSheet> = {}): GameplayCharacterSheet {
  return {
    tokenId,
    name: `Sheet #${tokenId}`,
    sourceStats: {
      str: 10,
      dex: 10,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10,
      hp: 14,
      maxHp: 14,
      ac: 10,
      speed: 30,
      level: 1,
      experience: 0,
    },
    equipment: null,
    metadata: null,
    metadataTraits: [],
    concords: [],
    ownerAddress: `0x${tokenId}`,
    stakerAddress: null,
    sheetSnapshotAt: now.toISOString(),
    ...overrides,
  }
}

function makeMessage(id: string, input: Partial<LocationRoomMessage>): LocationRoomMessage {
  return {
    id,
    roomId: 'room-1',
    locationId: 'loc-1',
    tickId: input.tickId ?? 'tick-1',
    sequence: Number(id.replace(/\D/g, '')) || 1,
    visibility: 'public',
    authorKind: input.authorKind ?? 'agent',
    tokenId: input.tokenId ?? null,
    officialAgentId: input.officialAgentId ?? null,
    authorName: input.authorName ?? 'Author',
    content: input.content ?? 'message',
    metadata: input.metadata ?? {},
    createdAt: now.toISOString(),
  }
}

function makeNarrativeRepository(): jest.Mocked<LocationRoomNarrativeRepository> {
  const state: LocationRoomNarrativeState = {
    id: 'narrative-1',
    roomId: 'room-1',
    locationId: 'loc-1',
    stateSummary: '',
    currentObjective: null,
    openThreads: [],
    metadata: {},
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }

  return {
    findStateByRoomId: jest.fn(async () => state),
    ensureStateForRoom: jest.fn(async () => state),
    updateState: jest.fn(async (_room, input) => Object.assign(state, {
      stateSummary: input.stateSummary ?? state.stateSummary,
      currentObjective: input.currentObjective ?? state.currentObjective,
      openThreads: input.openThreads ?? state.openThreads,
      metadata: input.metadata ?? state.metadata,
    })),
    findBeatByTickId: jest.fn(),
    listRecentBeatsByRoomId: jest.fn(),
    createOrReuseBeat: jest.fn(),
    storeBeatGameMasterOutput: jest.fn(),
    markBeatGameMasterMessageAppended: jest.fn(),
    markBeatCharacterAppended: jest.fn(),
    markBeatCompleted: jest.fn(),
    markBeatFailed: jest.fn(),
    markBeatDead: jest.fn(),
  } as unknown as jest.Mocked<LocationRoomNarrativeRepository>
}

function makeGameplayRepository(): jest.Mocked<LocationRoomGameplayRepository> & {
  state: GameplayRoomState
  encounters: GameplayEncounter[]
  turns: GameplayTurn[]
  deaths: GameplayDeathReview[]
  claims: GameplayRewardClaim[]
} {
  const state: GameplayRoomState = {
    id: 'game-state-1',
    roomId: 'room-1',
    locationId: 'loc-1',
    status: 'idle',
    activeEncounterId: null,
    characters: {},
    rewards: {},
    metadata: {},
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }
  const encounters: GameplayEncounter[] = []
  const turns: GameplayTurn[] = []
  const deaths: GameplayDeathReview[] = []
  const claims: GameplayRewardClaim[] = []

  const repo = {
    state,
    encounters,
    turns,
    deaths,
    claims,
    findStateByRoomId: jest.fn(async () => state),
    ensureStateForRoom: jest.fn(async () => state),
    updateState: jest.fn(async (_room, input) => {
      Object.assign(state, input)
      return state
    }),
    updateCharacterState: jest.fn(async (_room, character) => {
      state.characters[String(character.tokenId)] = character
      return state
    }),
    findActiveEncounterByRoomId: jest.fn(async () => encounters.find((encounter) => encounter.status === 'active') ?? null),
    findEncounterById: jest.fn(async (id) => encounters.find((encounter) => encounter.id === id) ?? null),
    createActiveEncounter: jest.fn(async (input) => {
      const encounter: GameplayEncounter = {
        id: 'encounter-1',
        roomId: input.room.id,
        locationId: input.room.locationId,
        status: 'active',
        difficulty: input.difficulty,
        roundNumber: 1,
        publicTitle: input.publicTitle ?? null,
        publicSummary: input.publicSummary ?? null,
        monsterState: input.monsterState,
        rewardPlan: input.rewardPlan,
        mechanics: input.mechanics ?? {},
        metadata: input.metadata ?? {},
        lastError: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        completedAt: null,
      }
      encounters.push(encounter)
      return encounter
    }),
    updateEncounter: jest.fn(async (id, input) => {
      const encounter = encounters.find((candidate) => candidate.id === id)!
      Object.assign(encounter, input)
      return encounter
    }),
    findTurnByTickId: jest.fn(async (tickId) => turns.find((turn) => turn.tickId === tickId) ?? null),
    createOrReuseTurn: jest.fn(async (input) => {
      const existing = turns.find((turn) => turn.tickId === input.tick.id)
      if (existing) return existing
      const turn: GameplayTurn = {
        id: 'turn-1',
        roomId: input.room.id,
        locationId: input.room.locationId,
        tickId: input.tick.id,
        encounterId: input.encounterId ?? null,
        status: 'planned',
        selectedTokenId: input.selectedTokenId ?? null,
        action: {},
        diceResults: [],
        mechanicalDeltas: {},
        publicMessageIds: [],
        outcomeSummary: null,
        metadata: input.metadata ?? {},
        lastError: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        completedAt: null,
      }
      turns.push(turn)
      return turn
    }),
    storeTurnOutcome: jest.fn(async (id, input) => {
      const turn = turns.find((candidate) => candidate.id === id)!
      Object.assign(turn, input)
      return turn
    }),
    markTurnFailed: jest.fn(async (id, error) => {
      const turn = turns.find((candidate) => candidate.id === id)!
      turn.status = 'failed'
      turn.lastError = String(error)
      return turn
    }),
    markTurnDead: jest.fn(async (id, error) => {
      const turn = turns.find((candidate) => candidate.id === id)!
      turn.status = 'dead'
      turn.lastError = String(error)
      return turn
    }),
    createPendingDeathReview: jest.fn(async (input) => {
      const existing = deaths.find((death) => death.tokenId === input.tokenId && death.encounterId === input.encounterId)
      if (existing) return existing
      const death: GameplayDeathReview = {
        id: `death-${deaths.length + 1}`,
        roomId: input.room.id,
        locationId: input.room.locationId,
        encounterId: input.encounterId,
        turnId: input.turnId ?? null,
        tokenId: input.tokenId,
        gameplayDeathStatus: 'dead',
        reviewStatus: 'pending',
        adminWallet: null,
        decidedAt: null,
        burnSyncStatus: 'not_applicable',
        context: input.context ?? {},
        metadata: input.metadata ?? {},
        lastError: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }
      deaths.push(death)
      return death
    }),
    listDeathReviews: jest.fn(async () => deaths),
    findDeathReviewById: jest.fn(async (id) => deaths.find((death) => death.id === id) ?? null),
    updateDeathReview: jest.fn(async (id, input) => {
      const death = deaths.find((candidate) => candidate.id === id)!
      Object.assign(death, input)
      return death
    }),
    createOrReuseRewardClaim: jest.fn(async (input) => {
      const existing = claims.find((claim) => claim.deathReviewId === input.deathReview.id)
      if (existing) return existing
      const claim: GameplayRewardClaim = {
        id: `claim-${claims.length + 1}`,
        roomId: input.deathReview.roomId,
        locationId: input.deathReview.locationId,
        encounterId: input.deathReview.encounterId,
        turnId: input.deathReview.turnId,
        deathReviewId: input.deathReview.id,
        tokenId: input.deathReview.tokenId,
        beneficiaryWallet: input.beneficiaryWallet,
        beneficiarySource: input.beneficiarySource,
        status: 'pending_review',
        policyVersion: input.policyVersion,
        performanceScore: input.performanceScore,
        scoreBreakdown: input.scoreBreakdown,
        lineItems: input.lineItems,
        releaseAdminWallet: null,
        releasedAt: null,
        metadata: input.metadata ?? {},
        lastError: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }
      claims.push(claim)
      return claim
    }),
    findRewardClaimByDeathReviewId: jest.fn(async (deathReviewId) => claims.find((claim) => claim.deathReviewId === deathReviewId) ?? null),
    listRewardClaims: jest.fn(async () => claims),
    updateRewardClaimStatusByDeathReviewId: jest.fn(async (deathReviewId, input) => {
      const claim = claims.find((candidate) => candidate.deathReviewId === deathReviewId)
      if (!claim) return null
      Object.assign(claim, input, {
        releaseAdminWallet: input.releaseAdminWallet ?? claim.releaseAdminWallet,
        releasedAt: input.releasedAt ?? claim.releasedAt,
      })
      return claim
    }),
  }

  return repo as typeof repo & jest.Mocked<LocationRoomGameplayRepository>
}

function makeRoomRepository(): jest.Mocked<LocationRoomRepository> & { messages: LocationRoomMessage[] } {
  const messages: LocationRoomMessage[] = []
  const repo = {
    messages,
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
    getPublicAuthorMessageStats: jest.fn(),
    markTickSelected: jest.fn(async (_tickId, _tokenId) => tick({ selectedTokenId: _tokenId })),
    appendMessage: jest.fn(async (input) => {
      const existing = messages.find((message) =>
        message.tickId === input.tickId &&
        message.authorKind === input.authorKind &&
        message.metadata.dedupeKey === input.dedupeKey
      )
      if (existing) return existing
      const message = makeMessage(`msg-${messages.length + 1}`, {
        tickId: input.tickId ?? null,
        authorKind: input.authorKind,
        tokenId: input.tokenId ?? null,
        officialAgentId: input.officialAgentId ?? null,
        authorName: input.authorName,
        content: input.content,
        metadata: { ...(input.metadata ?? {}), dedupeKey: input.dedupeKey },
      })
      messages.push(message)
      return message
    }),
    markTickCompleted: jest.fn(),
    markTickSkipped: jest.fn(),
    markTickFailed: jest.fn(),
    markTickDead: jest.fn(),
    updateRoomAfterProcessedTick: jest.fn(),
    recordRoomError: jest.fn(),
    listPublicMessages: jest.fn(),
    listRecentPublicMessages: jest.fn(),
  }

  return repo as typeof repo & jest.Mocked<LocationRoomRepository>
}

function makeCoordinator(options: {
  actionType?: 'attack' | 'investigate'
  rngValues?: number[]
  sheetResolver?: GameplayCharacterSheetResolver
} = {}) {
  const gameplayRepository = makeGameplayRepository()
  const roomRepository = makeRoomRepository()
  const narrativeRepository = makeNarrativeRepository()
  const gmGenerator: jest.Mocked<GameMasterGameplayGenerator> = {
    generateEncounterProposal: jest.fn(async () => ({
      gameMasterAgentId: 'gm-1',
      proposal: {
        title: 'Bell Maw',
        summary: 'A maw unfolds.',
        publicSetupNarration: 'The bell splits open.',
        monsterCount: 1,
        totalMonsterHp: 2,
        monsterName: 'Bell Maw',
        monsterArchetype: 'bell horror',
        monsterAttackBonus: 8,
        rewardXpPerCharacter: 5,
        temporaryBoons: ['ash-lit'],
      },
      publicSetupNarration: 'The bell splits open.',
      metadata: { rawResponseLength: 100 },
    })),
    generateOutcomeNarration: jest.fn(async () => ({
      gameMasterAgentId: 'gm-1',
      publicNarration: 'The backend result echoes through the room.',
      stateAfter: {
        stateSummary: 'A gameplay turn resolved.',
        currentObjective: null,
        openThreads: [],
      },
      metadata: { rawResponseLength: 50 },
    })),
  }
  const actionGenerator: jest.Mocked<GameplayActionGenerator> = {
    generateAction: jest.fn(async () => ({
      officialAgentId: 'agent-1',
      action: options.actionType === 'investigate'
        ? { actionType: 'investigate', target: null, publicSpeech: 'I study the maw.', intentSummary: 'Look for weakness.', metadata: {} }
        : { actionType: 'attack', target: { kind: 'monster', id: 'monster-1' }, publicSpeech: 'I strike the maw.', intentSummary: 'End it.', metadata: {} },
      rawResponseLength: 80,
    })),
  }
  const values = [...(options.rngValues ?? [0.999, 0.999, 0.999])]
  const coordinator = new DefaultLocationRoomGameplayCoordinator(
    roomRepository,
    gameplayRepository,
    narrativeRepository,
    gmGenerator,
    actionGenerator,
    { resolveRuntimeGameMasterAgentId: jest.fn(async () => 'gm-1') },
    (participants) => participants[0],
    () => values.shift() ?? 0.999,
    options.sheetResolver
  )

  return { coordinator, gameplayRepository, roomRepository, narrativeRepository, gmGenerator, actionGenerator }
}

describe('location room gameplay coordinator', () => {
  it('does not create an encounter without an explicit combat trigger', async () => {
    const { coordinator, gameplayRepository, gmGenerator } = makeCoordinator()

    const result = await coordinator.processTurn({
      room: room(),
      tick: tick(),
      participants: [participant(1, 'Ash'), participant(2, 'Bone')],
      recentMessages: [],
      now,
    })

    expect(result).toEqual({ status: 'skipped', selectedTokenId: null, reason: 'no_combat_trigger' })
    expect(gmGenerator.generateEncounterProposal).not.toHaveBeenCalled()
    expect(gameplayRepository.createActiveEncounter).not.toHaveBeenCalled()
  })

  it('does not resolve character sheets while stats gate is disabled by default', async () => {
    const sheetResolver: jest.Mocked<GameplayCharacterSheetResolver> = {
      resolveSheets: jest.fn(async () => new Map()),
    }
    const { coordinator, gameplayRepository } = makeCoordinator({ sheetResolver })

    await coordinator.processTurn({
      room: room(),
      tick: tick(),
      participants: [participant(1, 'Ash'), participant(2, 'Bone')],
      recentMessages: [],
      now,
      encounterTrigger: combatTrigger(),
    })

    expect(sheetResolver.resolveSheets).not.toHaveBeenCalled()
    expect(gameplayRepository.state.characters['1']).toMatchObject({ hp: 10, maxHp: 10 })
    expect(gameplayRepository.state.characters['1'].sourceStats).toBeUndefined()
    expect(gameplayRepository.state.characters['1'].effectiveStats).toBeUndefined()
  })

  it('enriches legacy character state with sheets without resetting gameplay-local HP', async () => {
    const originalStatsEnabled = elizaConfig.locationRooms.gameplay.stats.enabled
    ;(elizaConfig.locationRooms.gameplay.stats as { enabled: boolean }).enabled = true

    try {
      const sheets = new Map<number, GameplayCharacterSheet>([
        [1, sheet(1, {
          sourceStats: {
            str: 16,
            dex: 12,
            con: 10,
            int: 10,
            wis: 10,
            cha: 10,
            hp: 14,
            maxHp: 14,
            ac: 15,
            speed: 30,
            level: 2,
            experience: 25,
          },
          equipment: { weapons: ['blade'] },
        })],
        [2, sheet(2)],
      ])
      const sheetResolver: jest.Mocked<GameplayCharacterSheetResolver> = {
        resolveSheets: jest.fn(async () => sheets),
      }
      const { coordinator, gameplayRepository, actionGenerator } = makeCoordinator({ sheetResolver })
      gameplayRepository.state.characters['1'] = {
        tokenId: 1,
        name: 'Legacy Ash',
        hp: 4,
        maxHp: 10,
        status: 'alive',
        xp: 7,
        temporaryBoons: ['old-boon'],
        wounds: ['old-wound'],
      }

      await coordinator.processTurn({
        room: room(),
        tick: tick(),
        participants: [participant(1, 'Ash'), participant(2, 'Bone')],
        recentMessages: [],
        now,
        encounterTrigger: combatTrigger(),
      })

      expect(sheetResolver.resolveSheets).toHaveBeenCalledWith([1, 2], { now })
      expect(gameplayRepository.state.characters['1']).toMatchObject({
        hp: 4,
        maxHp: 14,
        xp: 12,
        temporaryBoons: ['old-boon', 'ash-lit'],
        wounds: ['old-wound'],
        sourceStats: expect.objectContaining({ str: 16, maxHp: 14, level: 2 }),
        effectiveStats: expect.objectContaining({ str: 16, maxHp: 14, ac: 15 }),
        modifierSources: [expect.objectContaining({ source: 'equipment', target: 'attack', value: 1 })],
        performance: expect.objectContaining({ roundsActed: 1 }),
      })
      expect(actionGenerator.generateAction).toHaveBeenCalledWith(expect.objectContaining({
        characterState: expect.objectContaining({ hp: 4, maxHp: 14, sourceStats: expect.any(Object) }),
      }))
    } finally {
      ;(elizaConfig.locationRooms.gameplay.stats as { enabled: boolean }).enabled = originalStatsEnabled
    }
  })

  it('starts an encounter, resolves a selected actor action, persists state, and appends keyed transcript messages', async () => {
    const { coordinator, gameplayRepository, roomRepository, narrativeRepository, actionGenerator } = makeCoordinator()
    gameplayRepository.state.characters['99'] = {
      tokenId: 99,
      name: 'Stale Pilgrim',
      hp: 10,
      maxHp: 10,
      status: 'alive',
      xp: 0,
      temporaryBoons: [],
      wounds: [],
    }

    const result = await coordinator.processTurn({
      room: room(),
      tick: tick(),
      participants: [participant(1, 'Ash'), participant(2, 'Bone')],
      recentMessages: [],
      now,
      encounterTrigger: combatTrigger(),
    })

    expect(result).toMatchObject({ status: 'completed', selectedTokenId: 1, messageIds: ['msg-1', 'msg-2', 'msg-3'] })
    expect(gameplayRepository.encounters[0]).toMatchObject({
      status: 'victory',
      completedAt: now.toISOString(),
      metadata: expect.objectContaining({
        triggerSource: 'narrative',
        triggerId: 'beat-trigger-1',
        narrativeBeatId: 'beat-trigger-1',
        encounterSeed: expect.objectContaining({ title: 'Seeded Maw' }),
        ttrpgPhase: 'combat',
      }),
    })
    expect(gameplayRepository.state.activeEncounterId).toBeNull()
    expect(gameplayRepository.state.characters['1']).toMatchObject({
      xp: 5,
      temporaryBoons: ['ash-lit'],
      performance: expect.objectContaining({ roundsActed: 1, roundsSurvived: 1, successfulAttacks: 1 }),
    })
    expect(gameplayRepository.turns[0].mechanicalDeltas).toMatchObject({
      performanceUpdates: expect.arrayContaining([expect.objectContaining({ tokenId: 1 })]),
    })
    expect(gameplayRepository.state.characters['99']).toMatchObject({ xp: 0, temporaryBoons: [] })
    expect(roomRepository.messages.map((message) => message.metadata.gameplayMessageKind)).toEqual([
      'gm_setup',
      'character_action',
      'gm_outcome',
    ])
    expect(roomRepository.messages.map((message) => message.metadata.messageDomain)).toEqual([
      'combat',
      'combat',
      'combat',
    ])
    expect(roomRepository.messages.map((message) => message.metadata.ttrpgPhase)).toEqual([
      'combat',
      'combat',
      'combat',
    ])
    const outcomeMessage = roomRepository.messages.find((message) => message.metadata.gameplayMessageKind === 'gm_outcome')
    expect(outcomeMessage?.content).toBe('The backend result echoes through the room.')
    expect(outcomeMessage?.content).not.toContain('Rolls:')
    expect(outcomeMessage?.metadata).toEqual(expect.objectContaining({
      rollSummary: expect.stringContaining('Rolls:'),
      publicRolls: expect.objectContaining({
        action: expect.objectContaining({
          actionType: 'attack',
          actor: expect.objectContaining({ kind: 'character', tokenId: 1 }),
          target: expect.objectContaining({ kind: 'monster', id: 'monster-1' }),
        }),
        publicEffects: expect.arrayContaining([expect.objectContaining({ kind: 'damage' })]),
        encounterStatusAfter: 'victory',
      }),
    }))
    expect(actionGenerator.generateAction).toHaveBeenCalledWith(expect.objectContaining({
      speakerInstruction: 'Carry forward the bell threat.',
    }))
    expect(outcomeMessage?.metadata).not.toHaveProperty('mechanicalDeltas')
    expect(outcomeMessage?.metadata).not.toHaveProperty('diceResults')
    expect(JSON.stringify(outcomeMessage?.metadata.publicRolls)).not.toContain('charactersAfter')
    expect(JSON.stringify(outcomeMessage?.metadata.publicRolls)).not.toContain('rewardAssignments')
    expect(narrativeRepository.updateState).toHaveBeenCalledWith(expect.objectContaining({ id: 'room-1' }), expect.objectContaining({
      metadata: expect.objectContaining({
        ttrpgPhase: 'combat',
        consumedCombatTriggerBeatId: 'beat-trigger-1',
        requestedGameplayAction: null,
      }),
    }))
    expect(narrativeRepository.updateState).toHaveBeenCalledWith(expect.objectContaining({ id: 'room-1' }), expect.objectContaining({
      stateSummary: 'A gameplay turn resolved.',
      metadata: expect.objectContaining({
        ttrpgPhase: 'aftermath',
        combatReadiness: 'none',
        requestedGameplayAction: null,
      }),
    }))
  })

  it('appends setup narration on retry when the encounter was already created by the same tick', async () => {
    const { coordinator, gameplayRepository, roomRepository, gmGenerator } = makeCoordinator()
    gameplayRepository.encounters.push({
      id: 'encounter-existing',
      roomId: 'room-1',
      locationId: 'loc-1',
      status: 'active',
      difficulty: 'normal',
      roundNumber: 1,
      publicTitle: 'Existing Maw',
      publicSummary: 'Existing summary.',
      monsterState: [{ id: 'monster-1', name: 'Existing Maw', archetype: 'bell horror', hp: 2, maxHp: 2, ac: 12, attackBonus: 2, damageFormula: '1d6', status: 'alive' }],
      rewardPlan: { xpPerCharacter: 5, temporaryBoons: [], narrativeRewards: [], victoryText: null, metadata: {} },
      mechanics: {},
      metadata: { createdByTickId: 'tick-1', publicSetupNarration: 'Persisted setup.' },
      lastError: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      completedAt: null,
    })

    await coordinator.processTurn({
      room: room(),
      tick: tick(),
      participants: [participant(1, 'Ash'), participant(2, 'Bone')],
      recentMessages: [],
      now,
      encounterTrigger: combatTrigger(),
    })

    expect(gmGenerator.generateEncounterProposal).not.toHaveBeenCalled()
    expect(roomRepository.messages[0]).toMatchObject({
      content: 'Persisted setup.',
      metadata: expect.objectContaining({ gameplayMessageKind: 'gm_setup', dedupeKey: 'gameplay:gm_setup' }),
    })
  })

  it('returns a completed turn on retry without regenerating or duplicating messages', async () => {
    const { coordinator, roomRepository, gmGenerator, actionGenerator } = makeCoordinator()
    const input = {
      room: room(),
      tick: tick(),
      participants: [participant(1, 'Ash'), participant(2, 'Bone')],
      recentMessages: [],
      now,
      encounterTrigger: combatTrigger(),
    }

    await coordinator.processTurn(input)
    const result = await coordinator.processTurn(input)

    expect(result).toMatchObject({ status: 'completed', messageIds: ['msg-1', 'msg-2', 'msg-3'] })
    expect(roomRepository.messages).toHaveLength(3)
    expect(gmGenerator.generateEncounterProposal).toHaveBeenCalledTimes(1)
    expect(actionGenerator.generateAction).toHaveBeenCalledTimes(1)
  })

  it('excludes gameplay-dead characters from speaker selection', async () => {
    const { coordinator, gameplayRepository, actionGenerator, gmGenerator } = makeCoordinator({
      rngValues: [0.999, 0.5],
    })
    gameplayRepository.state.status = 'active_encounter'
    gameplayRepository.state.activeEncounterId = 'encounter-existing'
    gameplayRepository.state.characters['1'] = {
      tokenId: 1,
      name: 'Ash',
      hp: 0,
      maxHp: 10,
      status: 'dead',
      xp: 0,
      temporaryBoons: [],
      wounds: ['Bell-struck'],
    }
    gameplayRepository.state.characters['2'] = {
      tokenId: 2,
      name: 'Bone',
      hp: 10,
      maxHp: 10,
      status: 'alive',
      xp: 0,
      temporaryBoons: [],
      wounds: [],
    }
    gameplayRepository.encounters.push({
      id: 'encounter-existing',
      roomId: 'room-1',
      locationId: 'loc-1',
      status: 'active',
      difficulty: 'normal',
      roundNumber: 2,
      publicTitle: 'Existing Maw',
      publicSummary: 'Existing summary.',
      monsterState: [{ id: 'monster-1', name: 'Existing Maw', archetype: 'bell horror', hp: 20, maxHp: 20, ac: 12, attackBonus: 2, damageFormula: '1d6', status: 'alive' }],
      rewardPlan: { xpPerCharacter: 5, temporaryBoons: [], narrativeRewards: [], victoryText: null, metadata: {} },
      mechanics: {},
      metadata: { createdByTickId: 'previous-tick' },
      lastError: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      completedAt: null,
    })

    const result = await coordinator.processTurn({
      room: room(),
      tick: tick(),
      participants: [participant(1, 'Ash'), participant(2, 'Bone')],
      recentMessages: [],
      now,
      encounterTrigger: combatTrigger(),
    })

    expect(result.selectedTokenId).toBe(2)
    expect(actionGenerator.generateAction).toHaveBeenCalledWith(expect.objectContaining({
      speaker: expect.objectContaining({ tokenId: 2 }),
      participants: [expect.objectContaining({ tokenId: 2 })],
      validation: expect.objectContaining({ legalCharacterTokenIds: [2] }),
    }))
    expect(gmGenerator.generateEncounterProposal).not.toHaveBeenCalled()
    expect(gameplayRepository.turns[0]).toMatchObject({ selectedTokenId: 2 })
  })

  it('creates a pending death review when backend mechanics kill the selected character', async () => {
    const { coordinator, gameplayRepository } = makeCoordinator({
      actionType: 'investigate',
      rngValues: [0, 0.999],
    })

    await coordinator.processTurn({
      room: room(),
      tick: tick(),
      participants: [participant(1, 'Ash'), participant(2, 'Bone')],
      recentMessages: [],
      now,
      encounterTrigger: combatTrigger(),
    })

    expect(gameplayRepository.state.characters['1']).toMatchObject({ hp: 0, status: 'dead' })
    expect(gameplayRepository.deaths).toHaveLength(1)
    expect(gameplayRepository.deaths[0]).toMatchObject({ tokenId: 1, reviewStatus: 'pending' })
    expect(gameplayRepository.claims).toHaveLength(0)
  })

  it('creates one pending reward claim for a death review when death rewards are enabled', async () => {
    const originalEnabled = elizaConfig.locationRooms.gameplay.deathRewards.enabled
    ;(elizaConfig.locationRooms.gameplay.deathRewards as { enabled: boolean }).enabled = true

    try {
      const { coordinator, gameplayRepository } = makeCoordinator({
        actionType: 'investigate',
        rngValues: [0, 0.999],
      })

      const input = {
        room: room(),
        tick: tick(),
        participants: [participant(1, 'Ash'), participant(2, 'Bone')],
        recentMessages: [],
        now,
        encounterTrigger: combatTrigger(),
      }

      await coordinator.processTurn(input)
      await coordinator.processTurn(input)

      expect(gameplayRepository.deaths).toHaveLength(1)
      expect(gameplayRepository.claims).toHaveLength(1)
      expect(gameplayRepository.claims[0]).toMatchObject({
        deathReviewId: 'death-1',
        tokenId: 1,
        beneficiaryWallet: '0x1',
        beneficiarySource: 'owner_address',
        status: 'pending_review',
        policyVersion: 'death-rewards-v1',
        lineItems: [expect.objectContaining({ assetType: 'gameplay_reward_points' })],
      })
      expect(gameplayRepository.deaths[0].context).toMatchObject({
        rewardClaim: expect.objectContaining({ id: 'claim-1', performanceScore: expect.any(Number) }),
      })
    } finally {
      ;(elizaConfig.locationRooms.gameplay.deathRewards as { enabled: boolean }).enabled = originalEnabled
    }
  })
})
