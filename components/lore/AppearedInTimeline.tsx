import Image from 'next/image';
import Link from 'next/link';
import { CanonStatusBadge } from './CanonStatusBadge';
import { getLoreEventCover } from './lore-event-cover';
import { getLoreEventHref } from '@/lib/lore/navigation';
import type { LoreEvent, LoreLocation, LoreSeason } from '@/lib/lore/types';

interface AppearedInTimelineProps {
  events: LoreEvent[];
  seasons: LoreSeason[];
  locations: LoreLocation[];
}

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

export function AppearedInTimeline({ events, seasons, locations }: AppearedInTimelineProps) {
  const seasonById = new Map(seasons.map((season) => [season.id, season]));
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const orderedEvents = [...events].sort((a, b) => a.timelineOrder - b.timelineOrder || a.title.localeCompare(b.title));

  if (orderedEvents.length === 0) {
    return (
      <section className="border border-midnight-light/50 bg-black/20 p-6 font-serif text-base text-neutral-200">
        No appeared-in events are currently attached to this character.
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="border-b border-midnight-light/60 pb-4">
        <p className="font-ui text-xs uppercase tracking-[0.18em] text-soul-accent">
          Appeared in
        </p>
        <h2 className="mt-2 font-display text-3xl text-parchment">
          Timeline appearances
        </h2>
      </div>

      <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {orderedEvents.map((event) => {
          const season = event.seasonId ? seasonById.get(event.seasonId) : undefined;
          const eventLocations = event.locationIds.flatMap((locationId) => {
            const location = locationById.get(locationId);
            return location ? [location] : [];
          });
          const cover = getLoreEventCover(event, []);

          return (
            <li key={event.id} className="group flex min-h-full flex-col overflow-hidden border border-midnight-light/50 bg-soul-900/40 transition-colors hover:border-soul-accent/40">
              {cover.src && (
                <Link href={getLoreEventHref(event)} className="relative block aspect-[16/8] overflow-hidden border-b border-midnight-light/50">
                  <Image
                    src={cover.src}
                    alt={cover.alt}
                    fill
                    sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
                    className="object-cover opacity-90 transition duration-500 group-hover:scale-105 group-hover:opacity-100"
                  />
                </Link>
              )}
              <div className="flex flex-1 flex-col p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`border px-2.5 py-1 text-sm font-serif uppercase tracking-[0.06em] ${event.kind === 'official' ? 'border-soul-accent/40 bg-soul-accent/10 text-soul-accent' : 'border-sky-400/40 bg-sky-400/10 text-sky-300'}`}>
                  {event.kind === 'official' ? 'Official' : 'Community'}
                </span>
                <CanonStatusBadge status={event.canon.status} stageId={event.canon.stageId} />
              </div>

              <Link href={getLoreEventHref(event)} className="mt-3 block group">
                <h3 className="font-display text-2xl text-parchment transition-colors group-hover:text-soul-accent">
                  {event.title}
                </h3>
              </Link>

              <p className="mt-2 line-clamp-3 font-ui text-sm leading-6 text-ash">
                {event.summary}
              </p>

              <div className="mt-auto flex flex-wrap gap-2 pt-4 font-ui text-xs text-mist">
                <span>{season?.title ?? 'Unseasoned'}</span>
                <span>/</span>
                <span>{formatDate(event.occurredAt ?? event.publishedAt)}</span>
                <span>/</span>
                <span>Order {event.timelineOrder}</span>
              </div>

              {eventLocations.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {eventLocations.map((location) => (
                    <Link
                      key={location.id}
                      href={`/lore/locations/${location.slug}`}
                      className="border border-midnight-light/60 px-2 py-1 text-sm font-serif text-neutral-200 transition-colors hover:border-soul-accent/50 hover:text-soul-accent"
                    >
                      {location.name}
                    </Link>
                  ))}
                </div>
              )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
