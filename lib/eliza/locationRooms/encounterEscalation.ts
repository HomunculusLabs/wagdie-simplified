import { normalizeLocationAdventureCatalog } from '@/lib/domain/location/metadata'
import type {
  LocationAdventureCatalogEntry,
  NormalizedLocationAdventureCatalog,
} from '@/lib/domain/location/metadata-types'
import type { GameplaySuccessTier } from './gameplay/rules'
import {
  normalizeAdventureMemory,
  normalizeEncounterSeed,
  normalizeNarrativeSceneCheckEscalationMetadata,
  normalizeNarrativeTtrpgMetadata,
  normalizeThreatLevel,
} from './narrativeTypes'
import type {
  LocationRoomNarrativeState,
  LocationRoomNarrativeTtrpgMetadataPatch,
} from './narrativeTypes'
import type {
  LocationRoomEncounterSeed,
  LocationRoomSceneCheckDangerKind,
  LocationRoomSceneCheckEscalation,
  LocationRoomSceneCheckEscalationDecision,
} from './types'
import {
  LOCATION_ROOM_SCENE_CHECK_DANGER_KINDS,
  LOCATION_ROOM_SCENE_CHECK_ESCALATION_DECISIONS,
} from './types'

type EncounterEscalationNarrativeState = Pick<LocationRoomNarrativeState, 'currentObjective' | 'openThreads' | 'metadata'>

type SceneCheckEscalationFloor = {
  decision: LocationRoomSceneCheckEscalationDecision
  threatLevel: number | null
  reason: string | null
}

export type BuildCatalogPreferredEncounterSeedInput = {
  narrativeState?: EncounterEscalationNarrativeState | null
  rawEncounterSeed?: unknown
  catalogEntryIds?: unknown
  recentOutcomeSummary?: string | null
  selectedTokenId?: number | null
  fallbackSummary?: string | null
  rollTier?: GameplaySuccessTier | string | null
}

export type NormalizeSceneCheckEscalationInput = BuildCatalogPreferredEncounterSeedInput & {
  rawEscalation?: unknown
}

export type NormalizedSceneCheckEscalationResult = {
  escalation: LocationRoomSceneCheckEscalation
  ttrpgMetadataPatch: LocationRoomNarrativeTtrpgMetadataPatch
}

const ENCOUNTER_HINT_LIMIT = 3
const MONSTER_HINT_LIMIT = 3
const CATALOG_ID_LIMIT = 8
const SAFE_TEXT_BANNED_PATTERN = /\b(?:wallet|private\s*key|owner\s*address|staker\s*address|hit\s*points?|hp|xp|reward|loot\s*drop|death|dead|killed|fatal|finality|raw\s*model|system\s*prompt|mechanics?|mechanical\s*delta|adjudication|dc)\b|0x[a-f0-9]{20,}/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function nullableSafeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/\s+/g, ' ').trim().slice(0, maxLength).trim()
  if (!text || SAFE_TEXT_BANNED_PATTERN.test(text)) return null
  return text
}

function normalizeCatalogId(value: unknown): string | null {
  const text = nullableSafeText(value, 80)
  if (!text) return null
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9:._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return normalized || null
}

function normalizeCatalogIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of value) {
    const id = normalizeCatalogId(item)
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push(id)
    if (result.length >= CATALOG_ID_LIMIT) break
  }
  return result
}

function hasStringValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && values.includes(value as T[number])
}

function normalizeEscalationDecision(value: unknown): LocationRoomSceneCheckEscalationDecision | null {
  return hasStringValue(LOCATION_ROOM_SCENE_CHECK_ESCALATION_DECISIONS, value) ? value : null
}

function normalizeDangerKind(value: unknown): LocationRoomSceneCheckDangerKind {
  return hasStringValue(LOCATION_ROOM_SCENE_CHECK_DANGER_KINDS, value) ? value : 'unknown'
}

function uniqueBounded(values: Array<string | null | undefined>, limit: number): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
    if (result.length >= limit) break
  }
  return result
}

function extractRawCatalog(rawEscalation: unknown, inputCatalogEntryIds: unknown): string[] {
  const candidate = isRecord(rawEscalation) ? rawEscalation : {}
  return normalizeCatalogIdList(
    inputCatalogEntryIds ??
    candidate.catalogEntryIds ??
    candidate.catalog_entry_ids ??
    candidate.selectedCatalogEntryIds ??
    candidate.selected_catalog_entry_ids
  )
}

