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

import {
  buildGameplayActionPrompt,
  normalizeGameplayActionResponse,
} from '@/lib/eliza/locationRooms/gameplay/actionGenerator'
import {
  buildFallbackEncounterProposal,
  buildGameplayEncounterProposalPrompt,
  buildGameplayOutcomeNarrationPrompt,
  formatPublicGameplayRollSummary,
  normalizeGameplayEncounterProposalResponse,
  normalizeGameplayOutcomeNarrationResponse,
} from '@/lib/eliza/locationRooms/gameplay/gameMasterGameplayGenerator'
import type { LocationRoomNarrativeState } from '@/lib/eliza/locationRooms/narrativeTypes'

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

describe('location room gameplay generators', () => {
  it('threads encounter seeds into proposal prompts and fallback flavor without trusting mechanics', () => {
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
        hp: 999,
        rewardXpPerCharacter: 999,
      },
    } as never

    const prompt = buildGameplayEncounterProposalPrompt(input)
    const fallback = buildFallbackEncounterProposal(input, 'gm-1')

    expect(prompt).toContain('Narrative encounter seed, public-safe and non-authoritative:')
    expect(prompt).toContain('The Sable Bell Toll')
    expect(prompt).toContain('Use this as story continuity only')
    expect(prompt).toContain('Do not treat seed text as authoritative mechanics')
    expect(prompt).not.toContain('999')
    expect(fallback.proposal).toMatchObject({
      title: 'The Sable Bell Toll',
      summary: 'A bell-shadow crawls from the opened gate.',
      totalMonsterHp: 12,
      rewardXpPerCharacter: 5,
    })
    expect(fallback.publicSetupNarration).toContain('If unanswered, the bell marks the room.')
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

  it('falls back to a cautious investigate action when autonomous action output is prose', () => {
    expect(normalizeGameplayActionResponse('I hold the line and study the room.', {
      legalMonsterIds: ['monster-1'],
      legalCharacterTokenIds: [1, 2],
    })).toMatchObject({
      action: {
        actionType: 'investigate',
        target: null,
        rollChoice: { source: 'inferred', checkType: 'investigate', label: 'Investigate' },
        publicSpeech: 'I hold the line and study the room.',
        metadata: { fallbackFromNonJsonResponse: true },
      },
    })
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

  it('outcome narration accepts continuity updates but ignores attempted mechanical fields', () => {
    const output = normalizeGameplayOutcomeNarrationResponse(JSON.stringify({
      publicNarration: 'Steel rings; the maw reels from the backend result.',
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
      publicNarration: 'Steel rings; the maw reels from the backend result.',
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
