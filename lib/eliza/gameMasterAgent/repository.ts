import { getSupabaseAdmin } from '@/lib/supabase'
import { GAME_MASTER_AGENT_SETTING_KEY } from './constants'

export type GameMasterAgentSettingSource = 'admin' | 'env_adopted' | 'deterministic_created'
export type ServiceAgentKnowledgeSyncStatus = 'pending' | 'indexed' | 'deleted' | 'error'

export interface GameMasterAgentSetting {
  settingKey: typeof GAME_MASTER_AGENT_SETTING_KEY
  officialAgentId: string
  externalId: string | null
  source: GameMasterAgentSettingSource
  createdBy: string | null
  updatedBy: string | null
  lastValidatedAt: string | null
  validationError: string | null
  validationErrorAt: string | null
  metadata: Record<string, unknown>
  createdAt?: string
  updatedAt?: string
}

export interface GameMasterAgentSettingUpsert {
  settingKey?: typeof GAME_MASTER_AGENT_SETTING_KEY
  officialAgentId: string
  externalId?: string | null
  source: GameMasterAgentSettingSource
  createdBy?: string | null
  updatedBy?: string | null
  lastValidatedAt?: string | null
  validationError?: string | null
  validationErrorAt?: string | null
  metadata?: Record<string, unknown>
}

export interface ServiceAgentKnowledgeSyncState {
  serviceAgentKey: string
  documentId: string
  officialAgentId: string | null
  officialMemoryId: string | null
  contentHash: string | null
  sourcePointer: Record<string, unknown>
  status: ServiceAgentKnowledgeSyncStatus
  lastError: string | null
  lastSyncedAt: string | null
  deletedAt: string | null
  createdAt?: string
  updatedAt?: string
}

export interface ServiceAgentKnowledgeSyncStateUpsert {
  serviceAgentKey: string
  documentId: string
  officialAgentId?: string | null
  officialMemoryId?: string | null
  contentHash?: string | null
  sourcePointer?: Record<string, unknown>
  status: ServiceAgentKnowledgeSyncStatus
  lastError?: string | null
  lastSyncedAt?: string | null
  deletedAt?: string | null
}

type SupabaseError = { code?: string; message: string }
type QueryResult<T> = { data: T | null; error: SupabaseError | null }

type GameMasterAgentSettingRow = {
  setting_key: typeof GAME_MASTER_AGENT_SETTING_KEY
  official_agent_id: string
  external_id: string | null
  source: GameMasterAgentSettingSource
  created_by: string | null
  updated_by: string | null
  last_validated_at: string | null
  validation_error: string | null
  validation_error_at: string | null
  metadata: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
}

type ServiceAgentKnowledgeSyncRow = {
  service_agent_key: string
  document_id: string
  official_agent_id: string | null
  official_memory_id: string | null
  content_hash: string | null
  source_pointer: Record<string, unknown> | null
  status: ServiceAgentKnowledgeSyncStatus
  last_error: string | null
  last_synced_at: string | null
  deleted_at: string | null
  created_at?: string
  updated_at?: string
}

const SETTINGS_TABLE = 'eliza_game_master_agent_settings'
const SERVICE_KNOWLEDGE_SYNC_TABLE = 'eliza_service_agent_knowledge_sync_states'
const SETTING_COLUMNS =
  'setting_key, official_agent_id, external_id, source, created_by, updated_by, last_validated_at, validation_error, validation_error_at, metadata, created_at, updated_at'
const SERVICE_KNOWLEDGE_SYNC_COLUMNS =
  'service_agent_key, document_id, official_agent_id, official_memory_id, content_hash, source_pointer, status, last_error, last_synced_at, deleted_at, created_at, updated_at'

function getAdminClient() {
  const client = getSupabaseAdmin()
  if (!client) {
    throw new Error('Supabase admin client not configured')
  }

  // Generated Supabase types may lag newest migrations.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client as any
}

// Generated Supabase types may lag newest migrations.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function table(name: string): any {
  return getAdminClient().from(name as never)
}

