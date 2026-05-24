/**
 * @jest-environment node
 */

import {
  mergeNarrativeTtrpgMetadata,
  normalizeEncounterSeed,
  normalizeNarrativeTtrpgMetadata,
} from '@/lib/eliza/locationRooms/narrativeTypes'

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

    expect(mergeNarrativeTtrpgMetadata({ privateNote: 'keep' }, {
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
