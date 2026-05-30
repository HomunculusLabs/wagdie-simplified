import { randomUUID } from 'crypto'
import { elizaConfig } from '@/lib/eliza/config'
import { createOfficialServerClient } from '@/lib/eliza/client'
import { WagdieElizaError } from '@/lib/eliza/gateway/errors'
import type { CharacterRecord, WagdieElizaClient } from '@/lib/eliza/gateway/types'
import {
  applyWagdieUpdateToAgentCharacter,
  toAICharacterFromRecord,
} from '@/lib/eliza/agent-character-mapper'
import { validatePutCharacterSheetUpdate } from '@/lib/eliza/character-sheet-policy'
import {
  appendKnowledgeDocument,
  findKnowledgeDocumentById,
  getKnowledgeDocuments,
  removeKnowledgeDocumentById,
  replaceKnowledgeDocuments,
  toKnowledgeDocumentSummary,
  type KnowledgeDocumentSummary,
  type StoredKnowledgeDocument,
} from '@/lib/eliza/knowledge'
import { hashKnowledgeContent } from '@/lib/eliza/knowledgeSync'
import {
  createOfficialKnowledgeClient,
  type OfficialKnowledgeClient,
  type OfficialKnowledgeSourcePointer,
} from '@/lib/eliza/official/knowledge-client'
import { FIELD_LIMITS, type AICharacter, type UpdateAICharacterInput } from '@/types/eliza'
import {
  GAME_MASTER_AGENT_EXTERNAL_ID,
  GAME_MASTER_AGENT_KNOWLEDGE_ALLOWED_EXTENSIONS,
  GAME_MASTER_AGENT_KNOWLEDGE_ALLOWED_TYPES,
  GAME_MASTER_AGENT_SETTING_KEY,
} from './constants'
import {
  buildCanonicalGameMasterAgentCharacter,
  GAME_MASTER_CANONICAL_CONTENT,
  toStoredCanonicalKnowledgeDocument,
} from './canonicalContent'
import {
  buildGameMasterCanonicalContentReview,
  getCanonicalPersonaHash,
  type GameMasterCanonicalContentReview,
} from './canonicalReview'
import {
  gameMasterAgentSettingsRepository,
  serviceAgentKnowledgeSyncStateRepository,
  type GameMasterAgentSetting,
  type GameMasterAgentSettingsRepository,
  type ServiceAgentKnowledgeSyncState,
  type ServiceAgentKnowledgeSyncStateRepository,
} from './repository'

export type GameMasterAgentResolutionSource = 'database' | 'env' | 'missing'
export type GameMasterAgentAdminEffectiveSource = 'admin' | 'env' | 'missing'

export interface GameMasterAgentResolution {
  source: GameMasterAgentResolutionSource
  officialAgentId: string | null
  setting: GameMasterAgentSetting | null
  envFallbackAgentId: string | null
}

export interface BootstrapGameMasterAgentResult {
  setting: GameMasterAgentSetting
  record: CharacterRecord
  created: boolean
  adoptedEnv: boolean
}

export interface GameMasterKnowledgeDocumentWithSync extends KnowledgeDocumentSummary {
  syncState: ServiceAgentKnowledgeSyncState | null
}

export interface GameMasterAgentAdminState {
  effectiveSource: GameMasterAgentAdminEffectiveSource
  envFallback: {
    configured: boolean
    officialAgentId: string | null
  }
  activeSetting: GameMasterAgentSetting | null
  officialAgentId: string | null
  officialRecordStatus: {
    available: boolean
    error: string | null
  }
  aiCharacter: AICharacter | null
  knowledge: GameMasterKnowledgeDocumentWithSync[]
  canonicalContent: GameMasterCanonicalContentReview
}

export interface ServiceKnowledgeSyncResult {
  attempted: boolean
  ok: boolean
  state?: ServiceAgentKnowledgeSyncState
  error?: string
}

export interface UploadGameMasterKnowledgeInput {
  filename: string
  content: string
  mimeType?: string
}

export interface ApplyCanonicalGameMasterContentInput {
  persona?: boolean
  knowledge?: boolean
  expectedReviewToken: string
}

export interface ApplyCanonicalGameMasterContentResult {
  reviewBefore: GameMasterCanonicalContentReview
  reviewAfter: GameMasterCanonicalContentReview
  persona?: {
    applied: boolean
    changedFields: GameMasterCanonicalContentReview['persona']['changedFields']
    hash: string
  }
  knowledge?: {
    applied: boolean
    documentLimit: GameMasterCanonicalContentReview['knowledge']['documentLimit']
    documents: Array<{
      id: string
      path: string
      action: 'synced' | 'failed' | 'skipped'
      sync: ServiceKnowledgeSyncResult | null
    }>
  }
}

