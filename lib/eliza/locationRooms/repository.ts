import { getSupabaseAdmin } from '@/lib/supabase'
import { normalizeLocationMetadata } from '@/lib/domain/location/metadata'
import {
  createOfficialLocationRoomId,
  createOfficialLocationServiceUserId,
  createOfficialLocationWorldId,
  normalizeOfficialLocationId,
} from '@/lib/eliza/official/ids'
import type {
  LocationRoom,
  LocationRoomLocation,
  LocationRoomLocationDetails,
  LocationRoomMessage,
  LocationRoomPublicAuthorMessageStats,
  LocationRoomPublicMessageStats,
  LocationRoomTick,
  LocationRoomTriggerType,
  LocationRoomTurnIntent,
  PaginatedLocationRoomMessages,
} from './types'

const ROOMS_TABLE = 'eliza_location_rooms'
const MESSAGES_TABLE = 'eliza_location_room_messages'
const TICKS_TABLE = 'eliza_location_room_ticks'
const GAMEPLAY_TURNS_TABLE = 'eliza_location_room_gameplay_turns'

const ROOM_COLUMNS =
  'id, location_id, official_room_id, official_world_id, official_user_id, channel_id, tick_enabled, last_tick_at, next_tick_at, tick_count, last_error, created_at, updated_at'
const MESSAGE_COLUMNS =
  'id, room_id, location_id, tick_id, sequence, visibility, author_kind, token_id, official_agent_id, author_name, content, metadata, created_at'
const TICK_COLUMNS =
  'id, room_id, location_id, gameplay_run_id, turn_intent, trigger_type, requested_by_wallet, requested_by_token_id, status, attempts, next_attempt_at, locked_at, locked_by, selected_token_id, started_at, completed_at, last_error, created_at, updated_at'
const WORKER_LOCK_TTL_MS = 15 * 60_000

type SupabaseError = { code?: string; message: string }
type QueryResult<T> = { data: T | null; error: SupabaseError | null; count?: number | null }

type RoomRow = {
  id: string
  location_id: string
  official_room_id: string
  official_world_id: string
  official_user_id: string
  channel_id: string
  tick_enabled: boolean
  last_tick_at: string | null
  next_tick_at: string | null
  tick_count: number
  last_error: string | null
  created_at: string
  updated_at: string
}

type LocationRow = {
  id: string
  name: string
}

type LocationDetailsRow = {
  id: string
  name: string
  chain_location_id: number | string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at?: string | null
}

type MessageRow = {
  id: string
  room_id: string
  location_id: string
  tick_id: string | null
  sequence: number
  visibility: LocationRoomMessage['visibility']
  author_kind: LocationRoomMessage['authorKind']
  token_id: number | null
  official_agent_id: string | null
  author_name: string
  content: string
  metadata: Record<string, unknown> | null
  created_at: string
}

