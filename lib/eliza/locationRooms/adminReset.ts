import { normalizeLocationMetadata } from '@/lib/domain/location/metadata'
import {
  locationRoomNarrativeRepository,
  type LocationRoomNarrativeRepository,
} from './narrativeRepository'
import {
  locationRoomRepository,
  type LocationRoomRepository,
} from './repository'
import {
  normalizeAdventureMemory,
  seedAdventureMetadataFromCatalog,
  type LocationRoomAdventureMemory,
  type LocationRoomNarrativeState,
} from './narrativeTypes'
import type { LocationRoom, LocationRoomLocationDetails } from './types'

export class LocationRoomAdminResetLocationNotFoundError extends Error {
  constructor(locationId: string) {
    super(`Location not found: ${locationId}`)
    this.name = 'LocationRoomAdminResetLocationNotFoundError'
  }
}

export type LocationRoomAdminResetResult = {
  location: Pick<LocationRoomLocationDetails, 'id' | 'name'>
  previousRoomId: string | null
  room: LocationRoom
  narrativeState: LocationRoomNarrativeState
  adventure: LocationRoomAdventureMemory
  catalogPresent: boolean
}

function buildReseedMetadata(location: LocationRoomLocationDetails): { metadata: Record<string, unknown>; catalogPresent: boolean } {
  const catalog = normalizeLocationMetadata(location.metadata).adventureCatalog ?? null
  const baseMetadata = catalog ? { adventureCatalog: catalog } : {}
  return {
    metadata: seedAdventureMetadataFromCatalog(baseMetadata, catalog, { reseed: true }),
    catalogPresent: Boolean(catalog),
  }
}

export class LocationRoomAdminResetService {
  constructor(
    private readonly roomRepository: LocationRoomRepository = locationRoomRepository,
    private readonly narrativeRepository: LocationRoomNarrativeRepository = locationRoomNarrativeRepository
  ) {}

  async resetLocationRoom(locationId: string): Promise<LocationRoomAdminResetResult> {
    const location = await this.roomRepository.getLocationDetails(locationId)
    if (!location) {
      throw new LocationRoomAdminResetLocationNotFoundError(locationId)
    }

    const reseed = buildReseedMetadata(location)
    const existingRoom = await this.roomRepository.findRoomByLocationId(location.id)
    if (existingRoom) {
      await this.roomRepository.deleteRoomById(existingRoom.id)
    }

    const room = await this.roomRepository.ensureRoomForLocation(location.id)
    await this.narrativeRepository.ensureStateForRoom({
      room,
      initialStateSummary: '',
      initialCurrentObjective: null,
      initialOpenThreads: [],
      metadata: reseed.metadata,
    })
    const narrativeState = await this.narrativeRepository.updateState(room, {
      stateSummary: '',
      currentObjective: null,
      openThreads: [],
      metadata: reseed.metadata,
    })

    return {
      location: { id: location.id, name: location.name },
      previousRoomId: existingRoom?.id ?? null,
      room,
      narrativeState,
      adventure: normalizeAdventureMemory(narrativeState.metadata),
      catalogPresent: reseed.catalogPresent,
    }
  }
}

export const locationRoomAdminResetService = new LocationRoomAdminResetService()
