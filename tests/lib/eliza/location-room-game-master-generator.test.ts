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
    metadata: {},
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
    expect(prompt).toContain('Return only a JSON object')
  })

  it('normalizes fenced JSON and caps public/state/thread values', () => {
    const output = normalizeGameMasterBeatResponse(
      '```json\n{"publicNarration":"The ash bell tolls beyond the ruined gate.","speakerInstruction":"Answer the bell without solving it.","stateSummary":"The bell is now louder near the ruined gate and the room is wary.","currentObjective":"Follow the sound","openThreads":["Who rings the bell?","What waits below?","extra"],"featuredTokenIds":[1,2],"selectedSpeakerTokenId":1}\n```',
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
    })
    expect(output.metadata.featuredTokenIds).toEqual([1, 2])

    const noThreads = normalizeGameMasterBeatResponse(
      '{"speakerInstruction":"Speak","stateSummary":"State","openThreads":["ignored"]}',
      { participants, speaker: participants[0] },
      { gameMasterAgentId: 'gm-1', limits: { ...limits, openThreadsMaxCount: 0 } }
    )
    expect(noThreads.stateAfter.openThreads).toEqual([])
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

  it('uses the input game-master agent id with room-scoped session and message metadata', async () => {
    const messaging = {
      startAgent: jest.fn(async () => undefined),
      createSession: jest.fn(async () => ({ sessionId: 'session-1' })),
      sendSessionMessage: jest.fn(async () => ({} as Response)),
      collectStreamedResponseText: jest.fn(async () => ({
        message: null,
        text: '{"publicNarration":"The bell tolls.","speakerInstruction":"Speak with dread.","stateSummary":"The bell has called Ash.","openThreads":[],"selectedSpeakerTokenId":1}',
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
    expect(messaging.deleteSession).toHaveBeenCalledWith('session-1')
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
