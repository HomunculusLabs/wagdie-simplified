import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CharacterProfile } from '@/components/lore/CharacterProfile';
import {
  getAllEffectiveLoreEvents,
  getAllEffectiveLoreLocations,
  getAllEffectiveLoreSeasons,
  getEffectiveCharacterBySlug,
  getEffectiveCharacterConnections,
  getEffectiveEventsForCharacter,
  getEffectiveMediaById,
  getEffectiveSourcesByEventId,
} from '@/lib/lore/effective-query';

export const dynamic = 'force-dynamic';

interface LoreCharacterPageProps {
  params: Promise<{ slug: string }>;
}

const resolveCharacterPageData = async (slug: string) => {
  const character = await getEffectiveCharacterBySlug(slug);

  if (!character) {
    return undefined;
  }

  const [allEffectiveEvents, appearedInEvents, allLocations, seasons, characterConnections, image] = await Promise.all([
    getAllEffectiveLoreEvents(),
    getEffectiveEventsForCharacter(character.id),
    getAllEffectiveLoreLocations(),
    getAllEffectiveLoreSeasons(),
    getEffectiveCharacterConnections(character.id),
    character.imageId ? getEffectiveMediaById(character.imageId) : Promise.resolve(undefined),
  ]);
  const orderedAppearedInEvents = [...appearedInEvents].sort((a, b) => (
    a.timelineOrder - b.timelineOrder || a.title.localeCompare(b.title)
  ));
  const locationById = new Map(allLocations.map((location) => [location.id, location]));
  const associatedLocationIds = new Set(orderedAppearedInEvents.flatMap((event) => event.locationIds));
  const associatedLocations = [...associatedLocationIds].flatMap((locationId) => {
    const location = locationById.get(locationId);
    return location ? [location] : [];
  });
  const firstAppearance = character.firstAppearanceEventId
    ? allEffectiveEvents.find((event) => event.id === character.firstAppearanceEventId)
    : orderedAppearedInEvents[0];
  const sourcesByEventId = await getEffectiveSourcesByEventId(orderedAppearedInEvents);
  const appearedInSources = Object.values(sourcesByEventId).flat();
  const sourceById = new Map(appearedInSources.map((source) => [source.id, source]));

  return {
    character,
    image,
    appearedInEvents: orderedAppearedInEvents,
    firstAppearance,
    associatedLocations,
    characterConnections,
    allLocations,
    seasons,
    sources: [...sourceById.values()],
  };
};

export async function generateMetadata({ params }: LoreCharacterPageProps): Promise<Metadata> {
  const { slug } = await params;
  const character = await getEffectiveCharacterBySlug(slug);

  if (!character) {
    return {
      title: 'Lore character not found | WAGDIE',
    };
  }

  return {
    title: `${character.name} | WAGDIE Lore Character`,
    description: character.summary,
  };
}

export default async function LoreCharacterPage({ params }: LoreCharacterPageProps) {
  const { slug } = await params;
  const data = await resolveCharacterPageData(slug);

  if (!data) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-soul-950">
      <CharacterProfile
        character={data.character}
        image={data.image}
        appearedInEvents={data.appearedInEvents}
        firstAppearance={data.firstAppearance}
        associatedLocations={data.associatedLocations}
        characterConnections={data.characterConnections}
        seasons={data.seasons}
        allLocations={data.allLocations}
        sources={data.sources}
      />
    </div>
  );
}
