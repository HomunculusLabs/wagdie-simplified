'use client'

import React from 'react';
import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Navigation } from './Navigation'
import { WalletButton } from '@/components/wallet/WalletButton'
import { useAuth } from '@/hooks/useAuth'
import { isAdmin } from '@/lib/auth/admin'
import { lockBodyScroll, unlockBodyScroll } from '@/lib/utils/bodyScrollLock'

const showLoreNav = process.env.NEXT_PUBLIC_SHOW_LORE_NAV === 'true'

function formatAddress(address?: string | null): string {
  if (!address) return 'Unknown pilgrim'

  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

/**
 * Header Component
 * Main site header with logo, navigation, and wallet connection.
 */
export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(true)
  const { address, isConnected } = useAuth()
  const showConnectedActions = isConnected && Boolean(address)
  const isAdminWallet = isAdmin(address)

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen)
  }

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false)
  }

  const toggleDrawer = () => {
    setIsDrawerOpen(!isDrawerOpen)
  }

  const closeDrawer = () => {
    setIsDrawerOpen(false)
  }

  // TODO: Wire up dark mode toggle in UI
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _toggleDarkMode = () => {
    setDarkMode(!darkMode)
    document.documentElement.classList.toggle('dark')
  }

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Disable body scroll when drawer is open
  useEffect(() => {
    if (isDrawerOpen) {
      lockBodyScroll('header-drawer')
    } else {
      unlockBodyScroll('header-drawer')
    }

    return () => {
      unlockBodyScroll('header-drawer')
    }
  }, [isDrawerOpen])

  return (
    <header className="sticky top-0 z-50 bg-soul-950/95 backdrop-blur-sm border-b border-neutral-800">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo with scroll-to-top */}
          <Link
            href="/"
            onClick={scrollToTop}
            className="group flex items-center cursor-pointer"
            title="Scroll to top"
            aria-label="WAGDIE home"
          >
            <Image
              src="/images/wagdie.png"
              alt="WAGDIE"
              width={1910}
              height={588}
              priority
              className="h-9 w-auto transition-opacity duration-300 group-hover:opacity-80"
            />
          </Link>

          {/* Desktop Navigation */}
          <Navigation className="hidden md:flex" showConnectedActions={showConnectedActions} />

          {/* Mobile Menu Button */}
          <button
            className="md:hidden text-neutral-400 p-2 w-11 h-11 flex items-center justify-center hover:text-soul-accent transition-colors"
            onClick={toggleMobileMenu}
            aria-label="Toggle menu"
            aria-expanded={isMobileMenuOpen}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-2">
            {/* MORE button */}
            <button
              onClick={toggleDrawer}
              className="px-4 py-2 text-neutral-500 hover:text-soul-accent transition-colors font-eskapade text-md"
              title="More options"
              aria-label="Open menu drawer"
            >
              {showConnectedActions ? `Welcome, ${formatAddress(address)}` : 'Menu'}
            </button>

            <WalletButton />
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-neutral-800">
            <Navigation
              isMobile
              onNavClick={closeMobileMenu}
              showConnectedActions={showConnectedActions}
            />
            <div className="mt-4 flex flex-col gap-2 px-2">
              <button
                onClick={() => {
                  closeMobileMenu()
                  toggleDrawer()
                }}
                className="text-left px-4 py-3 text-neutral-500 hover:text-soul-accent transition-colors font-eskapade text-xl"
              >
                More Options
              </button>
              <div className="px-4">
                <WalletButton />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Menu Drawer (Desktop & Mobile) */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 top-16 bg-black/80 backdrop-blur-sm z-50"
          onClick={closeDrawer}
        >
          <div
            className="fixed right-0 top-0.5 h-[calc(100vh-4rem)] w-full max-w-sm bg-soul-950 border-l border-neutral-800 shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-neutral-800 px-6 py-5">
              <div>
                <p className="font-display text-[11px] uppercase tracking-[0.4em] text-neutral-500">
                  We Are All Going to Die
                </p>
                <h2 className="mt-1 text-sm font-eskapade text-neutral-200">Menu</h2>
              </div>
              <button
                onClick={closeDrawer}
                className="p-2 text-neutral-500 hover:text-red-500 transition-colors"
                aria-label="Close drawer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Drawer Content */}
            <div className="space-y-5 p-5">
              {showConnectedActions ? (
                <section className="border border-soul-accent/30 bg-black/20 p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center border border-soul-accent/25 bg-neutral-900/80 p-2">
                      <Image
                        src="/images/wagdie.png"
                        alt="WAGDIE"
                        width={1910}
                        height={588}
                        className="w-full object-contain opacity-90"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-eskapade text-sm text-soul-accent">Welcome</p>
                      <p className="truncate font-display text-2xl text-bone" title={address ?? undefined}>
                        {formatAddress(address)}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 font-eskapade text-xs text-neutral-500">Choose your fate.</p>
                </section>
              ) : (
                <section className="border border-neutral-800 bg-black/20 p-4">
                  <p className="font-display text-xl text-bone">Welcome, pilgrim</p>
                  <p className="mt-2 font-eskapade text-sm text-neutral-500">
                    Connect your wallet to reveal Searing, Spread, and other character actions.
                  </p>
                  <div className="mt-4">
                    <WalletButton />
                  </div>
                </section>
              )}

              <nav className="space-y-1" aria-label="Menu links">
                <Link
                  href="/map"
                  onClick={closeDrawer}
                  className="block px-4 py-3 text-neutral-400 hover:text-soul-accent hover:bg-soul-accent/5 transition-all duration-300 font-eskapade text-sm"
                >
                  Travel on the World Map
                </Link>
                {showLoreNav && (
                  <Link
                    href="/lore"
                    onClick={closeDrawer}
                    className="block px-4 py-3 text-neutral-400 hover:text-soul-accent hover:bg-soul-accent/5 transition-all duration-300 font-eskapade text-sm"
                  >
                    Lore & History
                  </Link>
                )}
                <Link
                  href="/videos"
                  onClick={closeDrawer}
                  className="block px-4 py-3 text-neutral-400 hover:text-soul-accent hover:bg-soul-accent/5 transition-all duration-300 font-eskapade text-sm"
                >
                  Low Poly Videos
                </Link>
              </nav>

              {showConnectedActions && (
                <nav
                  className="border-y border-neutral-800 py-4 space-y-1"
                  aria-label="Connected actions"
                >
                  <Link
                    href="/searing"
                    onClick={closeDrawer}
                    className="block px-4 py-3 text-bone hover:text-soul-accent hover:bg-soul-accent/5 transition-all duration-300 font-display text-xl"
                  >
                    Sear Your Equipment
                  </Link>
                  <Link
                    href="/lore/submit"
                    onClick={closeDrawer}
                    className="block px-4 py-3 text-bone hover:text-soul-accent hover:bg-soul-accent/5 transition-all duration-300 font-display text-xl"
                  >
                    Lore Submission
                  </Link>
                  <Link
                    href="/spread"
                    onClick={closeDrawer}
                    className="block px-4 py-3 text-bone hover:text-soul-accent hover:bg-soul-accent/5 transition-all duration-300 font-display text-xl"
                  >
                    Spread Infection
                  </Link>
                </nav>
              )}

              {isAdminWallet && (
                <nav className="space-y-1" aria-label="Admin links">
                  <p className="px-4 font-eskapade text-[11px] uppercase tracking-[0.25em] text-neutral-600">
                    Admin
                  </p>
                  <Link
                    href="/map-editor"
                    onClick={closeDrawer}
                    className="block px-4 py-3 text-neutral-400 hover:text-soul-accent hover:bg-soul-accent/5 transition-all duration-300 font-eskapade text-sm"
                  >
                    Map Editor
                  </Link>
                  <Link
                    href="/searing-map-editor"
                    onClick={closeDrawer}
                    className="block px-4 py-3 text-neutral-400 hover:text-soul-accent hover:bg-soul-accent/5 transition-all duration-300 font-eskapade text-sm"
                  >
                    Searing Map Editor
                  </Link>
                </nav>
              )}

              <nav
                className="grid grid-cols-3 gap-3 border-t border-neutral-800 pt-5"
                aria-label="Social links"
              >
                <a
                  href="https://discord.gg/wagdie"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 items-center justify-center border border-neutral-800 text-neutral-400 hover:border-soul-accent/50 hover:text-soul-accent transition-all duration-300 font-eskapade text-sm"
                >
                  Discord
                </a>
                <a
                  href="https://twitter.com/WAGDIE_ETH"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 items-center justify-center border border-neutral-800 text-neutral-400 hover:border-soul-accent/50 hover:text-soul-accent transition-all duration-300 font-eskapade text-sm"
                >
                  X
                </a>
                <a
                  href="https://opensea.io/collection/we-are-all-going-to-die"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 items-center justify-center border border-neutral-800 text-neutral-400 hover:border-soul-accent/50 hover:text-soul-accent transition-all duration-300 font-eskapade text-sm"
                >
                  OpenSea
                </a>
              </nav>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
