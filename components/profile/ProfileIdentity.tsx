'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { EditorialHeading } from '@/components/shared/EditorialHeading';
import type { UseAuthReturn } from '@/hooks/useAuth';

interface ProfileIdentityProps {
  auth: UseAuthReturn;
}

function addressesMatch(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

export function ProfileIdentity({ auth }: ProfileIdentityProps) {
  const hasMatchingSession = auth.isAuthenticated
    && addressesMatch(auth.address, auth.session?.address);
  const selectedCharacter = hasMatchingSession ? auth.session?.selectedCharacter : undefined;

  const sessionLabel = auth.isConnecting
    ? 'Connecting wallet'
    : auth.isHydrating
      ? 'Checking wallet session'
      : auth.isAuthenticating
        ? 'Signing in'
        : hasMatchingSession
          ? 'Wallet session active'
          : auth.isConnected
            ? 'Public wallet view'
            : 'Wallet disconnected';

  return (
    <section
      aria-labelledby="profile-title"
      className="relative overflow-hidden border border-parchment/15 bg-soul-950/65 px-5 py-10 sm:px-8 sm:py-14 lg:px-12"
    >
      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)] lg:items-end">
        <EditorialHeading
          id="profile-title"
          eyebrow="Current wallet"
          title="Your profile"
          description={auth.isConnected
            ? 'Public game holdings for the connected wallet, with private Archive posts revealed only through its matching signed session.'
            : 'Connect the wallet whose WAGDIE characters, supported game tokens, and Archive posts you want to view.'}
        />

        <div className="border border-parchment/15 bg-black/25 p-5 sm:p-6">
          <p className="font-ui text-xs uppercase tracking-[0.24em] text-arcane-bright">
            {sessionLabel}
          </p>

          {auth.address ? (
            <>
              <p
                className="mt-4 break-all font-mono text-sm leading-6 text-parchment sm:text-base"
                title={auth.address}
              >
                {auth.address}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                {selectedCharacter !== undefined && selectedCharacter !== null && (
                  <Link
                    href={`/characters/${selectedCharacter}`}
                    className="inline-flex min-h-11 items-center border border-parchment/30 px-4 font-ui text-sm text-parchment transition-colors hover:border-parchment focus:outline-none focus-visible:ring-2 focus-visible:ring-parchment"
                  >
                    Selected character #{selectedCharacter}
                  </Link>
                )}
                {!hasMatchingSession && !auth.isHydrating && (
                  <span className="inline-flex min-h-11 items-center border border-arcane/30 px-4 font-ui text-sm text-ash">
                    Private posts locked
                  </span>
                )}
              </div>
            </>
          ) : (
            <Button
              type="button"
              onClick={auth.connect}
              isLoading={auth.isConnecting}
              className="mt-5 min-h-11"
            >
              Connect wallet
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
