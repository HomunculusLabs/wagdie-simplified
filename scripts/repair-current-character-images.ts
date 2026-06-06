import 'dotenv/config'

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { CHARACTERS_TABLE } from '../lib/db/tables'
import { createSupabaseAdminClient } from '../lib/supabase'
import { buildBaseCharacterImageVersion, buildCurrentCharacterImagePath, buildSearedCharacterImageVersion } from '../lib/services/assets/character-current-image-urls'
import { describeImageBytes, sha256Hex } from '../lib/services/assets/character-image-verification'
import { SearingEventRepository, type SearingEventMaterializationRow } from '../lib/repositories/searing-event-repository'
import { SearingStorageService } from '../lib/services/searing-storage'
import type { CharacterCurrentImageStorage } from '../types/character'

type CharacterRow = {
  token_id: number
  metadata: Record<string, unknown> | null
  image_url: string | null
  original_image_url: string | null
  original_metadata_sha256: string | null
  current_image_url: string | null
  current_image_version: string | null
  current_image_kind: string | null
  current_image_sha256: string | null
  current_image_storage: CharacterCurrentImageStorage | null
  current_image_updated_at: string | null
}

type CliOptions = {
  tokenIds?: number[]
  all: boolean
  repairBase: boolean
  repairSeared: boolean
  dryRun: boolean
  legacyImageOrigin?: string
}

type OriginalMetadata = {
  metadata: Record<string, unknown>
  raw: string
  sha256: string
  originalImage: string | null
}

type PlannedChange = {
  tokenId: number
  kind: 'base' | 'seared'
  before: Record<string, unknown>
  after: Record<string, unknown>
  notes: string[]
}

const metadataDir = path.join(process.cwd(), 'public/metadata/characters')
const baseImageDir = path.join(process.cwd(), 'public/images/characters')
const manifestPath = path.join(metadataDir, 'manifest.json')
const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://dweb.link/ipfs/',
] as const

const REQUIRED_WRITE_COLUMNS = new Set([
  'metadata',
  'original_image_url',
  'original_metadata_sha256',
  'current_image_url',
  'current_image_version',
  'current_image_kind',
  'current_image_sha256',
  'current_image_storage',
  'current_image_updated_at',
])
const OPTIONAL_CHARACTER_COLUMNS = [
  'image_url',
  'original_image_url',
  'original_metadata_sha256',
  'current_image_url',
  'current_image_version',
  'current_image_kind',
  'current_image_sha256',
  'current_image_storage',
  'current_image_updated_at',
] as const
const availableCharacterColumns = new Set<string>([
  'token_id',
  'metadata',
  ...OPTIONAL_CHARACTER_COLUMNS,
])