interface GameMasterAgentServiceDeps {
  settingsRepository?: GameMasterAgentSettingsRepository
  knowledgeSyncRepository?: ServiceAgentKnowledgeSyncStateRepository
  createClient?: () => WagdieElizaClient
  officialKnowledgeClient?: OfficialKnowledgeClient
}

const MAX_STORED_ERROR_LENGTH = 1000

export class GameMasterAgentConfigError extends Error {
  constructor() {
    super('Location room narrative mode requires an admin-managed game-master agent or ELIZA_LOCATION_ROOM_GAME_MASTER_AGENT_ID')
    this.name = 'GameMasterAgentConfigError'
  }
}

export class GameMasterAgentNotBootstrappedError extends Error {
  constructor() {
    super('Create or adopt a game-master agent before editing persona or knowledge')
    this.name = 'GameMasterAgentNotBootstrappedError'
  }
}

export class GameMasterKnowledgeValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GameMasterKnowledgeValidationError'
  }
}

function getEnvFallbackAgentId(): string | null {
  const value = elizaConfig.locationRooms.narrative.gameMasterAgentId.trim()
  return value || null
}

function isOfficialRecordNotFound(error: unknown): boolean {
  return error instanceof WagdieElizaError && error.statusCode === 404
}

function normalizeErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error && error.message.trim()
    ? error.message.trim()
    : typeof error === 'string' && error.trim()
      ? error.trim()
      : fallback

  return message.slice(0, MAX_STORED_ERROR_LENGTH)
}

function buildDefaultGameMasterCharacter() {
  return buildCanonicalGameMasterAgentCharacter()
}

function validateKnowledgeFile(input: UploadGameMasterKnowledgeInput): void {
  const extension = `.${input.filename.split('.').pop()?.toLowerCase() ?? ''}`
  const allowedExtensions: readonly string[] = GAME_MASTER_AGENT_KNOWLEDGE_ALLOWED_EXTENSIONS
  const allowedTypes: readonly string[] = GAME_MASTER_AGENT_KNOWLEDGE_ALLOWED_TYPES

  if (!allowedExtensions.includes(extension)) {
    throw new GameMasterKnowledgeValidationError('Game-master knowledge uploads support .txt and .md files only')
  }

  if (!allowedTypes.includes(input.mimeType ?? '')) {
    throw new GameMasterKnowledgeValidationError('Game-master knowledge uploads support text/plain and text/markdown only')
  }

  if (input.content.length > FIELD_LIMITS.maxKnowledgeSize) {
    throw new GameMasterKnowledgeValidationError(`File too large. Maximum size is ${FIELD_LIMITS.maxKnowledgeSize / 1024}KB`)
  }
}

function toAdminEffectiveSource(source: GameMasterAgentResolutionSource): GameMasterAgentAdminEffectiveSource {
  return source === 'database' ? 'admin' : source
}

function mergeKnowledgeWithSyncStates(
  documents: StoredKnowledgeDocument[],
  syncStates: ServiceAgentKnowledgeSyncState[]
): GameMasterKnowledgeDocumentWithSync[] {
  const syncByDocumentId = new Map(syncStates.map((state) => [state.documentId, state]))

  return documents.map((document) => ({
    ...toKnowledgeDocumentSummary(document),
    syncState: syncByDocumentId.get(document.id) ?? null,
  }))
}

function buildServiceKnowledgeSourcePointer(input: {
  document: StoredKnowledgeDocument
  officialAgentId: string
  contentHash: string
  canonical?: {
    bundleId: string
    contentVersion: string
    schemaVersion: number
    documentTitle?: string
  }
}): OfficialKnowledgeSourcePointer {
  return {
    serviceAgentKey: GAME_MASTER_AGENT_SETTING_KEY,
    documentId: input.document.id,
    officialAgentId: input.officialAgentId,
    path: input.document.path,
    contentHash: input.contentHash,
    version: input.canonical
      ? `${input.canonical.bundleId}@${input.canonical.contentVersion}:sha256:${input.contentHash}`
      : `sha256:${input.contentHash}`,
    ...(input.canonical
      ? {
          canonical: {
            ...input.canonical,
            documentId: input.document.id,
          },
        }
      : {}),
  }
}

