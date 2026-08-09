import Image from 'next/image';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { LoreNarrationPlayer } from './LoreNarrationPlayer';
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
  if (!dateString) return 'Undated';
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(dateString));
};

const eventHref = (event: LoreEvent) => (
  event.kind === 'official' ? `/lore/events/${event.slug}` : `/lore/community/${event.slug}`
);

const sourceHref = (source: SourceRecord) => {
  const href = source.url ?? source.archivedUrl;
  return href && !href.startsWith('manual://') ? href : undefined;
};

const tokenReferences = [
  {
    label: 'Conclave Bell',
    src: '/images/wagdie-layers/Searing/Mask/Conclave Bell.png',
  },
  {
    label: 'Monarch',
    src: '/images/wagdie-layers/Searing/Back/Wings of the Monarch.png',
  },
];

function CharacterReference({ character }: { character: LoreCharacter }) {
  return (
    <Link
      href={`/lore/characters/${character.slug}`}
      className="group relative aspect-square min-w-0 overflow-hidden bg-[#ead0aa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment"
    >
      {character.imageUrl ? (
        <Image
          src={character.imageUrl}
          alt={character.name}
          fill
          sizes="(min-width: 1024px) 13vw, 42vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <span className="flex h-full items-center justify-center font-display text-5xl text-soul-950/35" aria-hidden="true">
          {character.name.charAt(0)}
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-2 pb-2 pt-8 font-eskapade text-[10px] text-parchment">
        <span className="truncate">{character.name}</span>
        <span>#{character.tokenId ?? '—'}</span>
      </span>
    </Link>
  );
}

export function OfficialLoreEventDetail({
  event,
  locations,
  characters,
  sources,
  relatedContext,
}: OfficialLoreEventDetailProps) {
  const cover = getLoreEventCover(event, characters);
  const occurredAt = formatDate(event.occurredAt ?? event.publishedAt);
  const nextEvent = relatedContext.timelineNeighbors.next;
  const narration = `${event.title}. ${event.summary} ${event.body}`;

  return (
    <main className="mx-auto w-full max-w-[1920px] px-4 pb-20 pt-6 sm:px-6 lg:px-7">
      <article className="border border-midnight-light/90 bg-[#17140f] p-4 sm:p-6 lg:p-7">
        <Link
          href="/lore"
          className="inline-flex min-h-11 items-center font-display text-2xl text-bone transition-colors hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment"
        >
          Back
        </Link>

        <div className="relative mt-3 h-52 w-full overflow-hidden bg-soul-900/70 sm:aspect-[4.35/1] sm:h-auto">
          {cover.src ? (
            <Image
              src={cover.src}
              alt={cover.alt}
              fill
              priority
              sizes="(min-width: 1920px) 1840px, 100vw"
              className="object-cover opacity-90"
            />
          ) : (
            <div className="flex h-full items-center justify-center font-display text-8xl text-parchment/20" aria-hidden="true">
              {cover.fallbackInitial}
            </div>
          )}
        </div>

        <div className="px-3 pb-2 pt-16 sm:px-5 lg:px-7">
          <span className="inline-flex border border-parchment/50 bg-parchment/45 px-5 py-3 font-eskapade text-sm text-parchment">
            Canon Event
          </span>

          <div className="mt-14 flex flex-wrap items-center gap-x-6 gap-y-3">
            <h1 className="font-display text-4xl leading-tight text-parchment sm:text-5xl lg:text-6xl">
              {event.title}
            </h1>
            <span className="h-2 w-2 rotate-45 bg-parchment" aria-hidden="true" />
            <time className="font-ui text-lg text-mist" dateTime={event.occurredAt ?? event.publishedAt}>
              {occurredAt}
            </time>
          </div>

          <p className="mt-6 max-w-[110rem] font-ui text-sm leading-6 text-mist sm:text-base">
            {event.summary}
          </p>

          <div className="mt-[4.5rem]">
            <LoreNarrationPlayer title={event.title} text={narration} />
          </div>
        </div>

        <section className="mt-[3.125rem]" aria-labelledby="references-heading">
          <h2 id="references-heading" className="border-b border-midnight-light/80 pb-2 font-display text-2xl text-mist">
            References
          </h2>
          <div className="mt-7 grid gap-4 lg:grid-cols-3">
            <section className="border border-midnight-light/90 p-4" aria-labelledby="characters-reference-heading">
              <h3 id="characters-reference-heading" className="font-display text-2xl text-mist">Characters</h3>
              <div className="mt-5 grid grid-cols-2 gap-4">
                {characters.slice(0, 2).map((character) => (
                  <CharacterReference key={character.id} character={character} />
                ))}
              </div>
            </section>

            <section className="border border-midnight-light/90 p-4" aria-labelledby="tokens-reference-heading">
              <h3 id="tokens-reference-heading" className="font-display text-2xl text-mist">Tokens</h3>
              <div className="mt-5 grid grid-cols-2 gap-4">
                {tokenReferences.map((token) => (
                  <figure key={token.label} className="min-w-0">
                    <div className="relative aspect-square bg-black">
                      <Image src={token.src} alt="" fill sizes="(min-width: 1024px) 13vw, 42vw" className="object-contain p-5" />
                    </div>
                    <figcaption className="mt-2 font-ui text-xs text-mist">{token.label}</figcaption>
                  </figure>
                ))}
              </div>
            </section>

            <section className="border border-midnight-light/90 p-4" aria-labelledby="location-reference-heading">
              <h3 id="location-reference-heading" className="font-display text-2xl text-mist">Location</h3>
              <Link href={locations[0] ? `/lore/locations/${locations[0].slug}` : '/map'} className="group relative mt-5 block aspect-[1.75/1] overflow-hidden bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment">
                <Image
                  src="/images/wagdiemap.png"
                  alt={locations[0] ? `Map showing ${locations[0].name}` : 'Map of the Forsaken Lands'}
                  fill
                  sizes="(min-width: 1024px) 30vw, 90vw"
                  className="object-cover object-[50%_63%] transition-transform duration-500 group-hover:scale-105"
                />
              </Link>
            </section>
          </div>
        </section>

        <section className="pb-8" aria-labelledby="sources-heading">
          <h2 id="sources-heading" className="border-b border-midnight-light/80 pb-2 font-display text-2xl text-mist">
            Sources
          </h2>
          <div className="mt-6 flex flex-wrap gap-3">
            {sources.length > 0 ? sources.map((source) => {
              const href = sourceHref(source);
              const content = (
                <>
                  <ExternalLink className="h-5 w-5" aria-hidden="true" />
                  <span>{source.platform?.toLowerCase().includes('twitter') ? 'Listen on X' : source.title}</span>
                </>
              );
              return href ? (
                <a key={source.id} href={href} target="_blank" rel="noreferrer" className="inline-flex min-h-24 items-center gap-4 rounded-2xl border border-midnight-light px-7 font-ui text-sm text-mist transition-colors hover:border-parchment hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment">
                  {content}
                </a>
              ) : (
                <span key={source.id} className="inline-flex min-h-24 items-center gap-4 rounded-2xl border border-midnight-light px-7 font-ui text-sm text-mist">
                  {content}
                </span>
              );
            }) : (
              <p className="font-ui text-sm text-mist">No source record is attached to this chapter.</p>
            )}
          </div>
        </section>
      </article>

      <div className="mt-20 flex justify-center">
        {nextEvent ? (
          <Link href={eventHref(nextEvent)} className="inline-flex min-h-24 items-center justify-center border border-midnight-light px-10 font-display text-2xl text-parchment transition-colors hover:border-parchment hover:bg-parchment/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment">
            Next Chapter
          </Link>
        ) : (
          <Link href="/lore" className="inline-flex min-h-24 items-center justify-center border border-midnight-light px-10 font-display text-2xl text-parchment transition-colors hover:border-parchment hover:bg-parchment/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment">
            Back to Archive
          </Link>
        )}
      </div>
    </main>
  );
}
