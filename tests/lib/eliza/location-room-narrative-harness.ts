/**
 * Deterministic location-room narrative simulation harness.
 *
 * This intentionally drives LocationRoomService.requestTickAndProcess(...) instead of
 * testing the coordinator in isolation. It gives us a fast API-path proxy for narrative
 * quality checks without waiting for scheduled ticks or live LLM calls.
 */

import { elizaConfig } from '@/lib/eliza/config'
import { DefaultLocationRoomNarrativeCoordinator, type GameMasterAgentResolver } from '@/lib/eliza/locationRooms/narrativeCoordinator'
import { normalizeSceneCheckEscalation } from '@/lib/eliza/locationRooms/encounterEscalation'
import { normalizeSceneCheckRequest } from '@/lib/eliza/locationRooms/sceneChecks/rules'
import type { SceneCheckActionIntent } from '@/lib/eliza/locationRooms/sceneChecks/types'
import type {
  GameMasterBeatGenerator,
  GameMasterBeatOutput,
  GenerateGameMasterBeatInput,
  GenerateGameMasterSceneCheckOutcomeInput,
  GameMasterSceneCheckOutcomeOutput,
} from '@/lib/eliza/locationRooms/gameMasterGenerator'
import type { LocationRoomMembershipRepository } from '@/lib/eliza/locationRooms/membership'
import type { LocationRoomNarrativeRepository } from '@/lib/eliza/locationRooms/narrativeRepository'
import { normalizeAdventureMemory, normalizeNarrativeTtrpgMetadata } from '@/lib/eliza/locationRooms/narrativeTypes'
import type {
  LocationRoomNarrativeBeat,
  LocationRoomNarrativeState,
  LocationRoomNarrativeStateSnapshot,
  LocationRoomAdventurePatch,
} from '@/lib/eliza/locationRooms/narrativeTypes'
import type { OfficialLocationRoomTurnGenerator } from '@/lib/eliza/locationRooms/officialTurnGenerator'
import type { LocationRoomGameplayCoordinator } from '@/lib/eliza/locationRooms/gameplay/coordinator'
import type { LocationRoomGameplayRepository } from '@/lib/eliza/locationRooms/gameplay/repository'
import type { GameplayRun, GameplayRunStartedByActor } from '@/lib/eliza/locationRooms/gameplay/types'
import type { CreateLocationRoomMessageInput, LocationRoomRepository } from '@/lib/eliza/locationRooms/repository'
import { LocationRoomService } from '@/lib/eliza/locationRooms/service'
import type {
  GenerateOfficialLocationRoomTurnInput,
  GenerateOfficialLocationRoomTurnResult,
  LocationRoom,
  LocationRoomLocation,
  LocationRoomLocationDetails,
  LocationRoomMessage,
  LocationRoomParticipant,
  LocationRoomPublicAuthorMessageStats,
  LocationRoomPublicMessageStats,
  LocationRoomTick,
  LocationRoomTurnIntent,
} from '@/lib/eliza/locationRooms/types'
import {
  analyzeNarrativeMessages as analyzeQualityNarrativeMessages,
  scoreNarrativeQuality,
  warningsForNarrativeQuality,
  type NarrativeQualityAdventureState,
  type NarrativeQualityMetrics,
  type NarrativeQualityResult,
} from '../../../scripts/location-room-narrative-quality'

export const NARRATIVE_HARNESS_SCENARIO_COUNT = 10
export const NARRATIVE_HARNESS_TICKS_PER_SCENARIO = 30

const BASE_TIME = '2026-05-26T12:00:00.000Z'
const FALLBACK_CHECK_TYPES = ['perception', 'survival', 'stealth', 'persuasion', 'arcana', 'athletics'] as const

type ScriptedRollProfile = 'mixed' | 'fail-heavy' | 'success-heavy'

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

function roomFor(scenario: NarrativeHarnessScenario): LocationRoom {
  return {
    id: `room-${scenario.locationId}`,
    locationId: scenario.locationId,
    officialRoomId: `official-room-${scenario.locationId}`,
    officialWorldId: 'official-world-test',
    officialUserId: 'official-user-test',
    channelId: `wagdie-location-${scenario.locationId}`,
    tickEnabled: true,
    lastTickAt: null,
    nextTickAt: null,
    tickCount: 0,
    lastError: null,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
  }
}

function participantFor(scenario: NarrativeHarnessScenario, character: NarrativeHarnessScenario['characters'][number]): LocationRoomParticipant {
  return {
    tokenId: character.tokenId,
    name: character.name,
    imageUrl: null,
    backgroundStory: character.backgroundStory ?? null,
    ownerAddress: `0x${character.tokenId.toString(16).padStart(40, '0')}`,
    stakerAddress: null,
    locationId: scenario.locationId,
    characterClass: null,
    level: null,
    coreStats: null,
    maxHp: null,
    ac: null,
    speed: null,
  }
}

function tickFor(scenario: NarrativeHarnessScenario, sequence: number, intent: LocationRoomTurnIntent = 'auto'): LocationRoomTick {
  return {
    id: `tick-${scenario.id}-${sequence}`,
    roomId: `room-${scenario.locationId}`,
    locationId: scenario.locationId,
    gameplayRunId: null,
    turnIntent: intent,
    triggerType: 'admin',
    requestedByWallet: null,
    requestedByTokenId: null,
    status: 'processing',
    attempts: 1,
    nextAttemptAt: new Date(new Date(BASE_TIME).getTime() + sequence * 60_000).toISOString(),
    lockedAt: BASE_TIME,
    lockedBy: 'narrative-harness',
    selectedTokenId: null,
    startedAt: BASE_TIME,
    completedAt: null,
    lastError: null,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
  }
}

function initialNarrativeState(scenario: NarrativeHarnessScenario): LocationRoomNarrativeState {
  return {
    id: `state-${scenario.id}`,
    roomId: `room-${scenario.locationId}`,
    locationId: scenario.locationId,
    stateSummary: scenario.premise,
    currentObjective: scenario.objective,
    openThreads: [scenario.stakes],
    metadata: {},
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
  }
}

function stateSnapshot(state: LocationRoomNarrativeState): LocationRoomNarrativeStateSnapshot {
  return {
    stateSummary: state.stateSummary,
    currentObjective: state.currentObjective,
    openThreads: state.openThreads,
  }
}

class InMemoryLocationRoomRepository {
  public readonly messages: LocationRoomMessage[] = []
  public completedTicks = 0
  public failedTicks = 0
  private pendingTick: LocationRoomTick | null = null
  private messageSequence = 0
  private readonly room: LocationRoom
  private readonly location: LocationRoomLocationDetails

  constructor(
    private readonly scenario: NarrativeHarnessScenario,
    locationMetadata: Record<string, unknown> = {}
  ) {
    this.room = roomFor(scenario)
    this.location = {
      id: scenario.locationId,
      name: scenario.locationName,
      chainLocationId: null,
      active: true,
      metadata: locationMetadata,
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
    }
  }

  async getLocation(): Promise<LocationRoomLocation | null> {
    return { id: this.location.id, name: this.location.name }
  }

  async getLocationDetails(): Promise<LocationRoomLocationDetails | null> {
    return this.location
  }

