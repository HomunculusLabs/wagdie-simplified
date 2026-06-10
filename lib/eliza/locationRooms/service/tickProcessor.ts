import { elizaConfig } from '@/lib/eliza/config'
import type {
  LocationRoom,
  LocationRoomGameplayRunSummary,
  LocationRoomParticipant,
  LocationRoomTick,
  LocationRoomTickPublicOutputOutcome,
  ProcessLocationRoomTickResult,
} from '../types'
import type { LocationRoomRepository } from '../repository'
import type { LocationRoomMembershipRepository } from '../membership'
import type { LocationRoomNarrativeRepository } from '../narrativeRepository'
import {
  mergeNarrativeTtrpgMetadata,
  normalizeNarrativeSceneCheckMetadata,
  normalizeNarrativeTtrpgMetadata,
  refreshAdventureCatalogMetadataFromLocation,
  type LocationRoomNarrativeState,
} from '../narrativeTypes'
import {
  normalizeLocationRoomGeneratedContent,
  type OfficialLocationRoomTurnGenerator,
} from '../officialTurnGenerator'
import type { GameMasterAgentResolver, LocationRoomNarrativeCoordinator } from '../narrativeCoordinator'
import type { LocationRoomGameplayCoordinator, LocationRoomGameplayEncounterTrigger } from '../gameplay/coordinator'
import type { LocationRoomGameplayRepository } from '../gameplay/repository'
import type { GameplayEncounter, GameplayRoomState, GameplayRun } from '../gameplay/types'
import { selectLocationRoomSpeaker } from '../speakerSelection'
import { LocationRoomManualTickIntentForbiddenError } from './errors'
import { ensureLocationRoomGameplayConfigReady, isLocationRoomGameplayEnabledForLocation } from './configGuards'
import { logLocationRoomRouteDecision, type LocationRoomRouteDiagnostic } from './routeDiagnostics'
import { MAX_TICK_ATTEMPTS, MIN_ELIGIBLE_PARTICIPANTS, nextRetryAt, routeSafeError } from './support'
import {
  gameplayRunStartedByActor,
  isCombatReadySourceBeat,
  isUnconsumedCombatTrigger,
  manualCombatTriggerId,
  nullableMetadataId,
  resolveGameplayRunContinuationContext,
  terminalEncounterRunStatus,
  toGameplayRunSummary,
} from './gameplayRouting'

export type LocationRoomTickProcessorDependencies = {
  repository: LocationRoomRepository
  membership: LocationRoomMembershipRepository
  turnGenerator: OfficialLocationRoomTurnGenerator
  narrativeCoordinator: LocationRoomNarrativeCoordinator
  gameMasterAgentResolver: GameMasterAgentResolver
  gameplayCoordinator: LocationRoomGameplayCoordinator
  gameplayRepository: LocationRoomGameplayRepository
  narrativeRepository: LocationRoomNarrativeRepository
}

function isParticipantAvailableForRoomSpeech(
  participant: Pick<LocationRoomParticipant, 'tokenId'>,
  gameplayState: GameplayRoomState | null
): boolean {
  if (!gameplayState) return true
  const character = gameplayState.characters[String(participant.tokenId)]
  if (!character) return true
  if (character.status === 'dead' || character.status === 'fled') return false
  return character.hp > 0
}

function filterParticipantsAvailableForRoomSpeech(
  participants: LocationRoomParticipant[],
  gameplayState: GameplayRoomState | null
): LocationRoomParticipant[] {
  return participants.filter((participant) => isParticipantAvailableForRoomSpeech(participant, gameplayState))
}

function classifyPublicOutputOutcome(result: ProcessLocationRoomTickResult): LocationRoomTickPublicOutputOutcome | undefined {
  const messageIds = result.messageIds ?? []
  const publicMessageAppended = Boolean(result.messageId || messageIds.length > 0 || result.publicGameMasterBeatAppended)
  if (publicMessageAppended) return 'public_message_appended'

  if (result.status === 'failed') return 'failed_retry'
  if (result.status === 'dead') return 'failed_terminal'
  if (result.status === 'completed') {
    if (result.gameplayRun && result.gameplayRun.status !== 'active') return 'terminal_run_closed'
    return 'intentional_no_output'
  }

  if (result.status === 'skipped') {
    if (result.reason === 'insufficient_participants' || result.reason === 'insufficient_living_gameplay_participants') {
      return 'blocked_waiting_for_participants'
    }
    if (result.gameplayRun && result.gameplayRun.status !== 'active') return 'terminal_run_closed'
    return 'intentional_no_output'
  }

  return undefined
}

function withPublicOutputOutcome(result: ProcessLocationRoomTickResult): ProcessLocationRoomTickResult {
  const publicOutputOutcome = classifyPublicOutputOutcome(result)
  return publicOutputOutcome ? { ...result, publicOutputOutcome } : result
}

export class LocationRoomTickProcessor {
  constructor(
    private readonly dependencies: LocationRoomTickProcessorDependencies
  ) {}