function mapSetting(row: GameMasterAgentSettingRow): GameMasterAgentSetting {
  return {
    settingKey: row.setting_key,
    officialAgentId: row.official_agent_id,
    externalId: row.external_id,
    source: row.source,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    lastValidatedAt: row.last_validated_at,
    validationError: row.validation_error,
    validationErrorAt: row.validation_error_at,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toSettingRow(input: GameMasterAgentSettingUpsert): Record<string, unknown> {
  return {
    setting_key: input.settingKey ?? GAME_MASTER_AGENT_SETTING_KEY,
    official_agent_id: input.officialAgentId,
    external_id: input.externalId ?? null,
    source: input.source,
    created_by: input.createdBy ?? null,
    updated_by: input.updatedBy ?? null,
    last_validated_at: input.lastValidatedAt ?? null,
    validation_error: input.validationError ?? null,
    validation_error_at: input.validationErrorAt ?? null,
    metadata: input.metadata ?? {},
  }
}

function mapServiceKnowledgeSync(row: ServiceAgentKnowledgeSyncRow): ServiceAgentKnowledgeSyncState {
  return {
    serviceAgentKey: row.service_agent_key,
    documentId: row.document_id,
    officialAgentId: row.official_agent_id,
    officialMemoryId: row.official_memory_id,
    contentHash: row.content_hash,
    sourcePointer: row.source_pointer ?? {},
    status: row.status,
    lastError: row.last_error,
    lastSyncedAt: row.last_synced_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toServiceKnowledgeSyncRow(input: ServiceAgentKnowledgeSyncStateUpsert): Record<string, unknown> {
  return {
    service_agent_key: input.serviceAgentKey,
    document_id: input.documentId,
    official_agent_id: input.officialAgentId ?? null,
    official_memory_id: input.officialMemoryId ?? null,
    content_hash: input.contentHash ?? null,
    source_pointer: input.sourcePointer ?? {},
    status: input.status,
    last_error: input.lastError ?? null,
    last_synced_at: input.lastSyncedAt ?? null,
    deleted_at: input.deletedAt ?? null,
  }
}

export interface GameMasterAgentSettingsRepository {
  findActive(): Promise<GameMasterAgentSetting | null>
  upsertActive(input: GameMasterAgentSettingUpsert): Promise<GameMasterAgentSetting>
  clearActive(): Promise<void>
}

export interface ServiceAgentKnowledgeSyncStateRepository {
  findByDocument(serviceAgentKey: string, documentId: string): Promise<ServiceAgentKnowledgeSyncState | null>
  listByServiceAgent(serviceAgentKey: string): Promise<ServiceAgentKnowledgeSyncState[]>
  upsert(input: ServiceAgentKnowledgeSyncStateUpsert): Promise<ServiceAgentKnowledgeSyncState>
}

export const gameMasterAgentSettingsRepository: GameMasterAgentSettingsRepository = {
  async findActive(): Promise<GameMasterAgentSetting | null> {
    const { data, error } = (await table(SETTINGS_TABLE)
      .select(SETTING_COLUMNS)
      .eq('setting_key', GAME_MASTER_AGENT_SETTING_KEY)
      .maybeSingle()) as QueryResult<GameMasterAgentSettingRow>

    if (error) throw new Error(error.message)
    return data ? mapSetting(data) : null
  },

  async upsertActive(input: GameMasterAgentSettingUpsert): Promise<GameMasterAgentSetting> {
    const { data, error } = (await table(SETTINGS_TABLE)
      .upsert(toSettingRow(input), { onConflict: 'setting_key' })
      .select(SETTING_COLUMNS)
      .single()) as QueryResult<GameMasterAgentSettingRow>

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Game-master agent setting upsert returned no row')
    return mapSetting(data)
  },

  async clearActive(): Promise<void> {
    const { error } = (await table(SETTINGS_TABLE)
      .delete()
      .eq('setting_key', GAME_MASTER_AGENT_SETTING_KEY)) as { error: SupabaseError | null }

    if (error) throw new Error(error.message)
  },
}

export const serviceAgentKnowledgeSyncStateRepository: ServiceAgentKnowledgeSyncStateRepository = {
  async findByDocument(
    serviceAgentKey: string,
    documentId: string
  ): Promise<ServiceAgentKnowledgeSyncState | null> {
    const { data, error } = (await table(SERVICE_KNOWLEDGE_SYNC_TABLE)
      .select(SERVICE_KNOWLEDGE_SYNC_COLUMNS)
      .eq('service_agent_key', serviceAgentKey)
      .eq('document_id', documentId)
      .maybeSingle()) as QueryResult<ServiceAgentKnowledgeSyncRow>

    if (error) throw new Error(error.message)
    return data ? mapServiceKnowledgeSync(data) : null
  },

  async listByServiceAgent(serviceAgentKey: string): Promise<ServiceAgentKnowledgeSyncState[]> {
    const { data, error } = (await table(SERVICE_KNOWLEDGE_SYNC_TABLE)
      .select(SERVICE_KNOWLEDGE_SYNC_COLUMNS)
      .eq('service_agent_key', serviceAgentKey)
      .order('updated_at', { ascending: false })) as QueryResult<ServiceAgentKnowledgeSyncRow[]>

    if (error) throw new Error(error.message)
    return (data ?? []).map(mapServiceKnowledgeSync)
  },

  async upsert(input: ServiceAgentKnowledgeSyncStateUpsert): Promise<ServiceAgentKnowledgeSyncState> {
    const { data, error } = (await table(SERVICE_KNOWLEDGE_SYNC_TABLE)
      .upsert(toServiceKnowledgeSyncRow(input), {
        onConflict: 'service_agent_key,document_id',
      })
      .select(SERVICE_KNOWLEDGE_SYNC_COLUMNS)
      .single()) as QueryResult<ServiceAgentKnowledgeSyncRow>

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Service-agent knowledge sync state upsert returned no row')
    return mapServiceKnowledgeSync(data)
  },
}