  async listLocationsByIds(): Promise<LocationRoomLocationDetails[]> {
    return [this.location]
  }

  async findRoomById(): Promise<LocationRoom | null> {
    return this.room
  }

  async findRoomByLocationId(): Promise<LocationRoom | null> {
    return this.room
  }

  async ensureRoomForLocation(): Promise<LocationRoom> {
    return this.room
  }

  async listDueRooms(): Promise<LocationRoom[]> {
    return [this.room]
  }

  async enqueueTick(input: { turnIntent?: LocationRoomTurnIntent | null }): Promise<{ tick: LocationRoomTick | null; deduped: boolean }> {
    const tick = tickFor(this.scenario, this.completedTicks + this.failedTicks + 1, input.turnIntent ?? 'auto')
    this.pendingTick = tick
    return { tick, deduped: false }
  }

  async promoteOpenTickIntent(input: { turnIntent: LocationRoomTurnIntent }): Promise<LocationRoomTick | null> {
    if (!this.pendingTick) return null
    this.pendingTick = { ...this.pendingTick, turnIntent: input.turnIntent }
    return this.pendingTick
  }

  async attachTickToGameplayRun(input?: { gameplayRunId?: string | null }): Promise<LocationRoomTick | null> {
    if (!this.pendingTick) return null
    this.pendingTick = { ...this.pendingTick, gameplayRunId: input?.gameplayRunId ?? this.pendingTick.gameplayRunId }
    return this.pendingTick
  }

  async countCompletedGameplayTurnsForRun(): Promise<number> {
    return 0
  }

  async findOpenTickForRoom(): Promise<LocationRoomTick | null> {
    return this.pendingTick
  }

  async findRecentCompletedOwnerTick(): Promise<LocationRoomTick | null> {
    return null
  }

  async findOldestProcessableTickForRoom(): Promise<LocationRoomTick | null> {
    return this.pendingTick
  }

  async findNonStaleProcessingTickForRoom(): Promise<LocationRoomTick | null> {
    return null
  }

  async claimTick(tickId: string): Promise<LocationRoomTick | null> {
    if (!this.pendingTick || this.pendingTick.id !== tickId) return null
    const claimed = { ...this.pendingTick, status: 'processing' as const, lockedAt: BASE_TIME, lockedBy: 'narrative-harness', startedAt: BASE_TIME }
    this.pendingTick = claimed
    return claimed
  }

  async claimDueTicks(): Promise<LocationRoomTick[]> {
    return this.pendingTick ? [this.pendingTick] : []
  }

  async listActiveTicksForRoom(): Promise<LocationRoomTick[]> {
    return this.pendingTick ? [this.pendingTick] : []
  }

  async listRecentTicksForRoom(): Promise<LocationRoomTick[]> {
    return this.pendingTick ? [this.pendingTick] : []
  }

  async getPublicMessageStats(): Promise<LocationRoomPublicMessageStats> {
    return {
      messageCount: this.messages.length,
      latestSequence: this.messages.at(-1)?.sequence ?? null,
      latestCreatedAt: this.messages.at(-1)?.createdAt ?? null,
    }
  }

  async getPublicAuthorMessageStats(): Promise<LocationRoomPublicAuthorMessageStats> {
    const publicMessages = this.messages.filter((message) => message.visibility === 'public')
    const gmMessages = publicMessages.filter((message) => message.authorKind === 'game_master')
    const agentMessages = publicMessages.filter((message) => message.authorKind === 'agent')
    return {
      messageCount: publicMessages.length,
      gameMasterMessageCount: gmMessages.length,
      agentMessageCount: agentMessages.length,
      latestGameMasterMessageCreatedAt: gmMessages.at(-1)?.createdAt ?? null,
      latestAgentMessageCreatedAt: agentMessages.at(-1)?.createdAt ?? null,
    }
  }

  async markTickSelected(tickId: string, tokenId: number): Promise<LocationRoomTick> {
    const selected = { ...(this.pendingTick ?? tickFor(this.scenario, 0)), id: tickId, selectedTokenId: tokenId }
    this.pendingTick = selected
    return selected
  }

  async appendMessage(input: CreateLocationRoomMessageInput): Promise<LocationRoomMessage> {
    const message: LocationRoomMessage = {
      id: `msg-${this.scenario.id}-${++this.messageSequence}`,
      roomId: input.roomId,
      locationId: input.locationId,
      tickId: input.tickId ?? null,
      sequence: this.messageSequence,
      visibility: input.visibility,
      authorKind: input.authorKind,
      tokenId: input.tokenId ?? null,
      officialAgentId: input.officialAgentId ?? null,
      authorName: input.authorName,
      content: input.content,
      metadata: input.metadata ?? {},
      createdAt: new Date(new Date(BASE_TIME).getTime() + this.messageSequence * 1000).toISOString(),
    }
    this.messages.push(message)
    return message
  }

  async markTickCompleted(tickId: string): Promise<LocationRoomTick> {
    const completed = { ...(this.pendingTick ?? tickFor(this.scenario, this.completedTicks + 1)), id: tickId, status: 'completed' as const, completedAt: BASE_TIME }
    this.completedTicks += 1
    this.pendingTick = null
    this.room.tickCount += 1
    return completed
  }

  async markTickSkipped(tickId: string): Promise<LocationRoomTick> {
    const skipped = { ...(this.pendingTick ?? tickFor(this.scenario, this.completedTicks + 1)), id: tickId, status: 'skipped' as const, completedAt: BASE_TIME }
    this.pendingTick = null
    return skipped
  }

  async markTickFailed(tickId: string, error: string): Promise<LocationRoomTick> {
    const failed = { ...(this.pendingTick ?? tickFor(this.scenario, this.failedTicks + 1)), id: tickId, status: 'failed' as const, lastError: error }
    this.failedTicks += 1
    this.pendingTick = null
    return failed
  }

  async markTickDead(tickId: string, error: string): Promise<LocationRoomTick> {
    const dead = { ...(this.pendingTick ?? tickFor(this.scenario, this.failedTicks + 1)), id: tickId, status: 'dead' as const, lastError: error, completedAt: BASE_TIME }
    this.failedTicks += 1
    this.pendingTick = null
    return dead
  }

  async updateRoomAfterProcessedTick(_room: LocationRoom, params: { now: Date }): Promise<LocationRoom> {
    this.room.lastTickAt = params.now.toISOString()
    this.room.nextTickAt = new Date(params.now.getTime() + 120_000).toISOString()
    this.room.updatedAt = params.now.toISOString()
    return this.room
  }

  async recordRoomError(): Promise<void> {}

  async listPublicMessages(params: { page: number; pageSize: number }): Promise<{ messages: LocationRoomMessage[]; total: number; page: number; pageSize: number; hasMore: boolean }> {
    return {
      messages: this.messages.slice(0, params.pageSize),
      total: this.messages.length,
      page: params.page,
      pageSize: params.pageSize,
      hasMore: this.messages.length > params.page * params.pageSize,
    }
  }

  async listRecentPublicMessages(_roomId: string, limit: number): Promise<LocationRoomMessage[]> {
    return this.messages.slice(-limit)
  }
}

