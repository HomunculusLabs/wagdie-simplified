import type { LocationRoomMessage, LocationRoomParticipant, LocationRoomTurnIntent } from '@/lib/eliza/locationRooms/types'
import type {
  NarrativeQualityAdventureState,
  NarrativeQualityAttributionMetrics,
  NarrativeQualityMetrics,
  NarrativeQualityResult,
} from '../../../../../scripts/location-room-narrative-quality'
export type { NarrativeQualityAdventureState } from '../../../../../scripts/location-room-narrative-quality'

export const BASE_TIME = '2026-05-26T12:00:00.000Z'
export const FALLBACK_CHECK_TYPES = ['perception', 'survival', 'stealth', 'persuasion', 'arcana', 'athletics'] as const

export const NARRATIVE_HARNESS_SCENARIO_COUNT = 10
export const NARRATIVE_HARNESS_TICKS_PER_SCENARIO = 30

export type ScriptedRollProfile = 'mixed' | 'fail-heavy' | 'success-heavy'

export type NarrativeHarnessScenario = {
  id: string
  locationId: string
  locationName: string
  premise: string
  openingImage: string
  objective: string
  stakes: string
  checkEvery: number
  gmNarrationEvery: number
  rollProfile: ScriptedRollProfile
  characters: Array<Pick<LocationRoomParticipant, 'tokenId' | 'name' | 'backgroundStory'>>
}

export type NarrativeHarnessOptions = {
  ticksPerScenario?: number
  scenarios?: NarrativeHarnessScenario[]
  artifactDir?: string | null
}

export type NarrativeCombatSeparationProbeResult = {
  storyWithTrigger: {
    status: string
    publicGameMasterBeatAppended: boolean
    gameplayProcessCalls: number
    gameplayRunCreates: number
    messageDomain: string | null
  }
  autoWithTrigger: {
    status: string
    gameplayRunId: string | null
    gameplayProcessCalls: number
    gameplayRunCreates: number
  }
  adminCombat: {
    status: string
    gameplayRunId: string | null
    gameplayProcessCalls: number
    gameplayRunCreates: number
  }
}

export type NarrativeEscalationValidationProbeResult = {
  failedSceneCheck: {
    status: string
    sceneCheckId: string | null
    phase: string
    combatReadiness: string
    threatLevel: number | null
    requestedGameplayAction: string | null
    lastCombatTriggerBeatId: string | null
    seedSource: string | null
    seedCatalogEntryIds: string[]
    encounterHints: string[]
    monsterHints: string[]
  }
  autoWithoutTrigger: {
    status: string
    gameplayProcessCalls: number
    gameplayRunCreates: number
    messageDomain: string | null
    requestedGameplayAction: string | null
  }
  storyWithExplicitStartCombat: {
    status: string
    gameplayProcessCalls: number
    gameplayRunCreates: number
    messageDomain: string | null
    requestedGameplayAction: string | null
    triggerId: string | null
  }
  autoWithExplicitTrigger: {
    status: string
    gameplayRunId: string | null
    gameplayProcessCalls: number
    gameplayRunCreates: number
  }
}

export type NarrativeHarnessScenarioResult = {
  scenario: NarrativeHarnessScenario
  messages: LocationRoomMessage[]
  metrics: NarrativeHarnessMetrics
  attributionMetrics: NarrativeQualityAttributionMetrics
  quality: NarrativeQualityResult
  adventureState: NarrativeQualityAdventureState
  warnings: string[]
}

export type NarrativeHarnessRunResult = {
  ticksPerScenario: number
  scenarioResults: NarrativeHarnessScenarioResult[]
  aggregate: NarrativeHarnessAggregateMetrics
}

export type NarrativeHarnessMetrics = NarrativeQualityMetrics

export type NarrativeHarnessAggregateMetrics = NarrativeHarnessMetrics & {
  scenarioCount: number
  attributionMetrics: NarrativeQualityAttributionMetrics
  warnings: string[]
  quality: NarrativeQualityResult
}