function buildCanonicalApplyMetadata(input: {
  existing: Record<string, unknown>
  personaHash?: string
  knowledgeDocumentHashes?: Record<string, string>
  appliedAt: string
  actor?: string | null
}): Record<string, unknown> {
  const existingCanonical =
    input.existing.canonicalContent && typeof input.existing.canonicalContent === 'object' && !Array.isArray(input.existing.canonicalContent)
      ? input.existing.canonicalContent as Record<string, unknown>
      : {}

  return {
    ...input.existing,
    canonicalContent: {
      ...existingCanonical,
      schemaVersion: GAME_MASTER_CANONICAL_CONTENT.schemaVersion,
      bundleId: GAME_MASTER_CANONICAL_CONTENT.bundleId,
      contentVersion: GAME_MASTER_CANONICAL_CONTENT.contentVersion,
      ...(input.personaHash
        ? {
            persona: {
              hash: input.personaHash,
              appliedAt: input.appliedAt,
              appliedBy: input.actor ?? null,
            },
          }
        : {}),
      ...(input.knowledgeDocumentHashes
        ? {
            knowledge: {
              appliedAt: input.appliedAt,
              appliedBy: input.actor ?? null,
              documentHashes: input.knowledgeDocumentHashes,
            },
          }
        : {}),
    },
  }
}

export class GameMasterCanonicalReviewConflictError extends Error {
  constructor() {
    super('Canonical game-master content preview is stale; refresh and try again')
    this.name = 'GameMasterCanonicalReviewConflictError'
  }
}

async function recordKnowledgeSyncError(
  repository: ServiceAgentKnowledgeSyncStateRepository,
  params: {
    documentId: string
    officialAgentId?: string | null
    officialMemoryId?: string | null
    contentHash?: string | null
    sourcePointer?: Record<string, unknown>
  },
  error: unknown
): Promise<ServiceKnowledgeSyncResult> {
  const message = normalizeErrorMessage(error, 'Official ElizaOS service-agent knowledge sync failed')

  try {
    const state = await repository.upsert({
      serviceAgentKey: GAME_MASTER_AGENT_SETTING_KEY,
      documentId: params.documentId,
      officialAgentId: params.officialAgentId ?? null,
      officialMemoryId: params.officialMemoryId ?? null,
      contentHash: params.contentHash ?? null,
      sourcePointer: params.sourcePointer ?? {},
      status: 'error',
      lastError: message,
      lastSyncedAt: null,
      deletedAt: null,
    })

    return { attempted: true, ok: false, state, error: message }
  } catch (recordFailure) {
    console.error('[Game Master Agent] Failed to record knowledge sync error:', recordFailure)
    return { attempted: true, ok: false, error: message }
  }
}

export class GameMasterAgentService {
  private readonly settingsRepository: GameMasterAgentSettingsRepository
  private readonly knowledgeSyncRepository: ServiceAgentKnowledgeSyncStateRepository
  private readonly createClient: () => WagdieElizaClient
  private readonly officialKnowledgeClient?: OfficialKnowledgeClient

  constructor(deps: GameMasterAgentServiceDeps = {}) {
    this.settingsRepository = deps.settingsRepository ?? gameMasterAgentSettingsRepository
    this.knowledgeSyncRepository = deps.knowledgeSyncRepository ?? serviceAgentKnowledgeSyncStateRepository
    this.createClient = deps.createClient ?? createOfficialServerClient
    this.officialKnowledgeClient = deps.officialKnowledgeClient
  }

  async resolveActiveGameMasterAgent(): Promise<GameMasterAgentResolution> {
    const setting = await this.settingsRepository.findActive()
    const envFallbackAgentId = getEnvFallbackAgentId()

    if (setting) {
      return {
        source: 'database',
        officialAgentId: setting.officialAgentId,
        setting,
        envFallbackAgentId,
      }
    }

    if (envFallbackAgentId) {
      return {
        source: 'env',
        officialAgentId: envFallbackAgentId,
        setting: null,
        envFallbackAgentId,
      }
    }

    return {
      source: 'missing',
      officialAgentId: null,
      setting: null,
      envFallbackAgentId: null,
    }
  }

  async resolveRuntimeGameMasterAgentId(): Promise<string> {
    const resolution = await this.resolveActiveGameMasterAgent()
    if (!resolution.officialAgentId) {
      throw new GameMasterAgentConfigError()
    }

    try {
      await this.createClient().characters.getRecord(resolution.officialAgentId)
      return resolution.officialAgentId
    } catch (error) {
      if (!isOfficialRecordNotFound(error) || resolution.source !== 'database') {
        throw error
      }

      console.warn('[Game Master Agent] Active official record is missing; re-bootstrapping deterministic game-master agent', {
        officialAgentId: resolution.officialAgentId,
      })
      await this.settingsRepository.clearActive()
      const bootstrapped = await this.bootstrapGameMasterAgent('runtime-self-heal')
      return bootstrapped.record.id
    }
  }

