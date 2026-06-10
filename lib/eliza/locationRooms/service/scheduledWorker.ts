import { randomUUID } from 'crypto'
import { elizaConfig } from '@/lib/eliza/config'
import type {
  EnqueueScheduledTicksResult,
  LocationRoomWorkerResult,
  LocationRoomWorkerRunCounters,
  ProcessLocationRoomTickResult,
} from '../types'
import type { LocationRoomRepository } from '../repository'
import type { LocationRoomMembershipRepository } from '../membership'
import type { LocationRoomGameplayRepository } from '../gameplay/repository'
import type { LocationRoomNarrativeRepository } from '../narrativeRepository'
import type { GameMasterAgentResolver } from '../narrativeCoordinator'
import type { LocationRoomTickProcessor } from './tickProcessor'
import {
  ensureLocationRoomFeatureEnabled,
  ensureLocationRoomGameplayConfigReady,
  filterWorkerLocationIds,
  getWorkerLocationAllowlist,
  isLocationRoomGameplayEnabledForLocation,
} from './configGuards'
import { isActiveTickConstraintError, MIN_ELIGIBLE_PARTICIPANTS, routeSafeError } from './support'
import {
  hasMinimumPlayableGameplayParticipants,
  markTerminalEncounterAftermath,
  resolveGameplayRunContinuationContext,
  terminalEncounterRunStatus,
} from './gameplayRouting'

export type LocationRoomScheduledWorkerDependencies = {
  repository: LocationRoomRepository
  membership: LocationRoomMembershipRepository
  gameplayRepository: LocationRoomGameplayRepository
  narrativeRepository: LocationRoomNarrativeRepository
  gameMasterAgentResolver: GameMasterAgentResolver
  tickProcessor: LocationRoomTickProcessor
}

export class LocationRoomScheduledWorker {
  constructor(
    private readonly dependencies: LocationRoomScheduledWorkerDependencies
  ) {}

  private get repository(): LocationRoomRepository { return this.dependencies.repository }
  private get membership(): LocationRoomMembershipRepository { return this.dependencies.membership }
  private get gameplayRepository(): LocationRoomGameplayRepository { return this.dependencies.gameplayRepository }
  private get narrativeRepository(): LocationRoomNarrativeRepository { return this.dependencies.narrativeRepository }
  private get gameMasterAgentResolver(): GameMasterAgentResolver { return this.dependencies.gameMasterAgentResolver }
  private get tickProcessor(): LocationRoomTickProcessor { return this.dependencies.tickProcessor }

  async enqueueDueScheduledTicks(now = new Date(), locationAllowlist = getWorkerLocationAllowlist()): Promise<EnqueueScheduledTicksResult> {
    await ensureLocationRoomFeatureEnabled(this.gameMasterAgentResolver)

    const activeLocationIds = filterWorkerLocationIds(
      await this.membership.listEligibleLocationIds(MIN_ELIGIBLE_PARTICIPANTS),
      locationAllowlist
    )
    for (const locationId of activeLocationIds) {
      const location = await this.repository.getLocation(locationId)
      if (location) {
        await this.repository.ensureRoomForLocation(locationId)
      }
    }

    const dueRooms = await this.repository.listDueRooms(
      now,
      Math.max(elizaConfig.locationRooms.maxTicksPerRun, activeLocationIds.length, 1),
      locationAllowlist
    )

    for (const room of dueRooms) {
      await ensureLocationRoomGameplayConfigReady(room.locationId, this.gameMasterAgentResolver)
    }

    let enqueued = 0
    let deduped = 0
    for (const room of dueRooms) {
      try {
        const result = await this.repository.enqueueTick({
          room,
          triggerType: 'scheduled',
          gameplayRunId: null,
          turnIntent: 'auto',
        })
        if (result.deduped) deduped += 1
        else enqueued += 1
      } catch (error) {
        if (!isActiveTickConstraintError(error)) throw error
        deduped += 1
      }
    }

    return {
      roomsChecked: dueRooms.length,
      enqueued,
      deduped,
    }
  }

  async processDueTicks(limit = elizaConfig.locationRooms.maxTicksPerRun, now = new Date()): Promise<ProcessLocationRoomTickResult[]> {
    await ensureLocationRoomFeatureEnabled(this.gameMasterAgentResolver)

    const workerId = `location-room-worker-${randomUUID()}`
    const ticks = await this.repository.claimDueTicks(limit, workerId, now, getWorkerLocationAllowlist())
    const results: ProcessLocationRoomTickResult[] = []

    for (const tick of ticks) {
      results.push(await this.tickProcessor.processClaimedTick(tick, now))
    }

    return results
  }

