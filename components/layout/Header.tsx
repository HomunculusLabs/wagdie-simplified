'use client';

import { useCallback, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Globe2, Menu, MessageCircle, Twitter, X } from 'lucide-react';
import { Navigation } from './Navigation';
import { HeaderDrawer } from './HeaderDrawer';
import { WalletButton } from '@/components/wallet/WalletButton';
import { useAuth } from '@/hooks/useAuth';
import { isAdmin } from '@/lib/auth/admin';

function formatAddress(address?: string): string {
  if (!address) return 'Account';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Main site header with responsive route navigation and one wallet-aware account drawer.
 */
export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const {
    address,
    isConnected,
    isAuthenticated,
    isHydrating,
    authenticate,
    disconnect,
  } = useAuth();
  const showConnectedActions = isConnected && Boolean(address);
  const isAdminWallet = isAdmin(address);

  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
  }, []);

  const openDrawer = useCallback(() => {
    setIsDrawerOpen(true);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const accountLabel = showConnectedActions
    ? `${isHydrating ? 'Checking account' : 'Account'} ${formatAddress(address)}`
    : 'Menu';

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-parchment/15 bg-soul-950/95 backdrop-blur-sm">
      <div className="mx-auto w-full px-5 sm:px-8 lg:px-12">
        <div className="flex h-[5.75rem] items-center justify-between gap-5">
          <div className="flex shrink-0 items-center gap-7">
          <Link
            href="/"
            onClick={scrollToTop}
            className="group flex min-h-[44px] shrink-0 items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment"
            title="Scroll to top"
            aria-label="WAGDIE home"
          >
            <Image
              src="/images/wagdie.png"
              alt="WAGDIE"
              width={1910}
              height={588}
              priority
              className="h-8 w-auto transition-opacity duration-300 group-hover:opacity-80"
            />
          </Link>

          <nav className="hidden items-center gap-4 lg:flex" aria-label="Social links">
            <a href={process.env.NEXT_PUBLIC_OPENSEA_URL || 'https://opensea.io/collection/we-are-all-going-to-die'} target="_blank" rel="noreferrer" aria-label="OpenSea" className="text-mist transition-colors hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment">
              <Globe2 className="h-6 w-6" aria-hidden="true" />
            </a>
            <a href={process.env.NEXT_PUBLIC_DISCORD_URL || 'https://discord.gg/wagdie'} target="_blank" rel="noreferrer" aria-label="Discord" className="text-mist transition-colors hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment">
              <MessageCircle className="h-6 w-6" aria-hidden="true" />
            </a>
            <a href={process.env.NEXT_PUBLIC_TWITTER_URL || 'https://twitter.com/WAGDIE_ETH'} target="_blank" rel="noreferrer" aria-label="X / Twitter" className="text-mist transition-colors hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment">
              <Twitter className="h-6 w-6" aria-hidden="true" />
            </a>
          </nav>
          </div>

          <Navigation className="hidden lg:flex" showConnectedActions={showConnectedActions} />

          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center text-mist transition-colors hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment lg:hidden"
            onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-navigation"
          >
            {isMobileMenuOpen
              ? <X className="h-6 w-6" aria-hidden="true" />
              : <Menu className="h-6 w-6" aria-hidden="true" />}
          </button>

          <div className="hidden shrink-0 items-center gap-2 lg:flex">
            {!showConnectedActions && (
              <WalletButton className="min-w-72 border-parchment bg-parchment px-8 py-3 text-soul-950 hover:border-parchment hover:bg-parchment/90 hover:text-soul-950" />
            )}
            {showConnectedActions && (
              <button
                type="button"
                onClick={openDrawer}
                className="min-h-[44px] border border-parchment/40 px-5 py-2 font-eskapade text-sm text-parchment transition-colors hover:bg-parchment/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment"
                title={`Open account for ${address}`}
                aria-label={`Open account drawer for ${address}`}
                aria-expanded={isDrawerOpen}
                aria-controls="header-account-drawer"
              >
                {accountLabel}
              </button>
            )}
            <button
              type="button"
              onClick={openDrawer}
              className="flex h-[3.25rem] w-[3.25rem] items-center justify-center border border-parchment/40 text-parchment transition-colors hover:bg-parchment/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment"
              title="Open menu"
              aria-label="Open menu drawer"
              aria-expanded={isDrawerOpen}
              aria-controls="header-account-drawer"
            >
              <Menu className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div id="mobile-navigation" className="border-t border-neutral-800 py-4 lg:hidden">
            <Navigation
              isMobile
              onNavClick={closeMobileMenu}
              showConnectedActions={showConnectedActions}
            />
            <div className="mt-4 flex flex-col gap-3 border-t border-neutral-800 px-2 pt-4">
              <button
                type="button"
                onClick={openDrawer}
                className="min-h-[44px] px-4 py-3 text-left font-ui text-base text-parchment transition-colors hover:bg-parchment/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment"
                aria-expanded={isDrawerOpen}
                aria-controls="header-account-drawer"
              >
                {showConnectedActions ? `Account ${formatAddress(address)}` : 'More options'}
              </button>
              {!showConnectedActions && (
                <div className="px-4">
                  <WalletButton />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      </header>

      <HeaderDrawer
        isOpen={isDrawerOpen}
        address={address}
        isConnected={isConnected}
        isAuthenticated={isAuthenticated}
        isHydrating={isHydrating}
        isAdmin={isAdminWallet}
        onClose={closeDrawer}
        onAuthenticate={authenticate}
        onDisconnect={disconnect}
      />
    </>
  );
}
