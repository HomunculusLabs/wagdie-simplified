/**
 * @jest-environment node
 */

import {
  mergeAdventureMetadata,
  mergeNarrativeTtrpgMetadata,
  normalizeAdventureMemory,
  normalizeAdventurePatch,
  normalizeDeclaredAction,
  normalizeEncounterSeed,
  normalizeNarrativeTtrpgMetadata,
  recordAdventureDeclaredAction,
  retrieveAdventureCatalogEntries,
  seedAdventureMetadataFromCatalog,
} from '@/lib/eliza/locationRooms/narrativeTypes'
import type { NormalizedLocationAdventureCatalog } from '@/lib/domain/location/metadata-types'

describe('location room narrative TTRPG metadata helpers', () => {
  it('normalizes missing and malformed metadata to public-safe defaults', () => {
    expect(normalizeNarrativeTtrpgMetadata({
      ttrpgPhase: 'boss_fight',
      combatReadiness: 'immediate',
      threatLevel: true,
      requestedGameplayAction: 'spawn_loot',
      encounterSeed: { privateHp: 100 },
      lastCombatTriggerBeatId: '  beat-1  ',
      consumedCombatTriggerBeatId: 42,
    })).toEqual({
      ttrpgPhase: 'story',
      combatReadiness: 'none',
      threatLevel: null,
      requestedGameplayAction: null,
      lastEncounterSeed: null,
      lastCombatTriggerBeatId: 'beat-1',
      consumedCombatTriggerBeatId: null,
    })
  })

  it('sanitizes encounter seeds and merges canonical TTRPG fields with existing metadata', () => {
    const encounterSeed = normalizeEncounterSeed({
      publicTitle: '  Bell   Horror  ',
      publicSummary: ' A horror answers the bell. ',
      stakes: ' Survive the toll. ',
      mechanics: { dc: 99 },
    })

    expect(encounterSeed).toEqual({
      title: 'Bell Horror',
      summary: 'A horror answers the bell.',
      stakes: 'Survive the toll.',
    })

    expect(mergeNarrativeTtrpgMetadata({
      privateNote: 'keep',
      gmGeneration: {
        status: 'repaired',
        repairAttempted: true,
        repaired: true,
        initialErrorCategory: 'invalid_json',
      },
    }, {
      ttrpgPhase: 'threat',
      combatReadiness: 'ready',
      threatLevel: 4,
      requestedGameplayAction: 'start_combat',
      lastEncounterSeed: encounterSeed,
      lastCombatTriggerBeatId: 'beat-2',
    }, {
      source: 'test',
    })).toEqual({
      privateNote: 'keep',
      gmGeneration: {
        status: 'repaired',
        repairAttempted: true,
        repaired: true,
        initialErrorCategory: 'invalid_json',
      },
      source: 'test',
      ttrpgPhase: 'threat',
      combatReadiness: 'ready',
      threatLevel: 4,
      requestedGameplayAction: 'start_combat',
      lastEncounterSeed: encounterSeed,
      lastCombatTriggerBeatId: 'beat-2',
      consumedCombatTriggerBeatId: null,
    })
  })
})

