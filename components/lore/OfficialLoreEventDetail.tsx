import Image from 'next/image';
import Link from 'next/link';
import { CharacterPortrait } from './CharacterPortrait';
import { EntityChips } from './EntityChips';
import { LoreEventCard } from './LoreEventCard';
import { SourceList } from './SourceList';
import { canonStatusLabels } from './CanonStatusBadge';
import { getLoreEventCover } from './lore-event-cover';
import type {
  LoreCharacter,
  LoreEvent,
  LoreLocation,
  LoreMedia,
  LoreResolvedEntity,
  LoreSeason,
  SourceRecord,
} from '@/lib/lore/types';

export interface OfficialLoreRelatedContext {
  timelineNeighbors: {
    previous?: LoreEvent;
    next?: LoreEvent;
  };
  connectedEvents: LoreEvent[];
}

interface OfficialLoreEventDetailProps {
  event: LoreEvent;
  season?: LoreSeason;
  locations: LoreLocation[];
  characters: LoreCharacter[];
  relatedEntities: LoreResolvedEntity[];
  sources: SourceRecord[];
  media: LoreMedia[];
  relatedContext: OfficialLoreRelatedContext;
  seasons: LoreSeason[];
  allCharacters: LoreCharacter[];
}

const formatDate = (dateString?: string) => {
  if (!dateString) {
    return 'Undated';
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(dateString));
};

const eventHref = (event: LoreEvent) => {
  return event.kind === 'official'
    ? `/lore/events/${event.slug}`
    : `/lore/community/${event.slug}`;
};

const relatedEntityHref = (entity: LoreResolvedEntity) => {
  if (!entity.slug) {
    return undefined;
  }

  if (entity.kind === 'character') {
    return `/lore/characters/${entity.slug}`;
  }

  if (entity.kind === 'location') {
    return `/lore/locations/${entity.slug}`;
  }

  if (entity.kind === 'event') {
    return `/lore?keyword=${entity.slug}`;
  }

  return undefined;
};

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="font-serif text-sm uppercase tracking-[0.08em] text-soul-accent/80">
        {eyebrow}
      </p>
      <h2 className="mt-2 font-serif text-3xl leading-tight text-bone md:text-4xl">
        {title}
      </h2>
    </div>
  );
}

const mediaSrc = (media: LoreMedia) => media.url ?? media.archivedUrl;

