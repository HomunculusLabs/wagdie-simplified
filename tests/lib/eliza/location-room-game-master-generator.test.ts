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

jest.mock('@/lib/eliza/client', () => ({
  createOfficialServerClient: jest.fn(() => ({})),
}))

jest.mock('@/lib/eliza/characterResolver', () => ({
  resolveCharacterByTokenId: jest.fn(),
}))

import {
  OfficialGameMasterBeatGenerator,
  buildGameMasterBeatProgressionContext,
  buildGameMasterBeatPrompt,
  normalizeGameMasterBeatResponse,
} from '@/lib/eliza/locationRooms/gameMasterGenerator'
import { buildOfficialLocationRoomPrompt } from '@/lib/eliza/locationRooms/officialTurnGenerator'
import type {
  LocationRoom,
  LocationRoomMessage,
  LocationRoomParticipant,
  LocationRoomTick,
} from '@/lib/eliza/locationRooms/types'
import type { LocationRoomNarrativeState } from '@/lib/eliza/locationRooms/narrativeTypes'

const now = '2026-05-22T12:00:00.000Z'
const limits = {
  publicNarrationMaxLength: 30,
  stateSummaryMaxLength: 40,
  openThreadsMaxCount: 2,
  openThreadMaxLength: 12,
}
const richOpeningNarration = 'Ash drifts through the broken orchard in slow gray curtains, muting every sound except the scrape of dead branches overhead. A half-buried bell rope hangs from a blackened arch, swaying though no wind touches it. Three paths offer themselves: the rope, a narrow animal trail, and a root-choked cellar door breathing warm smoke. Somewhere below, something knocks twice and waits for an answer.'

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

function tick(): LocationRoomTick {
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
    id: 'msg-1',
    roomId: 'room-1',
    locationId: 'loc-1',
    tickId: null,
    sequence: 1,
    visibility: 'public',
    authorKind: 'agent',
    tokenId: 1,
    officialAgentId: 'agent-1',
    authorName: 'Ash',
    content: 'The bell rings.',
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
    stateSummary: 'A bell rings under the ash.',
    currentObjective: 'Find the bell.',
    openThreads: ['Who rings it?'],
    metadata: {
      ttrpgPhase: 'exploration',
      combatReadiness: 'foreshadow',
      threatLevel: 1,
      requestedGameplayAction: null,
      lastEncounterSeed: { title: 'Old Bell', summary: 'A prior seed.', stakes: 'Do not wake it.' },
    },
    createdAt: now,
    updatedAt: now,
  }
}

