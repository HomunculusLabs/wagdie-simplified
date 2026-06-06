import { sha256Hex } from './assets/character-image-verification'
import { buildCurrentCharacterImagePath, buildSearedCharacterImageVersion } from './assets/character-current-image-urls'
import type { CharacterCurrentImageStorage } from '../../types/character'

type StorageFile = {
  save: (buffer: Buffer, options?: Record<string, unknown>) => Promise<void>
}

type StorageBucket = {
  file: (name: string) => StorageFile
}

type StorageClient = {
  bucket: (name: string) => StorageBucket
}

type StorageConstructor = new () => StorageClient

export type StoredSearedCharacterImage = {
  publicPath: string
  version: string
  sha256: string
  storage: CharacterCurrentImageStorage & {
    type: 'gcs'
    objectName: string
    backingUrl: string
  }
}

const dynamicImport = new Function('specifier', 'return import(specifier)') as <T>(specifier: string) => Promise<T>

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '')
}

function sanitizeObjectSegment(value: string): string {
  return value
    .trim()
    .replace(/\.png$/i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'seared'
}

function encodeObjectPath(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

async function loadStorageConstructor(): Promise<StorageConstructor> {
  try {
    const mod = await dynamicImport<{ Storage?: StorageConstructor; default?: { Storage?: StorageConstructor } }>(
      '@google-cloud/storage'
    )
    const Storage = mod.Storage || mod.default?.Storage
    if (!Storage) {
      throw new Error('Storage export not found')
    }
    return Storage
  } catch (error) {
    throw new Error(
      `@google-cloud/storage is required for searing image uploads but could not be loaded: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export class SearingStorageService {
  private readonly bucketName: string
  private readonly prefix: string
  private readonly storageConstructor?: StorageConstructor

  constructor(options: { bucketName?: string; prefix?: string; storageConstructor?: StorageConstructor } = {}) {
    this.bucketName = options.bucketName || process.env.SEARING_GCS_BUCKET || process.env.GCS_BUCKET_NAME || process.env.GCS_BUCKET || 'seared-wagdie-images'
    this.prefix = trimSlashes(options.prefix ?? process.env.SEARING_GCS_PREFIX ?? '')
    this.storageConstructor = options.storageConstructor
  }

  objectNameForToken(tokenId: number, options: { version?: string } = {}): string {
    const version = options.version ? sanitizeObjectSegment(options.version) : null
    const objectPath = version ? `${tokenId}/${version}.png` : `${tokenId}.png`
    return this.prefix ? `${this.prefix}/${objectPath}` : objectPath
  }

  publicUrlForObject(objectName: string): string {
    return `https://storage.googleapis.com/${this.bucketName}/${encodeObjectPath(objectName)}`
  }

  async uploadSearedImage(
    tokenId: number,
    image: Buffer,
    options: { version?: string; transactionHash?: string; logIndex?: number } = {}
  ): Promise<StoredSearedCharacterImage> {
    const sha256 = sha256Hex(image)
    const version = options.version || (
      options.transactionHash && Number.isInteger(options.logIndex)
        ? buildSearedCharacterImageVersion(options.transactionHash, options.logIndex as number, sha256)
        : undefined
    )

    if (!version) {
      throw new Error('A seared current image version or transaction/log context is required')
    }

    const objectName = this.objectNameForToken(tokenId, { version })
    const Storage = this.storageConstructor || await loadStorageConstructor()
    const storage = new Storage()
    const file = storage.bucket(this.bucketName).file(objectName)

    await file.save(image, {
      contentType: 'image/png',
      resumable: false,
      metadata: {
        cacheControl: 'public, max-age=31536000, immutable',
      },
    })

    const backingUrl = this.publicUrlForObject(objectName)

    return {
      publicPath: buildCurrentCharacterImagePath(tokenId, version),
      version,
      sha256,
      storage: {
        type: 'gcs',
        objectName,
        backingUrl,
      },
    }
  }
}

export const searingStorageService = new SearingStorageService()