  async runScheduledWorker(now = new Date()): Promise<LocationRoomWorkerResult> {
    await ensureLocationRoomFeatureEnabled(this.gameMasterAgentResolver)

    const maxTicks = Math.max(0, elizaConfig.locationRooms.maxTicksPerRun)
    const workerLocationAllowlist = getWorkerLocationAllowlist()
    const enqueueResult = await this.enqueueDueScheduledTicks(now, workerLocationAllowlist)
    const workerId = `location-room-worker-${randomUUID()}`
    const results: ProcessLocationRoomTickResult[] = []
    const processedTickIds = new Set<string>()
    const inspectedActiveRunIds = new Set<string>()
    const gameplayRuns: LocationRoomWorkerRunCounters = {
      inspected: 0,
      enqueued: 0,
      blocked: 0,
      updated: 0,
      completed: 0,
      stopped: 0,
      failed: 0,
    }
    let enqueued = enqueueResult.enqueued
    let deduped = enqueueResult.deduped

    while (results.length < maxTicks) {
      const remaining = maxTicks - results.length
      const claimedTicks = await this.repository.claimDueTicks(remaining, workerId, now, workerLocationAllowlist)
      const ticks = claimedTicks.filter((tick) => !processedTickIds.has(tick.id))

      if (ticks.length > 0) {
        for (const tick of ticks) {
          processedTickIds.add(tick.id)
          const result = await this.tickProcessor.processClaimedTick(tick, now)
          results.push(result)
          if (result.gameplayRun) {
            if (result.gameplayRun.status === 'active' && result.status !== 'failed') gameplayRuns.updated += 1
            else if (result.gameplayRun.status === 'completed') gameplayRuns.completed += 1
            else if (result.gameplayRun.status === 'stopped') gameplayRuns.stopped += 1
            else if (result.gameplayRun.status === 'failed') gameplayRuns.failed += 1
          }
        }
        continue
      }

      if (claimedTicks.length > 0) break

      const activeRunEnqueue = await this.enqueueActiveGameplayRunContinuations(
        now,
        gameplayRuns,
        maxTicks - results.length,
        inspectedActiveRunIds
      )
      enqueued += activeRunEnqueue.enqueued
      deduped += activeRunEnqueue.deduped
      if (activeRunEnqueue.enqueued === 0 && activeRunEnqueue.deduped === 0) break
    }

    return {
      enabled: true,
      enqueued,
      deduped,
      processed: results.length,
      completed: results.filter((result) => result.status === 'completed').length,
      skipped: results.filter((result) => result.status === 'skipped').length,
      failed: results.filter((result) => result.status === 'failed').length,
      dead: results.filter((result) => result.status === 'dead').length,
      gameplayRuns,
      results,
    }
  }