function usage(): string {
  return `Usage: npx ts-node --project scripts/tsconfig.json scripts/repair-current-character-images.ts [scope] [mode] [--yes]

Scopes:
  --token <id>          Repair one token
  --tokens <a,b,c>     Repair a comma-separated token list
  --range <a-b>        Repair an inclusive token range
  --all                Repair all DB tokens (requires --yes to apply)
  --legacy-image-origin <url>
                       Origin to fetch legacy /images/characters/{id}.png?v=seared rows from

Modes:
  --repair-base        Repair/verify base current-image fields
  --repair-seared      Repair completed searing rows into app-origin current images
  (default: both modes)

Safety:
  Dry-run is the default. Pass --yes to write DB/local image changes.
  This script never refreshes OpenSea. It emits changed token IDs for manual marketplace refresh.`
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

function parsePositiveInt(value: string, label: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected ${label} to be a positive integer, got ${value}`)
  }
  return parsed
}

function parseArgs(argv: string[]): CliOptions {
  const tokenIds = new Set<number>()
  let all = false
  let repairBase = false
  let repairSeared = false
  let yes = false
  let legacyImageOrigin: string | undefined

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      console.log(usage())
      process.exit(0)
    }
    if (arg === '--refresh-opensea') {
      throw new Error('Automatic OpenSea refresh is intentionally not supported. Use the emitted token list for manual refresh.')
    }
    if (arg === '--yes') {
      yes = true
      continue
    }
    if (arg === '--legacy-image-origin') {
      i += 1
      if (!argv[i]) throw new Error('--legacy-image-origin requires a URL value')
      legacyImageOrigin = argv[i].replace(/\/$/, '')
      continue
    }
    if (arg === '--all') {
      all = true
      continue
    }
    if (arg === '--repair-base') {
      repairBase = true
      continue
    }
    if (arg === '--repair-seared') {
      repairSeared = true
      continue
    }
    if (arg === '--token') {
      i += 1
      if (!argv[i]) throw new Error('--token requires a value')
      tokenIds.add(parsePositiveInt(argv[i], '--token'))
      continue
    }
    if (arg === '--tokens') {
      i += 1
      if (!argv[i]) throw new Error('--tokens requires a value')
      for (const part of argv[i].split(',')) {
        tokenIds.add(parsePositiveInt(part.trim(), '--tokens item'))
      }
      continue
    }
    if (arg === '--range') {
      i += 1
      if (!argv[i]) throw new Error('--range requires a value like 1-100')
      const match = argv[i].match(/^(\d+)[-:](\d+)$/)
      if (!match) throw new Error('--range requires a value like 1-100')
      const start = parsePositiveInt(match[1], '--range start')
      const end = parsePositiveInt(match[2], '--range end')
      if (end < start) throw new Error('--range end must be >= start')
      for (let tokenId = start; tokenId <= end; tokenId += 1) tokenIds.add(tokenId)
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  if (!repairBase && !repairSeared) {
    repairBase = true
    repairSeared = true
  }

  if (!all && tokenIds.size === 0) {
    throw new Error('Choose a scope with --token, --tokens, --range, or --all')
  }

  if (all && yes && tokenIds.size > 0) {
    throw new Error('Use either --all or a scoped token selector, not both')
  }

  return {
    tokenIds: tokenIds.size ? [...tokenIds].sort((a, b) => a - b) : undefined,
    all,
    repairBase,
    repairSeared,
    dryRun: !yes,
    legacyImageOrigin,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function readOriginalMetadata(tokenId: number): Promise<OriginalMetadata | null> {
  try {
    const raw = await readFile(path.join(metadataDir, `${tokenId}.json`), 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const metadata = isRecord(parsed) ? parsed : {}
    return {
      metadata,
      raw,
      sha256: sha256Text(raw),
      originalImage: stringOrNull(metadata.image) || stringOrNull(metadata.originalImage),
    }
  } catch (error) {
    console.warn(`[token ${tokenId}] original metadata unavailable: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

function ipfsPathFromUrl(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('ipfs://ipfs/')) {
    return trimmed.slice('ipfs://ipfs/'.length).replace(/^\/+/, '')
  }

  if (trimmed.startsWith('ipfs://')) {
    return trimmed.slice('ipfs://'.length).replace(/^\/+/, '')
  }

  try {
    const parsed = new URL(trimmed)
    const marker = '/ipfs/'
    const markerIndex = parsed.pathname.indexOf(marker)
    if (markerIndex >= 0) {
      return decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length).replace(/^\/+/, ''))
    }
  } catch {
    // Non-URL values are returned as-is by fetch candidate generation.
  }

  return null
}

function normalizeImageFetchUrl(url: string): string {
  return getImageFetchUrlCandidates(url)[0] || url.trim()
}

function getImageFetchUrlCandidates(url: string): string[] {
  const trimmed = url.trim()
  const ipfsPath = ipfsPathFromUrl(trimmed)
  if (!ipfsPath) return trimmed ? [trimmed] : []

  return Array.from(new Set([
    ...(trimmed.startsWith('http') ? [trimmed] : []),
    ...IPFS_GATEWAYS.map((gateway) => `${gateway}${ipfsPath}`),
  ]))
}

