import { getSupabaseAdmin } from '../supabase'

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>

export type MaterializationStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'

export type SearingEventMaterializationRow = {
  id: string
  token_id: number
  concord_id: number
  event_type: 'sear' | 'tame'
  transaction_hash: string
  block_number: number
  log_index: number
  actor_address: string | null
  event_timestamp: string | null
  metadata: Record<string, unknown>
  created_at: string
  materialization_status: MaterializationStatus
  materialization_attempts: number
  materialization_error: string | null
  materialized_at: string | null
  seared_image_url: string | null
  materialization_metadata: Record<string, unknown>
}

export type SearingEventInsert = {
  token_id: number
  concord_id: number
  event_type: 'sear' | 'tame'
  transaction_hash: string
  block_number: number
  log_index: number
  actor_address: string | null
  event_timestamp?: string | null
  metadata?: Record<string, unknown>
}

export type ClaimResult =
  | { claimed: true; event: SearingEventMaterializationRow }
  | { claimed: false; reason: 'not_found' | 'completed' | 'processing' | 'not_retryable'; event?: SearingEventMaterializationRow }

function requireAdminClient(): SupabaseAdminClient {
  const client = getSupabaseAdmin()
  if (!client) {
    throw new Error('Supabase admin client not configured')
  }
  return client
}

function normalizeRow(row: unknown): SearingEventMaterializationRow {
  return row as SearingEventMaterializationRow
}

type UntypedQueryResult<T = unknown> = Promise<{
  data: T | null
  error: { message: string } | null
  count?: number | null
}>

type UntypedQueryBuilder = {
  select: (...args: unknown[]) => UntypedQueryBuilder
  eq: (...args: unknown[]) => UntypedQueryBuilder
  in: (...args: unknown[]) => UntypedQueryBuilder
  order: (...args: unknown[]) => UntypedQueryBuilder
  limit: (...args: unknown[]) => UntypedQueryBuilder
  insert: (...args: unknown[]) => UntypedQueryBuilder
  update: (...args: unknown[]) => UntypedQueryBuilder
  maybeSingle: () => UntypedQueryResult
  single: () => UntypedQueryResult
  then: UntypedQueryResult<unknown[]>['then']
}

function fromTable(client: SupabaseAdminClient, tableName: string): UntypedQueryBuilder {
  return client.from(tableName as never) as unknown as UntypedQueryBuilder
}

export class SearingEventRepository {
  constructor(private readonly getClient: () => SupabaseAdminClient = requireAdminClient) {}

