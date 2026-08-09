import Image from 'next/image';
import Link from 'next/link';
import { getLoreEventCover } from './lore-event-cover';
import { SourceAttribution } from './SourceAttribution';
import type {
  LoreCharacter,
  LoreEvent,
  LoreSeason,
  SourceRecord,
} from '@/lib/lore/types';

interface LoreEventCardProps {
  event: LoreEvent;
  season?: LoreSeason;
  characters: LoreCharacter[];
  sources?: SourceRecord[];
}

const eventKindLabels: Record<LoreEvent['kind'], string> = {
  official: 'Official',
  community: 'Community',
};

const formatDate = (dateString?: string) => {
  if (!dateString) {
    return 'Undated';
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(dateString));
};

const eventHref = (event: LoreEvent) => {
  return event.kind === 'official'
    ? `/lore/events/${event.slug}`
    : `/lore/community/${event.slug}`;
};

export function LoreEventCard({ event, season, characters, sources = [] }: LoreEventCardProps) {
  const href = eventHref(event);
  const displayDate = formatDate(event.occurredAt ?? event.publishedAt);
  const cover = getLoreEventCover(event, characters);

  return (
    <article className="group grid overflow-hidden border border-midnight-light/60 bg-black/20 transition-colors hover:border-soul-accent/50 md:grid-cols-[18rem_minmax(0,1fr)] xl:min-h-[16.5rem] xl:grid-cols-[22rem_minmax(0,1fr)_22rem]">
      <div className="relative min-h-48 overflow-hidden border-b border-midnight-light/60 bg-soul-900/60 md:min-h-full md:border-b-0 md:border-r">
        {cover.src ? (
          <Image
            src={cover.src}
            alt={cover.alt}
            fill
            sizes="(min-width: 1280px) 22rem, (min-width: 768px) 18rem, 100vw"
            className="object-cover opacity-90 transition duration-500 group-hover:scale-105 group-hover:opacity-100"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-soul-900 via-soul-950 to-black px-8 text-center" aria-hidden="true">
            <span className="font-serif text-5xl text-bone/20">{cover.fallbackInitial}</span>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-col p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2 font-ui text-xs text-mist">
          <span className="border border-parchment/35 bg-parchment/10 px-2 py-1 text-parchment">
            {eventKindLabels[event.kind]} event
          </span>
          {event.kind === 'community' && (
            <span className="border border-arcane-muted/50 bg-arcane/10 px-2 py-1 text-arcane-bright">Community</span>
          )}
          <span>{displayDate}{season ? ` · ${season.title}` : ''}</span>
        </div>

        <Link href={href} className="block">
          <h2 className="font-display text-2xl leading-tight text-parchment transition-colors group-hover:text-bone md:text-3xl">
            {event.title}
          </h2>
        </Link>

        <p className="mt-3 line-clamp-3 font-ui text-sm leading-6 text-ash">
          {event.summary}
        </p>

        {sources.length > 0 && (
          <details className="mt-3 border-t border-midnight-light/40 pt-2 font-ui text-xs text-mist">
            <summary className="cursor-pointer text-parchment/80">{sources.length} source {sources.length === 1 ? 'record' : 'records'}</summary>
            <div className="mt-2">
              <SourceAttribution sources={sources} />
            </div>
          </details>
        )}

        <Link
          href={href}
          className="mt-auto inline-flex pt-3 font-ui text-sm text-soul-accent transition-colors hover:text-bone"
        >
          Read story →
        </Link>
      </div>

      <div className="hidden border-l border-midnight-light/60 p-4 xl:grid xl:grid-cols-2 xl:content-center xl:gap-2">
        {characters.slice(0, 2).map((character) => (
          <Link
            key={character.id}
            href={`/lore/characters/${character.slug}`}
            className="group/portrait relative aspect-square overflow-hidden border border-midnight-light/60 bg-soul-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment"
            aria-label={`View ${character.name}`}
          >
            {character.imageUrl ? (
              <Image
                src={character.imageUrl}
                alt={character.name}
                fill
                sizes="5rem"
                className="object-cover transition-transform duration-300 group-hover/portrait:scale-105"
              />
            ) : (
              <span className="flex h-full items-center justify-center font-display text-3xl text-parchment/40" aria-hidden="true">
                {character.name.trim().charAt(0)}
              </span>
            )}
          </Link>
        ))}
      </div>
    </article>
  );
}