async function fetchBytesWithSource(url: string): Promise<{ sourceUrl: string; bytes: Buffer }> {
  let lastError: string | null = null

  for (const candidate of getImageFetchUrlCandidates(url)) {
    try {
      const response = await fetch(candidate, {
        headers: { 'User-Agent': 'wagdie-current-image-repair/1.0' },
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }
      return { sourceUrl: candidate, bytes: Buffer.from(await response.arrayBuffer()) }
    } catch (error) {
      lastError = `${candidate}: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  throw new Error(lastError || 'No image fetch candidates')
}

async function fetchBytes(url: string): Promise<Buffer> {
  return (await fetchBytesWithSource(url)).bytes
}

async function updateVerifiedManifestEntry(params: {
  tokenId: number
  original: OriginalMetadata
  sourceUrl: string
  sourceSha256: string
  sourceByteLength: number
  sourceContentType: string | null
  localPath: string
  currentPath: string
  version: string
}): Promise<void> {
  let manifest: Record<string, unknown> = {}
  try {
    const raw = await readFile(manifestPath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    manifest = isRecord(parsed) ? parsed : {}
  } catch {
    manifest = {}
  }

  const items = Array.isArray(manifest.items) ? [...manifest.items] : []
  const now = new Date().toISOString()
  const entry = {
    token_id: params.tokenId,
    metadata_file: path.relative(process.cwd(), path.join(metadataDir, `${params.tokenId}.json`)),
    metadata_sha256: params.original.sha256,
    original_image_url: params.original.originalImage,
    source_image_url: params.sourceUrl,
    source_image_sha256: params.sourceSha256,
    source_content_type: params.sourceContentType,
    source_byte_length: params.sourceByteLength,
    local_base_image_file: path.relative(process.cwd(), params.localPath),
    local_base_image_url: `/images/characters/${params.tokenId}.png`,
    local_base_image_sha256: params.sourceSha256,
    local_base_image_byte_length: params.sourceByteLength,
    local_base_image_content_type: params.sourceContentType,
    current_base_image_url: params.currentPath,
    current_base_image_version: params.version,
    verification_status: 'verified',
    verified_at: now,
    verification_error: null,
    image_file: path.relative(process.cwd(), params.localPath),
    image_exists: true,
    image_downloaded: true,
    image_source_url: params.sourceUrl,
    image_error: null,
  }

  const existingIndex = items.findIndex((item) => isRecord(item) && item.token_id === params.tokenId)
  if (existingIndex >= 0) {
    items[existingIndex] = {
      ...(isRecord(items[existingIndex]) ? items[existingIndex] : {}),
      ...entry,
    }
  } else {
    items.push(entry)
  }

  await mkdir(path.dirname(manifestPath), { recursive: true })
  await writeFile(manifestPath, `${JSON.stringify({ ...manifest, items }, null, 2)}\n`)
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

function buildBaseMetadata(row: CharacterRow, original: OriginalMetadata, currentPath: string, version: string, imageSha256: string): Record<string, unknown> {
  const metadata = isRecord(row.metadata) ? { ...row.metadata } : {}
  metadata.originalImage = stringOrNull(metadata.originalImage) || row.original_image_url || original.originalImage || undefined
  metadata.image = currentPath
  metadata.currentImage = {
    url: currentPath,
    version,
    kind: 'base',
    sha256: imageSha256,
    source: 'verified-local-base',
    updatedAt: new Date().toISOString(),
    storage: { type: 'public-static' },
  }
  return metadata
}

function isSearedRow(row: CharacterRow): boolean {
  return row.current_image_kind === 'seared' || row.metadata?.isSeared === true || Boolean(row.metadata?.searImage)
}

async function planBaseRepair(row: CharacterRow, apply: boolean): Promise<PlannedChange | null> {
  const original = await readOriginalMetadata(row.token_id)
  if (!original?.originalImage) return null

  const notes: string[] = []
  const localPath = path.join(baseImageDir, `${row.token_id}.png`)
  let sourceBytes: Buffer
  let fetchedSourceUrl = normalizeImageFetchUrl(original.originalImage)
  try {
    const fetched = await fetchBytesWithSource(original.originalImage)
    sourceBytes = fetched.bytes
    fetchedSourceUrl = fetched.sourceUrl
  } catch (error) {
    notes.push(`source_unreachable: ${error instanceof Error ? error.message : String(error)}`)
    sourceBytes = Buffer.alloc(0)
  }

  if (sourceBytes.length === 0) {
    const provenanceOnly = !row.original_image_url || !row.original_metadata_sha256 || row.metadata?.originalImage !== original.originalImage
    if (!provenanceOnly) return null

    return {
      tokenId: row.token_id,
      kind: 'base',
      before: {
        original_image_url: row.original_image_url,
        original_metadata_sha256: row.original_metadata_sha256,
        metadata_originalImage: row.metadata?.originalImage,
      },
      after: {
        original_image_url: original.originalImage,
        original_metadata_sha256: original.sha256,
        metadata: {
          ...(isRecord(row.metadata) ? row.metadata : {}),
          originalImage: original.originalImage,
        },
      },
      notes,
    }
  }

  const source = describeImageBytes(sourceBytes)
  let localMatches = false
  if (await pathExists(localPath)) {
    const localBytes = await readFile(localPath)
    localMatches = sha256Hex(localBytes) === source.sha256
    if (!localMatches) notes.push(`local hash mismatch; expected ${source.sha256}, found ${sha256Hex(localBytes)}`)
  } else {
    notes.push('local base image missing')
  }

  if (!localMatches && apply) {
    await mkdir(path.dirname(localPath), { recursive: true })
    await writeFile(localPath, sourceBytes)
    notes.push('wrote verified base image bytes to local public path')
  }

  const version = buildBaseCharacterImageVersion(source.sha256)
  const currentPath = buildCurrentCharacterImagePath(row.token_id, version)

  if (apply) {
    await updateVerifiedManifestEntry({
      tokenId: row.token_id,
      original,
      sourceUrl: fetchedSourceUrl,
      sourceSha256: source.sha256,
      sourceByteLength: source.byteLength,
      sourceContentType: source.contentType,
      localPath,
      currentPath,
      version,
    })
    notes.push('updated verified base manifest entry')
  }
  const storage: CharacterCurrentImageStorage = { type: 'public-static', localPath }
  const shouldSetBaseCurrent = !isSearedRow(row)
  const metadata = shouldSetBaseCurrent
    ? buildBaseMetadata(row, original, currentPath, version, source.sha256)
    : {
      ...(isRecord(row.metadata) ? row.metadata : {}),
      originalImage: row.metadata?.originalImage || original.originalImage,
    }

  const after: Record<string, unknown> = {
    original_image_url: original.originalImage,
    original_metadata_sha256: original.sha256,
    metadata,
  }
  if (shouldSetBaseCurrent) {
    Object.assign(after, {
      image_url: currentPath,
      current_image_url: currentPath,
      current_image_version: version,
      current_image_kind: 'base',
      current_image_sha256: source.sha256,
      current_image_storage: storage,
      current_image_updated_at: new Date().toISOString(),
    })
  }

  const changed =
    !localMatches ||
    row.original_image_url !== original.originalImage ||
    row.original_metadata_sha256 !== original.sha256 ||
    (shouldSetBaseCurrent && (
      row.current_image_url !== currentPath ||
      row.current_image_version !== version ||
      row.current_image_sha256 !== source.sha256 ||
      row.image_url !== currentPath
    ))

  if (!changed) return null

  return {
    tokenId: row.token_id,
    kind: 'base',
    before: {
      image_url: row.image_url,
      original_image_url: row.original_image_url,
      current_image_url: row.current_image_url,
      current_image_version: row.current_image_version,
      current_image_kind: row.current_image_kind,
    },
    after,
    notes,
  }
}

function parseCurrentUrl(value: string | null): { tokenId: number; version: string; legacyBasePath: boolean } | null {
  if (!value) return null
  try {
    const url = new URL(value, 'https://wagdie.local')
    const currentMatch = url.pathname.match(/^\/images\/characters\/current\/(\d+)\.png$/)
    const legacyMatch = url.pathname.match(/^\/images\/characters\/(\d+)\.png$/)
    const version = url.searchParams.get('v')
    if (!version) return null
    if (currentMatch) return { tokenId: Number(currentMatch[1]), version, legacyBasePath: false }
    if (legacyMatch) return { tokenId: Number(legacyMatch[1]), version, legacyBasePath: true }
    return null
  } catch {
    return null
  }
}

function storageFromMetadata(metadata: Record<string, unknown>): CharacterCurrentImageStorage | null {
  const currentImage = isRecord(metadata.current_image) ? metadata.current_image : null
  const nestedStorage = currentImage && isRecord(currentImage.storage) ? currentImage.storage : null
  const storage = nestedStorage || (isRecord(metadata.storage) ? metadata.storage : null)
  if (!storage) return null

  return {
    type: storage.type === 'gcs' || storage.type === 'public-static' ? storage.type : undefined,
    objectName: stringOrNull(storage.objectName) || undefined,
    backingUrl: stringOrNull(storage.backingUrl) || undefined,
    localPath: stringOrNull(storage.localPath) || undefined,
  }
}

function parseGcsUrl(value: string | null): CharacterCurrentImageStorage | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== 'storage.googleapis.com') return null
    const [, ...objectParts] = url.pathname.split('/').filter(Boolean)
    const objectName = objectParts.map((part) => decodeURIComponent(part)).join('/')
    if (!objectName) return null
    return {
      type: 'gcs',
      objectName,
      backingUrl: url.toString(),
    }
  } catch {
    return null
  }
}

function gcsBackingUrlForObject(objectName: string): string {
  const storage = new SearingStorageService()
  return storage.publicUrlForObject(objectName)
}

function isVersionedGcsObject(storage: CharacterCurrentImageStorage | null, version: string): boolean {
  const objectName = stringOrNull(storage?.objectName)
  return Boolean(objectName && objectName.endsWith(`/${version}.png`))
}

function targetGcsStorageForVersion(tokenId: number, version: string): CharacterCurrentImageStorage {
  const storage = new SearingStorageService()
  const objectName = storage.objectNameForToken(tokenId, { version })
  return {
    type: 'gcs',
    objectName,
    backingUrl: storage.publicUrlForObject(objectName),
  }
}

function configuredLegacyImageOrigin(cliOrigin?: string): string | null {
  return (
    cliOrigin ||
    process.env.LEGACY_IMAGE_ORIGIN ||
    process.env.PUBLIC_ASSET_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    null
  )?.replace(/\/$/, '') || null
}

function legacyImageFetchUrl(appRelativeUrl: string, origin: string): string {
  const parsed = new URL(appRelativeUrl, 'https://wagdie.local')
  return `${origin}${parsed.pathname}${parsed.search}`
}

async function descriptorForSearedEvent(row: CharacterRow, event: SearingEventMaterializationRow, apply: boolean, legacyOrigin?: string): Promise<{
  url: string
  version: string
  sha256: string
  storage: CharacterCurrentImageStorage
} | null> {
  const eventMetadata = isRecord(event.materialization_metadata) ? event.materialization_metadata : {}
  const existingCurrent = parseCurrentUrl(event.seared_image_url)
  const metadataCurrent = isRecord(eventMetadata.current_image) ? eventMetadata.current_image : {}
  let storage = storageFromMetadata(eventMetadata) || parseGcsUrl(event.seared_image_url)
  let sourceBytes: Buffer | null = null

  if (existingCurrent?.legacyBasePath) {
    const origin = configuredLegacyImageOrigin(legacyOrigin)
    if (!origin || !event.seared_image_url) {
      console.warn(`[token ${row.token_id}] legacy app-relative seared image requires --legacy-image-origin or LEGACY_IMAGE_ORIGIN`)
      return null
    }

    try {
      sourceBytes = await fetchBytes(legacyImageFetchUrl(event.seared_image_url, origin))
    } catch (error) {
      console.warn(`[token ${row.token_id}] unable to fetch legacy seared image from ${origin}: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  if (!storage?.backingUrl && storage?.objectName && storage.type === 'gcs') {
    storage = {
      ...storage,
      backingUrl: gcsBackingUrlForObject(storage.objectName),
    }
  }

  const backingUrl = stringOrNull(storage?.backingUrl)
  const existingSha =
    stringOrNull(metadataCurrent.sha256) ||
    stringOrNull(row.current_image_sha256)
  let sha256 = existingSha

  if (!sha256 || sha256.length < 16 || !isVersionedGcsObject(storage, existingCurrent?.version || '')) {
    try {
      sourceBytes = sourceBytes || (backingUrl ? await fetchBytes(backingUrl) : null)
      if (sourceBytes) sha256 = sha256Hex(sourceBytes)
    } catch (error) {
      console.warn(`[token ${row.token_id}] unable to fetch seared backing image for sha: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  if (!sha256 || sha256.length < 16) return null

  const canReuseExistingVersion = Boolean(
    existingCurrent?.version &&
    existingCurrent.version.startsWith('seared-') &&
    !existingCurrent.legacyBasePath &&
    isVersionedGcsObject(storage, existingCurrent.version)
  )
  const version = canReuseExistingVersion && existingCurrent?.version
    ? existingCurrent.version
    : buildSearedCharacterImageVersion(event.transaction_hash, event.log_index, sha256)

  if (!storage || storage.type !== 'gcs' || !isVersionedGcsObject(storage, version)) {
    const targetStorage = targetGcsStorageForVersion(row.token_id, version)
    if (apply) {
      if (!sourceBytes) {
        const sourceUrl = backingUrl || event.seared_image_url
        if (!sourceUrl) return null
        sourceBytes = await fetchBytes(sourceUrl)
      }
      const uploaded = await new SearingStorageService().uploadSearedImage(row.token_id, sourceBytes, { version })
      storage = uploaded.storage
      sha256 = uploaded.sha256
    } else {
      storage = targetStorage
    }
  }

  return {
    url: buildCurrentCharacterImagePath(row.token_id, version),
    version,
    sha256,
    storage: storage as CharacterCurrentImageStorage,
  }
}

async function planSearedRepair(row: CharacterRow, event: SearingEventMaterializationRow, apply: boolean, legacyOrigin?: string): Promise<PlannedChange | null> {
  const descriptor = await descriptorForSearedEvent(row, event, apply, legacyOrigin)
  if (!descriptor) {
    console.warn(`[token ${row.token_id}] completed searing event ${event.id} has no repairable GCS backing storage`)
    return null
  }

  const original = await readOriginalMetadata(row.token_id)
  const originalImage =
    row.original_image_url ||
    stringOrNull(row.metadata?.originalImage) ||
    original?.originalImage ||
    null
  const metadata = isRecord(row.metadata) ? { ...row.metadata } : {}
  metadata.originalImage = stringOrNull(metadata.originalImage) || originalImage || undefined
  metadata.image = descriptor.url
  metadata.searImage = descriptor.url
  metadata.isSeared = true
  metadata.currentImage = {
    url: descriptor.url,
    version: descriptor.version,
    kind: 'seared',
    sha256: descriptor.sha256,
    source: 'repair',
    updatedAt: new Date().toISOString(),
    storage: descriptor.storage,
  }
  metadata.searing_materialization = {
    ...(isRecord(metadata.searing_materialization) ? metadata.searing_materialization : {}),
    concord_id: event.concord_id,
    seared_image_url: descriptor.url,
    materialized_at: event.materialized_at,
  }

  const materializationMetadata = {
    ...(isRecord(event.materialization_metadata) ? event.materialization_metadata : {}),
    previous_seared_image_url: event.seared_image_url,
    current_image: metadata.currentImage,
    storage: descriptor.storage,
    backing_url: descriptor.storage.backingUrl,
    repaired_at: new Date().toISOString(),
  }

  const changed =
    event.seared_image_url !== descriptor.url ||
    row.image_url !== descriptor.url ||
    row.current_image_url !== descriptor.url ||
    row.current_image_version !== descriptor.version ||
    row.current_image_sha256 !== descriptor.sha256 ||
    row.metadata?.image !== descriptor.url ||
    row.metadata?.searImage !== descriptor.url

  if (!changed) return null

  return {
    tokenId: row.token_id,
    kind: 'seared',
    before: {
      event_id: event.id,
      event_seared_image_url: event.seared_image_url,
      image_url: row.image_url,
      current_image_url: row.current_image_url,
      current_image_version: row.current_image_version,
    },
    after: {
      event_id: event.id,
      event_seared_image_url: descriptor.url,
      event_materialization_metadata: materializationMetadata,
      image_url: descriptor.url,
      metadata,
      original_image_url: originalImage,
      original_metadata_sha256: row.original_metadata_sha256 || original?.sha256 || null,
      current_image_url: descriptor.url,
      current_image_version: descriptor.version,
      current_image_kind: 'seared',
      current_image_sha256: descriptor.sha256,
      current_image_storage: descriptor.storage,
      current_image_updated_at: new Date().toISOString(),
    },
    notes: ['converted completed searing row to app-origin current image URL'],
  }
}

async function fetchAllTokenIds(client: ReturnType<typeof createSupabaseAdminClient>): Promise<number[]> {
  const ids: number[] = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await client!
      .from(CHARACTERS_TABLE as never)
      .select('token_id')
      .order('token_id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`Failed to fetch token IDs: ${error.message}`)
    const rows = (data || []) as Array<{ token_id: number }>
    ids.push(...rows.map((row) => row.token_id))
    if (rows.length < pageSize) break
    from += pageSize
  }
  return ids
}

function missingColumnFromError(message: string): string | null {
  const patterns = [
    /column\s+\S+\.(\w+)\s+does not exist/i,
    /column\s+"?(\w+)"?\s+does not exist/i,
    /Could not find the ['"](\w+)['"] column/i,
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match?.[1]) return match[1]
  }

  return null
}

function normalizeCharacterRow(row: Partial<CharacterRow> & { token_id: number }): CharacterRow {
  return {
    token_id: row.token_id,
    metadata: row.metadata ?? null,
    image_url: row.image_url ?? null,
    original_image_url: row.original_image_url ?? null,
    original_metadata_sha256: row.original_metadata_sha256 ?? null,
    current_image_url: row.current_image_url ?? null,
    current_image_version: row.current_image_version ?? null,
    current_image_kind: row.current_image_kind ?? null,
    current_image_sha256: row.current_image_sha256 ?? null,
    current_image_storage: row.current_image_storage ?? null,
    current_image_updated_at: row.current_image_updated_at ?? null,
  }
}

function currentCharacterSelectColumns(): string {
  return ['token_id', 'metadata', ...OPTIONAL_CHARACTER_COLUMNS.filter((column) => availableCharacterColumns.has(column))].join(', ')
}

async function fetchCharacterChunk(client: ReturnType<typeof createSupabaseAdminClient>, tokenChunk: number[]): Promise<CharacterRow[]> {
  while (true) {
    const { data, error } = await client!
      .from(CHARACTERS_TABLE as never)
      .select(currentCharacterSelectColumns())
      .in('token_id', tokenChunk)
      .order('token_id', { ascending: true })

    if (!error) {
      return ((data || []) as Array<Partial<CharacterRow> & { token_id: number }>).map(normalizeCharacterRow)
    }

    const missingColumn = missingColumnFromError(error.message)
    if (missingColumn && availableCharacterColumns.delete(missingColumn)) {
      console.warn(`[repair-current] Column ${missingColumn} is unavailable; continuing in compatibility mode for dry-run inspection.`)
      continue
    }

    throw new Error(`Failed to fetch character rows: ${error.message}`)
  }
}

async function fetchCharacterRows(client: ReturnType<typeof createSupabaseAdminClient>, tokenIds: number[]): Promise<CharacterRow[]> {
  const rows: CharacterRow[] = []
  for (const tokenChunk of chunk(tokenIds, 250)) {
    rows.push(...await fetchCharacterChunk(client, tokenChunk))
  }
  return rows.sort((a, b) => a.token_id - b.token_id)
}

async function fetchCompletedEventsForTokens(client: ReturnType<typeof createSupabaseAdminClient>, tokenIds: number[]): Promise<SearingEventMaterializationRow[]> {
  const repository = new SearingEventRepository(() => client as never)
  const events: SearingEventMaterializationRow[] = []
  for (const tokenChunk of chunk(tokenIds, 250)) {
    events.push(...await repository.findCompletedForTokens(tokenChunk))
  }
  return events
}

async function applyCharacterChange(client: ReturnType<typeof createSupabaseAdminClient>, change: PlannedChange): Promise<void> {
  const eventId = stringOrNull(change.after.event_id)
  const eventUrl = stringOrNull(change.after.event_seared_image_url)
  const eventMetadata = isRecord(change.after.event_materialization_metadata) ? change.after.event_materialization_metadata : null

  const missingRequiredColumns = [...REQUIRED_WRITE_COLUMNS].filter((column) => !availableCharacterColumns.has(column))
  if (missingRequiredColumns.length > 0) {
    throw new Error(`Cannot apply repairs before current-image migrations are applied; missing columns: ${missingRequiredColumns.join(', ')}`)
  }

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  for (const key of [
    'image_url',
    'metadata',
    'original_image_url',
    'original_metadata_sha256',
    'current_image_url',
    'current_image_version',
    'current_image_kind',
    'current_image_sha256',
    'current_image_storage',
    'current_image_updated_at',
  ]) {
    if (key in change.after && availableCharacterColumns.has(key)) payload[key] = change.after[key]
  }

  if (eventId && eventUrl && eventMetadata) {
    const { error } = await client!
      .rpc('repair_seared_current_character_image' as never, {
        p_token_id: change.tokenId,
        p_event_id: eventId,
        p_event_seared_image_url: eventUrl,
        p_event_materialization_metadata: eventMetadata,
        p_character_update: payload,
      } as never)
    if (error) throw new Error(`Failed to transactionally repair seared token ${change.tokenId}: ${error.message}`)
    return
  }

  const { error } = await client!
    .from(CHARACTERS_TABLE as never)
    .update(payload as never)
    .eq('token_id', change.tokenId)
  if (error) throw new Error(`Failed to update character ${change.tokenId}: ${error.message}`)
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const client = createSupabaseAdminClient()
  if (!client) throw new Error('Supabase admin client not configured')

  const tokenIds = options.all ? await fetchAllTokenIds(client) : options.tokenIds || []
  const rows = await fetchCharacterRows(client, tokenIds)
  const rowsByToken = new Map(rows.map((row) => [row.token_id, row]))
  const changes: PlannedChange[] = []

  if (options.repairBase) {
    for (const row of rows) {
      const change = await planBaseRepair(row, !options.dryRun)
      if (change) changes.push(change)
    }
  }

  if (options.repairSeared) {
    const events = await fetchCompletedEventsForTokens(client, tokenIds)
    const latestByToken = new Map<number, SearingEventMaterializationRow>()
    for (const event of events) {
      if (!latestByToken.has(event.token_id)) latestByToken.set(event.token_id, event)
    }

    for (const [tokenId, event] of latestByToken) {
      const row = rowsByToken.get(tokenId)
      if (!row) continue
      const change = await planSearedRepair(row, event, !options.dryRun, options.legacyImageOrigin)
      if (change) changes.push(change)
    }
  }

  console.log(JSON.stringify({
    dryRun: options.dryRun,
    repairBase: options.repairBase,
    repairSeared: options.repairSeared,
    scannedTokens: tokenIds.length,
    plannedChanges: changes.length,
  }, null, 2))

  for (const change of changes) {
    console.log(JSON.stringify(change, null, 2))
    if (!options.dryRun) {
      await applyCharacterChange(client, change)
    }
  }

  const refreshTokenIds = [...new Set(changes.map((change) => change.tokenId))].sort((a, b) => a - b)
  console.log('Tokens requiring manual marketplace refresh:')
  console.log(refreshTokenIds.join(',') || '(none)')

  if (options.dryRun) {
    console.log('Dry-run only; pass --yes to apply these changes. No OpenSea refresh was performed.')
  } else {
    console.log('Applied repairs. No OpenSea refresh was performed.')
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  console.error(usage())
  process.exit(1)
})
