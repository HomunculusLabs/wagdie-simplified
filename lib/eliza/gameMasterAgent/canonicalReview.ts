import { createHash } from 'crypto'
import { toAICharacterFromRecord } from '@/lib/eliza/agent-character-mapper'
import { getKnowledgeDocuments, type StoredKnowledgeDocument } from '@/lib/eliza/knowledge'
import { hashKnowledgeContent } from '@/lib/eliza/knowledgeSync'
import { FIELD_LIMITS, type AICharacter } from '@/types/eliza'
import {
  GAME_MASTER_CANONICAL_CONTENT,
  GAME_MASTER_CANONICAL_PERSONA_FIELDS,
  type GameMasterCanonicalContentBundle,
  type GameMasterCanonicalKnowledgeDocument,
  type GameMasterCanonicalPersonaField,
} from './canonicalContent'
import type { CharacterRecord } from '@/lib/eliza/gateway/types'
import type { GameMasterAgentSetting, ServiceAgentKnowledgeSyncState } from './repository'

export type GameMasterCanonicalPersonaStatus = 'unavailable' | 'in_sync' | 'drifted'
export type GameMasterCanonicalKnowledgeLiveStatus = 'missing' | 'in_sync' | 'changed'
export type GameMasterCanonicalKnowledgeSyncStatus = 'pending' | 'indexed' | 'deleted' | 'error' | 'unsynced' | 'unknown'

export interface GameMasterCanonicalApplyMetadata {
  bundleId?: string
  contentVersion?: string
  schemaVersion?: number
  persona?: {
    hash?: string
    appliedAt?: string
    appliedBy?: string | null
  }
  knowledge?: {
    appliedAt?: string
    appliedBy?: string | null
    documentHashes?: Record<string, string>
  }
}

export interface GameMasterCanonicalPersonaReview {
  status: GameMasterCanonicalPersonaStatus
  canonicalHash: string
  liveHash: string | null
  changedFields: GameMasterCanonicalPersonaField[]
  lastApplied: GameMasterCanonicalApplyMetadata['persona'] | null
}

export interface GameMasterCanonicalKnowledgeDocumentReview {
  id: string
  title: string
  path: string
  mimeType: GameMasterCanonicalKnowledgeDocument['mimeType']
  preview: string
  size: number
  canonicalHash: string
  liveHash: string | null
  livePath: string | null
  liveStatus: GameMasterCanonicalKnowledgeLiveStatus
  syncStatus: GameMasterCanonicalKnowledgeSyncStatus
  lastSyncedAt: string | null
  hasSyncError: boolean
  shouldSync: boolean
}

export interface GameMasterCanonicalObsoleteKnowledgeDocumentReview {
  id: string
  path: string
  liveHash: string | null
  previousBundleId: string | null
  previousContentVersion: string | null
  syncStatus: GameMasterCanonicalKnowledgeSyncStatus
}

export interface GameMasterCanonicalKnowledgeReview {
  status: 'unavailable' | 'in_sync' | 'drifted' | 'conflict'
  documentLimit: {
    max: number
    liveCount: number
    canonicalCount: number
    preservedLiveCount: number
    resultingCount: number
    conflict: boolean
  }
  documents: GameMasterCanonicalKnowledgeDocumentReview[]
  obsoletePreservedDocuments: GameMasterCanonicalObsoleteKnowledgeDocumentReview[]
  syncStateLookupFailed: boolean
  lastApplied: GameMasterCanonicalApplyMetadata['knowledge'] | null
}

export interface GameMasterCanonicalContentReview {
  schemaVersion: GameMasterCanonicalContentBundle['schemaVersion']
  bundleId: string
  contentVersion: string
  reviewToken: string
  canApply: boolean
  unavailableReason: string | null
  persona: GameMasterCanonicalPersonaReview
  knowledge: GameMasterCanonicalKnowledgeReview
}

interface BuildReviewInput {
  bundle?: GameMasterCanonicalContentBundle
  setting: GameMasterAgentSetting | null
  record: CharacterRecord | null
  syncStates?: ServiceAgentKnowledgeSyncState[]
  syncStateLookupFailed?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableNormalize)
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, stableNormalize(child)])
    )
  }

  return value
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableNormalize(value))
}