  async clearActiveGameMasterAgentSetting(): Promise<void> {
    await this.settingsRepository.clearActive()
  }

  async getAdminGameMasterAgentState(): Promise<GameMasterAgentAdminState> {
    const resolution = await this.resolveActiveGameMasterAgent()
    const state: GameMasterAgentAdminState = {
      effectiveSource: toAdminEffectiveSource(resolution.source),
      envFallback: {
        configured: Boolean(resolution.envFallbackAgentId),
        officialAgentId: resolution.envFallbackAgentId,
      },
      activeSetting: resolution.setting,
      officialAgentId: resolution.officialAgentId,
      officialRecordStatus: {
        available: false,
        error: resolution.officialAgentId ? null : 'No game-master agent is configured',
      },
      aiCharacter: null,
      knowledge: [],
      canonicalContent: buildGameMasterCanonicalContentReview({
        setting: resolution.setting,
        record: null,
        syncStates: [],
      }),
    }

    if (!resolution.officialAgentId) {
      return state
    }

    let record: CharacterRecord
    try {
      record = await this.createClient().characters.getRecord(resolution.officialAgentId)
    } catch (error) {
      console.warn('[Game Master Agent] Failed to fetch official record for admin state:', error)
      return {
        ...state,
        officialRecordStatus: {
          available: false,
          error: 'Unable to fetch official game-master agent record',
        },
      }
    }

    const externalId = record.externalId ?? resolution.setting?.externalId ?? GAME_MASTER_AGENT_EXTERNAL_ID
    const documents = getKnowledgeDocuments(record.character as Record<string, unknown>)
    let syncStates: ServiceAgentKnowledgeSyncState[] = []
    let syncStateLookupFailed = false
    try {
      syncStates = await this.knowledgeSyncRepository.listByServiceAgent(GAME_MASTER_AGENT_SETTING_KEY)
    } catch (error) {
      syncStateLookupFailed = true
      console.warn('[Game Master Agent] Failed to fetch knowledge sync state for admin state:', error)
    }

    return {
      ...state,
      officialRecordStatus: {
        available: true,
        error: null,
      },
      aiCharacter: toAICharacterFromRecord(externalId, record),
      knowledge: mergeKnowledgeWithSyncStates(documents, syncStates),
      canonicalContent: buildGameMasterCanonicalContentReview({
        setting: resolution.setting,
        record,
        syncStates,
        syncStateLookupFailed,
      }),
    }
  }

  async bootstrapGameMasterAgent(actor?: string | null): Promise<BootstrapGameMasterAgentResult> {
    const existing = await this.settingsRepository.findActive()
    const client = this.createClient()

    if (existing) {
      const record = await client.characters.getRecord(existing.officialAgentId)
      return { setting: existing, record, created: false, adoptedEnv: existing.source === 'env_adopted' }
    }

    const now = new Date().toISOString()
    const envFallbackAgentId = getEnvFallbackAgentId()

    if (envFallbackAgentId) {
      let envRecord: CharacterRecord | null = null
      try {
        envRecord = await client.characters.getRecord(envFallbackAgentId)
      } catch (error) {
        console.warn('[Game Master Agent] Env fallback could not be resolved; falling back to deterministic service agent:', error)
      }

      if (envRecord) {
        const setting = await this.settingsRepository.upsertActive({
          officialAgentId: envRecord.id,
          externalId: envRecord.externalId,
          source: 'env_adopted',
          createdBy: actor ?? null,
          updatedBy: actor ?? null,
          lastValidatedAt: now,
          validationError: null,
          validationErrorAt: null,
          metadata: {
            adoptedFromEnv: 'ELIZA_LOCATION_ROOM_GAME_MASTER_AGENT_ID',
          },
        })

        return { setting, record: envRecord, created: false, adoptedEnv: true }
      }
    }

    const found = await client.characters.getRecordByExternalId(GAME_MASTER_AGENT_EXTERNAL_ID)
    if (found) {
      const setting = await this.settingsRepository.upsertActive({
        officialAgentId: found.id,
        externalId: found.externalId ?? GAME_MASTER_AGENT_EXTERNAL_ID,
        source: 'deterministic_created',
        createdBy: actor ?? null,
        updatedBy: actor ?? null,
        lastValidatedAt: now,
        validationError: null,
        validationErrorAt: null,
        metadata: {
          deterministicExternalId: GAME_MASTER_AGENT_EXTERNAL_ID,
          foundExisting: true,
        },
      })

      return { setting, record: found, created: false, adoptedEnv: false }
    }

    const record = await client.characters.createRecord({
      externalId: GAME_MASTER_AGENT_EXTERNAL_ID,
      character: buildDefaultGameMasterCharacter(),
    })
    const setting = await this.settingsRepository.upsertActive({
      officialAgentId: record.id,
      externalId: record.externalId ?? GAME_MASTER_AGENT_EXTERNAL_ID,
      source: 'deterministic_created',
      createdBy: actor ?? null,
      updatedBy: actor ?? null,
      lastValidatedAt: now,
      validationError: null,
      validationErrorAt: null,
      metadata: {
        deterministicExternalId: GAME_MASTER_AGENT_EXTERNAL_ID,
        foundExisting: false,
      },
    })

    return { setting, record, created: true, adoptedEnv: false }
  }