  private get repository(): LocationRoomRepository { return this.dependencies.repository }
  private get membership(): LocationRoomMembershipRepository { return this.dependencies.membership }
  private get turnGenerator(): OfficialLocationRoomTurnGenerator { return this.dependencies.turnGenerator }
  private get narrativeCoordinator(): LocationRoomNarrativeCoordinator { return this.dependencies.narrativeCoordinator }
  private get gameMasterAgentResolver(): GameMasterAgentResolver { return this.dependencies.gameMasterAgentResolver }
  private get gameplayCoordinator(): LocationRoomGameplayCoordinator { return this.dependencies.gameplayCoordinator }
  private get gameplayRepository(): LocationRoomGameplayRepository { return this.dependencies.gameplayRepository }
  private get narrativeRepository(): LocationRoomNarrativeRepository { return this.dependencies.narrativeRepository }

  private async ensureNarrativeStateWithLocationCatalog(room: LocationRoom): Promise<LocationRoomNarrativeState> {
    const locationDetails = await this.repository.getLocationDetails(room.locationId)
    const seedMetadata = refreshAdventureCatalogMetadataFromLocation(undefined, locationDetails?.metadata)
    let narrativeState = await this.narrativeRepository.ensureStateForRoom({
      room,
      ...(seedMetadata.changed ? { metadata: seedMetadata.metadata } : {}),
    })
    const refreshedMetadata = refreshAdventureCatalogMetadataFromLocation(narrativeState.metadata, locationDetails?.metadata)
    if (refreshedMetadata.changed) {
      narrativeState = await this.narrativeRepository.updateState(room, {
        metadata: refreshedMetadata.metadata,
      })
    }
    return narrativeState
  }

  private async resolveCombatReadyPromotionSourceBeatId(params: {
    room: LocationRoom
    metadata: Record<string, unknown>
  }): Promise<string | null> {
    const ttrpg = normalizeNarrativeTtrpgMetadata(params.metadata)
    const recentBeats = await this.narrativeRepository.listRecentBeatsByRoomId(params.room.id, 10).catch(() => [])
    const explicitReadyBeatId = nullableMetadataId(params.metadata.lastCombatReadyBeatId)
    if (explicitReadyBeatId) {
      const explicitBeat = recentBeats.find((beat) => beat.id === explicitReadyBeatId)
      if (!explicitBeat || !isCombatReadySourceBeat(explicitBeat)) return null
      return ttrpg.consumedCombatTriggerBeatId === explicitReadyBeatId ? null : explicitReadyBeatId
    }

    const lastBeatId = nullableMetadataId(params.metadata.lastBeatId)
    if (lastBeatId) {
      const lastBeat = recentBeats.find((beat) => beat.id === lastBeatId)
      if (lastBeat && isCombatReadySourceBeat(lastBeat)) {
        return ttrpg.consumedCombatTriggerBeatId === lastBeatId ? null : lastBeatId
      }
    }

    const sourceBeat = recentBeats.find((beat) =>
      beat.id !== ttrpg.consumedCombatTriggerBeatId && isCombatReadySourceBeat(beat)
    )
    return sourceBeat?.id ?? null
  }

  private async promoteCombatReadyNarrativeStateForAutoTick(params: {
    room: LocationRoom
    tick: LocationRoomTick
    narrativeState: LocationRoomNarrativeState
    now: Date
  }): Promise<LocationRoomNarrativeState> {
    const ttrpg = normalizeNarrativeTtrpgMetadata(params.narrativeState.metadata)

    if (ttrpg.requestedGameplayAction === 'start_combat') return params.narrativeState
    if (isUnconsumedCombatTrigger(ttrpg)) return params.narrativeState
    if (ttrpg.ttrpgPhase !== 'threat') return params.narrativeState
    if (ttrpg.combatReadiness !== 'ready') return params.narrativeState
    if ((ttrpg.threatLevel ?? 0) < 3) return params.narrativeState
    if (!ttrpg.lastEncounterSeed) return params.narrativeState

    const sourceBeatId = await this.resolveCombatReadyPromotionSourceBeatId({
      room: params.room,
      metadata: params.narrativeState.metadata,
    })
    if (!sourceBeatId || ttrpg.consumedCombatTriggerBeatId === sourceBeatId) {
      return params.narrativeState
    }

    return this.narrativeRepository.updateState(params.room, {
      metadata: mergeNarrativeTtrpgMetadata(params.narrativeState.metadata, {
        ttrpgPhase: 'threat',
        combatReadiness: 'ready',
        threatLevel: ttrpg.threatLevel,
        requestedGameplayAction: 'start_combat',
        lastEncounterSeed: ttrpg.lastEncounterSeed,
        lastCombatTriggerBeatId: sourceBeatId,
      }, {
        source: 'location-room-combat-ready-promotion',
        lastCombatReadyPromotion: {
          sourceBeatId,
          tickId: params.tick.id,
          promotedAt: params.now.toISOString(),
        },
        lastCombatReadyPromotionBeatId: sourceBeatId,
        lastCombatReadyPromotionTickId: params.tick.id,
        lastCombatReadyPromotionAt: params.now.toISOString(),
      }),
    })
  }

