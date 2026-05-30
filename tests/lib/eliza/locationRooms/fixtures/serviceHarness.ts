import { DefaultLocationRoomNarrativeCoordinator, type GameMasterAgentResolver, type LocationRoomNarrativeCoordinator } from '@/lib/eliza/locationRooms/narrativeCoordinator'
import type { GameMasterBeatGenerator } from '@/lib/eliza/locationRooms/gameMasterGenerator'
import type { LocationRoomGameplayCoordinator, ProcessGameplayLocationRoomTurnInput, ProcessGameplayLocationRoomTurnResult } from '@/lib/eliza/locationRooms/gameplay/coordinator'
import type { LocationRoomGameplayRepository } from '@/lib/eliza/locationRooms/gameplay/repository'
import type { GameplayEncounter, GameplayRoomState, GameplayRun, GameplayRunStartedByActor, GameplayTurn } from '@/lib/eliza/locationRooms/gameplay/types'
import { normalizeNarrativeSceneCheckMetadata } from '@/lib/eliza/locationRooms/narrativeTypes'
import type { LocationRoomNarrativeRepository } from '@/lib/eliza/locationRooms/narrativeRepository'
import type { LocationRoomRepository } from '@/lib/eliza/locationRooms/repository'
import { LocationRoomService } from '@/lib/eliza/locationRooms/service'
import type { LocationRoomMessage, LocationRoomParticipant, LocationRoomTick, LocationRoomTurnIntent, RequestLocationRoomTickAndProcessResult } from '@/lib/eliza/locationRooms/types'
import { withHarnessElizaConfig } from './config'
import { InMemoryLocationRoomRepository, InMemoryNarrativeRepository, StaticMembershipRepository, participantFor, tickFor } from './inMemoryRepositories'
import { BASE_TIME, narrativeHarnessScenarios, type NarrativeHarnessScenario } from './scenarios'
import { rngSequenceFor, ScriptedGameMasterBeatGenerator, ScriptedTurnGenerator } from './scriptedGenerators'

export type ServiceScenarioActor = 'admin' | 'owner'
export type ServiceScenarioDrive = 'manual' | 'scheduled'
export type ServiceScenarioPreexistingTick = 'pending' | 'failed' | 'processing' | 'not_claimable'

export type LocationRoomServiceScenarioHarnessOptions = {
  scenario?: NarrativeHarnessScenario
  intent?: LocationRoomTurnIntent
  actor?: ServiceScenarioActor
  drive?: ServiceScenarioDrive
  now?: Date
  gameplayEnabled?: boolean
  participants?: LocationRoomParticipant[]
  narrativeMetadata?: Record<string, unknown>
  locationMetadata?: Record<string, unknown>
  gmGenerator?: GameMasterBeatGenerator
  activeEncounter?: boolean | GameplayEncounter
  activeRun?: boolean | GameplayRun
  gameplayRunTick?: boolean
  combatReadyPromotion?: boolean
  sceneCheckMetadata?: 'request' | 'proposal' | 'proposalError'
  preexistingTick?: ServiceScenarioPreexistingTick
  tickAttempts?: number
  gameplayCoordinatorThrows?: Error
  narrativeCoordinatorThrows?: Error
  gameplayProcessResult?: ProcessGameplayLocationRoomTurnResult
}

type WorkerResult = Awaited<ReturnType<LocationRoomService['runScheduledWorker']>>

type CreatedHarness = {
  service: LocationRoomService
  repository: InMemoryLocationRoomRepository
  narrativeRepository: InMemoryNarrativeRepository
  membership: StaticMembershipRepository
  gameplayRepository: ScenarioGameplayRepository
  gameplayCoordinator: ScriptedGameplayCoordinator
  scenario: NarrativeHarnessScenario
  participants: LocationRoomParticipant[]
}

export type LocationRoomServiceScenarioSnapshots = {
  room: ReturnType<InMemoryLocationRoomRepository['getRoomSnapshot']>
  ticks: LocationRoomTick[]
  messages: LocationRoomMessage[]
  narrativeState: ReturnType<InMemoryNarrativeRepository['getState']>
  gameplay: ReturnType<ScenarioGameplayRepository['snapshot']>
  gameplayProcessCalls: number
  gameplayFailureMarks: Array<{ tickId: string; dead: boolean }>
  sceneCheckMetadata: ReturnType<typeof normalizeNarrativeSceneCheckMetadata>
}

export type ManualLocationRoomServiceScenarioHarness = Omit<CreatedHarness, 'scenario' | 'participants'> & {
  result: RequestLocationRoomTickAndProcessResult
  snapshots: LocationRoomServiceScenarioSnapshots
}

