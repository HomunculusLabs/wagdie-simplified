import { getSupabaseAdmin } from '@/lib/supabase'
import type { LocationRoom } from './types'
import {
  normalizeNarrativeOpenThreads,
  type CreateOrReuseLocationRoomNarrativeBeatInput,
  type EnsureLocationRoomNarrativeStateInput,
  type LocationRoomNarrativeBeat,
  type LocationRoomNarrativeBeatOutput,
  type LocationRoomNarrativeBeatStatus,
  type LocationRoomNarrativeState,
  type MarkLocationRoomNarrativeBeatFailedOptions,
  type UpdateLocationRoomNarrativeStateInput,
} from './narrativeTypes'

const STATES_TABLE = 'eliza_location_room_narrative_states'
const BEATS_TABLE = 'eliza_location_room_narrative_beats'
const MAX_STORED_ERROR_LENGTH = 1000

const STATE_COLUMNS =
  'id, room_id, location_id, state_summary, current_objective, open_threads, metadata, created_at, updated_at'
const BEAT_COLUMNS =
  'id, room_id, location_id, tick_id, status, selected_token_id, game_master_agent_id, public_narration, speaker_instruction, state_before, state_after, metadata, last_error, created_at, updated_at, completed_at'

type SupabaseError = { code?: string; message: string }
type QueryResult<T> = { data: T | null; error: SupabaseError | null }

