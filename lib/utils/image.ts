/**
 * Image utility functions for character images
 */

import { hasLocalCharacterImage } from '@/lib/data/local-character-asset-status'

const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://dweb.link/ipfs/',
] as const

const RETIRED_IPFS_GATEWAY_HOSTS = new Set(['cloudflare-ipfs.com'])

/**
 * Get the local image path for a character
 */
export function getLocalImagePath(tokenId: number): string {
  return `/images/characters/${tokenId}.png`
}

function getIpfsPath(ipfsUri: string): string | null {
  const trimmed = ipfsUri.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('ipfs://')) {
    return trimmed.slice('ipfs://'.length).replace(/^\/+/, '')
  }

  try {
    const url = new URL(trimmed)
    const marker = '/ipfs/'
    const markerIndex = url.pathname.indexOf(marker)
    if (markerIndex >= 0) {
      return decodeURIComponent(url.pathname.slice(markerIndex + marker.length).replace(/^\/+/, ''))
    }
  } catch {
    // Non-URL strings are handled by the caller as plain image URLs.
  }

  return null
}

function shouldIncludeOriginalIpfsGatewayUrl(url: string): boolean {
  try {
    return !RETIRED_IPFS_GATEWAY_HOSTS.has(new URL(url).hostname)
  } catch {
    return false
  }
}

function isIpfsLikeUrl(url: string | undefined | null): boolean {
  return Boolean(url && getIpfsPath(url))
}

/**
 * Get IPFS gateway URLs for an image, ordered by preference.
 */
export function getIpfsUrls(ipfsUri: string | undefined | null): string[] {
  if (!ipfsUri) return []

  const trimmed = ipfsUri.trim()
  const ipfsPath = getIpfsPath(trimmed)
  if (!ipfsPath) return [trimmed]

  const gatewayUrls = IPFS_GATEWAYS.map((gateway) => `${gateway}${ipfsPath}`)
  return dedupeImageUrls([
    ...(trimmed.startsWith('http') && shouldIncludeOriginalIpfsGatewayUrl(trimmed) ? [trimmed] : []),
    ...gatewayUrls,
  ])
}

/**
 * Get the primary IPFS gateway URL for an image.
 */
export function getIpfsUrl(ipfsUri: string | undefined | null): string | null {
  return getIpfsUrls(ipfsUri)[0] || null
}

/**
 * Normalize a raw image URL from the database/metadata.
 */
export function normalizeImageUrl(url: string | undefined | null): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('ipfs://')) {
    return getIpfsUrl(trimmed)
  }

  return trimmed
}

function normalizeImageUrlCandidates(url: string | undefined | null): string[] {
  if (!url) return []
  const trimmed = url.trim()
  if (!trimmed) return []

  if (isIpfsLikeUrl(trimmed)) {
    return getIpfsUrls(trimmed)
  }

  return [trimmed]
}

export type CharacterImageOptions = {
  infectionStatus?: string | null
  isInfected?: boolean | null
}

export type CharacterImageDisclosure = {
  primaryUrl: string
  candidates: string[]
  searedImageUrl: string | null
  hasSearedImage: boolean
  isSearedPrimary: boolean
  isCurrentlyInfected: boolean
  isSearedImageHiddenByInfection: boolean
}

type CharacterImageMetadata = {
  image?: string | null
  image_url?: string | null
  originalImage?: string | null
  currentImage?: {
    url?: string | null
    kind?: string | null
  } | null
  asset_import?: {
    local_path?: string | null
  } | null
  isSeared?: boolean | null
  searImage?: string | null
  infectedImage?: string | null
  infected_image_url?: string | null
  searing_materialization?: {
    seared_image_url?: string | null
  } | null
  infection?: {
    image?: string | null
    image_url?: string | null
  } | null
}

