import type { NormalizedLocationAdventureCatalog, LocationAdventureCatalogEntry } from '@/lib/domain/location/metadata-types'
import type { GameplayEncounter, GameplayEncounterStatus } from './gameplay/types'
import {
  normalizeAdventureMemory,
  type LocationRoomAftermathTemplateCard,
  type LocationRoomCharacterPhraseActionMemory,
  type LocationRoomCombatTerminalStatus,
  type LocationRoomCombatTerminalSummary,
  type LocationRoomContentCardSource,
  type LocationRoomForbiddenLabelCard,
  type LocationRoomGmContentBook,
  type LocationRoomGmPlanningPressure,
  type LocationRoomGmPlanningState,
  type LocationRoomLocationAffordanceCard,
  type LocationRoomMonsterPublicIdentityCard,
  type LocationRoomPublicContinuityBeat,
  type LocationRoomPublicContinuityMemory,
  type LocationRoomSpatialContext,
  type LocationRoomStructuredNarrativeMemory,
  type LocationRoomStructuredNarrativeMemoryPatch,
  type LocationRoomTierPayoffExampleCard,
} from './narrativeTypes'
import type { LocationRoomMessage } from './types'

export const PUBLIC_CONTINUITY_BEAT_LIMIT = 6
export const PUBLIC_CONTINUITY_THREAD_LIMIT = 6
export const PUBLIC_CONTINUITY_CONSEQUENCE_LIMIT = 6
export const CHARACTER_MEMORY_LIMIT = 12
export const CHARACTER_MEMORY_PHRASE_LIMIT = 5
export const CHARACTER_MEMORY_ACTION_LIMIT = 5
export const COMBAT_TERMINAL_SUMMARY_LIMIT = 4
export const GM_CONTENT_CARD_LIMIT = 12
export const GM_CONTENT_CARD_LIST_LIMIT = 6

const PUBLIC_SAFE_BANNED_PATTERN = /\b(?:wallet|private\s*key|owner\s*address|staker\s*address|hit\s*points?|hp|xp|damage|reward|loot\s*drop|raw\s*model|system\s*prompt|backend|mechanics?|mechanical\s*delta|adjudication|dc|checks?|bell\s*bait|encounter\s*site)\b|0x[a-f0-9]{20,}/i
const PRIVATE_LABEL_BANNED_PATTERN = /\b(?:wallet|private\s*key|owner\s*address|staker\s*address|raw\s*model|system\s*prompt)\b|0x[a-f0-9]{20,}/i
const CONTENT_CARD_SOURCES = ['location_catalog', 'gm_book', 'monster_identity', 'system_default'] as const
const GM_PLANNING_PRESSURES = ['low', 'medium', 'high', 'terminal'] as const
const COMBAT_TERMINAL_STATUSES = ['victory', 'defeat', 'fled', 'abandoned', 'unknown'] as const
const PAYOFF_TIERS = ['critical_success', 'success', 'partial_success', 'failure', 'critical_failure', 'unknown'] as const

export type ProjectPublicContinuityMemoryInput = {
  narrativeState?: {
    stateSummary?: string | null
    currentObjective?: string | null
    openThreads?: string[] | null
    metadata?: Record<string, unknown> | null
  } | null
  recentMessages?: Array<Pick<LocationRoomMessage, 'id' | 'sequence' | 'visibility' | 'authorName' | 'tokenId' | 'content' | 'createdAt'>>
  limit?: number
}

export type RecordCharacterPhraseActionMemoryInput = {
  tokenId: number
  publicName?: string | null
  phrase?: string | null
  actionSummary?: string | null
  actionIntent?: string | null
  sourceId?: string | null
  observedAt?: string | null
}

type LooseCardSource = LocationRoomContentCardSource | string | null | undefined

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function hasStringValue<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && values.includes(value as T[number])
}