  private async ensureAdminCombatTriggerForTick(params: {
    room: LocationRoom
    tick: LocationRoomTick
    now: Date
  }): Promise<LocationRoomGameplayEncounterTrigger> {
    const triggerId = manualCombatTriggerId(params.tick.id)
    const narrativeState = await this.narrativeRepository.ensureStateForRoom({ room: params.room })
    const ttrpg = normalizeNarrativeTtrpgMetadata(narrativeState.metadata)

    if (!isUnconsumedCombatTrigger(ttrpg) || ttrpg.lastCombatTriggerBeatId !== triggerId) {
      await this.narrativeRepository.updateState(params.room, {
        metadata: mergeNarrativeTtrpgMetadata(narrativeState.metadata, {
          ttrpgPhase: 'threat',
          combatReadiness: 'ready',
          threatLevel: Math.max(ttrpg.threatLevel ?? 0, 5),
          requestedGameplayAction: 'start_combat',
          lastEncounterSeed: ttrpg.lastEncounterSeed,
          lastCombatTriggerBeatId: triggerId,
        }, {
          source: 'location-room-manual-tick-intent',
          lastManualIntent: 'combat',
          lastManualIntentActor: 'admin',
          lastManualIntentAt: params.now.toISOString(),
          lastManualIntentTickId: params.tick.id,
        }),
      })
    }

    return {
      source: 'admin',
      triggerId,
      narrativeBeatId: null,
      encounterSeed: ttrpg.lastEncounterSeed,
      speakerInstruction: null,
    }
  }

  private async buildEncounterTriggerFromNarrativeState(
    room: LocationRoom,
    stateMetadata: Record<string, unknown>
  ): Promise<LocationRoomGameplayEncounterTrigger | null> {
    const ttrpg = normalizeNarrativeTtrpgMetadata(stateMetadata)
    if (!isUnconsumedCombatTrigger(ttrpg) || !ttrpg.lastCombatTriggerBeatId) return null

    const triggerId = ttrpg.lastCombatTriggerBeatId
    const isManualAdminTrigger = triggerId.startsWith('manual:')
    let speakerInstruction: string | null = null

    if (!isManualAdminTrigger) {
      const beats = await this.narrativeRepository.listRecentBeatsByRoomId(room.id, 10).catch(() => [])
      const beat = beats.find((candidate) => candidate.id === triggerId)
      speakerInstruction = beat?.speakerInstruction ?? null
    }

    return {
      source: isManualAdminTrigger ? 'admin' : 'narrative',
      triggerId,
      narrativeBeatId: isManualAdminTrigger ? null : triggerId,
      encounterSeed: ttrpg.lastEncounterSeed,
      speakerInstruction,
    }
  }

  private async markTerminalEncounterAftermath(params: {
    room: LocationRoom
    encounter: GameplayEncounter
    now: Date
    source: string
  }): Promise<void> {
    const state = await this.gameplayRepository.findStateByRoomId(params.room.id).catch(() => null)
    if (state && state.activeEncounterId === params.encounter.id) {
      await this.gameplayRepository.updateState(params.room, {
        status: 'aftermath',
        activeEncounterId: null,
        metadata: {
          ...state.metadata,
          source: params.source,
          lastTerminalEncounterId: params.encounter.id,
          lastTerminalEncounterStatus: params.encounter.status,
          lastTerminalEncounterAt: params.now.toISOString(),
        },
      }).catch(() => null)
    }

    const narrativeState = await this.narrativeRepository.ensureStateForRoom({ room: params.room }).catch(() => null)
    if (narrativeState) {
      await this.narrativeRepository.updateState(params.room, {
        metadata: mergeNarrativeTtrpgMetadata(narrativeState.metadata, {
          ttrpgPhase: 'aftermath',
          combatReadiness: 'none',
          threatLevel: null,
          requestedGameplayAction: null,
        }, {
          source: params.source,
          lastGameplayEncounterId: params.encounter.id,
          lastGameplayTerminalStatus: params.encounter.status,
          lastGameplayTerminalAt: params.now.toISOString(),
        }),
      }).catch(() => null)
    }
  }

  private async ensureGameplayRunForCombat(params: {
    room: LocationRoom
    tick: LocationRoomTick
    source: 'active_encounter' | 'combat_trigger'
    encounterTrigger?: LocationRoomGameplayEncounterTrigger
  }): Promise<{ tick: LocationRoomTick; run: GameplayRun; reused: boolean }> {
    if (params.tick.gameplayRunId) {
      const existing = await this.gameplayRepository.findRunById(params.tick.gameplayRunId)
      if (existing && existing.status === 'active') {
        return { tick: params.tick, run: existing, reused: true }
      }
      throw new Error('Claimed combat tick is attached to a stale gameplay run')
    }

    const runResult = await this.gameplayRepository.createOrReuseActiveRun({
      room: params.room,
      targetCompletedTurns: elizaConfig.locationRooms.gameplay.automation.targetCompletedTurns,
      startedByActor: gameplayRunStartedByActor(params.tick.triggerType),
      startedByWallet: params.tick.requestedByWallet,
      startedByTokenId: params.tick.requestedByTokenId,
      metadata: {
        source: 'phase_aware_combat_routing',
        routeSource: params.source,
        triggerType: params.tick.triggerType,
        tickId: params.tick.id,
        ...(params.encounterTrigger ? {
          encounterTriggerSource: params.encounterTrigger.source,
          encounterTriggerId: params.encounterTrigger.triggerId,
          narrativeBeatId: params.encounterTrigger.narrativeBeatId ?? null,
        } : {}),
      },
    })

    const attachedTick = await this.repository.attachTickToGameplayRun({
      tickId: params.tick.id,
      roomId: params.room.id,
      gameplayRunId: runResult.run.id,
    })

    if (!attachedTick || attachedTick.gameplayRunId !== runResult.run.id) {
      throw new Error('Claimed combat tick could not be durably attached to the gameplay run')
    }

    return {
      tick: attachedTick,
      run: runResult.run,
      reused: runResult.reused,
    }
  }

