import { jsonRaw, jsonRawError } from '@/lib/api/responses'
import { locationRoomMembershipRepository } from '@/lib/eliza/locationRooms/membership'
import { LocationService } from '@/lib/services/location-service'

export const runtime = 'nodejs'

const locationService = new LocationService()

type StakedMapCharacter = {
  token_id: number
  name: string
  image_url: string | null
  owner_address: string | null
  staker_address: string | null
  location_id: string
  burned: boolean
  location: null
}

export async function GET() {
  try {
    const locations = await locationService.getAll()
    const participantsByLocation = await Promise.all(
      locations.map((location) =>
        locationRoomMembershipRepository.listEligibleParticipantsByLocation(location.id)
      )
    )

    const characters: StakedMapCharacter[] = participantsByLocation
      .flat()
      .map((participant) => ({
        token_id: participant.tokenId,
        name: participant.name,
        image_url: participant.imageUrl,
        owner_address: participant.ownerAddress,
        staker_address: participant.stakerAddress,
        location_id: participant.locationId,
        burned: false,
        location: null,
      }))
      .sort((a, b) => a.token_id - b.token_id)

    return jsonRaw({
      characters,
      totalCount: characters.length,
      hasMore: false,
    })
  } catch (error) {
    console.error('[Map] Failed to fetch staked characters', error)
    return jsonRawError('Failed to fetch staked map characters', 500)
  }
}