  async getActiveGameMasterRecord(): Promise<{ setting: GameMasterAgentSetting; record: CharacterRecord }> {
    const setting = await this.settingsRepository.findActive()
    if (!setting) {
      throw new GameMasterAgentNotBootstrappedError()
    }

    const record = await this.createClient().characters.getRecord(setting.officialAgentId)
    return { setting, record }
  }

  async getCanonicalGameMasterContentReview(): Promise<GameMasterCanonicalContentReview> {
    const setting = await this.settingsRepository.findActive()
    let record: CharacterRecord | null = null
    if (setting) {
      try {
        record = await this.createClient().characters.getRecord(setting.officialAgentId)
      } catch (error) {
        console.warn('[Game Master Agent] Failed to fetch official record for canonical content review:', error)
      }
    }

    let syncStates: ServiceAgentKnowledgeSyncState[] = []
    let syncStateLookupFailed = false
    try {
      syncStates = await this.knowledgeSyncRepository.listByServiceAgent(GAME_MASTER_AGENT_SETTING_KEY)
    } catch (error) {
      syncStateLookupFailed = true
      console.warn('[Game Master Agent] Failed to fetch knowledge sync state for canonical content review:', error)
    }

    return buildGameMasterCanonicalContentReview({
      setting,
      record,
      syncStates,
      syncStateLookupFailed,
    })
  }

