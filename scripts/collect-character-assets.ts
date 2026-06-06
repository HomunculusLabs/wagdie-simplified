import 'dotenv/config'

import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { buildBaseCharacterImageVersion } from '../lib/services/assets/character-current-image-urls'
import {
  compareImageBytes,
  dedupeImageUrlCandidates,
  describeImageBytes,
  type CharacterBaseImageVerificationStatus,
  type ImageByteMetadata,
} from '../lib/services/assets/character-image-verification'

type CharacterMetadata = Record<string, unknown>

type CharacterRow = {
  token_id: number
  metadata?: CharacterMetadata | null
  image_url?: string | null
  original_image_url?: string | null
  original_metadata_sha256?: string | null
  current_image_url?: string | null
  current_image_version?: string | null
  current_image_kind?: string | null
  current_image_sha256?: string | null
  current_image_storage?: Record<string, unknown> | null
  current_image_updated_at?: string | null
  infection_status?: string | null
  infected?: boolean | null
}

type FetchedImage = {
  sourceUrl: string
  bytes: Buffer
  metadata: ImageByteMetadata
}

type DownloadResult = {
  sourceUrl: string | null
  downloaded: boolean
  skipped: boolean
  error: string | null
  verificationStatus: CharacterBaseImageVerificationStatus
  verifiedAt: string | null
  source: ImageByteMetadata | null
  local: ImageByteMetadata | null
}

type ManifestEntry = {
  token_id: number
  metadata_file: string
  metadata_sha256: string
  original_image_url: string | null
  source_image_url: string | null
  source_image_sha256: string | null
  source_content_type: string | null
  source_byte_length: number | null
  local_base_image_file: string
  local_base_image_url: string
  local_base_image_sha256: string | null
  local_base_image_byte_length: number | null
  local_base_image_content_type: string | null
  current_base_image_url: string | null
  current_base_image_version: string | null
  verification_status: CharacterBaseImageVerificationStatus
  verified_at: string | null
  verification_error: string | null
  /** Legacy manifest compatibility fields. */
  image_file: string
  image_exists: boolean
  image_downloaded: boolean
  image_source_url: string | null
  image_error: string | null
}

type Summary = {
  generated_at: string
  table: string
  total_rows: number
  metadata_written: number
  metadata_preserved: number
  images_already_present: number
  images_downloaded: number
  images_refreshed: number
  images_verified: number
  images_hash_mismatched: number
  images_unverified: number
  images_failed: number
  output: {
    metadata_dir: string
    image_dir: string
    manifest_path: string
    status_module_path: string
  }
}

const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://dweb.link/ipfs/',
] as const

const RETIRED_IPFS_GATEWAY_HOSTS = new Set(['cloudflare-ipfs.com'])

const tableName =
  process.env.CHARACTERS_TABLE ||
  process.env.NEXT_PUBLIC_CHARACTERS_TABLE ||
  'wagdie_characters'

const imageDir =
  process.env.LOCAL_IMAGE_DIR || path.join(process.cwd(), 'public/images/characters')
const metadataDir =
  process.env.LOCAL_METADATA_DIR || path.join(process.cwd(), 'public/metadata/characters')
const manifestPath =
  process.env.LOCAL_ASSET_MANIFEST || path.join(metadataDir, 'manifest.json')
const statusModulePath = path.join(
  process.cwd(),
  'lib/data/local-character-asset-status.ts'
)
const pageSize = Number(process.env.LOCAL_ASSET_PAGE_SIZE || 500)
const concurrency = Number(process.env.LOCAL_ASSET_CONCURRENCY || 4)
const downloadMissingImages = !['0', 'false', 'no', 'off'].includes(
  (process.env.LOCAL_ASSET_DOWNLOAD_MISSING || 'true').toLowerCase()
)

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SERVICE_ROLE_KEY

if (!supabaseUrl) throw new Error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)')
if (!serviceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

let hasImageUrlColumn = true
let hasCurrentImageColumns = true
function getIpfsPath(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('ipfs://')) {
    return trimmed.slice('ipfs://'.length).replace(/^\/+/, '')
  }

  try {
    const url = new URL(trimmed)
    const marker = '/ipfs/'
    const markerIndex = url.pathname.indexOf(marker)
    if (markerIndex >= 0) {
      return decodeURIComponent(
        url.pathname.slice(markerIndex + marker.length).replace(/^\/+/, '')
      )
    }
  } catch {
    // Ignore parsing failures for non-URL inputs.
  }

  return null
}