class InMemoryNarrativeRepository {
  private state: LocationRoomNarrativeState
  private readonly beats = new Map<string, LocationRoomNarrativeBeat>()

  constructor(
    private readonly scenario: NarrativeHarnessScenario,
    initialMetadata: Record<string, unknown> = {}
  ) {
    this.state = { ...initialNarrativeState(scenario), metadata: initialMetadata }
  }

  getState(): LocationRoomNarrativeState {
    return this.state
  }

  async findStateByRoomId(): Promise<LocationRoomNarrativeState | null> {
    return this.state
  }

  async ensureStateForRoom(): Promise<LocationRoomNarrativeState> {
    return this.state
  }

  async updateState(_room: Pick<LocationRoom, 'id'>, input: Partial<LocationRoomNarrativeState>): Promise<LocationRoomNarrativeState> {
    this.state = {
      ...this.state,
      stateSummary: input.stateSummary ?? this.state.stateSummary,
      currentObjective: input.currentObjective ?? this.state.currentObjective,
      openThreads: input.openThreads ?? this.state.openThreads,
      metadata: input.metadata ?? this.state.metadata,
      updatedAt: BASE_TIME,
    }
    return this.state
  }

  async findBeatByTickId(tickId: string): Promise<LocationRoomNarrativeBeat | null> {
    return [...this.beats.values()].find((beat) => beat.tickId === tickId) ?? null
  }

  async listRecentBeatsByRoomId(): Promise<LocationRoomNarrativeBeat[]> {
    return [...this.beats.values()].slice(-12)
  }

  async createOrReuseBeat(input: { tick: LocationRoomTick | { id: string }; selectedTokenId?: number | null; gameMasterAgentId?: string | null; stateBefore?: LocationRoomNarrativeStateSnapshot | Record<string, unknown>; metadata?: Record<string, unknown> }): Promise<LocationRoomNarrativeBeat> {
    const tickId = input.tick.id
    const existing = await this.findBeatByTickId(tickId)
    if (existing) return existing
    const beat: LocationRoomNarrativeBeat = {
      id: `beat-${this.scenario.id}-${this.beats.size + 1}`,
      roomId: `room-${this.scenario.locationId}`,
      locationId: this.scenario.locationId,
      tickId,
      status: 'planned',
      selectedTokenId: input.selectedTokenId ?? null,
      gameMasterAgentId: input.gameMasterAgentId ?? null,
      publicNarration: null,
      speakerInstruction: null,
      stateBefore: input.stateBefore ?? stateSnapshot(this.state),
      stateAfter: {},
      metadata: input.metadata ?? {},
      lastError: null,
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
      completedAt: null,
    }
    this.beats.set(beat.id, beat)
    return beat
  }

  async storeBeatGameMasterOutput(beatId: string, output: { gameMasterAgentId?: string | null; publicNarration?: string | null; speakerInstruction?: string | null; stateAfter?: LocationRoomNarrativeStateSnapshot | Record<string, unknown>; metadata?: Record<string, unknown> }): Promise<LocationRoomNarrativeBeat> {
    return this.patchBeat(beatId, {
      gameMasterAgentId: output.gameMasterAgentId ?? null,
      publicNarration: output.publicNarration ?? null,
      speakerInstruction: output.speakerInstruction ?? null,
      stateAfter: output.stateAfter ?? {},
      metadata: output.metadata ?? {},
    })
  }

  async patchBeatMetadata(beatId: string, metadata: Record<string, unknown>): Promise<LocationRoomNarrativeBeat> {
    return this.patchBeat(beatId, { metadata })
  }

  async markBeatGameMasterMessageAppended(beatId: string, output: { gameMasterAgentId?: string | null; publicNarration?: string | null; speakerInstruction?: string | null; stateAfter?: LocationRoomNarrativeStateSnapshot | Record<string, unknown>; metadata?: Record<string, unknown> }): Promise<LocationRoomNarrativeBeat> {
    return this.patchBeat(beatId, {
      status: 'game_master_message_appended',
      gameMasterAgentId: output.gameMasterAgentId ?? null,
      publicNarration: output.publicNarration ?? null,
      speakerInstruction: output.speakerInstruction ?? null,
      stateAfter: output.stateAfter ?? {},
      metadata: output.metadata ?? {},
    })
  }

  async markBeatCharacterAppended(beatId: string): Promise<LocationRoomNarrativeBeat> {
    return this.patchBeat(beatId, { status: 'character_appended' })
  }

  async markBeatCompleted(beatId: string): Promise<LocationRoomNarrativeBeat> {
    return this.patchBeat(beatId, { status: 'completed', completedAt: BASE_TIME })
  }

  async markBeatFailed(beatId: string, error: unknown): Promise<LocationRoomNarrativeBeat> {
    return this.patchBeat(beatId, { status: 'failed', lastError: error instanceof Error ? error.message : String(error) })
  }

  async markBeatDead(beatId: string, error: unknown): Promise<LocationRoomNarrativeBeat> {
    return this.patchBeat(beatId, { status: 'dead', lastError: error instanceof Error ? error.message : String(error), completedAt: BASE_TIME })
  }

  getQualityAdventureState(): NarrativeQualityAdventureState {
    const adventure = normalizeAdventureMemory(this.state.metadata)
    return {
      currentStakes: adventure.currentStakes,
      activeDecisionPresent: Boolean(adventure.activeDecision),
      consequenceCount: adventure.consequenceLedger.length,
      discoveryCount: adventure.discoveries.length,
      clockCount: adventure.clocks.length,
      lastDeclaredActionPresent: Boolean(adventure.lastDeclaredAction),
      lastOutcomePresent: Boolean(adventure.lastOutcome),
    }
  }

  private patchBeat(beatId: string, patch: Partial<LocationRoomNarrativeBeat>): LocationRoomNarrativeBeat {
    const existing = this.beats.get(beatId)
    if (!existing) throw new Error(`Missing beat ${beatId}`)
    const next = { ...existing, ...patch, updatedAt: BASE_TIME }
    this.beats.set(beatId, next)
    return next
  }
}

class StaticMembershipRepository implements LocationRoomMembershipRepository {
  private readonly participants: LocationRoomParticipant[]

  constructor(scenario: NarrativeHarnessScenario) {
    this.participants = scenario.characters.map((character) => participantFor(scenario, character))
  }

  async listEligibleParticipantsByLocation(): Promise<LocationRoomParticipant[]> {
    return this.participants
  }

  async listEligibleLocationIds(): Promise<string[]> {
    return [...new Set(this.participants.map((participant) => participant.locationId))]
  }

  async walletHasEligibleParticipant(): Promise<boolean> {
    return true
  }
}

class ScriptedGameMasterBeatGenerator implements GameMasterBeatGenerator {
  private turn = 0
  private outcomeTurn = 0

  constructor(private readonly scenario: NarrativeHarnessScenario) {}