describe('game-master beat generator helpers', () => {
  const participants = [participant(1, 'Ash'), participant(2, 'Bone')]

  it('builds a room-scoped prompt with participants, selected speaker, transcript, and state', () => {
    const prompt = buildGameMasterBeatPrompt({
      gameMasterAgentId: 'gm-1',
      room: room(),
      tick: tick(),
      participants,
      speaker: participants[1],
      recentMessages: [message()],
      narrativeState: narrativeState(),
    })

    expect(prompt).toContain('Room id: room-1')
    expect(prompt).toContain('Location id: loc-1')
    expect(prompt).toContain('Tick id: tick-1')
    expect(prompt).toContain('Selected speaker: Bone (#2)')
    expect(prompt).toContain('Ash #1: The bell rings.')
    expect(prompt).toContain('Continuity summary: A bell rings under the ash.')
    expect(prompt).toContain('TTRPG phase: exploration')
    expect(prompt).toContain('Combat readiness: foreshadow')
    expect(prompt).toContain('Threat level: 1')
    expect(prompt).toContain('Last encounter seed: Title: Old Bell')
    expect(prompt).toContain('Return only a JSON object')
    expect(prompt).toContain('"ttrpgPhase"')
    expect(prompt).toContain('Non-aftermath beats must include a concrete currentObjective')
    expect(prompt).toContain('Do not spawn combat by default')
    expect(prompt).toContain('requestedGameplayAction "start_combat"')
  })

  it('requires public narration in the prompt when no prior public GM message exists', () => {
    const progressionContext = buildGameMasterBeatProgressionContext({
      room: room(),
      narrativeState: narrativeState(),
      publicAuthorMessageStats: {
        messageCount: 0,
        gameMasterMessageCount: 0,
        agentMessageCount: 0,
        latestGameMasterMessageCreatedAt: null,
        latestAgentMessageCreatedAt: null,
      },
    })

    const prompt = buildGameMasterBeatPrompt({
      gameMasterAgentId: 'gm-1',
      room: room(),
      tick: tick(),
      participants,
      speaker: participants[0],
      recentMessages: [],
      narrativeState: narrativeState(),
      progressionContext,
    })

    expect(progressionContext).toMatchObject({
      requirePublicNarration: true,
      requireOpeningPublicNarration: true,
      publicNarrationRequirementReason: 'no_prior_public_game_master_message',
    })
    expect(prompt).toContain('Public narration is REQUIRED for this beat.')
    expect(prompt).toContain('Reason: no prior public Game Master message exists.')
    expect(prompt).toContain('"publicNarration": "required public narration for observers"')
    expect(prompt).toContain('Opening publicNarration must be a rich table-setting GM beat')
    expect(prompt).toContain('2-3 interactable hooks')
  })

  it('normalizes fenced JSON and caps public/state/thread values', () => {
    const output = normalizeGameMasterBeatResponse(
      '```json\n{"publicNarration":"The ash bell tolls beyond the ruined gate.","speakerInstruction":"Answer the bell without solving it.","stateSummary":"The bell is now louder near the ruined gate and the room is wary.","currentObjective":"Follow the sound","openThreads":["Who rings the bell?","What waits below?","extra"],"ttrpgPhase":"threat","combatReadiness":"ready","threatLevel":7,"requestedGameplayAction":"start_combat","encounterSeed":{"title":"Bell Horror","summary":"A horror answers the bell.","stakes":"The gate may open."},"featuredTokenIds":[1,2],"selectedSpeakerTokenId":1}\n```',
      { participants, speaker: participants[0] },
      { gameMasterAgentId: 'gm-1', limits }
    )

    expect(output).toMatchObject({
      gameMasterAgentId: 'gm-1',
      publicNarration: 'The ash bell tolls beyond the',
      speakerInstruction: 'Answer the bell without solving it.',
      stateAfter: {
        stateSummary: 'The bell is now louder near the ruined g',
        currentObjective: 'Follow the sound',
        openThreads: ['Who rings th', 'What waits b'],
      },
      ttrpgPhase: 'threat',
      combatReadiness: 'ready',
      threatLevel: 5,
      requestedGameplayAction: 'start_combat',
      encounterSeed: {
        title: 'Bell Horror',
        summary: 'A horror answers the bell.',
        stakes: 'The gate may open.',
      },
    })
    expect(output.metadata.featuredTokenIds).toEqual([1, 2])
    expect(output.metadata).toEqual(expect.objectContaining({
      ttrpgPhase: 'threat',
      combatReadiness: 'ready',
      threatLevel: 5,
      requestedGameplayAction: 'start_combat',
      encounterSeed: expect.objectContaining({ title: 'Bell Horror' }),
    }))

    const noThreads = normalizeGameMasterBeatResponse(
      '{"speakerInstruction":"Speak","stateSummary":"State","currentObjective":null,"openThreads":["ignored"],"ttrpgPhase":"aftermath"}',
      { participants, speaker: participants[0] },
      { gameMasterAgentId: 'gm-1', limits: { ...limits, openThreadsMaxCount: 0 } }
    )
    expect(noThreads.stateAfter.openThreads).toEqual([])
    expect(noThreads).toMatchObject({
      ttrpgPhase: 'aftermath',
      combatReadiness: 'none',
      threatLevel: null,
      requestedGameplayAction: null,
      encounterSeed: null,
    })
  })

  it('rejects invalid JSON and empty required fields before public output can be written', () => {
    expect(() => normalizeGameMasterBeatResponse('not json', { participants, speaker: participants[0] }, {
      gameMasterAgentId: 'gm-1',
      limits,
    })).toThrow('JSON object')

    expect(() => normalizeGameMasterBeatResponse('{"speakerInstruction":"","stateSummary":"ok"}', {
      participants,
      speaker: participants[0],
    }, {
      gameMasterAgentId: 'gm-1',
      limits,
    })).toThrow('speakerInstruction')
  })

  it('rejects ineligible token references and speaker mismatches', () => {
    expect(() => normalizeGameMasterBeatResponse(
      '{"speakerInstruction":"Speak","stateSummary":"State","featuredTokenIds":[999]}',
      { participants, speaker: participants[0] },
      { gameMasterAgentId: 'gm-1', limits }
    )).toThrow('ineligible token id 999')

    expect(() => normalizeGameMasterBeatResponse(
      '{"speakerInstruction":"Speak","stateSummary":"State","selectedSpeakerTokenId":2}',
      { participants, speaker: participants[0] },
      { gameMasterAgentId: 'gm-1', limits }
    )).toThrow('did not match')
  })

  it('rejects required missing public narration and repeated flat opening state without forcing combat', () => {
    const requiredNarrationContext = buildGameMasterBeatProgressionContext({
      room: room(),
      narrativeState: narrativeState(),
      publicAuthorMessageStats: {
        messageCount: 1,
        gameMasterMessageCount: 0,
        agentMessageCount: 1,
        latestGameMasterMessageCreatedAt: null,
        latestAgentMessageCreatedAt: now,
      },
    })
    expect(() => normalizeGameMasterBeatResponse(
      '{"publicNarration":null,"speakerInstruction":"Speak","stateSummary":"State","currentObjective":"Follow the bell","openThreads":["Who waits?"],"ttrpgPhase":"exploration"}',
      { participants, speaker: participants[0] },
      { gameMasterAgentId: 'gm-1', limits, progressionContext: requiredNarrationContext }
    )).toThrow('publicNarration')

    expect(() => normalizeGameMasterBeatResponse(
      '{"publicNarration":"The air changes.","speakerInstruction":"Speak","stateSummary":"State","currentObjective":"Follow the bell","openThreads":["Who waits?"],"ttrpgPhase":"exploration"}',
      { participants, speaker: participants[0] },
      { gameMasterAgentId: 'gm-1', limits: { ...limits, publicNarrationMaxLength: 800 }, progressionContext: requiredNarrationContext }
    )).toThrow('too short')

    const repeatedFlatNoGmContext = buildGameMasterBeatProgressionContext({
      room: room({ tickCount: 2 }),
      narrativeState: {
        ...narrativeState(),
        metadata: { ttrpgPhase: 'story', combatReadiness: 'none', threatLevel: 0 },
      },
      publicAuthorMessageStats: {
        messageCount: 3,
        gameMasterMessageCount: 0,
        agentMessageCount: 3,
        latestGameMasterMessageCreatedAt: null,
        latestAgentMessageCreatedAt: now,
      },
    })
    expect(repeatedFlatNoGmContext).toMatchObject({
      requirePublicNarration: true,
      requireOpeningPublicNarration: true,
      requireEscalationBeyondOpening: true,
      publicNarrationRequirementReason: 'no_prior_public_game_master_message',
    })
    expect(() => normalizeGameMasterBeatResponse(
      JSON.stringify({ publicNarration: richOpeningNarration, speakerInstruction: 'Notice it.', stateSummary: 'State', currentObjective: 'Follow the bell', openThreads: ['Who waits?'], ttrpgPhase: 'story', combatReadiness: 'none', threatLevel: 0 }),
      { participants, speaker: participants[0] },
      { gameMasterAgentId: 'gm-1', limits: { ...limits, publicNarrationMaxLength: 800 }, progressionContext: repeatedFlatNoGmContext }
    )).toThrow('visibly escalate')

    const repeatedFlatContext = buildGameMasterBeatProgressionContext({
      room: room({ tickCount: 2 }),
      narrativeState: {
        ...narrativeState(),
        metadata: { ttrpgPhase: 'story', combatReadiness: 'none', threatLevel: 0 },
      },
      publicAuthorMessageStats: {
        messageCount: 3,
        gameMasterMessageCount: 1,
        agentMessageCount: 2,
        latestGameMasterMessageCreatedAt: now,
        latestAgentMessageCreatedAt: now,
      },
    })
    expect(repeatedFlatContext).toMatchObject({
      requirePublicNarration: true,
      requireEscalationBeyondOpening: true,
      publicNarrationRequirementReason: 'repeated_activity_without_visible_escalation',
    })
    expect(() => normalizeGameMasterBeatResponse(
      '{"publicNarration":"The air changes.","speakerInstruction":"Notice it.","stateSummary":"State","currentObjective":"Follow the bell","openThreads":["Who waits?"],"ttrpgPhase":"story","combatReadiness":"none","threatLevel":0}',
      { participants, speaker: participants[0] },
      { gameMasterAgentId: 'gm-1', limits, progressionContext: repeatedFlatContext }
    )).toThrow('visibly escalate')

    const escalated = normalizeGameMasterBeatResponse(
      '{"publicNarration":"The ash parts around a hidden stair.","speakerInstruction":"Choose whether to descend.","stateSummary":"A hidden stair opens.","currentObjective":"Explore the stair","openThreads":["What waits?"],"ttrpgPhase":"exploration","combatReadiness":"none","threatLevel":0,"requestedGameplayAction":null}',
      { participants, speaker: participants[0] },
      { gameMasterAgentId: 'gm-1', limits, progressionContext: repeatedFlatContext }
    )
    expect(escalated).toMatchObject({
      ttrpgPhase: 'exploration',
      combatReadiness: 'none',
      requestedGameplayAction: null,
    })

    const optionalNarrationContext = buildGameMasterBeatProgressionContext({
      room: room({ tickCount: 3 }),
      narrativeState: narrativeState(),
      publicAuthorMessageStats: {
        messageCount: 4,
        gameMasterMessageCount: 1,
        agentMessageCount: 3,
        latestGameMasterMessageCreatedAt: now,
        latestAgentMessageCreatedAt: now,
      },
    })
    const optional = normalizeGameMasterBeatResponse(
      '{"speakerInstruction":"Speak","stateSummary":"State","currentObjective":"Follow the bell","openThreads":["Who waits?"],"ttrpgPhase":"exploration"}',
      { participants, speaker: participants[0] },
      { gameMasterAgentId: 'gm-1', limits, progressionContext: optionalNarrationContext }
    )
    expect(optional.publicNarration).toBeNull()
  })

  it('rejects structurally weak progression and unsafe combat handoff contracts', () => {
    expect(() => normalizeGameMasterBeatResponse(
      '{"speakerInstruction":"Speak","stateSummary":"State","ttrpgPhase":"exploration","openThreads":["Who waits?"]}',
      { participants, speaker: participants[0] },
      { gameMasterAgentId: 'gm-1', limits }
    )).toThrow('currentObjective')

    expect(() => normalizeGameMasterBeatResponse(
      '{"speakerInstruction":"Speak","stateSummary":"State","currentObjective":"Follow the bell","openThreads":[],"ttrpgPhase":"exploration"}',
      { participants, speaker: participants[0] },
      { gameMasterAgentId: 'gm-1', limits }
    )).toThrow('openThreads')

    expect(() => normalizeGameMasterBeatResponse(
      '{"speakerInstruction":"Fight","stateSummary":"State","currentObjective":"Survive","openThreads":["What answers?"],"ttrpgPhase":"exploration","combatReadiness":"ready","threatLevel":2,"requestedGameplayAction":"start_combat"}',
      { participants, speaker: participants[0] },
      { gameMasterAgentId: 'gm-1', limits }
    )).toThrow('combatReadiness ready')

    expect(() => normalizeGameMasterBeatResponse(
      '{"speakerInstruction":"Fight","stateSummary":"State","currentObjective":"Survive","openThreads":["What answers?"],"ttrpgPhase":"threat","combatReadiness":"ready","threatLevel":4,"requestedGameplayAction":"start_combat","encounterSeed":{"privateHp":100}}',
      { participants, speaker: participants[0] },
      { gameMasterAgentId: 'gm-1', limits }
    )).toThrow('encounterSeed')
  })

  it('uses the input game-master agent id with room-scoped session and message metadata', async () => {
    const messaging = {
      startAgent: jest.fn(async () => undefined),
      createSession: jest.fn(async () => ({ sessionId: 'session-1' })),
      sendSessionMessage: jest.fn(async () => ({} as Response)),
      collectStreamedResponseText: jest.fn(async () => ({
        message: null,
        text: '{"publicNarration":"The bell tolls.","speakerInstruction":"Speak with dread.","stateSummary":"The bell has called Ash.","currentObjective":"Answer the toll.","openThreads":["Who answers the bell?"],"selectedSpeakerTokenId":1}',
      })),
      deleteSession: jest.fn(async () => undefined),
    }
    const generator = new OfficialGameMasterBeatGenerator(messaging as never)

    const output = await generator.generateBeat({
      gameMasterAgentId: 'gm-runtime-1',
      room: room(),
      tick: tick(),
      participants,
      speaker: participants[0],
      recentMessages: [message()],
      narrativeState: narrativeState(),
    })

    expect(output.gameMasterAgentId).toBe('gm-runtime-1')
    expect(messaging.startAgent).toHaveBeenCalledWith('gm-runtime-1')
    expect(messaging.createSession).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'gm-runtime-1',
      metadata: expect.objectContaining({
        source: 'wagdie-location-room-game-master',
        roomId: 'room-1',
        locationId: 'loc-1',
        tickId: 'tick-1',
        channelId: 'wagdie-location-loc-1',
        selectedSpeakerTokenId: 1,
      }),
    }))
    expect(messaging.sendSessionMessage).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1',
      metadata: expect.objectContaining({
        roomId: 'room-1',
        locationId: 'loc-1',
        tickId: 'tick-1',
        selectedSpeakerTokenId: 1,
      }),
    }))
    expect(output.metadata.gmGeneration).toEqual(expect.objectContaining({
      status: 'accepted',
      repairAttempted: false,
      repaired: false,
      initialResponseLength: expect.any(Number),
    }))
    expect(messaging.deleteSession).toHaveBeenCalledWith('session-1')
  })

  it('repairs a collected invalid model response once and returns safe diagnostics', async () => {
    const messaging = {
      startAgent: jest.fn(async () => undefined),
      createSession: jest.fn(async () => ({ sessionId: 'session-1' })),
      sendSessionMessage: jest.fn(async () => ({} as Response)),
      collectStreamedResponseText: jest.fn()
        .mockResolvedValueOnce({ message: null, text: 'not json' })
        .mockResolvedValueOnce({
          message: null,
          text: JSON.stringify({ publicNarration: richOpeningNarration, speakerInstruction: 'Speak with dread, choose one of the three hooks, and leave the mystery unresolved.', stateSummary: 'The bell has called Ash.', currentObjective: 'Answer the toll.', openThreads: ['Who answers the bell?'], ttrpgPhase: 'exploration', combatReadiness: 'none', threatLevel: 0, requestedGameplayAction: null, encounterSeed: null, selectedSpeakerTokenId: 1 }),
        }),
      deleteSession: jest.fn(async () => undefined),
    }
    const generator = new OfficialGameMasterBeatGenerator(messaging as never)

    const progressionContext = buildGameMasterBeatProgressionContext({
      room: room(),
      narrativeState: narrativeState(),
      publicAuthorMessageStats: {
        messageCount: 0,
        gameMasterMessageCount: 0,
        agentMessageCount: 0,
        latestGameMasterMessageCreatedAt: null,
        latestAgentMessageCreatedAt: null,
      },
    })

    const output = await generator.generateBeat({
      gameMasterAgentId: 'gm-runtime-1',
      room: room(),
      tick: tick(),
      participants,
      speaker: participants[0],
      recentMessages: [message()],
      narrativeState: narrativeState(),
      progressionContext,
    })

    expect(output.stateAfter.currentObjective).toBe('Answer the toll.')
    expect(output.metadata.gmGeneration).toEqual(expect.objectContaining({
      status: 'repaired',
      repairAttempted: true,
      repaired: true,
      initialErrorCategory: 'missing_json_object',
      initialResponseLength: 'not json'.length,
      repairResponseLength: expect.any(Number),
      initialResponseFlags: expect.objectContaining({ hasJsonObject: false }),
      repairResponseFlags: expect.objectContaining({ hasJsonObject: true }),
    }))
    expect(messaging.sendSessionMessage).toHaveBeenCalledTimes(2)
    const repairPrompt = messaging.sendSessionMessage.mock.calls[1][0].content
    expect(repairPrompt).toContain('Return only a JSON object')
    expect(repairPrompt).toContain('selectedSpeakerTokenId must be 1')
    expect(repairPrompt).toContain('Non-aftermath beats must include a concrete currentObjective')
    expect(repairPrompt).toContain('Public narration is REQUIRED for this beat.')
    expect(repairPrompt).toContain('publicNarration is required and must be non-empty')
    expect(repairPrompt).not.toContain('not json')
  })

  it('falls back to a safe deterministic beat when model repair still fails progression validation', async () => {
    const messaging = {
      startAgent: jest.fn(async () => undefined),
      createSession: jest.fn(async () => ({ sessionId: 'session-1' })),
      sendSessionMessage: jest.fn(async () => ({} as Response)),
      collectStreamedResponseText: jest.fn()
        .mockResolvedValueOnce({ message: null, text: 'not json' })
        .mockResolvedValueOnce({
          message: null,
          text: '{"speakerInstruction":"Speak","stateSummary":"State","currentObjective":"Follow the bell","openThreads":[],"ttrpgPhase":"exploration"}',
        }),
      deleteSession: jest.fn(async () => undefined),
    }
    const generator = new OfficialGameMasterBeatGenerator(messaging as never)

    const output = await generator.generateBeat({
      gameMasterAgentId: 'gm-runtime-1',
      room: room(),
      tick: tick(),
      participants,
      speaker: participants[0],
      recentMessages: [message()],
      narrativeState: narrativeState(),
    })

    expect(output).toMatchObject({
      gameMasterAgentId: 'gm-runtime-1',
      ttrpgPhase: 'exploration',
      combatReadiness: 'none',
      requestedGameplayAction: null,
      metadata: {
        gmGeneration: expect.objectContaining({
          status: 'repaired',
          repairAttempted: true,
          repaired: false,
          fallbackUsed: true,
          initialErrorCategory: 'missing_json_object',
          repairErrorCategory: 'progression_contract',
          initialResponseLength: 'not json'.length,
          repairResponseLength: expect.any(Number),
        }),
      },
    })
    expect(output.speakerInstruction).toContain('Ash')
    expect(output.stateAfter.openThreads.length).toBeGreaterThan(0)
    expect(messaging.sendSessionMessage).toHaveBeenCalledTimes(2)
  })

  it('does not enter repair when session transport fails before model text is collected', async () => {
    const messaging = {
      startAgent: jest.fn(async () => undefined),
      createSession: jest.fn(async () => ({ sessionId: 'session-1' })),
      sendSessionMessage: jest.fn(async () => ({} as Response)),
      collectStreamedResponseText: jest.fn(async () => {
        throw new Error('stream down')
      }),
      deleteSession: jest.fn(async () => undefined),
    }
    const generator = new OfficialGameMasterBeatGenerator(messaging as never)

    await expect(generator.generateBeat({
      gameMasterAgentId: 'gm-runtime-1',
      room: room(),
      tick: tick(),
      participants,
      speaker: participants[0],
      recentMessages: [message()],
      narrativeState: narrativeState(),
    })).rejects.toThrow('stream down')

    expect(messaging.sendSessionMessage).toHaveBeenCalledTimes(1)
  })

  it('keeps the character prompt unchanged unless narrative context is provided', () => {
    const baseInput = {
      room: room(),
      speaker: participants[0],
      participants,
      recentMessages: [message()],
    }

    const withoutContext = buildOfficialLocationRoomPrompt(baseInput)
    const withContext = buildOfficialLocationRoomPrompt({
      ...baseInput,
      narrativeContext: {
        stateSummary: 'The bell has woken something.',
        currentObjective: 'Answer the toll.',
        openThreads: ['Who first heard it?'],
        speakerInstruction: 'Resist the call, but reveal fear.',
        publicNarration: 'The bell tolls once.',
      },
    })

    expect(withoutContext).not.toContain('Private game-master narrative context')
    expect(withContext).toContain('Private game-master narrative context')
    expect(withContext).toContain('Private instruction for this utterance: Resist the call, but reveal fear.')
  })
})