  async findById(id: string): Promise<SearingEventMaterializationRow | null> {
    const { data, error } = await fromTable(this.getClient(), 'searing_events')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to fetch searing event ${id}: ${error.message}`)
    }

    return data ? normalizeRow(data) : null
  }

  async findByTransactionAndLog(
    transactionHash: string,
    logIndex: number
  ): Promise<SearingEventMaterializationRow | null> {
    const { data, error } = await fromTable(this.getClient(), 'searing_events')
      .select('*')
      .eq('transaction_hash', transactionHash.toLowerCase())
      .eq('log_index', logIndex)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to fetch searing event ${transactionHash}:${logIndex}: ${error.message}`)
    }

    return data ? normalizeRow(data) : null
  }

  async findLatestForToken(tokenId: number): Promise<SearingEventMaterializationRow | null> {
    const { data, error } = await fromTable(this.getClient(), 'searing_events')
      .select('*')
      .eq('token_id', tokenId)
      .eq('event_type', 'sear')
      .order('block_number', { ascending: false })
      .order('log_index', { ascending: false })
      .limit(1)

    if (error) {
      throw new Error(`Failed to fetch latest searing event for token ${tokenId}: ${error.message}`)
    }

    const rows = (data || []) as unknown[]
    return rows[0] ? normalizeRow(rows[0]) : null
  }

  async insertIfMissing(input: SearingEventInsert): Promise<SearingEventMaterializationRow> {
    const existing = await this.findByTransactionAndLog(input.transaction_hash, input.log_index)
    if (existing) return existing

    const insertPayload = {
      ...input,
      transaction_hash: input.transaction_hash.toLowerCase(),
      event_timestamp: input.event_timestamp ?? null,
      metadata: input.metadata ?? {},
    }

    const { data, error } = await fromTable(this.getClient(), 'searing_events')
      .insert(insertPayload)
      .select('*')
      .single()

    if (!error && data) {
      return normalizeRow(data)
    }

    const raced = await this.findByTransactionAndLog(input.transaction_hash, input.log_index)
    if (raced) return raced

    throw new Error(`Failed to insert searing event: ${error?.message || 'unknown error'}`)
  }

  async claimForMaterialization(id: string, options: { retryFailed?: boolean; includeCompleted?: boolean } = {}): Promise<ClaimResult> {
    const existing = await this.findById(id)
    if (!existing) return { claimed: false, reason: 'not_found' }

    if (existing.materialization_status === 'completed' && !options.includeCompleted) {
      return { claimed: false, reason: 'completed', event: existing }
    }

    if (existing.materialization_status === 'processing' && !options.retryFailed) {
      return { claimed: false, reason: 'processing', event: existing }
    }

    const eligibleStatuses: MaterializationStatus[] = ['pending']
    if (options.retryFailed) eligibleStatuses.push('processing')
    if (options.retryFailed) eligibleStatuses.push('failed')
    if (options.includeCompleted) eligibleStatuses.push('completed')

    if (!eligibleStatuses.includes(existing.materialization_status)) {
      return { claimed: false, reason: 'not_retryable', event: existing }
    }

    const { data, error } = await fromTable(this.getClient(), 'searing_events')
      .update({
        materialization_status: 'processing',
        materialization_attempts: (existing.materialization_attempts || 0) + 1,
        materialization_error: null,
      })
      .eq('id', id)
      .in('materialization_status', eligibleStatuses)
      .select('*')
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to claim searing event ${id}: ${error.message}`)
    }

    if (!data) {
      const latest = await this.findById(id)
      return {
        claimed: false,
        reason: latest?.materialization_status === 'processing' ? 'processing' : 'not_retryable',
        ...(latest ? { event: latest } : {}),
      }
    }

    return { claimed: true, event: normalizeRow(data) }
  }

  async findCompletedForTokens(tokenIds: number[]): Promise<SearingEventMaterializationRow[]> {
    if (tokenIds.length === 0) return []

    const { data, error } = await fromTable(this.getClient(), 'searing_events')
      .select('*')
      .eq('event_type', 'sear')
      .eq('materialization_status', 'completed')
      .in('token_id', tokenIds)
      .order('block_number', { ascending: false })
      .order('log_index', { ascending: false })

    if (error) {
      throw new Error(`Failed to fetch completed searing events: ${error.message}`)
    }

    return ((data || []) as unknown[]).map(normalizeRow)
  }

  async updateCompletedImage(
    id: string,
    searedImageUrl: string,
    metadata: Record<string, unknown>
  ): Promise<SearingEventMaterializationRow> {
    const { data, error } = await fromTable(this.getClient(), 'searing_events')
      .update({
        seared_image_url: searedImageUrl,
        materialization_metadata: metadata,
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      throw new Error(`Failed to update completed searing event ${id}: ${error.message}`)
    }

    return normalizeRow(data)
  }

  async markCompleted(
    id: string,
    searedImageUrl: string,
    metadata: Record<string, unknown>
  ): Promise<SearingEventMaterializationRow> {
    const { data, error } = await fromTable(this.getClient(), 'searing_events')
      .update({
        materialization_status: 'completed',
        materialization_error: null,
        materialized_at: new Date().toISOString(),
        seared_image_url: searedImageUrl,
        materialization_metadata: metadata,
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      throw new Error(`Failed to mark searing event ${id} completed: ${error.message}`)
    }

    return normalizeRow(data)
  }

  async markSkipped(id: string, reason: string, metadata: Record<string, unknown> = {}): Promise<SearingEventMaterializationRow> {
    const { data, error } = await fromTable(this.getClient(), 'searing_events')
      .update({
        materialization_status: 'skipped',
        materialization_error: reason,
        materialized_at: new Date().toISOString(),
        materialization_metadata: metadata,
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      throw new Error(`Failed to mark searing event ${id} skipped: ${error.message}`)
    }

    return normalizeRow(data)
  }

  async markFailed(id: string, errorMessage: string, metadata: Record<string, unknown> = {}): Promise<SearingEventMaterializationRow> {
    const { data, error } = await fromTable(this.getClient(), 'searing_events')
      .update({
        materialization_status: 'failed',
        materialization_error: errorMessage,
        materialization_metadata: metadata,
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      throw new Error(`Failed to mark searing event ${id} failed: ${error.message}`)
    }

    return normalizeRow(data)
  }

  async findPending(options: {
    limit: number
    includeFailed?: boolean
    tokenIds?: number[]
  }): Promise<SearingEventMaterializationRow[]> {
    const statuses: MaterializationStatus[] = ['pending']
    if (options.includeFailed) statuses.push('failed')

    let query = fromTable(this.getClient(), 'searing_events')
      .select('*')
      .eq('event_type', 'sear')
      .in('materialization_status', statuses)
      .order('created_at', { ascending: true })
      .limit(options.limit)

    if (options.tokenIds && options.tokenIds.length > 0) {
      query = query.in('token_id', options.tokenIds)
    }

    const { data, error } = await query
    if (error) {
      throw new Error(`Failed to fetch pending searing events: ${error.message}`)
    }

    return ((data || []) as unknown[]).map(normalizeRow)
  }
}

export const searingEventRepository = new SearingEventRepository()