  async generateBeat(input: GenerateGameMasterBeatInput): Promise<GameMasterBeatOutput> {
    this.turn += 1
    const shouldRequestCheck = this.turn % this.scenario.checkEvery === 0
    const checkIndex = Math.floor(this.turn / this.scenario.checkEvery)
    const actionIntent = this.actionIntentForTurn(checkIndex)
    const checkType = FALLBACK_CHECK_TYPES[checkIndex % FALLBACK_CHECK_TYPES.length]
    const sceneCheckNormalization = shouldRequestCheck
      ? normalizeSceneCheckRequest({
        id: `check-${this.scenario.id}-${this.turn}`,
        source: 'game_master',
        actionIntent,
        summary: `Resolve ${input.speaker.name}'s attempt to press deeper into ${this.scenario.locationName}: ${this.scenario.objective}`,
        rollChoice: { source: 'fixed', checkType },
        difficulty: this.turn % 6 === 0 ? 'hard' : 'normal',
      })
      : null
    const sceneCheckRequest = sceneCheckNormalization?.ok ? sceneCheckNormalization.value : null

    const stateAfter: LocationRoomNarrativeStateSnapshot = {
      stateSummary: `${this.scenario.premise} Progress marker ${this.turn}: ${input.speaker.name} has changed the room's leverage, and the next clue points toward ${this.scenario.objective}`,
      currentObjective: this.turn % 5 === 0
        ? `Choose whether to confront the source of ${this.scenario.locationName}'s problem or exploit it.`
        : this.scenario.objective,
      openThreads: [
        this.scenario.stakes,
        `Unresolved clue ${this.turn}: ${input.speaker.name} noticed a cost attached to the last choice.`,
      ],
    }

    const adventurePatch: LocationRoomAdventurePatch = {
      arcSummary: `${this.scenario.locationName}: ${this.scenario.premise}`,
      currentStakes: this.scenario.stakes,
      activeDecision: this.turn % 4 === 0 ? {
        id: `decision-${this.scenario.id}-${this.turn}`,
        prompt: `How should the party handle the newest pressure in ${this.scenario.locationName}?`,
        options: [
          { id: 'press', label: 'Press deeper', summary: 'Accept risk for a clearer answer.' },
          { id: 'bargain', label: 'Bargain sideways', summary: 'Trade time or leverage for safety.' },
          { id: 'withdraw', label: 'Withdraw and watch', summary: 'Yield tempo to learn who moves next.' },
        ],
      } : null,
      discoveries: [`${input.speaker.name} found evidence tied to ${this.scenario.openingImage}.`],
      clocks: [{ id: `clock-${this.scenario.id}`, label: 'Location pressure', value: Math.min(6, this.turn), max: 6, summary: this.scenario.stakes }],
      spatialContext: {
        currentArea: `${this.scenario.locationName} threshold floor`,
        landmarks: [this.scenario.openingImage, `${this.scenario.locationName} landmark ${this.turn}`],
        routes: [`main path through ${this.scenario.locationName}`, `side door toward ${this.scenario.objective}`],
        unresolvedSpatialQuestions: [`Which passage changes if ${input.speaker.name} presses the current choice?`],
      },
    }

    return {
      gameMasterAgentId: 'gm-harness',
      publicNarration: this.publicNarration(input.speaker.name, shouldRequestCheck),
      speakerInstruction: shouldRequestCheck
        ? `Have ${input.speaker.name} take a concrete risk. The scene check is about ${actionIntent}.`
        : `Invite ${input.speaker.name} to make a specific choice that changes the next beat.`,
      stateAfter,
      ttrpgPhase: this.turn < 4 ? 'exploration' : this.turn < 20 ? 'threat' : 'aftermath',
      combatReadiness: this.turn > 20 ? 'foreshadow' : 'none',
      threatLevel: Math.min(10, Math.ceil(this.turn / 3)),
      requestedGameplayAction: null,
      encounterSeed: null,
      sceneCheckRequest,
      adventurePatch,
      metadata: {
        currentObjective: stateAfter.currentObjective,
        selectedSpeakerTokenId: input.speaker.tokenId,
        ttrpgPhase: this.turn < 4 ? 'exploration' : this.turn < 20 ? 'threat' : 'aftermath',
        combatReadiness: this.turn > 20 ? 'foreshadow' : 'none',
        threatLevel: Math.min(10, Math.ceil(this.turn / 3)),
        sceneCheckRequest,
        adventurePatch,
      },
    }
  }

  async generateSceneCheckOutcome(input: GenerateGameMasterSceneCheckOutcomeInput): Promise<GameMasterSceneCheckOutcomeOutput> {
    const tier = input.resolution.roll.tier
    const failure = tier === 'failure' || tier === 'critical_failure'
    const partial = tier === 'partial_success'
    const consequence = failure
      ? `${input.speaker.name}'s mistake makes the location bite back: ${this.scenario.stakes}`
      : partial
        ? `${input.speaker.name} gets the clue, but it costs time, noise, and a new obligation.`
        : `${input.speaker.name} earns a clean advantage and forces the location to reveal a true seam.`

    this.outcomeTurn += 1
    const outcomeVerbs = ['splinters', 'answers', 'tightens', 'reveals', 'punishes', 'unlocks', 'bargains', 'twists', 'echoes', 'brands']
    const outcomeLead = `${this.scenario.locationName} ${outcomeVerbs[this.outcomeTurn % outcomeVerbs.length]} ${input.speaker.name}'s ${input.resolution.actionIntent} test with ${tier}`

    const publicNarration = failure
      ? `${outcomeLead}. ${input.characterAction} collapses into consequence: ${consequence} A witness, door, or omen now turns openly hostile, leaving the party with fewer safe options and a visible price to pay.`
      : `${outcomeLead}. ${input.characterAction} changes the scene. ${consequence} The party can act on this immediately: exploit the opening, protect the exposed character, or follow the clue before it cools.`
    const escalation = normalizeSceneCheckEscalation({
      narrativeState: input.narrativeState,
      rawEscalation: failure
        ? { decision: 'danger', dangerKind: 'monster_pressure' }
        : { decision: 'none', dangerKind: 'unknown', reason: 'scripted_success_no_escalation' },
      recentOutcomeSummary: publicNarration,
      fallbackSummary: publicNarration,
      rollTier: tier,
      selectedTokenId: input.resolution.actorTokenId,
    })

    return {
      gameMasterAgentId: input.gameMasterAgentId,
      publicNarration,
      stateAfter: {
        stateSummary: `${this.scenario.premise} Latest roll (${tier}) created this consequence: ${consequence}`,
        currentObjective: failure ? `Recover from the complication: ${this.scenario.stakes}` : this.scenario.objective,
        openThreads: [this.scenario.stakes, consequence],
      },
      adventurePatch: {
        lastOutcome: {
          kind: 'scene_check',
          sourceId: input.sceneCheckId,
          tier,
          summary: consequence,
        },
        consequenceLedger: [{ id: `consequence-${input.sceneCheckId}`, source: input.sceneCheckId, summary: consequence, status: failure ? 'complication' : 'advantage', tier }],
        spatialContext: {
          currentArea: `${this.scenario.locationName} contested room`,
          landmarks: [`${this.scenario.locationName} marked table`, `${input.speaker.name}'s altered threshold`],
          routes: failure
            ? [`blocked door beside ${this.scenario.locationName}`, `riskier passage around the cost`]
            : [`opened route through ${this.scenario.locationName}`, `clear path toward ${this.scenario.objective}`],
          unresolvedSpatialQuestions: [`Who controls the next exit after ${tier}?`],
        },
      },
      escalation: escalation.escalation,
      ttrpgMetadataPatch: escalation.ttrpgMetadataPatch,
      metadata: {
        adventurePatch: { currentStakes: this.scenario.stakes },
        sceneCheckEscalation: escalation.escalation,
      },
    }
  }