export type ScheduledLocationRoomServiceScenarioHarness = Omit<CreatedHarness, 'scenario' | 'participants'> & {
  result: WorkerResult
  snapshots: LocationRoomServiceScenarioSnapshots
}

export type LocationRoomServiceScenarioHarness = ManualLocationRoomServiceScenarioHarness | ScheduledLocationRoomServiceScenarioHarness

export function runLocationRoomServiceScenario(
  options: LocationRoomServiceScenarioHarnessOptions & { drive: 'scheduled' }
): Promise<ScheduledLocationRoomServiceScenarioHarness>
export function runLocationRoomServiceScenario(
  options?: LocationRoomServiceScenarioHarnessOptions & { drive?: 'manual' | undefined }
): Promise<ManualLocationRoomServiceScenarioHarness>
export async function runLocationRoomServiceScenario(options: LocationRoomServiceScenarioHarnessOptions = {}): Promise<LocationRoomServiceScenarioHarness> {
  const harness = await createLocationRoomServiceScenario(options)
  const now = options.now ?? new Date(BASE_TIME)
  const actor = options.actor ?? 'admin'
  const intent = options.intent ?? 'auto'
  const walletAddress = actor === 'owner'
    ? harness.participants[0]?.ownerAddress ?? '0x0000000000000000000000000000000000000000'
    : '0x0000000000000000000000000000000000000000'
  const result = await withHarnessElizaConfig(async () => {
    if (options.drive === 'scheduled') return harness.service.runScheduledWorker(now)
    return harness.service.requestTickAndProcess(harness.scenario.locationId, { actor, walletAddress, intent, now })
  }, { gameplayEnabled: options.gameplayEnabled ?? true, gameplayLocationAllowlist: [harness.scenario.locationId] })
  return { ...harness, result, snapshots: snapshotHarness(harness) }
}

export async function createLocationRoomServiceScenario(options: LocationRoomServiceScenarioHarnessOptions = {}): Promise<CreatedHarness> {
  const scenario = options.scenario ?? narrativeHarnessScenarios[0]
  const participants = options.participants ?? scenario.characters.map((character) => participantFor(scenario, character))
  const activeRun = options.activeRun ? defaultGameplayRun(scenario, typeof options.activeRun === 'object' ? options.activeRun : {}) : null
  const activeEncounter = options.activeEncounter ? defaultGameplayEncounter(scenario, typeof options.activeEncounter === 'object' ? options.activeEncounter : {}) : null
  const pendingTick = preexistingTickForOptions(scenario, options, activeRun?.id ?? null)
  const repository = new InMemoryLocationRoomRepository(scenario, {
    locationMetadata: options.locationMetadata ?? {},
    pendingTick: options.preexistingTick === 'processing' ? null : pendingTick,
    processingTick: options.preexistingTick === 'processing' ? pendingTick : null,
    claimTickReturnsNull: options.preexistingTick === 'not_claimable',
  })
  const narrativeRepository = new InMemoryNarrativeRepository(scenario, buildNarrativeMetadata(options))
  const membership = new StaticMembershipRepository(scenario, participants)
  const turnGenerator = new ScriptedTurnGenerator(scenario)
  const resolver: GameMasterAgentResolver = { resolveRuntimeGameMasterAgentId: async () => 'gm-harness' }
  const gmGenerator = options.gmGenerator ?? new ScriptedGameMasterBeatGenerator(scenario)
  if (options.combatReadyPromotion) {
    const beat = await narrativeRepository.createOrReuseBeat({
      tick: tickFor(scenario, 999, 'story'),
      selectedTokenId: participants[0]?.tokenId ?? null,
      gameMasterAgentId: 'gm-harness',
      metadata: { combatReadiness: 'ready' },
    })
    await narrativeRepository.patchBeatMetadata(beat.id, { combatReadiness: 'ready' })
    await narrativeRepository.markBeatCompleted(beat.id)
  }
  const narrativeCoordinator: LocationRoomNarrativeCoordinator = options.narrativeCoordinatorThrows
    ? failingNarrativeCoordinator(options.narrativeCoordinatorThrows)
    : new DefaultLocationRoomNarrativeCoordinator(
      repository as unknown as LocationRoomRepository,
      narrativeRepository as unknown as LocationRoomNarrativeRepository,
      gmGenerator,
      turnGenerator,
      resolver,
      rngSequenceFor(scenario.rollProfile)
    )
  const gameplayRepository = new ScenarioGameplayRepository({
    scenario,
    activeRun,
    activeEncounter,
    activeTurnTickId: options.gameplayRunTick || activeRun ? pendingTick?.id ?? `tick-${scenario.id}-1` : null,
  })
  const gameplayCoordinator = new ScriptedGameplayCoordinator({ result: options.gameplayProcessResult, error: options.gameplayCoordinatorThrows })
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
  return { service, repository, narrativeRepository, membership, gameplayRepository, gameplayCoordinator, scenario, participants }
}

