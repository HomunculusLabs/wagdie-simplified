'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletButton } from '@/components/wallet/WalletButton';
import { lockBodyScroll, unlockBodyScroll } from '@/lib/utils/bodyScrollLock';

const showLoreNav = process.env.NEXT_PUBLIC_SHOW_LORE_NAV !== 'false';
const DRAWER_LOCK_ID = 'header-drawer';
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface HeaderDrawerProps {
  isOpen: boolean;
  address?: string;
  isConnected: boolean;
  isAuthenticated: boolean;
  isHydrating: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onAuthenticate: (options?: { force?: boolean }) => Promise<void>;
  onDisconnect: () => Promise<void>;
}

function formatAddress(address?: string): string {
  if (!address) return 'Unknown pilgrim';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function actionErrorMessage(action: 'authenticate' | 'disconnect', error: unknown): string {
  const detail = error instanceof Error && error.message ? ` ${error.message}` : '';
  return action === 'authenticate'
    ? `Wallet authentication failed.${detail} Please try again.`
    : `Wallet disconnect failed.${detail} Your account remains connected; please try again.`;
}

export function HeaderDrawer({
  isOpen,
  address,
  isConnected,
  isAuthenticated,
  isHydrating,
  isAdmin,
  onClose,
  onAuthenticate,
  onDisconnect,
}: HeaderDrawerProps) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const openSnapshotRef = useRef<{ pathname: string; address?: string } | null>(null);
  const [pendingAction, setPendingAction] = useState<'authenticate' | 'disconnect' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!isOpen) {
      openSnapshotRef.current = null;
      return;
    }

    if (!openSnapshotRef.current) {
      openSnapshotRef.current = { pathname, address };
      return;
    }

    if (
      openSnapshotRef.current.pathname !== pathname
      || openSnapshotRef.current.address !== address
    ) {
      onClose();
    }
  }, [address, isOpen, onClose, pathname]);

  useEffect(() => {
    if (!isOpen) return;

    setActionError(null);
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    lockBodyScroll(DRAWER_LOCK_ID);
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusableElements = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((element) => element.getAttribute('aria-hidden') !== 'true');

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && (activeElement === firstElement || !panelRef.current.contains(activeElement))) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      unlockBodyScroll(DRAWER_LOCK_ID);
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    };
  }, [isOpen, onClose]);

  const handleAuthenticate = async () => {
    if (pendingAction || isHydrating) return;

    setPendingAction('authenticate');
    setActionError(null);
    try {
      await onAuthenticate({ force: true });
    } catch (error) {
      setActionError(actionErrorMessage('authenticate', error));
    } finally {
      setPendingAction(null);
    }
  };

  const handleDisconnect = async () => {
    if (pendingAction) return;

    setPendingAction('disconnect');
    setActionError(null);
    try {
      await onDisconnect();
      onClose();
    } catch (error) {
      setActionError(actionErrorMessage('disconnect', error));
    } finally {
      setPendingAction(null);
    }
  };

  if (!isOpen) return null;

  const externalLinks = [
    {
      label: 'Discord',
      url: process.env.NEXT_PUBLIC_DISCORD_URL || 'https://discord.gg/wagdie',
    },
    {
      label: 'X',
      url: process.env.NEXT_PUBLIC_TWITTER_URL || 'https://twitter.com/WAGDIE_ETH',
    },
    {
      label: 'OpenSea',
      url: process.env.NEXT_PUBLIC_OPENSEA_URL || 'https://opensea.io/collection/we-are-all-going-to-die',
    },
  ];

  const menuLinkClass = 'block min-h-[44px] px-4 py-3 font-ui text-sm text-ash transition-colors hover:bg-parchment/5 hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-parchment';
  const primaryLinkClass = 'block min-h-[44px] border border-parchment/30 bg-parchment/5 px-4 py-3 font-display text-xl text-parchment transition-colors hover:border-parchment/60 hover:bg-parchment/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment';

  return (
    <div className="fixed bottom-0 left-0 right-0 top-16 z-50 md:right-[var(--chat-dock-offset)]">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        data-testid="header-drawer-backdrop"
        aria-hidden="true"
        onMouseDown={onClose}
      />
      <div
        ref={panelRef}
        id="header-account-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="absolute right-0 top-0 flex h-full w-full flex-col overflow-y-auto border-l border-parchment/20 bg-soul-950 shadow-2xl sm:max-w-[400px]"
      >
        <div className="flex items-start justify-between border-b border-neutral-800 px-5 py-5 sm:px-6">
          <div>
            <p className="font-ui text-[11px] uppercase tracking-[0.3em] text-arcane-bright">
              We Are All Going to Die
            </p>
            <h2 id={titleId} className="mt-1 font-display text-2xl text-parchment">
              {isConnected ? 'Account' : 'Menu'}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center text-mist transition-colors hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment"
            aria-label="Close account drawer"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-5 p-5">
          {isConnected && address ? (
            <section className="border border-parchment/25 bg-soul-900/45 p-4" aria-label="Wallet account">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center border border-parchment/20 bg-black/30 p-2">
                  <Image
                    src="/images/wagdie.png"
                    alt=""
                    width={1910}
                    height={588}
                    className="w-full object-contain opacity-90"
                  />
                </div>
                <div className="min-w-0">
                  <p className="font-ui text-xs uppercase tracking-[0.2em] text-arcane-bright">Connected wallet</p>
                  <p className="mt-1 font-display text-2xl text-bone" title={address}>
                    {formatAddress(address)}
                  </p>
                </div>
              </div>
              <code className="mt-4 block break-all font-ui text-xs leading-relaxed text-mist">
                {address}
              </code>
              <p id={descriptionId} className="mt-3 font-ui text-sm text-ash">
                {isHydrating
                  ? 'Checking your wallet session…'
                  : isAuthenticated
                    ? 'Wallet connected and message verified.'
                    : 'Wallet connected. Sign a wallet message to unlock private account actions.'}
              </p>
            </section>
          ) : (
            <section className="border border-neutral-800 bg-black/20 p-4">
              <h3 className="font-display text-2xl text-bone">Welcome, pilgrim</h3>
              <p id={descriptionId} className="mt-2 font-ui text-sm leading-relaxed text-ash">
                Explore the collection, Archive, world map, and community links. Connect your wallet to reveal character and gameplay actions.
              </p>
              <div className="mt-4">
                <WalletButton />
              </div>
            </section>
          )}

          {isConnected && address && (
            <nav className="space-y-2" aria-label="Account links">
              <Link href="/profile" onClick={onClose} className={primaryLinkClass}>
                View profile
              </Link>
              <Link href="/characters?tab=owned" onClick={onClose} className={menuLinkClass}>
                Owned characters
              </Link>
              {!isAuthenticated && (
                <button
                  type="button"
                  onClick={handleAuthenticate}
                  disabled={Boolean(pendingAction) || isHydrating}
                  className="min-h-[44px] w-full border border-arcane-muted/60 px-4 py-3 text-left font-ui text-sm text-arcane-bright transition-colors hover:bg-arcane-muted/10 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arcane-bright"
                >
                  {pendingAction === 'authenticate'
                    ? 'Waiting for wallet signature…'
                    : isHydrating
                      ? 'Checking wallet session…'
                      : 'Sign wallet message'}
                </button>
              )}
            </nav>
          )}

          <nav className="space-y-1" aria-label="Public links">
            <Link href="/characters" onClick={onClose} className={menuLinkClass}>
              Browse NFT characters
            </Link>
            <Link href="/map" onClick={onClose} className={menuLinkClass}>
              Travel on the World Map
            </Link>
            {showLoreNav && (
              <Link href="/lore" onClick={onClose} className={menuLinkClass}>
                Explore the Archive
              </Link>
            )}
            <Link href="/videos" onClick={onClose} className={menuLinkClass}>
              Low Poly Videos
            </Link>
          </nav>

          {isConnected && address && (
            <nav className="space-y-2 border-y border-neutral-800 py-5" aria-label="Connected actions">
              <Link href="/lore/submit" onClick={onClose} className={primaryLinkClass}>
                Submit to the Archive
              </Link>
              <Link href="/searing" onClick={onClose} className={menuLinkClass}>
                Sear your equipment
              </Link>
              <Link href="/spread" onClick={onClose} className={menuLinkClass}>
                Spread infection
              </Link>
            </nav>
          )}

          {isConnected && address && isAdmin && (
            <nav className="space-y-1" aria-label="Admin links">
              <p className="px-4 font-ui text-[11px] uppercase tracking-[0.25em] text-mist">Admin</p>
              <Link href="/map-editor" onClick={onClose} className={menuLinkClass}>
                Map Editor
              </Link>
              <Link href="/searing-map-editor" onClick={onClose} className={menuLinkClass}>
                Searing Map Editor
              </Link>
            </nav>
          )}

          <nav className="grid grid-cols-3 gap-2 border-t border-neutral-800 pt-5" aria-label="Social links">
            {externalLinks.map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[44px] items-center justify-center border border-neutral-800 px-2 font-ui text-xs text-ash transition-colors hover:border-parchment/50 hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {isConnected && address && (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={Boolean(pendingAction)}
              className="min-h-[44px] w-full border border-blood/60 px-4 py-3 text-left font-ui text-sm text-ember transition-colors hover:bg-blood/10 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember"
            >
              {pendingAction === 'disconnect' ? 'Disconnecting wallet…' : 'Disconnect wallet'}
            </button>
          )}

          <div className="min-h-6 font-ui text-sm text-ember" aria-live="polite" aria-atomic="true">
            {actionError || (pendingAction === 'authenticate'
              ? 'Authentication request pending.'
              : pendingAction === 'disconnect'
                ? 'Disconnect request pending.'
                : '')}
          </div>
        </div>
      </div>
    </div>
  );
}
