import { elizaConfig } from '@/lib/eliza/config'
import type { LocationRoom, LocationRoomParticipant, LocationRoomTick, LocationRoomGameplayRunSummary } from '../types'
import type { LocationRoomNarrativeBeat } from '../narrativeTypes'
import { mergeNarrativeTtrpgMetadata, normalizeNarrativeTtrpgMetadata } from '../narrativeTypes'
import type { LocationRoomNarrativeRepository } from '../narrativeRepository'
import type { LocationRoomGameplayRepository } from '../gameplay/repository'
import type { LocationRoomGameplayEncounterTrigger } from '../gameplay/coordinator'
import type { GameplayCharacterState, GameplayEncounter, GameplayRoomState, GameplayRun } from '../gameplay/types'
import { MIN_ELIGIBLE_PARTICIPANTS } from './support'

export function toGameplayRunSummary(run: GameplayRun, reused?: boolean): LocationRoomGameplayRunSummary {
  return {
    id: run.id,
    status: run.status,
    targetCompletedTurns: run.targetCompletedTurns,
    completedTurns: run.completedTurns,
    remainingTurns: Math.max(0, run.targetCompletedTurns - run.completedTurns),
    ...(reused !== undefined ? { reused } : {}),
    ...(run.stopReason !== null ? { stopReason: run.stopReason } : {}),
  }
}

export function isPlayableGameplayCharacter(character: GameplayCharacterState | undefined): boolean {
  return Boolean(character && character.status !== 'dead' && character.status !== 'fled' && character.hp > 0)
}

export function hasMinimumPlayableGameplayParticipants(
  participants: LocationRoomParticipant[],
  state: GameplayRoomState | null
): boolean {
  if (!state) return true
  return participants.filter((participant) => isPlayableGameplayCharacter(state.characters[String(participant.tokenId)])).length >= MIN_ELIGIBLE_PARTICIPANTS
}

export function terminalEncounterRunStatus(status: string): 'completed' | 'stopped' | null {
  if (status === 'victory' || status === 'defeat' || status === 'fled') return 'completed'
  if (status === 'abandoned') return 'stopped'
  return null
}

export async function resolveGameplayRunContinuationContext(params: {
  gameplayRepository: LocationRoomGameplayRepository
  room: LocationRoom
}): Promise<{ state: GameplayRoomState | null; encounter: GameplayEncounter | null }> {
  const state = await params.gameplayRepository.findStateByRoomId(params.room.id)
  if (state?.activeEncounterId) {
    const stateEncounter = await params.gameplayRepository.findEncounterById(state.activeEncounterId)
    if (stateEncounter) return { state, encounter: stateEncounter }
  }

  const activeEncounter = await params.gameplayRepository.findActiveEncounterByRoomId(params.room.id)
  return { state, encounter: activeEncounter }
}

export function gameplayRunStartedByActor(triggerType: LocationRoomTick['triggerType']): GameplayRun['startedByActor'] {
  if (triggerType === 'scheduled') return 'scheduler'
  return triggerType
}

export function manualCombatTriggerId(tickId: string): string {
  return `manual:${tickId}`
}

export function isUnconsumedCombatTrigger(metadata: ReturnType<typeof normalizeNarrativeTtrpgMetadata>): boolean {
  return metadata.requestedGameplayAction === 'start_combat' &&
    Boolean(metadata.lastCombatTriggerBeatId) &&
    metadata.consumedCombatTriggerBeatId !== metadata.lastCombatTriggerBeatId
}

export function nullableMetadataId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function isCombatReadySourceBeat(beat: LocationRoomNarrativeBeat): boolean {
  if (beat.status !== 'completed') return false
  const metadata = beat.metadata ?? {}
  const sceneCheckEscalation = metadata.sceneCheckEscalation && typeof metadata.sceneCheckEscalation === 'object' && !Array.isArray(metadata.sceneCheckEscalation)
    ? metadata.sceneCheckEscalation as Record<string, unknown>
    : null
  const lastSceneCheckEscalation = metadata.lastSceneCheckEscalation && typeof metadata.lastSceneCheckEscalation === 'object' && !Array.isArray(metadata.lastSceneCheckEscalation)
    ? metadata.lastSceneCheckEscalation as Record<string, unknown>
    : null
  return metadata.combatReadiness === 'ready' ||
    sceneCheckEscalation?.decision === 'combat_ready' ||
    lastSceneCheckEscalation?.decision === 'combat_ready'
}

export async function ensureAdminCombatTriggerForTick(params: {
  narrativeRepository: LocationRoomNarrativeRepository
  room: LocationRoom
  tick: LocationRoomTick
  now: Date
}): Promise<LocationRoomGameplayEncounterTrigger> {
  const triggerId = manualCombatTriggerId(params.tick.id)
  const narrativeState = await params.narrativeRepository.ensureStateForRoom({ room: params.room })
  const ttrpg = normalizeNarrativeTtrpgMetadata(narrativeState.metadata)

  if (!isUnconsumedCombatTrigger(ttrpg) || ttrpg.lastCombatTriggerBeatId !== triggerId) {
    await params.narrativeRepository.updateState(params.room, {
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

export async function markTerminalEncounterAftermath(params: {
  gameplayRepository: LocationRoomGameplayRepository
  narrativeRepository: LocationRoomNarrativeRepository
  room: LocationRoom
  encounter: GameplayEncounter
  now: Date
  source: string
}): Promise<void> {
  const state = await params.gameplayRepository.findStateByRoomId(params.room.id).catch(() => null)
  if (state && state.activeEncounterId === params.encounter.id) {
    await params.gameplayRepository.updateState(params.room, {
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

  const narrativeState = await params.narrativeRepository.ensureStateForRoom({ room: params.room }).catch(() => null)
  if (narrativeState) {
    await params.narrativeRepository.updateState(params.room, {
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

export function gameplayAutomationTargetCompletedTurns(): number {
  return elizaConfig.locationRooms.gameplay.automation.targetCompletedTurns
}
