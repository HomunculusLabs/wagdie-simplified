import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui';
import { AppearedInTimeline } from './AppearedInTimeline';
import { CharacterPortrait } from './CharacterPortrait';
import { EntityChips } from './EntityChips';
import { MediaGallery } from './MediaGallery';
import { SourceList } from './SourceList';
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
  return (
    <main className="container mx-auto space-y-8 px-4 py-8 md:py-10">
      <Link href="/lore" className="text-sm font-serif uppercase tracking-[0.24em] text-neutral-300 transition-colors hover:text-soul-accent">
        ← Back to lore archive
      </Link>

      <Card className="overflow-hidden border-midnight-light/60 bg-soul-900/50">
        <CardContent className="p-0">
          <section className="grid gap-0 lg:grid-cols-[0.75fr_1.25fr]">
            <div className="border-b border-midnight-light/50 bg-black/20 p-6 lg:border-b-0 lg:border-r md:p-8">
              {character.imageUrl ? (
                <figure className="space-y-4">
                  <div className="relative mx-auto aspect-square max-w-sm overflow-hidden border border-soul-accent/30 bg-soul-950/80">
                    <Image src={character.imageUrl} alt={character.name} fill sizes="(min-width: 1024px) 33vw, 80vw" className="object-cover" priority />
                  </div>
                  <figcaption className="text-center text-sm font-serif uppercase tracking-[0.06em] text-neutral-200">
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

            <div className="space-y-6 p-6 md:p-8">
              <div className="space-y-3">
                <p className="text-sm font-serif uppercase tracking-[0.28em] text-soul-accent">
                  Character profile
                </p>
                <h1 className="font-display text-4xl lowercase tracking-widest text-neutral-50 md:text-6xl">
                  {character.name}
                </h1>
                <p className="max-w-3xl font-serif text-xl leading-8 text-neutral-200">
                  {character.summary}
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
                  <Link
                    href={`/lore/submit?tokenId=${encodeURIComponent(String(character.tokenId))}`}
                    className="inline-flex items-center justify-center rounded border border-soul-accent/50 bg-soul-accent/10 px-4 py-2 font-display text-sm uppercase tracking-[0.16em] text-soul-accent transition-colors hover:border-soul-accent hover:bg-soul-accent/20 hover:text-soul-bone"
                  >
                    Add a story for WAGDIE #{character.tokenId}
                  </Link>
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
                  <Link href={getLoreEventHref(firstAppearance)} className="mt-2 block font-display text-2xl lowercase tracking-widest text-neutral-50 transition-colors hover:text-soul-accent">
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

      <section className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
        <aside className="space-y-5 border border-midnight-light/50 bg-soul-900/40 p-5 md:p-6">
          <div>
            <p className="text-sm font-serif uppercase tracking-[0.28em] text-soul-accent">
              Profile context
            </p>
            <h2 className="mt-2 font-display text-2xl lowercase tracking-widest text-neutral-50">
              Associated places
            </h2>
          </div>
          <EntityChips
            label="Locations"
            items={associatedLocations.map((location) => ({
              label: location.name,
              href: `/lore/locations/${location.slug}`,
            }))}
            emptyLabel="No associated locations"
          />

          <div>
            <p className="text-sm font-serif uppercase tracking-[0.06em] text-soul-accent">
              Appears with
            </p>
            <div className="mt-3 grid gap-3">
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

          <p className="font-serif text-base leading-7 text-neutral-200">
            This profile gathers every official and community event that references {character.name}, ordered by the shared lore timeline.
          </p>
        </aside>

        <AppearedInTimeline events={appearedInEvents} seasons={seasons} locations={allLocations} />
      </section>

      <SourceList sources={sources} title="Source-backed appearances" />
    </main>
  );
}
