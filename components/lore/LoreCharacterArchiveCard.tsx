import Image from 'next/image';
import Link from 'next/link';
import {
  describeLoreCharacterAppearances,
  type LoreCharacterArchiveItem,
} from '@/lib/lore/archive-character-summary';
import { getLoreCharacterHref } from '@/lib/lore/navigation';

interface LoreCharacterArchiveCardProps {
  item: LoreCharacterArchiveItem;
}

export function LoreCharacterArchiveCard({ item }: LoreCharacterArchiveCardProps) {
  const { character } = item;
  const appearanceDescription = describeLoreCharacterAppearances(
    item.officialAppearanceCount,
    item.communityAppearanceCount,
  );

  return (
    <article className="group min-w-0 overflow-hidden border border-midnight-light/60 bg-midnight/45 transition-colors hover:border-arcane-muted/80 focus-within:border-arcane-bright/80">
      <Link
        href={getLoreCharacterHref(character)}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-arcane-bright"
        aria-label={`Open lore profile for ${character.name}`}
      >
        <div className="relative aspect-square overflow-hidden border-b border-midnight-light/60 bg-soul-900">
          {character.imageUrl ? (
            <Image
              src={character.imageUrl}
              alt={character.name}
              fill
              sizes="(min-width: 1280px) 18vw, (min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform duration-500 motion-reduce:transition-none group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center" aria-hidden="true">
              <span className="font-display text-7xl text-parchment/25">
                {character.name.trim().charAt(0).toUpperCase() || '?'}
              </span>
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-black/85 px-3 py-2.5">
            <span className="font-ui text-[9px] uppercase tracking-[0.16em] text-ash">
              {character.tokenId ? `WAGDIE #${character.tokenId}` : 'Lore profile'}
            </span>
            <h2 className="mt-1 line-clamp-1 font-display text-base leading-tight text-parchment sm:text-lg">
              {character.name}
            </h2>
          </div>
        </div>

        <p className="sr-only">
          {character.summary || 'No summary has been preserved for this character.'}
        </p>
        <p className="sr-only">{appearanceDescription}</p>
        {item.firstAppearance && (
          <p className="sr-only">
            First recorded in {item.firstAppearance.title}
          </p>
        )}
      </Link>

      {character.tokenId && (
        <div className="sr-only">
          <Link
            href={`/characters/${character.tokenId}`}
          >
            View NFT character sheet
          </Link>
        </div>
      )}
    </article>
  );
}
