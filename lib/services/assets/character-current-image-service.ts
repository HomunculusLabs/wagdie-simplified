import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { CHARACTERS_TABLE } from '@/lib/db/tables'
import { getSupabase, getSupabaseAdmin } from '@/lib/supabase'
import type {
  Character,
  CharacterCurrentImage,
  CharacterCurrentImageKind,
  CharacterCurrentImageSource,
  CharacterCurrentImageStorage,
} from '@/types/character'
import {
  buildCurrentCharacterImagePath,
  isCurrentCharacterImageKind,
} from './character-current-image-urls'

export type ManifestCharacterBaseImage = {
  tokenId: number
  metadataFile: string
  originalImageUrl: string | null
  localFile: string
  localUrl: string
  version: string
  sha256: string | null
  byteLength: number | null
  contentType: string | null
  verifiedAt: string | null
}

export type ResolvedCurrentCharacterImage = {
  tokenId: number
  currentImage: CharacterCurrentImage
  source: 'manifest-base' | 'db-current'
  localFile?: string
  backingUrl?: string
  contentType?: string | null
}

type LocalManifestItem = {
  token_id?: unknown
  metadata_file?: unknown
  original_image_url?: unknown
  local_base_image_file?: unknown
  local_base_image_url?: unknown
  local_base_image_sha256?: unknown
  local_base_image_byte_length?: unknown
  local_base_image_content_type?: unknown
  current_base_image_url?: unknown
  current_base_image_version?: unknown
  verification_status?: unknown
  verified_at?: unknown
}

type LocalManifest = {
  items?: LocalManifestItem[]
}

type CharacterRow = Character & {
  current_image_storage?: CharacterCurrentImageStorage | null
}

const MANIFEST_PATH = path.join(process.cwd(), 'public/metadata/characters/manifest.json')
const DEFAULT_CONTENT_TYPE = 'image/png'
const DEFAULT_SEARING_GCS_BUCKET = 'seared-wagdie-images'

let manifestLoadPromise: Promise<Map<number, ManifestCharacterBaseImage>> | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isVerifiedManifestItem(item: LocalManifestItem): boolean {
  return item.verification_status === 'verified'
}

function normalizeLocalFile(value: string): string {
  return path.isAbsolute(value) ? value : path.join(process.cwd(), value)
}

async function loadVerifiedBaseManifest(): Promise<Map<number, ManifestCharacterBaseImage>> {
  const raw = await readFile(MANIFEST_PATH, 'utf8')
  const parsed = JSON.parse(raw) as LocalManifest
  const items = Array.isArray(parsed.items) ? parsed.items : []
  const verified = new Map<number, ManifestCharacterBaseImage>()

  for (const item of items) {
    if (!isVerifiedManifestItem(item)) continue

    const tokenId = numberOrNull(item.token_id)
    const metadataFile = stringOrNull(item.metadata_file)
    const localFile = stringOrNull(item.local_base_image_file)
    const localUrl = stringOrNull(item.current_base_image_url) || stringOrNull(item.local_base_image_url)
    const version = stringOrNull(item.current_base_image_version)

    if (!tokenId || !metadataFile || !localFile || !localUrl || !version) continue

    verified.set(tokenId, {
      tokenId,
      metadataFile,
      originalImageUrl: stringOrNull(item.original_image_url),
      localFile: normalizeLocalFile(localFile),
      localUrl,
      version,
      sha256: stringOrNull(item.local_base_image_sha256),
      byteLength: numberOrNull(item.local_base_image_byte_length),
      contentType: stringOrNull(item.local_base_image_content_type) || DEFAULT_CONTENT_TYPE,
      verifiedAt: stringOrNull(item.verified_at),
    })
  }

  return verified
}