  async applyCanonicalGameMasterContent(
    input: ApplyCanonicalGameMasterContentInput,
    actor?: string | null
  ): Promise<ApplyCanonicalGameMasterContentResult> {
    if (!input.persona && !input.knowledge) {
      throw new GameMasterKnowledgeValidationError('Choose canonical persona, knowledge, or both to apply')
    }

    const { setting, record } = await this.getActiveGameMasterRecord()
    const syncStates = await this.knowledgeSyncRepository
      .listByServiceAgent(GAME_MASTER_AGENT_SETTING_KEY)
      .catch((error) => {
        console.warn('[Game Master Agent] Failed to fetch knowledge sync state before canonical apply:', error)
        return [] as ServiceAgentKnowledgeSyncState[]
      })
    const reviewBefore = buildGameMasterCanonicalContentReview({
      setting,
      record,
      syncStates,
    })

    if (!input.expectedReviewToken || input.expectedReviewToken !== reviewBefore.reviewToken) {
      throw new GameMasterCanonicalReviewConflictError()
    }

    let currentSetting = setting
    let currentRecord = record
    const appliedAt = new Date().toISOString()
    const result: Omit<ApplyCanonicalGameMasterContentResult, 'reviewAfter'> = {
      reviewBefore,
    }

    if (input.persona) {
      const policyResult = validatePutCharacterSheetUpdate(GAME_MASTER_CANONICAL_CONTENT.persona)
      if (!policyResult.ok) {
        const error = new GameMasterKnowledgeValidationError('Canonical game-master persona failed validation')
        ;(error as Error & { issues?: unknown }).issues = policyResult.issues
        throw error
      }

      const update = policyResult.update as UpdateAICharacterInput
      const merged = applyWagdieUpdateToAgentCharacter(currentRecord.character, update)
      const mergedRecord = merged as Record<string, unknown>
      if (update.systemPrompt !== undefined) {
        if (update.systemPrompt === null) {
          delete mergedRecord.systemPrompt
        } else {
          mergedRecord.systemPrompt = update.systemPrompt
        }
      }
      currentRecord = await this.createClient().characters.replaceRecord(currentRecord.id, { character: merged })
      const personaHash = getCanonicalPersonaHash(GAME_MASTER_CANONICAL_CONTENT)
      currentSetting = await this.settingsRepository.upsertActive({
        officialAgentId: currentRecord.id,
        externalId: currentRecord.externalId ?? currentSetting.externalId,
        source: 'admin',
        createdBy: currentSetting.createdBy,
        updatedBy: actor ?? currentSetting.updatedBy,
        lastValidatedAt: appliedAt,
        validationError: null,
        validationErrorAt: null,
        metadata: buildCanonicalApplyMetadata({
          existing: currentSetting.metadata,
          personaHash,
          appliedAt,
          actor,
        }),
      })
      result.persona = {
        applied: true,
        changedFields: reviewBefore.persona.changedFields,
        hash: personaHash,
      }
    }

    if (input.knowledge) {
      if (reviewBefore.knowledge.documentLimit.conflict) {
        throw new GameMasterKnowledgeValidationError(`Canonical knowledge would exceed maximum ${FIELD_LIMITS.maxKnowledgeDocs} documents`)
      }

      const canonicalById = new Map(GAME_MASTER_CANONICAL_CONTENT.knowledge.map((document) => [document.id, document]))
      const currentKnowledge = getKnowledgeDocuments(currentRecord.character as Record<string, unknown>)
      const preservedKnowledge = currentKnowledge.filter((document) => !canonicalById.has(document.id))
      const canonicalKnowledge = GAME_MASTER_CANONICAL_CONTENT.knowledge.map(toStoredCanonicalKnowledgeDocument)
      const updatedKnowledge = [...preservedKnowledge, ...canonicalKnowledge]
      if (updatedKnowledge.length > FIELD_LIMITS.maxKnowledgeDocs) {
        throw new GameMasterKnowledgeValidationError(`Canonical knowledge would exceed maximum ${FIELD_LIMITS.maxKnowledgeDocs} documents`)
      }

      currentRecord = await replaceKnowledgeDocuments(
        currentRecord,
        updatedKnowledge,
        this.createClient()
      )

      const reviewById = new Map(reviewBefore.knowledge.documents.map((document) => [document.id, document]))
      const syncResults: NonNullable<ApplyCanonicalGameMasterContentResult['knowledge']>['documents'] = []
      for (const canonicalDocument of GAME_MASTER_CANONICAL_CONTENT.knowledge) {
        const document = toStoredCanonicalKnowledgeDocument(canonicalDocument)
        const reviewDocument = reviewById.get(canonicalDocument.id)
        if (!reviewDocument?.shouldSync) {
          syncResults.push({
            id: canonicalDocument.id,
            path: canonicalDocument.path,
            action: 'skipped',
            sync: null,
          })
          continue
        }

        const sync = await this.syncGameMasterKnowledgeDocumentToOfficial(currentRecord, document, {
          canonical: {
            bundleId: GAME_MASTER_CANONICAL_CONTENT.bundleId,
            contentVersion: GAME_MASTER_CANONICAL_CONTENT.contentVersion,
            schemaVersion: GAME_MASTER_CANONICAL_CONTENT.schemaVersion,
            documentTitle: canonicalDocument.title,
          },
        })
        syncResults.push({
          id: canonicalDocument.id,
          path: canonicalDocument.path,
          action: sync.ok ? 'synced' : 'failed',
          sync,
        })
      }

      const documentHashes = Object.fromEntries(
        GAME_MASTER_CANONICAL_CONTENT.knowledge.map((document) => [
          document.id,
          hashKnowledgeContent(document.content),
        ])
      )
      currentSetting = await this.settingsRepository.upsertActive({
        officialAgentId: currentRecord.id,
        externalId: currentRecord.externalId ?? currentSetting.externalId,
        source: 'admin',
        createdBy: currentSetting.createdBy,
        updatedBy: actor ?? currentSetting.updatedBy,
        lastValidatedAt: appliedAt,
        validationError: null,
        validationErrorAt: null,
        metadata: buildCanonicalApplyMetadata({
          existing: currentSetting.metadata,
          knowledgeDocumentHashes: documentHashes,
          appliedAt,
          actor,
        }),
      })

      result.knowledge = {
        applied: true,
        documentLimit: reviewBefore.knowledge.documentLimit,
        documents: syncResults,
      }
    }

    const reviewAfterSyncStates = await this.knowledgeSyncRepository
      .listByServiceAgent(GAME_MASTER_AGENT_SETTING_KEY)
      .catch(() => [] as ServiceAgentKnowledgeSyncState[])
    const reviewAfter = buildGameMasterCanonicalContentReview({
      setting: currentSetting,
      record: currentRecord,
      syncStates: reviewAfterSyncStates,
    })

    return {
      ...result,
      reviewAfter,
    }
  }