function isMetadataObject(value: unknown): value is CharacterImageMetadata {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasExplicitInfectionState(options: CharacterImageOptions | undefined): boolean {
  return options?.infectionStatus != null || options?.isInfected != null
}

function isCurrentlyInfected(
  options: CharacterImageOptions | undefined,
  metadata?: CharacterImageMetadata | null
): boolean {
  if (options?.infectionStatus != null) {
    return options.infectionStatus === 'infected'
  }

  if (options?.isInfected != null) {
    return options.isInfected === true
  }

  return !hasExplicitInfectionState(options) && getCurrentImageKind(metadata ?? null) === 'infected'
}

function getCurrentImageKind(metadata: CharacterImageMetadata | null): string | null {
  return metadata?.currentImage?.kind?.trim().toLowerCase() || null
}

function getCurrentMetadataImageCandidates(
  metadata: CharacterImageMetadata | null,
  allowedKinds?: Set<string>
): string[] {
  if (!metadata?.currentImage || getCurrentImageKind(metadata) === 'placeholder') return []
  if (allowedKinds && !allowedKinds.has(getCurrentImageKind(metadata) || '')) return []
  return normalizeImageUrlCandidates(metadata.currentImage.url)
}

function getInfectedMetadataImageCandidates(
  metadata: CharacterImageMetadata | null,
  options?: CharacterImageOptions
): string[] {
  if (!metadata || !isCurrentlyInfected(options, metadata)) return []
  return [
    ...getCurrentMetadataImageCandidates(metadata, new Set(['infected'])),
    ...normalizeImageUrlCandidates(metadata.infectedImage),
    ...normalizeImageUrlCandidates(metadata.infected_image_url),
    ...normalizeImageUrlCandidates(metadata.infection?.image_url),
    ...normalizeImageUrlCandidates(metadata.infection?.image),
  ]
}

function isSearedMetadata(metadata: CharacterImageMetadata | null): boolean {
  return Boolean(
    metadata?.isSeared ||
    getCurrentImageKind(metadata) === 'seared' ||
    metadata?.searImage ||
    metadata?.searing_materialization?.seared_image_url
  )
}

function getSearedMetadataImageCandidates(
  metadata: CharacterImageMetadata | null,
  imageUrl?: string | null
): string[] {
  if (!metadata || !isSearedMetadata(metadata)) return []

  const materializedCandidates = [
    ...getCurrentMetadataImageCandidates(metadata, new Set(['seared'])),
    ...normalizeImageUrlCandidates(metadata.searing_materialization?.seared_image_url),
    ...normalizeImageUrlCandidates(metadata.searImage),
    ...normalizeImageUrlCandidates(imageUrl),
  ]

  return [
    ...materializedCandidates,
    ...(materializedCandidates.length > 0 ? normalizeImageUrlCandidates(metadata.image_url) : []),
    ...(materializedCandidates.length > 0 ? normalizeImageUrlCandidates(metadata.image) : []),
  ]
}

function getPrimaryCurrentMetadataImageCandidates(metadata: CharacterImageMetadata | null): string[] {
  const currentKind = getCurrentImageKind(metadata)
  if (currentKind === 'infected' || currentKind === 'seared' || currentKind === 'placeholder') {
    return []
  }

  return getCurrentMetadataImageCandidates(metadata)
}

function getImportedLocalImageCandidates(metadata: CharacterImageMetadata | null): string[] {
  const localPath = metadata?.asset_import?.local_path?.trim()
  if (!localPath || !localPath.startsWith('/images/characters/')) return []
  return [localPath]
}

function getOriginalImageFallbackCandidates(metadata: CharacterImageMetadata | null): string[] {
  return normalizeImageUrlCandidates(metadata?.originalImage)
}

function dedupeImageUrls(urls: string[]): string[] {
  const seen = new Set<string>()
  const deduped: string[] = []

  for (const url of urls) {
    if (!url || seen.has(url)) continue
    seen.add(url)
    deduped.push(url)
  }

  return deduped
}

/**
 * Get ordered image URL candidates for a character.
 *
 * Runtime policy:
 * 1. infected dynamic image, when the character is currently infected
 * 2. seared dynamic image, when metadata indicates a materialized sear
 * 3. metadata.currentImage.url for verified/base/current read-model state
 * 4. verified local base asset, when known to exist
 * 5. metadata.originalImage as an explicit degraded provenance fallback
 * 6. placeholder
 */
export function getCharacterImageCandidates(
  tokenId: number,
  metadataOrImage?: CharacterImageMetadata | string | null,
  imageUrl?: string | null,
  options?: CharacterImageOptions
): string[] {
  const metadata = isMetadataObject(metadataOrImage) ? metadataOrImage : null
  const localImage = hasLocalCharacterImage(tokenId) ? getLocalImagePath(tokenId) : null

  return dedupeImageUrls([
    ...getInfectedMetadataImageCandidates(metadata, options),
    ...getSearedMetadataImageCandidates(metadata, imageUrl),
    ...getPrimaryCurrentMetadataImageCandidates(metadata),
    ...getImportedLocalImageCandidates(metadata),
    ...(localImage ? [localImage] : []),
    ...getOriginalImageFallbackCandidates(metadata),
    getCharacterImageFallback(),
  ])
}

/**
 * Get the best image URL for a character.
 */
export function getCharacterImageUrl(
  tokenId: number,
  metadataOrImage?: CharacterImageMetadata | string | null,
  imageUrl?: string | null,
  options?: CharacterImageOptions
): string {
  return getCharacterImageCandidates(tokenId, metadataOrImage, imageUrl, options)[0] || getCharacterImageFallback()
}

/**
 * Get image display details for UIs that need to expose seared art even when
 * current primary-image policy keeps infected art first.
 */
export function getCharacterImageDisclosure(
  tokenId: number,
  metadataOrImage?: CharacterImageMetadata | string | null,
  imageUrl?: string | null,
  options?: CharacterImageOptions
): CharacterImageDisclosure {
  const metadata = isMetadataObject(metadataOrImage) ? metadataOrImage : null
  const candidates = getCharacterImageCandidates(tokenId, metadataOrImage, imageUrl, options)
  const primaryUrl = candidates[0] || getCharacterImageFallback()
  const searedImageUrl = getSearedMetadataImageCandidates(metadata, imageUrl)[0] || null
  const currentlyInfected = isCurrentlyInfected(options, metadata)
  const isSearedPrimary = Boolean(searedImageUrl && primaryUrl === searedImageUrl)

  return {
    primaryUrl,
    candidates,
    searedImageUrl,
    hasSearedImage: Boolean(searedImageUrl),
    isSearedPrimary,
    isCurrentlyInfected: currentlyInfected,
    isSearedImageHiddenByInfection: Boolean(
      currentlyInfected &&
      searedImageUrl &&
      primaryUrl !== searedImageUrl
    ),
  }
}

/**
 * Get fallback URL when the primary image fails to load.
 */
export function getCharacterImageFallback(): string {
  return '/images/placeholder-character.svg'
}

// =============================================================================
// Public URL Helpers (for external services like Discord)
// =============================================================================

/**
 * Get the public (absolute) URL for a character image
 * Used for external services that need absolute URLs (Discord embeds, etc.)
 */
export function getPublicCharacterImageUrl(
  tokenId: number,
  publicBaseUrl?: string
): string | null {
  const baseUrl =
    publicBaseUrl ||
    process.env.PUBLIC_ASSET_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL

  if (!baseUrl) {
    return null
  }

  // Remove trailing slash if present
  const normalizedBase = baseUrl.replace(/\/$/, '')
  return `${normalizedBase}/images/characters/${tokenId}.png`
}

/**
 * Get the public (absolute) URL for a placeholder image
 */
export function getPublicPlaceholderImageUrl(publicBaseUrl?: string): string | null {
  const baseUrl =
    publicBaseUrl ||
    process.env.PUBLIC_ASSET_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL

  if (!baseUrl) {
    return null
  }

  const normalizedBase = baseUrl.replace(/\/$/, '')
  return `${normalizedBase}/images/placeholder-character.svg`
}