  private async enqueueActiveGameplayRunContinuations(
    now: Date,
    counters: LocationRoomWorkerRunCounters,
    remainingProcessingCapacity: number,
    inspectedRunIds: Set<string>
  ): Promise<{ enqueued: number; deduped: number }> {
    const runs = await this.gameplayRepository.listActiveRunsForWorker(
      elizaConfig.locationRooms.gameplay.automation.maxActiveRunsPerWorker
    )
    let enqueued = 0
    let deduped = 0
    const representedRoomIds = new Set<string>()

    for (const run of runs) {
      if (enqueued >= remainingProcessingCapacity) break
      const firstInspection = !inspectedRunIds.has(run.id)
      if (firstInspection && inspectedRunIds.size >= elizaConfig.locationRooms.gameplay.automation.maxActiveRunsPerWorker) break
      if (firstInspection) {
        inspectedRunIds.add(run.id)
        counters.inspected += 1
      }
      if (representedRoomIds.has(run.roomId)) continue
      representedRoomIds.add(run.roomId)

      const completedTurns = await this.repository.countCompletedGameplayTurnsForRun(run.id)
      const currentRun = completedTurns !== run.completedTurns
        ? await this.gameplayRepository.updateRunProgress(run.id, {
            completedTurns,
            lastAdvancedAt: run.lastAdvancedAt,
            lastTickId: run.lastTickId,
          })
        : run

      const room = await this.repository.findRoomById(currentRun.roomId)
      if (!room) {
        await this.gameplayRepository.markRunFailed(currentRun.id, {
          stopReason: 'room_missing',
          completedTurns,
          lastError: 'Location room no longer exists',
          completedAt: now.toISOString(),
        })
        counters.failed += 1
        continue
      }

      if (!room.tickEnabled) {
        await this.gameplayRepository.markRunStopped(currentRun.id, {
          stopReason: 'tick_disabled',
          completedTurns,
          completedAt: now.toISOString(),
        })
        counters.stopped += 1
        continue
      }

      if (!isLocationRoomGameplayEnabledForLocation(room.locationId)) {
        await this.gameplayRepository.markRunStopped(currentRun.id, {
          stopReason: 'gameplay_disabled',
          completedTurns,
          completedAt: now.toISOString(),
        })
        counters.stopped += 1
        continue
      }

      try {
        await ensureLocationRoomGameplayConfigReady(room.locationId, this.gameMasterAgentResolver)
      } catch (error) {
        await this.gameplayRepository.markRunStopped(currentRun.id, {
          stopReason: 'invalid_gameplay_config',
          completedTurns,
          lastError: routeSafeError(error),
          completedAt: now.toISOString(),
        })
        counters.stopped += 1
        continue
      }

      const openTick = await this.repository.findOpenTickForRoom(room.id)
      if (openTick) {
        counters.blocked += 1
        continue
      }

      const { state, encounter: activeEncounter } = await resolveGameplayRunContinuationContext({
        gameplayRepository: this.gameplayRepository,
        room,
      })
      const terminalRunStatus = activeEncounter ? terminalEncounterRunStatus(activeEncounter.status) : null
      if (!activeEncounter) {
        await this.gameplayRepository.markRunStopped(currentRun.id, {
          stopReason: 'no_active_gameplay_encounter',
          completedTurns,
          completedAt: now.toISOString(),
        })
        counters.stopped += 1
        continue
      }
      if (terminalRunStatus === 'completed') {
        await markTerminalEncounterAftermath({ gameplayRepository: this.gameplayRepository, narrativeRepository: this.narrativeRepository, room, encounter: activeEncounter, now, source: 'active-run-worker-terminal' })
        await this.gameplayRepository.markRunCompleted(currentRun.id, {
          stopReason: `encounter_${activeEncounter.status}`,
          completedTurns,
          completedAt: now.toISOString(),
        })
        counters.completed += 1
        continue
      }
      if (terminalRunStatus === 'stopped') {
        await markTerminalEncounterAftermath({ gameplayRepository: this.gameplayRepository, narrativeRepository: this.narrativeRepository, room, encounter: activeEncounter, now, source: 'active-run-worker-terminal' })
        await this.gameplayRepository.markRunStopped(currentRun.id, {
          stopReason: `encounter_${activeEncounter.status}`,
          completedTurns,
          completedAt: now.toISOString(),
        })
        counters.stopped += 1
        continue
      }

      const participants = await this.membership.listEligibleParticipantsByLocation(room.locationId)
      if (participants.length < MIN_ELIGIBLE_PARTICIPANTS) {
        await this.gameplayRepository.markRunStopped(currentRun.id, {
          stopReason: 'insufficient_participants',
          completedTurns,
          completedAt: now.toISOString(),
        })
        counters.stopped += 1
        continue
      }

      if (!hasMinimumPlayableGameplayParticipants(participants, state)) {
        await this.gameplayRepository.markRunStopped(currentRun.id, {
          stopReason: 'insufficient_living_gameplay_participants',
          completedTurns,
          completedAt: now.toISOString(),
        })
        counters.stopped += 1
        continue
      }

      try {
        const result = await this.repository.enqueueTick({
          room,
          triggerType: 'scheduled',
          gameplayRunId: currentRun.id,
          turnIntent: 'combat',
          nextAttemptAt: now,
        })
        if (result.deduped) {
          deduped += 1
          counters.blocked += 1
        } else {
          enqueued += 1
          counters.enqueued += 1
        }
      } catch (error) {
        if (!isActiveTickConstraintError(error)) throw error
        deduped += 1
        counters.blocked += 1
      }
    }

    return { enqueued, deduped }
  }
}
