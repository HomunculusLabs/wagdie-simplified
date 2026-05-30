import type { GameplayRun, GameplayRunStartedByActor } from '@/lib/eliza/locationRooms/gameplay/types'
import type { LocationRoom } from '@/lib/eliza/locationRooms/types'
import type { NarrativeHarnessScenario } from './scenarios'
import { BASE_TIME } from './scenarios'

export function combatReadyMetadata(): Record<string, unknown> {
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

export class InMemoryGameplayRepository {
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

export class CountingGameplayCoordinator {
  public processCalls = 0

  async processTurn(): Promise<{ status: 'completed'; selectedTokenId: number; messageId: string }> {
    this.processCalls += 1
    return { status: 'completed', selectedTokenId: 101, messageId: `combat-message-${this.processCalls}` }
  }

  async markTickFailed(): Promise<void> {}
}
