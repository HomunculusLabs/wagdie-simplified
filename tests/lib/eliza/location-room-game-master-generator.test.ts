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
  buildGameMasterSceneCheckOutcomePrompt,
  normalizeGameMasterBeatResponse,
  normalizeGameMasterSceneCheckOutcomeResponse,
} from '@/lib/eliza/locationRooms/gameMasterGenerator'
import {
  buildOfficialLocationRoomPrompt,
  normalizeOfficialLocationRoomTurnResponse,
} from '@/lib/eliza/locationRooms/officialTurnGenerator'
import type {
  LocationRoom,
  LocationRoomMessage,
  LocationRoomParticipant,
  LocationRoomTick,
} from '@/lib/eliza/locationRooms/types'
import type { LocationRoomNarrativeState } from '@/lib/eliza/locationRooms/narrativeTypes'
import {
  normalizeSceneCheckRequest,
  resolveSceneCheck,
} from '@/lib/eliza/locationRooms/sceneChecks/rules'
import { projectPublicSceneCheckRolls } from '@/lib/eliza/locationRooms/sceneChecks/publicRolls'

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
      adventure: {
        arcSummary: 'The ash bell tests anyone who follows it.',
        currentStakes: 'The bell may wake the thing below.',
        activeDecision: {
          id: 'bell-choice',
          prompt: 'How do you answer the ash bell?',
          options: [
            { id: 'pull-rope', label: 'Pull the rope', summary: 'Ring first and seize the omen.' },
            { id: 'search-ash', label: 'Search the ash', summary: 'Look for the bell ringer.' },
          ],
        },
        consequenceLedger: [{ id: 'beat-old', source: 'beat:old', summary: 'The bell has already noticed Ash.', status: 'open' }],
        discoveries: ['The ash falls upward near the rope.'],
        clocks: [{ id: 'third-toll', label: 'Third toll', value: 1, max: 6, summary: 'The bell nears a third toll.' }],
        lastDeclaredAction: { tokenId: 1, beatId: 'beat-old', summary: 'Ash listened at the rope.', actionIntent: 'listen' },
        lastOutcome: { kind: 'beat', sourceId: 'beat:old', summary: 'The first toll named the room.' },
      },
      adventureCatalog: {
        defaults: {},
        sections: {
          '20_characters': [{ id: '20.10.bell-keeper', summary: 'A quiet keeper counts each toll.', tags: ['bell', 'keeper'] }],
          '50_items': [{ id: '50.10.ash-rope', summary: 'A rope dusted in upward-falling ash.', tags: ['bell', 'rope'] }],
        },
      },
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
    expect(prompt).toContain('Quiet private adventure memory')
    expect(prompt).toContain('Active decision: bell-choice')
    expect(prompt).toContain('[Earlier context truncated to fit the ElizaOS 4000-character message limit.]')
    expect(prompt).toContain('Return only JSON with this contract')
    expect(prompt).toContain('"ttrpgPhase"')
    expect(prompt).toContain('"adventurePatch"')
    expect(prompt).toContain('Non-aftermath beats must include a concrete currentObjective')
    expect(prompt).toContain('adventurePatch is private continuity memory')
    expect(prompt).toContain('activeDecision is rare')
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
    expect(prompt).toContain('"publicNarration": "required public narration for observers"')
    expect(prompt).toContain('publicNarration is required and must be non-empty')
    expect(prompt).toContain('Opening publicNarration must be a rich table-setting GM beat')
    expect(prompt).toContain('2-3 interactable hooks')
  })

  it('includes optional scene-check request guidance and normalizes sanitized GM requests', () => {
    const prompt = buildGameMasterBeatPrompt({
      gameMasterAgentId: 'gm-1',
      room: room(),
      tick: tick(),
      participants,
      speaker: participants[0],
      recentMessages: [message()],
      narrativeState: narrativeState(),
    })

    expect(prompt).toContain('"sceneCheckRequest": null')
    expect(prompt).toContain('Optional non-combat scene checks')
    expect(prompt).toContain('actionIntent options')
    expect(prompt).toContain('fixed rollChoice.checkType op')
    expect(prompt).toContain('requestedGameplayAction "start_combat"')

    const output = normalizeGameMasterBeatResponse(JSON.stringify({
      publicNarration: 'The ash marks shine under the stair.',
      speakerInstruction: 'Search the ash marks without solving the whole room.',
      stateSummary: 'Ash marks under the stair invite investigation.',
      currentObjective: 'Search the ash marks.',
      openThreads: ['What do the marks hide?'],
      ttrpgPhase: 'exploration',
      combatReadiness: 'none',
      threatLevel: 1,
      requestedGameplayAction: null,
      encounterSeed: null,
      sceneCheckRequest: {
        actionIntent: 'search',
        summary: 'Search the ash marks for a hidden route.',
        contextualChecks: [{ id: 'ash marks', label: 'Read the Ash Marks', checkType: 'history', dc: 99 }],
        rollChoice: { source: 'contextual', contextualCheckId: 'ash-marks' },
        difficulty: 'hard',
      },
      adventurePatch: {
        currentStakes: 'The ash may reveal a route before the watcher moves.',
        discoveries: ['The ash marks point below the stair.'],
        clockUpdates: [{ id: 'watcher', label: 'Watcher attention', value: 2, max: 6, summary: 'The watcher notices careful searches.' }],
      },
      selectedSpeakerTokenId: 1,
    }), { participants, speaker: participants[0] }, { gameMasterAgentId: 'gm-1', limits })

    expect(output.sceneCheckRequest).toEqual(expect.objectContaining({
      source: 'game_master',
      actionIntent: 'search',
      gameplayActionType: 'investigate',
      difficulty: 'hard',
      contextualChecks: [expect.objectContaining({ id: 'ash-marks', dc: 20 })],
      rollChoice: expect.objectContaining({ source: 'contextual', contextualCheckId: 'ash-marks', checkType: 'history' }),
    }))
    expect(output.metadata.sceneCheck).toEqual(expect.objectContaining({
      request: output.sceneCheckRequest,
      proposal: null,
      proposalError: null,
    }))
    expect(output.adventurePatch).toEqual(expect.objectContaining({
      currentStakes: 'The ash may reveal a route before the watcher moves.',
      discoveries: ['The ash marks point below the stair.'],
      clocks: [expect.objectContaining({ id: 'watcher', value: 2, max: 6 })],
    }))
    expect(output.metadata.adventurePatch).toEqual(output.adventurePatch)

    expect(() => normalizeGameMasterBeatResponse(JSON.stringify({
      speakerInstruction: 'Search.',
      stateSummary: 'State.',
      currentObjective: 'Search.',
      openThreads: ['What hides?'],
      ttrpgPhase: 'exploration',
      sceneCheckRequest: { actionIntent: 'search', rollChoice: { source: 'fixed', checkType: 'unsupported_check' } },
    }), { participants, speaker: participants[0] }, { gameMasterAgentId: 'gm-1', limits })).toThrow('sceneCheckRequest')

    expect(() => normalizeGameMasterBeatResponse(JSON.stringify({
      speakerInstruction: 'Fight.',
      stateSummary: 'State.',
      currentObjective: 'Survive.',
      openThreads: ['What attacks?'],
      ttrpgPhase: 'threat',
      combatReadiness: 'ready',
      threatLevel: 4,
      requestedGameplayAction: 'start_combat',
      encounterSeed: { title: 'Bell Horror' },
      sceneCheckRequest: { actionIntent: 'search', rollChoice: { source: 'fixed', checkType: 'perception' } },
    }), { participants, speaker: participants[0] }, { gameMasterAgentId: 'gm-1', limits })).toThrow('must not combine')
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
      '{"publicNarration":"The ash parts around a hidden stair.","speakerInstruction":"Choose whether to descend.","stateSummary":"A hidden stair opens.","currentObjective":"Explore the stair","openThreads":["What waits?"],"ttrpgPhase":"exploration","combatReadiness":"none","threatLevel":0,"requestedGameplayAction":null,"adventurePatch":{"currentStakes":"The stair may close if ignored."}}',
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
      '{"publicNarration":"The bell answers only careful movement as ash lifts from a hidden latch.","speakerInstruction":"Speak","stateSummary":"State","currentObjective":"Follow the bell","openThreads":["Who waits?"],"ttrpgPhase":"exploration","adventurePatch":{"discoveries":["The bell answers only careful movement."]}}',
      { participants, speaker: participants[0] },
      { gameMasterAgentId: 'gm-1', limits, progressionContext: optionalNarrationContext }
    )
    expect(optional.publicNarration).toBe('The bell answers only careful')
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
      '{"speakerInstruction":"Speak","stateSummary":"State","currentObjective":"Follow the bell","openThreads":["Who waits?"],"ttrpgPhase":"exploration"}',
      { participants, speaker: participants[0] },
      { gameMasterAgentId: 'gm-1', limits }
    )).toThrow('story pressure')

    expect(() => normalizeGameMasterBeatResponse(
      '{"speakerInstruction":"Speak","stateSummary":"State","currentObjective":"Follow the bell","openThreads":["Who waits?"],"ttrpgPhase":"exploration","adventurePatch":{"currentStakes":"The bell will choose soon."}}',
      { participants, speaker: participants[0] },
      { gameMasterAgentId: 'gm-1', limits }
    )).toThrow('narrated story pressure')

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
          text: '{"publicNarration":"The bell tolls under ash and the floorboards answer with a new path.","speakerInstruction":"Speak with dread.","stateSummary":"The bell has called Ash.","currentObjective":"Answer the toll.","openThreads":["Who answers the bell?"],"adventurePatch":{"currentStakes":"The toll is choosing who answers."},"selectedSpeakerTokenId":1}',
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
          text: JSON.stringify({ publicNarration: richOpeningNarration, speakerInstruction: 'Speak with dread, choose one of the three hooks, and leave the mystery unresolved.', stateSummary: 'The bell has called Ash.', currentObjective: 'Answer the toll.', openThreads: ['Who answers the bell?'], ttrpgPhase: 'exploration', combatReadiness: 'none', threatLevel: 0, requestedGameplayAction: null, encounterSeed: null, adventurePatch: { currentStakes: 'The toll demands an answer before the room quiets.' }, selectedSpeakerTokenId: 1 }),
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
    expect(repairPrompt).toContain('Return only JSON with this contract')
    expect(repairPrompt).toContain('selectedSpeakerTokenId must be 1')
    expect(repairPrompt).toContain('Non-aftermath beats must include a concrete currentObjective')
    expect(repairPrompt).toContain('"publicNarration": "required public narration for observers"')
    expect(repairPrompt).toContain('"adventurePatch"')
    expect(repairPrompt).toContain('narrated story pressure')
    expect(repairPrompt).toContain('activeDecision is rare')
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
    expect(output.adventurePatch).toEqual(expect.objectContaining({
      currentStakes: expect.any(String),
      lastOutcome: expect.objectContaining({ kind: 'beat' }),
    }))
    expect(output.adventurePatch.activeDecision).toBeUndefined()
    expect(output.metadata.adventurePatch).toEqual(output.adventurePatch)
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

  it('prompts and normalizes optional character scene-check proposals with prose fallback', () => {
    const request = normalizeSceneCheckRequest({
      actionIntent: 'search',
      summary: 'Search the ash marks for a hidden route.',
      contextualChecks: [{ id: 'ash-marks', label: 'Read the Ash Marks', checkType: 'history', dc: 16 }],
      rollChoice: { source: 'contextual', contextualCheckId: 'ash-marks' },
    })
    if (!request.ok) throw new Error(request.error)
    const sceneCheckContext = {
      mode: 'requested' as const,
      request: request.value,
      contextualChecks: request.value.contextualChecks,
    }
    const baseInput = {
      room: room(),
      speaker: participants[0],
      participants,
      recentMessages: [message()],
      narrativeContext: {
        stateSummary: 'The bell has woken something.',
        currentObjective: 'Answer the toll.',
        openThreads: ['Who first heard it?'],
        speakerInstruction: 'Search the marks, but leave the omen uncertain.',
        publicNarration: 'The ash marks shine.',
        sceneCheck: sceneCheckContext,
      },
    }

    const prompt = buildOfficialLocationRoomPrompt(baseInput)
    expect(prompt).toContain('Return JSON only with this contract')
    expect(prompt).toContain('"publicSpeech"')
    expect(prompt).toContain('"declaredAction"')
    expect(prompt).toContain('"sceneCheckProposal": null')
    expect(prompt).toContain('ash-marks: Read the Ash Marks')

    const prose = normalizeOfficialLocationRoomTurnResponse('I kneel beside the ash and listen before touching it.', {
      sceneCheckContext,
    })
    expect(prose).toEqual({
      content: 'I kneel beside the ash and listen before touching it.',
      declaredAction: { summary: 'I kneel beside the ash and listen before touching it.' },
      sceneCheckProposal: null,
      sceneCheckProposalError: null,
    })

    const valid = normalizeOfficialLocationRoomTurnResponse(JSON.stringify({
      publicSpeech: 'These marks remember a path beneath us.',
      declaredAction: { summary: 'Interpret the ash marks without disturbing them.', actionIntent: 'recall_lore' },
      sceneCheckProposal: {
        actionIntent: 'recall_lore',
        intentSummary: 'Interpret the ash marks without disturbing them.',
        rollChoice: { source: 'contextual', contextualCheckId: 'ash-marks' },
      },
    }), { sceneCheckContext })
    expect(valid.content).toBe('These marks remember a path beneath us.')
    expect(valid.declaredAction).toEqual({
      summary: 'Interpret the ash marks without disturbing them.',
      actionIntent: 'recall_lore',
    })
    expect(valid.sceneCheckProposal).toEqual(expect.objectContaining({
      actionIntent: 'recall_lore',
      rollChoice: expect.objectContaining({ source: 'contextual', contextualCheckId: 'ash-marks', checkType: 'history' }),
    }))
    expect(valid.sceneCheckProposalError).toBeNull()

    const invalid = normalizeOfficialLocationRoomTurnResponse(JSON.stringify({
      publicSpeech: 'I force the ash to answer.',
      sceneCheckProposal: {
        actionIntent: 'invent_spell',
        rollChoice: { source: 'fixed', checkType: 'arcana' },
      },
    }), { sceneCheckContext })
    expect(invalid).toEqual({
      content: 'I force the ash to answer.',
      declaredAction: { summary: 'I force the ash to answer.' },
      sceneCheckProposal: null,
      sceneCheckProposalError: 'Unsupported scene-check action intent',
    })

    const missingSpeech = normalizeOfficialLocationRoomTurnResponse(JSON.stringify({
      sceneCheckProposal: {
        actionIntent: 'search',
        rollChoice: { source: 'fixed', checkType: 'perception' },
      },
    }), { sceneCheckContext })
    expect(missingSpeech.content).toBe('')
    expect(missingSpeech.declaredAction).toBeNull()
    expect(missingSpeech.sceneCheckProposal).toEqual(expect.objectContaining({
      actionIntent: 'search',
    }))
  })

  it('prompts and normalizes scene-check outcome narration from backend roll facts only', () => {
    const request = normalizeSceneCheckRequest({
      actionIntent: 'search',
      rollChoice: { source: 'fixed', checkType: 'perception' },
    })
    if (!request.ok) throw new Error(request.error)
    const resolution = resolveSceneCheck({
      adjudication: {
        decision: 'run',
        source: 'game_master',
        adjudicationSource: 'game_master',
        requestSource: 'game_master',
        reason: 'gm_request',
        actorTokenId: 1,
        actorName: 'Ash',
        actionIntent: request.value.actionIntent,
        gameplayActionType: request.value.gameplayActionType,
        rollChoice: request.value.rollChoice,
        contextualChecks: request.value.contextualChecks,
        difficulty: request.value.difficulty,
        request: request.value,
        proposal: null,
      },
      rng: () => 0.69,
    })
    const publicRolls = projectPublicSceneCheckRolls(resolution, { sceneCheckId: 'scene_check:beat-1' })
    const outcomeInput = {
      gameMasterAgentId: 'gm-1',
      room: room(),
      tick: tick(),
      participants,
      speaker: participants[0],
      recentMessages: [message()],
      narrativeState: narrativeState(),
      characterAction: 'I search the ash marks for the hidden route.',
      sceneCheckId: 'scene_check:beat-1',
      resolution,
      publicRolls,
    }

    const prompt = buildGameMasterSceneCheckOutcomePrompt(outcomeInput)

    expect(prompt).toContain('Backend-computed roll facts')
    expect(prompt).toContain('Total:')
    expect(prompt).toContain('DC:')
    expect(prompt).toContain('Outcome tier:')
    expect(prompt).toContain('Use only the backend roll facts')
    expect(prompt).toContain('Tier rules for adventurePatch')
    expect(prompt).toContain('partial_success: progress plus complication')
    expect(prompt).toContain('Do not invent, alter, or mention different dice, DCs, HP, damage, rewards, death, finality')

    const output = normalizeGameMasterSceneCheckOutcomeResponse(JSON.stringify({
      publicNarration: 'The ash parts enough to show a stair, but the sound below notices Ash.',
      stateSummary: 'Ash found a hidden stair under the ash marks.',
      currentObjective: 'Decide whether to descend the stair.',
      openThreads: ['What heard Ash below?'],
      adventurePatch: {
        consequence: {
          id: 'ash-stair-result',
          summary: 'The hidden stair opens, but the sound below has noticed Ash.',
          status: 'complication',
          tier: resolution.roll.tier,
        },
        discoveries: ['A hidden stair lies under the ash marks.'],
      },
    }), outcomeInput, { gameMasterAgentId: 'gm-1', limits })

    expect(output).toEqual(expect.objectContaining({
      gameMasterAgentId: 'gm-1',
      publicNarration: 'The ash parts enough to show a',
      stateAfter: expect.objectContaining({
        stateSummary: 'Ash found a hidden stair under the ash m',
        currentObjective: 'Decide whether to descend the stair.',
        openThreads: ['What heard A'],
      }),
      adventurePatch: expect.objectContaining({
        consequenceLedger: [expect.objectContaining({
          id: 'ash-stair-result',
          source: 'scene_check:beat-1',
          tier: resolution.roll.tier,
        })],
      }),
    }))
    expect(output.metadata.adventurePatch).toEqual(output.adventurePatch)

    expect(() => normalizeGameMasterSceneCheckOutcomeResponse(JSON.stringify({
      publicNarration: 'It changes.',
      stateSummary: 'State.',
      currentObjective: 'Continue.',
      openThreads: [],
    }), outcomeInput, { gameMasterAgentId: 'gm-1', limits })).toThrow('openThreads')

    const tiers = ['critical_success', 'success', 'partial_success', 'failure', 'critical_failure'] as const
    for (const tier of tiers) {
      const tierInput = {
        ...outcomeInput,
        resolution: {
          ...resolution,
          roll: { ...resolution.roll, tier },
        },
      }
      const tierPatch = tier === 'critical_success' || tier === 'success'
        ? { discoveries: [`${tier} reveals the safer route.`] }
        : { consequence: { summary: `${tier} leaves a durable complication.`, status: 'complication', tier } }
      const tierOutput = normalizeGameMasterSceneCheckOutcomeResponse(JSON.stringify({
        publicNarration: 'The roll result changes the room.',
        stateSummary: 'The room changed after the roll.',
        currentObjective: 'Answer the changed room.',
        openThreads: ['What changes next?'],
        adventurePatch: tierPatch,
      }), tierInput, { gameMasterAgentId: 'gm-1', limits: { ...limits, publicNarrationMaxLength: 120 } })
      expect(tierOutput.adventurePatch).toBeTruthy()
    }

    const failureInput = {
      ...outcomeInput,
      resolution: { ...resolution, roll: { ...resolution.roll, tier: 'failure' as const } },
    }
    expect(() => normalizeGameMasterSceneCheckOutcomeResponse(JSON.stringify({
      publicNarration: 'The roll result changes the room.',
      stateSummary: 'The room changed after the roll.',
      currentObjective: 'Answer the changed room.',
      openThreads: ['What changes next?'],
      adventurePatch: { discoveries: ['A clue appears without a cost.'] },
    }), failureInput, { gameMasterAgentId: 'gm-1', limits: { ...limits, publicNarrationMaxLength: 120 } })).toThrow('consequence')
  })

  it('keeps the character prompt unchanged unless narrative context is provided', () => {
    const baseInput = {
      room: room(),
      speaker: participants[0],
      participants,
      recentMessages: [message()],
    }

    const withoutContext = buildOfficialLocationRoomPrompt(baseInput)
    const activeDecision = {
      id: 'bell-choice',
      prompt: 'How do you answer the ash bell?',
      options: [
        { id: 'pull-rope', label: 'Pull the rope' },
        { id: 'search-ash', label: 'Search the ash' },
      ],
    }
    const withContext = buildOfficialLocationRoomPrompt({
      ...baseInput,
      narrativeContext: {
        stateSummary: 'The bell has woken something.',
        currentObjective: 'Answer the toll.',
        openThreads: ['Who first heard it?'],
        speakerInstruction: 'Resist the call, but reveal fear.',
        publicNarration: 'The bell tolls once.',
        activeDecision,
      },
    })

    expect(withoutContext).not.toContain('Private game-master narrative context')
    expect(withoutContext).toContain('Write exactly one short in-world utterance')
    expect(withContext).toContain('Private game-master narrative context')
    expect(withContext).toContain('Private instruction for this utterance: Resist the call, but reveal fear.')
    expect(withContext).toContain('Active visible decision:')
    expect(withContext).toContain('pull-rope: Pull the rope')
    expect(withContext).toContain('"declaredAction"')
    expect(withContext).toContain('Do not include sceneCheckProposal because there is no scene-check context.')

    expect(normalizeOfficialLocationRoomTurnResponse('Plain speech.')).toEqual({
      content: 'Plain speech.',
      declaredAction: null,
      sceneCheckProposal: null,
      sceneCheckProposalError: null,
    })

    const structured = normalizeOfficialLocationRoomTurnResponse(JSON.stringify({
      publicSpeech: 'The rope knows my hand.',
      declaredAction: { summary: 'Pull the rope before the third toll.', chosenOptionId: 'pull-rope', actionIntent: 'choose' },
      sceneCheckProposal: { actionIntent: 'search', rollChoice: { source: 'fixed', checkType: 'perception' } },
    }), { narrativeContext: true, activeDecision })
    expect(structured).toEqual({
      content: 'The rope knows my hand.',
      declaredAction: { summary: 'Pull the rope before the third toll.', chosenOptionId: 'pull-rope', chosenOptionLabel: 'Pull the rope', actionIntent: 'choose' },
      sceneCheckProposal: null,
      sceneCheckProposalError: null,
    })

    const proseFallback = normalizeOfficialLocationRoomTurnResponse('I watch the rope but do not touch it yet.', {
      narrativeContext: true,
      activeDecision,
    })
    expect(proseFallback.declaredAction).toEqual({ summary: 'I watch the rope but do not touch it yet.' })

    const invalidDeclaredAction = normalizeOfficialLocationRoomTurnResponse(JSON.stringify({
      publicSpeech: 'I will not name the chain.',
      declaredAction: { summary: 'Track wallet 0x1234567890123456789012345678901234567890', chosenOptionId: 'secret' },
    }), { narrativeContext: true, activeDecision })
    expect(invalidDeclaredAction).toEqual({
      content: 'I will not name the chain.',
      declaredAction: { summary: 'I will not name the chain.' },
      sceneCheckProposal: null,
      sceneCheckProposalError: null,
    })
  })
})
