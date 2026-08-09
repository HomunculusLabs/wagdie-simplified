'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useSearingConcords } from '@/hooks/useSearingConcords';
import { useTokenBalances } from '@/hooks/useTokenBalances';

interface ProfileGameTokensProps {
  wallet: string;
}

function formatBalance(balance: bigint | undefined): string {
  return (balance ?? 0n).toLocaleString('en-US');
}

export function ProfileGameTokens({ wallet }: ProfileGameTokensProps) {
  const tokenBalances = useTokenBalances();
  const [isConcordDetailExpanded, setIsConcordDetailExpanded] = useState(false);
  const concordBalance = tokenBalances.balances.concord?.balance ?? 0n;
  const hasConcords = concordBalance > 0n;
  const searingConcords = useSearingConcords({
    enabled: isConcordDetailExpanded && hasConcords,
    walletAddress: wallet,
  });

  useEffect(() => {
    setIsConcordDetailExpanded(false);
  }, [wallet]);

  const balances = [
    { label: 'Concord', value: tokenBalances.balances.concord?.balance },
    { label: 'Corpse', value: tokenBalances.balances.corpse?.balance },
    { label: 'Mushroom', value: tokenBalances.balances.mushroom?.balance },
  ];
  const hasAnySupportedBalance = balances.some((token) => (token.value ?? 0n) > 0n);

  return (
    <section aria-labelledby="game-tokens-title" className="space-y-6">
      <div className="border-b border-parchment/15 pb-4">
        <p className="font-ui text-xs uppercase tracking-[0.24em] text-arcane-bright">Public on-chain holdings</p>
        <h2 id="game-tokens-title" className="mt-2 font-display text-3xl text-parchment sm:text-4xl">
          Supported Game Tokens
        </h2>
        <p className="mt-2 max-w-3xl font-ui text-sm leading-6 text-ash">
          Aggregate balances for Concord, Corpse, and Mushroom only. This is supported WAGDIE game-token coverage, not a complete wallet inventory.
        </p>
      </div>

      {tokenBalances.isLoading ? (
        <div role="status" className="grid gap-4 sm:grid-cols-3">
          <span className="sr-only">Loading supported game-token balances</span>
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse border border-parchment/10 bg-soul-900/70" />
          ))}
        </div>
      ) : tokenBalances.error ? (
        <div role="alert" className="border border-blood/40 bg-blood/10 p-6">
          <h3 className="font-display text-xl text-ember">Token balances could not be loaded</h3>
          <p className="mt-2 font-ui text-sm text-ash">{tokenBalances.error.message}</p>
          <Button type="button" onClick={() => void tokenBalances.refetch()} className="mt-4 min-h-11">
            Retry token balances
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {balances.map((token) => (
              <div key={token.label} className="border border-parchment/15 bg-soul-950/65 p-5 sm:p-6">
                <p className="font-ui text-xs uppercase tracking-[0.2em] text-ash">{token.label}</p>
                <p className="mt-4 break-all font-display text-4xl text-parchment">
                  {formatBalance(token.value)}
                </p>
              </div>
            ))}
          </div>

          {!hasAnySupportedBalance && (
            <div className="border border-parchment/15 bg-soul-950/40 p-5 font-ui text-sm text-ash">
              This wallet has no supported WAGDIE game-token balance.
            </div>
          )}

          {hasConcords && (
            <div className="border border-arcane/25 bg-arcane-deep/10">
              <button
                type="button"
                className="flex min-h-14 w-full items-center justify-between gap-4 px-5 py-4 text-left font-ui text-sm text-parchment focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-parchment"
                aria-expanded={isConcordDetailExpanded}
                aria-controls="searable-concord-detail"
                onClick={() => setIsConcordDetailExpanded((current) => !current)}
              >
                <span>Searable Concords — subset of your Concord balance</span>
                <span aria-hidden="true">{isConcordDetailExpanded ? '−' : '+'}</span>
              </button>

              {isConcordDetailExpanded && (
                <div id="searable-concord-detail" className="border-t border-arcane/20 p-5">
                  <p className="mb-5 max-w-3xl font-ui text-xs leading-5 text-ash">
                    Only owned Concord IDs present in the searing map are listed. Blocked IDs and unmapped Concords are intentionally omitted.
                  </p>

                  {searingConcords.isLoading ? (
                    <p role="status" className="font-ui text-sm text-ash">Loading the searable subset…</p>
                  ) : searingConcords.error ? (
                    <div role="alert" className="border border-blood/40 bg-blood/10 p-4">
                      <p className="font-ui text-sm text-ember">{searingConcords.error.message}</p>
                      <Button type="button" size="sm" onClick={() => void searingConcords.refetch()} className="mt-3 min-h-11">
                        Retry Concord detail
                      </Button>
                    </div>
                  ) : searingConcords.concords.length === 0 ? (
                    <p className="font-ui text-sm text-ash">
                      None of this wallet’s Concord balance is currently in the supported searable subset.
                    </p>
                  ) : (
                    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {searingConcords.concords.map((concord) => (
                        <li key={concord.concordId} className="border border-parchment/10 bg-black/20 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="font-display text-lg text-parchment">{concord.name}</h3>
                              <p className="mt-1 font-ui text-xs text-ash">Concord #{concord.concordId}</p>
                            </div>
                            <span className="font-ui text-sm text-arcane-bright">×{formatBalance(concord.amount)}</span>
                          </div>
                          <p className="mt-3 font-ui text-xs leading-5 text-ash">
                            {concord.location} · {concord.newTrait}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