  private publicNarration(speakerName: string, checkRequested: boolean): string {
    return `${this.scenario.locationName} tightens around the party: ${this.scenario.openingImage}. ${this.scenario.premise} ${speakerName} is placed at the useful edge of the problem, where a decision can change what the room wants next. ${checkRequested ? 'The moment is sharp enough to demand a roll, and failure must leave a mark.' : 'No one is forced down a single track; the party has room to bargain, pry, retreat, or make the place worse.'}`
  }

  private actionIntentForTurn(turn: number): SceneCheckActionIntent {
    const intents: SceneCheckActionIntent[] = ['investigate', 'search', 'negotiate', 'recall_lore', 'sneak', 'force', 'endure']
    return intents[turn % intents.length]
  }
}

class ExplicitCombatStartBeatGenerator implements GameMasterBeatGenerator {
  async generateBeat(input: GenerateGameMasterBeatInput): Promise<GameMasterBeatOutput> {
    const ttrpg = normalizeNarrativeTtrpgMetadata(input.narrativeState.metadata)
    const encounterSeed = ttrpg.lastEncounterSeed ?? {
      title: 'Catalog Threat Breaks Cover',
      summary: 'The catalog-seeded danger finally enters the room openly.',
      stakes: 'Survive the threat that the failed scene check exposed.',
      source: 'fallback' as const,
    }

    const stateAfter: LocationRoomNarrativeStateSnapshot = {
      stateSummary: `${input.narrativeState.stateSummary} The danger breaks cover and demands structured combat.`,
      currentObjective: 'Survive the threat that has fully emerged.',
      openThreads: [...input.narrativeState.openThreads, 'The explicit combat trigger is now unconsumed.'].slice(-4),
    }

    return {
      gameMasterAgentId: 'gm-harness',
      publicNarration: 'The foreshadowed pressure breaks cover: claws scrape the rafters, the exit slams shut, and the room must answer in combat.',
      speakerInstruction: 'React to the threat entering combat; do not resolve the combat in prose.',
      stateAfter,
      ttrpgPhase: 'threat',
      combatReadiness: 'ready',
      threatLevel: 5,
      requestedGameplayAction: 'start_combat',
      encounterSeed,
      sceneCheckRequest: null,
      adventurePatch: {
        currentStakes: 'The party must survive the catalog-seeded threat.',
        discoveries: ['The earlier failed check exposed the threat clearly enough for combat.'],
      },
      metadata: {
        ttrpgPhase: 'threat',
        combatReadiness: 'ready',
        threatLevel: 5,
        requestedGameplayAction: 'start_combat',
        encounterSeed,
      },
    }
  }
}

class ScriptedTurnGenerator implements OfficialLocationRoomTurnGenerator {
  private turn = 0

  constructor(private readonly scenario: NarrativeHarnessScenario) {}

  async generateTurn(input: GenerateOfficialLocationRoomTurnInput): Promise<GenerateOfficialLocationRoomTurnResult> {
    this.turn += 1
    const decision = input.narrativeContext?.activeDecision
    const chosen = decision?.options[this.turn % decision.options.length]
    const sceneCheckRequest = input.narrativeContext?.sceneCheck?.request
    const action = sceneCheckRequest
      ? `I test the ${sceneCheckRequest.actionIntent} angle and accept the danger instead of waiting for the room to choose for us.`
      : chosen
        ? `I choose ${chosen.label.toLowerCase()} because ${chosen.summary?.toLowerCase() ?? 'the party needs a direction'}.`
        : `I push on the most suspicious detail and ask what price ${this.scenario.locationName} is trying to hide.`

    return {
      officialAgentId: `agent-${input.speaker.tokenId}`,
      content: `${input.speaker.name}: ${action} ${input.speaker.backgroundStory ? `My instinct says this smells like ${input.speaker.backgroundStory.split(' ').slice(0, 7).join(' ').toLowerCase()}.` : ''}`.trim(),
      declaredAction: {
        summary: action,
        chosenOptionId: chosen?.id ?? null,
        chosenOptionLabel: chosen?.label ?? null,
        actionIntent: sceneCheckRequest?.actionIntent ?? 'press the scene',
      },
      sceneCheckProposal: sceneCheckRequest
        ? {
          id: null,
          source: 'character',
          actionIntent: sceneCheckRequest.actionIntent,
          gameplayActionType: sceneCheckRequest.gameplayActionType,
          intentSummary: action,
          rollChoice: sceneCheckRequest.rollChoice,
          contextualChecks: sceneCheckRequest.contextualChecks,
        }
        : null,
      sceneCheckProposalError: null,
    }
  }
}

function rngSequenceFor(profile: ScriptedRollProfile): () => number {
  const sequences: Record<ScriptedRollProfile, number[]> = {
    mixed: [0.05, 0.24, 0.49, 0.74, 0.91, 0.31, 0.67],
    'fail-heavy': [0.01, 0.08, 0.16, 0.22, 0.41, 0.12, 0.58],
    'success-heavy': [0.42, 0.68, 0.82, 0.94, 0.55, 0.76, 0.99],
  }
  const values = sequences[profile]
  let index = 0
  return () => {
    const value = values[index % values.length]
    index += 1
    return value
  }
}

function withHarnessElizaConfig<T>(
  fn: () => Promise<T>,
  options: { gameplayEnabled?: boolean; gameplayLocationAllowlist?: string[] } = {}
): Promise<T> {
  const originalMode = elizaConfig.mode
  const originalEnabled = elizaConfig.locationRooms.enabled
  const originalNarrativeEnabled = elizaConfig.locationRooms.narrative.enabled
  const originalGameMasterAgentId = elizaConfig.locationRooms.narrative.gameMasterAgentId
  const originalGameplayEnabled = elizaConfig.locationRooms.gameplay.enabled
  const originalOfficialBaseUrl = elizaConfig.official.baseUrl
  const originalGameplayLocationAllowlist = elizaConfig.locationRooms.gameplay.locationAllowlist
  const mutableConfig = elizaConfig as { mode: typeof elizaConfig.mode }
  const mutableRooms = elizaConfig.locationRooms as { enabled: boolean }
  const mutableNarrative = elizaConfig.locationRooms.narrative as { enabled: boolean; gameMasterAgentId: string }
  const mutableGameplay = elizaConfig.locationRooms.gameplay as { enabled: boolean; locationAllowlist: string[] }
  const mutableOfficial = elizaConfig.official as { baseUrl: string }

  mutableConfig.mode = 'official'
  mutableRooms.enabled = true
  mutableNarrative.enabled = true
  mutableNarrative.gameMasterAgentId = 'gm-harness'
  mutableGameplay.enabled = options.gameplayEnabled ?? false
  mutableGameplay.locationAllowlist = options.gameplayLocationAllowlist ?? []
  mutableOfficial.baseUrl = 'https://elizaos.example'

  return fn().finally(() => {
    mutableConfig.mode = originalMode
    mutableRooms.enabled = originalEnabled
    mutableNarrative.enabled = originalNarrativeEnabled
    mutableNarrative.gameMasterAgentId = originalGameMasterAgentId
    mutableGameplay.enabled = originalGameplayEnabled
    mutableGameplay.locationAllowlist = originalGameplayLocationAllowlist
    mutableOfficial.baseUrl = originalOfficialBaseUrl
  })
}