  private async synchronizeGameplayRunAfterTick(
    tick: LocationRoomTick,
    result: ProcessLocationRoomTickResult,
    now: Date,
    effectiveGameplayRunId?: string | null
  ): Promise<LocationRoomGameplayRunSummary | undefined> {
    const runId = result.gameplayRunId ?? effectiveGameplayRunId ?? tick.gameplayRunId
    if (!runId) return undefined

    const run = await this.gameplayRepository.findRunById(runId)
    if (!run || run.status !== 'active') return run ? toGameplayRunSummary(run) : undefined

    if (result.status === 'failed') {
      return toGameplayRunSummary(run)
    }

    const completedTurns = await this.repository.countCompletedGameplayTurnsForRun(run.id)
    const terminalBase = {
      completedTurns,
      lastTickId: tick.id,
      lastAdvancedAt: now.toISOString(),
      completedAt: now.toISOString(),
    }

    if (result.status === 'dead') {
      const failedRun = await this.gameplayRepository.markRunFailed(run.id, {
        ...terminalBase,
        stopReason: 'tick_dead',
        lastError: result.reason ?? 'Location room tick died',
      })
      return toGameplayRunSummary(failedRun)
    }

    const stopReason = result.status === 'skipped'
      ? result.reason ?? 'tick_skipped'
      : null
    if (stopReason?.startsWith('encounter_')) {
      const status = stopReason.slice('encounter_'.length)
      const terminalRunStatus = terminalEncounterRunStatus(status)
      if (terminalRunStatus === 'completed') {
        const completedRun = await this.gameplayRepository.markRunCompleted(run.id, {
          ...terminalBase,
          stopReason,
        })
        return toGameplayRunSummary(completedRun)
      }
      if (terminalRunStatus === 'stopped') {
        const stoppedRun = await this.gameplayRepository.markRunStopped(run.id, {
          ...terminalBase,
          stopReason,
        })
        return toGameplayRunSummary(stoppedRun)
      }
    }
    if (stopReason && [
      'insufficient_participants',
      'insufficient_living_gameplay_participants',
      'no_active_gameplay_encounter',
      'no_combat_trigger',
    ].includes(stopReason)) {
      const stoppedRun = await this.gameplayRepository.markRunStopped(run.id, {
        ...terminalBase,
        stopReason,
      })
      return toGameplayRunSummary(stoppedRun)
    }

    const turn = await this.gameplayRepository.findTurnByTickId(tick.id).catch(() => null)
    const encounter = turn?.encounterId
      ? await this.gameplayRepository.findEncounterById(turn.encounterId).catch(() => null)
      : null
    const terminalRunStatus = encounter ? terminalEncounterRunStatus(encounter.status) : null
    if (terminalRunStatus === 'completed') {
      await this.markTerminalEncounterAftermath({ room: { id: run.roomId, locationId: run.locationId } as LocationRoom, encounter: encounter!, now, source: 'gameplay-run-sync-terminal' })
      const completedRun = await this.gameplayRepository.markRunCompleted(run.id, {
        ...terminalBase,
        stopReason: `encounter_${encounter?.status}`,
      })
      return toGameplayRunSummary(completedRun)
    }
    if (terminalRunStatus === 'stopped') {
      await this.markTerminalEncounterAftermath({ room: { id: run.roomId, locationId: run.locationId } as LocationRoom, encounter: encounter!, now, source: 'gameplay-run-sync-terminal' })
      const stoppedRun = await this.gameplayRepository.markRunStopped(run.id, {
        ...terminalBase,
        stopReason: `encounter_${encounter?.status}`,
      })
      return toGameplayRunSummary(stoppedRun)
    }

    let updatedRun = await this.gameplayRepository.updateRunProgress(run.id, {
      completedTurns,
      lastTickId: tick.id,
      lastAdvancedAt: now.toISOString(),
    })

    if (completedTurns >= updatedRun.targetCompletedTurns && encounter?.status !== 'active') {
      updatedRun = await this.gameplayRepository.markRunCompleted(run.id, {
        ...terminalBase,
        stopReason: 'target_reached',
      })
      return toGameplayRunSummary(updatedRun)
    }

    return toGameplayRunSummary(updatedRun)
  }

