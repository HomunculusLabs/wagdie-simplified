/**
 * @jest-environment node
 */

import type { NormalizedLocationAdventureCatalog } from '@/lib/domain/location/metadata-types'
import {
  buildGmContentBookFromCatalog,
  mergeStructuredNarrativeMemory,
  normalizeGmContentBook,
  normalizeStructuredNarrativeMemory,
  projectCombatTerminalSummary,
  projectPublicContinuityMemory,
  recordCharacterPhraseActionMemory,
} from '@/lib/eliza/locationRooms/narrativeMemory'
import { mergeAdventureMetadata } from '@/lib/eliza/locationRooms/narrativeTypes'

describe('location room narrative memory projection helpers', () => {
  it('normalizes structured memory with public-safe bounded defaults and adventure spatial fallback', () => {
    const metadata = mergeAdventureMetadata({
      narrativeMemory: {
        publicContinuity: {
          roomSummary: '  The reliquary door hums. ',
          currentObjective: 'Do not mention DC 15.',
          openThreads: ['Find the blue ash', 'Find the blue ash', 'wallet 0x1234567890123456789012345678901234567890'],
          recentPublicBeats: [
            { id: 'm-1', sequence: 1, authorName: 'GM', content: 'The bell rope shivers.' },
            { id: 'm-2', sequence: 2, authorName: 'GM', content: 'The backend route advanced.' },
          ],
          unresolvedConsequences: ['The ash trail remains open.', 'A check was failed.'],
        },
        gmPlanning: {
          nextBeatIntent: 'Pay off the ash trail.',
          pressure: 'terminal',
          reservedReveals: ['The hollow altar'],
          doNotRepeat: ['same raven taunt', 'same raven taunt'],
          pacingNotes: ['Move toward aftermath.'],
        },
        characterMemories: {
          '1443': {
            tokenId: 1443,
            publicName: 'Ash-Eater',
            recentPhrases: ['The ash knows me.', 'The ash knows me.', 'HP is 2'],
            recentActions: ['Listens at the reliquary door.'],
            lastActionIntent: 'investigate',
            lastSourceId: 'beat:7',
            updatedAt: '2026-06-10T12:00:00.000Z',
          },
        },
      },
    }, {
      spatialContext: {
        currentArea: 'Reliquary threshold',
        landmarks: ['blue ash', 'hanging bell'],
        routes: ['stair down'],
        unresolvedSpatialQuestions: ['Where does the ash trail lead?'],
      },
    })

    const memory = normalizeStructuredNarrativeMemory(metadata)

    expect(memory.publicContinuity).toMatchObject({
      roomSummary: 'The reliquary door hums.',
      currentObjective: null,
      openThreads: ['Find the blue ash'],
      unresolvedConsequences: ['The ash trail remains open.'],
    })
    expect(memory.publicContinuity.recentPublicBeats).toEqual([
      expect.objectContaining({ id: 'm-1', summary: 'The bell rope shivers.' }),
    ])
    expect(memory.gmPlanning).toMatchObject({
      nextBeatIntent: 'Pay off the ash trail.',
      pressure: 'terminal',
      doNotRepeat: ['same raven taunt'],
    })
    expect(memory.characterMemories).toEqual([
      expect.objectContaining({
        tokenId: 1443,
        publicName: 'Ash-Eater',
        recentPhrases: ['The ash knows me.'],
      }),
    ])
    expect(memory.spatialState).toEqual({
      currentArea: 'Reliquary threshold',
      landmarks: ['blue ash', 'hanging bell'],
      routes: ['stair down'],
      unresolvedSpatialQuestions: ['Where does the ash trail lead?'],
    })
  })

  it('projects public continuity from narrative state, public messages, and open adventure consequences', () => {
    const metadata = mergeAdventureMetadata({}, {
      consequence: { summary: 'The bell marks the threshold.', status: 'complication' },
      spatialContext: { currentArea: 'Bell gate' },
    }, { sourceId: 'beat:1' })

    const continuity = projectPublicContinuityMemory({
      narrativeState: {
        stateSummary: 'The group lingers at the bell gate.',
        currentObjective: 'Choose how to cross.',
        openThreads: ['The bell still listens.'],
        metadata,
      },
      recentMessages: [
        { id: 'internal-1', sequence: 1, visibility: 'internal', authorName: 'system', tokenId: null, content: 'private', createdAt: '2026-06-10T12:00:00.000Z' },
        { id: 'public-1', sequence: 2, visibility: 'public', authorName: 'GM', tokenId: null, content: 'The gate opens a finger-width.', createdAt: '2026-06-10T12:01:00.000Z' },
        { id: 'public-2', sequence: 3, visibility: 'public', authorName: 'GM', tokenId: null, content: 'This leaks DC 12.', createdAt: '2026-06-10T12:02:00.000Z' },
      ],
    })

    expect(continuity).toMatchObject({
      roomSummary: 'The group lingers at the bell gate.',
      currentObjective: 'Choose how to cross.',
      openThreads: ['The bell still listens.'],
      unresolvedConsequences: ['The bell marks the threshold.'],
    })
    expect(continuity.recentPublicBeats).toEqual([
      expect.objectContaining({ id: 'public-1', summary: 'The gate opens a finger-width.' }),
    ])
  })

  it('records character phrase/action memory idempotently and preserves unrelated metadata', () => {
    const first = recordCharacterPhraseActionMemory({ keep: true }, {
      tokenId: 1443,
      publicName: 'Ash-Eater',
      phrase: 'The ash knows me.',
      actionSummary: 'Listens at the reliquary door.',
      actionIntent: 'investigate',
      sourceId: 'beat:1',
      observedAt: '2026-06-10T12:00:00.000Z',
    })
    const second = recordCharacterPhraseActionMemory(first, {
      tokenId: 1443,
      phrase: 'The ash knows me.',
      actionSummary: 'Tests the reliquary latch.',
      actionIntent: 'investigate',
      sourceId: 'beat:2',
      observedAt: '2026-06-10T12:05:00.000Z',
    })

    expect(second.keep).toBe(true)
    expect(normalizeStructuredNarrativeMemory(second).characterMemories).toEqual([
      expect.objectContaining({
        tokenId: 1443,
        publicName: 'Ash-Eater',
        recentPhrases: ['The ash knows me.'],
        recentActions: ['Listens at the reliquary door.', 'Tests the reliquary latch.'],
        lastSourceId: 'beat:2',
      }),
    ])
  })

  it('merges structured memory patches without broad generator integration', () => {
    const merged = mergeStructuredNarrativeMemory({}, {
      gmPlanning: {
        nextBeatIntent: 'Resolve the bell gate aftermath.',
        pressure: 'high',
        doNotRepeat: ['old taunt'],
      },
      combatTerminalSummaries: [
        {
          encounterId: 'enc-1',
          status: 'victory',
          publicTitle: 'Rafter Horror',
          publicSummary: 'The horror is driven from the rafters.',
          defeatedMonsterIdentities: ['Rafter Horror'],
          survivingMonsterIdentities: [],
          characterOutcomes: ['Ash-Eater still stands.'],
          aftermathHooks: ['The rafters stop shaking.'],
          terminalAt: '2026-06-10T12:10:00.000Z',
        },
      ],
    })

    expect(normalizeStructuredNarrativeMemory(merged)).toMatchObject({
      gmPlanning: {
        nextBeatIntent: 'Resolve the bell gate aftermath.',
        pressure: 'high',
        doNotRepeat: ['old taunt'],
      },
      combatTerminalSummaries: [
        expect.objectContaining({ encounterId: 'enc-1', status: 'victory' }),
      ],
    })
  })
})

