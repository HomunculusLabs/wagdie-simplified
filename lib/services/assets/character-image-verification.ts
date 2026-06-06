import { createHash } from 'node:crypto'

export type CharacterBaseImageVerificationStatus =
  | 'verified'
  | 'missing_local'
  | 'source_unreachable'
  | 'hash_mismatch'
  | 'download_failed'
  | 'unverified_existing'

export type ImageByteMetadata = {
  sha256: string
  byteLength: number
  contentType: string | null
}

export type ImageByteComparison = {
  matches: boolean
  source: ImageByteMetadata
  local: ImageByteMetadata
  error: string | null
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function detectImageContentType(bytes: Uint8Array): string | null {
  if (bytes.length >= 8) {
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    if (pngSignature.every((value, index) => bytes[index] === value)) {
      return 'image/png'
    }
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }

  if (bytes.length >= 6) {
    const header = Buffer.from(bytes.slice(0, 6)).toString('ascii')
    if (header === 'GIF87a' || header === 'GIF89a') {
      return 'image/gif'
    }
  }

  if (bytes.length >= 12) {
    const riff = Buffer.from(bytes.slice(0, 4)).toString('ascii')
    const webp = Buffer.from(bytes.slice(8, 12)).toString('ascii')
    if (riff === 'RIFF' && webp === 'WEBP') {
      return 'image/webp'
    }
  }

  const prefix = Buffer.from(bytes.slice(0, Math.min(bytes.length, 256)))
    .toString('utf8')
    .trimStart()
    .toLowerCase()
  if (prefix.startsWith('<svg') || prefix.startsWith('<?xml')) {
    return 'image/svg+xml'
  }

  return null
}

export function describeImageBytes(
  bytes: Uint8Array,
  providedContentType?: string | null
): ImageByteMetadata {
  const normalizedContentType = providedContentType?.split(';')[0]?.trim().toLowerCase() || null

  return {
    sha256: sha256Hex(bytes),
    byteLength: bytes.byteLength,
    contentType: normalizedContentType || detectImageContentType(bytes),
  }
}

export function compareImageBytes(
  sourceBytes: Uint8Array,
  localBytes: Uint8Array,
  sourceContentType?: string | null,
  localContentType?: string | null
): ImageByteComparison {
  const source = describeImageBytes(sourceBytes, sourceContentType)
  const local = describeImageBytes(localBytes, localContentType)
  const matches = source.sha256 === local.sha256

  return {
    matches,
    source,
    local,
    error: matches
      ? null
      : `hash_mismatch: source sha256 ${source.sha256} differs from local sha256 ${local.sha256}`,
  }
}

export function dedupeImageUrlCandidates(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }

  return result
}