  async processClaimedTick(tick: LocationRoomTick, now: Date): Promise<ProcessLocationRoomTickResult> {
    let result: ProcessLocationRoomTickResult
    const context: { effectiveGameplayRunId: string | null } = { effectiveGameplayRunId: tick.gameplayRunId }
    try {
      result = await this.processClaimedTickUnsafe(tick, now, context)
    } catch (error) {
      const storedError = routeSafeError(error)
      const selectedTokenId = tick.selectedTokenId
      const durableGameplayTurn = context.effectiveGameplayRunId || tick.gameplayRunId
        ? null
        : await Promise.resolve(this.gameplayRepository.findTurnByTickId(tick.id)).catch(() => null)
      const shouldMarkGameplayTurn = Boolean(context.effectiveGameplayRunId || tick.gameplayRunId || durableGameplayTurn)
      const shouldMarkNarrativeBeat = !shouldMarkGameplayTurn && elizaConfig.locationRooms.narrative.enabled

      if (tick.attempts >= MAX_TICK_ATTEMPTS) {
        if (shouldMarkGameplayTurn) {
          await this.gameplayCoordinator.markTickFailed(tick.id, error, { dead: true }).catch(() => null)
        } else if (shouldMarkNarrativeBeat) {
          await this.narrativeCoordinator.markTickFailed(tick.id, error, { dead: true }).catch(() => null)
        }
        await this.repository.markTickDead(tick.id, storedError).catch(() => null)
        result = {
          tickId: tick.id,
          gameplayRunId: tick.gameplayRunId,
          status: 'dead',
          selectedTokenId,
          reason: 'attempts_exhausted',
        }
      } else {
        if (shouldMarkGameplayTurn) {
          await this.gameplayCoordinator.markTickFailed(tick.id, error).catch(() => null)
        } else if (shouldMarkNarrativeBeat) {
          await this.narrativeCoordinator.markTickFailed(tick.id, error).catch(() => null)
        }

        await this.repository.markTickFailed(tick.id, storedError, nextRetryAt(tick.attempts, now)).catch(() => null)
        result = {
          tickId: tick.id,
          gameplayRunId: tick.gameplayRunId,
          status: 'failed',
          selectedTokenId,
          reason: 'retry_scheduled',
        }
      }
    }

    if (context.effectiveGameplayRunId || tick.gameplayRunId) {
      result = { ...result, gameplayRunId: result.gameplayRunId ?? context.effectiveGameplayRunId ?? tick.gameplayRunId }
    }

    const gameplayRun = await this.synchronizeGameplayRunAfterTick(tick, result, now, context.effectiveGameplayRunId).catch((error) => {
      console.error('[Eliza Location Rooms] gameplay run lifecycle update failed', error)
      return undefined
    })
    const resultWithRun = gameplayRun ? { ...result, gameplayRun } : result
    return withPublicOutputOutcome(resultWithRun)
  }

