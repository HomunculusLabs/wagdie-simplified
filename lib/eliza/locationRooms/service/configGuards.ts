import { elizaConfig } from '@/lib/eliza/config'
import { gameMasterAgentService } from '@/lib/eliza/gameMasterAgent/service'
import type { GameMasterAgentResolver } from '../narrativeCoordinator'
import {
  LocationRoomFeatureDisabledError,
  LocationRoomGameplayConfigError,
  LocationRoomNarrativeConfigError,
  LocationRoomOfficialServiceDisabledError,
} from './errors'

export function isLocationRoomGameplayEnabledForLocation(locationId: string): boolean {
  const gameplay = elizaConfig.locationRooms.gameplay
  if (!gameplay.enabled) return false

  const normalizedLocationId = locationId.trim().toLowerCase()
  return gameplay.locationAllowlist.some((allowedLocationId) =>
    allowedLocationId.trim().toLowerCase() === normalizedLocationId
  )
}

export function getWorkerLocationAllowlist(): string[] {
  return Array.from(new Set(
    elizaConfig.locationRooms.workerLocationAllowlist
      .map((locationId) => locationId.trim())
      .filter(Boolean)
  ))
}

export function filterWorkerLocationIds(locationIds: string[], allowlist: string[]): string[] {
  if (allowlist.length === 0) return locationIds
  const allowed = new Set(allowlist.map((locationId) => locationId.trim().toLowerCase()))
  return locationIds.filter((locationId) => allowed.has(locationId.trim().toLowerCase()))
}

export async function ensureLocationRoomFeatureEnabled(
  gameMasterAgentResolver: GameMasterAgentResolver = gameMasterAgentService
): Promise<void> {
  if (!elizaConfig.locationRooms.enabled) {
    throw new LocationRoomFeatureDisabledError()
  }

  if (!elizaConfig.official.baseUrl) {
    throw new LocationRoomOfficialServiceDisabledError()
  }

  if (elizaConfig.locationRooms.narrative.enabled) {
    try {
      await gameMasterAgentResolver.resolveRuntimeGameMasterAgentId()
    } catch {
      throw new LocationRoomNarrativeConfigError()
    }
  }
}

export async function ensureLocationRoomGameplayConfigReady(
  locationId: string,
  gameMasterAgentResolver: GameMasterAgentResolver = gameMasterAgentService
): Promise<void> {
  if (!isLocationRoomGameplayEnabledForLocation(locationId)) {
    return
  }

  if (!elizaConfig.locationRooms.enabled) {
    throw new LocationRoomFeatureDisabledError()
  }

  if (elizaConfig.mode !== 'official' || !elizaConfig.official.baseUrl) {
    throw new LocationRoomGameplayConfigError('Location room gameplay mode requires ELIZA_INTEGRATION_MODE=official and ELIZAOS_BASE_URL')
  }

  if (!elizaConfig.locationRooms.narrative.enabled) {
    throw new LocationRoomGameplayConfigError('Location room gameplay mode requires narrative mode to be enabled')
  }

  try {
    await gameMasterAgentResolver.resolveRuntimeGameMasterAgentId()
  } catch {
    throw new LocationRoomGameplayConfigError()
  }
}