function CompactMediaArchive({ media }: { media: LoreMedia[] }) {
  if (media.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4 border-y border-midnight-light/25 py-6">
      <SectionHeading eyebrow="Preserved media" title="Archived fragments" />
      <div className="grid gap-3 md:grid-cols-2">
        {media.map((item) => {
          const src = mediaSrc(item);
          const previewable = Boolean(src && (item.kind === 'image' || item.kind === 'video'));

          return (
            <article key={item.id} className="border border-midnight-light/35 bg-black/15 p-4 font-serif">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-lg leading-tight text-bone">{item.title}</p>
                  <p className="text-sm leading-6 text-neutral-400">{item.attribution}</p>
                </div>
                <span className="border border-midnight-light/50 px-2 py-1 text-xs uppercase tracking-[0.08em] text-neutral-500">
                  {previewable ? item.kind : 'Archived'}
                </span>
              </div>
              {src && (
                <p className="mt-3 break-all border-t border-midnight-light/25 pt-3 text-xs text-neutral-600">
                  {previewable ? 'Preview source' : 'Archive path'}: {src}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TimelineNeighborCard({ event, label }: { event: LoreEvent; label: string }) {
  return (
    <Link
      href={eventHref(event)}
      className="group block border border-midnight-light/40 bg-black/20 p-5 transition-colors hover:border-soul-accent/50 hover:bg-soul-900/35"
    >
      <p className="font-serif text-xs uppercase tracking-[0.12em] text-neutral-500">
        {label}
      </p>
      <h3 className="mt-3 font-serif text-2xl leading-tight text-bone transition-colors group-hover:text-soul-accent">
        {event.title}
      </h3>
      <p className="mt-3 line-clamp-2 font-serif text-sm leading-6 text-neutral-400">
        {event.summary}
      </p>
    </Link>
  );
}

export function OfficialLoreEventDetail({
  event,
  season,
  locations,
  characters,
  relatedEntities,
  sources,
  media,
  relatedContext,
  seasons,
  allCharacters,
}: OfficialLoreEventDetailProps) {
  const occurredAt = formatDate(event.occurredAt ?? event.publishedAt);
  const cover = getLoreEventCover(event, characters);
  const seasonById = new Map(seasons.map((item) => [item.id, item]));
  const characterById = new Map(allCharacters.map((character) => [character.id, character]));
  const timelineNeighborIds = new Set([
    relatedContext.timelineNeighbors.previous?.id,
    relatedContext.timelineNeighbors.next?.id,
  ].filter(Boolean));
  const relatedEntityItems = relatedEntities
    .filter((entity) => (
      !characters.some((character) => character.name === entity.name) &&
      !locations.some((location) => location.name === entity.name)
    ))
    .map((entity) => ({
      label: entity.name,
      href: relatedEntityHref(entity),
    }));
  const visibleConnectedEvents = relatedContext.connectedEvents
    .filter((connectedEvent) => !timelineNeighborIds.has(connectedEvent.id))
    .slice(0, 4);
  const connectedGridClass = visibleConnectedEvents.length > 2
    ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4'
    : 'grid gap-4 md:grid-cols-2';

  return (
    <main className="container mx-auto max-w-7xl space-y-8 px-4 py-8 md:py-12">
      <nav className="flex flex-wrap items-center justify-between gap-3 border-b border-midnight-light/25 pb-5 font-serif text-sm text-neutral-400">
        <Link href="/lore" className="transition-colors hover:text-soul-accent">
          ← Back to lore archive
        </Link>
        <Link href="/lore?canonStatus=canon" className="transition-colors hover:text-soul-accent">
          Browse official canon
        </Link>
      </nav>

      <section className="overflow-hidden border border-midnight-light/35 bg-black/20">
        <div className="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="relative min-h-[20rem] bg-soul-900/60 md:min-h-[28rem] lg:min-h-full">
            {cover.src ? (
              <Image
                src={cover.src}
                alt={cover.alt}
                fill
                priority
                sizes="(min-width: 1024px) 46vw, 100vw"
                className="object-cover opacity-90"
              />
            ) : (
              <div className="flex h-full min-h-[20rem] items-center justify-center bg-gradient-to-br from-soul-900 via-soul-950 to-black px-8 text-center" aria-hidden="true">
                <span className="font-serif text-8xl text-bone/20">{cover.fallbackInitial}</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" aria-hidden="true" />
          </div>

          <div className="space-y-6 p-6 md:p-8 lg:p-10">
            <div className="flex flex-wrap gap-2">
              <span className="border border-soul-accent/40 bg-soul-accent/10 px-3 py-1 font-serif text-xs uppercase tracking-[0.12em] text-soul-accent">
                Official record
              </span>
              <span className="border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 font-serif text-xs uppercase tracking-[0.12em] text-emerald-300">
                {canonStatusLabels[event.canon.status]}
              </span>
            </div>

            <div className="space-y-4">
              <p className="font-serif text-sm uppercase tracking-[0.08em] text-neutral-500">
                {season?.title ?? 'Unseasoned'} · {occurredAt} · Timeline {event.timelineOrder}
              </p>
              <h1 className="font-serif text-4xl leading-tight text-bone md:text-6xl">
                {event.title}
              </h1>
              <p className="max-w-3xl font-serif text-xl leading-8 text-neutral-300 md:text-2xl md:leading-9">
                {event.summary}
              </p>
            </div>

            <div className="grid gap-3 border-t border-midnight-light/25 pt-5 font-serif text-sm text-neutral-400 sm:grid-cols-3">
              <div>
                <p className="uppercase tracking-[0.12em] text-neutral-600">Season</p>
                <p className="mt-1 text-neutral-300">{season?.title ?? 'Unseasoned'}</p>
              </div>
              <div>
                <p className="uppercase tracking-[0.12em] text-neutral-600">Recorded</p>
                <p className="mt-1 text-neutral-300">{occurredAt}</p>
              </div>
              <div>
                <p className="uppercase tracking-[0.12em] text-neutral-600">Archive</p>
                <p className="mt-1 text-neutral-300">Official lore</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <article className="space-y-6 border border-midnight-light/35 bg-black/20 p-6 md:p-8">
          <SectionHeading eyebrow="Chronicle" title="The record" />
          <div className="space-y-6 font-serif text-xl leading-9 text-neutral-200 md:text-2xl md:leading-10">
            {event.body.split('\n').filter(Boolean).map((paragraph, index) => (
              <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
            ))}
          </div>
        </article>

        <aside className="space-y-6 border border-midnight-light/35 bg-soul-900/35 p-6 md:p-7">
          <SectionHeading eyebrow="Story context" title="In this telling" />

          {characters.length > 0 && (
            <div className="space-y-3">
              <p className="font-serif text-sm uppercase tracking-[0.06em] text-neutral-400">
                Characters
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {characters.map((character) => (
                  <CharacterPortrait
                    key={character.id}
                    character={character}
                    href={`/lore/characters/${character.slug}`}
                    size="sm"
                  />
                ))}
              </div>
            </div>
          )}

          <EntityChips
            label="Locations"
            items={locations.map((location) => ({
              label: location.name,
              href: `/lore/locations/${location.slug}`,
            }))}
          />
          {relatedEntityItems.length > 0 && (
            <EntityChips
              label="Related entities"
              items={relatedEntityItems}
              emptyLabel="No additional entities"
            />
          )}

          <div className="space-y-2 border-t border-midnight-light/25 pt-4">
            <p className="font-serif text-sm uppercase tracking-[0.06em] text-neutral-400">
              Browse by context
            </p>
            <div className="flex flex-wrap gap-2">
              {season && (
                <Link href={`/lore?season=${season.slug}`} className="border border-midnight-light/60 bg-midnight/40 px-2.5 py-1 text-sm font-serif text-neutral-100 transition-colors hover:border-soul-accent/50 hover:text-soul-accent">
                  {season.title}
                </Link>
              )}
              {locations.map((location) => (
                <Link key={location.id} href={`/lore?location=${location.slug}`} className="border border-midnight-light/60 bg-midnight/40 px-2.5 py-1 text-sm font-serif text-neutral-100 transition-colors hover:border-soul-accent/50 hover:text-soul-accent">
                  {location.name}
                </Link>
              ))}

            </div>
          </div>
        </aside>
      </section>

      <CompactMediaArchive media={media} />

      {(relatedContext.timelineNeighbors.previous || relatedContext.timelineNeighbors.next || visibleConnectedEvents.length > 0) && (
        <section className="space-y-5">
          <SectionHeading eyebrow="Related context" title="Nearby in the archive" />

          {(relatedContext.timelineNeighbors.previous || relatedContext.timelineNeighbors.next) && (
            <div className="grid gap-4 md:grid-cols-2">
              {relatedContext.timelineNeighbors.previous && (
                <TimelineNeighborCard event={relatedContext.timelineNeighbors.previous} label="Previous official record" />
              )}
              {relatedContext.timelineNeighbors.next && (
                <TimelineNeighborCard event={relatedContext.timelineNeighbors.next} label="Next official record" />
              )}
            </div>
          )}

          {visibleConnectedEvents.length > 0 && (
            <div className="space-y-3">
              <p className="font-serif text-sm uppercase tracking-[0.08em] text-neutral-500">
                Connected records
              </p>
              <div className={connectedGridClass}>
                {visibleConnectedEvents.map((connectedEvent) => (
                  <LoreEventCard
                    key={connectedEvent.id}
                    event={connectedEvent}
                    season={connectedEvent.seasonId ? seasonById.get(connectedEvent.seasonId) : undefined}
                    characters={connectedEvent.characterIds.flatMap((characterId) => {
                      const character = characterById.get(characterId);
                      return character ? [character] : [];
                    })}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <details className="group border border-midnight-light/30 bg-black/15 p-5 font-serif text-neutral-300">
        <summary className="cursor-pointer text-sm uppercase tracking-[0.08em] text-neutral-400 transition-colors hover:text-soul-accent">
          Sources and provenance
        </summary>
        <div className="mt-5 border-t border-midnight-light/25 pt-5">
          <SourceList sources={sources} title="Secondary provenance" variant="compact" />
        </div>
      </details>
    </main>
  );
}