export async function runNarrativeHarness(options: NarrativeHarnessOptions = {}): Promise<NarrativeHarnessRunResult> {
  const scenarios = options.scenarios ?? narrativeHarnessScenarios
  const ticksPerScenario = options.ticksPerScenario ?? NARRATIVE_HARNESS_TICKS_PER_SCENARIO
  const scenarioResults: NarrativeHarnessScenarioResult[] = []

  await withHarnessElizaConfig(async () => {
    for (const scenario of scenarios) {
      scenarioResults.push(await runNarrativeHarnessScenario(scenario, ticksPerScenario))
    }
  })

  return {
    ticksPerScenario,
    scenarioResults,
    aggregate: aggregateHarnessResults(scenarioResults),
  }
}

export async function runNarrativeHarnessScenario(
  scenario: NarrativeHarnessScenario,
  ticksPerScenario = NARRATIVE_HARNESS_TICKS_PER_SCENARIO
): Promise<NarrativeHarnessScenarioResult> {
  const repository = new InMemoryLocationRoomRepository(scenario)
  const narrativeRepository = new InMemoryNarrativeRepository(scenario)
  const membership = new StaticMembershipRepository(scenario)
  const gmGenerator = new ScriptedGameMasterBeatGenerator(scenario)
  const turnGenerator = new ScriptedTurnGenerator(scenario)
  const resolver: GameMasterAgentResolver = { resolveRuntimeGameMasterAgentId: async () => 'gm-harness' }
  const narrativeCoordinator = new DefaultLocationRoomNarrativeCoordinator(
    repository as unknown as LocationRoomRepository,
    narrativeRepository as unknown as LocationRoomNarrativeRepository,
    gmGenerator,
    turnGenerator,
    resolver,
    rngSequenceFor(scenario.rollProfile)
  )
  const service = new LocationRoomService(
    repository as unknown as LocationRoomRepository,
    membership,
    turnGenerator,
    narrativeCoordinator,
    resolver,
    { processTurn: async () => ({ status: 'skipped', reason: 'no combat in narrative harness', selectedTokenId: null }) } as unknown as LocationRoomGameplayCoordinator,
    { findActiveEncounterByRoomId: async () => null } as unknown as LocationRoomGameplayRepository,
    narrativeRepository as unknown as LocationRoomNarrativeRepository
  )

  for (let index = 0; index < ticksPerScenario; index += 1) {
    const now = new Date(new Date(BASE_TIME).getTime() + index * 120_000)
    await service.requestTickAndProcess(scenario.locationId, {
      actor: 'admin',
      walletAddress: '0x0000000000000000000000000000000000000000',
      intent: 'story',
      now,
    })
  }

  const adventureState = narrativeRepository.getQualityAdventureState()
  const quality = scoreNarrativeQuality({
    messages: repository.messages,
    completedTicks: repository.completedTicks,
    failedTicks: repository.failedTicks,
    adventureState,
    warningOptions: warningOptionsForHarness(ticksPerScenario),
  })
  return {
    scenario,
    messages: repository.messages,
    metrics: quality.rawMetrics,
    quality,
    adventureState,
    warnings: warningsForScenario(quality.rawMetrics, ticksPerScenario),
  }
}

export function analyzeNarrativeMessages(
  messages: LocationRoomMessage[],
  completedTicks = 0,
  failedTicks = 0
): NarrativeHarnessMetrics {
  return analyzeQualityNarrativeMessages(messages, completedTicks, failedTicks)
}

function aggregateHarnessResults(results: NarrativeHarnessScenarioResult[]): NarrativeHarnessAggregateMetrics {
  const allMessages = results.flatMap((result) => result.messages)
  const completedTicks = results.reduce((sum, result) => sum + result.metrics.completedTicks, 0)
  const failedTicks = results.reduce((sum, result) => sum + result.metrics.failedTicks, 0)
  const quality = scoreNarrativeQuality({
    messages: allMessages,
    completedTicks,
    failedTicks,
    adventureState: aggregateAdventureState(results),
  })

  return {
    ...quality.rawMetrics,
    scenarioCount: results.length,
    warnings: results.flatMap((result) => result.warnings.map((warning) => `${result.scenario.id}: ${warning}`)),
    quality,
  }
}

function warningsForScenario(metrics: NarrativeHarnessMetrics, ticksPerScenario: number): string[] {
  return warningsForNarrativeQuality(metrics, warningOptionsForHarness(ticksPerScenario))
}

function warningOptionsForHarness(ticksPerScenario: number) {
  return {
    ticksPerScenario,
    minRollCards: Math.floor(ticksPerScenario / 5),
    maxRollCards: Math.ceil(ticksPerScenario / 2),
    repeatedOutcomePrefixWarningThreshold: 1,
  }
}

