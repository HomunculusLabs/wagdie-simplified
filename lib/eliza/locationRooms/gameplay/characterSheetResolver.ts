import { characterService } from '@/lib/services/character-service'
import type {
  Character,
  CharacterConcord,
  CharacterMetadata,
  Concord,
  Equipment,
  NFTAttribute,
} from '@/types/character'
import type { GameplaySourceStats } from './types'

export const GAMEPLAY_DEFAULT_SOURCE_STATS: GameplaySourceStats = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
  hp: 10,
  maxHp: 10,
  ac: 10,
  speed: 30,
  level: 1,
  experience: 0,
}

export type GameplayCharacterConcordContext = {
  id: string
  concordId: number
  quantity: number
  isSeared: boolean
  searedAt: string | null
  concord: (Concord & Record<string, unknown>) | null
}

export type GameplayCharacterSheet = {
  tokenId: number
  name: string | null
  sourceStats: GameplaySourceStats
  equipment: Equipment | null
  metadata: CharacterMetadata | null
  metadataTraits: NFTAttribute[]
  concords: GameplayCharacterConcordContext[]
  ownerAddress: string | null
  stakerAddress: string | null
  sheetSnapshotAt: string
}

export interface GameplayCharacterSheetDataSource {
  findCharactersByTokenIds(tokenIds: number[]): Promise<Character[]>
  findCharacterConcords(tokenId: number): Promise<Array<CharacterConcord & { concord: Concord }>>
}

export interface GameplayCharacterSheetResolver {
  resolveSheets(tokenIds: number[], options?: { now?: Date }): Promise<Map<number, GameplayCharacterSheet>>
}

const characterServiceSheetDataSource: GameplayCharacterSheetDataSource = {
  findCharactersByTokenIds(tokenIds: number[]): Promise<Character[]> {
    return characterService.getCharactersByTokenIds(tokenIds)
  },
  findCharacterConcords(tokenId: number): Promise<Array<CharacterConcord & { concord: Concord }>> {
    return characterService.getCharacterConcords(tokenId)
  },
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.round(numeric)))
}

function normalizeWallet(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed.toLowerCase() : null
}

function normalizeEquipment(value: Character['equipment']): Equipment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  return {
    weapons: Array.isArray(value.weapons)
      ? value.weapons.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
      : undefined,
    armor: Array.isArray(value.armor)
      ? value.armor.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
      : undefined,
    items: Array.isArray(value.items)
      ? value.items.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
      : undefined,
    gold: Number.isFinite(value.gold) ? Math.max(0, Math.round(Number(value.gold))) : undefined,
  }
}

export function normalizeGameplaySourceStats(character: Partial<Character> | null | undefined): GameplaySourceStats {
  const maxHp = clampInteger(character?.max_hp, GAMEPLAY_DEFAULT_SOURCE_STATS.maxHp, 1, 999)
  const hp = clampInteger(character?.hp, maxHp, 0, maxHp)

  return {
    str: clampInteger(character?.str, GAMEPLAY_DEFAULT_SOURCE_STATS.str, 1, 30),
    dex: clampInteger(character?.dex, GAMEPLAY_DEFAULT_SOURCE_STATS.dex, 1, 30),
    con: clampInteger(character?.con, GAMEPLAY_DEFAULT_SOURCE_STATS.con, 1, 30),
    int: clampInteger(character?.int, GAMEPLAY_DEFAULT_SOURCE_STATS.int, 1, 30),
    wis: clampInteger(character?.wis, GAMEPLAY_DEFAULT_SOURCE_STATS.wis, 1, 30),
    cha: clampInteger(character?.cha, GAMEPLAY_DEFAULT_SOURCE_STATS.cha, 1, 30),
    hp,
    maxHp,
    ac: clampInteger(character?.ac, GAMEPLAY_DEFAULT_SOURCE_STATS.ac, 1, 30),
    speed: clampInteger(character?.speed, GAMEPLAY_DEFAULT_SOURCE_STATS.speed, 0, 120),
    level: clampInteger(character?.level, GAMEPLAY_DEFAULT_SOURCE_STATS.level, 1, 20),
    experience: clampInteger(character?.experience, GAMEPLAY_DEFAULT_SOURCE_STATS.experience, 0, 999999999),
  }
}

export function normalizeGameplayMetadataTraits(metadata: CharacterMetadata | null | undefined): NFTAttribute[] {
  const attributes = metadata?.attributes
  if (!Array.isArray(attributes)) return []

  return attributes
    .filter((attribute): attribute is NFTAttribute => {
      return Boolean(
        attribute &&
          typeof attribute === 'object' &&
          typeof attribute.trait_type === 'string' &&
          attribute.trait_type.trim() &&
          (typeof attribute.value === 'string' || typeof attribute.value === 'number')
      )
    })
    .map((attribute) => ({
      trait_type: attribute.trait_type.trim(),
      value: attribute.value,
    }))
}

function toConcordContext(row: CharacterConcord & { concord: Concord }): GameplayCharacterConcordContext {
  return {
    id: row.id,
    concordId: row.concord_id,
    quantity: clampInteger(row.quantity, 0, 0, 999999),
    isSeared: row.is_seared === true,
    searedAt: typeof row.seared_at === 'string' ? row.seared_at : null,
    concord: row.concord ? row.concord as Concord & Record<string, unknown> : null,
  }
}

export class DefaultGameplayCharacterSheetResolver implements GameplayCharacterSheetResolver {
  constructor(private readonly dataSource: GameplayCharacterSheetDataSource = characterServiceSheetDataSource) {}

  async resolveSheets(tokenIds: number[], options: { now?: Date } = {}): Promise<Map<number, GameplayCharacterSheet>> {
    const uniqueTokenIds = Array.from(new Set(
      tokenIds.filter((tokenId) => Number.isInteger(tokenId) && tokenId >= 0)
    ))
    const snapshotAt = (options.now ?? new Date()).toISOString()
    const sheets = new Map<number, GameplayCharacterSheet>()
    if (uniqueTokenIds.length === 0) return sheets

    const characters = await this.dataSource.findCharactersByTokenIds(uniqueTokenIds)
    const characterByTokenId = new Map(characters.map((character) => [character.token_id, character]))
    const concordRows = await Promise.all(uniqueTokenIds.map(async (tokenId) => {
      return [tokenId, await this.dataSource.findCharacterConcords(tokenId)] as const
    }))
    const concordsByTokenId = new Map(concordRows)

    for (const tokenId of uniqueTokenIds) {
      const character = characterByTokenId.get(tokenId) ?? null
      sheets.set(tokenId, {
        tokenId,
        name: character?.name ?? character?.metadata?.name ?? null,
        sourceStats: normalizeGameplaySourceStats(character),
        equipment: normalizeEquipment(character?.equipment ?? null),
        metadata: character?.metadata ?? null,
        metadataTraits: normalizeGameplayMetadataTraits(character?.metadata),
        concords: (concordsByTokenId.get(tokenId) ?? []).map(toConcordContext),
        ownerAddress: normalizeWallet(character?.owner_address),
        stakerAddress: normalizeWallet(character?.staker_address),
        sheetSnapshotAt: snapshotAt,
      })
    }

    return sheets
  }
}

export const gameplayCharacterSheetResolver = new DefaultGameplayCharacterSheetResolver()
