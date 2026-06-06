import { readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  type CharacterRuntimeAssets,
  type CharacterTraitFilters,
} from '@/lib/domain/character/character-runtime-assets'
import {
  currentImageFromVerifiedBase,
  getCurrentImageFromCharacter,
  getVerifiedBaseCharacterImage,
} from '@/lib/services/assets/character-current-image-service'
import { getCharacterImageFallback, getCharacterImageUrl } from '@/lib/utils/image'
import type { Character, CharacterMetadata } from '@/types/character'

type LocalManifestItem = {
  token_id: number
  metadata_file: string
  image_exists: boolean
}

type LocalManifest = {
  summary?: {
    total_rows?: number
  }
  items?: LocalManifestItem[]
}

type MetadataAttribute = {
  trait_type?: unknown
  value?: unknown
}

const MANIFEST_PATH = path.join(process.cwd(), 'public/metadata/characters/manifest.json')
const LOCAL_METADATA_CONCURRENCY = 32

const DYNAMIC_METADATA_KEYS = [
  'isSeared',
  'searImage',
  'infectedImage',
  'infected_image_url',
  'infection',
  'searedConcord',
  'searing_materialization',
  'asset_import',
] as const

const TRAIT_TYPE_BY_FILTER_KEY = {
  origin: 'Body',
  alignment: 'Alignment',
  the17: 'The 17',
  armor: 'Armor',
  back: 'Back',
  mask: 'Mask',
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toTokenId(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function toAttributes(metadata: CharacterMetadata | null | undefined): MetadataAttribute[] {
  if (!metadata || !Array.isArray(metadata.attributes)) {
    return []
  }

  return metadata.attributes.filter((attribute) => isRecord(attribute)) as MetadataAttribute[]
}

const DYNAMIC_TRAIT_TYPES = new Set(['Seared Trait', 'Seared Token', 'Concord'])

function mergeDynamicAttributes(
  localAttributes: CharacterMetadata['attributes'],
  remoteAttributes: CharacterMetadata['attributes']
): CharacterMetadata['attributes'] {
  if (!Array.isArray(remoteAttributes)) return localAttributes
  if (!Array.isArray(localAttributes)) return remoteAttributes

  const remoteDynamicByType = new Map<string, MetadataAttribute>()
  for (const attribute of remoteAttributes) {
    if (!isRecord(attribute) || typeof attribute.trait_type !== 'string') continue
    if (!DYNAMIC_TRAIT_TYPES.has(attribute.trait_type)) continue
    if (attribute.value == null || attribute.value === '' || attribute.value === 'None') continue
    remoteDynamicByType.set(attribute.trait_type, attribute)
  }

  if (remoteDynamicByType.size === 0) return localAttributes

  const merged = localAttributes.map((attribute) => {
    if (!isRecord(attribute) || typeof attribute.trait_type !== 'string') return attribute
    return remoteDynamicByType.get(attribute.trait_type) || attribute
  })

  for (const [traitType, attribute] of remoteDynamicByType) {
    if (!merged.some((item) => isRecord(item) && item.trait_type === traitType)) {
      merged.push(attribute)
    }
  }

  return merged as CharacterMetadata['attributes']
}

function mergeMetadata(
  localMetadata: CharacterMetadata,
  remoteMetadata: CharacterMetadata | null | undefined
): CharacterMetadata {
  const merged = { ...localMetadata } as CharacterMetadata & Record<string, unknown>
  if (!remoteMetadata) {
    return merged
  }

  const remoteRecord = remoteMetadata as CharacterMetadata & Record<string, unknown>
  const mutableMerged = merged as Record<string, unknown>
  for (const key of DYNAMIC_METADATA_KEYS) {
    const value = remoteRecord[key]
    if (value !== undefined) {
      mutableMerged[key] = value
    }
  }

  ;(merged as CharacterMetadata).attributes = mergeDynamicAttributes(
    merged.attributes,
    remoteMetadata.attributes
  )

  return merged
}

async function mapWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<TResult>
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length)
  let index = 0

  async function run(): Promise<void> {
    while (true) {
      const currentIndex = index
      index += 1
      if (currentIndex >= items.length) {
        return
      }

      results[currentIndex] = await worker(items[currentIndex])
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, () => run())
  )

  return results
}

class CharacterLocalAssetsService implements CharacterRuntimeAssets {
  private loadPromise: Promise<void> | null = null
  private disabled = false
  private totalCharacters = 0
  private metadataByTokenId = new Map<number, CharacterMetadata>()
  private traitCounts = new Map<string, Map<string, number>>()
  private traitIndex = new Map<string, Map<string, Set<number>>>()

  private async ensureLoaded(): Promise<void> {
    if (this.disabled) {
      return
    }

    if (!this.loadPromise) {
      this.loadPromise = this.load()
    }

    await this.loadPromise
  }

  private async load(): Promise<void> {
    try {
      const manifestRaw = await readFile(MANIFEST_PATH, 'utf8')
      const manifest = JSON.parse(manifestRaw) as LocalManifest
      const items = Array.isArray(manifest.items) ? manifest.items : []

      this.totalCharacters =
        typeof manifest.summary?.total_rows === 'number'
          ? manifest.summary.total_rows
          : items.length

      const metadataEntries = await mapWithConcurrency(
        items,
        LOCAL_METADATA_CONCURRENCY,
        async (item) => {
          const tokenId = toTokenId(item.token_id)
          if (!tokenId || !item.metadata_file) {
            return null
          }

          try {
            const metadataPath = path.join(process.cwd(), item.metadata_file)
            const raw = await readFile(metadataPath, 'utf8')
            const parsed = JSON.parse(raw) as unknown
            if (!isRecord(parsed)) {
              return null
            }

            return {
              tokenId,
              metadata: parsed as CharacterMetadata,
            }
          } catch {
            return null
          }
        }
      )

      for (const entry of metadataEntries) {
        if (!entry) {
          continue
        }

        this.metadataByTokenId.set(entry.tokenId, entry.metadata)
        this.indexTraits(entry.tokenId, entry.metadata)
      }
    } catch (error) {
      this.disabled = true
      console.error('[character-local-assets] Failed to load local metadata manifest:', error)
    }
  }