export async function runNarrativeEscalationValidationProbe(): Promise<NarrativeEscalationValidationProbeResult> {
  const scenario: NarrativeHarnessScenario = {
    ...narrativeHarnessScenarios[0],
    id: 'escalation-validation',
    checkEvery: 1,
    gmNarrationEvery: 1,
    rollProfile: 'fail-heavy',
  }
  const locationMetadata = { adventureCatalog: escalationAdventureCatalog() }
  const repository = new InMemoryLocationRoomRepository(scenario, locationMetadata)
  const narrativeRepository = new InMemoryNarrativeRepository(scenario, locationMetadata)
  const membership = new StaticMembershipRepository(scenario)
  const turnGenerator = new ScriptedTurnGenerator(scenario)
  const resolver: GameMasterAgentResolver = { resolveRuntimeGameMasterAgentId: async () => 'gm-harness' }
  const gameplayRepository = new InMemoryGameplayRepository(scenario)
  const gameplayCoordinator = new CountingGameplayCoordinator()

  function serviceFor(gmGenerator: GameMasterBeatGenerator): LocationRoomService {
    const narrativeCoordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository as unknown as LocationRoomRepository,
      narrativeRepository as unknown as LocationRoomNarrativeRepository,
      gmGenerator,
      turnGenerator,
      resolver,
      rngSequenceFor('fail-heavy')
    )
    return new LocationRoomService(
      repository as unknown as LocationRoomRepository,
      membership,
      turnGenerator,
      narrativeCoordinator,
      resolver,
      gameplayCoordinator as unknown as LocationRoomGameplayCoordinator,
      gameplayRepository as unknown as LocationRoomGameplayRepository,
      narrativeRepository as unknown as LocationRoomNarrativeRepository
    )
  }

  async function request(service: LocationRoomService, intent: LocationRoomTurnIntent, index: number) {
    return withHarnessElizaConfig(() => service.requestTickAndProcess(scenario.locationId, {
      actor: 'admin',
      walletAddress: '0x0000000000000000000000000000000000000000',
      intent,
      now: new Date(new Date(BASE_TIME).getTime() + index * 120_000),
    }), { gameplayEnabled: true, gameplayLocationAllowlist: [scenario.locationId] })
  }

  const failedSceneResult = await request(serviceFor(new ScriptedGameMasterBeatGenerator(scenario)), 'story', 0)
  const failedState = narrativeRepository.getState()
  const failedTtrpg = normalizeNarrativeTtrpgMetadata(failedState.metadata)
  const failedSeed = failedTtrpg.lastEncounterSeed

  const autoWithoutTriggerStartCalls = gameplayCoordinator.processCalls
  const autoWithoutTriggerStartCreates = gameplayRepository.createRunCalls
  const autoWithoutTriggerResult = await request(serviceFor(new ScriptedGameMasterBeatGenerator({ ...scenario, checkEvery: 99 })), 'auto', 1)
  const autoWithoutTriggerState = normalizeNarrativeTtrpgMetadata(narrativeRepository.getState().metadata)
  const autoWithoutTriggerLastMessage = repository.messages.at(-1)
  const autoWithoutTriggerProbe = {
    status: autoWithoutTriggerResult.processing.result?.status ?? autoWithoutTriggerResult.processing.status,
    gameplayProcessCalls: gameplayCoordinator.processCalls - autoWithoutTriggerStartCalls,
    gameplayRunCreates: gameplayRepository.createRunCalls - autoWithoutTriggerStartCreates,
    messageDomain: typeof autoWithoutTriggerLastMessage?.metadata?.messageDomain === 'string' ? autoWithoutTriggerLastMessage.metadata.messageDomain : null,
    requestedGameplayAction: autoWithoutTriggerState.requestedGameplayAction,
  }

  const explicitStartCalls = gameplayCoordinator.processCalls
  const explicitStartCreates = gameplayRepository.createRunCalls
  const storyWithExplicitResult = await request(serviceFor(new ExplicitCombatStartBeatGenerator()), 'story', 2)
  const explicitTriggerState = normalizeNarrativeTtrpgMetadata(narrativeRepository.getState().metadata)
  const storyWithExplicitLastMessage = repository.messages.at(-1)
  const storyWithExplicitProbe = {
    status: storyWithExplicitResult.processing.result?.status ?? storyWithExplicitResult.processing.status,
    gameplayProcessCalls: gameplayCoordinator.processCalls - explicitStartCalls,
    gameplayRunCreates: gameplayRepository.createRunCalls - explicitStartCreates,
    messageDomain: typeof storyWithExplicitLastMessage?.metadata?.messageDomain === 'string' ? storyWithExplicitLastMessage.metadata.messageDomain : null,
    requestedGameplayAction: explicitTriggerState.requestedGameplayAction,
    triggerId: explicitTriggerState.lastCombatTriggerBeatId,
  }

  const autoTriggerStartCalls = gameplayCoordinator.processCalls
  const autoTriggerStartCreates = gameplayRepository.createRunCalls
  const autoWithExplicitResult = await request(serviceFor(new ScriptedGameMasterBeatGenerator({ ...scenario, checkEvery: 99 })), 'auto', 3)
  const autoWithExplicitProbe = {
    status: autoWithExplicitResult.processing.result?.status ?? autoWithExplicitResult.processing.status,
    gameplayRunId: autoWithExplicitResult.processing.result?.gameplayRunId ?? null,
    gameplayProcessCalls: gameplayCoordinator.processCalls - autoTriggerStartCalls,
    gameplayRunCreates: gameplayRepository.createRunCalls - autoTriggerStartCreates,
  }

  return {
    failedSceneCheck: {
      status: failedSceneResult.processing.result?.status ?? failedSceneResult.processing.status,
      sceneCheckId: failedSceneResult.processing.result?.sceneCheckId ?? null,
      phase: failedTtrpg.ttrpgPhase,
      combatReadiness: failedTtrpg.combatReadiness,
      threatLevel: failedTtrpg.threatLevel,
      requestedGameplayAction: failedTtrpg.requestedGameplayAction,
      lastCombatTriggerBeatId: failedTtrpg.lastCombatTriggerBeatId,
      seedSource: failedSeed?.source ?? null,
      seedCatalogEntryIds: failedSeed?.catalogEntryIds ?? [],
      encounterHints: failedSeed?.encounterHints ?? [],
      monsterHints: failedSeed?.monsterHints ?? [],
    },
    autoWithoutTrigger: autoWithoutTriggerProbe,
    storyWithExplicitStartCombat: storyWithExplicitProbe,
    autoWithExplicitTrigger: autoWithExplicitProbe,
  }
}

function escalationAdventureCatalog() {
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
        id: '30.10.crow-wight',
        section: '30_monsters',
        title: 'Crow Wight',
        summary: 'A hostile crow-wight nests above the tavern rafters.',
        tags: ['crow', 'hostile', 'threat'],
      }],
      '40_places': [],
      '50_items': [],
      '60_shops_services': [],
      '70_factions': [],
      '80_encounters': [{
        id: '80.10.rafters-ambush',
        section: '80_encounters',
        title: 'Rafters Ambush',
        summary: 'The rafters answer a failed check with hostile wings and a slammed exit.',
        tags: ['crow', 'hostile', 'ambush'],
      }],
      '90_rules_guidance': [],
    },
  }
}