function catalogFromNarrativeState(
  narrativeState: EncounterEscalationNarrativeState | null | undefined
): NormalizedLocationAdventureCatalog | undefined {
  if (!narrativeState) return undefined
  const metadata = narrativeState.metadata ?? {}
  const locationMetadata = isRecord(metadata.locationMetadata) ? metadata.locationMetadata : null
  return normalizeLocationAdventureCatalog(metadata.adventureCatalog ?? locationMetadata?.adventureCatalog)
}

export function isVisibleSceneCheckEscalationCatalogEntry(entry: LocationAdventureCatalogEntry): boolean {
  if ((entry.revealConditions ?? []).length > 0) return false
  return Boolean(nullableSafeText(entry.title ? `${entry.title}: ${entry.summary}` : entry.summary, 240))
}

export function visibleSceneCheckEscalationCatalogEntries(entries: LocationAdventureCatalogEntry[]): LocationAdventureCatalogEntry[] {
  return entries.filter(isVisibleSceneCheckEscalationCatalogEntry)
}

function visibleEscalationCatalogEntries(catalog: NormalizedLocationAdventureCatalog): LocationAdventureCatalogEntry[] {
  return [
    ...visibleSceneCheckEscalationCatalogEntries(catalog.sections['80_encounters'] ?? []),
    ...visibleSceneCheckEscalationCatalogEntries(catalog.sections['30_monsters'] ?? []),
  ]
}

function visibleEscalationCatalogIdSet(catalog: NormalizedLocationAdventureCatalog): Set<string> {
  return new Set(visibleEscalationCatalogEntries(catalog).map((entry) => entry.id.toLowerCase()))
}

function filterVisibleEscalationCatalogIds(
  ids: string[],
  narrativeState: EncounterEscalationNarrativeState | null | undefined
): string[] {
  const catalog = catalogFromNarrativeState(narrativeState)
  if (!catalog) return ids
  const visibleIds = visibleEscalationCatalogIdSet(catalog)
  return ids.filter((id) => visibleIds.has(id.toLowerCase()))
}

function contextText(input: BuildCatalogPreferredEncounterSeedInput): string {
  const adventure = normalizeAdventureMemory(input.narrativeState?.metadata)
  return [
    input.narrativeState?.currentObjective,
    adventure.currentStakes,
    adventure.activeDecision?.prompt,
    ...(adventure.activeDecision?.options.map((option) => `${option.label} ${option.summary ?? ''}`) ?? []),
    ...(input.narrativeState?.openThreads ?? []),
    adventure.spatialContext.currentArea,
    ...adventure.spatialContext.landmarks,
    ...adventure.spatialContext.routes,
    ...adventure.spatialContext.unresolvedSpatialQuestions,
    ...adventure.consequenceLedger.slice(-3).map((entry) => `${entry.status} ${entry.summary}`),
    ...adventure.discoveries,
    adventure.lastDeclaredAction?.summary,
    adventure.lastOutcome?.summary,
    input.recentOutcomeSummary,
    input.fallbackSummary,
    input.selectedTokenId != null ? String(input.selectedTokenId) : null,
  ]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' ')
    .toLowerCase()
}

function scoreCatalogEntry(entry: LocationAdventureCatalogEntry, text: string, selectedIds: Set<string>): number {
  let score = selectedIds.has(entry.id) ? 100 : 0
  for (const tag of entry.tags) {
    if (text.includes(tag.toLowerCase())) score += 8
  }
  const haystack = `${entry.id} ${entry.title ?? ''} ${entry.summary} ${entry.tags.join(' ')}`.toLowerCase()
  for (const token of text.split(/\W+/).filter((candidate) => candidate.length >= 4)) {
    if (haystack.includes(token)) score += 1
  }
  return score
}

function rankEntries(entries: LocationAdventureCatalogEntry[], text: string, selectedIds: Set<string>): LocationAdventureCatalogEntry[] {
  return entries
    .map((entry, index) => ({ entry, index, score: scoreCatalogEntry(entry, text, selectedIds) }))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map(({ entry }) => entry)
}

function formatCatalogHint(entry: LocationAdventureCatalogEntry): string | null {
  return nullableSafeText(entry.title ? `${entry.title}: ${entry.summary}` : entry.summary, 240)
}

