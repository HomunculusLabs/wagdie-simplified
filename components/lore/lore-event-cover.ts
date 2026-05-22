import type { LoreCharacter, LoreEvent } from '@/lib/lore/types';

export type LoreEventCoverSource = 'event' | 'character' | 'none';

export interface LoreEventCover {
  src?: string;
  alt: string;
  source: LoreEventCoverSource;
  fallbackInitial: string;
}

const eventCoverImages: Record<string, string> = {
  'genesis-mint': '/images/lore/archive/genesis-mint.jpg',
  'first-citadel-march': '/images/lore/archive/first-citadel-march.jpg',
  'searing-rite': '/images/lore/archive/searing-rite.jpg',
  'pilgrims-of-the-ashen-road': '/images/lore/archive/ashen-road-pilgrims.jpg',
  'ash-cartographer-chart': '/images/lore/archive/ash-cartographer-chart.jpg',
  'rumor-beneath-the-citadel': '/images/lore/archive/rumor-beneath-citadel.jpg',
};

export function getLoreEventCover(event: LoreEvent, characters: LoreCharacter[]): LoreEventCover {
  const explicitCover = eventCoverImages[event.slug];
  const fallbackInitial = event.title.trim().charAt(0) || 'W';

  if (explicitCover) {
    return {
      src: explicitCover,
      alt: `${event.title} lore cover`,
      source: 'event',
      fallbackInitial,
    };
  }

  const imageCharacter = characters.find((character) => character.imageUrl);

  if (imageCharacter?.imageUrl) {
    return {
      src: imageCharacter.imageUrl,
      alt: `${imageCharacter.name}, featured in ${event.title}`,
      source: 'character',
      fallbackInitial,
    };
  }

  return {
    alt: `${event.title} has no cover image`,
    source: 'none',
    fallbackInitial,
  };
}
