import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { CHARACTERS_TABLE } from '../db/tables'
import type { CharacterRuntimeAssets } from '../domain/character/character-runtime-assets'
import type { ConcordSearingMap } from '../domain/searing/concord-searing-map'
import { characterLocalAssets } from '../services/assets/character-local-assets'
import { getSupabaseAdmin } from '../supabase'
import type { Character, CharacterCurrentImageStorage, CharacterMetadata } from '../../types/character'

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>

type CharacterMaterializationRow = {
  token_id: number
  metadata: Record<string, unknown> | null
  searing_metadata?: Record<string, unknown> | null
  image_url?: string | null
  original_image_url?: string | null
  original_metadata_sha256?: string | null
  current_image_url?: string | null
  current_image_version?: string | null
  current_image_kind?: string | null
  current_image_sha256?: string | null
  current_image_storage?: CharacterCurrentImageStorage | null
  current_image_updated_at?: string | null
  infection_status?: string | null
  infected?: boolean | null
}

export type CharacterSearingReadModelUpdate = {
  tokenId: number
  concord: ConcordSearingMap
  searedImageUrl: string
  searedImageVersion?: string
  searedImageSha256?: string
  searedImageStorage?: CharacterCurrentImageStorage
  searedMetadata: Record<string, unknown>
  materializedAt: string
}

const ORIGINAL_METADATA_DIR = path.join(process.cwd(), 'public/metadata/characters')

type OriginalMetadataSnapshot = {
  image: string | null
  sha256: string | null
}

function requireAdminClient(): SupabaseAdminClient {
  const client = getSupabaseAdmin()
  if (!client) {
    throw new Error('Supabase admin client not configured')
  }
  return client
}

type UntypedQueryResult<T = unknown> = Promise<{
  data: T | null
  error: { message: string } | null
}>

type UntypedQueryBuilder = {
  select: (...args: unknown[]) => UntypedQueryBuilder
  eq: (...args: unknown[]) => UntypedQueryBuilder
  insert: (...args: unknown[]) => UntypedQueryBuilder
  update: (...args: unknown[]) => UntypedQueryBuilder
  maybeSingle: () => UntypedQueryResult
  then: UntypedQueryResult<unknown[]>['then']
}