function formatAdventureAnchorStakes(input: BuildCatalogPreferredEncounterSeedInput, gmStakes: string | null | undefined): string | null {
  const adventure = normalizeAdventureMemory(input.narrativeState?.metadata)
  const spatialParts = [
    adventure.spatialContext.currentArea,
    ...adventure.spatialContext.landmarks.slice(0, 3),
    ...adventure.spatialContext.routes.slice(0, 2),
  ].filter((part): part is string => Boolean(part))
  const consequenceParts = adventure.consequenceLedger
    .slice(-2)
    .map((entry) => `${entry.status}: ${entry.summary}`)

  return nullableSafeText([
    gmStakes,
    adventure.currentStakes ? `Current stakes: ${adventure.currentStakes}` : null,
    spatialParts.length ? `Spatial anchors: ${spatialParts.join('; ')}` : null,
    consequenceParts.length ? `Recent consequences: ${consequenceParts.join('; ')}` : null,
    input.fallbackSummary ? `Recent outcome: ${input.fallbackSummary}` : null,
  ].filter(Boolean).join(' '), 240)
}

function fallbackSeed(input: BuildCatalogPreferredEncounterSeedInput): LocationRoomEncounterSeed | null {
  const summary = nullableSafeText(input.fallbackSummary, 500) ??
    (input.rollTier === 'critical_failure'
      ? 'A severe failed scene check creates immediate danger.'
      : input.rollTier === 'failure'
        ? 'A failed scene check creates structured danger.'
        : null)
  const stakes = input.rollTier === 'critical_failure'
    ? 'Contain the immediate fallout before it overwhelms the scene.'
    : input.rollTier === 'failure'
      ? 'Answer the new danger before it worsens.'
      : null

  return normalizeEncounterSeed({
    title: 'Escalating danger',
    summary,
    stakes,
    source: 'fallback',
  })
}

function hasPriorUnresolvedDanger(
  narrativeState: EncounterEscalationNarrativeState | null | undefined
): boolean {
  const metadata = narrativeState?.metadata
  if (!metadata) return false

  const ttrpg = normalizeNarrativeTtrpgMetadata(metadata)
  if (ttrpg.combatReadiness === 'foreshadow' && (ttrpg.threatLevel ?? 0) >= 2) return true
  if (ttrpg.combatReadiness === 'ready' && (ttrpg.threatLevel ?? 0) >= 3) return true

  const sceneCheckEscalation = normalizeNarrativeSceneCheckEscalationMetadata(metadata)
  return Object.values(sceneCheckEscalation.sceneCheckEscalations).some((escalation) =>
    (escalation.decision === 'danger' && (escalation.threatLevel ?? 0) >= 2) ||
    escalation.decision === 'combat_ready'
  )
}

export function deriveSceneCheckEscalationFloor(
  rollTier: GameplaySuccessTier | string | null | undefined
): SceneCheckEscalationFloor {
  if (rollTier === 'critical_failure') {
    return {
      decision: 'danger',
      threatLevel: 3,
      reason: 'critical_failure_floor',
    }
  }
  if (rollTier === 'failure') {
    return {
      decision: 'danger',
      threatLevel: 2,
      reason: 'failure_floor',
    }
  }
  return {
    decision: 'none',
    threatLevel: null,
    reason: null,
  }
}

export function buildCatalogPreferredEncounterSeed(
  input: BuildCatalogPreferredEncounterSeedInput
): LocationRoomEncounterSeed | null {
  const gmSeed = normalizeEncounterSeed(input.rawEncounterSeed)
  const catalog = catalogFromNarrativeState(input.narrativeState)
  const selectedIds = new Set(filterVisibleEscalationCatalogIds(normalizeCatalogIdList(input.catalogEntryIds), input.narrativeState))

  if (catalog) {
    const text = contextText(input)
    const visibleIds = visibleEscalationCatalogIdSet(catalog)
    const encounterEntries = rankEntries(
      visibleSceneCheckEscalationCatalogEntries(catalog.sections['80_encounters'] ?? []),
      text,
      selectedIds
    ).slice(0, ENCOUNTER_HINT_LIMIT)
    const monsterEntries = rankEntries(
      visibleSceneCheckEscalationCatalogEntries(catalog.sections['30_monsters'] ?? []),
      text,
      selectedIds
    ).slice(0, MONSTER_HINT_LIMIT)
    const primary = encounterEntries[0] ?? monsterEntries[0]

    if (primary) {
      const encounterHints = encounterEntries
        .map(formatCatalogHint)
        .filter((hint): hint is string => Boolean(hint))
      const monsterHints = monsterEntries
        .map(formatCatalogHint)
        .filter((hint): hint is string => Boolean(hint))
      const catalogEntryIds = uniqueBounded([
        primary.id,
        ...encounterEntries.map((entry) => entry.id),
        ...monsterEntries.map((entry) => entry.id),
        ...(gmSeed?.catalogEntryIds ?? []).filter((id) => visibleIds.has(id.toLowerCase())),
      ], CATALOG_ID_LIMIT)

      return normalizeEncounterSeed({
        title: primary.title ?? gmSeed?.title,
        summary: primary.summary ?? gmSeed?.summary,
        stakes: formatAdventureAnchorStakes(input, gmSeed?.stakes ?? null),
        source: 'location_catalog',
        catalogEntryIds,
        encounterHints,
        monsterHints,
      })
    }
  }

  if (gmSeed) {
    return normalizeEncounterSeed({
      ...gmSeed,
      source: gmSeed.source ?? 'gm',
    })
  }

  return fallbackSeed(input)
}