export function hashCanonicalValue(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex')
}

function pickCanonicalPersonaFields(source: Partial<AICharacter>): Record<GameMasterCanonicalPersonaField, unknown> {
  return Object.fromEntries(
    GAME_MASTER_CANONICAL_PERSONA_FIELDS.map((field) => [
      field,
      (source as Record<string, unknown>)[field] ?? null,
    ])
  ) as Record<GameMasterCanonicalPersonaField, unknown>
}

function readRecordCharacterField(record: CharacterRecord, field: string): unknown {
  const character = record.character as Record<string, unknown>
  return character[field] ?? null
}

export function getCanonicalPersonaHash(
  bundle: GameMasterCanonicalContentBundle = GAME_MASTER_CANONICAL_CONTENT
): string {
  return hashCanonicalValue(pickCanonicalPersonaFields(bundle.persona as Partial<AICharacter>))
}

function getLivePersonaHash(record: CharacterRecord | null): { hash: string | null; fields: Record<GameMasterCanonicalPersonaField, unknown> | null } {
  if (!record) return { hash: null, fields: null }

  const aiCharacter = toAICharacterFromRecord(record.externalId ?? 'game-master', record)
  const fields = pickCanonicalPersonaFields(aiCharacter)
  fields.system = readRecordCharacterField(record, 'system')
  fields.systemPrompt = readRecordCharacterField(record, 'systemPrompt')
  return { hash: hashCanonicalValue(fields), fields }
}

function getChangedPersonaFields(
  bundle: GameMasterCanonicalContentBundle,
  liveFields: Record<GameMasterCanonicalPersonaField, unknown> | null
): GameMasterCanonicalPersonaField[] {
  if (!liveFields) return [...GAME_MASTER_CANONICAL_PERSONA_FIELDS]

  const canonicalFields = pickCanonicalPersonaFields(bundle.persona as Partial<AICharacter>)
  return GAME_MASTER_CANONICAL_PERSONA_FIELDS.filter(
    (field) => hashCanonicalValue(canonicalFields[field]) !== hashCanonicalValue(liveFields[field])
  )
}

function readCanonicalMetadata(setting: GameMasterAgentSetting | null): GameMasterCanonicalApplyMetadata | null {
  const metadata = setting?.metadata
  if (!isRecord(metadata)) return null

  const canonical = metadata.canonicalContent
  if (!isRecord(canonical)) return null

  return canonical as GameMasterCanonicalApplyMetadata
}

function syncStatusFromState(
  state: ServiceAgentKnowledgeSyncState | null | undefined,
  lookupFailed: boolean
): GameMasterCanonicalKnowledgeSyncStatus {
  if (lookupFailed) return 'unknown'
  return state?.status ?? 'unsynced'
}

function getCanonicalDocumentHash(document: Pick<GameMasterCanonicalKnowledgeDocument, 'content'>): string {
  return hashKnowledgeContent(document.content)
}

function getLiveDocumentHash(document: StoredKnowledgeDocument | null | undefined): string | null {
  if (!document) return null
  return hashKnowledgeContent(document.content ?? '')
}

function hasCanonicalSourcePointer(
  state: ServiceAgentKnowledgeSyncState | null | undefined
): boolean {
  const canonical = state?.sourcePointer?.canonical
  return isRecord(canonical) && typeof canonical.documentId === 'string'
}

function getCanonicalPointerString(
  state: ServiceAgentKnowledgeSyncState | null | undefined,
  key: 'bundleId' | 'contentVersion' | 'documentId'
): string | null {
  const canonical = state?.sourcePointer?.canonical
  if (!isRecord(canonical)) return null
  const value = canonical[key]
  return typeof value === 'string' ? value : null
}

