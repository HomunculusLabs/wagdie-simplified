import type { NormalizedLocationAdventureCatalog, LocationAdventureCatalogEntry } from '@/lib/domain/location/metadata-types'
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

export const ADVENTURE_MEMORY_LEDGER_LIMIT = 8
export const ADVENTURE_MEMORY_DISCOVERY_LIMIT = 10
export const ADVENTURE_MEMORY_CLOCK_LIMIT = 6
export const ADVENTURE_SPATIAL_LANDMARK_LIMIT = 6
export const ADVENTURE_SPATIAL_ROUTE_LIMIT = 6
export const ADVENTURE_SPATIAL_QUESTION_LIMIT = 4
export const ADVENTURE_DECISION_OPTION_LIMIT = 4
export const ADVENTURE_CATALOG_RETRIEVAL_LIMIT = 6

export type LocationRoomAdventureDecisionOption = {
  id: string
  label: string
  summary?: string | null
}

export type LocationRoomAdventureDecision = {
  id: string
  prompt: string
  options: LocationRoomAdventureDecisionOption[]
  selectedOptionId?: string | null
  selectedOptionLabel?: string | null
}

export type LocationRoomAdventureConsequenceStatus = 'open' | 'resolved' | 'advantage' | 'complication'
export type LocationRoomAdventureOutcomeTier =
  | 'critical_success'
  | 'success'
  | 'partial_success'
  | 'failure'
  | 'critical_failure'
  | 'unknown'

export type LocationRoomAdventureConsequence = {
  id: string
  source: string
  summary: string
  status: LocationRoomAdventureConsequenceStatus
  tier?: LocationRoomAdventureOutcomeTier | null
}

export type LocationRoomAdventureClock = {
  id: string
  label: string
  value: number
  max: number
  summary: string
}

export type LocationRoomDeclaredAction = {
  summary: string
  chosenOptionId?: string | null
  chosenOptionLabel?: string | null
  actionIntent?: string | null
}

export type LocationRoomAdventureDeclaredAction = LocationRoomDeclaredAction & {
  tokenId: number
  beatId: string
}

export type LocationRoomAdventureLastOutcome = {
  kind: 'beat' | 'scene_check'
  sourceId: string
  tier?: LocationRoomAdventureOutcomeTier | null
  summary: string
}

export type LocationRoomSpatialContext = {
  currentArea: string | null
  landmarks: string[]
  routes: string[]
  unresolvedSpatialQuestions: string[]
}

export type LocationRoomAdventureMemory = {
  arcSummary: string | null
  currentStakes: string | null
  activeDecision: LocationRoomAdventureDecision | null
  consequenceLedger: LocationRoomAdventureConsequence[]
  discoveries: string[]
  clocks: LocationRoomAdventureClock[]
  spatialContext: LocationRoomSpatialContext
  lastDeclaredAction: LocationRoomAdventureDeclaredAction | null
  lastOutcome: LocationRoomAdventureLastOutcome | null
}

export type LocationRoomAdventurePatch = {
  arcSummary?: string | null
  currentStakes?: string | null
  activeDecision?: LocationRoomAdventureDecision | null
  consequenceLedger?: LocationRoomAdventureConsequence[]
  discoveries?: string[]
  clocks?: LocationRoomAdventureClock[]
  spatialContext?: LocationRoomSpatialContext
  lastDeclaredAction?: LocationRoomAdventureDeclaredAction | null
  lastOutcome?: LocationRoomAdventureLastOutcome | null
}

export type MergeAdventureMetadataOptions = {
  sourceId?: string | null
}

export type NormalizeDeclaredActionOptions = {
  activeDecision?: LocationRoomAdventureDecision | null
}

export type RecordDeclaredActionOptions = {
  tokenId: number
  beatId: string
}

export type AdventureCatalogRetrievalContext = {
  currentObjective?: string | null
  activeDecision?: LocationRoomAdventureDecision | null
  openThreads?: string[] | null
  recentOutcomeSummary?: string | null
  selectedTokenId?: number | null
  tags?: string[] | null
  limit?: number
}

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

const ADVENTURE_ID_MAX_LENGTH = 80
const ADVENTURE_TEXT_BANNED_PATTERN = /\b(?:wallet|private\s*key|owner\s*address|staker\s*address|hit\s*points?|hp|xp|reward|loot\s*drop|death|dead|killed|fatal|finality|raw\s*model|system\s*prompt|mechanics?|mechanical\s*delta|adjudication|dc)\b|0x[a-f0-9]{20,}/i

