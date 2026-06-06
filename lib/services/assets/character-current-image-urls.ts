import type { CharacterCurrentImageKind } from '../../../types/character'

const CURRENT_CHARACTER_IMAGE_PATH_PREFIX = '/images/characters/current'

function normalizeSha16(sha256: string): string {
  const normalized = sha256.trim().toLowerCase()
  if (!/^[a-f0-9]{16,64}$/.test(normalized)) {
    throw new Error('Expected a hex sha256 value with at least 16 characters')
  }

  return normalized.slice(0, 16)
}

function normalizeTx8(txHash: string): string {
  const normalized = txHash.trim().toLowerCase().replace(/^0x/, '')
  if (!/^[a-f0-9]{8,64}$/.test(normalized)) {
    throw new Error('Expected a transaction hash with at least 8 hex characters')
  }

  return normalized.slice(0, 8)
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '')
}

export function buildBaseCharacterImageVersion(sha256: string): `base-${string}` {
  return `base-${normalizeSha16(sha256)}`
}

export function buildSearedCharacterImageVersion(
  txHash: string,
  logIndex: number,
  sha256: string
): `seared-${string}-log${number}-${string}` {
  if (!Number.isInteger(logIndex) || logIndex < 0) {
    throw new Error('Expected a non-negative integer log index')
  }

  return `seared-${normalizeTx8(txHash)}-log${logIndex}-${normalizeSha16(sha256)}`
}

export function buildCurrentCharacterImagePath(
  tokenId: number,
  version: string
): string {
  if (!Number.isInteger(tokenId) || tokenId < 1) {
    throw new Error('Expected a positive integer token ID')
  }

  if (!version.trim()) {
    throw new Error('Expected a non-empty current image version')
  }

  return `${CURRENT_CHARACTER_IMAGE_PATH_PREFIX}/${tokenId}.png?v=${encodeURIComponent(version)}`
}

export function buildAbsoluteCurrentCharacterImageUrl(
  tokenId: number,
  version: string,
  publicBaseUrl?: string
): string | null {
  const baseUrl =
    publicBaseUrl ||
    process.env.PUBLIC_ASSET_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL

  if (!baseUrl) {
    return null
  }

  return `${normalizeBaseUrl(baseUrl)}${buildCurrentCharacterImagePath(tokenId, version)}`
}

export function isCurrentCharacterImageKind(value: string): value is CharacterCurrentImageKind {
  return ['base', 'seared', 'infected', 'placeholder', 'repair'].includes(value)
}