function snapshotHarness(harness: CreatedHarness): LocationRoomServiceScenarioSnapshots {
  const narrativeState = harness.narrativeRepository.getState()
  return {
    room: harness.repository.getRoomSnapshot(),
    ticks: harness.repository.getTickSnapshots(),
    messages: [...harness.repository.messages],
    narrativeState,
    gameplay: harness.gameplayRepository.snapshot(),
    gameplayProcessCalls: harness.gameplayCoordinator.processCalls.length,
    gameplayFailureMarks: [...harness.gameplayCoordinator.failureMarks],
    sceneCheckMetadata: normalizeNarrativeSceneCheckMetadata(narrativeState.metadata),
  }
}

function buildNarrativeMetadata(options: LocationRoomServiceScenarioHarnessOptions): Record<string, unknown> {
  const metadata = { ...(options.narrativeMetadata ?? {}) }
  const scenario = options.scenario ?? narrativeHarnessScenarios[0]
  if (options.combatReadyPromotion) {
    Object.assign(metadata, {
      ttrpgPhase: 'threat',
      combatReadiness: 'ready',
      threatLevel: 5,
      requestedGameplayAction: null,
      lastEncounterSeed: { title: 'Promoted Horror', summary: 'Ready threat.', stakes: 'Survive.' },
      lastCombatReadyBeatId: `beat-${scenario.id}-1`,
      consumedCombatTriggerBeatId: null,
    })
  }
  if (options.sceneCheckMetadata === 'request') {
    metadata.sceneCheck = {
      request: {
        id: 'scene-check-request-1',
        source: 'game_master',
        actionIntent: 'investigate',
        summary: 'Investigate the door without starting combat.',
        rollChoice: { source: 'fixed', checkType: 'perception' },
        difficulty: 'normal',
      },
    }
  }
  if (options.sceneCheckMetadata === 'proposal') {
    metadata.sceneCheck = {
      proposal: {
        id: 'scene-check-proposal-1',
        source: 'character',
        actionIntent: 'search',
        intentSummary: 'Search the room without starting combat.',
        rollChoice: { source: 'fixed', checkType: 'investigation' },
      },
    }
  }
  if (options.sceneCheckMetadata === 'proposalError') {
    metadata.sceneCheck = { proposalError: 'proposal stayed narrative' }
  }
  return metadata
}

function preexistingTickForOptions(
  scenario: NarrativeHarnessScenario,
  options: LocationRoomServiceScenarioHarnessOptions,
  gameplayRunId: string | null
): LocationRoomTick | null {
  if (!options.preexistingTick && !options.gameplayRunTick) return null
  const base = tickFor(scenario, 1, options.intent ?? 'auto')
  const ownerParticipant = participantFor(scenario, scenario.characters[0])
  return {
    ...base,
    id: options.gameplayRunTick ? `tick-${scenario.id}-run` : base.id,
    status: options.preexistingTick === 'failed' ? 'failed' : options.preexistingTick === 'processing' ? 'processing' : 'pending',
    attempts: options.tickAttempts ?? (options.preexistingTick === 'failed' ? 1 : 0),
    triggerType: options.actor === 'owner' ? 'owner' : 'admin',
    requestedByWallet: options.actor === 'owner' ? ownerParticipant.ownerAddress : '0x0000000000000000000000000000000000000000',
    requestedByTokenId: options.actor === 'owner' ? ownerParticipant.tokenId : null,
    gameplayRunId: options.gameplayRunTick ? gameplayRunId : null,
    lockedAt: options.preexistingTick === 'processing' ? BASE_TIME : null,
    lockedBy: options.preexistingTick === 'processing' ? 'other-worker' : null,
    startedAt: options.preexistingTick === 'processing' ? BASE_TIME : null,
  }
}

function defaultGameplayRun(scenario: NarrativeHarnessScenario, overrides: Partial<GameplayRun> = {}): GameplayRun {
  return {
    id: 'run-1',
    roomId: `room-${scenario.locationId}`,
    locationId: scenario.locationId,
    status: 'active',
    targetCompletedTurns: 100,
    completedTurns: 0,
    startedByActor: 'admin',
    startedByWallet: '0x0000000000000000000000000000000000000000',
    startedByTokenId: null,
    lastTickId: null,
    lastAdvancedAt: null,
    completedAt: null,
    stopReason: null,
    lastError: null,
    metadata: {},
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    ...overrides,
  }
}