function fromTable(client: SupabaseAdminClient, tableName: string): UntypedQueryBuilder {
  return client.from(tableName as never) as unknown as UntypedQueryBuilder
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function readOriginalMetadataSnapshot(tokenId: number): Promise<OriginalMetadataSnapshot> {
  try {
    const raw = await readFile(path.join(ORIGINAL_METADATA_DIR, `${tokenId}.json`), 'utf8')
    const parsed = JSON.parse(raw) as unknown
    const image = isRecord(parsed)
      ? stringOrNull(parsed.image) || stringOrNull(parsed.originalImage)
      : null

    return {
      image,
      sha256: sha256Hex(raw),
    }
  } catch {
    return { image: null, sha256: null }
  }
}

function getNestedString(record: Record<string, unknown>, path: string[]): string | null {
  let value: unknown = record
  for (const key of path) {
    if (!isRecord(value)) return null
    value = value[key]
  }
  return stringOrNull(value)
}

function looksInfectedImage(url: string | null | undefined): url is string {
  return Boolean(url && /infected/i.test(url))
}

function getInfectedImageUrl(character: CharacterMaterializationRow): string | null {
  const metadata = character.metadata || {}
  const explicitInfectedImage =
    stringOrNull(metadata.infectedImage) ||
    stringOrNull(metadata.infected_image_url) ||
    getNestedString(metadata, ['infection', 'image_url']) ||
    getNestedString(metadata, ['infection', 'image'])

  if (explicitInfectedImage) return explicitInfectedImage

  const heuristicCandidates = [
    stringOrNull(metadata.image),
    character.image_url || null,
  ]

  return heuristicCandidates.find(looksInfectedImage) || null
}

function shouldPreserveCurrentImage(character: CharacterMaterializationRow): boolean {
  return Boolean(
    getInfectedImageUrl(character) ||
    character.infection_status === 'infected' ||
    character.infected === true
  )
}

function buildUpdatedMetadata(
  character: CharacterMaterializationRow,
  update: CharacterSearingReadModelUpdate,
  nextImageUrl: string,
  originalImage: string | null
): CharacterMetadata & Record<string, unknown> {
  const existing = (character.metadata || {}) as CharacterMetadata & Record<string, unknown>
  const preserveExistingImage = shouldPreserveCurrentImage(character)

  const currentImage = !preserveExistingImage && update.searedImageVersion
    ? {
      url: update.searedImageUrl,
      version: update.searedImageVersion,
      kind: 'seared' as const,
      sha256: update.searedImageSha256,
      source: 'searing-materialization' as const,
      updatedAt: update.materializedAt,
      storage: update.searedImageStorage,
    }
    : existing.currentImage

  return {
    ...existing,
    originalImage: existing.originalImage || originalImage || undefined,
    image: preserveExistingImage ? existing.image : nextImageUrl,
    currentImage,
    isSeared: true,
    searImage: update.searedImageUrl,
    searedConcord: {
      id: update.concord.concordTokenId,
      metadata: update.searedMetadata,
      searing: update.concord,
    },
    searing_materialization: {
      concord_id: update.concord.concordTokenId,
      seared_image_url: update.searedImageUrl,
      materialized_at: update.materializedAt,
    },
  }
}

export class CharacterMaterializationRepository {
  constructor(
    private readonly getClient: () => SupabaseAdminClient = requireAdminClient,
    private readonly runtimeAssets: CharacterRuntimeAssets = characterLocalAssets
  ) {}

  async findCharacter(tokenId: number): Promise<CharacterMaterializationRow | null> {
    const { data, error } = await fromTable(this.getClient(), CHARACTERS_TABLE)
      .select('token_id, metadata, image_url, original_image_url, original_metadata_sha256, current_image_url, current_image_version, current_image_kind, current_image_sha256, current_image_storage, current_image_updated_at, infection_status, infected')
      .eq('token_id', tokenId)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to fetch character ${tokenId}: ${error.message}`)
    }

    if (!data) return null

    const character = data as CharacterMaterializationRow
    const hydrated = await this.runtimeAssets.hydrateCharacter({
      ...character,
      image_url: character.image_url ?? undefined,
      original_image_url: character.original_image_url ?? undefined,
      original_metadata_sha256: character.original_metadata_sha256 ?? undefined,
      current_image_url: character.current_image_url ?? undefined,
      current_image_version: character.current_image_version as Character['current_image_version'],
      current_image_kind: character.current_image_kind as Character['current_image_kind'],
      current_image_sha256: character.current_image_sha256 ?? undefined,
      current_image_storage: character.current_image_storage ?? undefined,
      current_image_updated_at: character.current_image_updated_at ?? undefined,
      infection_status: character.infection_status ?? undefined,
      infected: character.infected ?? undefined,
    } as Character)

    return {
      ...character,
      searing_metadata: isRecord(hydrated.metadata) ? hydrated.metadata : character.metadata,
    }
  }

  async updateSearingReadModel(update: CharacterSearingReadModelUpdate): Promise<void> {
    const character = await this.findCharacter(update.tokenId)
    if (!character) {
      throw new Error(`Character ${update.tokenId} not found`)
    }

    const originalSnapshot = await readOriginalMetadataSnapshot(update.tokenId)
    const existingMetadata = (character.metadata || {}) as CharacterMetadata & Record<string, unknown>
    const originalImage =
      stringOrNull(character.original_image_url) ||
      stringOrNull(existingMetadata.originalImage) ||
      originalSnapshot.image

    const infectedImageUrl = getInfectedImageUrl(character)
    const nextImageUrl = infectedImageUrl || (
      shouldPreserveCurrentImage(character) && character.image_url
        ? character.image_url
        : update.searedImageUrl
    )
    const nextMetadata = buildUpdatedMetadata(character, update, nextImageUrl, originalImage)
    const preserveCurrentImage = shouldPreserveCurrentImage(character)
    const updatedAt = new Date().toISOString()

    const { error } = await fromTable(this.getClient(), CHARACTERS_TABLE)
      .update({
        metadata: nextMetadata,
        image_url: nextImageUrl,
        original_image_url: originalImage,
        original_metadata_sha256: character.original_metadata_sha256 || originalSnapshot.sha256,
        current_image_url: preserveCurrentImage ? character.current_image_url || null : update.searedImageUrl,
        current_image_version: preserveCurrentImage ? character.current_image_version || null : update.searedImageVersion || null,
        current_image_kind: preserveCurrentImage ? character.current_image_kind || null : update.searedImageVersion ? 'seared' : null,
        current_image_sha256: preserveCurrentImage ? character.current_image_sha256 || null : update.searedImageSha256 || null,
        current_image_storage: preserveCurrentImage ? character.current_image_storage || {} : update.searedImageStorage || {},
        current_image_updated_at: preserveCurrentImage ? character.current_image_updated_at || null : update.materializedAt,
        updated_at: updatedAt,
      })
      .eq('token_id', update.tokenId)

    if (error) {
      throw new Error(`Failed to update character ${update.tokenId} searing read model: ${error.message}`)
    }
  }

  async ensureConcordExists(concord: ConcordSearingMap): Promise<void> {
    const client = this.getClient()
    const { data, error } = await fromTable(client, 'concords')
      .select('concord_id')
      .eq('concord_id', concord.concordTokenId)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to fetch concord ${concord.concordTokenId}: ${error.message}`)
    }

    if (data) return

    const { error: insertError } = await fromTable(client, 'concords')
      .insert({
        concord_id: concord.concordTokenId,
        name: concord.token_name || `Concord #${concord.concordTokenId}`,
        description: `Searing concord: ${concord.token_name || concord.concordTokenId}`,
        image_url: `/images/concords/${concord.concordTokenId}.png`,
        is_consumable: true,
        effect_type: 'ability',
      })

    if (insertError) {
      const retry = await fromTable(client, 'concords')
        .select('concord_id')
        .eq('concord_id', concord.concordTokenId)
        .maybeSingle()

      if (!retry.data) {
        throw new Error(`Failed to insert concord ${concord.concordTokenId}: ${insertError.message}`)
      }
    }
  }

  async markCharacterConcordSeared(params: {
    tokenId: number
    concord: ConcordSearingMap
    searedAt: string
  }): Promise<void> {
    const { tokenId, concord, searedAt } = params
    const client = this.getClient()

    await this.ensureConcordExists(concord)

    const { data, error } = await fromTable(client, 'character_concords')
      .select('id')
      .eq('token_id', tokenId)
      .eq('concord_id', concord.concordTokenId)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to fetch character_concords row for ${tokenId}/${concord.concordTokenId}: ${error.message}`)
    }

    if (!data) {
      const { error: insertError } = await fromTable(client, 'character_concords')
        .insert({
          token_id: tokenId,
          concord_id: concord.concordTokenId,
          quantity: 1,
          is_seared: true,
          seared_at: searedAt,
        })

      if (!insertError) return
    }

    const { error: updateError } = await fromTable(client, 'character_concords')
      .update({
        is_seared: true,
        seared_at: searedAt,
      })
      .eq('token_id', tokenId)
      .eq('concord_id', concord.concordTokenId)

    if (updateError) {
      throw new Error(`Failed to mark character concord seared for ${tokenId}/${concord.concordTokenId}: ${updateError.message}`)
    }
  }
}

export const characterMaterializationRepository = new CharacterMaterializationRepository()