type TickRow = {
  id: string
  room_id: string
  location_id: string
  gameplay_run_id: string | null
  turn_intent: LocationRoomTurnIntent | null
  trigger_type: LocationRoomTriggerType
  requested_by_wallet: string | null
  requested_by_token_id: number | null
  status: LocationRoomTick['status']
  attempts: number
  next_attempt_at: string
  locked_at: string | null
  locked_by: string | null
  selected_token_id: number | null
  started_at: string | null
  completed_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

function getAdminClient() {
  const client = getSupabaseAdmin()
  if (!client) {
    throw new Error('Supabase admin client not configured')
  }

  return client as any
}

function table(name: string): any {
  return getAdminClient().from(name as never)
}

function rpc(name: string, args: Record<string, unknown>): any {
  return getAdminClient().rpc(name, args)
}

function mapRoom(row: RoomRow): LocationRoom {
  return {
    id: row.id,
    locationId: row.location_id,
    officialRoomId: row.official_room_id,
    officialWorldId: row.official_world_id,
    officialUserId: row.official_user_id,
    channelId: row.channel_id,
    tickEnabled: row.tick_enabled,
    lastTickAt: row.last_tick_at,
    nextTickAt: row.next_tick_at,
    tickCount: row.tick_count,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function resolveLocationActiveState(metadata: Record<string, unknown> | null): boolean | null {
  if (!metadata || typeof metadata !== 'object') return null
  const value = metadata.active ?? metadata.isActive ?? metadata.is_active ?? metadata.enabled
  if (typeof value === 'boolean') return value
  if (metadata.hidden === true || metadata.deactivated === true || metadata.disabled === true) return false
  return null
}

function mapLocationDetails(row: LocationDetailsRow): LocationRoomLocationDetails {
  const metadata = normalizeLocationMetadata(row.metadata)
  return {
    id: row.id,
    name: row.name,
    chainLocationId: row.chain_location_id === null ? null : String(row.chain_location_id),
    active: resolveLocationActiveState(metadata),
    metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  }
}

function mapMessage(row: MessageRow): LocationRoomMessage {
  return {
    id: row.id,
    roomId: row.room_id,
    locationId: row.location_id,
    tickId: row.tick_id,
    sequence: Number(row.sequence),
    visibility: row.visibility,
    authorKind: row.author_kind,
    tokenId: row.token_id,
    officialAgentId: row.official_agent_id,
    authorName: row.author_name,
    content: row.content,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }
}

function mapTick(row: TickRow): LocationRoomTick {
  return {
    id: row.id,
    roomId: row.room_id,
    locationId: row.location_id,
    gameplayRunId: row.gameplay_run_id,
    turnIntent: row.turn_intent ?? 'auto',
    triggerType: row.trigger_type,
    requestedByWallet: row.requested_by_wallet,
    requestedByTokenId: row.requested_by_token_id,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
    selectedTokenId: row.selected_token_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function isUniqueViolation(error: SupabaseError | null): boolean {
  if (!error) return false
  return error.code === '23505' || /duplicate key|unique constraint/i.test(error.message)
}

function isNoRowsReturned(error: SupabaseError | null): boolean {
  if (!error) return false
  return error.code === 'PGRST116' || /0 rows|no rows|multiple \(or no\) rows/i.test(error.message)
}

function addMinutes(date: Date, minutes: number): string {
  return new Date(date.getTime() + minutes * 60_000).toISOString()
}

function buildRoomInsert(locationId: string) {
  const normalizedLocationId = normalizeOfficialLocationId(locationId)
  return {
    location_id: locationId,
    official_room_id: createOfficialLocationRoomId(locationId),
    official_world_id: createOfficialLocationWorldId(locationId),
    official_user_id: createOfficialLocationServiceUserId(locationId),
    channel_id: `wagdie-location-${normalizedLocationId}`,
    tick_enabled: true,
  }
}

function normalizeMessageMetadata(input: CreateLocationRoomMessageInput): {
  metadata: Record<string, unknown>
  dedupeKey: string | null
} {
  const dedupeKey = input.dedupeKey?.trim() || null
  const metadata = dedupeKey
    ? { ...(input.metadata ?? {}), dedupeKey }
    : { ...(input.metadata ?? {}) }
  if (!dedupeKey) {
    delete metadata.dedupeKey
  }

  return { metadata, dedupeKey }
}

function buildBatchMessagePayload(input: CreateLocationRoomMessageInput): Record<string, unknown> {
  const { metadata, dedupeKey } = normalizeMessageMetadata(input)

  return {
    room_id: input.roomId,
    location_id: input.locationId,
    tick_id: input.tickId ?? null,
    visibility: input.visibility ?? 'public',
    author_kind: input.authorKind,
    token_id: input.tokenId ?? null,
    official_agent_id: input.officialAgentId ?? null,
    author_name: input.authorName,
    content: input.content,
    metadata,
    dedupeKey,
  }
}

function normalizeRpcRows(data: unknown): MessageRow[] {
  if (Array.isArray(data)) return data as MessageRow[]
  if (typeof data === 'string') {
    const parsed = JSON.parse(data) as unknown
    if (Array.isArray(parsed)) return parsed as MessageRow[]
  }
  throw new Error('Location room message batch RPC returned an invalid payload')
}

export type CreateLocationRoomMessageInput = {
  roomId: string
  locationId: string
  tickId?: string | null
  authorKind: LocationRoomMessage['authorKind']
  tokenId?: number | null
  officialAgentId?: string | null
  authorName: string
  content: string
  visibility?: LocationRoomMessage['visibility']
  metadata?: Record<string, unknown>
  dedupeKey?: string | null
}

export interface LocationRoomRepository {
  getLocation(locationId: string): Promise<LocationRoomLocation | null>
  getLocationDetails(locationId: string): Promise<LocationRoomLocationDetails | null>
  listLocationsByIds(locationIds: string[]): Promise<LocationRoomLocationDetails[]>
  findRoomById(roomId: string): Promise<LocationRoom | null>
  findRoomByLocationId(locationId: string): Promise<LocationRoom | null>
  ensureRoomForLocation(locationId: string): Promise<LocationRoom>
  deleteRoomById(roomId: string): Promise<void>
  listDueRooms(now: Date, limit: number, locationIds?: string[]): Promise<LocationRoom[]>
  enqueueTick(input: {
    room: LocationRoom
    triggerType: LocationRoomTriggerType
    requestedByWallet?: string | null
    requestedByTokenId?: number | null
    gameplayRunId?: string | null
    turnIntent?: LocationRoomTurnIntent
    nextAttemptAt?: Date | string | null
  }): Promise<{ tick: LocationRoomTick | null; deduped: boolean }>
  promoteOpenTickIntent(input: { tickId: string; roomId: string; turnIntent: LocationRoomTurnIntent }): Promise<LocationRoomTick | null>
  attachTickToGameplayRun(input: { tickId: string; roomId: string; gameplayRunId: string }): Promise<LocationRoomTick | null>
  countCompletedGameplayTurnsForRun(gameplayRunId: string): Promise<number>
  findOpenTickForRoom(roomId: string): Promise<LocationRoomTick | null>
  findRecentCompletedOwnerTick(params: { roomId: string; walletAddress: string; since: Date }): Promise<LocationRoomTick | null>
  findOldestProcessableTickForRoom(roomId: string, now: Date): Promise<LocationRoomTick | null>
  findNonStaleProcessingTickForRoom(roomId: string, now: Date): Promise<LocationRoomTick | null>
  claimTick(tickId: string, workerId: string, now: Date): Promise<LocationRoomTick | null>
  claimDueTicks(limit: number, workerId: string, now: Date, locationIds?: string[]): Promise<LocationRoomTick[]>
  listActiveTicksForRoom(roomId: string, limit: number): Promise<LocationRoomTick[]>
  listRecentTicksForRoom(roomId: string, limit: number): Promise<LocationRoomTick[]>
  getPublicMessageStats(roomId: string): Promise<LocationRoomPublicMessageStats>
  getPublicAuthorMessageStats(roomId: string): Promise<LocationRoomPublicAuthorMessageStats>
  markTickSelected(tickId: string, tokenId: number): Promise<LocationRoomTick>
  appendMessage(input: CreateLocationRoomMessageInput): Promise<LocationRoomMessage>
  appendMessagesBatch(inputs: CreateLocationRoomMessageInput[]): Promise<LocationRoomMessage[]>
  markTickCompleted(tickId: string): Promise<LocationRoomTick>
  markTickSkipped(tickId: string, reason: string): Promise<LocationRoomTick>
  markTickFailed(tickId: string, error: string, nextAttemptAt: string): Promise<LocationRoomTick>
  markTickDead(tickId: string, error: string): Promise<LocationRoomTick>
  updateRoomAfterProcessedTick(room: LocationRoom, params: { tickIntervalMinutes: number; now: Date }): Promise<LocationRoom>
  recordRoomError(roomId: string, error: string): Promise<void>
  listPublicMessages(params: { roomId: string; page: number; pageSize: number }): Promise<PaginatedLocationRoomMessages>
  listRecentPublicMessages(roomId: string, limit: number): Promise<LocationRoomMessage[]>
}

export class SupabaseLocationRoomRepository implements LocationRoomRepository {
  async getLocation(locationId: string): Promise<LocationRoomLocation | null> {
    const { data, error } = (await table('locations')
      .select('id, name')
      .eq('id', locationId)
      .maybeSingle()) as QueryResult<LocationRow>

    if (error) throw new Error(error.message)
    return data ? { id: data.id, name: data.name } : null
  }

  async getLocationDetails(locationId: string): Promise<LocationRoomLocationDetails | null> {
    const { data, error } = (await table('locations')
      .select('id, name, chain_location_id, metadata, created_at')
      .eq('id', locationId)
      .maybeSingle()) as QueryResult<LocationDetailsRow>

    if (error) throw new Error(error.message)
    return data ? mapLocationDetails(data) : null
  }

  async listLocationsByIds(locationIds: string[]): Promise<LocationRoomLocationDetails[]> {
    const ids = Array.from(new Set(locationIds.map((id) => id.trim()).filter(Boolean)))
    if (ids.length === 0) return []

    const { data, error } = (await table('locations')
      .select('id, name, chain_location_id, metadata, created_at')
      .in('id', ids)) as QueryResult<LocationDetailsRow[]>

    if (error) throw new Error(error.message)
    return (data ?? []).map(mapLocationDetails)
  }

  async findRoomById(roomId: string): Promise<LocationRoom | null> {
    const { data, error } = (await table(ROOMS_TABLE)
      .select(ROOM_COLUMNS)
      .eq('id', roomId)
      .maybeSingle()) as QueryResult<RoomRow>

    if (error) throw new Error(error.message)
    return data ? mapRoom(data) : null
  }

  async findRoomByLocationId(locationId: string): Promise<LocationRoom | null> {
    const { data, error } = (await table(ROOMS_TABLE)
      .select(ROOM_COLUMNS)
      .eq('location_id', locationId)
      .maybeSingle()) as QueryResult<RoomRow>

    if (error) throw new Error(error.message)
    return data ? mapRoom(data) : null
  }

  async ensureRoomForLocation(locationId: string): Promise<LocationRoom> {
    const existing = await this.findRoomByLocationId(locationId)
    if (existing) return existing

    const { data, error } = (await table(ROOMS_TABLE)
      .insert(buildRoomInsert(locationId))
      .select(ROOM_COLUMNS)
      .single()) as QueryResult<RoomRow>

    if (isUniqueViolation(error)) {
      const raced = await this.findRoomByLocationId(locationId)
      if (raced) return raced
    }

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Location room insert returned no row')
    return mapRoom(data)
  }

  async deleteRoomById(roomId: string): Promise<void> {
    const { error } = (await table(ROOMS_TABLE)
      .delete()
      .eq('id', roomId)) as QueryResult<null>

    if (error) throw new Error(error.message)
  }

  async listDueRooms(now: Date, limit: number, locationIds: string[] = []): Promise<LocationRoom[]> {
    let query = table(ROOMS_TABLE)
      .select(ROOM_COLUMNS)
      .eq('tick_enabled', true)
      .or(`next_tick_at.is.null,next_tick_at.lte.${now.toISOString()}`)

    if (locationIds.length > 0) {
      query = query.in('location_id', locationIds)
    }

    const { data, error } = (await query
      .order('next_tick_at', { ascending: true, nullsFirst: true })
      .limit(limit)) as QueryResult<RoomRow[]>

    if (error) throw new Error(error.message)
    return (data ?? []).map(mapRoom)
  }

  async enqueueTick(input: {
    room: LocationRoom
    triggerType: LocationRoomTriggerType
    requestedByWallet?: string | null
    requestedByTokenId?: number | null
    gameplayRunId?: string | null
    turnIntent?: LocationRoomTurnIntent
    nextAttemptAt?: Date | string | null
  }): Promise<{ tick: LocationRoomTick | null; deduped: boolean }> {
    const { data, error } = (await table(TICKS_TABLE)
      .insert({
        room_id: input.room.id,
        location_id: input.room.locationId,
        trigger_type: input.triggerType,
        turn_intent: input.turnIntent ?? 'auto',
        requested_by_wallet: input.requestedByWallet?.trim().toLowerCase() || null,
        requested_by_token_id: input.requestedByTokenId ?? null,
        gameplay_run_id: input.gameplayRunId ?? null,
        status: 'pending',
        ...(input.nextAttemptAt
          ? { next_attempt_at: input.nextAttemptAt instanceof Date ? input.nextAttemptAt.toISOString() : input.nextAttemptAt }
          : {}),
      })
      .select(TICK_COLUMNS)
      .single()) as QueryResult<TickRow>

    if (isUniqueViolation(error)) return { tick: null, deduped: true }
    if (error) throw new Error(error.message)
    if (!data) throw new Error('Location room tick insert returned no row')
    return { tick: mapTick(data), deduped: false }
  }

  async promoteOpenTickIntent(input: { tickId: string; roomId: string; turnIntent: LocationRoomTurnIntent }): Promise<LocationRoomTick | null> {
    const { data, error } = (await table(TICKS_TABLE)
      .update({ turn_intent: input.turnIntent })
      .eq('id', input.tickId)
      .eq('room_id', input.roomId)
      .in('status', ['pending', 'failed'])
      .select(TICK_COLUMNS)
      .maybeSingle()) as QueryResult<TickRow>

    if (error && !isNoRowsReturned(error)) throw new Error(error.message)
    return data ? mapTick(data) : null
  }

  async attachTickToGameplayRun(input: { tickId: string; roomId: string; gameplayRunId: string }): Promise<LocationRoomTick | null> {
    const { data, error } = (await table(TICKS_TABLE)
      .update({ gameplay_run_id: input.gameplayRunId })
      .eq('id', input.tickId)
      .eq('room_id', input.roomId)
      .is('gameplay_run_id', null)
      .in('status', ['pending', 'processing', 'failed'])
      .select(TICK_COLUMNS)
      .maybeSingle()) as QueryResult<TickRow>

    if (error && !isNoRowsReturned(error)) throw new Error(error.message)
    return data ? mapTick(data) : null
  }

  async countCompletedGameplayTurnsForRun(gameplayRunId: string): Promise<number> {
    const { error, count } = (await table(GAMEPLAY_TURNS_TABLE)
      .select('id, eliza_location_room_ticks!inner(status, gameplay_run_id)', { count: 'exact', head: true })
      .eq('status', 'completed')
      .eq('eliza_location_room_ticks.status', 'completed')
      .eq('eliza_location_room_ticks.gameplay_run_id', gameplayRunId)) as QueryResult<null>

    if (error) throw new Error(error.message)
    return count ?? 0
  }

  async findOpenTickForRoom(roomId: string): Promise<LocationRoomTick | null> {
    const { data, error } = (await table(TICKS_TABLE)
      .select(TICK_COLUMNS)
      .eq('room_id', roomId)
      .in('status', ['pending', 'processing', 'failed'])
      .order('created_at', { ascending: true })
      .limit(1)) as QueryResult<TickRow[]>

    if (error) throw new Error(error.message)
    const tick = data?.[0]
    return tick ? mapTick(tick) : null
  }

  async findRecentCompletedOwnerTick(params: { roomId: string; walletAddress: string; since: Date }): Promise<LocationRoomTick | null> {
    const normalizedWallet = params.walletAddress.trim().toLowerCase()
    if (!normalizedWallet) return null

    const { data, error } = (await table(TICKS_TABLE)
      .select(TICK_COLUMNS)
      .eq('room_id', params.roomId)
      .eq('trigger_type', 'owner')
      .eq('requested_by_wallet', normalizedWallet)
      .gte('created_at', params.since.toISOString())
      .order('created_at', { ascending: false })
      .limit(5)) as QueryResult<TickRow[]>

    if (error) throw new Error(error.message)

    const recentCompleted = (data ?? []).find(
      (row) => row.status !== 'pending' && row.status !== 'processing'
    )

    return recentCompleted ? mapTick(recentCompleted) : null
  }

  async findOldestProcessableTickForRoom(roomId: string, now: Date): Promise<LocationRoomTick | null> {
    const { data, error } = (await table(TICKS_TABLE)
      .select(TICK_COLUMNS)
      .eq('room_id', roomId)
      .in('status', ['pending', 'failed'])
      .lte('next_attempt_at', now.toISOString())
      .order('created_at', { ascending: true })
      .limit(1)) as QueryResult<TickRow[]>

    if (error) throw new Error(error.message)
    const dueTick = data?.[0]
    if (dueTick) return mapTick(dueTick)

    const staleBefore = new Date(now.getTime() - WORKER_LOCK_TTL_MS).toISOString()
    const { data: staleData, error: staleError } = (await table(TICKS_TABLE)
      .select(TICK_COLUMNS)
      .eq('room_id', roomId)
      .eq('status', 'processing')
      .lt('locked_at', staleBefore)
      .order('locked_at', { ascending: true })
      .limit(1)) as QueryResult<TickRow[]>

    if (staleError) throw new Error(staleError.message)
    const staleTick = staleData?.[0]
    return staleTick ? mapTick(staleTick) : null
  }

  async findNonStaleProcessingTickForRoom(roomId: string, now: Date): Promise<LocationRoomTick | null> {
    const staleBefore = new Date(now.getTime() - WORKER_LOCK_TTL_MS).toISOString()
    const { data, error } = (await table(TICKS_TABLE)
      .select(TICK_COLUMNS)
      .eq('room_id', roomId)
      .eq('status', 'processing')
      .gte('locked_at', staleBefore)
      .order('locked_at', { ascending: true })
      .limit(1)) as QueryResult<TickRow[]>

    if (error) throw new Error(error.message)
    const processingTick = data?.[0]
    return processingTick ? mapTick(processingTick) : null
  }

  async claimTick(tickId: string, workerId: string, now: Date): Promise<LocationRoomTick | null> {
    const { data: row, error } = (await table(TICKS_TABLE)
      .select(TICK_COLUMNS)
      .eq('id', tickId)
      .maybeSingle()) as QueryResult<TickRow>

    if (error) throw new Error(error.message)
    if (!row) return null

    const due = new Date(row.next_attempt_at).getTime() <= now.getTime()
    const staleBefore = new Date(now.getTime() - WORKER_LOCK_TTL_MS)
    const staleProcessing = row.status === 'processing' &&
      !!row.locked_at &&
      new Date(row.locked_at).getTime() < staleBefore.getTime()

    if (!((row.status === 'pending' || row.status === 'failed') && due) && !staleProcessing) {
      return null
    }

    let claimQuery = table(TICKS_TABLE)
      .update({
        status: 'processing',
        attempts: row.attempts + 1,
        locked_at: now.toISOString(),
        locked_by: workerId,
        started_at: row.started_at ?? now.toISOString(),
        last_error: null,
      })
      .eq('id', row.id)
      .eq('status', row.status)

    if (row.status === 'processing') {
      claimQuery = row.locked_at
        ? claimQuery.eq('locked_at', row.locked_at)
        : claimQuery.is('locked_at', null)
    }

    const { data: updated, error: updateError } = (await claimQuery
      .select(TICK_COLUMNS)
      .single()) as QueryResult<TickRow>

    if (updateError && !isNoRowsReturned(updateError)) {
      throw new Error(updateError.message)
    }

    if (!updated) return null
    return mapTick(updated)
  }

  async claimDueTicks(limit: number, workerId: string, now: Date, locationIds: string[] = []): Promise<LocationRoomTick[]> {
    const dueAt = now.toISOString()
    let pendingQuery = table(TICKS_TABLE)
      .select(TICK_COLUMNS)
      .eq('status', 'pending')
      .lte('next_attempt_at', dueAt)

    if (locationIds.length > 0) {
      pendingQuery = pendingQuery.in('location_id', locationIds)
    }

    const { data: pendingData, error: pendingError } = (await pendingQuery
      .order('created_at', { ascending: true })
      .limit(limit)) as QueryResult<TickRow[]>

    if (pendingError) throw new Error(pendingError.message)

    const candidates = [...(pendingData ?? [])]
    let remaining = limit - candidates.length

    if (remaining > 0) {
      let failedQuery = table(TICKS_TABLE)
        .select(TICK_COLUMNS)
        .eq('status', 'failed')
        .lte('next_attempt_at', dueAt)

      if (locationIds.length > 0) {
        failedQuery = failedQuery.in('location_id', locationIds)
      }

      const { data: failedData, error: failedError } = (await failedQuery
        .order('created_at', { ascending: true })
        .limit(remaining)) as QueryResult<TickRow[]>

      if (failedError) throw new Error(failedError.message)
      candidates.push(...(failedData ?? []))
      remaining = limit - candidates.length
    }

    if (remaining > 0) {
      const staleBefore = new Date(now.getTime() - WORKER_LOCK_TTL_MS).toISOString()
      let staleQuery = table(TICKS_TABLE)
        .select(TICK_COLUMNS)
        .eq('status', 'processing')
        .lt('locked_at', staleBefore)

      if (locationIds.length > 0) {
        staleQuery = staleQuery.in('location_id', locationIds)
      }

      const { data: staleData, error: staleError } = (await staleQuery
        .order('locked_at', { ascending: true })
        .limit(remaining)) as QueryResult<TickRow[]>

      if (staleError) throw new Error(staleError.message)
      candidates.push(...(staleData ?? []))
    }

    const claimed: LocationRoomTick[] = []
    for (const row of candidates) {
      try {
        const claimedTick = await this.claimTick(row.id, workerId, now)
        if (claimedTick) claimed.push(claimedTick)
      } catch (error) {
        if (!isUniqueViolation(error as SupabaseError)) throw error
      }
    }

    return claimed
  }

  async listActiveTicksForRoom(roomId: string, limit: number): Promise<LocationRoomTick[]> {
    const parsedLimit = Number.isFinite(limit) ? Math.floor(limit) : 10
    const safeLimit = Math.max(1, Math.min(50, parsedLimit))
    const { data, error } = (await table(TICKS_TABLE)
      .select(TICK_COLUMNS)
      .eq('room_id', roomId)
      .in('status', ['pending', 'processing', 'failed'])
      .order('created_at', { ascending: true })
      .limit(safeLimit)) as QueryResult<TickRow[]>

    if (error) throw new Error(error.message)
    return (data ?? []).map(mapTick)
  }

  async listRecentTicksForRoom(roomId: string, limit: number): Promise<LocationRoomTick[]> {
    const parsedLimit = Number.isFinite(limit) ? Math.floor(limit) : 10
    const safeLimit = Math.max(1, Math.min(50, parsedLimit))
    const { data, error } = (await table(TICKS_TABLE)
      .select(TICK_COLUMNS)
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(safeLimit)) as QueryResult<TickRow[]>

    if (error) throw new Error(error.message)
    return (data ?? []).map(mapTick)
  }

  async getPublicMessageStats(roomId: string): Promise<LocationRoomPublicMessageStats> {
    const { data, error, count } = (await table(MESSAGES_TABLE)
      .select(MESSAGE_COLUMNS, { count: 'exact' })
      .eq('room_id', roomId)
      .eq('visibility', 'public')
      .order('sequence', { ascending: false })
      .limit(1)) as QueryResult<MessageRow[]>

    if (error) throw new Error(error.message)
    const latest = data?.[0] ? mapMessage(data[0]) : null

    return {
      messageCount: count ?? data?.length ?? 0,
      latestSequence: latest?.sequence ?? null,
      latestCreatedAt: latest?.createdAt ?? null,
    }
  }

  async getPublicAuthorMessageStats(roomId: string): Promise<LocationRoomPublicAuthorMessageStats> {
    const [publicStats, gameMasterStats, agentStats] = await Promise.all([
      this.getPublicMessageStats(roomId),
      this.getPublicAuthorKindStats(roomId, 'game_master'),
      this.getPublicAuthorKindStats(roomId, 'agent'),
    ])

    return {
      messageCount: publicStats.messageCount,
      gameMasterMessageCount: gameMasterStats.messageCount,
      agentMessageCount: agentStats.messageCount,
      latestGameMasterMessageCreatedAt: gameMasterStats.latestCreatedAt,
      latestAgentMessageCreatedAt: agentStats.latestCreatedAt,
    }
  }

  async markTickSelected(tickId: string, tokenId: number): Promise<LocationRoomTick> {
    return this.updateTick(tickId, { selected_token_id: tokenId })
  }

  async appendMessage(input: CreateLocationRoomMessageInput): Promise<LocationRoomMessage> {
    const visibility = input.visibility ?? 'public'
    const { metadata, dedupeKey } = normalizeMessageMetadata(input)

    const findExisting = async (): Promise<LocationRoomMessage | null> => {
      if (!input.tickId || visibility === 'internal') return null

      let query = table(MESSAGES_TABLE)
        .select(MESSAGE_COLUMNS)
        .eq('room_id', input.roomId)
        .eq('tick_id', input.tickId)
        .eq('visibility', visibility)
        .eq('author_kind', input.authorKind)

      if (dedupeKey) {
        query = query.eq('metadata->>dedupeKey', dedupeKey)
      } else {
        query = query.filter('metadata->>dedupeKey', 'is', null)
      }

      const { data: existingRows, error: existingError } = (await query
        .order('sequence', { ascending: true })
        .limit(1)) as QueryResult<MessageRow[]>

      if (existingError) throw new Error(existingError.message)
      const existing = existingRows?.[0]
      return existing ? mapMessage(existing) : null
    }

    const existing = await findExisting()
    if (existing) return existing

    const { data, error } = (await table(MESSAGES_TABLE)
      .insert({
        room_id: input.roomId,
        location_id: input.locationId,
        tick_id: input.tickId ?? null,
        visibility,
        author_kind: input.authorKind,
        token_id: input.tokenId ?? null,
        official_agent_id: input.officialAgentId ?? null,
        author_name: input.authorName,
        content: input.content,
        metadata,
      })
      .select(MESSAGE_COLUMNS)
      .single()) as QueryResult<MessageRow>

    if (isUniqueViolation(error) && input.tickId && visibility === 'public') {
      const raced = await findExisting()
      if (raced) return raced
    }

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Location room message insert returned no row')
    return mapMessage(data)
  }

  async appendMessagesBatch(inputs: CreateLocationRoomMessageInput[]): Promise<LocationRoomMessage[]> {
    if (inputs.length === 0) return []

    const { data, error } = (await rpc('append_location_room_messages_batch', {
      p_messages: inputs.map(buildBatchMessagePayload),
    })) as QueryResult<unknown>

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Location room message batch RPC returned no rows')

    const rows = normalizeRpcRows(data)
    if (rows.length !== inputs.length) {
      throw new Error('Location room message batch RPC returned an unexpected row count')
    }

    return rows.map(mapMessage)
  }

  async markTickCompleted(tickId: string): Promise<LocationRoomTick> {
    return this.updateTick(tickId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      last_error: null,
    })
  }

  async markTickSkipped(tickId: string, reason: string): Promise<LocationRoomTick> {
    return this.updateTick(tickId, {
      status: 'skipped',
      completed_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      last_error: reason,
    })
  }

  async markTickFailed(tickId: string, error: string, nextAttemptAt: string): Promise<LocationRoomTick> {
    return this.updateTick(tickId, {
      status: 'failed',
      next_attempt_at: nextAttemptAt,
      locked_at: null,
      locked_by: null,
      last_error: error,
    })
  }

  async markTickDead(tickId: string, error: string): Promise<LocationRoomTick> {
    return this.updateTick(tickId, {
      status: 'dead',
      completed_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      last_error: error,
    })
  }

  async updateRoomAfterProcessedTick(room: LocationRoom, params: { tickIntervalMinutes: number; now: Date }): Promise<LocationRoom> {
    const { data, error } = (await table(ROOMS_TABLE)
      .update({
        last_tick_at: params.now.toISOString(),
        next_tick_at: addMinutes(params.now, params.tickIntervalMinutes),
        tick_count: room.tickCount + 1,
        last_error: null,
      })
      .eq('id', room.id)
      .select(ROOM_COLUMNS)
      .single()) as QueryResult<RoomRow>

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Location room update returned no row')
    return mapRoom(data)
  }

  async recordRoomError(roomId: string, error: string): Promise<void> {
    const { error: updateError } = (await table(ROOMS_TABLE)
      .update({ last_error: error })
      .eq('id', roomId)) as QueryResult<null>

    if (updateError) throw new Error(updateError.message)
  }

  async listPublicMessages(params: { roomId: string; page: number; pageSize: number }): Promise<PaginatedLocationRoomMessages> {
    const from = (params.page - 1) * params.pageSize
    const to = from + params.pageSize - 1
    const { data, error, count } = (await table(MESSAGES_TABLE)
      .select(MESSAGE_COLUMNS, { count: 'exact' })
      .eq('room_id', params.roomId)
      .eq('visibility', 'public')
      .order('sequence', { ascending: false })
      .range(from, to)) as QueryResult<MessageRow[]>

    if (error) throw new Error(error.message)
    const total = count ?? data?.length ?? 0
    const messages = (data ?? []).map(mapMessage).reverse()

    return {
      messages,
      total,
      page: params.page,
      pageSize: params.pageSize,
      hasMore: from + params.pageSize < total,
    }
  }

  async listRecentPublicMessages(roomId: string, limit: number): Promise<LocationRoomMessage[]> {
    const { data, error } = (await table(MESSAGES_TABLE)
      .select(MESSAGE_COLUMNS)
      .eq('room_id', roomId)
      .eq('visibility', 'public')
      .order('sequence', { ascending: false })
      .limit(limit)) as QueryResult<MessageRow[]>

    if (error) throw new Error(error.message)
    return (data ?? []).map(mapMessage).reverse()
  }

  private async getPublicAuthorKindStats(
    roomId: string,
    authorKind: LocationRoomMessage['authorKind']
  ): Promise<{ messageCount: number; latestCreatedAt: string | null }> {
    const { data, error, count } = (await table(MESSAGES_TABLE)
      .select(MESSAGE_COLUMNS, { count: 'exact' })
      .eq('room_id', roomId)
      .eq('visibility', 'public')
      .eq('author_kind', authorKind)
      .order('created_at', { ascending: false })
      .limit(1)) as QueryResult<MessageRow[]>

    if (error) throw new Error(error.message)
    const latest = data?.[0] ? mapMessage(data[0]) : null

    return {
      messageCount: count ?? data?.length ?? 0,
      latestCreatedAt: latest?.createdAt ?? null,
    }
  }

  private async updateTick(tickId: string, values: Record<string, unknown>): Promise<LocationRoomTick> {
    const { data, error } = (await table(TICKS_TABLE)
      .update(values)
      .eq('id', tickId)
      .select(TICK_COLUMNS)
      .single()) as QueryResult<TickRow>

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Location room tick update returned no row')
    return mapTick(data)
  }
}

export const locationRoomRepository = new SupabaseLocationRoomRepository()