  async updateActiveGameMasterPersona(
    rawUpdate: unknown,
    actor?: string | null
  ): Promise<{ setting: GameMasterAgentSetting; record: CharacterRecord; aiCharacter: AICharacter }> {
    const policyResult = validatePutCharacterSheetUpdate(rawUpdate)
    if (!policyResult.ok) {
      const error = new GameMasterKnowledgeValidationError('Invalid game-master persona update payload')
      ;(error as Error & { issues?: unknown }).issues = policyResult.issues
      throw error
    }

    const { setting, record } = await this.getActiveGameMasterRecord()
    const update = policyResult.update as UpdateAICharacterInput
    const merged = applyWagdieUpdateToAgentCharacter(record.character, update)
    const updatedRecord = await this.createClient().characters.replaceRecord(record.id, { character: merged })
    const updatedSetting = await this.settingsRepository.upsertActive({
      officialAgentId: updatedRecord.id,
      externalId: updatedRecord.externalId ?? setting.externalId,
      source: 'admin',
      createdBy: setting.createdBy,
      updatedBy: actor ?? setting.updatedBy,
      lastValidatedAt: new Date().toISOString(),
      validationError: null,
      validationErrorAt: null,
      metadata: setting.metadata,
    })

    return {
      setting: updatedSetting,
      record: updatedRecord,
      aiCharacter: toAICharacterFromRecord(GAME_MASTER_AGENT_EXTERNAL_ID, updatedRecord),
    }
  }

  async listGameMasterKnowledgeDocuments(): Promise<GameMasterKnowledgeDocumentWithSync[]> {
    const { record } = await this.getActiveGameMasterRecord()
    const documents = getKnowledgeDocuments(record.character as Record<string, unknown>)
    const syncStates = await this.knowledgeSyncRepository.listByServiceAgent(GAME_MASTER_AGENT_SETTING_KEY)

    return mergeKnowledgeWithSyncStates(documents, syncStates)
  }

  async uploadGameMasterKnowledgeDocument(
    input: UploadGameMasterKnowledgeInput
  ): Promise<{ record: CharacterRecord; document: StoredKnowledgeDocument; sync: ServiceKnowledgeSyncResult }> {
    validateKnowledgeFile(input)

    const { record } = await this.getActiveGameMasterRecord()
    const currentKnowledge = getKnowledgeDocuments(record.character as Record<string, unknown>)
    if (currentKnowledge.length >= FIELD_LIMITS.maxKnowledgeDocs) {
      throw new GameMasterKnowledgeValidationError(`Maximum ${FIELD_LIMITS.maxKnowledgeDocs} documents allowed`)
    }

    const document: StoredKnowledgeDocument = {
      id: randomUUID(),
      path: input.filename,
      content: input.content,
    }

    const updatedRecord = await replaceKnowledgeDocuments(
      record,
      appendKnowledgeDocument(currentKnowledge, document),
      this.createClient()
    )
    const sync = await this.syncGameMasterKnowledgeDocumentToOfficial(updatedRecord, document)

    return { record: updatedRecord, document, sync }
  }

  async retryGameMasterKnowledgeSync(documentId: string): Promise<ServiceKnowledgeSyncResult> {
    const { record } = await this.getActiveGameMasterRecord()
    const document = findKnowledgeDocumentById(
      getKnowledgeDocuments(record.character as Record<string, unknown>),
      documentId
    )
    if (!document) {
      throw new GameMasterKnowledgeValidationError('Knowledge document not found')
    }

    return this.syncGameMasterKnowledgeDocumentToOfficial(record, document)
  }

  async deleteGameMasterKnowledgeDocument(
    documentId: string
  ): Promise<{ record: CharacterRecord; sync: ServiceKnowledgeSyncResult }> {
    const { record } = await this.getActiveGameMasterRecord()
    const currentKnowledge = getKnowledgeDocuments(record.character as Record<string, unknown>)
    const document = findKnowledgeDocumentById(currentKnowledge, documentId)
    if (!document) {
      throw new GameMasterKnowledgeValidationError('Knowledge document not found')
    }

    const sync = await this.deleteGameMasterKnowledgeDocumentFromOfficial(record, document)
    if (!sync.ok) {
      return { record, sync }
    }

    const updatedRecord = await replaceKnowledgeDocuments(
      record,
      removeKnowledgeDocumentById(currentKnowledge, documentId),
      this.createClient()
    )

    return { record: updatedRecord, sync }
  }