function nullableAdventureText(value: unknown, maxLength: number): string | null {
  const text = nullableTrimmedString(value, maxLength)
  if (!text || ADVENTURE_TEXT_BANNED_PATTERN.test(text)) return null
  return text
}

function normalizeAdventureId(value: unknown, fallback: string | null = null): string | null {
  const text = nullableAdventureText(value, ADVENTURE_ID_MAX_LENGTH)
  if (!text) return fallback
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9:._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ADVENTURE_ID_MAX_LENGTH)
  return normalized || fallback
}

function normalizeAdventurePatchText(value: unknown, maxLength: number): string | null | undefined {
  if (value === null) return null
  return nullableAdventureText(value, maxLength) ?? undefined
}

function normalizeAdventureStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of value) {
    const text = nullableAdventureText(item, maxLength)
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(text)
    if (result.length >= maxItems) break
  }
  return result
}

function normalizeSpatialStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return []
  const byKey = new Map<string, string>()
  for (const item of value) {
    const text = nullableAdventureText(item, maxLength)
    if (!text) continue
    const key = text.toLowerCase()
    byKey.delete(key)
    byKey.set(key, text)
  }
  return Array.from(byKey.values()).slice(-maxItems)
}

function emptySpatialContext(): LocationRoomSpatialContext {
  return {
    currentArea: null,
    landmarks: [],
    routes: [],
    unresolvedSpatialQuestions: [],
  }
}

function normalizeSpatialContext(value: unknown): LocationRoomSpatialContext | null {
  if (!isRecord(value)) return null
  const currentArea = nullableAdventureText(value.currentArea ?? value.current_area, 120)
  return {
    currentArea,
    landmarks: normalizeSpatialStringArray(value.landmarks, ADVENTURE_SPATIAL_LANDMARK_LIMIT, 140),
    routes: normalizeSpatialStringArray(value.routes, ADVENTURE_SPATIAL_ROUTE_LIMIT, 160),
    unresolvedSpatialQuestions: normalizeSpatialStringArray(
      value.unresolvedSpatialQuestions ?? value.unresolved_spatial_questions,
      ADVENTURE_SPATIAL_QUESTION_LIMIT,
      180
    ),
  }
}

function hasSpatialContextSignal(context: LocationRoomSpatialContext): boolean {
  return Boolean(
    context.currentArea ||
    context.landmarks.length > 0 ||
    context.routes.length > 0 ||
    context.unresolvedSpatialQuestions.length > 0
  )
}

function mergeSpatialLists(current: string[], incoming: string[], maxItems: number): string[] {
  const byKey = new Map<string, string>()
  for (const item of current) byKey.set(item.toLowerCase(), item)
  for (const item of incoming) {
    const key = item.toLowerCase()
    byKey.delete(key)
    byKey.set(key, item)
  }
  return Array.from(byKey.values()).slice(-maxItems)
}

function mergeSpatialContext(
  current: LocationRoomSpatialContext,
  incoming: LocationRoomSpatialContext | undefined
): LocationRoomSpatialContext {
  if (!incoming) return current
  return {
    currentArea: incoming.currentArea ?? current.currentArea,
    landmarks: mergeSpatialLists(current.landmarks, incoming.landmarks, ADVENTURE_SPATIAL_LANDMARK_LIMIT),
    routes: mergeSpatialLists(current.routes, incoming.routes, ADVENTURE_SPATIAL_ROUTE_LIMIT),
    unresolvedSpatialQuestions: mergeSpatialLists(
      current.unresolvedSpatialQuestions,
      incoming.unresolvedSpatialQuestions,
      ADVENTURE_SPATIAL_QUESTION_LIMIT
    ),
  }
}

function normalizeAdventureOutcomeTier(value: unknown): LocationRoomAdventureOutcomeTier | null {
  return hasStringValue([
    'critical_success',
    'success',
    'partial_success',
    'failure',
    'critical_failure',
    'unknown',
  ] as const, value) ? value : null
}

function normalizeAdventureConsequenceStatus(value: unknown): LocationRoomAdventureConsequenceStatus {
  return hasStringValue(['open', 'resolved', 'advantage', 'complication'] as const, value)
    ? value
    : 'open'
}

function normalizeAdventureDecisionOption(value: unknown, index: number): LocationRoomAdventureDecisionOption | null {
  if (!isRecord(value)) return null
  const id = normalizeAdventureId(value.id, `option-${index + 1}`)
  const label = nullableAdventureText(value.label ?? value.title ?? value.summary, 80)
  if (!id || !label) return null
  const summary = nullableAdventureText(value.summary, 180)
  return {
    id,
    label,
    ...(summary && summary !== label ? { summary } : {}),
  }
}

