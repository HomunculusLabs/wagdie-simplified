import { CHARACTERS_TABLE } from '@/lib/db/tables'
import { getSupabaseAdmin } from '@/lib/supabase'
import { isBurnedOwner } from '@/lib/utils/blockchain'
import type { CharacterMetadata } from '@/types/character'
import type { LocationRoomParticipant } from './types'

type CharacterRow = {
  token_id: number
  name: string | null
  metadata: CharacterMetadata | null
  image_url?: string | null
  background_story: string | null
  owner_address: string | null
  staker_address: string | null
  location_id: string | null
  burned: boolean | null
}

type EligibleLocationRow = Pick<CharacterRow, 'token_id' | 'owner_address' | 'location_id' | 'burned'>

type QueryResult<T> = { data: T | null; error: { message: string } | null }

const CHARACTER_COLUMNS =
  'token_id, name, metadata, background_story, owner_address, staker_address, location_id, burned'

const ELIGIBLE_LOCATION_COLUMNS = 'token_id, owner_address, location_id, burned'

function getAdminClient() {
  const client = getSupabaseAdmin()
  if (!client) {
    throw new Error('Supabase admin client not configured')
  }

  return client as any
}

function isValidTokenId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6666
}

function normalizeAddress(value?: string | null): string | null {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return normalized || null
}

function resolveName(row: CharacterRow): string {
  const explicitName = typeof row.name === 'string' ? row.name.trim() : ''
  if (explicitName) return explicitName

  const metadataName = typeof row.metadata?.name === 'string' ? row.metadata.name.trim() : ''
  if (metadataName) return metadataName

  return `Character #${row.token_id}`
}

function resolveImageUrl(row: CharacterRow): string | null {
  const explicitImage = typeof row.image_url === 'string' ? row.image_url.trim() : ''
  if (explicitImage) return explicitImage

  const metadataImage = typeof row.metadata?.image === 'string' ? row.metadata.image.trim() : ''
  return metadataImage || null
}

function rowToParticipant(row: CharacterRow): LocationRoomParticipant | null {
  if (!isValidTokenId(row.token_id)) return null
  if (!row.location_id) return null
  if (isBurnedOwner(row.owner_address, row.burned)) return null

  return {
    tokenId: row.token_id,
    name: resolveName(row),
    imageUrl: resolveImageUrl(row),
    backgroundStory: row.background_story ?? row.metadata?.background_story ?? null,
    ownerAddress: normalizeAddress(row.owner_address),
    stakerAddress: normalizeAddress(row.staker_address),
    locationId: row.location_id,
  }
}

export function getEffectiveOwnerAddress(participant: Pick<LocationRoomParticipant, 'ownerAddress' | 'stakerAddress'>): string | null {
  return participant.stakerAddress ?? participant.ownerAddress ?? null
}

export function participantBelongsToWallet(
  participant: Pick<LocationRoomParticipant, 'ownerAddress' | 'stakerAddress'>,
  walletAddress?: string | null
): boolean {
  const normalizedWallet = normalizeAddress(walletAddress)
  if (!normalizedWallet) return false
  return getEffectiveOwnerAddress(participant) === normalizedWallet
}

export interface LocationRoomMembershipRepository {
  listEligibleParticipantsByLocation(locationId: string): Promise<LocationRoomParticipant[]>
  listEligibleLocationIds(minParticipants: number): Promise<string[]>
  walletHasEligibleParticipant(locationId: string, walletAddress: string): Promise<boolean>
}

export class SupabaseLocationRoomMembershipRepository implements LocationRoomMembershipRepository {
  async listEligibleParticipantsByLocation(locationId: string): Promise<LocationRoomParticipant[]> {
    const { data, error } = (await getAdminClient()
      .from(CHARACTERS_TABLE as never)
      .select(CHARACTER_COLUMNS)
      .eq('location_id', locationId)
      .order('token_id', { ascending: true })) as QueryResult<CharacterRow[]>

    if (error) throw new Error(error.message)

    return (data ?? [])
      .map(rowToParticipant)
      .filter((participant): participant is LocationRoomParticipant => Boolean(participant))
  }

  async listEligibleLocationIds(minParticipants: number): Promise<string[]> {
    const { data, error } = (await getAdminClient()
      .from(CHARACTERS_TABLE as never)
      .select(ELIGIBLE_LOCATION_COLUMNS)
      .not('location_id', 'is', null)
      .order('token_id', { ascending: true })) as QueryResult<EligibleLocationRow[]>

    if (error) throw new Error(error.message)

    const counts = new Map<string, number>()
    for (const row of data ?? []) {
      if (!isValidTokenId(row.token_id)) continue
      if (!row.location_id) continue
      if (isBurnedOwner(row.owner_address, row.burned)) continue
      counts.set(row.location_id, (counts.get(row.location_id) ?? 0) + 1)
    }

    return Array.from(counts.entries())
      .filter(([, count]) => count >= minParticipants)
      .map(([locationId]) => locationId)
  }

  async walletHasEligibleParticipant(locationId: string, walletAddress: string): Promise<boolean> {
    const participants = await this.listEligibleParticipantsByLocation(locationId)
    return participants.some((participant) => participantBelongsToWallet(participant, walletAddress))
  }
}

export const locationRoomMembershipRepository = new SupabaseLocationRoomMembershipRepository()
