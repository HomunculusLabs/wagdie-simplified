import type {
  LocationRoom,
  LocationRoomCombatReadiness,
  LocationRoomEncounterSeed,
  LocationRoomRequestedGameplayAction,
  LocationRoomTick,
  LocationRoomTtrpgPhase,
} from './types'
import {
  LOCATION_ROOM_COMBAT_READINESS_VALUES,
  LOCATION_ROOM_TTRPG_PHASES,
} from './types'

export type LocationRoomNarrativeBeatStatus =
  | 'planned'
  | 'game_master_message_appended'
  | 'character_appended'
  | 'completed'
  | 'failed'
  | 'dead'

export type LocationRoomNarrativeState = {
  id: string
  roomId: string
  locationId: string
  stateSummary: string
  currentObjective: string | null
  openThreads: string[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type LocationRoomNarrativeStateSnapshot = {
  stateSummary: string
  currentObjective: string | null
  openThreads: string[]
}

export type LocationRoomNarrativeBeat = {
  id: string
  roomId: string
  locationId: string
  tickId: string
  status: LocationRoomNarrativeBeatStatus
  selectedTokenId: number | null
  gameMasterAgentId: string | null
  publicNarration: string | null
  speakerInstruction: string | null
  stateBefore: LocationRoomNarrativeStateSnapshot | Record<string, unknown>
  stateAfter: LocationRoomNarrativeStateSnapshot | Record<string, unknown>
  metadata: Record<string, unknown>
  lastError: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export type EnsureLocationRoomNarrativeStateInput = {
  room: LocationRoom
  initialStateSummary?: string
  initialCurrentObjective?: string | null
  initialOpenThreads?: string[]
  metadata?: Record<string, unknown>
}

export type CreateOrReuseLocationRoomNarrativeBeatInput = {
  room: LocationRoom
  tick: LocationRoomTick | { id: string }
  selectedTokenId?: number | null
  gameMasterAgentId?: string | null
  stateBefore?: LocationRoomNarrativeStateSnapshot | Record<string, unknown>
  metadata?: Record<string, unknown>
}

export type LocationRoomNarrativeBeatOutput = {
  gameMasterAgentId?: string | null
  publicNarration?: string | null
  speakerInstruction?: string | null
  stateAfter?: LocationRoomNarrativeStateSnapshot | Record<string, unknown>
  metadata?: Record<string, unknown>
}

export type MarkLocationRoomNarrativeBeatFailedOptions = {
  metadata?: Record<string, unknown>
}

export type UpdateLocationRoomNarrativeStateInput = {
  stateSummary?: string
  currentObjective?: string | null
  openThreads?: string[]
  metadata?: Record<string, unknown>
}

export type LocationRoomNarrativeTtrpgMetadata = {
  ttrpgPhase: LocationRoomTtrpgPhase
  combatReadiness: LocationRoomCombatReadiness
  threatLevel: number | null
  requestedGameplayAction: LocationRoomRequestedGameplayAction | null
  lastEncounterSeed: LocationRoomEncounterSeed | null
  lastCombatTriggerBeatId: string | null
  consumedCombatTriggerBeatId: string | null
}

export type LocationRoomNarrativeTtrpgMetadataPatch = Partial<LocationRoomNarrativeTtrpgMetadata>

function hasStringValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && values.includes(value as T[number])
}

function nullableTrimmedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength).trim() || null
}

function nullableId(value: unknown): string | null {
  return nullableTrimmedString(value, 120)
}

export function normalizeTtrpgPhase(
  value: unknown,
  fallback: LocationRoomTtrpgPhase = 'story'
): LocationRoomTtrpgPhase {
  return hasStringValue(LOCATION_ROOM_TTRPG_PHASES, value) ? value : fallback
}

export function normalizeCombatReadiness(
  value: unknown,
  fallback: LocationRoomCombatReadiness = 'none'
): LocationRoomCombatReadiness {
  return hasStringValue(LOCATION_ROOM_COMBAT_READINESS_VALUES, value) ? value : fallback
}