  async syncGameMasterKnowledgeDocumentToOfficial(
    record: CharacterRecord,
    document: StoredKnowledgeDocument,
    options: {
      canonical?: {
        bundleId: string
        contentVersion: string
        schemaVersion: number
        documentTitle?: string
      }
    } = {}
  ): Promise<ServiceKnowledgeSyncResult> {
    const content = document.content ?? ''
    const contentHash = hashKnowledgeContent(content)
    const previousState = await this.knowledgeSyncRepository
      .findByDocument(GAME_MASTER_AGENT_SETTING_KEY, document.id)
      .catch(() => null)
    let sourcePointer: OfficialKnowledgeSourcePointer | undefined

    try {
      sourcePointer = buildServiceKnowledgeSourcePointer({
        document,
        officialAgentId: record.id,
        contentHash,
        canonical: options.canonical,
      })

      await this.knowledgeSyncRepository.upsert({
        serviceAgentKey: GAME_MASTER_AGENT_SETTING_KEY,
        documentId: document.id,
        officialAgentId: record.id,
        officialMemoryId: previousState?.officialMemoryId ?? null,
        contentHash,
        sourcePointer,
        status: 'pending',
        lastError: null,
        lastSyncedAt: null,
        deletedAt: null,
      })

      const officialClient = this.officialKnowledgeClient ?? createOfficialKnowledgeClient()
      const response = await officialClient.indexDocument({
        serviceAgentKey: GAME_MASTER_AGENT_SETTING_KEY,
        documentId: document.id,
        officialAgentId: record.id,
        path: document.path,
        content,
        contentHash,
        sourcePointer,
      })

      const state = await this.knowledgeSyncRepository.upsert({
        serviceAgentKey: GAME_MASTER_AGENT_SETTING_KEY,
        documentId: document.id,
        officialAgentId: record.id,
        officialMemoryId: response.memoryId,
        contentHash,
        sourcePointer,
        status: 'indexed',
        lastError: null,
        lastSyncedAt: new Date().toISOString(),
        deletedAt: null,
      })

      return { attempted: true, ok: true, state }
    } catch (error) {
      return recordKnowledgeSyncError(
        this.knowledgeSyncRepository,
        {
          documentId: document.id,
          officialAgentId: record.id,
          officialMemoryId: previousState?.officialMemoryId ?? null,
          contentHash,
          sourcePointer,
        },
        error
      )
    }
  }

  async deleteGameMasterKnowledgeDocumentFromOfficial(
    record: CharacterRecord,
    document: StoredKnowledgeDocument
  ): Promise<ServiceKnowledgeSyncResult> {
    const contentHash = hashKnowledgeContent(document.content ?? '')

    try {
      const previousState = await this.knowledgeSyncRepository.findByDocument(
        GAME_MASTER_AGENT_SETTING_KEY,
        document.id
      )
      const officialAgentId = previousState?.officialAgentId ?? record.id
      const officialMemoryId = previousState?.officialMemoryId ?? null

      if (officialMemoryId) {
        const officialClient = this.officialKnowledgeClient ?? createOfficialKnowledgeClient()
        await officialClient.deleteDocument({
          serviceAgentKey: GAME_MASTER_AGENT_SETTING_KEY,
          documentId: document.id,
          officialAgentId,
          officialMemoryId,
          contentHash: previousState?.contentHash ?? contentHash,
        })
      }

      const state = await this.knowledgeSyncRepository.upsert({
        serviceAgentKey: GAME_MASTER_AGENT_SETTING_KEY,
        documentId: document.id,
        officialAgentId,
        officialMemoryId,
        contentHash: previousState?.contentHash ?? contentHash,
        sourcePointer:
          previousState?.sourcePointer ??
          buildServiceKnowledgeSourcePointer({
            document,
            officialAgentId,
            contentHash,
          }),
        status: 'deleted',
        lastError: null,
        lastSyncedAt: new Date().toISOString(),
        deletedAt: new Date().toISOString(),
      })

      return { attempted: true, ok: true, state }
    } catch (error) {
      const previousState = await this.knowledgeSyncRepository
        .findByDocument(GAME_MASTER_AGENT_SETTING_KEY, document.id)
        .catch(() => null)
      return recordKnowledgeSyncError(
        this.knowledgeSyncRepository,
        {
          documentId: document.id,
          officialAgentId: previousState?.officialAgentId ?? record.id,
          officialMemoryId: previousState?.officialMemoryId ?? null,
          contentHash: previousState?.contentHash ?? contentHash,
          sourcePointer: previousState?.sourcePointer ?? {},
        },
        error
      )
    }
  }
}

export const gameMasterAgentService = new GameMasterAgentService()
