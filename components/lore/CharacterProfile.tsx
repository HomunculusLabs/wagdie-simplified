import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui';
import { AppearedInTimeline } from './AppearedInTimeline';
import { CharacterPortrait } from './CharacterPortrait';
import { EntityChips } from './EntityChips';
import { MediaGallery } from './MediaGallery';
import { SourceList } from './SourceList';
import { describeLoreCharacterAppearances } from '@/lib/lore/archive-character-summary';
import { getLoreEventHref, getLoreCharacterHref } from '@/lib/lore/navigation';
import type {
  LoreCharacterConnection,
  LoreCharacter,
  LoreEvent,
  LoreLocation,
  LoreMedia,
  LoreSeason,
  SourceRecord,
} from '@/lib/lore/types';

interface CharacterProfileProps {
  character: LoreCharacter;
  image?: LoreMedia;
  appearedInEvents: LoreEvent[];
  firstAppearance?: LoreEvent;
  associatedLocations: LoreLocation[];
  characterConnections: LoreCharacterConnection[];
  seasons: LoreSeason[];
  allLocations: LoreLocation[];
  sources: SourceRecord[];
}

export function CharacterProfile({
  character,
  image,
  appearedInEvents,
  firstAppearance,
  associatedLocations,
  characterConnections,
  seasons,
  allLocations,
  sources,
}: CharacterProfileProps) {
  const officialAppearanceCount = appearedInEvents.filter((event) => event.kind === 'official').length;
  const communityAppearanceCount = appearedInEvents.length - officialAppearanceCount;
  const appearanceDescription = describeLoreCharacterAppearances(
    officialAppearanceCount,
    communityAppearanceCount,
  );

  return (
    <main className="mx-auto w-full max-w-[1680px] space-y-8 px-4 py-8 sm:px-6 md:py-12 lg:px-10">
      <Link href="/lore" className="font-ui text-sm text-ash transition-colors hover:text-parchment">
        ← Back to lore archive
      </Link>

      <Card className="overflow-hidden rounded-none border-midnight-light/60 bg-soul-900/50">
        <CardContent className="p-0">
          <section className="grid gap-0 lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[24rem_minmax(0,1fr)]">
            <div className="border-b border-midnight-light/50 bg-black/20 p-5 lg:border-b-0 lg:border-r xl:p-6">
              {character.imageUrl ? (
                <figure className="space-y-3">
                  <div className="relative mx-auto aspect-square w-full overflow-hidden border border-midnight-light/60 bg-soul-950/80">
                    <Image src={character.imageUrl} alt={character.name} fill sizes="(min-width: 1280px) 24rem, (min-width: 1024px) 20rem, 80vw" className="object-cover" priority />
                  </div>
                  <figcaption className="text-center font-ui text-xs uppercase tracking-[0.14em] text-ash">
                    {character.tokenId ? `WAGDIE #${character.tokenId}` : 'Real character record'}
                  </figcaption>
                </figure>
              ) : image ? (
                <MediaGallery media={[image]} title="Character image" />
              ) : (
                <div className="flex min-h-64 items-center justify-center border border-midnight-light/50 bg-soul-950/80 p-6 text-center font-serif text-base text-neutral-200">
                  No preserved portrait is attached to this character.
                </div>
              )}
            </div>

            <div className="space-y-5 p-6 md:p-8 xl:p-10">
              <div className="space-y-3">
                <p className="font-ui text-xs uppercase tracking-[0.18em] text-soul-accent">
                  Character profile
                </p>
                <h1 className="font-display text-4xl leading-none text-parchment md:text-6xl">
                  {character.name}
                </h1>
                <p className="max-w-4xl font-ui text-base leading-7 text-ash md:text-lg">
                  {character.summary || 'No preserved character summary is available.'}
                </p>
                <p className="font-ui text-sm uppercase tracking-[0.16em] text-arcane-bright">
                  {appearanceDescription}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <EntityChips
                  label="Aliases"
                  items={character.aliases.map((alias) => ({ label: alias }))}
                  emptyLabel="No aliases"
                />
                <EntityChips
                  label="Tags"
                  items={character.tags.map((tag) => ({ label: `#${tag}`, href: `/lore?keyword=${tag}` }))}
                  emptyLabel="No tags"
                />
                <EntityChips
                  label="Traits"
                  items={[
                    character.origin ? { label: character.origin } : undefined,
                    character.characterClass ? { label: character.characterClass } : undefined,
                    character.alignment ? { label: character.alignment } : undefined,
                    character.level ? { label: `Level ${character.level}` } : undefined,
                  ].filter((item): item is { label: string } => Boolean(item))}
                  emptyLabel="No traits"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                {character.tokenId ? (
                  <>
                    <Link
                      href={`/lore/submit?tokenId=${encodeURIComponent(String(character.tokenId))}`}
                      className="inline-flex min-h-11 items-center justify-center border border-arcane-muted bg-arcane/10 px-4 font-ui text-sm text-arcane-bright transition-colors hover:border-arcane-bright hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arcane-bright"
                    >
                      Add a story for WAGDIE #{character.tokenId}
                    </Link>
                    <Link
                      href={`/characters/${character.tokenId}`}
                      className="inline-flex min-h-11 items-center justify-center border border-midnight-light/70 px-4 font-ui text-sm text-bone transition-colors hover:border-parchment/60 hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment"
                    >
                      View NFT character sheet
                    </Link>
                  </>
                ) : (
                  <p className="text-sm font-serif text-neutral-300">
                    Community stories can be submitted for token-linked characters.
                  </p>
                )}
              </div>

              {firstAppearance && (
                <div className="border border-midnight-light/50 bg-black/20 p-4">
                  <p className="text-sm font-serif uppercase tracking-[0.22em] text-neutral-300">
                    First appearance
                  </p>
                  <Link href={getLoreEventHref(firstAppearance)} className="mt-2 block font-display text-2xl text-parchment transition-colors hover:text-soul-accent">
                    {firstAppearance.title}
                  </Link>
                  <p className="mt-2 text-sm font-eskapade leading-relaxed text-neutral-300">
                    {firstAppearance.summary}
                  </p>
                </div>
              )}
            </div>
          </section>
        </CardContent>
      </Card>

      <section className="space-y-8">
        <AppearedInTimeline events={appearedInEvents} seasons={seasons} locations={allLocations} />

        <aside className="grid gap-6 border border-midnight-light/50 bg-soul-900/40 p-5 md:grid-cols-3 md:p-6">
          <div>
            <p className="font-ui text-xs uppercase tracking-[0.18em] text-soul-accent">
              Profile context
            </p>
            <h2 className="mt-2 font-display text-2xl text-parchment">
              Associated places
            </h2>
            <div className="mt-4">
              <EntityChips
                label="Locations"
                items={associatedLocations.map((location) => ({
                  label: location.name,
                  href: `/lore/locations/${location.slug}`,
                }))}
                emptyLabel="No associated locations"
              />
            </div>
          </div>

          <div>
            <p className="text-sm font-serif uppercase tracking-[0.06em] text-soul-accent">
              Appears with
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
              {characterConnections.length > 0 ? characterConnections.slice(0, 8).map((connection) => (
                <div key={connection.character.id} className="space-y-2">
                  <CharacterPortrait
                    character={connection.character}
                    href={getLoreCharacterHref(connection.character)}
                    size="sm"
                  />
                  <p className="pl-1 font-serif text-sm text-neutral-200">
                    Shares {connection.sharedEvents.length} {connection.sharedEvents.length === 1 ? 'record' : 'records'} with {character.name}.
                  </p>
                </div>
              )) : (
                <p className="font-serif text-base text-neutral-200">No co-appearing characters are linked yet.</p>
              )}
            </div>
          </div>

          <p className="font-ui text-sm leading-7 text-ash">
            {appearanceDescription}. This profile gathers the records that reference {character.name}; canon status remains attached to each individual event.
          </p>
        </aside>
      </section>

      <SourceList sources={sources} title="Source-backed appearances" />
    </main>
  );
}
