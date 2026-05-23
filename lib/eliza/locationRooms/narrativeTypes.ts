import type { LocationRoom, LocationRoomTick } from './types'

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

export type UpdateLocationRoomNarrativeStateInput = {
  stateSummary?: string
  currentObjective?: string | null
  openThreads?: string[]
  metadata?: Record<string, unknown>
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