describe('location room adventure metadata helpers', () => {
  it('normalizes missing and unsafe adventure metadata to bounded defaults', () => {
    expect(normalizeAdventureMemory({})).toEqual({
      arcSummary: null,
      currentStakes: null,
      activeDecision: null,
      consequenceLedger: [],
      discoveries: [],
      clocks: [],
      spatialContext: {
        currentArea: null,
        landmarks: [],
        routes: [],
        unresolvedSpatialQuestions: [],
      },
      lastDeclaredAction: null,
      lastOutcome: null,
    })

    const memory = normalizeAdventureMemory({
      adventure: {
        arcSummary: ' Track   the bell cult. ',
        currentStakes: 'wallet 0x1234567890123456789012345678901234567890',
        activeDecision: {
          id: ' Approach Choice ',
          prompt: ' How do you enter? ',
          options: [
            { id: 'front', label: 'Front gate' },
            { id: 'crypt', label: 'Crypt stairs' },
            { id: 'roof', label: 'Roofline' },
            { id: 'well', label: 'Well shaft' },
            { id: 'extra', label: 'Too much' },
          ],
          selectedOptionId: 'crypt',
        },
        consequenceLedger: Array.from({ length: 10 }, (_, index) => ({
          id: `c-${index}`,
          source: `beat-${index}`,
          summary: `Consequence ${index}`,
          status: 'complication',
        })),
        discoveries: [' Ash on the latch ', 'Ash on the latch', 'The bell is hollow', 'HP total is 4'],
        clocks: [
          { id: 'alarm', label: 'Alarm', value: 99, max: 6, summary: 'The bell wakes.' },
        ],
      },
    })

    expect(memory.arcSummary).toBe('Track the bell cult.')
    expect(memory.currentStakes).toBeNull()
    expect(memory.activeDecision).toMatchObject({
      id: 'approach-choice',
      selectedOptionId: 'crypt',
      selectedOptionLabel: 'Crypt stairs',
    })
    expect(memory.activeDecision?.options).toHaveLength(4)
    expect(memory.consequenceLedger).toHaveLength(8)
    expect(memory.discoveries).toEqual(['Ash on the latch', 'The bell is hollow'])
    expect(memory.clocks).toEqual([{ id: 'alarm', label: 'Alarm', value: 6, max: 6, summary: 'The bell wakes.' }])
  })

  it('normalizes patches, dedupes consequences, and uses absolute clock values idempotently', () => {
    const first = mergeAdventureMetadata({}, {
      arcSummary: 'The crows test the intruders.',
      currentStakes: 'The gate may seal before dawn.',
      activeDecision: {
        id: 'gate-choice',
        prompt: 'Which route do you press?',
        options: [
          { id: 'bell', label: 'Ring the bell' },
          { id: 'ash', label: 'Read the ash' },
        ],
      },
      consequence: {
        summary: 'The bell marks the party with soot.',
        status: 'complication',
      },
      discoveries: ['The lock listens for names.'],
      clockUpdates: [{ id: 'alarm', label: 'Alarm', value: 2, max: 6, summary: 'The belfry is stirring.' }],
    }, { sourceId: 'beat:1' })

    const retried = mergeAdventureMetadata(first, {
      consequence: {
        summary: 'The bell marks the party with soot.',
        status: 'complication',
      },
      clockUpdates: [{ id: 'alarm', label: 'Alarm', value: 2, max: 6, summary: 'The belfry is stirring.' }],
    }, { sourceId: 'beat:1' })

    expect(normalizeAdventureMemory(retried).consequenceLedger).toHaveLength(1)
    expect(normalizeAdventureMemory(retried).clocks).toEqual([
      { id: 'alarm', label: 'Alarm', value: 2, max: 6, summary: 'The belfry is stirring.' },
    ])

    const cleared = mergeAdventureMetadata(retried, { activeDecision: null })
    expect(normalizeAdventureMemory(cleared).activeDecision).toBeNull()

    const fullDiscoveries = mergeAdventureMetadata({}, {
      discoveries: Array.from({ length: 10 }, (_, index) => `Clue ${index}`),
    })
    const withNewDiscovery = mergeAdventureMetadata(fullDiscoveries, { discoveries: ['New clue'] })
    expect(normalizeAdventureMemory(withNewDiscovery).discoveries).toEqual([
      'Clue 1',
      'Clue 2',
      'Clue 3',
      'Clue 4',
      'Clue 5',
      'Clue 6',
      'Clue 7',
      'Clue 8',
      'Clue 9',
      'New clue',
    ])
  })

  it('validates declared action option selection against the active decision', () => {
    const metadata = mergeAdventureMetadata({}, {
      activeDecision: {
        id: 'door-choice',
        prompt: 'Choose a door.',
        options: [
          { id: 'red', label: 'Red door' },
          { id: 'black', label: 'Black door' },
        ],
      },
    })
    const activeDecision = normalizeAdventureMemory(metadata).activeDecision

    expect(normalizeDeclaredAction({ summary: 'I open the red door.', chosenOptionId: 'red', actionIntent: 'explore' }, { activeDecision })).toEqual({
      summary: 'I open the red door.',
      chosenOptionId: 'red',
      chosenOptionLabel: 'Red door',
      actionIntent: 'explore',
    })
    expect(normalizeDeclaredAction({ summary: 'I invent another way.', chosenOptionId: 'secret' }, { activeDecision })).toEqual({
      summary: 'I invent another way.',
    })

    const recorded = recordAdventureDeclaredAction(metadata, {
      summary: 'I open the black door.',
      chosenOptionId: 'black',
    }, { tokenId: 1443, beatId: 'beat-2' })

    expect(normalizeAdventureMemory(recorded).activeDecision).toMatchObject({
      selectedOptionId: 'black',
      selectedOptionLabel: 'Black door',
    })
    expect(normalizeAdventureMemory(recorded).lastDeclaredAction).toMatchObject({
      tokenId: 1443,
      beatId: 'beat-2',
      summary: 'I open the black door.',
      chosenOptionId: 'black',
    })
  })

  it('seeds from catalog only for empty memory unless reseed is explicit and retrieves bounded relevant entries', () => {
    const catalog: NormalizedLocationAdventureCatalog = {
      defaults: {
        arcSummary: 'The gate weighs every bargain.',
        currentStakes: 'The market closes when the third bell rings.',
        openingDecision: {
          id: 'market-choice',
          prompt: 'Who do you approach?',
          options: [{ id: 'merchant', label: 'The bell merchant' }],
        },
        discoveries: ['The bell merchant hates mirrors.'],
        clocks: [{ id: 'third-bell', label: 'Third bell', value: 1, max: 6, summary: 'The market is closing.' }],
      },
      sections: {
        '00_setting': [],
        '10_plot': [],
        '20_characters': [{ id: '20.10.bell-merchant', section: '20_characters', title: 'Bell Merchant', summary: 'A merchant who trades in cursed bells.', tags: ['merchant', 'bell'] }],
        '30_monsters': [{ id: '30.10.crow-wight', section: '30_monsters', title: 'Crow Wight', summary: 'A wight nesting above the market.', tags: ['crow', 'threat'] }],
        '40_places': [
          { id: '40.99.hidden-vault', section: '40_places', title: 'Hidden Vault', summary: 'A reveal-gated vault beneath the market.', tags: ['vault'], revealConditions: ['discovery:hidden-vault'] },
          { id: '40.10.mirror-arch', section: '40_places', title: 'Mirror Arch', summary: 'A mirror-bright arch opens a quieter market route.', tags: ['arch', 'route'] },
        ],
        '50_items': [{ id: '50.10.hush-map', section: '50_items', title: 'Hush Map', summary: 'A folded map that marks quiet routes.', tags: ['map', 'route'] }],
        '60_shops_services': [{ id: '60.10.black-market', section: '60_shops_services', title: 'Black Market', summary: 'A stall selling hush-maps.', tags: ['merchant', 'market'] }],
        '70_factions': [],
        '80_encounters': [],
        '90_rules_guidance': [],
      },
    }

    const seeded = seedAdventureMetadataFromCatalog({}, catalog)
    expect(normalizeAdventureMemory(seeded)).toMatchObject({
      arcSummary: 'The gate weighs every bargain.',
      currentStakes: 'The market closes when the third bell rings.',
      activeDecision: expect.objectContaining({ id: 'market-choice' }),
    })

    const live = mergeAdventureMetadata(seeded, { arcSummary: 'Live room arc.' })
    expect(normalizeAdventureMemory(seedAdventureMetadataFromCatalog(live, catalog)).arcSummary).toBe('Live room arc.')
    const reseeded = normalizeAdventureMemory(seedAdventureMetadataFromCatalog(
      mergeAdventureMetadata(live, { consequence: { summary: 'Old cost.', status: 'open' } }, { sourceId: 'beat:old' }),
      catalog,
      { reseed: true }
    ))
    expect(reseeded.arcSummary).toBe('The gate weighs every bargain.')
    expect(reseeded.consequenceLedger).toEqual([])

    expect(retrieveAdventureCatalogEntries(catalog, {
      currentObjective: 'Find the merchant in the market.',
      tags: ['merchant'],
      limit: 2,
    }).map((entry) => entry.id)).toEqual(['60.10.black-market', '20.10.bell-merchant'])

    const spatialResults = retrieveAdventureCatalogEntries(catalog, {
      currentObjective: 'Open the hidden vault without alerting the market.',
      spatialContext: {
        currentArea: 'Market threshold near the mirror arch',
        landmarks: ['mirror-bright arch'],
        routes: ['quiet route under the arch'],
        unresolvedSpatialQuestions: ['Where does the arch route surface?'],
      },
      discoveries: ['The mirror arch listens for quiet steps.'],
      lastDeclaredAction: { tokenId: 1443, beatId: 'beat-2', summary: 'I unfold the hush-map.', actionIntent: 'search' },
      clocks: [{ id: 'third-bell', label: 'Third bell', value: 2, max: 6, summary: 'The market alarm nears.' }],
      limit: 3,
    }).map((entry) => entry.id)
    expect(spatialResults[0]).toBe('40.10.mirror-arch')
    expect(spatialResults).toContain('50.10.hush-map')
    expect(spatialResults).not.toContain('40.99.hidden-vault')
  })

  it('drops unsafe patch fields before merge', () => {
    const patch = normalizeAdventurePatch({
      currentStakes: 'Track wallet 0x1234567890123456789012345678901234567890',
      consequence: { summary: 'Gain reward XP.', status: 'advantage' },
      discoveries: ['Safe clue', 'private key appears'],
    }, { sourceId: 'beat:unsafe' })

    expect(patch).toEqual({ discoveries: ['Safe clue'] })
  })
})
