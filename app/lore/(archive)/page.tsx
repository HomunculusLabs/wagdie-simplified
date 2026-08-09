import { LoreArchive } from '@/components/lore/LoreArchive';
import type { LoreArchiveSortValue } from '@/components/lore/LoreArchiveSort';
import { parseLoreArchiveFilters } from '@/lib/lore/archive-filter-params';
import { buildLoreCharacterArchive } from '@/lib/lore/archive-character-summary';
import { parseArchiveViewParams } from '@/lib/lore/archive-view-params';
import {
  getAllEffectiveLoreCharacters,
  getAllEffectiveLoreEvents,
  getAllEffectiveLoreLocations,
  getAllEffectiveLoreSeasons,
  getEffectiveArchiveItems,
  getEffectiveSourcesByEventId,
} from '@/lib/lore/effective-query';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

interface LorePageProps {
  searchParams?: Promise<SearchParams>;
}

export default async function LorePage({ searchParams }: LorePageProps) {
  const resolvedSearchParams = await searchParams;
  const filters = parseLoreArchiveFilters(resolvedSearchParams);
  const { view, page } = parseArchiveViewParams(resolvedSearchParams);
  const rawSort = Array.isArray(resolvedSearchParams?.sort)
    ? resolvedSearchParams.sort[0]
    : resolvedSearchParams?.sort;
  const sort: LoreArchiveSortValue = rawSort === 'title' ? 'title' : 'date';
  const [archiveItems, seasons, locations, characters, allEvents] = await Promise.all([
    getEffectiveArchiveItems(filters),
    getAllEffectiveLoreSeasons(),
    getAllEffectiveLoreLocations(),
    getAllEffectiveLoreCharacters(),
    view === 'characters' ? getAllEffectiveLoreEvents() : Promise.resolve([]),
  ]);
  const items = [...archiveItems].sort((left, right) => (
    sort === 'title'
      ? left.title.localeCompare(right.title)
      : left.timelineOrder - right.timelineOrder || left.title.localeCompare(right.title)
  ));
  const filtered = Boolean(
    filters.season ||
    filters.location ||
    filters.character ||
    filters.keyword ||
    filters.canonStatus ||
    filters.canonStage
  );
  const characterArchive = buildLoreCharacterArchive({
    characters,
    allEvents,
    matchingEvents: items,
    filtered,
    page,
    sort,
  });
  const sourcesByEventId = view === 'timeline'
    ? await getEffectiveSourcesByEventId(items)
    : {};
  return (
    <div className="min-h-screen bg-soul-950">
      <LoreArchive
        view={view}
        items={items}
        characterArchive={characterArchive}
        filters={filters}
        seasons={seasons}
        locations={locations}
        characters={characters}
        sourcesByEventId={sourcesByEventId}
        sort={sort}
      />
    </div>
  );
}