function syncStateMatchesCanonicalDocument(input: {
  state: ServiceAgentKnowledgeSyncState | null | undefined
  record: CharacterRecord | null
  bundle: GameMasterCanonicalContentBundle
  document: GameMasterCanonicalKnowledgeDocument
  contentHash: string
}): boolean {
  const state = input.state
  if (!state || !input.record) return false
  return Boolean(
    state.status === 'indexed' &&
    state.officialAgentId === input.record.id &&
    state.officialMemoryId &&
    state.contentHash === input.contentHash &&
    getCanonicalPointerString(state, 'bundleId') === input.bundle.bundleId &&
    getCanonicalPointerString(state, 'contentVersion') === input.bundle.contentVersion &&
    getCanonicalPointerString(state, 'documentId') === input.document.id
  )
}

function buildKnowledgeReview(input: {
  bundle: GameMasterCanonicalContentBundle
  record: CharacterRecord | null
  syncStates: ServiceAgentKnowledgeSyncState[]
  lookupFailed: boolean
  metadata: GameMasterCanonicalApplyMetadata | null
}): GameMasterCanonicalKnowledgeReview {
  const liveDocuments = input.record ? getKnowledgeDocuments(input.record.character as Record<string, unknown>) : []
  const liveById = new Map(liveDocuments.map((document) => [document.id, document]))
  const syncById = new Map(input.syncStates.map((state) => [state.documentId, state]))
  const canonicalIds = new Set(input.bundle.knowledge.map((document) => document.id))

  const documents = input.bundle.knowledge.map((document): GameMasterCanonicalKnowledgeDocumentReview => {
    const liveDocument = liveById.get(document.id) ?? null
    const canonicalHash = getCanonicalDocumentHash(document)
    const liveHash = getLiveDocumentHash(liveDocument)
    const syncState = syncById.get(document.id) ?? null
    const syncStatus = syncStatusFromState(syncState, input.lookupFailed)
    const liveStatus: GameMasterCanonicalKnowledgeLiveStatus = !liveDocument
      ? 'missing'
      : liveDocument.path === document.path && liveHash === canonicalHash
        ? 'in_sync'
        : 'changed'
    const shouldSync = liveStatus !== 'in_sync' || !syncStateMatchesCanonicalDocument({
      state: syncState,
      record: input.record,
      bundle: input.bundle,
      document,
      contentHash: canonicalHash,
    })

    return {
      id: document.id,
      title: document.title,
      path: document.path,
      mimeType: document.mimeType,
      preview: document.content.slice(0, 200),
      size: document.content.length,
      canonicalHash,
      liveHash,
      livePath: liveDocument?.path ?? null,
      liveStatus,
      syncStatus,
      lastSyncedAt: syncState?.lastSyncedAt ?? null,
      hasSyncError: Boolean(syncState?.lastError),
      shouldSync,
    }
  })

  const obsoletePreservedDocuments = liveDocuments
    .filter((document) => !canonicalIds.has(document.id))
    .map((document): GameMasterCanonicalObsoleteKnowledgeDocumentReview | null => {
      const state = syncById.get(document.id) ?? null
      if (!hasCanonicalSourcePointer(state)) return null
      return {
        id: document.id,
        path: document.path,
        liveHash: getLiveDocumentHash(document),
        previousBundleId: getCanonicalPointerString(state, 'bundleId'),
        previousContentVersion: getCanonicalPointerString(state, 'contentVersion'),
        syncStatus: syncStatusFromState(state, input.lookupFailed),
      }
    })
    .filter((document): document is GameMasterCanonicalObsoleteKnowledgeDocumentReview => Boolean(document))

  const preservedLiveCount = liveDocuments.filter((document) => !canonicalIds.has(document.id)).length
  const resultingCount = preservedLiveCount + input.bundle.knowledge.length
  const conflict = resultingCount > FIELD_LIMITS.maxKnowledgeDocs
  const anyDrift = documents.some((document) => document.liveStatus !== 'in_sync' || document.shouldSync)
  const status: GameMasterCanonicalKnowledgeReview['status'] = !input.record
    ? 'unavailable'
    : conflict
      ? 'conflict'
      : anyDrift || obsoletePreservedDocuments.length > 0
        ? 'drifted'
        : 'in_sync'

  return {
    status,
    documentLimit: {
      max: FIELD_LIMITS.maxKnowledgeDocs,
      liveCount: liveDocuments.length,
      canonicalCount: input.bundle.knowledge.length,
      preservedLiveCount,
      resultingCount,
      conflict,
    },
    documents,
    obsoletePreservedDocuments,
    syncStateLookupFailed: input.lookupFailed,
    lastApplied: input.metadata?.knowledge ?? null,
  }
}

