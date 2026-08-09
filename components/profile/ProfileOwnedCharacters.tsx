'use client';

import { useEffect, useMemo, useState } from 'react';
import { CharacterCard } from '@/components/characters/CharacterCard';
import { Button } from '@/components/ui/Button';
import { useCharacters } from '@/hooks/useCharacters';
import type { Character } from '@/types/character';

const CHARACTERS_PER_PAGE = 12;

export function isCharacterInWalletCustody(character: Character, wallet: string): boolean {
  const normalizedWallet = wallet.toLowerCase();
  return character.owner_address?.toLowerCase() === normalizedWallet
    || character.staker_address?.toLowerCase() === normalizedWallet;
}

interface ProfileOwnedCharactersProps {
  wallet: string;
}

export function ProfileOwnedCharacters({ wallet }: ProfileOwnedCharactersProps) {
  const [page, setPage] = useState(1);
  const query = useCharacters({
    tab: 'owned',
    sort: 'asc',
    wallet,
    page,
    perPage: CHARACTERS_PER_PAGE,
    enabled: Boolean(wallet),
  });

  useEffect(() => {
    setPage(1);
  }, [wallet]);

  const characters = useMemo(
    () => query.characters.filter((character) => isCharacterInWalletCustody(character, wallet)),
    [query.characters, wallet]
  );

  return (
    <section aria-labelledby="owned-characters-title" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-parchment/15 pb-4">
        <div>
          <p className="font-ui text-xs uppercase tracking-[0.24em] text-arcane-bright">Wallet custody</p>
          <h2 id="owned-characters-title" className="mt-2 font-display text-3xl text-parchment sm:text-4xl">
            Owned Characters
          </h2>
          <p className="mt-2 max-w-2xl font-ui text-sm leading-6 text-ash">
            Characters owned directly or held in the established staking flow for this wallet.
          </p>
        </div>
        {!query.isLoading && !query.isError && (
          <p className="font-ui text-sm text-ash" aria-live="polite">
            {query.totalCount.toLocaleString()} custody record{query.totalCount === 1 ? '' : 's'}
          </p>
        )}
      </div>

      {query.isLoading ? (
        <div role="status" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <span className="sr-only">Loading owned characters</span>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="aspect-[4/5] animate-pulse border border-parchment/10 bg-soul-900/70" />
          ))}
        </div>
      ) : query.isError ? (
        <div role="alert" className="border border-blood/40 bg-blood/10 p-6">
          <h3 className="font-display text-xl text-ember">Characters could not be loaded</h3>
          <p className="mt-2 font-ui text-sm text-ash">
            {query.error instanceof Error ? query.error.message : 'The character index did not respond.'}
          </p>
          <Button type="button" onClick={() => void query.refetch()} className="mt-4 min-h-11">
            Retry characters
          </Button>
        </div>
      ) : characters.length === 0 ? (
        <div className="border border-parchment/15 bg-soul-950/65 p-8 text-center">
          <h3 className="font-display text-2xl text-parchment">No characters on this page</h3>
          <p className="mt-2 font-ui text-sm text-ash">
            No owner-or-staker custody records for this wallet passed the defensive wallet check.
          </p>
          {page > 1 && (
            <Button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} className="mt-5 min-h-11">
              Previous page
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {characters.map((character) => (
              <CharacterCard
                key={character.token_id}
                character={character}
                href={`/characters/${character.token_id}`}
              />
            ))}
          </div>

          {query.totalPages > 1 && (
            <nav aria-label="Owned character pages" className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <Button
                type="button"
                variant="secondary"
                disabled={page <= 1 || query.isFetching}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="min-h-11"
              >
                Previous
              </Button>
              <span className="font-ui text-sm text-ash" aria-live="polite">
                Page {page} of {query.totalPages}
              </span>
              <Button
                type="button"
                variant="secondary"
                disabled={!query.hasMore || query.isFetching}
                onClick={() => setPage((current) => current + 1)}
                className="min-h-11"
              >
                Next
              </Button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