function defaultGameplayEncounter(scenario: NarrativeHarnessScenario, overrides: Partial<GameplayEncounter> = {}): GameplayEncounter {
  return {
    id: 'encounter-1',
    roomId: `room-${scenario.locationId}`,
    locationId: scenario.locationId,
    status: 'active',
    difficulty: 'normal',
    roundNumber: 1,
    publicTitle: 'Bell Maw',
    publicSummary: 'A maw unfolds.',
    monsterState: [],
    rewardPlan: {},
    mechanics: {},
    metadata: {},
    lastError: null,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    completedAt: null,
    ...overrides,
  }
}

function defaultGameplayState(scenario: NarrativeHarnessScenario, activeEncounterId: string | null): GameplayRoomState {
  return {
    id: 'gameplay-state-1',
    roomId: `room-${scenario.locationId}`,
    locationId: scenario.locationId,
    status: activeEncounterId ? 'active_encounter' : 'idle',
    activeEncounterId,
    characters: {
      [scenario.characters[0]?.tokenId ?? 1]: { tokenId: scenario.characters[0]?.tokenId ?? 1, name: scenario.characters[0]?.name ?? 'Ash', hp: 10, maxHp: 10, status: 'alive', xp: 0, temporaryBoons: [], wounds: [] },
      [scenario.characters[1]?.tokenId ?? 2]: { tokenId: scenario.characters[1]?.tokenId ?? 2, name: scenario.characters[1]?.name ?? 'Bone', hp: 10, maxHp: 10, status: 'alive', xp: 0, temporaryBoons: [], wounds: [] },
    },
    rewards: {},
    metadata: {},
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
  }
}

function failingNarrativeCoordinator(error: Error): LocationRoomNarrativeCoordinator {
  return {
    processTurn: async () => { throw error },
    markTickFailed: async () => undefined,
  }
}

export class ScriptedGameplayCoordinator implements Pick<LocationRoomGameplayCoordinator, 'processTurn' | 'markTickFailed'> {
  public readonly processCalls: ProcessGameplayLocationRoomTurnInput[] = []
  public readonly failureMarks: Array<{ tickId: string; dead: boolean }> = []

  constructor(private readonly options: { result?: ProcessGameplayLocationRoomTurnResult; error?: Error } = {}) {}

  async processTurn(input: ProcessGameplayLocationRoomTurnInput): Promise<ProcessGameplayLocationRoomTurnResult> {
    this.processCalls.push(input)
    if (this.options.error) throw this.options.error
    return this.options.result ?? {
      status: 'completed',
      selectedTokenId: input.participants[0]?.tokenId ?? null,
      messageId: `combat-message-${this.processCalls.length}`,
      messageIds: [`combat-message-${this.processCalls.length}`],
      encounterStatusAfter: 'active',
    }
  }

  async markTickFailed(tickId: string, _error: unknown, options?: { dead?: boolean }): Promise<void> {
    this.failureMarks.push({ tickId, dead: options?.dead ?? false })
  }
}

export class ScenarioGameplayRepository implements Partial<LocationRoomGameplayRepository> {
  public createRunCalls = 0
  private run: GameplayRun | null
  private encounter: GameplayEncounter | null
  private state: GameplayRoomState | null
  private readonly durableTurnTickId: string | null
  private readonly scenario: NarrativeHarnessScenario

  constructor(options: {
    scenario: NarrativeHarnessScenario
    activeRun: GameplayRun | null
    activeEncounter: GameplayEncounter | null
    activeTurnTickId: string | null
  }) {
    this.scenario = options.scenario
    this.run = options.activeRun
    this.encounter = options.activeEncounter
    this.state = options.activeEncounter ? defaultGameplayState(options.scenario, options.activeEncounter.id) : null
    this.durableTurnTickId = options.activeTurnTickId
  }

  snapshot() {
    return { run: this.run, encounter: this.encounter, state: this.state, createRunCalls: this.createRunCalls }
  }

