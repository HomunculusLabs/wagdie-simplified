/**
 * @jest-environment node
 */

import type { NormalizedLocationAdventureCatalog } from '@/lib/domain/location/metadata-types'
import {
  buildCatalogPreferredEncounterSeed,
  normalizeSceneCheckEscalation,
} from '@/lib/eliza/locationRooms/encounterEscalation'
import type { LocationRoomNarrativeState } from '@/lib/eliza/locationRooms/narrativeTypes'

function narrativeStateWithCatalog(catalog?: NormalizedLocationAdventureCatalog): Pick<LocationRoomNarrativeState, 'currentObjective' | 'openThreads' | 'metadata'> {
  return {
    currentObjective: 'Find the crow threat above the bell market.',
    openThreads: ['The bell rope is moving by itself.'],
    metadata: catalog ? {
      adventureCatalog: catalog,
      adventure: {
        currentStakes: 'The bell market exit will seal if the rope keeps moving.',
        spatialContext: {
          currentArea: 'bell market rafters',
          landmarks: ['frayed bell rope', 'cellar stair'],
          routes: ['market exit'],
          unresolvedSpatialQuestions: [],
        },
        consequenceLedger: [
          { id: 'consequence-1', source: 'beat-1', summary: 'The market exit is half blocked by fallen planks.', status: 'complication' },
        ],
      },
    } : {},
  }
}

function adventureCatalog(): NormalizedLocationAdventureCatalog {
  return {
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
      '30_monsters': [{
        id: '30.99.hidden-crow-king',
        section: '30_monsters',
        title: 'Hidden Crow King',
        summary: 'A reveal-gated monster above the market rafters.',
        tags: ['crow', 'threat'],
        revealConditions: ['discovery:crow-king'],
      }, {
        id: '30.10.crow-wight',
        section: '30_monsters',
        title: 'Crow Wight',
        summary: 'A wight nesting above the market rafters.',
        tags: ['crow', 'threat'],
      }],
      '40_places': [],
      '50_items': [],
      '60_shops_services': [],
      '70_factions': [],
      '80_encounters': [{
        id: '80.99.hidden-bell-ending',
        section: '80_encounters',
        title: 'Hidden Bell Ending',
        summary: 'A reveal-gated bell encounter that should stay out of prompts and seeds.',
        tags: ['bell', 'ambush'],
        revealConditions: ['discovery:bell-ending'],
      }, {
        id: '80.10.bell-ambush',
        section: '80_encounters',
        title: 'Bell Ambush',
        summary: 'The rope snaps taut and the rafters answer with movement.',
        tags: ['bell', 'ambush'],
      }],
      '90_rules_guidance': [],
    },
  }
}

