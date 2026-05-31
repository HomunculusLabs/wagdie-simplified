'use client'

import { Flame, RefreshCw } from 'lucide-react'
import {
  SearingApprovalPanel,
  SearingConcordGrid,
  SearingOffchainStatus,
} from '@/components/characters/searing'
import { TransactionStatus as TxStatusComponent } from '@/components/TransactionStatus'
import { Button } from '@/components/ui/Button'
import { TransactionStatus } from '@/types/blockchain'
import { SearingCharacterTile } from './SearingCharacterTile'
import { SearingResultPreview } from './SearingResultPreview'
import { useSearingPageController } from './useSearingPageController'

export function SearingPageClient() {
  const {
    wallet,
    characters,
    concords,
    approval,
    transaction,
    sync,
    canSear,
    onSear,
  } = useSearingPageController()

  const isActionDisabled = transaction.isSearing || sync.isSyncing

  return (
    <main className="min-h-screen bg-abyss text-neutral-100">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 border-b border-neutral-800 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-display text-3xl text-soul-accent sm:text-4xl">Searing</h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-400 font-eskapade">
              Burn a searable Concord to permanently transform one of your WAGDIE tokens.
            </p>
          </div>
          {!wallet.isConnected && (
            <Button type="button" onClick={wallet.connect} isLoading={wallet.isAuthenticating || wallet.isHydrating}>
              Connect Wallet
            </Button>
          )}
        </div>

        {!wallet.isConnected ? (
          <section className="border border-neutral-800 bg-soul-950/70 p-8 text-center">
            <Flame className="mx-auto h-8 w-8 text-soul-accent" />
            <p className="mt-4 text-lg text-neutral-200 font-eskapade">Connect a wallet to load WAGDIE and Concord balances.</p>
          </section>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
            <div className="space-y-6">
              <section className="border border-neutral-800 bg-soul-950/70">
                <div className="flex items-center justify-between gap-3 border-b border-neutral-800 p-4">
                  <div>
                    <h2 className="font-display text-lg text-neutral-100">Your WAGDIE Tokens</h2>
                    <p className="text-xs text-neutral-500 font-eskapade">{characters.items.length} available</p>
                  </div>
                  <Button type="button" variant="secondary" size="sm" onClick={() => void characters.refetch()}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh
                  </Button>
                </div>
                <div className="p-4">
                  {characters.error && (
                    <div className="mb-4 border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400 font-eskapade">
                      {characters.error.message}
                    </div>
                  )}
                  {characters.isLoading ? (
                    <div className="border border-neutral-800 bg-black/20 p-4 text-sm text-neutral-400 font-eskapade">
                      Loading your WAGDIE tokens...
                    </div>
                  ) : characters.items.length === 0 ? (
                    <div className="border border-neutral-800 bg-black/20 p-8 text-center text-sm text-neutral-500 font-eskapade">
                      No owned or staked WAGDIE tokens found for this wallet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {characters.items.map((character) => (
                        <SearingCharacterTile
                          key={character.token_id}
                          character={character}
                          selected={character.token_id === characters.selectedId}
                          disabled={isActionDisabled}
                          optimisticSearedImageUrl={characters.optimisticSearedImagesByTokenId[character.token_id]}
                          onSelect={characters.onSelect}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="border border-neutral-800 bg-soul-950/70">
                <div className="border-b border-neutral-800 p-4">
                  <h2 className="font-display text-lg text-neutral-100">Your Concord Tokens</h2>
                </div>
                <div className="p-4">
                  {concords.error && (
                    <div className="mb-4 border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400 font-eskapade">
                      {concords.error.message}
                    </div>
                  )}
                  <SearingConcordGrid
                    concords={concords.items}
                    selectedConcordId={concords.selected?.concordId ?? null}
                    isLoading={concords.isLoading}
                    disabled={isActionDisabled}
                    onSelect={concords.onSelect}
                  />
                </div>
              </section>
            </div>

            <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
              <SearingResultPreview
                character={characters.selected}
                concord={concords.selected}
                syncState={sync.state}
              />

              <SearingApprovalPanel
                approvalStatus={approval.status}
                isApproving={approval.isApproving}
                onApprove={approval.onApprove}
              />

              <Button
                type="button"
                onClick={onSear}
                disabled={!canSear}
                isLoading={transaction.isSearing || sync.isSyncing}
                variant="primary"
                className="w-full"
              >
                <Flame className="h-4 w-4" />
                {sync.isSyncing ? 'Syncing Result' : 'Sear Selected Tokens'}
              </Button>

              {(transaction.status !== TransactionStatus.IDLE || transaction.activeHash) && (
                <TxStatusComponent
                  status={transaction.status}
                  hash={transaction.activeHash}
                  error={transaction.error?.message}
                />
              )}

              <SearingOffchainStatus
                state={sync.state}
                onRetry={sync.onRetry}
                isRetrying={sync.isSyncing}
                isSearedImageHiddenByInfection={sync.isCompletedImageHiddenByInfection}
              />

              {transaction.error && transaction.status !== TransactionStatus.ERROR && (
                <div className="border border-red-500/20 bg-red-500/5 p-4">
                  <p className="text-sm text-red-400 font-eskapade">{transaction.error.message}</p>
                </div>
              )}

              <div className="border border-soul-accent/20 bg-soul-accent/5 p-4">
                <p className="text-xs text-soul-accent font-eskapade">
                  Searing consumes the selected Concord token and permanently changes the selected WAGDIE.
                </p>
              </div>
            </aside>
          </div>
        )}
      </div>
    </main>
  )
}