  async findActiveRunByRoomId(): Promise<GameplayRun | null> { return this.run?.status === 'active' ? this.run : null }
  async findRunById(runId: string): Promise<GameplayRun | null> { return this.run?.id === runId ? this.run : null }
  async listRecentRunsByRoomId(): Promise<GameplayRun[]> { return this.run ? [this.run] : [] }
  async listActiveRunsForWorker(): Promise<GameplayRun[]> { return this.run?.status === 'active' ? [this.run] : [] }
  async findStateByRoomId(): Promise<GameplayRoomState | null> { return this.state }
  async findActiveEncounterByRoomId(): Promise<GameplayEncounter | null> { return this.encounter?.status === 'active' ? this.encounter : null }
  async findEncounterById(encounterId: string): Promise<GameplayEncounter | null> { return this.encounter?.id === encounterId ? this.encounter : null }
  async findTurnByTickId(tickId: string): Promise<GameplayTurn | null> {
    if (!this.durableTurnTickId || tickId !== this.durableTurnTickId) return null
    return {
      id: 'turn-1',
      roomId: this.run?.roomId ?? `room-${this.scenario.locationId}`,
      locationId: this.run?.locationId ?? this.scenario.locationId,
      tickId,
      encounterId: this.encounter?.id ?? null,
    } as GameplayTurn
  }

  async createOrReuseActiveRun(input: { room: { id: string; locationId: string }; targetCompletedTurns: number; startedByActor: string; startedByWallet?: string | null; startedByTokenId?: number | null; metadata?: Record<string, unknown> }): Promise<{ run: GameplayRun; reused: boolean }> {
    if (this.run?.status === 'active') return { run: this.run, reused: true }
    this.createRunCalls += 1
    this.run = defaultGameplayRun({ ...narrativeHarnessScenarios[0], locationId: input.room.locationId }, {
      id: `run-${this.createRunCalls}`,
      roomId: input.room.id,
      locationId: input.room.locationId,
      targetCompletedTurns: input.targetCompletedTurns,
      startedByActor: input.startedByActor as GameplayRunStartedByActor,
      startedByWallet: input.startedByWallet ?? null,
      startedByTokenId: input.startedByTokenId ?? null,
      metadata: input.metadata ?? {},
    })
    return { run: this.run, reused: false }
  }

  async updateRunProgress(runId: string, input: { completedTurns?: number; lastTickId?: string | null; lastAdvancedAt?: string | null }): Promise<GameplayRun> {
    if (!this.run || this.run.id !== runId) throw new Error(`Missing run ${runId}`)
    this.run = { ...this.run, completedTurns: input.completedTurns ?? this.run.completedTurns, lastTickId: input.lastTickId ?? this.run.lastTickId, lastAdvancedAt: input.lastAdvancedAt ?? this.run.lastAdvancedAt, updatedAt: BASE_TIME }
    return this.run
  }

  async markRunCompleted(runId: string, input: { completedTurns?: number; lastTickId?: string | null; lastAdvancedAt?: string | null; completedAt?: string; stopReason?: string | null }): Promise<GameplayRun> {
    return this.markRun(runId, 'completed', input)
  }

  async markRunStopped(runId: string, input: { completedTurns?: number; lastTickId?: string | null; lastAdvancedAt?: string | null; completedAt?: string; stopReason?: string | null }): Promise<GameplayRun> {
    return this.markRun(runId, 'stopped', input)
  }

  async markRunFailed(runId: string, input: { completedTurns?: number; lastTickId?: string | null; lastAdvancedAt?: string | null; completedAt?: string; stopReason?: string | null; lastError?: string | null }): Promise<GameplayRun> {
    return this.markRun(runId, 'failed', input)
  }

  async updateState(_room: unknown, input: Partial<GameplayRoomState>): Promise<GameplayRoomState | null> {
    this.state = this.state ? { ...this.state, ...input, updatedAt: BASE_TIME } : null
    return this.state
  }

  async updateRewardClaimStatusByDeathReviewId(): Promise<null> { return null }

  private markRun(runId: string, status: GameplayRun['status'], input: { completedTurns?: number; lastTickId?: string | null; lastAdvancedAt?: string | null; completedAt?: string; stopReason?: string | null; lastError?: string | null }): GameplayRun {
    if (!this.run || this.run.id !== runId) throw new Error(`Missing run ${runId}`)
    this.run = {
      ...this.run,
      status,
      completedTurns: input.completedTurns ?? this.run.completedTurns,
      lastTickId: input.lastTickId ?? this.run.lastTickId,
      lastAdvancedAt: input.lastAdvancedAt ?? this.run.lastAdvancedAt,
      completedAt: input.completedAt ?? BASE_TIME,
      stopReason: input.stopReason ?? this.run.stopReason,
      lastError: input.lastError ?? this.run.lastError,
      updatedAt: BASE_TIME,
    }
    return this.run
  }
}