function normalizeAdventureDecision(value: unknown): LocationRoomAdventureDecision | null {
  if (!isRecord(value)) return null
  const id = normalizeAdventureId(value.id, 'decision')
  const prompt = nullableAdventureText(value.prompt ?? value.summary, 280)
  const options = Array.isArray(value.options)
    ? value.options
      .map((option, index) => normalizeAdventureDecisionOption(option, index))
      .filter((option): option is LocationRoomAdventureDecisionOption => Boolean(option))
      .slice(0, ADVENTURE_DECISION_OPTION_LIMIT)
    : []
  if (!id || !prompt || options.length === 0) return null
  const selected = findAdventureDecisionOption({ id, prompt, options }, value.selectedOptionId)
  return {
    id,
    prompt,
    options,
    ...(selected ? { selectedOptionId: selected.id, selectedOptionLabel: selected.label } : {}),
  }
}

function normalizeAdventureConsequence(
  value: unknown,
  index: number,
  sourceId: string | null = null
): LocationRoomAdventureConsequence | null {
  if (!isRecord(value)) return null
  const source = normalizeAdventureId(value.source, sourceId ?? `patch:${index + 1}`)
  const id = normalizeAdventureId(value.id, source ? `${source}:consequence:${index + 1}` : `consequence:${index + 1}`)
  const summary = nullableAdventureText(value.summary ?? value.description, 320)
  if (!id || !source || !summary) return null
  const tier = normalizeAdventureOutcomeTier(value.tier)
  return {
    id,
    source,
    summary,
    status: normalizeAdventureConsequenceStatus(value.status),
    ...(tier ? { tier } : {}),
  }
}

function normalizeAdventureClock(
  value: unknown,
  index: number
): LocationRoomAdventureClock | null {
  if (!isRecord(value)) return null
  const id = normalizeAdventureId(value.id, `clock-${index + 1}`)
  const label = nullableAdventureText(value.label ?? value.title, 100)
  const summary = nullableAdventureText(value.summary ?? value.description ?? label, 240)
  const rawMax = typeof value.max === 'number' || typeof value.max === 'string' ? Number(value.max) : 6
  const max = Math.max(1, Math.min(12, Number.isFinite(rawMax) ? Math.round(rawMax) : 6))
  const rawValue = typeof value.value === 'number' || typeof value.value === 'string' ? Number(value.value) : 0
  const clockValue = Math.max(0, Math.min(max, Number.isFinite(rawValue) ? Math.round(rawValue) : 0))
  if (!id || !label || !summary) return null
  return { id, label, value: clockValue, max, summary }
}

function normalizeAdventureLastOutcome(value: unknown, sourceId: string | null = null): LocationRoomAdventureLastOutcome | null {
  if (!isRecord(value)) return null
  const kind = hasStringValue(['beat', 'scene_check'] as const, value.kind) ? value.kind : null
  const normalizedSourceId = normalizeAdventureId(value.sourceId, sourceId)
  const summary = nullableAdventureText(value.summary, 320)
  if (!kind || !normalizedSourceId || !summary) return null
  const tier = normalizeAdventureOutcomeTier(value.tier)
  return {
    kind,
    sourceId: normalizedSourceId,
    ...(tier ? { tier } : {}),
    summary,
  }
}

function normalizeAdventureDeclaredAction(
  value: unknown,
  activeDecision: LocationRoomAdventureDecision | null = null
): LocationRoomDeclaredAction | null {
  if (!isRecord(value)) return null
  const summary = nullableAdventureText(value.summary ?? value.action ?? value.publicSummary, 240)
  if (!summary) return null
  const actionIntent = nullableAdventureText(value.actionIntent ?? value.intent, 80)
  const selected = findAdventureDecisionOption(activeDecision, value.chosenOptionId)
  return {
    summary,
    ...(selected ? { chosenOptionId: selected.id, chosenOptionLabel: selected.label } : {}),
    ...(actionIntent ? { actionIntent } : {}),
  }
}