  private async processClaimedTickUnsafe(
    tick: LocationRoomTick,
    now: Date,
    context: { effectiveGameplayRunId: string | null }
  ): Promise<ProcessLocationRoomTickResult> {
    const room = await this.repository.findRoomById(tick.roomId)
    if (!room) {
      await this.repository.markTickDead(tick.id, 'Location room no longer exists')
      return {
        tickId: tick.id,
        status: 'dead',
        selectedTokenId: null,
        reason: 'room_missing',
      }
    }

    await ensureLocationRoomGameplayConfigReady(room.locationId, this.gameMasterAgentResolver)

    const gameplayEnabledForLocation = isLocationRoomGameplayEnabledForLocation(room.locationId)
    const participants = await this.membership.listEligibleParticipantsByLocation(room.locationId)
    const gameplayStateForNarrativeSpeech = gameplayEnabledForLocation
      ? await this.gameplayRepository.findStateByRoomId(room.id).catch(() => null)
      : null
    const turnIntent = tick.turnIntent ?? 'auto'
    const gameplayGateResult: LocationRoomRouteDiagnostic['gameplayGateResult'] = gameplayEnabledForLocation ? 'enabled' : 'disabled'
    let activeEncounter: GameplayEncounter | null = null
    let activeEncounterId: string | null = null
    let combatTriggerId: string | null = null
    let preRouteSceneCheckRequestPresent = false
    let preRouteSceneCheckProposalPresent = false
    let preRouteSceneCheckProposalErrorPresent = false
    let hasRetryableGameplayTurn = false
    const skippedCombatRouteReason = gameplayEnabledForLocation
      ? 'no_active_encounter_or_combat_trigger'
      : 'gameplay_disabled_for_location'

    if (gameplayEnabledForLocation && tick.gameplayRunId) {
      const continuation = await resolveGameplayRunContinuationContext({
        gameplayRepository: this.gameplayRepository,
        room,
      })
      activeEncounter = continuation.encounter
      activeEncounterId = activeEncounter?.id ?? null
      const shouldCheckRetryTurn = !activeEncounter || activeEncounter.status !== 'active'
      const retryTurn = shouldCheckRetryTurn
        ? await this.gameplayRepository.findTurnByTickId(tick.id)
        : null
      hasRetryableGameplayTurn = Boolean(retryTurn?.encounterId)

      if (!hasRetryableGameplayTurn) {
        const terminalRunStatus = activeEncounter ? terminalEncounterRunStatus(activeEncounter.status) : null
        if (activeEncounter && terminalRunStatus) {
          await this.markTerminalEncounterAftermath({
            room,
            encounter: activeEncounter,
            now,
            source: 'gameplay-run-preflight-terminal',
          })
          const skipReason = `encounter_${activeEncounter.status}`
          logLocationRoomRouteDecision({
            tickId: tick.id,
            roomId: room.id,
            locationId: room.locationId,
            turnIntent,
            triggerType: tick.triggerType,
            gameplayGateResult,
            activeEncounterId,
            combatTriggerId,
            sceneCheckRequestPresent: false,
            sceneCheckProposalPresent: false,
            sceneCheckProposalErrorPresent: false,
            selectedRoute: 'skip',
            skipReason,
            publicOutputOutcome: 'terminal_run_closed',
          })
          await this.repository.markTickSkipped(tick.id, skipReason)
          await this.repository.updateRoomAfterProcessedTick(room, {
            tickIntervalMinutes: elizaConfig.locationRooms.activeNarrativeTickIntervalMinutes,
            now,
          })
          return {
            tickId: tick.id,
            gameplayRunId: tick.gameplayRunId,
            status: 'skipped',
            selectedTokenId: null,
            reason: skipReason,
          }
        }

        if (!activeEncounter) {
          logLocationRoomRouteDecision({
            tickId: tick.id,
            roomId: room.id,
            locationId: room.locationId,
            turnIntent,
            triggerType: tick.triggerType,
            gameplayGateResult,
            activeEncounterId,
            combatTriggerId,
            sceneCheckRequestPresent: false,
            sceneCheckProposalPresent: false,
            sceneCheckProposalErrorPresent: false,
            selectedRoute: 'skip',
            skipReason: 'no_active_gameplay_encounter',
            publicOutputOutcome: 'terminal_run_closed',
          })
          await this.repository.markTickSkipped(tick.id, 'no_active_gameplay_encounter')
          await this.repository.updateRoomAfterProcessedTick(room, {
            tickIntervalMinutes: elizaConfig.locationRooms.activeNarrativeTickIntervalMinutes,
            now,
          })
          return {
            tickId: tick.id,
            gameplayRunId: tick.gameplayRunId,
            status: 'skipped',
            selectedTokenId: null,
            reason: 'no_active_gameplay_encounter',
          }
        }
      }
    }

    if (participants.length < MIN_ELIGIBLE_PARTICIPANTS && !hasRetryableGameplayTurn) {
      logLocationRoomRouteDecision({
        tickId: tick.id,
        roomId: room.id,
        locationId: room.locationId,
        turnIntent,
        triggerType: tick.triggerType,
        gameplayGateResult,
        activeEncounterId,
        combatTriggerId: null,
        sceneCheckRequestPresent: false,
        sceneCheckProposalPresent: false,
        selectedRoute: 'skip',
        skipReason: 'insufficient_participants',
        publicOutputOutcome: 'blocked_waiting_for_participants',
      })
      await this.repository.markTickSkipped(tick.id, 'Fewer than two eligible participants')
      await this.repository.updateRoomAfterProcessedTick(room, {
        tickIntervalMinutes: elizaConfig.locationRooms.tickIntervalMinutes,
        now,
      })
      return {
        tickId: tick.id,
        gameplayRunId: tick.gameplayRunId,
        status: 'skipped',
        selectedTokenId: null,
        reason: 'insufficient_participants',
      }
    }

    const recentMessages = await this.repository.listRecentPublicMessages(
      room.id,
      elizaConfig.locationRooms.transcriptWindow
    )

    if (gameplayEnabledForLocation) {
      if (!tick.gameplayRunId) {
        activeEncounter = await this.gameplayRepository.findActiveEncounterByRoomId(room.id)
        activeEncounterId = activeEncounter?.id ?? null
      }
      let encounterTrigger: LocationRoomGameplayEncounterTrigger | null = null
      if (turnIntent === 'combat' && tick.triggerType !== 'admin' && !tick.gameplayRunId) {
        throw new LocationRoomManualTickIntentForbiddenError()
      }
      const isAdminCombatIntent = turnIntent === 'combat' && tick.triggerType === 'admin'

      if (!activeEncounter) {
        if (isAdminCombatIntent) {
          encounterTrigger = await this.ensureAdminCombatTriggerForTick({ room, tick, now })
        } else if (turnIntent === 'auto' || turnIntent === 'story') {
          let narrativeState = await this.ensureNarrativeStateWithLocationCatalog(room)
          const routeSceneCheck = normalizeNarrativeSceneCheckMetadata(narrativeState.metadata)
          preRouteSceneCheckRequestPresent = Boolean(routeSceneCheck.request)
          preRouteSceneCheckProposalPresent = Boolean(routeSceneCheck.proposal)
          preRouteSceneCheckProposalErrorPresent = Boolean(routeSceneCheck.proposalError)
          if (turnIntent === 'auto') {
            narrativeState = await this.promoteCombatReadyNarrativeStateForAutoTick({
              room,
              tick,
              narrativeState,
              now,
            })
            encounterTrigger = await this.buildEncounterTriggerFromNarrativeState(room, narrativeState.metadata)
          }
        } else if (turnIntent === 'combat') {
          throw new LocationRoomManualTickIntentForbiddenError()
        }
      }
      combatTriggerId = encounterTrigger?.triggerId ?? null

      if (activeEncounter || encounterTrigger || hasRetryableGameplayTurn) {
        logLocationRoomRouteDecision({
          tickId: tick.id,
          roomId: room.id,
          locationId: room.locationId,
          turnIntent,
          triggerType: tick.triggerType,
          gameplayGateResult,
          activeEncounterId,
          combatTriggerId,
          sceneCheckRequestPresent: preRouteSceneCheckRequestPresent,
          sceneCheckProposalPresent: preRouteSceneCheckProposalPresent,
          sceneCheckProposalErrorPresent: preRouteSceneCheckProposalErrorPresent,
          selectedRoute: 'combat',
          routeSource: activeEncounter || hasRetryableGameplayTurn ? 'active_encounter' : 'combat_trigger',
          skipReason: null,
        })
        const runContext = await this.ensureGameplayRunForCombat({
          room,
          tick,
          source: activeEncounter || hasRetryableGameplayTurn ? 'active_encounter' : 'combat_trigger',
          ...(encounterTrigger ? { encounterTrigger } : {}),
        })
        context.effectiveGameplayRunId = runContext.run.id
        const combatTick = runContext.tick
        const gameplayResult = await this.gameplayCoordinator.processTurn({
          room,
          tick: combatTick,
          participants,
          recentMessages,
          now,
          gameplayRun: { id: runContext.run.id, targetCompletedTurns: runContext.run.targetCompletedTurns },
          ...(encounterTrigger ? { encounterTrigger } : {}),
        })

        if (gameplayResult.status === 'skipped') {
          await this.repository.markTickSkipped(tick.id, gameplayResult.reason)
          await this.repository.updateRoomAfterProcessedTick(room, {
            tickIntervalMinutes: elizaConfig.locationRooms.tickIntervalMinutes,
            now,
          })
          return {
            tickId: tick.id,
            gameplayRunId: runContext.run.id,
            status: 'skipped',
            selectedTokenId: null,
            reason: gameplayResult.reason,
          }
        }

        await this.repository.markTickCompleted(tick.id)
        await this.repository.updateRoomAfterProcessedTick(room, {
          tickIntervalMinutes: gameplayResult.encounterStatusAfter && gameplayResult.encounterStatusAfter !== 'active'
            ? elizaConfig.locationRooms.activeNarrativeTickIntervalMinutes
            : elizaConfig.locationRooms.tickIntervalMinutes,
          now,
        })

        return {
          tickId: tick.id,
          gameplayRunId: runContext.run.id,
          status: 'completed',
          selectedTokenId: gameplayResult.selectedTokenId,
          messageId: gameplayResult.messageId,
        }
      }

    }

    const narrativeEnabled = elizaConfig.locationRooms.narrative.enabled
    const shouldUseGameplaySpeechEligibility = Boolean(
      gameplayStateForNarrativeSpeech &&
      gameplayStateForNarrativeSpeech.status !== 'aftermath'
    )
    const narrativeParticipants = shouldUseGameplaySpeechEligibility && gameplayStateForNarrativeSpeech
      ? filterParticipantsAvailableForRoomSpeech(participants, gameplayStateForNarrativeSpeech)
      : participants
    if (narrativeParticipants.length < MIN_ELIGIBLE_PARTICIPANTS) {
      logLocationRoomRouteDecision({
        tickId: tick.id,
        roomId: room.id,
        locationId: room.locationId,
        turnIntent,
        triggerType: tick.triggerType,
        gameplayGateResult,
        activeEncounterId,
        combatTriggerId,
        sceneCheckRequestPresent: preRouteSceneCheckRequestPresent,
        sceneCheckProposalPresent: preRouteSceneCheckProposalPresent,
        sceneCheckProposalErrorPresent: preRouteSceneCheckProposalErrorPresent,
        selectedRoute: 'skip',
        skipReason: 'insufficient_living_gameplay_participants',
        combatRouteSkipReason: skippedCombatRouteReason,
        publicOutputOutcome: 'blocked_waiting_for_participants',
      })
      await this.repository.markTickSkipped(tick.id, 'insufficient_living_gameplay_participants')
      await this.repository.updateRoomAfterProcessedTick(room, {
        tickIntervalMinutes: elizaConfig.locationRooms.tickIntervalMinutes,
        now,
      })
      return {
        tickId: tick.id,
        status: 'skipped',
        selectedTokenId: null,
        reason: 'insufficient_living_gameplay_participants',
      }
    }
    const speaker = narrativeEnabled && tick.selectedTokenId != null
      ? narrativeParticipants.find((participant) => participant.tokenId === tick.selectedTokenId)
      : selectLocationRoomSpeaker(narrativeParticipants, recentMessages)

    if (!speaker) {
      throw new Error('Selected narrative speaker is no longer eligible for this location room')
    }

    if (tick.selectedTokenId !== speaker.tokenId) {
      await this.repository.markTickSelected(tick.id, speaker.tokenId)
    }

    let appendedMessageId: string | null = null

    try {
      if (narrativeEnabled) {
        const narrativeResult = await this.narrativeCoordinator.processTurn({
          room,
          tick,
          speaker,
          participants: narrativeParticipants,
          recentMessages,
        })
        if (!narrativeResult.messageId) {
          throw new Error('Narrative coordinator did not append a character message')
        }
        appendedMessageId = narrativeResult.messageId
        logLocationRoomRouteDecision({
          tickId: tick.id,
          roomId: room.id,
          locationId: room.locationId,
          turnIntent,
          triggerType: tick.triggerType,
          gameplayGateResult,
          activeEncounterId,
          combatTriggerId,
          sceneCheckRequestPresent: narrativeResult.sceneCheckDiagnostics?.requestPresent ?? preRouteSceneCheckRequestPresent,
          sceneCheckProposalPresent: narrativeResult.sceneCheckDiagnostics?.proposalPresent ?? preRouteSceneCheckProposalPresent,
          sceneCheckProposalErrorPresent: narrativeResult.sceneCheckDiagnostics?.proposalErrorPresent ?? preRouteSceneCheckProposalErrorPresent,
          selectedRoute: narrativeResult.sceneCheckId ? 'narrative_scene_check' : 'narrative',
          skipReason: null,
          combatRouteSkipReason: narrativeResult.sceneCheckId ? null : skippedCombatRouteReason,
          sceneCheckSkipReason: narrativeResult.sceneCheckDiagnostics?.selected === false
            ? narrativeResult.sceneCheckDiagnostics.skipReason ?? 'scene_check_skipped'
            : null,
        })
        await this.repository.markTickCompleted(tick.id)
        await this.repository.updateRoomAfterProcessedTick(room, {
          tickIntervalMinutes: elizaConfig.locationRooms.activeNarrativeTickIntervalMinutes,
          now,
        })

        return {
          tickId: tick.id,
          status: 'completed',
          selectedTokenId: speaker.tokenId,
          messageId: narrativeResult.messageId,
          ...(narrativeResult.messageIds ? { messageIds: narrativeResult.messageIds } : {}),
          ...(narrativeResult.sceneCheckId ? { sceneCheckId: narrativeResult.sceneCheckId } : {}),
          ...(narrativeResult.publicGameMasterBeatAppended ? { publicGameMasterBeatAppended: true } : {}),
        }
      }

      logLocationRoomRouteDecision({
        tickId: tick.id,
        roomId: room.id,
        locationId: room.locationId,
        turnIntent,
        triggerType: tick.triggerType,
        gameplayGateResult,
        activeEncounterId,
        combatTriggerId,
        sceneCheckRequestPresent: preRouteSceneCheckRequestPresent,
        sceneCheckProposalPresent: preRouteSceneCheckProposalPresent,
        sceneCheckProposalErrorPresent: preRouteSceneCheckProposalErrorPresent,
        selectedRoute: 'narrative',
        skipReason: null,
        combatRouteSkipReason: skippedCombatRouteReason,
      })

      const generated = await this.turnGenerator.generateTurn({
        room,
        speaker,
        participants: narrativeParticipants,
        recentMessages,
      })
      const content = normalizeLocationRoomGeneratedContent(generated.content)

      if (!content) {
        const error = 'Official ElizaOS generated an empty location-room turn'
        await this.repository.markTickDead(tick.id, error)
        await this.repository.recordRoomError(room.id, error)
        return {
          tickId: tick.id,
          status: 'dead',
          selectedTokenId: speaker.tokenId,
          reason: 'empty_generation',
        }
      }

      const message = await this.repository.appendMessage({
        roomId: room.id,
        locationId: room.locationId,
        tickId: tick.id,
        authorKind: 'agent',
        tokenId: speaker.tokenId,
        officialAgentId: generated.officialAgentId,
        authorName: speaker.name,
        content,
        visibility: 'public',
        metadata: {
          source: 'scheduled-location-room-tick',
          triggerType: tick.triggerType,
        },
      })
      appendedMessageId = message.id
      await this.repository.markTickCompleted(tick.id)
      await this.repository.updateRoomAfterProcessedTick(room, {
        tickIntervalMinutes: elizaConfig.locationRooms.tickIntervalMinutes,
        now,
      })

      return {
        tickId: tick.id,
        status: 'completed',
        selectedTokenId: speaker.tokenId,
        messageId: message.id,
      }
    } catch (error) {
      const storedError = routeSafeError(error)
      await this.repository.recordRoomError(room.id, storedError).catch(() => null)

      if (appendedMessageId) {
        await this.repository.markTickCompleted(tick.id).catch(() => null)
        await this.repository.updateRoomAfterProcessedTick(room, {
          tickIntervalMinutes: narrativeEnabled
            ? elizaConfig.locationRooms.activeNarrativeTickIntervalMinutes
            : elizaConfig.locationRooms.tickIntervalMinutes,
          now,
        }).catch(() => null)
        return {
          tickId: tick.id,
          status: 'completed',
          selectedTokenId: speaker.tokenId,
          messageId: appendedMessageId,
          reason: 'message_appended_before_completion_error',
        }
      }

      if (narrativeEnabled) {
        await this.narrativeCoordinator.markTickFailed(tick.id, error, {
          dead: tick.attempts >= MAX_TICK_ATTEMPTS,
        }).catch(() => null)
      }

      if (tick.attempts >= MAX_TICK_ATTEMPTS) {
        await this.repository.markTickDead(tick.id, storedError)
        return {
          tickId: tick.id,
          status: 'dead',
          selectedTokenId: speaker.tokenId,
          reason: 'attempts_exhausted',
        }
      }

      await this.repository.markTickFailed(tick.id, storedError, nextRetryAt(tick.attempts, now))
      return {
        tickId: tick.id,
        status: 'failed',
        selectedTokenId: speaker.tokenId,
        reason: 'retry_scheduled',
      }
    }
  }
}
