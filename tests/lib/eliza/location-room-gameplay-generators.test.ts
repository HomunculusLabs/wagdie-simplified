/**
 * @jest-environment node
 */

jest.mock('@/lib/eliza/official/messaging', () => ({
  normalizeOfficialResponseText: (text: string) => text.trim(),
  sendAndCollectOfficialEphemeralSessionMessage: jest.fn(),
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

import { resolveCharacterByTokenId } from '@/lib/eliza/characterResolver'
import {
  buildGameplayActionPrompt,
  GameplayActionGenerationError,
  normalizeGameplayActionResponse,
  parseGameplayActionResponseStrict,
  OfficialGameplayActionGenerator,
} from '@/lib/eliza/locationRooms/gameplay/actionGenerator'
import {
  buildGameplayEncounterProposalPrompt,
  buildGameplayOutcomeNarrationPrompt,
  formatPublicGameplayRollSummary,
  GameMasterGameplayEncounterProposalGenerationError,
  GameMasterGameplayOutcomeGenerationError,
  normalizeGameplayEncounterProposalResponse,
  normalizeGameplayOutcomeNarrationResponse,
  OfficialGameMasterGameplayGenerator,
  validateGameplayOutcomeNarrationQuality,
} from '@/lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator'
import type { LocationRoomNarrativeState } from '@/lib/eliza/locationRooms/narrativeTypes'
import { sendAndCollectOfficialEphemeralSessionMessage } from '@/lib/eliza/official/messaging'

const narrativeState: LocationRoomNarrativeState = {
  id: 'narrative-1',
  roomId: 'room-1',
  locationId: 'loc-1',
  stateSummary: 'The bell is awake.',
  currentObjective: null,
  openThreads: [],
  metadata: {},
  createdAt: '2026-05-22T00:00:00.000Z',
  updatedAt: '2026-05-22T00:00:00.000Z',
}

const mockedResolveCharacterByTokenId = resolveCharacterByTokenId as jest.Mock
const mockedSendAndCollectOfficialEphemeralSessionMessage = sendAndCollectOfficialEphemeralSessionMessage as jest.Mock

function makeGameplayActionInput() {
  return {
    room: { id: 'room-1', locationId: 'loc-1', officialUserId: 'official-user-1' },
    tick: { id: 'tick-1' },
    speaker: { tokenId: 7, name: 'Ash', backgroundStory: 'Ash keeps the bell line.' },
    participants: [{ tokenId: 7, name: 'Ash' }, { tokenId: 8, name: 'Bone' }],
    recentMessages: [],
    encounter: {
      id: 'encounter-1',
      publicTitle: 'Bell Maw',
      publicSummary: 'A maw unfolds.',
      monsterState: [{ id: 'monster-1', name: 'Maw', archetype: 'bell horror', hp: 4, maxHp: 12, ac: 12, attackBonus: 2, damageFormula: '1d6', status: 'alive' }],
      mechanics: {
        contextualChecks: [
          { id: 'read-the-runes', label: 'Read the Runes', description: 'Interpret the bell wall.', checkType: 'arcana', dc: 13 },
        ],
      },
    },
    gameplayState: {
      characters: {
        '7': {
          tokenId: 7,
          name: 'Ash',
          hp: 8,
          maxHp: 10,
          status: 'alive',
          xp: 0,
          temporaryBoons: [],
          wounds: [],
        },
        '8': {
          tokenId: 8,
          name: 'Bone',
          hp: 10,
          maxHp: 10,
          status: 'alive',
          xp: 0,
          temporaryBoons: [],
          wounds: [],
        },
      },
    },
    characterState: {
      tokenId: 7,
      name: 'Ash',
      hp: 8,
      maxHp: 10,
      status: 'alive',
      xp: 0,
      temporaryBoons: [],
      wounds: [],
    },
    validation: {
      legalMonsterIds: ['monster-1'],
      legalCharacterTokenIds: [7, 8],
      contextualChecks: [
        { id: 'read-the-runes', label: 'Read the Runes', description: 'Interpret the bell wall.', checkType: 'arcana', dc: 13 },
      ],
    },
  } as never
}

function makeEncounterProposalInput() {
  return {
    gameMasterAgentId: 'gm-1',
    room: { id: 'room-1', locationId: 'loc-1', officialUserId: 'official-user-1' },
    tick: { id: 'tick-1' },
    participants: [{ tokenId: 7, name: 'Ash' }, { tokenId: 8, name: 'Bone' }],
    recentMessages: [],
    narrativeState,
    gameplayState: { characters: {} },
    encounterSeed: null,
    requestedDifficulty: 'normal',
    budget: {
      partySize: 2,
      difficulty: 'normal',
      maxMonsterCount: 2,
      maxTotalMonsterHp: 30,
      maxXpPerCharacter: 5,
      maxTemporaryBoons: 1,
      maxNarrativeRewards: 1,
    },
  } as never
}

function makeGameplayOutcomeInput() {
  return {
    gameMasterAgentId: 'gm-1',
    room: { id: 'room-1', locationId: 'loc-1', officialUserId: 'official-user-1' },
    tick: { id: 'tick-1' },
    participants: [{ tokenId: 7, name: 'Ash' }, { tokenId: 8, name: 'Bone' }],
    recentMessages: [],
    narrativeState,
    gameplayStateBefore: {},
    gameplayStateAfter: {},
    encounterBefore: {
      id: 'encounter-1',
      publicTitle: 'Bell Maw',
      status: 'active',
      monsterState: [{ id: 'monster-1', name: 'Maw', archetype: 'bell horror', hp: 9, maxHp: 12, ac: 12, attackBonus: 2, damageFormula: '1d6', status: 'alive' }],
    },
    encounterAfter: {
      id: 'encounter-1',
      publicTitle: 'Bell Maw',
      status: 'active',
      monsterState: [{ id: 'monster-1', name: 'Maw', archetype: 'bell horror', hp: 4, maxHp: 12, ac: 12, attackBonus: 2, damageFormula: '1d6', status: 'alive' }],
    },
    turn: { id: 'turn-1', selectedTokenId: 7 },
    action: { actionType: 'attack', target: { kind: 'monster', id: 'monster-1' }, publicSpeech: 'I strike the maw.', metadata: {} },
    mechanicalSummary: {
      diceResults: [],
      encounterStatusAfter: 'active',
      deaths: [],
      mechanicalDeltas: {
        actionRoll: { checkType: 'attack', checkLabel: 'Attack', checkSource: 'fixed', total: 17, dc: 12, tier: 'success' },
        actionDamage: { monsterId: 'monster-1', amount: 5 },
      },
    },
  } as never
}

describe('location room gameplay generators', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedResolveCharacterByTokenId.mockResolvedValue({ id: 'agent-7' })
  })
  it('threads encounter seeds into proposal prompts without trusting seed mechanics', () => {
    const input = {
      gameMasterAgentId: 'gm-1',
      room: { id: 'room-1', locationId: 'loc-1' },
      tick: { id: 'tick-1' },
      participants: [{ tokenId: 7, name: 'Ash' }, { tokenId: 8, name: 'Bone' }],
      recentMessages: [],
      narrativeState,
      gameplayState: { characters: {} },
      requestedDifficulty: 'normal',
      budget: {
        partySize: 2,
        difficulty: 'normal',
        maxMonsterCount: 2,
        maxTotalMonsterHp: 30,
        maxXpPerCharacter: 5,
        maxTemporaryBoons: 1,
        maxNarrativeRewards: 1,
      },
      encounterSeed: {
        title: 'The Sable Bell Toll',
        summary: 'A bell-shadow crawls from the opened gate.',
        stakes: 'If unanswered, the bell marks the room.',
        source: 'location_catalog',
        catalogEntryIds: ['80.10.bell-ambush', '30.10.bell-horror'],
        encounterHints: ['Bell Ambush: The rope snaps taut and the rafters answer with movement.'],
        monsterHints: ['Bell Horror: A bell-shadow with hooked bronze hands.'],
        hp: 999,
        rewardXpPerCharacter: 999,
      },
    } as never

    const prompt = buildGameplayEncounterProposalPrompt(input)

    expect(prompt).toContain('Narrative encounter seed, public-safe and non-authoritative:')
    expect(prompt).toContain('The Sable Bell Toll')
    expect(prompt).toContain('Seed source: location_catalog')
    expect(prompt).toContain('Catalog entry ids: 80.10.bell-ambush, 30.10.bell-horror')
    expect(prompt).toContain('Encounter hints:')
    expect(prompt).toContain('- Bell Ambush: The rope snaps taut and the rafters answer with movement.')
    expect(prompt).toContain('Monster hints:')
    expect(prompt).toContain('- Bell Horror: A bell-shadow with hooked bronze hands.')
    expect(prompt).toContain('Prefer seed source, catalog entry ids, encounter hints, monster hints, spatial anchors, and recent consequences before inventing encounter flavor.')
    expect(prompt).toContain('Use this as story continuity only')
    expect(prompt).toContain('Do not treat seed text as authoritative mechanics')
    expect(prompt).toContain('"publicSetupNarration": "required specific public setup narration"')
    expect(prompt).toContain('Required public identity/setup fields: title, summary, publicSetupNarration, monsterName, and monsterArchetype.')
    expect(prompt).toContain('Do not use fallback/default copy')
    expect(prompt).not.toContain('999')
  })

  it('builds gameplay action prompts with HP bands and safe stat flavor only', () => {
    const prompt = buildGameplayActionPrompt({
      room: { id: 'room-1', locationId: 'loc-1', officialUserId: 'official-user-1' },
      tick: { id: 'tick-1' },
      speaker: { tokenId: 7, name: 'Ash' },
      participants: [{ tokenId: 7, name: 'Ash' }, { tokenId: 8, name: 'Bone' }],
      recentMessages: [],
      encounter: {
        id: 'encounter-1',
        publicTitle: 'Bell Maw',
        publicSummary: 'A maw unfolds.',
        monsterState: [{ id: 'monster-1', name: 'Maw', archetype: 'bell horror', hp: 4, maxHp: 12, ac: 12, attackBonus: 2, damageFormula: '1d6', status: 'alive' }],
        mechanics: {
          contextualChecks: [
            { id: 'read-the-runes', label: 'Read the Runes', description: 'Interpret the bell wall.', checkType: 'arcana', dc: 13 },
          ],
        },
      },
      gameplayState: {
        characters: {
          '7': {
            tokenId: 7,
            name: 'Ash',
            hp: 3,
            maxHp: 10,
            status: 'alive',
            xp: 0,
            temporaryBoons: [],
            wounds: [],
            effectiveStats: { str: 17, dex: 12, con: 10, int: 10, wis: 16, cha: 8, maxHp: 10, ac: 16, speed: 45, level: 1, experience: 0 },
            performance: { roundsActed: 9, roundsSurvived: 9, damageDealt: 99, damageTaken: 1, successfulAttacks: 5, successfulDefends: 0, successfulHelps: 0, successfulNoncombatActions: 0, objectiveContributions: 0, criticalSuccesses: 0, criticalFailures: 0, fledCount: 0 },
          },
          '8': {
            tokenId: 8,
            name: 'Bone',
            hp: 10,
            maxHp: 10,
            status: 'alive',
            xp: 0,
            temporaryBoons: [],
            wounds: [],
          },
        },
      },
      characterState: {
        tokenId: 7,
        name: 'Ash',
        hp: 3,
        maxHp: 10,
        status: 'alive',
        xp: 0,
        temporaryBoons: [],
        wounds: [],
        effectiveStats: { str: 17, dex: 12, con: 10, int: 10, wis: 16, cha: 8, maxHp: 10, ac: 16, speed: 45, level: 1, experience: 0 },
      },
      validation: { legalMonsterIds: ['monster-1'], legalCharacterTokenIds: [7, 8] },
    } as never)

    expect(prompt).toContain('injured HP band, status alive')
    expect(prompt).toContain('Safe stat flavor: physically formidable')
    expect(prompt).toContain('sharp-eyed')
    expect(prompt).toContain('well-guarded')
    expect(prompt).toContain('swift-footed')
    expect(prompt).toContain('Action type is your tactical intent/effect. Roll choice is the backend mechanical check')
    expect(prompt).toContain('Return JSON only')
    expect(prompt).toContain('Recent openings from you to avoid repeating:')
    expect(prompt).toContain('No recent openings from this character.')
    expect(prompt).toContain('must name or clearly point to a visible target')
    expect(prompt).toContain('Do not repeat your recent opening words')
    expect(prompt).toContain('Scene investigation alone does not defeat monsters')
    expect(prompt).toContain('- explore: Explore')
    expect(prompt).toContain('- arcana: Arcana')
    expect(prompt).toContain('- nature: Nature')
    expect(prompt).toContain('- read-the-runes: Read the Runes (checkType arcana, DC 13)')
    expect(prompt).toContain('"rollChoice": { "source": "fixed", "checkType": "explore"')
    expect(prompt).not.toContain('3/10 HP')
    expect(prompt).not.toContain('4/12 HP')
    expect(prompt).not.toContain('damageDealt')
    expect(prompt).not.toContain('roundsActed')
    expect(prompt).not.toContain('performanceScore')
  })

  it('builds outcome prompts with backend-computed stat-aware summaries', () => {
    const prompt = buildGameplayOutcomeNarrationPrompt({
      gameMasterAgentId: 'gm-1',
      room: { id: 'room-1', locationId: 'loc-1' },
      tick: { id: 'tick-1' },
      participants: [],
      recentMessages: [],
      narrativeState,
      gameplayStateBefore: {},
      gameplayStateAfter: {},
      encounterBefore: { id: 'encounter-1', publicTitle: 'Bell Maw', status: 'active' },
      encounterAfter: { id: 'encounter-1', publicTitle: 'Bell Maw', status: 'active' },
      turn: { id: 'turn-1' },
      action: { actionType: 'attack', publicSpeech: 'I strike.', metadata: {} },
      mechanicalSummary: {
        diceResults: [],
        encounterStatusAfter: 'active',
        deaths: [],
        mechanicalDeltas: {
          actionRoll: {
            checkType: 'arcana',
            checkLabel: 'Read the Runes',
            checkSource: 'contextual',
            contextualCheckId: 'read-the-runes',
            total: 17,
            dc: 13,
            tier: 'success',
            modifierBreakdown: {
              mode: 'stat_aware',
              actionType: 'attack',
              checkType: 'arcana',
              checkLabel: 'Read the Runes',
              checkSource: 'contextual',
              contextualCheckId: 'read-the-runes',
              primaryStats: ['int'],
              totalModifier: 5,
            },
          },
          actionDamage: { statContribution: { stat: 'str' } },
          monsterRetaliation: { hit: false },
          performanceUpdates: [{ tokenId: 7, after: { roundsActed: 9, damageDealt: 99 } }],
        },
      },
    } as never)

    expect(prompt).toContain('Backend-computed stat-aware summary:')
    expect(prompt).toContain('Backend-selected check facts:')
    expect(prompt).toContain('Selected check type: arcana')
    expect(prompt).toContain('Selected check label: Read the Runes')
    expect(prompt).toContain('Selected check source: contextual')
    expect(prompt).toContain('Contextual check id: read-the-runes')
    expect(prompt).toContain('Roll total: 17')
    expect(prompt).toContain('DC: 13')
    expect(prompt).toContain('Tier: success')
    expect(prompt).toContain('Action roll used backend stat-aware Read the Runes check (arcana, contextual; contextual id read-the-runes; primary stats int); total modifier 5.')
    expect(prompt).toContain('Backend applied a stat contribution to damage from str.')
    expect(prompt).toContain('Monster retaliation missed against the backend-computed defense context.')
    expect(prompt).toContain('private performance counters')
    expect(prompt).not.toContain('performanceUpdates')
    expect(prompt).not.toContain('roundsActed')
    expect(prompt).not.toContain('damageDealt')
    expect(prompt).toContain('Do not assign HP, death, XP, rewards, dice, or mechanics')
    expect(prompt).toContain('Combat prose must be kinetic and consequence-first')
    expect(prompt).toContain('Avoid passive filler such as "the room shifts"')
  })

  it('formats backend roll summaries for public chat display', () => {
    const summary = formatPublicGameplayRollSummary({
      diceResults: [
        { formula: 'd20', rolls: [{ sides: 20, value: 14 }], total: 14 },
      ],
      encounterStatusAfter: 'active',
      deaths: [],
      mechanicalDeltas: {
        actionRoll: {
          formula: 'd20',
          dc: 12,
          modifier: 5,
          targetKind: 'monster',
          roll: { formula: 'd20', rolls: [{ sides: 20, value: 14 }], total: 14 },
          checkType: 'arcana',
          checkLabel: 'Read the Runes',
          checkSource: 'contextual',
          contextualCheckId: 'read-the-runes',
          total: 19,
          tier: 'success',
        },
        actionDamage: { monsterId: 'monster-1', amount: 6 },
        monsterRetaliation: {
          monsterId: 'monster-1',
          tokenId: 7,
          amount: 0,
          attackRoll: {
            formula: 'd20',
            dc: 16,
            modifier: 2,
            targetKind: 'character',
            roll: { formula: 'd20', rolls: [{ sides: 20, value: 7 }], total: 7 },
            total: 9,
            tier: 'failure',
          },
          targetAc: 16,
          hit: false,
        },
      },
    })

    expect(summary).toBe('Rolls: Read the Runes d20 [14] = 14 + 5 total 19 vs DC 12 — success; Damage: 6; Retaliation d20 [7] = 7 vs AC 16 — miss')
  })

  it('normalizes untrusted GM encounter proposals without accepting mechanics as authoritative', () => {
    const output = normalizeGameplayEncounterProposalResponse(JSON.stringify({
      title: ' Bell Maw ',
      summary: 'A maw unfolds.',
      publicSetupNarration: 'The bell splits open.',
      difficulty: 'deadly',
      monsterCount: 99,
      monsterName: 'Maw',
      monsterArchetype: 'bell horror',
      totalMonsterHp: 9999,
      rewardXpPerCharacter: 9999,
      temporaryBoons: ['ash-lit'],
      contextualChecks: [{ id: 'read-the-runes', label: 'Read the Runes', checkType: 'arcana', dc: 13 }],
    }), { gameMasterAgentId: 'gm-1' })

    expect(output).toMatchObject({
      gameMasterAgentId: 'gm-1',
      publicSetupNarration: 'The bell splits open.',
      proposal: {
        title: 'Bell Maw',
        difficulty: 'deadly',
        monsterCount: 99,
        rewardXpPerCharacter: 9999,
        contextualChecks: [{ id: 'read-the-runes', label: 'Read the Runes', checkType: 'arcana', dc: 13 }],
      },
    })
  })

  it('rejects generic or incomplete GM encounter proposals instead of applying identity/setup fallbacks', () => {
    expect(() => normalizeGameplayEncounterProposalResponse(JSON.stringify({
      title: 'A dreadful encounter',
      summary: 'A threat gathers in the room.',
      publicSetupNarration: 'A threat emerges in the room.',
      monsterName: 'WAGDIE horror',
      monsterArchetype: 'lurking threat',
    }), { gameMasterAgentId: 'gm-1' })).toThrow('generic fallback copy')

    expect(() => normalizeGameplayEncounterProposalResponse(JSON.stringify({
      title: 'Location catalog encounter',
      summary: 'Bell pressure gathers in the rafters.',
      publicSetupNarration: 'The bell rope snaps taut in the rafters.',
      monsterName: 'Rafter Maw',
      monsterArchetype: 'bell horror',
    }), { gameMasterAgentId: 'gm-1' })).toThrow('generic fallback copy')

    expect(() => normalizeGameplayEncounterProposalResponse(JSON.stringify({
      title: 'Bell Maw',
      summary: 'A maw unfolds.',
      monsterName: 'Maw',
      monsterArchetype: 'bell horror',
    }), { gameMasterAgentId: 'gm-1' })).toThrow('missing publicSetupNarration')
  })

  it('requires seeded encounter proposals to carry concrete catalog anchors into title/summary and setup', () => {
    const seededInput = {
      gameMasterAgentId: 'gm-1',
      encounterSeed: {
        title: 'Rafters Ambush',
        summary: 'The bell rope snaps taut above the cellar stair.',
        source: 'location_catalog',
        catalogEntryIds: ['80.10.rafters-ambush'],
        encounterHints: ['Rafters Ambush: hostile wings slam the Crow\'s Den exit.'],
        monsterHints: ['Crow Wight: a hostile crow-wight nests above the tavern rafters.'],
      },
      narrativeState,
    } as never

    expect(() => normalizeGameplayEncounterProposalResponse(JSON.stringify({
      title: 'Knife at the Door',
      summary: 'A named attacker closes in.',
      publicSetupNarration: 'A specific attacker steps forward with a hooked blade.',
      monsterName: 'Hooked Attacker',
      monsterArchetype: 'blade haunt',
    }), seededInput)).toThrow('lacked a concrete location/catalog anchor')

    expect(normalizeGameplayEncounterProposalResponse(JSON.stringify({
      title: 'Rafters Ambush',
      summary: 'The Crow Wight drops from the bell rafters.',
      publicSetupNarration: 'The bell rope snaps taut as the Crow Wight slams the rafters above the exit.',
      monsterName: 'Crow Wight',
      monsterArchetype: 'rafter haunt',
    }), seededInput)).toMatchObject({
      proposal: { title: 'Rafters Ambush', monsterName: 'Crow Wight' },
      publicSetupNarration: 'The bell rope snaps taut as the Crow Wight slams the rafters above the exit.',
    })
  })

  it('accepts strict Official GM encounter proposals with diagnostics', async () => {
    mockedSendAndCollectOfficialEphemeralSessionMessage.mockResolvedValueOnce({
      text: JSON.stringify({
        title: 'Bell Maw',
        summary: 'A maw unfolds.',
        publicSetupNarration: 'The bell splits open.',
        monsterName: 'Maw',
        monsterArchetype: 'bell horror',
      }),
      message: null,
    })

    const generator = new OfficialGameMasterGameplayGenerator({ startAgent: jest.fn() } as never)
    const result = await generator.generateEncounterProposal(makeEncounterProposalInput())

    expect(mockedSendAndCollectOfficialEphemeralSessionMessage).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      publicSetupNarration: 'The bell splits open.',
      proposal: { title: 'Bell Maw', monsterName: 'Maw', monsterArchetype: 'bell horror' },
      metadata: {
        generationDiagnostics: {
          status: 'accepted',
          repairAttempted: false,
          repaired: false,
        },
      },
    })
  })

  it('repairs generic Official GM encounter proposals once before accepting strict setup and identity', async () => {
    mockedSendAndCollectOfficialEphemeralSessionMessage
      .mockResolvedValueOnce({
        text: JSON.stringify({
          title: 'A dreadful encounter',
          summary: 'A threat gathers in the room.',
          publicSetupNarration: 'A threat emerges in the room.',
          monsterName: 'WAGDIE horror',
          monsterArchetype: 'lurking threat',
        }),
        message: null,
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          title: 'Bell Maw',
          summary: 'A brass mouth opens under the bell rope.',
          publicSetupNarration: 'The bell rope jerks taut as a brass maw unfolds from the rafters.',
          monsterName: 'Rafter Maw',
          monsterArchetype: 'bell horror',
        }),
        message: null,
      })

    const generator = new OfficialGameMasterGameplayGenerator({ startAgent: jest.fn() } as never)
    const result = await generator.generateEncounterProposal(makeEncounterProposalInput())

    expect(mockedSendAndCollectOfficialEphemeralSessionMessage).toHaveBeenCalledTimes(2)
    const repairRequest = mockedSendAndCollectOfficialEphemeralSessionMessage.mock.calls[1][1]
    expect(repairRequest.message.content).toContain('hidden semantic repair attempt')
    expect(repairRequest.message.content).toContain('Safe error category: generic_public_identity')
    expect(repairRequest.message.content).toContain('title, summary, publicSetupNarration, monsterName, and monsterArchetype are required')
    expect(result).toMatchObject({
      publicSetupNarration: 'The bell rope jerks taut as a brass maw unfolds from the rafters.',
      proposal: { title: 'Bell Maw', monsterName: 'Rafter Maw' },
      metadata: {
        generationDiagnostics: {
          status: 'repaired',
          repairAttempted: true,
          repaired: true,
          initialErrorCategory: 'generic_public_identity',
        },
      },
    })
  })

  it('throws typed GM encounter proposal failure after one failed repair', async () => {
    mockedSendAndCollectOfficialEphemeralSessionMessage
      .mockResolvedValueOnce({ text: 'not json', message: null })
      .mockResolvedValueOnce({ text: 'still not json', message: null })

    const generator = new OfficialGameMasterGameplayGenerator({ startAgent: jest.fn() } as never)
    let thrown: unknown
    try {
      await generator.generateEncounterProposal(makeEncounterProposalInput())
    } catch (error) {
      thrown = error
    }

    expect(mockedSendAndCollectOfficialEphemeralSessionMessage).toHaveBeenCalledTimes(2)
    expect(thrown).toBeInstanceOf(GameMasterGameplayEncounterProposalGenerationError)
    expect((thrown as GameMasterGameplayEncounterProposalGenerationError).diagnostics).toMatchObject({
      status: 'repair_failed',
      repairAttempted: true,
      repaired: false,
      initialErrorCategory: 'missing_json_object',
      repairErrorCategory: 'missing_json_object',
    })
  })

  it('throws typed GM encounter proposal transport failure without repair', async () => {
    mockedSendAndCollectOfficialEphemeralSessionMessage.mockRejectedValueOnce(new Error('network down'))

    const generator = new OfficialGameMasterGameplayGenerator({ startAgent: jest.fn() } as never)
    await expect(generator.generateEncounterProposal(makeEncounterProposalInput()))
      .rejects.toMatchObject({
        diagnostics: {
          status: 'repair_failed',
          repairAttempted: false,
          repaired: false,
          initialErrorCategory: 'transport_error',
          transportStage: 'initial_collect',
        },
      })
    expect(mockedSendAndCollectOfficialEphemeralSessionMessage).toHaveBeenCalledTimes(1)
  })

  it('rejects autonomous combat action prose instead of synthesizing a public fallback', () => {
    expect(() => normalizeGameplayActionResponse('I hold the line and strike the closest horror.', {
      legalMonsterIds: ['monster-1'],
      legalCharacterTokenIds: [1, 2],
    })).toThrow('Gameplay action response did not contain a JSON object')

    expect(() => normalizeGameplayActionResponse('I study the room and watch for a way out.', {
      legalMonsterIds: ['monster-1'],
      legalCharacterTokenIds: [1, 2],
    })).toThrow('Gameplay action response did not contain a JSON object')

    expect(() => normalizeGameplayActionResponse('I hold the line and study the room.', {
      legalCharacterTokenIds: [1, 2],
    })).toThrow('Gameplay action response did not contain a JSON object')
  })

  it('validates generated actions with legal targets and required public speech', () => {
    expect(() => normalizeGameplayActionResponse(JSON.stringify({
      actionType: 'attack',
      target: { kind: 'monster', id: 'monster-404' },
      publicSpeech: 'I strike.',
    }), {
      legalMonsterIds: ['monster-1'],
      legalCharacterTokenIds: [1, 2],
    })).toThrow('Gameplay action target is not legal for this turn')

    expect(normalizeGameplayActionResponse(JSON.stringify({
      actionType: 'attack',
      target: { kind: 'monster', id: 'monster-1' },
      publicSpeech: 'I strike the maw.',
      intentSummary: 'Draw its attention.',
    }), {
      legalMonsterIds: ['monster-1'],
      legalCharacterTokenIds: [1, 2],
    })).toMatchObject({
      action: {
        actionType: 'attack',
        target: { kind: 'monster', id: 'monster-1' },
        rollChoice: { source: 'inferred', checkType: 'attack', label: 'Attack' },
        publicSpeech: 'I strike the maw.',
      },
    })
  })

  it('strict action parsing and normalization both reject prose', () => {
    expect(() => parseGameplayActionResponseStrict('I hold the line and strike the closest horror.', {
      legalMonsterIds: ['monster-1'],
      legalCharacterTokenIds: [1, 2],
    })).toThrow('Gameplay action response did not contain a JSON object')

    expect(() => normalizeGameplayActionResponse('I hold the line and strike the closest horror.', {
      legalMonsterIds: ['monster-1'],
      legalCharacterTokenIds: [1, 2],
    })).toThrow('Gameplay action response did not contain a JSON object')
  })

  it('repairs non-JSON Official character actions exactly once before accepting strict output', async () => {
    mockedSendAndCollectOfficialEphemeralSessionMessage
      .mockResolvedValueOnce({ text: 'I hold the line and strike the closest horror.', message: null })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          actionType: 'attack',
          target: { kind: 'monster', id: 'monster-1' },
          publicSpeech: 'I strike the maw.',
          intentSummary: 'Draw its attention.',
        }),
        message: null,
      })

    const generator = new OfficialGameplayActionGenerator({ startAgent: jest.fn() } as never)
    const result = await generator.generateAction(makeGameplayActionInput())

    expect(mockedSendAndCollectOfficialEphemeralSessionMessage).toHaveBeenCalledTimes(2)
    const repairRequest = mockedSendAndCollectOfficialEphemeralSessionMessage.mock.calls[1][1]
    expect(repairRequest.message.content).toContain('semantic repair attempt')
    expect(repairRequest.message.content).toContain('Safe error category: missing_json_object')
    expect(repairRequest.message.content).toContain('Legal monster target ids: monster-1')
    expect(repairRequest.message.content).toContain('Legal character token ids: 7, 8')
    expect(repairRequest.message.content).toContain('- read-the-runes: Read the Runes')
    expect(result).toMatchObject({
      officialAgentId: 'agent-7',
      action: {
        actionType: 'attack',
        target: { kind: 'monster', id: 'monster-1' },
        publicSpeech: 'I strike the maw.',
        metadata: {
          semanticRepairAttempted: true,
          repairedFromSemanticFailure: true,
          initialErrorCategory: 'missing_json_object',
        },
      },
    })
    expect(result.action.metadata).not.toHaveProperty('fallbackFromSemanticRepairFailure')
  })

  it('repairs validation-failed Official character actions before accepting strict output', async () => {
    mockedSendAndCollectOfficialEphemeralSessionMessage
      .mockResolvedValueOnce({
        text: JSON.stringify({
          actionType: 'attack',
          target: { kind: 'monster', id: 'monster-404' },
          publicSpeech: 'I strike the wrong maw.',
        }),
        message: null,
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          actionType: 'attack',
          target: { kind: 'monster', id: 'monster-1' },
          publicSpeech: 'I correct course and strike the true maw.',
        }),
        message: null,
      })

    const generator = new OfficialGameplayActionGenerator({ startAgent: jest.fn() } as never)
    const result = await generator.generateAction(makeGameplayActionInput())

    expect(mockedSendAndCollectOfficialEphemeralSessionMessage).toHaveBeenCalledTimes(2)
    expect(result.action).toMatchObject({
      actionType: 'attack',
      target: { kind: 'monster', id: 'monster-1' },
      publicSpeech: 'I correct course and strike the true maw.',
      metadata: {
        semanticRepairAttempted: true,
        repairedFromSemanticFailure: true,
        initialErrorCategory: 'target_constraint',
      },
    })
    expect(result.action.metadata).not.toHaveProperty('fallbackFromOfficialError')
  })

  it('throws typed diagnostics after one failed Official character action repair', async () => {
    mockedSendAndCollectOfficialEphemeralSessionMessage
      .mockResolvedValueOnce({ text: 'I study the bell and wait.', message: null })
      .mockResolvedValueOnce({ text: 'Still no JSON.', message: null })

    const generator = new OfficialGameplayActionGenerator({ startAgent: jest.fn() } as never)
    let thrown: unknown
    try {
      await generator.generateAction(makeGameplayActionInput())
    } catch (error) {
      thrown = error
    }

    expect(mockedSendAndCollectOfficialEphemeralSessionMessage).toHaveBeenCalledTimes(2)
    expect(thrown).toBeInstanceOf(GameplayActionGenerationError)
    expect((thrown as GameplayActionGenerationError).diagnostics).toMatchObject({
      status: 'repair_failed',
      repairAttempted: true,
      repaired: false,
      initialErrorCategory: 'missing_json_object',
      repairErrorCategory: 'missing_json_object',
    })
  })

  it('validates GM outcome narration quality against backend consequence anchors', () => {
    const input = makeGameplayOutcomeInput()
    expect(validateGameplayOutcomeNarrationQuality({
      gameMasterAgentId: 'gm-1',
      publicNarration: 'Ash strikes under the bell rope; Maw reels back and its line breaks.',
      stateAfter: { stateSummary: 'Maw is wounded.', currentObjective: null, openThreads: [] },
      metadata: { rawResponseLength: 1 },
    }, input)).toEqual({ ok: true })

    expect(validateGameplayOutcomeNarrationQuality({
      gameMasterAgentId: 'gm-1',
      publicNarration: 'The backend result echoes through the room.',
      stateAfter: { stateSummary: 'Maw is wounded.', currentObjective: null, openThreads: [] },
      metadata: { rawResponseLength: 1 },
    }, input)).toMatchObject({ ok: false })

    const noDamageInput = makeGameplayOutcomeInput() as any
    noDamageInput.mechanicalSummary.mechanicalDeltas.actionRoll.tier = 'failure'
    noDamageInput.mechanicalSummary.mechanicalDeltas.actionDamage.amount = 0
    noDamageInput.mechanicalSummary.encounterStatusAfter = 'active'
    noDamageInput.encounterAfter.status = 'active'

    expect(validateGameplayOutcomeNarrationQuality({
      gameMasterAgentId: 'gm-1',
      publicNarration: 'Ash kills Maw and the fight is won.',
      stateAfter: { stateSummary: 'Maw is dead.', currentObjective: null, openThreads: [] },
      metadata: { rawResponseLength: 1 },
    }, noDamageInput)).toMatchObject({ ok: false })

    expect(validateGameplayOutcomeNarrationQuality({
      gameMasterAgentId: 'gm-1',
      publicNarration: 'Ash wounds Maw and blood spills across the room.',
      stateAfter: { stateSummary: 'Maw is wounded.', currentObjective: null, openThreads: [] },
      metadata: { rawResponseLength: 1 },
    }, noDamageInput)).toMatchObject({ ok: false })
  })

  it('requires combat outcome narration to name target, location anchor, visible tactic, and changed battlefield state', () => {
    const input = makeGameplayOutcomeInput()

    expect(validateGameplayOutcomeNarrationQuality({
      gameMasterAgentId: 'gm-1',
      publicNarration: 'Ash strikes hard; the line breaks.',
      stateAfter: { stateSummary: 'Maw is wounded.', currentObjective: null, openThreads: [] },
      metadata: { rawResponseLength: 1 },
    }, input)).toMatchObject({ ok: false, error: expect.stringContaining('specific combat target') })

    expect(validateGameplayOutcomeNarrationQuality({
      gameMasterAgentId: 'gm-1',
      publicNarration: 'Ash strikes Maw and its line breaks.',
      stateAfter: { stateSummary: 'Maw is wounded.', currentObjective: null, openThreads: [] },
      metadata: { rawResponseLength: 1 },
    }, input)).toMatchObject({ ok: false, error: expect.stringContaining('location or catalog anchor') })

    expect(validateGameplayOutcomeNarrationQuality({
      gameMasterAgentId: 'gm-1',
      publicNarration: 'Ash watches Maw beneath the bell rope and the line breaks.',
      stateAfter: { stateSummary: 'Maw is wounded.', currentObjective: null, openThreads: [] },
      metadata: { rawResponseLength: 1 },
    }, input)).toMatchObject({ ok: false, error: expect.stringContaining('visible tactic') })

    expect(validateGameplayOutcomeNarrationQuality({
      gameMasterAgentId: 'gm-1',
      publicNarration: 'Ash strikes Maw beneath the bell rope.',
      stateAfter: { stateSummary: 'Maw is wounded.', currentObjective: null, openThreads: [] },
      metadata: { rawResponseLength: 1 },
    }, input)).toMatchObject({ ok: false, error: expect.stringContaining('changed battlefield state') })
  })

  it('accepts injury narration when backend retaliation dealt damage', () => {
    const input = makeGameplayOutcomeInput() as any
    input.mechanicalSummary.mechanicalDeltas.actionRoll.tier = 'failure'
    input.mechanicalSummary.mechanicalDeltas.actionDamage.amount = 0
    input.mechanicalSummary.mechanicalDeltas.monsterRetaliation = { monsterId: 'monster-1', tokenId: 7, amount: 4, hit: true }

    expect(validateGameplayOutcomeNarrationQuality({
      gameMasterAgentId: 'gm-1',
      publicNarration: 'Maw counters under the bell rope, wounds Ash, and drives the line back.',
      stateAfter: { stateSummary: 'Ash was wounded by Maw.', currentObjective: null, openThreads: [] },
      metadata: { rawResponseLength: 1 },
    }, input)).toEqual({ ok: true })
  })

  it('accepts strong Official GM outcome narration without repair', async () => {
    mockedSendAndCollectOfficialEphemeralSessionMessage.mockResolvedValueOnce({
      text: JSON.stringify({
        publicNarration: 'Ash strikes under the bell rope; Maw reels back and its line breaks.',
        stateSummary: 'Maw is wounded.',
        openThreads: [],
      }),
      message: null,
    })

    const generator = new OfficialGameMasterGameplayGenerator({ startAgent: jest.fn() } as never)
    const result = await generator.generateOutcomeNarration(makeGameplayOutcomeInput())

    expect(mockedSendAndCollectOfficialEphemeralSessionMessage).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      publicNarration: 'Ash strikes under the bell rope; Maw reels back and its line breaks.',
      metadata: {
        generationDiagnostics: {
          status: 'accepted',
          repairAttempted: false,
          repaired: false,
        },
      },
    })
  })

  it('repairs weak Official GM outcome narration once before accepting', async () => {
    mockedSendAndCollectOfficialEphemeralSessionMessage
      .mockResolvedValueOnce({
        text: JSON.stringify({
          publicNarration: 'The backend result echoes through the room.',
          stateSummary: 'A turn resolved.',
          openThreads: [],
        }),
        message: null,
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          publicNarration: 'Ash cuts into Maw beneath the bell rope; the horror reels back and loses the line.',
          stateSummary: 'Maw is wounded.',
          openThreads: [],
        }),
        message: null,
      })

    const generator = new OfficialGameMasterGameplayGenerator({ startAgent: jest.fn() } as never)
    const result = await generator.generateOutcomeNarration(makeGameplayOutcomeInput())

    expect(mockedSendAndCollectOfficialEphemeralSessionMessage).toHaveBeenCalledTimes(2)
    const repairRequest = mockedSendAndCollectOfficialEphemeralSessionMessage.mock.calls[1][1]
    expect(repairRequest.message.content).toContain('one semantic repair attempt')
    expect(repairRequest.message.content).toContain('Safe error category: weak_narration')
    expect(repairRequest.message.content).toContain('Roll card owns structured mechanics')
    expect(repairRequest.message.content).toContain('Selected target monster: Maw')
    expect(result).toMatchObject({
      publicNarration: 'Ash cuts into Maw beneath the bell rope; the horror reels back and loses the line.',
      metadata: {
        generationDiagnostics: {
          status: 'repaired',
          repairAttempted: true,
          repaired: true,
          initialErrorCategory: 'weak_narration',
        },
      },
    })
  })

  it('throws typed GM outcome failure after one failed semantic repair without static fallback', async () => {
    mockedSendAndCollectOfficialEphemeralSessionMessage
      .mockResolvedValueOnce({ text: 'not json', message: null })
      .mockResolvedValueOnce({ text: 'still not json', message: null })

    const generator = new OfficialGameMasterGameplayGenerator({ startAgent: jest.fn() } as never)
    let thrown: unknown
    try {
      await generator.generateOutcomeNarration(makeGameplayOutcomeInput())
    } catch (error) {
      thrown = error
    }

    expect(mockedSendAndCollectOfficialEphemeralSessionMessage).toHaveBeenCalledTimes(2)
    expect(thrown).toBeInstanceOf(GameMasterGameplayOutcomeGenerationError)
    expect((thrown as GameMasterGameplayOutcomeGenerationError).diagnostics).toMatchObject({
      status: 'repair_failed',
      repairAttempted: true,
      repaired: false,
      initialErrorCategory: 'missing_json_object',
      repairErrorCategory: 'missing_json_object',
    })
  })

  it('throws typed GM outcome transport failure without semantic repair', async () => {
    mockedSendAndCollectOfficialEphemeralSessionMessage.mockRejectedValueOnce(new Error('network down'))

    const generator = new OfficialGameMasterGameplayGenerator({ startAgent: jest.fn() } as never)
    await expect(generator.generateOutcomeNarration(makeGameplayOutcomeInput()))
      .rejects.toMatchObject({
        diagnostics: {
          status: 'repair_failed',
          repairAttempted: false,
          repaired: false,
          initialErrorCategory: 'transport_error',
          transportStage: 'initial_collect',
        },
      })
    expect(mockedSendAndCollectOfficialEphemeralSessionMessage).toHaveBeenCalledTimes(1)
  })

  it('outcome narration accepts continuity updates but ignores attempted mechanical fields', () => {
    const output = normalizeGameplayOutcomeNarrationResponse(JSON.stringify({
      publicNarration: 'Steel rings under the bell rope; the maw reels back from the backend result.',
      stateSummary: 'The maw has been wounded.',
      openThreads: ['The bell still hums'],
      hp: 999,
      xp: 999,
      death: false,
    }), {
      gameMasterAgentId: 'gm-1',
      narrativeState,
    })

    expect(output).toEqual({
      gameMasterAgentId: 'gm-1',
      publicNarration: 'Steel rings under the bell rope; the maw reels back from the backend result.',
      stateAfter: {
        stateSummary: 'The maw has been wounded.',
        currentObjective: null,
        openThreads: ['The bell still hums'],
      },
      metadata: { rawResponseLength: expect.any(Number) },
    })
    expect(output).not.toHaveProperty('hp')
  })
})