function normalizeAdventureMemoryDeclaredAction(value: unknown): LocationRoomAdventureDeclaredAction | null {
  if (!isRecord(value)) return null
  const summary = nullableAdventureText(value.summary, 240)
  const tokenId = typeof value.tokenId === 'number' && Number.isInteger(value.tokenId) ? value.tokenId : null
  const beatId = normalizeAdventureId(value.beatId)
  if (!summary || tokenId == null || !beatId) return null
  const chosenOptionId = normalizeAdventureId(value.chosenOptionId)
  const chosenOptionLabel = nullableAdventureText(value.chosenOptionLabel, 80)
  const actionIntent = nullableAdventureText(value.actionIntent, 80)
  return {
    tokenId,
    beatId,
    summary,
    ...(chosenOptionId ? { chosenOptionId } : {}),
    ...(chosenOptionLabel ? { chosenOptionLabel } : {}),
    ...(actionIntent ? { actionIntent } : {}),
  }
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

export function findAdventureDecisionOption(
  decision: LocationRoomAdventureDecision | null | undefined,
  optionId: unknown
): LocationRoomAdventureDecisionOption | null {
  const normalizedOptionId = normalizeAdventureId(optionId)
  if (!decision || !normalizedOptionId) return null
  return decision.options.find((option) => option.id === normalizedOptionId) ?? null
}

export function normalizeAdventureMemory(
  metadata: Record<string, unknown> | null | undefined
): LocationRoomAdventureMemory {
  const adventure = isRecord(metadata?.adventure) ? metadata.adventure : {}
  const activeDecision = normalizeAdventureDecision(adventure.activeDecision)
  const spatialContext = normalizeSpatialContext(adventure.spatialContext ?? adventure.spatial_context) ?? emptySpatialContext()
  const consequenceLedger = Array.isArray(adventure.consequenceLedger)
    ? adventure.consequenceLedger
      .map((entry, index) => normalizeAdventureConsequence(entry, index))
      .filter((entry): entry is LocationRoomAdventureConsequence => Boolean(entry))
      .slice(-ADVENTURE_MEMORY_LEDGER_LIMIT)
    : []
  const clocks = Array.isArray(adventure.clocks)
    ? adventure.clocks
      .map((clock, index) => normalizeAdventureClock(clock, index))
      .filter((clock): clock is LocationRoomAdventureClock => Boolean(clock))
      .slice(0, ADVENTURE_MEMORY_CLOCK_LIMIT)
    : []

  return {
    arcSummary: nullableAdventureText(adventure.arcSummary, 500),
    currentStakes: nullableAdventureText(adventure.currentStakes, 300),
    activeDecision,
    consequenceLedger,
    discoveries: normalizeAdventureStringArray(adventure.discoveries, ADVENTURE_MEMORY_DISCOVERY_LIMIT, 240),
    clocks,
    spatialContext,
    lastDeclaredAction: normalizeAdventureMemoryDeclaredAction(adventure.lastDeclaredAction),
    lastOutcome: normalizeAdventureLastOutcome(adventure.lastOutcome),
  }
}

export function normalizeDeclaredAction(
  value: unknown,
  options: NormalizeDeclaredActionOptions = {}
): LocationRoomDeclaredAction | null {
  return normalizeAdventureDeclaredAction(value, options.activeDecision ?? null)
}

function normalizeAdventureConsequencesFromPatch(source: Record<string, unknown>, sourceId: string | null): LocationRoomAdventureConsequence[] {
  const rawConsequences = Array.isArray(source.consequenceLedger)
    ? source.consequenceLedger
    : Array.isArray(source.consequences)
      ? source.consequences
      : source.consequence
        ? [source.consequence]
        : []

  return rawConsequences
    .map((entry, index) => normalizeAdventureConsequence(entry, index, sourceId))
    .filter((entry): entry is LocationRoomAdventureConsequence => Boolean(entry))
    .slice(0, ADVENTURE_MEMORY_LEDGER_LIMIT)
}

function normalizeAdventureClocksFromPatch(source: Record<string, unknown>): LocationRoomAdventureClock[] {
  const rawClocks = Array.isArray(source.clocks)
    ? source.clocks
    : Array.isArray(source.clockUpdates)
      ? source.clockUpdates
      : []

  return rawClocks
    .map((clock, index) => normalizeAdventureClock(clock, index))
    .filter((clock): clock is LocationRoomAdventureClock => Boolean(clock))
    .slice(0, ADVENTURE_MEMORY_CLOCK_LIMIT)
}

export function normalizeAdventurePatch(
  value: unknown,
  options: MergeAdventureMetadataOptions = {}
): LocationRoomAdventurePatch {
  if (!isRecord(value)) return {}
  const sourceId = normalizeAdventureId(options.sourceId)
  const activeDecision = value.activeDecision === null
    ? null
    : value.activeDecision === undefined
      ? undefined
      : normalizeAdventureDecision(value.activeDecision)
  const consequences = normalizeAdventureConsequencesFromPatch(value, sourceId)
  const discoveries = normalizeAdventureStringArray(value.discoveries, ADVENTURE_MEMORY_DISCOVERY_LIMIT, 240)
  const clocks = normalizeAdventureClocksFromPatch(value)
  const spatialContext = Object.prototype.hasOwnProperty.call(value, 'spatialContext') || Object.prototype.hasOwnProperty.call(value, 'spatial_context')
    ? normalizeSpatialContext(value.spatialContext ?? value.spatial_context)
    : undefined
  const lastOutcome = value.lastOutcome === null
    ? null
    : value.lastOutcome === undefined
      ? undefined
      : normalizeAdventureLastOutcome(value.lastOutcome, sourceId)

  const arcSummary = Object.prototype.hasOwnProperty.call(value, 'arcSummary')
    ? normalizeAdventurePatchText(value.arcSummary, 500)
    : undefined
  const currentStakes = Object.prototype.hasOwnProperty.call(value, 'currentStakes')
    ? normalizeAdventurePatchText(value.currentStakes, 300)
    : undefined

  return {
    ...(arcSummary !== undefined ? { arcSummary } : {}),
    ...(currentStakes !== undefined ? { currentStakes } : {}),
    ...(activeDecision !== undefined ? { activeDecision } : {}),
    ...(consequences.length > 0 ? { consequenceLedger: consequences } : {}),
    ...(discoveries.length > 0 ? { discoveries } : {}),
    ...(clocks.length > 0 ? { clocks } : {}),
    ...(spatialContext && hasSpatialContextSignal(spatialContext) ? { spatialContext } : {}),
    ...(Object.prototype.hasOwnProperty.call(value, 'lastDeclaredAction')
      ? { lastDeclaredAction: normalizeAdventureMemoryDeclaredAction(value.lastDeclaredAction) }
      : {}),
    ...(lastOutcome !== undefined ? { lastOutcome } : {}),
  }
}

function mergeByIdBounded<T extends { id: string }>(
  current: T[],
  incoming: T[],
  maxItems: number
): T[] {
  const byId = new Map<string, T>()
  for (const entry of current) byId.set(entry.id, entry)
  for (const entry of incoming) byId.set(entry.id, entry)
  return Array.from(byId.values()).slice(-maxItems)
}

function mergeDiscoveryLists(current: string[], incoming: string[]): string[] {
  const byKey = new Map<string, string>()
  for (const discovery of current) byKey.set(discovery.toLowerCase(), discovery)
  for (const discovery of incoming) byKey.set(discovery.toLowerCase(), discovery)
  return Array.from(byKey.values()).slice(-ADVENTURE_MEMORY_DISCOVERY_LIMIT)
}

export function mergeAdventureMetadata(
  metadata: Record<string, unknown> | null | undefined,
  patchValue: unknown,
  options: MergeAdventureMetadataOptions = {}
): Record<string, unknown> {
  const current = normalizeAdventureMemory(metadata)
  const patch = normalizeAdventurePatch(patchValue, options)
  const next: LocationRoomAdventureMemory = {
    ...current,
    ...(Object.prototype.hasOwnProperty.call(patch, 'arcSummary') ? { arcSummary: patch.arcSummary ?? null } : {}),
    ...(Object.prototype.hasOwnProperty.call(patch, 'currentStakes') ? { currentStakes: patch.currentStakes ?? null } : {}),
    ...(Object.prototype.hasOwnProperty.call(patch, 'activeDecision') ? { activeDecision: patch.activeDecision ?? null } : {}),
    consequenceLedger: patch.consequenceLedger
      ? mergeByIdBounded(current.consequenceLedger, patch.consequenceLedger, ADVENTURE_MEMORY_LEDGER_LIMIT)
      : current.consequenceLedger,
    discoveries: patch.discoveries
      ? mergeDiscoveryLists(current.discoveries, patch.discoveries)
      : current.discoveries,
    clocks: patch.clocks
      ? mergeByIdBounded(current.clocks, patch.clocks, ADVENTURE_MEMORY_CLOCK_LIMIT)
      : current.clocks,
    spatialContext: patch.spatialContext
      ? mergeSpatialContext(current.spatialContext, patch.spatialContext)
      : current.spatialContext,
    ...(Object.prototype.hasOwnProperty.call(patch, 'lastDeclaredAction') ? { lastDeclaredAction: patch.lastDeclaredAction ?? null } : {}),
    ...(Object.prototype.hasOwnProperty.call(patch, 'lastOutcome') ? { lastOutcome: patch.lastOutcome ?? null } : {}),
  }

  return {
    ...(metadata ?? {}),
    adventure: next,
  }
}

export function recordAdventureDeclaredAction(
  metadata: Record<string, unknown> | null | undefined,
  actionValue: unknown,
  options: RecordDeclaredActionOptions
): Record<string, unknown> {
  const memory = normalizeAdventureMemory(metadata)
  const action = normalizeDeclaredAction(actionValue, { activeDecision: memory.activeDecision })
  if (!action) return mergeAdventureMetadata(metadata, {})
  const lastDeclaredAction: LocationRoomAdventureDeclaredAction = {
    tokenId: options.tokenId,
    beatId: options.beatId,
    ...action,
  }
  const activeDecision = action.chosenOptionId && memory.activeDecision
    ? {
      ...memory.activeDecision,
      selectedOptionId: action.chosenOptionId,
      selectedOptionLabel: action.chosenOptionLabel ?? null,
    }
    : memory.activeDecision

  return mergeAdventureMetadata(metadata, {
    activeDecision,
    lastDeclaredAction,
  })
}

export function seedAdventureMetadataFromCatalog(
  metadata: Record<string, unknown> | null | undefined,
  catalog: NormalizedLocationAdventureCatalog | null | undefined,
  options: { reseed?: boolean } = {}
): Record<string, unknown> {
  if (!catalog) return mergeAdventureMetadata(metadata, {})
  const current = normalizeAdventureMemory(metadata)
  const hasLiveAdventure = Boolean(
    current.arcSummary ||
    current.currentStakes ||
    current.activeDecision ||
    current.consequenceLedger.length ||
    current.discoveries.length ||
    current.clocks.length ||
    hasSpatialContextSignal(current.spatialContext) ||
    current.lastDeclaredAction ||
    current.lastOutcome
  )
  if (hasLiveAdventure && !options.reseed) return { ...(metadata ?? {}), adventure: current }

  const baseMetadata = options.reseed ? { ...(metadata ?? {}), adventure: {} } : metadata
  return mergeAdventureMetadata(baseMetadata, {
    arcSummary: catalog.defaults.arcSummary,
    currentStakes: catalog.defaults.currentStakes,
    activeDecision: catalog.defaults.openingDecision,
    discoveries: catalog.defaults.discoveries,
    clocks: catalog.defaults.clocks,
  })
}

function catalogRetrievalText(context: AdventureCatalogRetrievalContext): string {
  return [
    context.currentObjective,
    context.activeDecision?.prompt,
    ...(context.activeDecision?.options.map((option) => `${option.label} ${option.summary ?? ''}`) ?? []),
    ...(context.openThreads ?? []),
    context.recentOutcomeSummary,
    ...(context.tags ?? []),
    context.selectedTokenId != null ? String(context.selectedTokenId) : null,
  ]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' ')
    .toLowerCase()
}

