import type { Character } from '@/types/character'

export function getSearingCharacterName(character: Character): string {
  return character.name || character.metadata?.name || `WAGDIE #${character.token_id}`
}

export function isSearingCharacterSeared(character: Character): boolean {
  return Boolean(
    character.metadata?.isSeared ||
    character.metadata?.searImage ||
    character.metadata?.searing_materialization?.seared_image_url
  )
}