function shouldIncludeOriginalIpfsGatewayUrl(value: string): boolean {
  try {
    return !RETIRED_IPFS_GATEWAY_HOSTS.has(new URL(value).hostname)
  } catch {
    return false
  }
}

function dedupe(values: string[]): string[] {
  return dedupeImageUrlCandidates(values)
}

function normalizeUrlCandidates(value: string | undefined | null): string[] {
  if (!value) return []
  const trimmed = value.trim()
  if (!trimmed) return []

  const ipfsPath = getIpfsPath(trimmed)
  if (!ipfsPath) {
    return [trimmed]
  }

  const gatewayUrls = IPFS_GATEWAYS.map((gateway) => `${gateway}${ipfsPath}`)
  return dedupe([
    ...(trimmed.startsWith('http') && shouldIncludeOriginalIpfsGatewayUrl(trimmed)
      ? [trimmed]
      : []),
    ...gatewayUrls,
  ])
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function getOriginalImageUrl(row: CharacterRow, staticMetadata: CharacterMetadata): string | null {
  return (
    stringOrNull(row.original_image_url) ||
    stringOrNull(staticMetadata.originalImage) ||
    stringOrNull(staticMetadata.image)
  )
}

function getBaseImageCandidates(row: CharacterRow, staticMetadata: CharacterMetadata): string[] {
  const originalImageUrl = getOriginalImageUrl(row, staticMetadata)
  return originalImageUrl ? normalizeUrlCandidates(originalImageUrl) : []
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function readExistingImageMetadata(filePath: string): Promise<ImageByteMetadata | null> {
  try {
    return describeImageBytes(await readFile(filePath))
  } catch {
    return null
  }
}

async function loadOrCreateStaticMetadata(
  metadataFile: string,
  metadata: CharacterMetadata | null | undefined
): Promise<{ metadata: CharacterMetadata; bytes: Buffer; preserved: boolean }> {
  if (await exists(metadataFile)) {
    const bytes = await readFile(metadataFile)
    try {
      const parsed = JSON.parse(bytes.toString('utf8')) as CharacterMetadata
      return { metadata: parsed, bytes, preserved: true }
    } catch {
      return { metadata: {}, bytes, preserved: true }
    }
  }

  const staticMetadata = metadata || {}
  const bytes = Buffer.from(JSON.stringify(staticMetadata, null, 2))
  await writeFile(metadataFile, bytes)
  return { metadata: staticMetadata, bytes, preserved: false }
}

async function fetchImage(url: string): Promise<FetchedImage> {
  const headers: Record<string, string> = {
    'user-agent': 'Mozilla/5.0',
  }

  if (/\.seadn\.io$/i.test(new URL(url).hostname)) {
    headers.referer = 'https://opensea.io/'
  }

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.startsWith('image/')) {
    throw new Error(`Unexpected content-type: ${contentType || 'unknown'}`)
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  return {
    sourceUrl: url,
    bytes,
    metadata: describeImageBytes(bytes, contentType),
  }
}

async function fetchFirstImageCandidate(candidates: string[]): Promise<{
  image: FetchedImage | null
  error: string | null
}> {
  let lastError: string | null = null

  for (const candidate of candidates) {
    try {
      return { image: await fetchImage(candidate), error: null }
    } catch (error) {
      lastError = `${candidate} :: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  return { image: null, error: lastError || 'No usable image candidates' }
}

async function verifyOrDownloadBaseImage(
  candidates: string[],
  destinationPath: string,
  hadLocalImage: boolean
): Promise<DownloadResult> {
  if (candidates.length === 0) {
    return {
      sourceUrl: null,
      downloaded: false,
      skipped: true,
      error: hadLocalImage
        ? 'No canonical original image candidate; existing local file is unverified'
        : 'No canonical original image candidate',
      verificationStatus: hadLocalImage ? 'unverified_existing' : 'missing_local',
      verifiedAt: null,
      source: null,
      local: hadLocalImage ? await readExistingImageMetadata(destinationPath) : null,
    }
  }

  const fetched = await fetchFirstImageCandidate(candidates)
  if (!fetched.image) {
    return {
      sourceUrl: null,
      downloaded: false,
      skipped: true,
      error: fetched.error,
      verificationStatus: 'source_unreachable',
      verifiedAt: null,
      source: null,
      local: hadLocalImage ? await readExistingImageMetadata(destinationPath) : null,
    }
  }

  const source = fetched.image

  if (hadLocalImage) {
    try {
      const localBytes = await readFile(destinationPath)
      const comparison = compareImageBytes(source.bytes, localBytes, source.metadata.contentType)

      if (comparison.matches) {
        return {
          sourceUrl: source.sourceUrl,
          downloaded: false,
          skipped: false,
          error: null,
          verificationStatus: 'verified',
          verifiedAt: new Date().toISOString(),
          source: comparison.source,
          local: comparison.local,
        }
      }

      if (!downloadMissingImages) {
        return {
          sourceUrl: source.sourceUrl,
          downloaded: false,
          skipped: true,
          error: comparison.error,
          verificationStatus: 'hash_mismatch',
          verifiedAt: null,
          source: comparison.source,
          local: comparison.local,
        }
      }

      await writeFile(destinationPath, source.bytes)
      return {
        sourceUrl: source.sourceUrl,
        downloaded: true,
        skipped: false,
        error: comparison.error,
        verificationStatus: 'verified',
        verifiedAt: new Date().toISOString(),
        source: source.metadata,
        local: source.metadata,
      }
    } catch (error) {
      if (!downloadMissingImages) {
        return {
          sourceUrl: source.sourceUrl,
          downloaded: false,
          skipped: true,
          error: error instanceof Error ? error.message : String(error),
          verificationStatus: 'download_failed',
          verifiedAt: null,
          source: source.metadata,
          local: null,
        }
      }
    }
  }

  if (!downloadMissingImages) {
    return {
      sourceUrl: source.sourceUrl,
      downloaded: false,
      skipped: true,
      error: 'Local base image missing and downloads are disabled',
      verificationStatus: 'missing_local',
      verifiedAt: null,
      source: source.metadata,
      local: null,
    }
  }

  try {
    await writeFile(destinationPath, source.bytes)
    return {
      sourceUrl: source.sourceUrl,
      downloaded: true,
      skipped: false,
      error: null,
      verificationStatus: 'verified',
      verifiedAt: new Date().toISOString(),
      source: source.metadata,
      local: source.metadata,
    }
  } catch (error) {
    return {
      sourceUrl: source.sourceUrl,
      downloaded: false,
      skipped: false,
      error: error instanceof Error ? error.message : String(error),
      verificationStatus: 'download_failed',
      verifiedAt: null,
      source: source.metadata,
      local: null,
    }
  }
}

async function loadRows(): Promise<CharacterRow[]> {
  const rows: CharacterRow[] = []
  let from = 0

  while (true) {
    const currentImageColumns = hasCurrentImageColumns
      ? ', original_image_url, original_metadata_sha256, current_image_url, current_image_version, current_image_kind, current_image_sha256, current_image_storage, current_image_updated_at'
      : ''
    const selectColumns = hasImageUrlColumn
      ? `token_id, metadata, image_url${currentImageColumns}, infection_status, infected`
      : `token_id, metadata${currentImageColumns}, infection_status, infected`

    const { data, error } = await supabase
      .from(tableName)
      .select(selectColumns)
      .order('token_id', { ascending: true })
      .range(from, from + pageSize - 1)

    if (error) {
      if (hasCurrentImageColumns && /current_image|original_image|original_metadata/i.test(error.message)) {
        hasCurrentImageColumns = false
        continue
      }

      if (hasImageUrlColumn && error.message.includes('image_url')) {
        hasImageUrlColumn = false
        continue
      }

      throw new Error(`Failed to load ${tableName}: ${error.message}`)
    }

    const page = (data || []) as unknown as CharacterRow[]
    if (page.length === 0) {
      break
    }

    rows.push(...page)
    from += page.length

    if (page.length < pageSize) {
      break
    }
  }

  return rows
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let index = 0

  async function run(): Promise<void> {
    while (true) {
      const current = index
      index += 1
      if (current >= items.length) return
      await worker(items[current])
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, limit) }, () => run()))
}

function renderStatusModule(verifiedTokenIds: number[]): string {
  const values = verifiedTokenIds.join(', ')

  return `export const VERIFIED_LOCAL_CHARACTER_IMAGE_TOKEN_IDS = [${values}] as const

const VERIFIED_LOCAL_CHARACTER_IMAGE_TOKEN_ID_SET = new Set<number>(VERIFIED_LOCAL_CHARACTER_IMAGE_TOKEN_IDS)

/**
 * True only when the generated asset manifest verified the local base image bytes
 * against the canonical original source bytes.
 */
export function hasLocalCharacterImage(tokenId: number): boolean {
  if (!Number.isInteger(tokenId) || tokenId < 1) {
    return false
  }

  return VERIFIED_LOCAL_CHARACTER_IMAGE_TOKEN_ID_SET.has(tokenId)
}
`
}

async function main(): Promise<void> {
  await mkdir(imageDir, { recursive: true })
  await mkdir(metadataDir, { recursive: true })
  await mkdir(path.dirname(statusModulePath), { recursive: true })

  const rows = await loadRows()
  const manifest: ManifestEntry[] = []

  const summary: Summary = {
    generated_at: new Date().toISOString(),
    table: tableName,
    total_rows: rows.length,
    metadata_written: 0,
    metadata_preserved: 0,
    images_already_present: 0,
    images_downloaded: 0,
    images_refreshed: 0,
    images_verified: 0,
    images_hash_mismatched: 0,
    images_unverified: 0,
    images_failed: 0,
    output: {
      metadata_dir: metadataDir,
      image_dir: imageDir,
      manifest_path: manifestPath,
      status_module_path: statusModulePath,
    },
  }

  await mapWithConcurrency(rows, concurrency, async (row) => {
    const metadataFile = path.join(metadataDir, `${row.token_id}.json`)
    const imageFile = path.join(imageDir, `${row.token_id}.png`)
    const hadLocalImage = await exists(imageFile)
    const staticMetadataResult = await loadOrCreateStaticMetadata(metadataFile, row.metadata)
    const metadataSha256 = describeImageBytes(staticMetadataResult.bytes).sha256

    if (staticMetadataResult.preserved) {
      summary.metadata_preserved += 1
    } else {
      summary.metadata_written += 1
    }

    const originalImageUrl = getOriginalImageUrl(row, staticMetadataResult.metadata)
    const result = await verifyOrDownloadBaseImage(
      getBaseImageCandidates(row, staticMetadataResult.metadata),
      imageFile,
      hadLocalImage
    )

    const verified = result.verificationStatus === 'verified'
    const currentBaseImageVersion = verified && result.local
      ? buildBaseCharacterImageVersion(result.local.sha256)
      : null

    if (verified) {
      summary.images_verified += 1
      if (result.downloaded) {
        summary.images_downloaded += 1
        if (hadLocalImage) {
          summary.images_refreshed += 1
        }
      } else if (hadLocalImage) {
        summary.images_already_present += 1
      }
    } else {
      summary.images_unverified += 1
      if (result.verificationStatus === 'hash_mismatch') {
        summary.images_hash_mismatched += 1
      }
      if (!result.skipped) {
        summary.images_failed += 1
      }
    }

    manifest.push({
      token_id: row.token_id,
      metadata_file: path.relative(process.cwd(), metadataFile),
      metadata_sha256: metadataSha256,
      original_image_url: originalImageUrl,
      source_image_url: result.sourceUrl,
      source_image_sha256: result.source?.sha256 || null,
      source_content_type: result.source?.contentType || null,
      source_byte_length: result.source?.byteLength || null,
      local_base_image_file: path.relative(process.cwd(), imageFile),
      local_base_image_url: `/images/characters/${row.token_id}.png`,
      local_base_image_sha256: result.local?.sha256 || null,
      local_base_image_byte_length: result.local?.byteLength || null,
      local_base_image_content_type: result.local?.contentType || null,
      current_base_image_url: verified ? `/images/characters/${row.token_id}.png` : null,
      current_base_image_version: currentBaseImageVersion,
      verification_status: result.verificationStatus,
      verified_at: result.verifiedAt,
      verification_error: result.error,
      image_file: path.relative(process.cwd(), imageFile),
      image_exists: verified,
      image_downloaded: result.downloaded,
      image_source_url: result.sourceUrl,
      image_error: result.error,
    })
  })

  manifest.sort((left, right) => left.token_id - right.token_id)

  const verifiedTokenIds = manifest
    .filter((entry) => entry.verification_status === 'verified')
    .map((entry) => entry.token_id)
  const missingTokenIds = manifest
    .filter((entry) => entry.verification_status !== 'verified')
    .map((entry) => entry.token_id)

  await writeFile(
    manifestPath,
    JSON.stringify({ summary, items: manifest }, null, 2)
  )
  await writeFile(statusModulePath, renderStatusModule(verifiedTokenIds))

  console.log(JSON.stringify({
    ...summary,
    verified_local_images: verifiedTokenIds.length,
    missing_local_images: missingTokenIds.length,
  }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
