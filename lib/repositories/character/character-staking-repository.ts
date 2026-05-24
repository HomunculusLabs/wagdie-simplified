import { CHARACTERS_TABLE } from '@/lib/db/tables'
import {
  type CharacterRuntimeAssets,
  noopCharacterRuntimeAssets,
} from '@/lib/domain/character/character-runtime-assets'
import { normalizeLocationMetadata } from '@/lib/domain/location/metadata'
import { getSupabaseAdmin } from '@/lib/supabase'
import { isBurnedOwner } from '@/lib/utils/blockchain'
import type { Character } from '@/types/character'
import type { CharacterWithLocation } from './character-types'

const STAKED_CHARACTER_COLUMNS = [
  'token_id',
  'name',
  'metadata',
  'image_url',
  'infection_status',
  'infected',
  'owner_address',
  'staker_address',
  'location_id',
  'burned',
  'background_story',
].join(', ')

/**
 * Handles staked-character queries and location joins for map data.
 */
export class CharacterStakingRepository {
  constructor(
    private readonly runtimeAssets: CharacterRuntimeAssets = noopCharacterRuntimeAssets
  ) {}

  async getStakedCharacters(): Promise<CharacterWithLocation[]> {
    const adminClient = getSupabaseAdmin()
    if (!adminClient) {
      throw new Error('Supabase admin client not configured')
    }

    const { data, error: charError } = await adminClient
      .from(CHARACTERS_TABLE)
      .select(STAKED_CHARACTER_COLUMNS)
      .not('location_id', 'is', null)
      .order('token_id', { ascending: true })

    if (charError) {
      console.error('Error fetching staked characters:', charError)
      throw new Error(`Failed to fetch staked characters: ${charError.message}`)
    }

    const characters = (data || []) as unknown as Character[]
    if (characters.length === 0) {
      return []
    }

    const locationIds = [
      ...new Set(
        characters
          .map((character) => character.location_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      ),
    ]

    const { data: locationsData, error: locError } = await adminClient
      .from('locations')
      .select('id, name, metadata')
      .in('id', locationIds)

    if (locError) {
      console.error('Error fetching locations for staked characters:', locError)
      return this.runtimeAssets.hydrateCharacters(
        characters.map((character) => ({
          ...character,
          burned: isBurnedOwner(character.owner_address, character.burned),
          location: null,
        })) as CharacterWithLocation[]
      )
    }

    const locations = (locationsData || []) as unknown as Array<{
      id: string
      name: string
      metadata: unknown
    }>

    const locationMap = new Map<string, { id: string; name: string; metadata: unknown }>()
    for (const location of locations) {
      locationMap.set(location.id, location)
    }

    const result: CharacterWithLocation[] = characters.map((character) => {
      const rawLocation = character.location_id ? locationMap.get(character.location_id) : undefined
      const normalizedBurned = isBurnedOwner(character.owner_address, character.burned)

      if (!rawLocation) {
        return {
          ...character,
          burned: normalizedBurned,
          location: null,
        } as CharacterWithLocation
      }

      return {
        ...character,
        burned: normalizedBurned,
        location: {
          id: rawLocation.id,
          name: rawLocation.name,
          metadata: normalizeLocationMetadata(rawLocation.metadata),
        },
      } as CharacterWithLocation
    })

    return this.runtimeAssets.hydrateCharacters(result)
  }
}
