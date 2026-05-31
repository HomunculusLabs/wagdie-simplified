import Link from 'next/link';
import { CanonStatusBadge } from './CanonStatusBadge';
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
      <div>
        <p className="text-sm font-serif uppercase tracking-[0.06em] text-soul-accent">
          Appeared in
        </p>
        <h2 className="mt-2 font-display text-2xl lowercase tracking-widest text-neutral-50">
          Timeline appearances
        </h2>
      </div>

      <ol className="relative space-y-4">
        {orderedEvents.map((event) => {
          const season = event.seasonId ? seasonById.get(event.seasonId) : undefined;
          const eventLocations = event.locationIds.flatMap((locationId) => {
            const location = locationById.get(locationId);
            return location ? [location] : [];
          });

          return (
            <li key={event.id} className="border border-midnight-light/50 bg-soul-900/40 p-4 transition-colors hover:border-soul-accent/40">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`border px-2.5 py-1 text-sm font-serif uppercase tracking-[0.06em] ${event.kind === 'official' ? 'border-soul-accent/40 bg-soul-accent/10 text-soul-accent' : 'border-sky-400/40 bg-sky-400/10 text-sky-300'}`}>
                  {event.kind === 'official' ? 'Official' : 'Community'}
                </span>
                <CanonStatusBadge status={event.canon.status} />
              </div>

              <Link href={getLoreEventHref(event)} className="mt-3 block group">
                <h3 className="font-display text-2xl lowercase tracking-widest text-neutral-50 transition-colors group-hover:text-soul-accent">
                  {event.title}
                </h3>
              </Link>

              <p className="mt-2 font-serif text-base leading-7 text-neutral-200">
                {event.summary}
              </p>

              <div className="mt-4 flex flex-wrap gap-2 text-sm font-serif uppercase tracking-[0.06em] text-neutral-200">
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
            </li>
          );
        })}
      </ol>
    </section>
  );
}