export const narrativeHarnessScenarios: NarrativeHarnessScenario[] = [
  {
    id: 'crows-den-missing-captain',
    locationId: '11',
    locationName: "Crow's Den",
    premise: 'The tavern rots around a sealed cellar door while patrons pretend not to hear a drowned captain knocking below.',
    openingImage: 'lantern smoke, wet feathers, brine in old floorboards',
    objective: 'Learn who locked the captain beneath the Crow’s Den and why the cellar still answers him.',
    stakes: 'If the crew delays, the captain bargains with something under the pilings and the tavern becomes its mouth.',
    checkEvery: 2,
    gmNarrationEvery: 3,
    rollProfile: 'mixed',
    characters: [
      { tokenId: 101, name: 'Sir Skanks', backgroundStory: 'A gutter knight with courtly manners, bad perfume, and a talent for insulting ghosts.' },
      { tokenId: 102, name: 'Mire Voss', backgroundStory: 'A failed bell-diver who knows every drowned superstition in the harbor.' },
      { tokenId: 103, name: 'Pip of the Low Rafters', backgroundStory: 'A tiny burglar-priest who treats bad luck as a negotiable tax.' },
    ],
  },
  {
    id: 'bone-market-counterfeit-relic',
    locationId: '21',
    locationName: 'Bone Market',
    premise: 'A saint’s knucklebone has been counterfeited so perfectly that both the fake and original scream when separated.',
    openingImage: 'ivory stalls, red auction candles, merchants with sewn-shut smiles',
    objective: 'Identify the false relic before the market crowns it as law.',
    stakes: 'The wrong relic will rewrite every debt in the market against the party.',
    checkEvery: 3,
    gmNarrationEvery: 4,
    rollProfile: 'success-heavy',
    characters: [
      { tokenId: 201, name: 'Mother Nacre', backgroundStory: 'A pearl-eyed appraiser who hears lies as changes in temperature.' },
      { tokenId: 202, name: 'Latch Fen', backgroundStory: 'A smiling debt-runner with a knife for every handshake.' },
      { tokenId: 203, name: 'Saint Maybe', backgroundStory: 'A pilgrim unsure whether they are holy, haunted, or both.' },
    ],
  },
  {
    id: 'sable-orchard-hunger',
    locationId: '31',
    locationName: 'Sable Orchard',
    premise: 'Black fruit ripens overnight with names carved in the skin, and one name belongs to a character present.',
    openingImage: 'branches like ribs, syrup-black fruit, bees with human teeth',
    objective: 'Find the root that is predicting deaths before it starts arranging them.',
    stakes: 'Eating the wrong fruit gives the orchard legal claim over a soul.',
    checkEvery: 2,
    gmNarrationEvery: 3,
    rollProfile: 'fail-heavy',
    characters: [
      { tokenId: 301, name: 'Vellum Jack', backgroundStory: 'A contract thief who can smell ownership.' },
      { tokenId: 302, name: 'Hush Brindle', backgroundStory: 'A poacher who speaks softly because trees listen.' },
      { tokenId: 303, name: 'Candlewick Sue', backgroundStory: 'A grave-cook with practical opinions about curses.' },
    ],
  },
  {
    id: 'ash-chapel-last-sermon',
    locationId: '41',
    locationName: 'Ash Chapel',
    premise: 'The chapel bell rings without sound, and each silent toll removes one memory from the congregation.',
    openingImage: 'white ash, cracked pews, a bell rope swinging in still air',
    objective: 'Recover the sermon hidden inside the stolen memories.',
    stakes: 'When the last verse is forgotten, the chapel chooses a new god.',
    checkEvery: 3,
    gmNarrationEvery: 3,
    rollProfile: 'mixed',
    characters: [
      { tokenId: 401, name: 'Deacon Ratsmile', backgroundStory: 'An ex-cleric who trusts omens only after threatening them.' },
      { tokenId: 402, name: 'Low Mercy', backgroundStory: 'A choir deserter with a voice that wakes old fires.' },
      { tokenId: 403, name: 'Grim Button', backgroundStory: 'A child-sized undertaker who collects last words.' },
    ],
  },
  {
    id: 'glass-warrens-echo-thief',
    locationId: '51',
    locationName: 'Glass Warrens',
    premise: 'Mirrors under the street are stealing reflections and sending them back with better plans.',
    openingImage: 'fractured tunnels, candle doubles, silver dust in bootprints',
    objective: 'Catch the reflection that escaped with the map of tomorrow.',
    stakes: 'Every unchecked reflection makes one party choice before the party can.',
    checkEvery: 3,
    gmNarrationEvery: 5,
    rollProfile: 'mixed',
    characters: [
      { tokenId: 501, name: 'Nix Nickel', backgroundStory: 'A mirror-smith who refuses to look straight at anything honest.' },
      { tokenId: 502, name: 'Odd Tallow', backgroundStory: 'A candle-duelist with two shadows and no patience.' },
      { tokenId: 503, name: 'Bristle Saint', backgroundStory: 'A ratcatcher prophet whose prophecies mostly bite.' },
    ],
  },
  {
    id: 'red-mill-tax-of-blood',
    locationId: '61',
    locationName: 'Red Mill',
    premise: 'The mill turns without wind and grinds names into flour that feeds a hungry noble house.',
    openingImage: 'red sails, flour like bone dust, a ledger nailed to the door',
    objective: 'Stop the mill before it grinds a living lineage out of history.',
    stakes: 'Each turn of the wheel erases one proof that the victims existed.',
    checkEvery: 2,
    gmNarrationEvery: 4,
    rollProfile: 'fail-heavy',
    characters: [
      { tokenId: 601, name: 'Brass Edda', backgroundStory: 'A tax widow with a mace and immaculate records.' },
      { tokenId: 602, name: 'Moth-Gnaw', backgroundStory: 'A granary scout who can read tracks in spilled flour.' },
      { tokenId: 603, name: 'Lord Almost', backgroundStory: 'A disgraced heir whose title keeps trying to crawl back.' },
    ],
  },
  {
    id: 'moon-ferry-no-passenger',
    locationId: '71',
    locationName: 'Moon Ferry',
    premise: 'The ferry arrives each night carrying nobody, but its passenger list grows wetter and more specific.',
    openingImage: 'pale water, rope burns, ticket stubs with fresh fingerprints',
    objective: 'Board the ferry and learn who is buying passage for the unwilling.',
    stakes: 'At moonset, the listed passengers will depart whether they boarded or not.',
    checkEvery: 3,
    gmNarrationEvery: 3,
    rollProfile: 'success-heavy',
    characters: [
      { tokenId: 701, name: 'Oarless Thom', backgroundStory: 'A ferryman who lost his boat but not his toll knife.' },
      { tokenId: 702, name: 'June Rot', backgroundStory: 'A corpse-florist who treats mourning as logistics.' },
      { tokenId: 703, name: 'Velvet Midge', backgroundStory: 'A spy so small rumors use them as punctuation.' },
    ],
  },
  {
    id: 'salt-library-index-war',
    locationId: '81',
    locationName: 'Salt Library',
    premise: 'A forbidden index has started filing people by the deaths they deserve.',
    openingImage: 'salt shelves, blind scribes, pages that sweat seawater',
    objective: 'Find and amend the index before it catalogs the party.',
    stakes: 'Once indexed, a death becomes administratively difficult to avoid.',
    checkEvery: 3,
    gmNarrationEvery: 4,
    rollProfile: 'mixed',
    characters: [
      { tokenId: 801, name: 'Index Molly', backgroundStory: 'A librarian-bandit who knows every alphabet except mercy.' },
      { tokenId: 802, name: 'Calx the Damp', backgroundStory: 'A salt alchemist always dissolving at the edges.' },
      { tokenId: 803, name: 'Quillbreaker', backgroundStory: 'A censor who now destroys records for ethical reasons.' },
    ],
  },
  {
    id: 'wolf-court-empty-throne',
    locationId: '91',
    locationName: 'Wolf Court',
    premise: 'The wolves have elected an empty throne, and it has begun issuing hunting laws.',
    openingImage: 'fur banners, antler gavels, a throne breathing in the cold',
    objective: 'Determine who speaks through the throne before the court sentences the town.',
    stakes: 'The next verdict makes every road a legal hunting ground.',
    checkEvery: 2,
    gmNarrationEvery: 3,
    rollProfile: 'fail-heavy',
    characters: [
      { tokenId: 901, name: 'Fang Notary', backgroundStory: 'A legalist werewolf who believes loopholes are sacred wounds.' },
      { tokenId: 902, name: 'Pale Antler', backgroundStory: 'A hunter haunted by the prey they respected.' },
      { tokenId: 903, name: 'Scrap Duchess', backgroundStory: 'A junkyard aristocrat with court gossip in every pocket.' },
    ],
  },
  {
    id: 'black-lantern-wake',
    locationId: '101',
    locationName: 'Black Lantern Wake',
    premise: 'A funeral lantern refuses to go out because the corpse has not finished accusing everyone.',
    openingImage: 'rain on mourning glass, black flame, guests hiding silver pins',
    objective: 'Let the dead finish the accusation without letting the accusation choose another corpse.',
    stakes: 'If the lantern burns until dawn, grief becomes contagious law.',
    checkEvery: 3,
    gmNarrationEvery: 5,
    rollProfile: 'mixed',
    characters: [
      { tokenId: 1001, name: 'Auntie Grief', backgroundStory: 'A professional mourner with a brutally practical bedside manner.' },
      { tokenId: 1002, name: 'Pinch Chapel', backgroundStory: 'A pickpocket who steals confessions before purses.' },
      { tokenId: 1003, name: 'Dove Eater', backgroundStory: 'A peace envoy who has made several nutritional compromises.' },
    ],
  },
]
