'use client';

import React from 'react';
import { ProfileArchivePosts } from './ProfileArchivePosts';
import { ProfileGameTokens } from './ProfileGameTokens';
import { ProfileIdentity } from './ProfileIdentity';
import { ProfileOwnedCharacters } from './ProfileOwnedCharacters';
import { useAuth } from '@/hooks/useAuth';

export function ProfilePageClient() {
  const auth = useAuth();
  const hasWallet = auth.isConnected && Boolean(auth.address);
  const isPreparingWallet = auth.isConnecting
    || (hasWallet && (auth.isHydrating || !auth.hasHydrated));

  return (
    <div className="min-h-screen bg-soul-950 text-bone">
      <div className="mx-auto w-full max-w-[1680px] px-4 py-8 sm:px-6 sm:py-10 lg:px-10 lg:py-14">
        <ProfileIdentity auth={auth} />

        {!hasWallet || isPreparingWallet ? (
          <section
            aria-live="polite"
            className="mt-10 border border-parchment/15 bg-soul-950/65 px-6 py-12 text-center sm:mt-14"
          >
            <h2 className="font-display text-2xl text-parchment sm:text-3xl">
              {isPreparingWallet ? 'Preparing this wallet profile' : 'Connect a wallet to continue'}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl font-ui text-sm leading-6 text-ash">
              {isPreparingWallet
                ? 'Checking the connected address and its existing signed session before loading wallet-keyed sections.'
                : 'No holdings or private submissions are requested until a current wallet address is available.'}
            </p>
          </section>
        ) : (
          <div className="mt-12 space-y-16 sm:mt-16 sm:space-y-20 lg:space-y-24">
            <ProfileOwnedCharacters key={`characters-${auth.address}`} wallet={auth.address!} />
            <ProfileGameTokens key={`tokens-${auth.address}`} wallet={auth.address!} />
            <ProfileArchivePosts key={`posts-${auth.address}`} auth={auth} />
          </div>
        )}
      </div>
    </div>
  );
}