export async function runNarrativeCombatSeparationProbe(): Promise<NarrativeCombatSeparationProbeResult> {
  const scenario = narrativeHarnessScenarios[0]

  async function runProbe(intent: LocationRoomTurnIntent): Promise<{
    status: string
    publicGameMasterBeatAppended: boolean
    gameplayRunId: string | null
    gameplayProcessCalls: number
    gameplayRunCreates: number
    messageDomain: string | null
  }> {
    const repository = new InMemoryLocationRoomRepository(scenario)
    const narrativeRepository = new InMemoryNarrativeRepository(scenario, combatReadyMetadata())
    const membership = new StaticMembershipRepository(scenario)
    const gmGenerator = new ScriptedGameMasterBeatGenerator(scenario)
    const turnGenerator = new ScriptedTurnGenerator(scenario)
    const resolver: GameMasterAgentResolver = { resolveRuntimeGameMasterAgentId: async () => 'gm-harness' }
    const gameplayRepository = new InMemoryGameplayRepository(scenario)
    const gameplayCoordinator = new CountingGameplayCoordinator()
    const narrativeCoordinator = new DefaultLocationRoomNarrativeCoordinator(
      repository as unknown as LocationRoomRepository,
      narrativeRepository as unknown as LocationRoomNarrativeRepository,
      gmGenerator,
      turnGenerator,
      resolver,
      rngSequenceFor(scenario.rollProfile)
    )
    const service = new LocationRoomService(
      repository as unknown as LocationRoomRepository,
      membership,
      turnGenerator,
      narrativeCoordinator,
      resolver,
      gameplayCoordinator as unknown as LocationRoomGameplayCoordinator,
      gameplayRepository as unknown as LocationRoomGameplayRepository,
      narrativeRepository as unknown as LocationRoomNarrativeRepository
    )

    const ticksToRun = intent === 'story' ? 2 : 1
    let processingResult: { status?: string; gameplayRunId?: string | null; publicGameMasterBeatAppended?: boolean } | undefined
    let processingStatus = 'unknown'
    let publicGameMasterBeatAppended = false
    for (let index = 0; index < ticksToRun; index += 1) {
      const result = await withHarnessElizaConfig(() => service.requestTickAndProcess(scenario.locationId, {
        actor: 'admin',
        walletAddress: '0x0000000000000000000000000000000000000000',
        intent,
        now: new Date(new Date(BASE_TIME).getTime() + index * 120_000),
      }), { gameplayEnabled: true, gameplayLocationAllowlist: [scenario.locationId] })
      processingResult = result.processing?.result
      processingStatus = result.processing?.status ?? processingStatus
      publicGameMasterBeatAppended = publicGameMasterBeatAppended || Boolean(
        processingResult && 'publicGameMasterBeatAppended' in processingResult && processingResult.publicGameMasterBeatAppended
      )
    }
    const lastMessage = repository.messages.at(-1)
    return {
      status: processingResult?.status ?? processingStatus,
      publicGameMasterBeatAppended,
      gameplayRunId: processingResult?.gameplayRunId ?? null,
      gameplayProcessCalls: gameplayCoordinator.processCalls,
      gameplayRunCreates: gameplayRepository.createRunCalls,
      messageDomain: typeof lastMessage?.metadata?.messageDomain === 'string' ? lastMessage.metadata.messageDomain : null,
    }
  }

  const storyWithTrigger = await runProbe('story')
  const autoWithTrigger = await runProbe('auto')
  const adminCombat = await runProbe('combat')

  return {
    storyWithTrigger,
    autoWithTrigger: {
      status: autoWithTrigger.status,
      gameplayRunId: autoWithTrigger.gameplayRunId,
      gameplayProcessCalls: autoWithTrigger.gameplayProcessCalls,
      gameplayRunCreates: autoWithTrigger.gameplayRunCreates,
    },
    adminCombat: {
      status: adminCombat.status,
      gameplayRunId: adminCombat.gameplayRunId,
      gameplayProcessCalls: adminCombat.gameplayProcessCalls,
      gameplayRunCreates: adminCombat.gameplayRunCreates,
    },
  }
}

function combatReadyMetadata(): Record<string, unknown> {
  return {
    ttrpgPhase: 'threat',
    combatReadiness: 'ready',
    threatLevel: 5,
    requestedGameplayAction: 'start_combat',
    lastCombatTriggerBeatId: 'beat-combat-trigger',
    consumedCombatTriggerBeatId: null,
    lastEncounterSeed: { title: 'Bell Horror', summary: 'The explicit trigger is ready.', stakes: 'Survive only if combat is chosen.' },
  }
}

class InMemoryGameplayRepository {
  public createRunCalls = 0
  private run: GameplayRun | null = null

  constructor(private readonly scenario: NarrativeHarnessScenario) {}

  async findActiveRunByRoomId(): Promise<GameplayRun | null> {
    return this.run?.status === 'active' ? this.run : null
  }

  async findRunById(runId: string): Promise<GameplayRun | null> {
    return this.run?.id === runId ? this.run : null
  }

  async listRecentRunsByRoomId(): Promise<GameplayRun[]> { return [] }
  async listActiveRunsForWorker(): Promise<GameplayRun[]> { return [] }
  async findStateByRoomId(): Promise<null> { return null }
  async findActiveEncounterByRoomId(): Promise<null> { return null }
  async findEncounterById(): Promise<null> { return null }
  async findTurnByTickId(): Promise<null> { return null }

  async createOrReuseActiveRun(input: { room: Pick<LocationRoom, 'id' | 'locationId'>; targetCompletedTurns: number; startedByActor: string; startedByWallet?: string | null; startedByTokenId?: number | null; metadata?: Record<string, unknown> }): Promise<{ run: GameplayRun; reused: boolean }> {
    if (this.run?.status === 'active') return { run: this.run, reused: true }
    this.createRunCalls += 1
    this.run = {
      id: `run-${this.scenario.id}-${this.createRunCalls}`,
      roomId: input.room.id,
      locationId: input.room.locationId,
      status: 'active',
      targetCompletedTurns: input.targetCompletedTurns,
      completedTurns: 0,
      startedByActor: input.startedByActor as GameplayRunStartedByActor,
      startedByWallet: input.startedByWallet ?? null,
      startedByTokenId: input.startedByTokenId ?? null,
      lastTickId: null,
      lastAdvancedAt: null,
      completedAt: null,
      stopReason: null,
      lastError: null,
      metadata: input.metadata ?? {},
      createdAt: BASE_TIME,
      updatedAt: BASE_TIME,
    }
    return { run: this.run, reused: false }
  }

  async updateRunProgress(runId: string, input: { completedTurns?: number; lastTickId?: string | null; lastAdvancedAt?: string | null }): Promise<GameplayRun> {
    if (!this.run || this.run.id !== runId) throw new Error(`Missing run ${runId}`)
    this.run = { ...this.run, completedTurns: input.completedTurns ?? this.run.completedTurns, lastTickId: input.lastTickId ?? this.run.lastTickId, lastAdvancedAt: input.lastAdvancedAt ?? this.run.lastAdvancedAt, updatedAt: BASE_TIME }
    return this.run
  }

  async markRunCompleted(runId: string): Promise<GameplayRun> { return this.markRun(runId, 'completed') }
  async markRunStopped(runId: string): Promise<GameplayRun> { return this.markRun(runId, 'stopped') }
  async markRunFailed(runId: string): Promise<GameplayRun> { return this.markRun(runId, 'failed') }
  async updateState(): Promise<null> { return null }
  async updateRewardClaimStatusByDeathReviewId(): Promise<null> { return null }

  private markRun(runId: string, status: GameplayRun['status']): GameplayRun {
    if (!this.run || this.run.id !== runId) throw new Error(`Missing run ${runId}`)
    this.run = { ...this.run, status, completedAt: BASE_TIME, updatedAt: BASE_TIME }
    return this.run
  }
}

class CountingGameplayCoordinator {
  public processCalls = 0

  async processTurn(): Promise<{ status: 'completed'; selectedTokenId: number; messageId: string }> {
    this.processCalls += 1
    return { status: 'completed', selectedTokenId: 101, messageId: `combat-message-${this.processCalls}` }
  }

  async markTickFailed(): Promise<void> {}
}

function aggregateAdventureState(results: NarrativeHarnessScenarioResult[]): NarrativeQualityAdventureState {
  return {
    currentStakes: results.some((result) => result.adventureState.currentStakes) ? 'aggregate stakes present' : null,
    activeDecisionPresent: results.some((result) => result.adventureState.activeDecisionPresent),
    consequenceCount: results.reduce((sum, result) => sum + (result.adventureState.consequenceCount ?? 0), 0),
    discoveryCount: results.reduce((sum, result) => sum + (result.adventureState.discoveryCount ?? 0), 0),
    clockCount: results.reduce((sum, result) => sum + (result.adventureState.clockCount ?? 0), 0),
    lastDeclaredActionPresent: results.some((result) => result.adventureState.lastDeclaredActionPresent),
    lastOutcomePresent: results.some((result) => result.adventureState.lastOutcomePresent),
  }
}

