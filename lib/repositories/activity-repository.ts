/**
 * Activity Repository
 * Infrastructure layer - Supabase queries for character activity and event feeds
 */

import { supabase } from '../supabase'
import { CHARACTERS_TABLE } from '@/lib/db/tables'

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase client is not configured')
  }
  return supabase
}

export interface InfectionEvent {
  id: string
  token_id: number
  event_type: 'infection' | 'cure'
  transaction_hash: string
  block_number: number
  log_index: number
  actor_address: string | null
  amount: number | null
  event_timestamp: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface SearingEvent {
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
}

export interface StakingEvent {
  id: string
  token_id: number
  event_type: 'stake' | 'unstake' | 'location_change' | 'burn'
  location_id: number | null
  old_location_id: number | null
  new_location_id: number | null
  owner_address: string | null
  transaction_hash: string
  block_number: number
  log_index: number
  event_timestamp: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface ConcordTransfer {
  id: string
  token_id: number
  from_address: string
  to_address: string
  amount: number
  operator_address: string | null
  transaction_hash: string
  block_number: number
  log_index: number
  batch_index: number
  event_timestamp: string | null
  is_mint: boolean
  is_burn: boolean
  metadata: Record<string, unknown>
  created_at: string
}

export type StakingStatusRow = {
  token_id: number
  location_id: string | null
}

export class ActivityRepository {
  async findInfectionEvents(tokenId: number, options: {
    limit: number
    eventType?: InfectionEvent['event_type']
  }): Promise<InfectionEvent[]> {
    let query = requireSupabase()
      .from('infection_events')
      .select('*')
      .eq('token_id', tokenId)
      .order('block_number', { ascending: false })
      .limit(options.limit)

    if (options.eventType) {
      query = query.eq('event_type', options.eventType)
    }

    const { data, error } = await query
    if (error) {
      console.error('Error fetching infection events:', error)
      throw new Error('Failed to fetch events')
    }

    return (data || []) as InfectionEvent[]
  }

  async findSearingEvents(tokenId: number, options: {
    limit: number
    eventType?: SearingEvent['event_type']
  }): Promise<SearingEvent[]> {
    let query = requireSupabase()
      .from('searing_events')
      .select('*')
      .eq('token_id', tokenId)
      .order('block_number', { ascending: false })
      .limit(options.limit)

    if (options.eventType) {
      query = query.eq('event_type', options.eventType)
    }

    const { data, error } = await query
    if (error) {
      console.error('Error fetching searing events:', error)
      throw new Error('Failed to fetch events')
    }

    return (data || []) as SearingEvent[]
  }

  async findStakingEvents(tokenId: number, options: {
    limit: number
    offset: number
    eventType?: StakingEvent['event_type']
  }): Promise<{ events: StakingEvent[]; total: number }> {
    let query = requireSupabase()
      .from('staking_events')
      .select('*', { count: 'exact' })
      .eq('token_id', tokenId)
      .order('block_number', { ascending: false })
      .range(options.offset, options.offset + options.limit - 1)

    if (options.eventType) {
      query = query.eq('event_type', options.eventType)
    }

    const { data, error, count } = await query
    if (error) {
      console.error('Failed to fetch staking events:', error)
      throw new Error('Failed to fetch staking events')
    }

    return {
      events: (data || []) as StakingEvent[],
      total: count || 0,
    }
  }

  async findConcordTransfers(tokenId: number, options: {
    limit: number
    offset: number
    mintsOnly?: boolean
  }): Promise<{ transfers: ConcordTransfer[]; total: number }> {
    let query = requireSupabase()
      .from('concord_transfers')
      .select('*', { count: 'exact' })
      .eq('token_id', tokenId)
      .order('block_number', { ascending: false })
      .range(options.offset, options.offset + options.limit - 1)

    if (options.mintsOnly) {
      query = query.eq('is_mint', true)
    }

    const { data, error, count } = await query
    if (error) {
      console.error('Failed to fetch concord transfers:', error)
      throw new Error('Failed to fetch concord transfers')
    }

    return {
      transfers: (data || []) as ConcordTransfer[],
      total: count || 0,
    }
  }

  async findStakingStatusRows(tokenIds: number[]): Promise<StakingStatusRow[]> {
    const { data, error } = await requireSupabase()
      .from(CHARACTERS_TABLE)
      .select('token_id, location_id')
      .in('token_id', tokenIds)

    if (error) {
      console.error('Error fetching staking status:', error)
      throw new Error('Failed to fetch staking status')
    }

    return (data || []) as StakingStatusRow[]
  }
}

export const activityRepository = new ActivityRepository()
