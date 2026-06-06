import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { serverCharacterRepository } from '@/lib/repositories/character-repository.server'
import { buildAbsoluteCurrentCharacterImageUrl } from '@/lib/services/assets/character-current-image-urls'
import { resolveCurrentCharacterImage } from '@/lib/services/assets/character-current-image-service'
import type { Character, CharacterMetadata } from '@/types/character'

const METADATA_DIR = path.join(process.cwd(), 'public/metadata/characters')

const DYNAMIC_METADATA_KEYS = [
  'isSeared',
  'searedConcord',
] as const

const DYNAMIC_TRAIT_TYPES = new Set(['Seared Trait', 'Seared Token', 'Concord'])

export class CharacterMetadataNotFoundError extends Error {
  constructor(tokenId: number) {
    super(`Metadata not found for character ${tokenId}`)
    this.name = 'CharacterMetadataNotFoundError'
  }
}

type MetadataAttribute = {
  trait_type?: unknown
  value?: unknown
}

type ServedMetadataOptions = {
  appOrigin?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function isFileNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function readOriginalMetadata(tokenId: number): Promise<Record<string, unknown>> {
  try {
    const metadataPath = path.join(METADATA_DIR, `${tokenId}.json`)
    const raw = await readFile(metadataPath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    return isRecord(parsed) ? { ...parsed } : {}
  } catch (error) {
    if (isFileNotFoundError(error)) {
      throw new CharacterMetadataNotFoundError(tokenId)
    }
    throw error
  }
}

async function readCurrentCharacter(tokenId: number): Promise<Character | null> {
  try {
    return await serverCharacterRepository.findById(tokenId)
  } catch (error) {
    console.error(`[character-served-metadata] Failed to load current character ${tokenId}:`, error)
    return null
  }
}

function mergeDynamicAttributes(
  originalAttributes: unknown,
  currentAttributes: unknown
): unknown {
  if (!Array.isArray(currentAttributes)) return originalAttributes
  if (!Array.isArray(originalAttributes)) return currentAttributes

  const currentDynamicByType = new Map<string, MetadataAttribute>()
  for (const attribute of currentAttributes) {
    if (!isRecord(attribute) || typeof attribute.trait_type !== 'string') continue
    if (!DYNAMIC_TRAIT_TYPES.has(attribute.trait_type)) continue
    if (attribute.value == null || attribute.value === '' || attribute.value === 'None') continue
    currentDynamicByType.set(attribute.trait_type, attribute)
  }

  if (currentDynamicByType.size === 0) return originalAttributes

  const merged = originalAttributes.map((attribute) => {
    if (!isRecord(attribute) || typeof attribute.trait_type !== 'string') return attribute
    return currentDynamicByType.get(attribute.trait_type) || attribute
  })

  for (const [traitType, attribute] of currentDynamicByType) {
    if (!merged.some((item) => isRecord(item) && item.trait_type === traitType)) {
      merged.push(attribute)
    }
  }

  return merged
}

function overlayCurrentMetadata(
  responseMetadata: Record<string, unknown>,
  currentMetadata: CharacterMetadata | null | undefined
): void {
  if (!currentMetadata) return

  const currentRecord = currentMetadata as CharacterMetadata & Record<string, unknown>
  for (const key of DYNAMIC_METADATA_KEYS) {
    const value = currentRecord[key]
    if (value !== undefined) {
      responseMetadata[key] = value
    }
  }

  if (currentMetadata.searing_materialization) {
    const materialization = { ...currentMetadata.searing_materialization }
    delete materialization.seared_image_url
    responseMetadata.searing_materialization = materialization
  }

  responseMetadata.attributes = mergeDynamicAttributes(
    responseMetadata.attributes,
    currentMetadata.attributes
  )
}

function getOriginalImage(
  originalMetadata: Record<string, unknown>,
  currentCharacter: Character | null
): string | null {
  return (
    stringOrNull(originalMetadata.image) ||
    stringOrNull(originalMetadata.originalImage) ||
    stringOrNull(currentCharacter?.original_image_url) ||
    stringOrNull(currentCharacter?.metadata?.originalImage) ||
    null
  )
}

function applyCurrentImageMetadata(
  responseMetadata: Record<string, unknown>,
  tokenId: number,
  version: string,
  appOrigin: string,
  originalImage: string | null,
  kind: string
): void {
  const currentImageUrl = buildAbsoluteCurrentCharacterImageUrl(tokenId, version, appOrigin)
  if (!currentImageUrl) return

  responseMetadata.image = currentImageUrl
  responseMetadata.current_image = currentImageUrl
  responseMetadata.image_provenance = {
    original_image: originalImage,
    current_image: currentImageUrl,
    current_image_version: version,
    current_image_kind: kind,
    source: kind === 'base' ? 'verified-local-base' : 'current-read-model',
  }

  if (kind === 'seared') {
    responseMetadata.searImage = currentImageUrl
    const materialization = isRecord(responseMetadata.searing_materialization)
      ? { ...responseMetadata.searing_materialization }
      : {}
    materialization.seared_image_url = currentImageUrl
    responseMetadata.searing_materialization = materialization
  }
}

export async function buildServedCharacterMetadata(
  tokenId: number,
  options: ServedMetadataOptions = {}
): Promise<Record<string, unknown>> {
  const [originalMetadata, currentCharacter, resolvedCurrentImage] = await Promise.all([
    readOriginalMetadata(tokenId),
    readCurrentCharacter(tokenId),
    resolveCurrentCharacterImage(tokenId, { requireServable: true }),
  ])

  const responseMetadata = { ...originalMetadata }
  const originalImage = getOriginalImage(originalMetadata, currentCharacter)

  overlayCurrentMetadata(responseMetadata, currentCharacter?.metadata)

  if (originalImage) {
    responseMetadata.original_image = originalImage
  }

  if (resolvedCurrentImage) {
    applyCurrentImageMetadata(
      responseMetadata,
      tokenId,
      resolvedCurrentImage.currentImage.version,
      options.appOrigin || '',
      originalImage,
      resolvedCurrentImage.currentImage.kind
    )
  } else if (!stringOrNull(responseMetadata.image) && originalImage) {
    responseMetadata.image = originalImage
  }

  delete responseMetadata.animation_url

  return responseMetadata
}
