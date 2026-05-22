import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  OfficialLoreEventDetail,
  type OfficialLoreRelatedContext,
} from '@/components/lore/OfficialLoreEventDetail';
import {
  getAllEffectiveLoreCharacters,
  getAllEffectiveLoreEvents,
  getAllEffectiveLoreLocations,
  getAllEffectiveLoreSeasons,
  getEffectiveMediaForEvent,
  getEffectiveOfficialEventBySlug,
  getEffectiveRelatedEntitiesForEvent,
  getEffectiveSourcesForEvent,
} from '@/lib/lore/effective-query';
import type { LoreEvent } from '@/lib/lore/types';

export const dynamic = 'force-dynamic';

interface LoreEventPageProps {
  params: Promise<{ slug: string }>;
}

const sortByTimeline = (events: LoreEvent[]) => {
  return [...events].sort((a, b) => a.timelineOrder - b.timelineOrder || a.title.localeCompare(b.title));
};

const getSharedCount = (left: string[], right: string[]) => {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item)).length;
};

const getRelatedContext = (event: LoreEvent, allEvents: LoreEvent[]): OfficialLoreRelatedContext => {
  const officialTimeline = sortByTimeline(allEvents.filter((candidate) => candidate.kind === 'official'));
  const currentTimelineIndex = officialTimeline.findIndex((candidate) => candidate.id === event.id);
  const timelineNeighbors = {
    previous: currentTimelineIndex > 0 ? officialTimeline[currentTimelineIndex - 1] : undefined,
    next: currentTimelineIndex >= 0 && currentTimelineIndex < officialTimeline.length - 1
      ? officialTimeline[currentTimelineIndex + 1]
      : undefined,
  };

  const connectedEvents = allEvents
    .filter((candidate) => candidate.id !== event.id)
    .map((candidate) => {
      const sharedCharacters = getSharedCount(candidate.characterIds, event.characterIds);
      const sharedLocations = getSharedCount(candidate.locationIds, event.locationIds);
      const sameSeason = Boolean(candidate.seasonId && candidate.seasonId === event.seasonId);
      const timelineDistance = Math.abs(candidate.timelineOrder - event.timelineOrder);
      const score = (sharedCharacters * 8) + (sharedLocations * 5) + (sameSeason ? 2 : 0) - (Math.min(timelineDistance, 100) / 100);

      return {
        event: candidate,
        score,
        sharedCharacters,
        sharedLocations,
        timelineDistance,
      };
    })
    .filter((candidate) => candidate.sharedCharacters > 0 || candidate.sharedLocations > 0)
    .sort((a, b) => (
      b.score - a.score ||
      a.timelineDistance - b.timelineDistance ||
      a.event.title.localeCompare(b.event.title)
    ))
    // Keep a small buffer so the presentation layer can de-dupe timeline neighbors
    // while still rendering up to four connected cards.
    .slice(0, 6)
    .map((candidate) => candidate.event);

  return {
    timelineNeighbors,
    connectedEvents,
  };
};

const resolveEventPageData = async (slug: string) => {
  const [event, allEvents, allCharacters, allLocations, seasons] = await Promise.all([
    getEffectiveOfficialEventBySlug(slug),
    getAllEffectiveLoreEvents(),
    getAllEffectiveLoreCharacters(),
    getAllEffectiveLoreLocations(),
    getAllEffectiveLoreSeasons(),
  ]);

  if (!event) {
    return undefined;
  }

  const characterById = new Map(allCharacters.map((character) => [character.id, character]));
  const locationById = new Map(allLocations.map((location) => [location.id, location]));

  return {
    event,
    locations: event.locationIds.flatMap((locationId) => {
      const location = locationById.get(locationId);
      return location ? [location] : [];
    }),
    characters: event.characterIds.flatMap((characterId) => {
      const character = characterById.get(characterId);
      return character ? [character] : [];
    }),
    season: event.seasonId ? seasons.find((season) => season.id === event.seasonId) : undefined,
    relatedEntities: await getEffectiveRelatedEntitiesForEvent(event),
    sources: await getEffectiveSourcesForEvent(event),
    media: await getEffectiveMediaForEvent(event),
    relatedContext: getRelatedContext(event, allEvents),
    seasons,
    allCharacters,
  };
};

export async function generateMetadata({ params }: LoreEventPageProps): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEffectiveOfficialEventBySlug(slug);

  if (!event) {
    return {
      title: 'Official lore record not found | WAGDIE',
    };
  }

  return {
    title: `${event.title} | WAGDIE Lore`,
    description: event.summary,
  };
}

export default async function OfficialLoreEventPage({ params }: LoreEventPageProps) {
  const { slug } = await params;
  const data = await resolveEventPageData(slug);

  if (!data) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-soul-950">
      <OfficialLoreEventDetail
        event={data.event}
        season={data.season}
        locations={data.locations}
        characters={data.characters}
        relatedEntities={data.relatedEntities}
        sources={data.sources}
        media={data.media}
        relatedContext={data.relatedContext}
        seasons={data.seasons}
        allCharacters={data.allCharacters}
      />
    </div>
  );
}