async function getVerifiedBaseManifest(): Promise<Map<number, ManifestCharacterBaseImage>> {
  if (!manifestLoadPromise) {
    manifestLoadPromise = loadVerifiedBaseManifest().catch((error) => {
      manifestLoadPromise = null
      throw error
    })
  }

  return manifestLoadPromise
}

export async function getVerifiedBaseCharacterImage(
  tokenId: number
): Promise<ManifestCharacterBaseImage | null> {
  try {
    const manifest = await getVerifiedBaseManifest()
    return manifest.get(tokenId) || null
  } catch (error) {
    console.error('[character-current-image] Failed to load verified base manifest:', error)
    return null
  }
}

function sourceForKind(kind: CharacterCurrentImageKind): CharacterCurrentImageSource {
  if (kind === 'base') return 'verified-local-base'
  if (kind === 'seared') return 'searing-materialization'
  if (kind === 'infected') return 'infection-materialization'
  return 'repair'
}

function getSearingGcsBucketName(): string {
  return (
    process.env.SEARING_GCS_BUCKET ||
    process.env.GCS_BUCKET_NAME ||
    process.env.GCS_BUCKET ||
    DEFAULT_SEARING_GCS_BUCKET
  )
}

function encodeObjectPath(objectName: string): string {
  return objectName
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function buildAllowedGcsUrl(objectName: string): string {
  return `https://storage.googleapis.com/${getSearingGcsBucketName()}/${encodeObjectPath(objectName)}`
}

function getAllowedGcsBackingUrl(storage: CharacterCurrentImageStorage | undefined): string | null {
  if (!storage || storage.type !== 'gcs') return null

  const expectedBucket = getSearingGcsBucketName()
  const objectName = stringOrNull(storage.objectName)

  if (!storage.backingUrl) {
    return objectName ? buildAllowedGcsUrl(objectName) : null
  }

  try {
    const url = new URL(storage.backingUrl)
    if (url.protocol !== 'https:' || url.hostname !== 'storage.googleapis.com') {
      return null
    }

    const [bucket, ...objectParts] = url.pathname.split('/').filter(Boolean)
    if (bucket !== expectedBucket) {
      return null
    }

    if (objectName) {
      const decodedPath = objectParts.map((part) => decodeURIComponent(part)).join('/')
      if (decodedPath !== objectName.replace(/^\/+/, '')) {
        return null
      }
    }

    return url.toString()
  } catch {
    return null
  }
}

function sanitizePublicStorage(storage: CharacterCurrentImageStorage | undefined): CharacterCurrentImageStorage | undefined {
  if (!storage) return undefined

  const publicStorage: CharacterCurrentImageStorage = {
    type: storage.type,
    objectName: storage.objectName,
    backingUrl: storage.type === 'gcs' ? storage.backingUrl : undefined,
  }

  return publicStorage.type || publicStorage.objectName || publicStorage.backingUrl
    ? publicStorage
    : undefined
}

function normalizeStorage(value: unknown): CharacterCurrentImageStorage | undefined {
  if (!isRecord(value)) return undefined

  const type = value.type === 'public-static' || value.type === 'gcs' ? value.type : undefined
  const storage: CharacterCurrentImageStorage = {
    type,
    objectName: stringOrNull(value.objectName) || undefined,
    backingUrl: stringOrNull(value.backingUrl) || undefined,
    localPath: stringOrNull(value.localPath) || undefined,
  }

  return storage.type || storage.objectName || storage.backingUrl || storage.localPath
    ? storage
    : undefined
}

function normalizeCurrentImagePath(tokenId: number, version: string, url?: string | null): string {
  const trimmed = url?.trim()
  if (trimmed) {
    try {
      const parsed = new URL(trimmed)
      if (parsed.pathname === `/images/characters/current/${tokenId}.png`) {
        const urlVersion = parsed.searchParams.get('v')
        if (urlVersion === version) {
          return `${parsed.pathname}${parsed.search}`
        }
      }
    } catch {
      if (trimmed.startsWith(`/images/characters/current/${tokenId}.png`)) {
        try {
          const parsed = new URL(trimmed, 'https://wagdie.local')
          if (
            parsed.pathname === `/images/characters/current/${tokenId}.png` &&
            parsed.searchParams.get('v') === version
          ) {
            return `${parsed.pathname}${parsed.search}`
          }
        } catch {
          // Fall through to canonical path construction below.
        }
      }
    }
  }

  return buildCurrentCharacterImagePath(tokenId, version)
}

export function getCurrentImageFromCharacter(
  character: Character,
  options: { requireServable?: boolean } = {}
): ResolvedCurrentCharacterImage | null {
  const version = stringOrNull(character.current_image_version)
  const kindValue = stringOrNull(character.current_image_kind)

  if (!version || !kindValue || !isCurrentCharacterImageKind(kindValue)) {
    return null
  }

  const storage = normalizeStorage(character.current_image_storage)
  if (kindValue === 'base') {
    return null
  }

  const currentImage: CharacterCurrentImage = {
    url: normalizeCurrentImagePath(character.token_id, version, character.current_image_url),
    version,
    kind: kindValue,
    sha256: stringOrNull(character.current_image_sha256) || undefined,
    source: sourceForKind(kindValue),
    updatedAt: stringOrNull(character.current_image_updated_at) || undefined,
    storage: sanitizePublicStorage(storage),
  }

  if (options.requireServable) {
    const backingUrl = getAllowedGcsBackingUrl(storage)

    if (backingUrl) {
      return {
        tokenId: character.token_id,
        currentImage,
        source: 'db-current',
        backingUrl,
        contentType: DEFAULT_CONTENT_TYPE,
      }
    }

    return null
  }

  return {
    tokenId: character.token_id,
    currentImage,
    source: 'db-current',
    contentType: DEFAULT_CONTENT_TYPE,
  }
}

export function currentImageFromVerifiedBase(
  base: ManifestCharacterBaseImage
): ResolvedCurrentCharacterImage {
  return {
    tokenId: base.tokenId,
    source: 'manifest-base',
    localFile: base.localFile,
    contentType: base.contentType,
    currentImage: {
      url: buildCurrentCharacterImagePath(base.tokenId, base.version),
      version: base.version,
      kind: 'base',
      sha256: base.sha256 || undefined,
      source: 'verified-local-base',
      updatedAt: base.verifiedAt || undefined,
      storage: {
        type: 'public-static',
      },
    },
  }
}

async function fetchCharacterRow(tokenId: number): Promise<CharacterRow | null> {
  const client = getSupabaseAdmin() || getSupabase()
  if (!client) return null

  const { data, error } = await client
    .from(CHARACTERS_TABLE as never)
    .select('*')
    .eq('token_id', tokenId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as CharacterRow | null) || null
}

export async function resolveCurrentCharacterImage(
  tokenId: number,
  options: { version?: string | null; requireServable?: boolean } = {}
): Promise<ResolvedCurrentCharacterImage | null> {
  let dbCurrent: ResolvedCurrentCharacterImage | null = null

  try {
    const character = await fetchCharacterRow(tokenId)
    if (character) {
      dbCurrent = getCurrentImageFromCharacter(character, options)
    }
  } catch (error) {
    console.error(`[character-current-image] Failed to read current image row for ${tokenId}:`, error)
  }

  if (dbCurrent && (!options.version || dbCurrent.currentImage.version === options.version)) {
    if (dbCurrent.currentImage.kind !== 'base') {
      return dbCurrent
    }
  }

  const verifiedBase = await getVerifiedBaseCharacterImage(tokenId)
  if (verifiedBase && (!options.version || verifiedBase.version === options.version)) {
    return currentImageFromVerifiedBase(verifiedBase)
  }

  return null
}

export function __resetCharacterCurrentImageManifestCacheForTests(): void {
  manifestLoadPromise = null
}
