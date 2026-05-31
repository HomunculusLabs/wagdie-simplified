import type { LoreCharacter, LoreEvent } from '@/lib/lore/types'

export type LoreEventHrefTarget = Pick<LoreEvent, 'kind' | 'slug'>
export type LoreCharacterHrefTarget = Pick<LoreCharacter, 'slug'>
export type LoreLocationHrefTarget = { slug: string }

export function getLoreEventHref(event: LoreEventHrefTarget): string {
  return event.kind === 'official'
    ? `/lore/events/${event.slug}`
    : `/lore/community/${event.slug}`
}

export function getLoreCharacterHref(character: LoreCharacterHrefTarget): string {
  return `/lore/characters/${character.slug}`
}

export function getLoreLocationHref(location: LoreLocationHrefTarget): string {
  return `/lore/locations/${location.slug}`
}