function catalogEntryScore(entry: LocationAdventureCatalogEntry, contextText: string, tagHints: Set<string>): number {
  let score = 0
  for (const tag of entry.tags) {
    if (tagHints.has(tag.toLowerCase())) score += 4
    if (contextText.includes(tag.toLowerCase())) score += 2
  }
  const haystack = `${entry.id} ${entry.title ?? ''} ${entry.summary}`.toLowerCase()
  for (const token of contextText.split(/\W+/).filter((token) => token.length >= 4)) {
    if (haystack.includes(token)) score += 1
  }
  return score
}

export function retrieveAdventureCatalogEntries(
  catalog: NormalizedLocationAdventureCatalog | null | undefined,
  context: AdventureCatalogRetrievalContext = {}
): LocationAdventureCatalogEntry[] {
  if (!catalog) return []
  const limit = Math.max(1, Math.min(ADVENTURE_CATALOG_RETRIEVAL_LIMIT, context.limit ?? ADVENTURE_CATALOG_RETRIEVAL_LIMIT))
  const entries = Object.values(catalog.sections).flat()
  const contextText = catalogRetrievalText(context)
  const tagHints = new Set((context.tags ?? []).map((tag) => tag.trim().toLowerCase()).filter(Boolean))

  return entries
    .map((entry, index) => ({ entry, index, score: catalogEntryScore(entry, contextText, tagHints) }))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .slice(0, limit)
    .map(({ entry }) => entry)
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