describe('location room encounter escalation helpers', () => {
  it('promotes failed scene checks to structured danger floors', () => {
    const result = normalizeSceneCheckEscalation({
      rollTier: 'failure',
      rawEscalation: { decision: 'none', reason: 'The GM omitted escalation.' },
      narrativeState: narrativeStateWithCatalog(),
      fallbackSummary: 'The failed search makes the hidden bell answer.',
    })

    expect(result.escalation).toMatchObject({
      decision: 'danger',
      dangerKind: 'unknown',
      threatLevel: 2,
      reason: 'The GM omitted escalation.',
    })
    expect(result.ttrpgMetadataPatch).toMatchObject({
      ttrpgPhase: 'threat',
      combatReadiness: 'foreshadow',
      threatLevel: 2,
      requestedGameplayAction: null,
    })
    expect(result.ttrpgMetadataPatch).not.toHaveProperty('lastCombatTriggerBeatId')
  })

  it('normalizes combat-ready escalation without emitting a direct gameplay action', () => {
    const result = normalizeSceneCheckEscalation({
      rollTier: 'critical_failure',
      rawEscalation: {
        decision: 'combat_ready',
        dangerKind: 'monster_pressure',
        threatLevel: 1,
        encounterSeed: {
          title: 'Bell Horror',
          summary: 'Something in the rafters descends when the bell answers.',
        },
      },
      narrativeState: narrativeStateWithCatalog(),
    })

    expect(result.escalation).toMatchObject({
      decision: 'combat_ready',
      dangerKind: 'monster_pressure',
      threatLevel: 3,
    })
    expect(result.ttrpgMetadataPatch).toMatchObject({
      ttrpgPhase: 'threat',
      combatReadiness: 'ready',
      threatLevel: 3,
      requestedGameplayAction: null,
      lastEncounterSeed: expect.objectContaining({
        title: 'Bell Horror',
        source: 'gm',
      }),
    })
    expect(result.ttrpgMetadataPatch).not.toHaveProperty('lastCombatTriggerBeatId')
  })

  it('promotes a repeated failed scene check against unresolved danger to combat-ready', () => {
    const result = normalizeSceneCheckEscalation({
      rollTier: 'failure',
      rawEscalation: { decision: 'none', reason: 'The GM omitted escalation again.' },
      narrativeState: {
        ...narrativeStateWithCatalog(adventureCatalog()),
        metadata: {
          adventureCatalog: adventureCatalog(),
          ttrpgPhase: 'story',
          combatReadiness: 'none',
          threatLevel: null,
          sceneCheckEscalations: {
            'scene_check:prior': {
              decision: 'danger',
              dangerKind: 'monster_pressure',
              reason: 'The first failed check woke something up.',
              threatLevel: 2,
              encounterSeed: {
                title: 'Bell Ambush',
                summary: 'The rope snaps taut and the rafters answer with movement.',
              },
            },
          },
        },
      },
      fallbackSummary: 'Another failed search makes the hidden bell answer.',
    })

    expect(result.escalation).toMatchObject({
      decision: 'combat_ready',
      threatLevel: 3,
      encounterSeed: expect.objectContaining({
        title: 'Bell Ambush',
        source: 'location_catalog',
      }),
    })
    expect(result.ttrpgMetadataPatch).toMatchObject({
      ttrpgPhase: 'threat',
      combatReadiness: 'ready',
      threatLevel: 3,
      requestedGameplayAction: null,
      lastEncounterSeed: expect.objectContaining({ title: 'Bell Ambush' }),
    })
  })

  it('prefers 80_encounters catalog entries over GM or monster seed titles', () => {
    const seed = buildCatalogPreferredEncounterSeed({
      narrativeState: narrativeStateWithCatalog(adventureCatalog()),
      rawEncounterSeed: {
        title: 'Generic Trouble',
        summary: 'A generic threat gathers.',
        catalogEntryIds: ['80.99.hidden-bell-ending'],
      },
      recentOutcomeSummary: 'The crow threat responds to the bell.',
    })

    expect(seed).toMatchObject({
      title: 'Bell Ambush',
      summary: 'The rope snaps taut and the rafters answer with movement.',
      source: 'location_catalog',
      catalogEntryIds: expect.arrayContaining(['80.10.bell-ambush']),
      encounterHints: expect.arrayContaining(['Bell Ambush: The rope snaps taut and the rafters answer with movement.']),
    })
    expect(seed?.catalogEntryIds).not.toContain('80.99.hidden-bell-ending')
  })

  it('drops GM-selected reveal-gated catalog ids when a location catalog is present', () => {
    const result = normalizeSceneCheckEscalation({
      rollTier: 'failure',
      rawEscalation: {
        decision: 'danger',
        catalogEntryIds: ['80.99.hidden-bell-ending', '80.10.bell-ambush'],
        encounterSeed: {
          title: 'Bell Trouble',
          summary: 'The bell answers with visible pressure.',
          catalogEntryIds: ['30.99.hidden-crow-king'],
        },
      },
      narrativeState: narrativeStateWithCatalog(adventureCatalog()),
    })

    expect(result.escalation.catalogEntryIds).toEqual(expect.arrayContaining(['80.10.bell-ambush']))
    expect(result.escalation.catalogEntryIds).not.toContain('80.99.hidden-bell-ending')
    expect(result.escalation.encounterSeed?.catalogEntryIds).not.toContain('30.99.hidden-crow-king')
  })

  it('normalizes GM-provided scene-check encounter seed text through the public-safe filter', () => {
    const result = normalizeSceneCheckEscalation({
      rollTier: 'failure',
      rawEscalation: {
        decision: 'danger',
        encounterSeed: {
          title: 'HP 12 Bell Horror',
          summary: 'A safe watcher presses toward the stair.',
          stakes: 'Reward wallet 0x1234567890abcdef1234567890abcdef12345678 if it falls.',
        },
      },
      narrativeState: narrativeStateWithCatalog(),
    })

    expect(result.escalation.encounterSeed).toEqual(expect.objectContaining({
      summary: 'A safe watcher presses toward the stair.',
      source: 'gm',
    }))
    expect(result.escalation.encounterSeed).not.toHaveProperty('title')
    expect(result.escalation.encounterSeed).not.toHaveProperty('stakes')
    expect(JSON.stringify(result.escalation.encounterSeed)).not.toMatch(/HP|Reward|wallet|0x1234567890abcdef/i)
  })

  it('adds monster hints from 30_monsters to catalog-preferred seeds', () => {
    const seed = buildCatalogPreferredEncounterSeed({
      narrativeState: narrativeStateWithCatalog(adventureCatalog()),
      recentOutcomeSummary: 'A crow shape stalks the rafters.',
    })

    expect(seed).toMatchObject({
      source: 'location_catalog',
      catalogEntryIds: expect.arrayContaining(['30.10.crow-wight']),
      monsterHints: expect.arrayContaining(['Crow Wight: A wight nesting above the market rafters.']),
      stakes: expect.stringContaining('bell market rafters'),
    })
    expect(seed?.stakes).toContain('fallen planks')
    expect(seed?.catalogEntryIds).not.toContain('30.99.hidden-crow-king')
  })
})
