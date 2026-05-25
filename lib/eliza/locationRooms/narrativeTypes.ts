import type { PublicLocationRoomGameplayRolls } from './types'
import type {
  NormalizedSceneCheckProposal,
  NormalizedSceneCheckRequest,
  SceneCheckAdjudication,
  SceneCheckResolution,
} from './sceneChecks/types'
import {
  normalizeSceneCheckProposal,
  normalizeSceneCheckRequest,
} from './sceneChecks/rules'
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

export type LocationRoomNarrativeSceneCheckMessageIds = {
  characterAction?: string | null
  rollCard?: string | null
  gmOutcome?: string | null
}

export type LocationRoomNarrativeSceneCheckCharacterAction = {
  content: string
  officialAgentId: string | null
  authorName: string | null
}

export type LocationRoomNarrativeSceneCheckOutcome = {
  publicNarration: string
  stateAfter: LocationRoomNarrativeStateSnapshot
  gameMasterAgentId: string | null
  metadata?: Record<string, unknown>
}

export type LocationRoomNarrativeSceneCheckMetadata = {
  id: string | null
  request: NormalizedSceneCheckRequest | null
  proposal: NormalizedSceneCheckProposal | null
  proposalError: string | null
  adjudication: SceneCheckAdjudication | null
  resolution: SceneCheckResolution | null
  publicRolls: PublicLocationRoomGameplayRolls | null
  messageIds: LocationRoomNarrativeSceneCheckMessageIds
  characterAction: LocationRoomNarrativeSceneCheckCharacterAction | null
  gmOutcome: LocationRoomNarrativeSceneCheckOutcome | null
}

export type LocationRoomNarrativeSceneCheckMetadataPatch = Partial<LocationRoomNarrativeSceneCheckMetadata>

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function nullableSceneCheckError(value: unknown): string | null {
  return nullableTrimmedString(value, 240)
}

function normalizeSceneCheckMessageIds(value: unknown): LocationRoomNarrativeSceneCheckMessageIds {
  if (!isRecord(value)) return {}
  return {
    characterAction: nullableId(value.characterAction),
    rollCard: nullableId(value.rollCard),
    gmOutcome: nullableId(value.gmOutcome),
  }
}

function normalizeSceneCheckCharacterAction(value: unknown): LocationRoomNarrativeSceneCheckCharacterAction | null {
  if (!isRecord(value)) return null
  const content = nullableTrimmedString(value.content, 4000)
  if (!content) return null
  return {
    content,
    officialAgentId: nullableId(value.officialAgentId),
    authorName: nullableTrimmedString(value.authorName, 120),
  }
}

function normalizeSceneCheckOutcome(value: unknown): LocationRoomNarrativeSceneCheckOutcome | null {
  if (!isRecord(value)) return null
  const publicNarration = nullableTrimmedString(value.publicNarration, 4000)
  const stateAfter = isRecord(value.stateAfter) ? value.stateAfter : null
  const stateSummary = nullableTrimmedString(stateAfter?.stateSummary, 1000)
  if (!publicNarration || !stateSummary) return null
  return {
    publicNarration,
    gameMasterAgentId: nullableId(value.gameMasterAgentId),
    stateAfter: {
      stateSummary,
      currentObjective: nullableTrimmedString(stateAfter?.currentObjective, 1000),
      openThreads: normalizeNarrativeOpenThreads(stateAfter?.openThreads),
    },
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
  }
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

export function normalizeNarrativeSceneCheckMetadata(
  metadata: Record<string, unknown> | null | undefined
): LocationRoomNarrativeSceneCheckMetadata {
  const source = metadata ?? {}
  const sceneCheck = isRecord(source.sceneCheck) ? source.sceneCheck : {}
  const rawRequest = sceneCheck.request ?? source.sceneCheckRequest
  const requestResult = rawRequest == null ? null : normalizeSceneCheckRequest(rawRequest)
  const request = requestResult?.ok ? requestResult.value : null
  const rawProposal = sceneCheck.proposal ?? source.sceneCheckProposal
  const proposalResult = rawProposal == null
    ? null
    : normalizeSceneCheckProposal(rawProposal, { contextualChecks: request?.contextualChecks ?? [] })
  const proposal = proposalResult?.ok ? proposalResult.value : null

  return {
    id: nullableId(sceneCheck.id ?? source.sceneCheckId),
    request,
    proposal,
    proposalError: nullableSceneCheckError(
      sceneCheck.proposalError ??
      sceneCheck.skippedProposalError ??
      source.sceneCheckProposalError ??
      (proposalResult && !proposalResult.ok ? proposalResult.error : null)
    ),
    adjudication: isRecord(sceneCheck.adjudication) ? sceneCheck.adjudication as unknown as SceneCheckAdjudication : null,
    resolution: isRecord(sceneCheck.resolution) ? sceneCheck.resolution as unknown as SceneCheckResolution : null,
    publicRolls: isRecord(sceneCheck.publicRolls) ? sceneCheck.publicRolls as unknown as PublicLocationRoomGameplayRolls : null,
    messageIds: normalizeSceneCheckMessageIds(sceneCheck.messageIds),
    characterAction: normalizeSceneCheckCharacterAction(sceneCheck.characterAction),
    gmOutcome: normalizeSceneCheckOutcome(sceneCheck.gmOutcome),
  }
}

export function mergeNarrativeSceneCheckMetadata(
  metadata: Record<string, unknown> | null | undefined,
  patch: LocationRoomNarrativeSceneCheckMetadataPatch
): Record<string, unknown> {
  const current = normalizeNarrativeSceneCheckMetadata(metadata)
  const next: LocationRoomNarrativeSceneCheckMetadata = {
    id: patch.id === undefined ? current.id : patch.id,
    request: patch.request === undefined ? current.request : patch.request,
    proposal: patch.proposal === undefined ? current.proposal : patch.proposal,
    proposalError: patch.proposalError === undefined ? current.proposalError : patch.proposalError,
    adjudication: patch.adjudication === undefined ? current.adjudication : patch.adjudication,
    resolution: patch.resolution === undefined ? current.resolution : patch.resolution,
    publicRolls: patch.publicRolls === undefined ? current.publicRolls : patch.publicRolls,
    messageIds: patch.messageIds === undefined ? current.messageIds : patch.messageIds,
    characterAction: patch.characterAction === undefined ? current.characterAction : patch.characterAction,
    gmOutcome: patch.gmOutcome === undefined ? current.gmOutcome : patch.gmOutcome,
  }

  const existingSceneCheck = isRecord(metadata?.sceneCheck) ? metadata.sceneCheck : {}

  return {
    ...(metadata ?? {}),
    sceneCheckId: next.id,
    sceneCheckRequest: next.request,
    sceneCheckProposal: next.proposal,
    sceneCheckProposalError: next.proposalError,
    sceneCheck: {
      ...existingSceneCheck,
      id: next.id,
      request: next.request,
      proposal: next.proposal,
      proposalError: next.proposalError,
      adjudication: next.adjudication,
      resolution: next.resolution,
      publicRolls: next.publicRolls,
      messageIds: next.messageIds,
      characterAction: next.characterAction,
      gmOutcome: next.gmOutcome,
    },
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