describe('location room combat terminal and GM content card helpers', () => {
  it('projects terminal encounter summaries and ignores active encounters', () => {
    expect(projectCombatTerminalSummary({
      id: 'enc-active',
      status: 'active',
      publicTitle: 'Active threat',
      publicSummary: 'Still moving.',
      monsterState: [],
      rewardPlan: {},
      completedAt: null,
    })).toBeNull()

    expect(projectCombatTerminalSummary({
      id: 'enc-1',
      status: 'victory',
      publicTitle: 'Rafter Horror',
      publicSummary: 'The rafters go quiet.',
      monsterState: [
        { id: 'm-1', name: 'Rafter Horror', status: 'dead' },
        { id: 'm-2', name: 'Fleeing Crow', status: 'alive' },
      ],
      rewardPlan: {
        victoryText: 'A cold feather points toward the belfry.',
        narrativeRewards: ['The party has reward XP.'],
      },
      completedAt: '2026-06-10T12:10:00.000Z',
    })).toMatchObject({
      encounterId: 'enc-1',
      status: 'victory',
      publicTitle: 'Rafter Horror',
      defeatedMonsterIdentities: ['Rafter Horror'],
      survivingMonsterIdentities: ['Fleeing Crow'],
      aftermathHooks: ['A cold feather points toward the belfry.'],
    })
  })

  it('normalizes GM book content card shapes while allowing private forbidden labels only as guardrails', () => {
    const book = normalizeGmContentBook({
      locationAffordances: [
        {
          id: 'bell-rope',
          title: 'Bell Rope',
          publicSummary: 'A rope hangs from the chapel dark.',
          sensoryDetails: ['Cold fibers', 'backend route marker'],
          actionAffordances: ['Pull it softly', 'Cut it free'],
          boundaries: ['It cannot reveal wallet owners.'],
          tags: ['bell', 'chapel'],
        },
      ],
      monsterPublicIdentities: [
        {
          id: 'crow-wight',
          publicName: 'Rafter Horror',
          publicDescription: 'A feathered shape hooked into the beams.',
          tells: ['Ash falls before it speaks.'],
          threatSignals: ['The rafters answer its weight.'],
          defeatCues: ['The bells stop answering it.'],
          forbiddenPrivateLabels: ['Bell Bait', 'encounter site'],
        },
      ],
      tierPayoffExamples: [
        {
          id: 'failure-bell',
          tier: 'failure',
          actionIntent: 'investigate',
          publicExample: 'The bell stays silent, but ash spills and worsens the choice.',
          consequenceShape: 'Cost without progress.',
        },
      ],
      forbiddenLabels: [
        {
          label: 'DC 15 check',
          reason: 'mechanical label belongs in roll cards, not prose',
          publicAlternatives: ['hard crossing', 'thin chance'],
        },
      ],
      aftermathTemplates: [
        {
          terminalStatus: 'victory',
          template: 'With the threat ended, show one quiet room change and one next path.',
          continuationHooks: ['The belfry door is newly visible.'],
          forbiddenClaims: ['fresh target after terminal state'],
        },
      ],
    })

    expect(book.locationAffordances[0]).toMatchObject({
      id: 'bell-rope',
      sensoryDetails: ['Cold fibers'],
    })
    expect(book.monsterPublicIdentities[0]).toMatchObject({
      publicName: 'Rafter Horror',
      forbiddenPrivateLabels: ['Bell Bait', 'encounter site'],
    })
    expect(book.tierPayoffExamples[0]).toMatchObject({ tier: 'failure' })
    expect(book.forbiddenLabels[0]).toMatchObject({
      label: 'DC 15 check',
      severity: 'block',
      publicAlternatives: ['hard crossing', 'thin chance'],
    })
    expect(book.aftermathTemplates[0]).toMatchObject({ terminalStatus: 'victory' })
  })

  it('builds catalog-backed GM content cards from visible location and monster entries', () => {
    const catalog: NormalizedLocationAdventureCatalog = {
      defaults: {
        arcSummary: null,
        currentStakes: null,
        openingDecision: null,
        discoveries: [],
        clocks: [],
      },
      sections: {
        '00_setting': [],
        '10_plot': [],
        '20_characters': [],
        '30_monsters': [
          { id: '30.10.rafter-horror', section: '30_monsters', title: 'Rafter Horror', summary: 'A feathered horror in the beams.', tags: ['crow', 'rafter'] },
          { id: '30.99.hidden-thing', section: '30_monsters', title: 'Hidden Thing', summary: 'Secret.', tags: ['secret'], revealConditions: ['later'] },
        ],
        '40_places': [
          { id: '40.10.belfry', section: '40_places', title: 'Belfry', summary: 'A bell loft with cracked stairs.', tags: ['bell', 'stairs'] },
        ],
        '50_items': [
          { id: '50.10.ash-key', section: '50_items', title: 'Ash Key', summary: 'A key dusted with blue ash.', tags: ['key'] },
        ],
        '60_shops_services': [],
        '70_factions': [],
        '80_encounters': [],
        '90_rules_guidance': [],
      },
    }

    const book = buildGmContentBookFromCatalog(catalog, {
      forbiddenLabels: [{ label: 'Bell Bait', reason: 'internal encounter name', publicAlternatives: ['bell lure'] }],
    })

    expect(book.locationAffordances.map((card) => card.id)).toEqual(['40.10.belfry', '50.10.ash-key'])
    expect(book.monsterPublicIdentities.map((card) => card.id)).toEqual(['30.10.rafter-horror'])
    expect(book.forbiddenLabels).toEqual([
      expect.objectContaining({ label: 'Bell Bait', publicAlternatives: ['bell lure'] }),
    ])
  })
})
