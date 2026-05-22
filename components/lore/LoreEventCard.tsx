import Image from 'next/image';
import Link from 'next/link';
import { getLoreEventCover } from './lore-event-cover';
import type {
  LoreCharacter,
  LoreEvent,
  LoreSeason,
} from '@/lib/lore/types';

interface LoreEventCardProps {
  event: LoreEvent;
  season?: LoreSeason;
  characters: LoreCharacter[];
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

export function LoreEventCard({ event, season, characters }: LoreEventCardProps) {
  const href = eventHref(event);
  const displayDate = formatDate(event.occurredAt ?? event.publishedAt);
  const cover = getLoreEventCover(event, characters);

  return (
    <article className="group overflow-hidden border border-midnight-light/35 bg-black/20 transition-colors hover:border-soul-accent/50">
      <div className="relative aspect-[16/9] overflow-hidden bg-soul-900/60">
        {cover.src ? (
          <Image
            src={cover.src}
            alt={cover.alt}
            fill
            sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover opacity-85 transition duration-500 group-hover:scale-105 group-hover:opacity-100"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-soul-900 via-soul-950 to-black px-8 text-center" aria-hidden="true">
            <span className="font-serif text-5xl text-bone/20">{cover.fallbackInitial}</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent" aria-hidden="true" />
      </div>

      <div className="space-y-3 p-4">
        <p className="font-serif text-xs text-neutral-400">
          {displayDate} · {eventKindLabels[event.kind]}{season ? ` · ${season.title}` : ''}
        </p>

        <Link href={href} className="block">
          <h2 className="font-serif text-xl leading-tight text-bone transition-colors group-hover:text-soul-accent md:text-2xl">
            {event.title}
          </h2>
        </Link>

        <p className="line-clamp-2 font-serif text-sm leading-6 text-neutral-300">
          {event.summary}
        </p>

        <Link
          href={href}
          className="inline-flex font-serif text-sm text-soul-accent transition-colors hover:text-bone"
        >
          Read story →
        </Link>
      </div>
    </article>
  );
}