function buildReviewToken(input: {
  bundle: GameMasterCanonicalContentBundle
  setting: GameMasterAgentSetting | null
  record: CharacterRecord | null
  personaHash: string
  canonicalDocSetHash: string
  livePersonaFields: Record<GameMasterCanonicalPersonaField, unknown> | null
  liveDocuments: StoredKnowledgeDocument[]
  metadata: GameMasterCanonicalApplyMetadata | null
}): string {
  const canonicalIds = new Set(input.bundle.knowledge.map((document) => document.id))
  const liveCanonicalDocumentState = input.liveDocuments
    .filter((document) => canonicalIds.has(document.id))
    .map((document) => ({
      id: document.id,
      path: document.path,
      contentHash: getLiveDocumentHash(document),
    }))
    .sort((a, b) => a.id.localeCompare(b.id))

  return hashCanonicalValue({
    bundleId: input.bundle.bundleId,
    contentVersion: input.bundle.contentVersion,
    personaHash: input.personaHash,
    canonicalDocSetHash: input.canonicalDocSetHash,
    setting: input.setting
      ? {
          officialAgentId: input.setting.officialAgentId,
          source: input.setting.source,
          updatedAt: input.setting.updatedAt ?? null,
        }
      : null,
    record: input.record
      ? {
          id: input.record.id,
          updatedAt: input.record.updatedAt ?? null,
        }
      : null,
    livePersonaFields: input.livePersonaFields,
    liveKnowledgeDocumentIds: input.liveDocuments.map((document) => document.id).sort(),
    liveCanonicalDocumentState,
    canonicalApplyMetadata: input.metadata,
  })
}

export function buildGameMasterCanonicalContentReview(
  input: BuildReviewInput
): GameMasterCanonicalContentReview {
  const bundle = input.bundle ?? GAME_MASTER_CANONICAL_CONTENT
  const metadata = readCanonicalMetadata(input.setting)
  const canonicalPersonaHash = getCanonicalPersonaHash(bundle)
  const livePersona = getLivePersonaHash(input.record)
  const changedFields = getChangedPersonaFields(bundle, livePersona.fields)
  const personaStatus: GameMasterCanonicalPersonaStatus = !input.record
    ? 'unavailable'
    : changedFields.length === 0
      ? 'in_sync'
      : 'drifted'

  const canonicalDocSetHash = hashCanonicalValue(
    bundle.knowledge
      .map((document) => ({
        id: document.id,
        path: document.path,
        contentHash: getCanonicalDocumentHash(document),
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  )
  const liveDocuments = input.record ? getKnowledgeDocuments(input.record.character as Record<string, unknown>) : []
  const knowledge = buildKnowledgeReview({
    bundle,
    record: input.record,
    syncStates: input.syncStates ?? [],
    lookupFailed: input.syncStateLookupFailed ?? false,
    metadata,
  })
  const unavailableReason = !input.setting
    ? 'No admin-managed game-master setting is active'
    : !input.record
      ? 'Official game-master record is unavailable'
      : null

  return {
    schemaVersion: bundle.schemaVersion,
    bundleId: bundle.bundleId,
    contentVersion: bundle.contentVersion,
    reviewToken: buildReviewToken({
      bundle,
      setting: input.setting,
      record: input.record,
      personaHash: canonicalPersonaHash,
      canonicalDocSetHash,
      livePersonaFields: livePersona.fields,
      liveDocuments,
      metadata,
    }),
    canApply: Boolean(input.setting && input.record),
    unavailableReason,
    persona: {
      status: personaStatus,
      canonicalHash: canonicalPersonaHash,
      liveHash: livePersona.hash,
      changedFields,
      lastApplied: metadata?.persona ?? null,
    },
    knowledge,
  }
}
