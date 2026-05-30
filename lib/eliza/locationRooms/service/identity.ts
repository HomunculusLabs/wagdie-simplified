const LEGACY_LOCATION_ALIASES = new Map<string, string>([
  ['crows_den', '11'],
])

export function resolveCanonicalLocationRoomId(locationId: string): string {
  return LEGACY_LOCATION_ALIASES.get(locationId.trim().toLowerCase()) ?? locationId
}

export function isCanonicalLocationAlias(requestedLocationId: string, canonicalLocationId: string): boolean {
  return requestedLocationId.trim() !== canonicalLocationId
}