  private indexTraits(tokenId: number, metadata: CharacterMetadata): void {
    const attributes = toAttributes(metadata)

    for (const attribute of attributes) {
      const traitType = typeof attribute.trait_type === 'string' ? attribute.trait_type : null
      if (!traitType || attribute.value == null || attribute.value === '') {
        continue
      }

      const traitValue = String(attribute.value)

      let valuesByTrait = this.traitIndex.get(traitType)
      if (!valuesByTrait) {
        valuesByTrait = new Map<string, Set<number>>()
        this.traitIndex.set(traitType, valuesByTrait)
      }

      let tokenIds = valuesByTrait.get(traitValue)
      if (!tokenIds) {
        tokenIds = new Set<number>()
        valuesByTrait.set(traitValue, tokenIds)
      }

      tokenIds.add(tokenId)
    }
  }

  async hydrateCharacter<T extends Character>(character: T): Promise<T> {
    await this.ensureLoaded()

    const localMetadata = this.metadataByTokenId.get(character.token_id)
    if (!localMetadata) {
      return character
    }

    const mergedMetadata = mergeMetadata(localMetadata, character.metadata)
    const verifiedBase = await getVerifiedBaseCharacterImage(character.token_id)
    const dbCurrent = getCurrentImageFromCharacter(character)
    const baseCurrent = verifiedBase ? currentImageFromVerifiedBase(verifiedBase) : null
    const currentImage = dbCurrent?.currentImage || baseCurrent?.currentImage || null
    const originalImage =
      stringOrNull(character.original_image_url) ||
      stringOrNull(character.metadata?.originalImage) ||
      verifiedBase?.originalImageUrl ||
      stringOrNull(localMetadata.originalImage) ||
      stringOrNull(localMetadata.image)

    if (originalImage) {
      mergedMetadata.originalImage = originalImage
    }

    if (currentImage) {
      mergedMetadata.currentImage = currentImage
      mergedMetadata.image = currentImage.url
    }

    const dynamicImageUrl = getCharacterImageUrl(character.token_id, mergedMetadata, character.image_url, {
      infectionStatus: character.infection_status,
      isInfected: character.infected,
    })
    const fallbackImageUrl = originalImage && dynamicImageUrl === getCharacterImageFallback()
      ? originalImage
      : dynamicImageUrl
    const imageUrl = fallbackImageUrl

    return {
      ...character,
      metadata: mergedMetadata,
      image_url: imageUrl,
      original_image_url: character.original_image_url ?? originalImage ?? null,
      current_image_url: currentImage?.url ?? null,
      current_image_version: currentImage?.version ?? null,
      current_image_kind: currentImage?.kind ?? null,
      current_image_sha256: currentImage?.sha256 ?? null,
      current_image_storage: currentImage?.storage ?? null,
      current_image_updated_at: currentImage?.updatedAt ?? null,
    }
  }

  async hydrateCharacters<T extends Character>(characters: T[]): Promise<T[]> {
    await this.ensureLoaded()

    return Promise.all(
      characters.map((character) => this.hydrateCharacter(character))
    )
  }

  async getTraitCounts(traitType: string): Promise<Map<string, number> | null> {
    await this.ensureLoaded()
    if (this.disabled) {
      return null
    }

    const cached = this.traitCounts.get(traitType)
    if (cached) {
      return cached
    }

    const valuesByTrait = this.traitIndex.get(traitType)
    if (!valuesByTrait) {
      return new Map()
    }

    const counts = new Map<string, number>()
    for (const [value, tokenIds] of valuesByTrait.entries()) {
      counts.set(value, tokenIds.size)
    }

    this.traitCounts.set(traitType, counts)
    return counts
  }

  async getTokenIdsForTraitFilters(filters: CharacterTraitFilters): Promise<Set<number> | null> {
    await this.ensureLoaded()
    if (this.disabled) {
      return null
    }

    const activeEntries = Object.entries(filters).filter(
      ([, value]) => typeof value === 'string' && value.trim().length > 0
    ) as Array<[keyof CharacterTraitFilters, string]>

    if (activeEntries.length === 0) {
      return null
    }

    let matchedTokenIds: Set<number> | null = null

    for (const [filterKey, rawValue] of activeEntries) {
      const traitType = TRAIT_TYPE_BY_FILTER_KEY[filterKey]
      const valuesByTrait = this.traitIndex.get(traitType)
      const nextTokenIds = valuesByTrait?.get(rawValue) || new Set<number>()

      if (matchedTokenIds === null) {
        matchedTokenIds = new Set(nextTokenIds)
        continue
      }

      matchedTokenIds = new Set(
        Array.from(matchedTokenIds).filter((tokenId) => nextTokenIds.has(tokenId))
      )
    }

    return matchedTokenIds || new Set<number>()
  }

  async getTotalCharacters(): Promise<number | null> {
    await this.ensureLoaded()
    if (this.disabled) {
      return null
    }

    return this.totalCharacters || this.metadataByTokenId.size
  }
}

export const characterLocalAssets = new CharacterLocalAssetsService()