type NarrativeStateRow = {
  id: string
  room_id: string
  location_id: string
  state_summary: string | null
  current_objective: string | null
  open_threads: unknown
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type NarrativeBeatRow = {
  id: string
  room_id: string
  location_id: string
  tick_id: string
  status: LocationRoomNarrativeBeatStatus
  selected_token_id: number | null
  game_master_agent_id: string | null
  public_narration: string | null
  speaker_instruction: string | null
  state_before: Record<string, unknown> | null
  state_after: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  last_error: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

function getAdminClient() {
  const client = getSupabaseAdmin()
  if (!client) {
    throw new Error('Supabase admin client not configured')
  }

  // The generated Supabase Database type does not include this new migration yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client as any
}

// The generated Supabase Database type does not include this new migration yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function table(name: string): any {
  return getAdminClient().from(name as never)
}

function isUniqueViolation(error: SupabaseError | null): boolean {
  if (!error) return false
  return error.code === '23505' || /duplicate key|unique constraint/i.test(error.message)
}

function nullableTrimmed(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function sanitizeNarrativeStoredError(error: unknown): string {
  const message = error instanceof Error && error.message.trim()
    ? error.message.trim()
    : typeof error === 'string' && error.trim()
      ? error.trim()
      : 'Location room narrative operation failed'

  return message.slice(0, MAX_STORED_ERROR_LENGTH)
}

function mapState(row: NarrativeStateRow): LocationRoomNarrativeState {
  return {
    id: row.id,
    roomId: row.room_id,
    locationId: row.location_id,
    stateSummary: row.state_summary ?? '',
    currentObjective: nullableTrimmed(row.current_objective),
    openThreads: normalizeNarrativeOpenThreads(row.open_threads),
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapBeat(row: NarrativeBeatRow): LocationRoomNarrativeBeat {
  return {
    id: row.id,
    roomId: row.room_id,
    locationId: row.location_id,
    tickId: row.tick_id,
    status: row.status,
    selectedTokenId: row.selected_token_id,
    gameMasterAgentId: row.game_master_agent_id,
    publicNarration: nullableTrimmed(row.public_narration),
    speakerInstruction: nullableTrimmed(row.speaker_instruction),
    stateBefore: row.state_before ?? {},
    stateAfter: row.state_after ?? {},
    metadata: row.metadata ?? {},
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  }
}

export interface LocationRoomNarrativeRepository {
  findStateByRoomId(roomId: string): Promise<LocationRoomNarrativeState | null>
  ensureStateForRoom(input: EnsureLocationRoomNarrativeStateInput): Promise<LocationRoomNarrativeState>
  updateState(room: Pick<LocationRoom, 'id'>, input: UpdateLocationRoomNarrativeStateInput): Promise<LocationRoomNarrativeState>
  findBeatByTickId(tickId: string): Promise<LocationRoomNarrativeBeat | null>
  listRecentBeatsByRoomId(roomId: string, limit: number): Promise<LocationRoomNarrativeBeat[]>
  createOrReuseBeat(input: CreateOrReuseLocationRoomNarrativeBeatInput): Promise<LocationRoomNarrativeBeat>
  storeBeatGameMasterOutput(beatId: string, output: LocationRoomNarrativeBeatOutput): Promise<LocationRoomNarrativeBeat>
  patchBeatMetadata(beatId: string, metadata: Record<string, unknown>): Promise<LocationRoomNarrativeBeat>
  markBeatGameMasterMessageAppended(beatId: string, output: LocationRoomNarrativeBeatOutput): Promise<LocationRoomNarrativeBeat>
  markBeatCharacterAppended(beatId: string): Promise<LocationRoomNarrativeBeat>
  markBeatCompleted(beatId: string): Promise<LocationRoomNarrativeBeat>
  markBeatFailed(
    beatId: string,
    error: unknown,
    options?: MarkLocationRoomNarrativeBeatFailedOptions
  ): Promise<LocationRoomNarrativeBeat>
  markBeatDead(beatId: string, error: unknown): Promise<LocationRoomNarrativeBeat>
}

export class SupabaseLocationRoomNarrativeRepository implements LocationRoomNarrativeRepository {
  async findStateByRoomId(roomId: string): Promise<LocationRoomNarrativeState | null> {
    const { data, error } = (await table(STATES_TABLE)
      .select(STATE_COLUMNS)
      .eq('room_id', roomId)
      .maybeSingle()) as QueryResult<NarrativeStateRow>

    if (error) throw new Error(error.message)
    return data ? mapState(data) : null
  }

  async ensureStateForRoom(input: EnsureLocationRoomNarrativeStateInput): Promise<LocationRoomNarrativeState> {
    const existing = await this.findStateByRoomId(input.room.id)
    if (existing) return existing

    const { data, error } = (await table(STATES_TABLE)
      .insert({
        room_id: input.room.id,
        location_id: input.room.locationId,
        state_summary: input.initialStateSummary ?? '',
        current_objective: nullableTrimmed(input.initialCurrentObjective),
        open_threads: normalizeNarrativeOpenThreads(input.initialOpenThreads),
        metadata: input.metadata ?? {},
      })
      .select(STATE_COLUMNS)
      .single()) as QueryResult<NarrativeStateRow>

    if (isUniqueViolation(error)) {
      const raced = await this.findStateByRoomId(input.room.id)
      if (raced) return raced
    }

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Location room narrative state insert returned no row')
    return mapState(data)
  }

  async updateState(room: Pick<LocationRoom, 'id'>, input: UpdateLocationRoomNarrativeStateInput): Promise<LocationRoomNarrativeState> {
    const values: Record<string, unknown> = {}

    if (input.stateSummary !== undefined) values.state_summary = input.stateSummary
    if (input.currentObjective !== undefined) values.current_objective = nullableTrimmed(input.currentObjective)
    if (input.openThreads !== undefined) values.open_threads = normalizeNarrativeOpenThreads(input.openThreads)
    if (input.metadata !== undefined) values.metadata = input.metadata

    const { data, error } = (await table(STATES_TABLE)
      .update(values)
      .eq('room_id', room.id)
      .select(STATE_COLUMNS)
      .single()) as QueryResult<NarrativeStateRow>

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Location room narrative state update returned no row')
    return mapState(data)
  }

  async findBeatByTickId(tickId: string): Promise<LocationRoomNarrativeBeat | null> {
    const { data, error } = (await table(BEATS_TABLE)
      .select(BEAT_COLUMNS)
      .eq('tick_id', tickId)
      .maybeSingle()) as QueryResult<NarrativeBeatRow>

    if (error) throw new Error(error.message)
    return data ? mapBeat(data) : null
  }

  async listRecentBeatsByRoomId(roomId: string, limit: number): Promise<LocationRoomNarrativeBeat[]> {
    const parsedLimit = Number.isFinite(limit) ? Math.floor(limit) : 10
    const safeLimit = Math.max(1, Math.min(50, parsedLimit))
    const { data, error } = (await table(BEATS_TABLE)
      .select(BEAT_COLUMNS)
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(safeLimit)) as QueryResult<NarrativeBeatRow[]>

    if (error) throw new Error(error.message)
    return (data ?? []).map(mapBeat)
  }

  async createOrReuseBeat(input: CreateOrReuseLocationRoomNarrativeBeatInput): Promise<LocationRoomNarrativeBeat> {
    const tickId = input.tick.id
    const existing = await this.findBeatByTickId(tickId)
    if (existing) return existing

    const { data, error } = (await table(BEATS_TABLE)
      .insert({
        room_id: input.room.id,
        location_id: input.room.locationId,
        tick_id: tickId,
        status: 'planned',
        selected_token_id: input.selectedTokenId ?? null,
        game_master_agent_id: nullableTrimmed(input.gameMasterAgentId),
        state_before: input.stateBefore ?? {},
        metadata: input.metadata ?? {},
      })
      .select(BEAT_COLUMNS)
      .single()) as QueryResult<NarrativeBeatRow>

    if (isUniqueViolation(error)) {
      const raced = await this.findBeatByTickId(tickId)
      if (raced) return raced
    }

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Location room narrative beat insert returned no row')
    return mapBeat(data)
  }

  async storeBeatGameMasterOutput(
    beatId: string,
    output: LocationRoomNarrativeBeatOutput
  ): Promise<LocationRoomNarrativeBeat> {
    return this.updateBeat(beatId, {
      game_master_agent_id: nullableTrimmed(output.gameMasterAgentId),
      public_narration: nullableTrimmed(output.publicNarration),
      speaker_instruction: nullableTrimmed(output.speakerInstruction),
      state_after: output.stateAfter ?? {},
      metadata: output.metadata ?? {},
      last_error: null,
    })
  }

  async patchBeatMetadata(beatId: string, metadata: Record<string, unknown>): Promise<LocationRoomNarrativeBeat> {
    return this.updateBeat(beatId, {
      metadata,
      last_error: null,
    })
  }

  async markBeatGameMasterMessageAppended(
    beatId: string,
    output: LocationRoomNarrativeBeatOutput
  ): Promise<LocationRoomNarrativeBeat> {
    return this.updateBeat(beatId, {
      status: 'game_master_message_appended',
      game_master_agent_id: nullableTrimmed(output.gameMasterAgentId),
      public_narration: nullableTrimmed(output.publicNarration),
      speaker_instruction: nullableTrimmed(output.speakerInstruction),
      state_after: output.stateAfter ?? {},
      metadata: output.metadata ?? {},
      last_error: null,
    })
  }

  async markBeatCharacterAppended(beatId: string): Promise<LocationRoomNarrativeBeat> {
    return this.updateBeat(beatId, {
      status: 'character_appended',
      last_error: null,
    })
  }

  async markBeatCompleted(beatId: string): Promise<LocationRoomNarrativeBeat> {
    return this.updateBeat(beatId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      last_error: null,
    })
  }

  async markBeatFailed(
    beatId: string,
    error: unknown,
    options: MarkLocationRoomNarrativeBeatFailedOptions = {}
  ): Promise<LocationRoomNarrativeBeat> {
    return this.updateBeat(beatId, {
      status: 'failed',
      ...(options.metadata ? { metadata: options.metadata } : {}),
      last_error: sanitizeNarrativeStoredError(error),
    })
  }

  async markBeatDead(beatId: string, error: unknown): Promise<LocationRoomNarrativeBeat> {
    return this.updateBeat(beatId, {
      status: 'dead',
      completed_at: new Date().toISOString(),
      last_error: sanitizeNarrativeStoredError(error),
    })
  }

  private async updateBeat(beatId: string, values: Record<string, unknown>): Promise<LocationRoomNarrativeBeat> {
    const { data, error } = (await table(BEATS_TABLE)
      .update(values)
      .eq('id', beatId)
      .select(BEAT_COLUMNS)
      .single()) as QueryResult<NarrativeBeatRow>

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Location room narrative beat update returned no row')
    return mapBeat(data)
  }
}

export const locationRoomNarrativeRepository = new SupabaseLocationRoomNarrativeRepository()
