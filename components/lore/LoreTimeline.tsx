import { LoreEventCard } from './LoreEventCard';
import type { LoreCharacter, LoreEvent, LoreLocation, LoreSeason, SourceRecord } from '@/lib/lore/types';

interface LoreTimelineProps {
  items: LoreEvent[];
  seasons: LoreSeason[];
  locations?: LoreLocation[];
  characters: LoreCharacter[];
  sourcesByEventId?: Record<string, SourceRecord[]>;
}

export function LoreTimeline({ items, seasons, characters, sourcesByEventId = {} }: LoreTimelineProps) {
  const seasonsById = new Map(seasons.map((season) => [season.id, season]));
  const charactersById = new Map(characters.map((character) => [character.id, character]));

  return (
    <div className="max-h-[54rem] space-y-3 overflow-y-auto pr-2">
      {items.map((event) => (
        <LoreEventCard
          key={event.id}
          event={event}
          season={event.seasonId ? seasonsById.get(event.seasonId) : undefined}
          sources={sourcesByEventId[event.id] ?? []}
          characters={event.characterIds.flatMap((characterId) => {
            const character = charactersById.get(characterId);
            return character ? [character] : [];
          })}
        />
      ))}
    </div>
  );
}
