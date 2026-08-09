import Link from 'next/link';
import { LoreArchiveCarousel, type LoreArchiveCarouselSlide } from './LoreArchiveCarousel';
import { LoreArchiveViewNav } from './LoreArchiveViewNav';
import { LoreArchiveSort, type LoreArchiveSortValue } from './LoreArchiveSort';
import { LoreCharacterArchiveGrid } from './LoreCharacterArchiveGrid';
import { LoreFilterBar } from './LoreFilterBar';
import { LoreTimeline } from './LoreTimeline';
import { getLoreEventCover } from './lore-event-cover';
import { canonStatusLabels, getCanonizationStageDefinition } from '@/lib/lore/canonization';
import { buildLoreArchiveHref, type ArchiveView } from '@/lib/lore/archive-view-params';
import type { LoreCharacterArchivePage } from '@/lib/lore/archive-character-summary';
import type {
  LoreArchiveFilters,
  LoreCharacter,
  LoreEvent,
  LoreLocation,
  LoreSeason,
  SourceRecord,
} from '@/lib/lore/types';

interface LoreArchiveProps {
  view: ArchiveView;
  items: LoreEvent[];
  characterArchive: LoreCharacterArchivePage;
  filters: LoreArchiveFilters;
  seasons: LoreSeason[];
  locations: LoreLocation[];
  characters: LoreCharacter[];
  sourcesByEventId?: Record<string, SourceRecord[]>;
  sort?: LoreArchiveSortValue;
}

export const hasActiveLoreArchiveFilters = (filters: LoreArchiveFilters) => Boolean(
  filters.season ||
  filters.location ||
  filters.character ||
  filters.keyword ||
  filters.canonStatus ||
  filters.canonStage
);

const buildActiveFilterLabels = (
  filters: LoreArchiveFilters,
  seasons: LoreSeason[],
  locations: LoreLocation[],
  characters: LoreCharacter[],
) => {
  const labels: string[] = [];
  const season = seasons.find((item) => item.slug === filters.season || item.id === filters.season);
  const location = locations.find((item) => item.slug === filters.location || item.id === filters.location);
  const character = characters.find((item) => item.slug === filters.character || item.id === filters.character);

  if (filters.season) labels.push(`Season: ${season?.title ?? filters.season}`);
  if (filters.location) labels.push(`Location: ${location?.name ?? filters.location}`);
  if (filters.character) labels.push(`Character: ${character?.name ?? filters.character}`);
  if (filters.keyword) labels.push(`Keyword: “${filters.keyword}”`);
  if (filters.canonStatus) labels.push(`Canon: ${canonStatusLabels[filters.canonStatus]}`);
  if (filters.canonStage) {
    labels.push(`Stage: ${getCanonizationStageDefinition(filters.canonStage).label}`);
  }

  return labels;
};

export function LoreArchive({
  view,
  items,
  characterArchive,
  filters,
  seasons,
  locations,
  characters,
  sourcesByEventId = {},
  sort = 'date',
}: LoreArchiveProps) {
  const activeFilters = buildActiveFilterLabels(filters, seasons, locations, characters);
  const active = hasActiveLoreArchiveFilters(filters);
  const clearFiltersHref = buildLoreArchiveHref({ view });
  const carouselSlides = items.reduce<LoreArchiveCarouselSlide[]>((slides, event) => {
    if (slides.length >= 6) return slides;

    const eventCharacters = characters.filter((character) => event.characterIds.includes(character.id));
    const cover = getLoreEventCover(event, eventCharacters);
    if (!cover.src) return slides;

    const season = seasons.find((item) => item.id === event.seasonId);
    const href = event.kind === 'official'
      ? `/lore/events/${event.slug}`
      : `/lore/community/${event.slug}`;

    slides.push({
      id: event.id,
      title: event.title,
      summary: event.summary,
      imageUrl: cover.src,
      imageAlt: cover.alt,
      href,
      eyebrow: season?.title ?? (event.kind === 'official' ? 'Official record' : 'Community chronicle'),
    });

    return slides;
  }, []);

  return (
    <main className="mx-auto w-full max-w-[1920px] px-4 pb-28 sm:px-6 lg:px-8">
      <LoreArchiveCarousel slides={carouselSlides} />

      <div className="mt-10">
        <LoreFilterBar
          view={view}
          filters={filters}
          seasons={seasons}
          locations={locations}
          characters={characters}
        />
      </div>

      <section className="mt-8 border border-midnight-light/70 bg-midnight/20 p-4 sm:p-6 lg:p-[4.25rem]">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-midnight-light/50">
          <LoreArchiveViewNav view={view} filters={filters} />
          <LoreArchiveSort value={sort} />
        </div>

        {active && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-midnight-light/50 py-4 font-ui text-sm text-ash" aria-live="polite">
            <p>Filtered by {activeFilters.join(' · ')}</p>
            <Link href={clearFiltersHref} className="inline-flex min-h-11 items-center text-arcane-bright transition-colors hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arcane-bright">
              Clear filters
            </Link>
          </div>
        )}

        <div className="pt-5">
          {view === 'characters' ? (
            <LoreCharacterArchiveGrid
              archivePage={characterArchive}
              filters={filters}
              hasActiveFilters={active}
            />
          ) : items.length > 0 ? (
            <LoreTimeline
              items={items}
              seasons={seasons}
              locations={locations}
              characters={characters}
              sourcesByEventId={sourcesByEventId}
            />
          ) : (
            <section className="border border-midnight-light/60 bg-midnight/35 p-8 text-center md:p-12">
              <h2 className="font-display text-3xl text-parchment md:text-4xl">No stories found</h2>
              <p className="mx-auto mt-4 max-w-xl font-ui text-base leading-7 text-ash">
                Nothing matches {activeFilters.length > 0 ? activeFilters.join(', ') : 'the selected filters'}.
              </p>
              {active && (
                <Link
                  href={clearFiltersHref}
                  className="mt-7 inline-flex min-h-11 items-center border border-arcane-muted px-5 font-ui text-sm text-arcane-bright transition-colors hover:border-arcane-bright hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arcane-bright"
                >
                  Clear filters
                </Link>
              )}
            </section>
          )}
        </div>
      </section>

      <section className="mx-auto mt-24 max-w-[1268px] border border-midnight-light/70 px-6 py-14 text-center sm:px-10" aria-labelledby="archive-community-heading">
        <h2 id="archive-community-heading" className="font-display text-3xl text-parchment sm:text-4xl">
          Join the Community &amp; Decide your Fate
        </h2>
        <p className="mx-auto mt-3 max-w-2xl font-ui text-sm leading-6 text-mist sm:text-base">
          Join Discord and help shape the stories the Archive preserves.
        </p>
        <a
          href={process.env.NEXT_PUBLIC_DISCORD_URL || 'https://discord.gg/wagdie'}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex min-h-11 min-w-44 items-center justify-center border border-parchment/60 bg-parchment/60 px-6 font-ui text-sm text-soul-950 transition-colors hover:bg-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment"
        >
          Join Discord
        </a>
      </section>
    </main>
  );
}
