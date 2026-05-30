/**
 * Deterministic location-room narrative simulation harness.
 *
 * Compatibility facade for existing imports. Reusable scenario fixtures live under
 * `tests/lib/eliza/locationRooms/fixtures/` so service and narrative tests can share
 * the same in-memory repositories, scripted generators, config wrapper, gameplay
 * doubles, and scoring helpers.
 */

import { DefaultLocationRoomNarrativeCoordinator, type GameMasterAgentResolver } from '@/lib/eliza/locationRooms/narrativeCoordinator'
import type { GameMasterBeatGenerator } from '@/lib/eliza/locationRooms/gameMasterGenerator'
import type { LocationRoomGameplayCoordinator } from '@/lib/eliza/locationRooms/gameplay/coordinator'
import type { LocationRoomGameplayRepository } from '@/lib/eliza/locationRooms/gameplay/repository'
import { normalizeNarrativeTtrpgMetadata } from '@/lib/eliza/locationRooms/narrativeTypes'
import type { LocationRoomNarrativeRepository } from '@/lib/eliza/locationRooms/narrativeRepository'
import type { LocationRoomRepository } from '@/lib/eliza/locationRooms/repository'
import { LocationRoomService } from '@/lib/eliza/locationRooms/service'
import type { LocationRoomTurnIntent } from '@/lib/eliza/locationRooms/types'
import {
  narrativeQualityAttributionMetrics,
  scoreNarrativeQuality,
} from '../../../scripts/location-room-narrative-quality'
import { withHarnessElizaConfig } from './locationRooms/fixtures/config'
import { CountingGameplayCoordinator, combatReadyMetadata, InMemoryGameplayRepository } from './locationRooms/fixtures/gameplayDoubles'
import {
  InMemoryLocationRoomRepository,
  InMemoryNarrativeRepository,
  StaticMembershipRepository,
} from './locationRooms/fixtures/inMemoryRepositories'
import {
  aggregateHarnessResults,
  warningOptionsForHarness,
  warningsForScenario,
} from './locationRooms/fixtures/narrativeQuality'
import {
  BASE_TIME,
  NARRATIVE_HARNESS_SCENARIO_COUNT,
  NARRATIVE_HARNESS_TICKS_PER_SCENARIO,
  narrativeHarnessScenarios,
  type NarrativeCombatSeparationProbeResult,
  type NarrativeEscalationValidationProbeResult,
  type NarrativeHarnessOptions,
  type NarrativeHarnessRunResult,
  type NarrativeHarnessScenario,
  type NarrativeHarnessScenarioResult,
} from './locationRooms/fixtures/scenarios'
import {
  ExplicitCombatStartBeatGenerator,
  rngSequenceFor,
  ScriptedGameMasterBeatGenerator,
  ScriptedTurnGenerator,
} from './locationRooms/fixtures/scriptedGenerators'

export {
  BASE_TIME,
  NARRATIVE_HARNESS_SCENARIO_COUNT,
  NARRATIVE_HARNESS_TICKS_PER_SCENARIO,
  narrativeHarnessScenarios,
} from './locationRooms/fixtures/scenarios'
export type {
  NarrativeCombatSeparationProbeResult,
  NarrativeEscalationValidationProbeResult,
  NarrativeHarnessAggregateMetrics,
  NarrativeHarnessMetrics,
  NarrativeHarnessOptions,
  NarrativeHarnessRunResult,
  NarrativeHarnessScenario,
  NarrativeHarnessScenarioResult,
} from './locationRooms/fixtures/scenarios'
export {
  InMemoryLocationRoomRepository,
  InMemoryNarrativeRepository,
  StaticMembershipRepository,
} from './locationRooms/fixtures/inMemoryRepositories'
export {
  ExplicitCombatStartBeatGenerator,
  rngSequenceFor,
  ScriptedGameMasterBeatGenerator,
  ScriptedTurnGenerator,
} from './locationRooms/fixtures/scriptedGenerators'
export { withHarnessElizaConfig } from './locationRooms/fixtures/config'
export { CountingGameplayCoordinator, combatReadyMetadata, InMemoryGameplayRepository } from './locationRooms/fixtures/gameplayDoubles'
export { analyzeNarrativeMessages } from './locationRooms/fixtures/narrativeQuality'

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
    attributionMetrics: narrativeQualityAttributionMetrics(quality.rawMetrics),
    quality,
    adventureState,
    warnings: warningsForScenario(quality.rawMetrics, ticksPerScenario),
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