export function normalizeThreatLevel(value: unknown): number | null {
  if (value == null || value === '') return null
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.min(5, Math.round(parsed)))
}

export function normalizeRequestedGameplayAction(value: unknown): LocationRoomRequestedGameplayAction | null {
  return value === 'start_combat' ? 'start_combat' : null
}

export function normalizeEncounterSeed(value: unknown): LocationRoomEncounterSeed | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  const title = nullableTrimmedString(candidate.title ?? candidate.publicTitle, 80)
  const summary = nullableTrimmedString(candidate.summary ?? candidate.publicSummary, 500)
  const stakes = nullableTrimmedString(candidate.stakes, 240)

  if (!title && !summary && !stakes) return null

  return {
    ...(title ? { title } : {}),
    ...(summary ? { summary } : {}),
    ...(stakes ? { stakes } : {}),
  }
}

export function normalizeNarrativeTtrpgMetadata(
  metadata: Record<string, unknown> | null | undefined
): LocationRoomNarrativeTtrpgMetadata {
  const source = metadata ?? {}
  return {
    ttrpgPhase: normalizeTtrpgPhase(source.ttrpgPhase),
    combatReadiness: normalizeCombatReadiness(source.combatReadiness),
    threatLevel: normalizeThreatLevel(source.threatLevel),
    requestedGameplayAction: normalizeRequestedGameplayAction(source.requestedGameplayAction),
    lastEncounterSeed: normalizeEncounterSeed(source.lastEncounterSeed ?? source.encounterSeed),
    lastCombatTriggerBeatId: nullableId(source.lastCombatTriggerBeatId),
    consumedCombatTriggerBeatId: nullableId(source.consumedCombatTriggerBeatId),
  }
}

export function mergeNarrativeTtrpgMetadata(
  metadata: Record<string, unknown> | null | undefined,
  patch: LocationRoomNarrativeTtrpgMetadataPatch,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const current = normalizeNarrativeTtrpgMetadata(metadata)
  const next: LocationRoomNarrativeTtrpgMetadata = {
    ttrpgPhase: patch.ttrpgPhase ?? current.ttrpgPhase,
    combatReadiness: patch.combatReadiness ?? current.combatReadiness,
    threatLevel: patch.threatLevel === undefined ? current.threatLevel : patch.threatLevel,
    requestedGameplayAction: patch.requestedGameplayAction === undefined
      ? current.requestedGameplayAction
      : patch.requestedGameplayAction,
    lastEncounterSeed: patch.lastEncounterSeed === undefined ? current.lastEncounterSeed : patch.lastEncounterSeed,
    lastCombatTriggerBeatId: patch.lastCombatTriggerBeatId === undefined
      ? current.lastCombatTriggerBeatId
      : patch.lastCombatTriggerBeatId,
    consumedCombatTriggerBeatId: patch.consumedCombatTriggerBeatId === undefined
      ? current.consumedCombatTriggerBeatId
      : patch.consumedCombatTriggerBeatId,
  }

  return {
    ...(metadata ?? {}),
    ...extra,
    ttrpgPhase: next.ttrpgPhase,
    combatReadiness: next.combatReadiness,
    threatLevel: next.threatLevel,
    requestedGameplayAction: next.requestedGameplayAction,
    lastEncounterSeed: next.lastEncounterSeed,
    lastCombatTriggerBeatId: next.lastCombatTriggerBeatId,
    consumedCombatTriggerBeatId: next.consumedCombatTriggerBeatId,
  }
}

export function normalizeNarrativeOpenThreads(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((thread): thread is string => typeof thread === 'string')
    .map((thread) => thread.trim())
    .filter(Boolean)
}

export function toNarrativeStateSnapshot(
  state: Pick<LocationRoomNarrativeState, 'stateSummary' | 'currentObjective' | 'openThreads'>
): LocationRoomNarrativeStateSnapshot {
  return {
    stateSummary: state.stateSummary,
    currentObjective: state.currentObjective,
    openThreads: [...state.openThreads],
  }
}