export function ttrpgPatchForSceneCheckEscalation(
  escalation: LocationRoomSceneCheckEscalation | null
): LocationRoomNarrativeTtrpgMetadataPatch {
  if (!escalation || escalation.decision === 'none') return {}
  if (escalation.decision === 'combat_ready') {
    return {
      ttrpgPhase: 'threat',
      combatReadiness: 'ready',
      threatLevel: Math.max(escalation.threatLevel ?? 0, 3),
      requestedGameplayAction: null,
      lastEncounterSeed: escalation.encounterSeed ?? null,
    }
  }
  return {
    ttrpgPhase: 'threat',
    combatReadiness: 'foreshadow',
    threatLevel: Math.max(escalation.threatLevel ?? 0, 1),
    requestedGameplayAction: null,
    ...(escalation.encounterSeed ? { lastEncounterSeed: escalation.encounterSeed } : {}),
  }
}

export function normalizeSceneCheckEscalation(
  input: NormalizeSceneCheckEscalationInput
): NormalizedSceneCheckEscalationResult {
  const raw = isRecord(input.rawEscalation) ? input.rawEscalation : {}
  const rawDecision = normalizeEscalationDecision(
    raw.decision ?? raw.escalationDecision ?? raw.escalation_decision ?? raw.escalation
  ) ?? 'none'
  const floor = deriveSceneCheckEscalationFloor(input.rollTier)
  const rawThreatLevel = normalizeThreatLevel(raw.threatLevel ?? raw.threat_level)
  const dangerKind = normalizeDangerKind(raw.dangerKind ?? raw.danger_kind)
  const rawReason = nullableSafeText(raw.reason, 240)
  const catalogEntryIds = filterVisibleEscalationCatalogIds(
    extractRawCatalog(input.rawEscalation, input.catalogEntryIds),
    input.narrativeState
  )
  const seed = buildCatalogPreferredEncounterSeed({
    ...input,
    rawEncounterSeed: raw.encounterSeed ?? raw.encounter_seed ?? input.rawEncounterSeed,
    catalogEntryIds,
  })

  let decision: LocationRoomSceneCheckEscalationDecision = rawDecision
  let reason = rawReason
  let threatLevel = rawThreatLevel

  if (decision === 'none' && floor.decision === 'danger') {
    decision = 'danger'
    reason = reason ?? floor.reason
  }

  if (decision === 'danger' && seed && hasPriorUnresolvedDanger(input.narrativeState)) {
    decision = 'combat_ready'
    reason = reason ?? 'repeated_unresolved_danger'
  }

  if (decision === 'combat_ready' && !seed) {
    decision = floor.decision === 'danger' ? 'danger' : 'none'
    reason = reason ?? 'combat_ready_requires_encounter_seed'
  }

  if (decision === 'danger') {
    threatLevel = Math.max(threatLevel ?? 0, floor.threatLevel ?? 0, 1)
  } else if (decision === 'combat_ready') {
    threatLevel = Math.max(threatLevel ?? 0, floor.threatLevel ?? 0, 3)
  } else {
    threatLevel = threatLevel ?? null
  }

  const escalation: LocationRoomSceneCheckEscalation = {
    decision,
    dangerKind,
    reason,
    ...(threatLevel != null ? { threatLevel } : {}),
    ...(decision !== 'none' && seed ? { encounterSeed: seed } : {}),
    ...(catalogEntryIds.length || seed?.catalogEntryIds?.length
      ? { catalogEntryIds: uniqueBounded([...catalogEntryIds, ...(seed?.catalogEntryIds ?? [])], CATALOG_ID_LIMIT) }
      : {}),
  }

  const ttrpgMetadataPatch = ttrpgPatchForSceneCheckEscalation(escalation)

  return {
    escalation,
    ttrpgMetadataPatch,
  }
}