function compactText(value: unknown, maxLength: number, options: { allowPrivateLabel?: boolean } = {}): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/\s+/g, ' ').trim().slice(0, maxLength).trim()
  if (!text) return null
  const bannedPattern = options.allowPrivateLabel ? PRIVATE_LABEL_BANNED_PATTERN : PUBLIC_SAFE_BANNED_PATTERN
  if (bannedPattern.test(text)) return null
  return text
}

function compactId(value: unknown, fallback: string | null = null): string | null {
  const text = compactText(value, 100, { allowPrivateLabel: true })
  if (!text) return fallback
  const id = text
    .toLowerCase()
    .replace(/[^a-z0-9:._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
  return id || fallback
}

function compactList(value: unknown, limit: number, maxLength: number, options: { allowPrivateLabel?: boolean } = {}): string[] {
  if (!Array.isArray(value)) return []
  const byKey = new Map<string, string>()
  for (const item of value) {
    const text = compactText(item, maxLength, options)
    if (!text) continue
    const key = text.toLowerCase()
    byKey.delete(key)
    byKey.set(key, text)
  }
  return Array.from(byKey.values()).slice(-limit)
}

function normalizeDateText(value: unknown): string | null {
  return compactText(value, 80, { allowPrivateLabel: true })
}

function normalizeCardSource(value: LooseCardSource, fallback: LocationRoomContentCardSource): LocationRoomContentCardSource {
  return hasStringValue(CONTENT_CARD_SOURCES, value) ? value : fallback
}

function normalizePlanningPressure(value: unknown): LocationRoomGmPlanningPressure {
  return hasStringValue(GM_PLANNING_PRESSURES, value) ? value : 'medium'
}

function normalizeCombatTerminalStatus(value: unknown): LocationRoomCombatTerminalStatus {
  if (hasStringValue(COMBAT_TERMINAL_STATUSES, value)) return value
  return 'unknown'
}

function emptySpatialState(): LocationRoomSpatialContext {
  return {
    currentArea: null,
    landmarks: [],
    routes: [],
    unresolvedSpatialQuestions: [],
  }
}

function normalizeSpatialState(value: unknown, fallback: LocationRoomSpatialContext = emptySpatialState()): LocationRoomSpatialContext {
  if (!isRecord(value)) return fallback
  return {
    currentArea: compactText(value.currentArea ?? value.current_area, 120) ?? fallback.currentArea,
    landmarks: compactList(value.landmarks, 6, 140),
    routes: compactList(value.routes, 6, 160),
    unresolvedSpatialQuestions: compactList(value.unresolvedSpatialQuestions ?? value.unresolved_spatial_questions, 4, 180),
  }
}

function normalizePublicContinuityBeat(value: unknown, index: number): LocationRoomPublicContinuityBeat | null {
  if (!isRecord(value)) return null
  const summary = compactText(value.summary ?? value.content, 320)
  if (!summary) return null
  const id = compactId(value.id, `beat-${index + 1}`)
  if (!id) return null
  const sequence = typeof value.sequence === 'number' && Number.isFinite(value.sequence) ? value.sequence : null
  const tokenId = typeof value.tokenId === 'number' && Number.isInteger(value.tokenId) ? value.tokenId : null
  return {
    id,
    ...(sequence != null ? { sequence } : {}),
    authorName: compactText(value.authorName, 80),
    ...(tokenId != null ? { tokenId } : {}),
    summary,
    createdAt: normalizeDateText(value.createdAt),
  }
}

function normalizePublicContinuityMemory(value: unknown): LocationRoomPublicContinuityMemory {
  const source = isRecord(value) ? value : {}
  const recentPublicBeats = Array.isArray(source.recentPublicBeats)
    ? source.recentPublicBeats
      .map((beat, index) => normalizePublicContinuityBeat(beat, index))
      .filter((beat): beat is LocationRoomPublicContinuityBeat => Boolean(beat))
      .slice(-PUBLIC_CONTINUITY_BEAT_LIMIT)
    : []

  return {
    roomSummary: compactText(source.roomSummary, 600),
    currentObjective: compactText(source.currentObjective, 300),
    openThreads: compactList(source.openThreads, PUBLIC_CONTINUITY_THREAD_LIMIT, 180),
    recentPublicBeats,
    unresolvedConsequences: compactList(source.unresolvedConsequences, PUBLIC_CONTINUITY_CONSEQUENCE_LIMIT, 220),
  }
}

function normalizeGmPlanningState(value: unknown): LocationRoomGmPlanningState {
  const source = isRecord(value) ? value : {}
  return {
    nextBeatIntent: compactText(source.nextBeatIntent, 240),
    pressure: normalizePlanningPressure(source.pressure),
    reservedReveals: compactList(source.reservedReveals, 6, 160),
    doNotRepeat: compactList(source.doNotRepeat, 8, 140),
    pacingNotes: compactList(source.pacingNotes, 6, 180),
  }
}

function normalizeCharacterPhraseActionMemory(value: unknown): LocationRoomCharacterPhraseActionMemory | null {
  if (!isRecord(value)) return null
  const tokenId = typeof value.tokenId === 'number' && Number.isInteger(value.tokenId) ? value.tokenId : null
  if (tokenId == null) return null
  return {
    tokenId,
    publicName: compactText(value.publicName ?? value.name, 80),
    recentPhrases: compactList(value.recentPhrases, CHARACTER_MEMORY_PHRASE_LIMIT, 180),
    recentActions: compactList(value.recentActions, CHARACTER_MEMORY_ACTION_LIMIT, 180),
    lastActionIntent: compactText(value.lastActionIntent, 80),
    lastSourceId: compactText(value.lastSourceId, 120, { allowPrivateLabel: true }),
    updatedAt: normalizeDateText(value.updatedAt),
  }
}

function normalizeCharacterMemories(value: unknown): LocationRoomCharacterPhraseActionMemory[] {
  const raw = Array.isArray(value)
    ? value
    : isRecord(value)
      ? Object.values(value)
      : []
  const byToken = new Map<number, LocationRoomCharacterPhraseActionMemory>()
  for (const item of raw) {
    const memory = normalizeCharacterPhraseActionMemory(item)
    if (!memory) continue
    byToken.delete(memory.tokenId)
    byToken.set(memory.tokenId, memory)
  }
  return Array.from(byToken.values()).slice(-CHARACTER_MEMORY_LIMIT)
}

function normalizeCombatTerminalSummary(value: unknown, index: number): LocationRoomCombatTerminalSummary | null {
  if (!isRecord(value)) return null
  const encounterId = compactId(value.encounterId ?? value.id, `encounter-${index + 1}`)
  if (!encounterId) return null
  return {
    encounterId,
    status: normalizeCombatTerminalStatus(value.status),
    publicTitle: compactText(value.publicTitle ?? value.title, 120),
    publicSummary: compactText(value.publicSummary ?? value.summary, 500),
    defeatedMonsterIdentities: compactList(value.defeatedMonsterIdentities, 6, 100),
    survivingMonsterIdentities: compactList(value.survivingMonsterIdentities, 6, 100),
    characterOutcomes: compactList(value.characterOutcomes, 8, 180),
    aftermathHooks: compactList(value.aftermathHooks, 6, 180),
    terminalAt: normalizeDateText(value.terminalAt ?? value.completedAt),
  }
}

function normalizeCombatTerminalSummaries(value: unknown): LocationRoomCombatTerminalSummary[] {
  if (!Array.isArray(value)) return []
  return value
    .map((summary, index) => normalizeCombatTerminalSummary(summary, index))
    .filter((summary): summary is LocationRoomCombatTerminalSummary => Boolean(summary))
    .slice(-COMBAT_TERMINAL_SUMMARY_LIMIT)
}

function memorySource(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const source = metadata ?? {}
  if (isRecord(source.narrativeMemory)) return source.narrativeMemory
  if (isRecord(source.structuredNarrativeMemory)) return source.structuredNarrativeMemory
  return {}
}

export function normalizeStructuredNarrativeMemory(
  metadata: Record<string, unknown> | null | undefined
): LocationRoomStructuredNarrativeMemory {
  const source = memorySource(metadata)
  const adventure = normalizeAdventureMemory(metadata)
  return {
    publicContinuity: normalizePublicContinuityMemory(source.publicContinuity),
    gmPlanning: normalizeGmPlanningState(source.gmPlanning),
    characterMemories: normalizeCharacterMemories(source.characterMemories),
    combatTerminalSummaries: normalizeCombatTerminalSummaries(source.combatTerminalSummaries),
    spatialState: normalizeSpatialState(source.spatialState, adventure.spatialContext),
  }
}

export function projectPublicContinuityMemory(
  input: ProjectPublicContinuityMemoryInput
): LocationRoomPublicContinuityMemory {
  const narrativeState = input.narrativeState ?? null
  const existing = normalizeStructuredNarrativeMemory(narrativeState?.metadata).publicContinuity
  const adventure = normalizeAdventureMemory(narrativeState?.metadata)
  const limit = Math.max(1, Math.min(PUBLIC_CONTINUITY_BEAT_LIMIT, input.limit ?? PUBLIC_CONTINUITY_BEAT_LIMIT))
  const recentPublicBeats = (input.recentMessages ?? [])
    .filter((message) => message.visibility === 'public')
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map((message) => normalizePublicContinuityBeat({
      id: message.id,
      sequence: message.sequence,
      authorName: message.authorName,
      tokenId: message.tokenId,
      content: message.content,
      createdAt: message.createdAt,
    }, 0))
    .filter((beat): beat is LocationRoomPublicContinuityBeat => Boolean(beat))
    .slice(-limit)

  return {
    roomSummary: compactText(narrativeState?.stateSummary, 600) ?? existing.roomSummary,
    currentObjective: compactText(narrativeState?.currentObjective, 300) ?? existing.currentObjective,
    openThreads: compactList(narrativeState?.openThreads, PUBLIC_CONTINUITY_THREAD_LIMIT, 180).length
      ? compactList(narrativeState?.openThreads, PUBLIC_CONTINUITY_THREAD_LIMIT, 180)
      : existing.openThreads,
    recentPublicBeats: recentPublicBeats.length ? recentPublicBeats : existing.recentPublicBeats,
    unresolvedConsequences: adventure.consequenceLedger
      .filter((entry) => entry.status === 'open' || entry.status === 'complication')
      .slice(-PUBLIC_CONTINUITY_CONSEQUENCE_LIMIT)
      .map((entry) => entry.summary),
  }
}

function mergeByToken(
  current: LocationRoomCharacterPhraseActionMemory[],
  incoming: LocationRoomCharacterPhraseActionMemory[]
): LocationRoomCharacterPhraseActionMemory[] {
  const byToken = new Map<number, LocationRoomCharacterPhraseActionMemory>()
  for (const entry of current) byToken.set(entry.tokenId, entry)
  for (const entry of incoming) byToken.set(entry.tokenId, entry)
  return Array.from(byToken.values()).slice(-CHARACTER_MEMORY_LIMIT)
}

function mergeTerminalSummaries(
  current: LocationRoomCombatTerminalSummary[],
  incoming: LocationRoomCombatTerminalSummary[]
): LocationRoomCombatTerminalSummary[] {
  const byEncounter = new Map<string, LocationRoomCombatTerminalSummary>()
  for (const entry of current) byEncounter.set(entry.encounterId, entry)
  for (const entry of incoming) byEncounter.set(entry.encounterId, entry)
  return Array.from(byEncounter.values()).slice(-COMBAT_TERMINAL_SUMMARY_LIMIT)
}

export function mergeStructuredNarrativeMemory(
  metadata: Record<string, unknown> | null | undefined,
  patch: LocationRoomStructuredNarrativeMemoryPatch
): Record<string, unknown> {
  const current = normalizeStructuredNarrativeMemory(metadata)
  const publicContinuityPatch = patch.publicContinuity ?? {}
  const next: LocationRoomStructuredNarrativeMemory = {
    publicContinuity: {
      ...current.publicContinuity,
      ...publicContinuityPatch,
      openThreads: publicContinuityPatch.openThreads
        ? compactList(publicContinuityPatch.openThreads, PUBLIC_CONTINUITY_THREAD_LIMIT, 180)
        : current.publicContinuity.openThreads,
      recentPublicBeats: publicContinuityPatch.recentPublicBeats
        ? publicContinuityPatch.recentPublicBeats
          .map((beat, index) => normalizePublicContinuityBeat(beat, index))
          .filter((beat): beat is LocationRoomPublicContinuityBeat => Boolean(beat))
          .slice(-PUBLIC_CONTINUITY_BEAT_LIMIT)
        : current.publicContinuity.recentPublicBeats,
      unresolvedConsequences: publicContinuityPatch.unresolvedConsequences
        ? compactList(publicContinuityPatch.unresolvedConsequences, PUBLIC_CONTINUITY_CONSEQUENCE_LIMIT, 220)
        : current.publicContinuity.unresolvedConsequences,
    },
    gmPlanning: patch.gmPlanning
      ? normalizeGmPlanningState({ ...current.gmPlanning, ...patch.gmPlanning })
      : current.gmPlanning,
    characterMemories: patch.characterMemories
      ? mergeByToken(current.characterMemories, normalizeCharacterMemories(patch.characterMemories))
      : current.characterMemories,
    combatTerminalSummaries: patch.combatTerminalSummaries
      ? mergeTerminalSummaries(current.combatTerminalSummaries, normalizeCombatTerminalSummaries(patch.combatTerminalSummaries))
      : current.combatTerminalSummaries,
    spatialState: patch.spatialState
      ? normalizeSpatialState(patch.spatialState, current.spatialState)
      : current.spatialState,
  }

  return {
    ...(metadata ?? {}),
    narrativeMemory: next,
  }
}

export function recordCharacterPhraseActionMemory(
  metadata: Record<string, unknown> | null | undefined,
  input: RecordCharacterPhraseActionMemoryInput
): Record<string, unknown> {
  const current = normalizeStructuredNarrativeMemory(metadata)
  const existing = current.characterMemories.find((entry) => entry.tokenId === input.tokenId)
  const phrase = compactText(input.phrase, 180)
  const actionSummary = compactText(input.actionSummary, 180)
  const nextMemory: LocationRoomCharacterPhraseActionMemory = {
    tokenId: input.tokenId,
    publicName: compactText(input.publicName, 80) ?? existing?.publicName ?? null,
    recentPhrases: compactList([...(existing?.recentPhrases ?? []), phrase], CHARACTER_MEMORY_PHRASE_LIMIT, 180),
    recentActions: compactList([...(existing?.recentActions ?? []), actionSummary], CHARACTER_MEMORY_ACTION_LIMIT, 180),
    lastActionIntent: compactText(input.actionIntent, 80) ?? existing?.lastActionIntent ?? null,
    lastSourceId: compactText(input.sourceId, 120, { allowPrivateLabel: true }) ?? existing?.lastSourceId ?? null,
    updatedAt: normalizeDateText(input.observedAt) ?? existing?.updatedAt ?? null,
  }

  return mergeStructuredNarrativeMemory(metadata, { characterMemories: [nextMemory] })
}

function parseMonsterList(value: unknown): Array<{ id: string; name: string; status: string | null }> {
  const raw = Array.isArray(value) ? value : []
  return raw
    .map((monster, index) => {
      if (!isRecord(monster)) return null
      const id = compactId(monster.id, `monster-${index + 1}`)
      const name = compactText(monster.name ?? monster.publicName, 100)
      if (!id || !name) return null
      const status = compactText(monster.status, 40, { allowPrivateLabel: true })
      return { id, name, status }
    })
    .filter((monster): monster is { id: string; name: string; status: string | null } => Boolean(monster))
}

function normalizeEncounterTerminalStatus(status: GameplayEncounterStatus | string | null | undefined): LocationRoomCombatTerminalStatus | null {
  if (status === 'victory' || status === 'defeat' || status === 'fled' || status === 'abandoned') return status
  return null
}

export function projectCombatTerminalSummary(
  encounter: Pick<GameplayEncounter, 'id' | 'status' | 'publicTitle' | 'publicSummary' | 'monsterState' | 'rewardPlan' | 'completedAt'>
): LocationRoomCombatTerminalSummary | null {
  const status = normalizeEncounterTerminalStatus(encounter.status)
  if (!status) return null
  const monsters = parseMonsterList(encounter.monsterState)
  const rewardPlan = isRecord(encounter.rewardPlan) ? encounter.rewardPlan : {}
  return {
    encounterId: encounter.id,
    status,
    publicTitle: compactText(encounter.publicTitle, 120),
    publicSummary: compactText(encounter.publicSummary, 500),
    defeatedMonsterIdentities: monsters.filter((monster) => monster.status === 'dead').map((monster) => monster.name).slice(0, 6),
    survivingMonsterIdentities: monsters.filter((monster) => monster.status !== 'dead').map((monster) => monster.name).slice(0, 6),
    characterOutcomes: [],
    aftermathHooks: compactList([
      rewardPlan.victoryText,
      ...(Array.isArray(rewardPlan.narrativeRewards) ? rewardPlan.narrativeRewards : []),
    ], 6, 180),
    terminalAt: normalizeDateText(encounter.completedAt),
  }
}

function normalizeLocationAffordanceCard(value: unknown, index: number, source: LocationRoomContentCardSource): LocationRoomLocationAffordanceCard | null {
  if (!isRecord(value)) return null
  const title = compactText(value.title ?? value.name, 100)
  const publicSummary = compactText(value.publicSummary ?? value.summary, 360)
  if (!title || !publicSummary) return null
  const id = compactId(value.id, `affordance-${index + 1}`)
  if (!id) return null
  return {
    id,
    title,
    publicSummary,
    sensoryDetails: compactList(value.sensoryDetails, GM_CONTENT_CARD_LIST_LIMIT, 140),
    actionAffordances: compactList(value.actionAffordances ?? value.affordances, GM_CONTENT_CARD_LIST_LIMIT, 140),
    boundaries: compactList(value.boundaries, GM_CONTENT_CARD_LIST_LIMIT, 140),
    tags: compactList(value.tags, GM_CONTENT_CARD_LIST_LIMIT, 60, { allowPrivateLabel: true }),
    source: normalizeCardSource(value.source as LooseCardSource, source),
    catalogEntryIds: compactList(value.catalogEntryIds, GM_CONTENT_CARD_LIST_LIMIT, 100, { allowPrivateLabel: true }),
  }
}

function normalizeMonsterPublicIdentityCard(value: unknown, index: number, source: LocationRoomContentCardSource): LocationRoomMonsterPublicIdentityCard | null {
  if (!isRecord(value)) return null
  const publicName = compactText(value.publicName ?? value.name ?? value.title, 100)
  const publicDescription = compactText(value.publicDescription ?? value.summary ?? value.description, 360)
  if (!publicName || !publicDescription) return null
  const id = compactId(value.id, `monster-${index + 1}`)
  if (!id) return null
  return {
    id,
    publicName,
    publicEpithets: compactList(value.publicEpithets ?? value.epithets, GM_CONTENT_CARD_LIST_LIMIT, 80),
    publicDescription,
    tells: compactList(value.tells, GM_CONTENT_CARD_LIST_LIMIT, 140),
    threatSignals: compactList(value.threatSignals, GM_CONTENT_CARD_LIST_LIMIT, 140),
    defeatCues: compactList(value.defeatCues, GM_CONTENT_CARD_LIST_LIMIT, 140),
    forbiddenPrivateLabels: compactList(value.forbiddenPrivateLabels ?? value.forbiddenLabels, GM_CONTENT_CARD_LIST_LIMIT, 100, { allowPrivateLabel: true }),
    source: normalizeCardSource(value.source as LooseCardSource, source),
    catalogEntryIds: compactList(value.catalogEntryIds, GM_CONTENT_CARD_LIST_LIMIT, 100, { allowPrivateLabel: true }),
  }
}

function normalizeTierPayoffExampleCard(value: unknown, index: number, source: LocationRoomContentCardSource): LocationRoomTierPayoffExampleCard | null {
  if (!isRecord(value)) return null
  const tier = hasStringValue(PAYOFF_TIERS, value.tier) ? value.tier : null
  const publicExample = compactText(value.publicExample ?? value.example, 360)
  if (!tier || !publicExample) return null
  const id = compactId(value.id, `tier-${tier}-${index + 1}`)
  if (!id) return null
  return {
    id,
    tier,
    actionIntent: compactText(value.actionIntent, 80),
    publicExample,
    consequenceShape: compactText(value.consequenceShape, 180),
    source: normalizeCardSource(value.source as LooseCardSource, source),
  }
}

function normalizeForbiddenLabelCard(value: unknown, index: number, source: LocationRoomContentCardSource): LocationRoomForbiddenLabelCard | null {
  if (!isRecord(value)) return null
  const label = compactText(value.label, 100, { allowPrivateLabel: true })
  const reason = compactText(value.reason, 180, { allowPrivateLabel: true })
  if (!label || !reason) return null
  const id = compactId(value.id ?? label, `forbidden-${index + 1}`)
  if (!id) return null
  return {
    id,
    label,
    reason,
    publicAlternatives: compactList(value.publicAlternatives ?? value.alternatives, GM_CONTENT_CARD_LIST_LIMIT, 100),
    severity: value.severity === 'warn' ? 'warn' : 'block',
    source: normalizeCardSource(value.source as LooseCardSource, source),
  }
}

function normalizeAftermathTemplateCard(value: unknown, index: number, source: LocationRoomContentCardSource): LocationRoomAftermathTemplateCard | null {
  if (!isRecord(value)) return null
  const terminalStatus = normalizeCombatTerminalStatus(value.terminalStatus ?? value.status)
  const template = compactText(value.template, 420)
  if (!template) return null
  const id = compactId(value.id, `aftermath-${terminalStatus}-${index + 1}`)
  if (!id) return null
  return {
    id,
    terminalStatus,
    template,
    continuationHooks: compactList(value.continuationHooks ?? value.hooks, GM_CONTENT_CARD_LIST_LIMIT, 160),
    forbiddenClaims: compactList(value.forbiddenClaims, GM_CONTENT_CARD_LIST_LIMIT, 120, { allowPrivateLabel: true }),
    source: normalizeCardSource(value.source as LooseCardSource, source),
  }
}

export function emptyGmContentBook(): LocationRoomGmContentBook {
  return {
    locationAffordances: [],
    monsterPublicIdentities: [],
    tierPayoffExamples: [],
    forbiddenLabels: [],
    aftermathTemplates: [],
  }
}

export function normalizeGmContentBook(value: unknown, source: LocationRoomContentCardSource = 'gm_book'): LocationRoomGmContentBook {
  const raw = isRecord(value) ? value : {}
  return {
    locationAffordances: Array.isArray(raw.locationAffordances)
      ? raw.locationAffordances
        .map((entry, index) => normalizeLocationAffordanceCard(entry, index, source))
        .filter((entry): entry is LocationRoomLocationAffordanceCard => Boolean(entry))
        .slice(0, GM_CONTENT_CARD_LIMIT)
      : [],
    monsterPublicIdentities: Array.isArray(raw.monsterPublicIdentities)
      ? raw.monsterPublicIdentities
        .map((entry, index) => normalizeMonsterPublicIdentityCard(entry, index, source))
        .filter((entry): entry is LocationRoomMonsterPublicIdentityCard => Boolean(entry))
        .slice(0, GM_CONTENT_CARD_LIMIT)
      : [],
    tierPayoffExamples: Array.isArray(raw.tierPayoffExamples)
      ? raw.tierPayoffExamples
        .map((entry, index) => normalizeTierPayoffExampleCard(entry, index, source))
        .filter((entry): entry is LocationRoomTierPayoffExampleCard => Boolean(entry))
        .slice(0, GM_CONTENT_CARD_LIMIT)
      : [],
    forbiddenLabels: Array.isArray(raw.forbiddenLabels)
      ? raw.forbiddenLabels
        .map((entry, index) => normalizeForbiddenLabelCard(entry, index, source))
        .filter((entry): entry is LocationRoomForbiddenLabelCard => Boolean(entry))
        .slice(0, GM_CONTENT_CARD_LIMIT)
      : [],
    aftermathTemplates: Array.isArray(raw.aftermathTemplates)
      ? raw.aftermathTemplates
        .map((entry, index) => normalizeAftermathTemplateCard(entry, index, source))
        .filter((entry): entry is LocationRoomAftermathTemplateCard => Boolean(entry))
        .slice(0, GM_CONTENT_CARD_LIMIT)
      : [],
  }
}

function catalogEntryToAffordance(entry: LocationAdventureCatalogEntry): LocationRoomLocationAffordanceCard | null {
  return normalizeLocationAffordanceCard({
    id: entry.id,
    title: entry.title ?? entry.id,
    publicSummary: entry.summary,
    tags: entry.tags,
    catalogEntryIds: [entry.id],
    source: 'location_catalog',
  }, 0, 'location_catalog')
}

function catalogEntryToMonsterIdentity(entry: LocationAdventureCatalogEntry): LocationRoomMonsterPublicIdentityCard | null {
  return normalizeMonsterPublicIdentityCard({
    id: entry.id,
    publicName: entry.title ?? entry.id,
    publicDescription: entry.summary,
    threatSignals: entry.tags,
    catalogEntryIds: [entry.id],
    source: 'location_catalog',
  }, 0, 'location_catalog')
}

function visibleCatalogEntries(entries: LocationAdventureCatalogEntry[] | undefined): LocationAdventureCatalogEntry[] {
  return (entries ?? []).filter((entry) => (entry.revealConditions ?? []).length === 0)
}

export function buildGmContentBookFromCatalog(
  catalog: NormalizedLocationAdventureCatalog | null | undefined,
  rawBook: unknown = null
): LocationRoomGmContentBook {
  const base = normalizeGmContentBook(rawBook)
  if (!catalog) return base
  const catalogAffordances = [
    ...visibleCatalogEntries(catalog.sections['00_setting']),
    ...visibleCatalogEntries(catalog.sections['40_places']),
    ...visibleCatalogEntries(catalog.sections['50_items']),
    ...visibleCatalogEntries(catalog.sections['60_shops_services']),
  ]
    .map(catalogEntryToAffordance)
    .filter((entry): entry is LocationRoomLocationAffordanceCard => Boolean(entry))
  const catalogMonsters = visibleCatalogEntries(catalog.sections['30_monsters'])
    .map(catalogEntryToMonsterIdentity)
    .filter((entry): entry is LocationRoomMonsterPublicIdentityCard => Boolean(entry))

  return {
    locationAffordances: [...base.locationAffordances, ...catalogAffordances].slice(0, GM_CONTENT_CARD_LIMIT),
    monsterPublicIdentities: [...base.monsterPublicIdentities, ...catalogMonsters].slice(0, GM_CONTENT_CARD_LIMIT),
    tierPayoffExamples: base.tierPayoffExamples,
    forbiddenLabels: base.forbiddenLabels,
    aftermathTemplates: base.aftermathTemplates,
  }
}
