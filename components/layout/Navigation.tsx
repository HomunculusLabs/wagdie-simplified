'use client'

import React from 'react';
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavItem {
  label: string
  path: string
  requiresConnection?: boolean
}

const showLoreNav = process.env.NEXT_PUBLIC_SHOW_LORE_NAV === 'true'

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', path: '/' },
  { label: 'Characters', path: '/characters' },
  { label: 'Searing', path: '/searing', requiresConnection: true },
  { label: 'World Map', path: '/map' },
  ...(showLoreNav ? [{ label: 'Lore', path: '/lore' }] : []),
  { label: 'Low Poly', path: '/videos' },
  { label: 'Spread', path: '/spread', requiresConnection: true },
]

interface NavigationProps {
  className?: string
  isMobile?: boolean
  onNavClick?: () => void
  showConnectedActions?: boolean
}

/**
 * Navigation Component
 * Main navigation menu with active page highlighting using Next.js usePathname.
 */
export function Navigation({
  className = '',
  isMobile = false,
  onNavClick,
  showConnectedActions = false,
}: NavigationProps) {
  const pathname = usePathname()
  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.requiresConnection || showConnectedActions
  )

  const handleClick = () => {
    if (onNavClick) {
      onNavClick()
    }
  }

  return (
    <nav className={`flex ${isMobile ? 'flex-col gap-2' : 'flex-row gap-1'} ${className}`}>
      {visibleItems.map((item) => {
        const isActive = pathname === item.path
        return (
          <Link
            key={item.path}
            href={item.path}
            className={`
              relative px-4 py-3 min-h-[44px] flex items-center
              text-md font-eskapade
              transition-all duration-300 group
              ${isActive
                ? 'text-soul-accent'
                : 'text-neutral-500 hover:text-neutral-300'
              }
            `}
            onClick={handleClick}
          >
            {item.label}
            {/* Underline indicator */}
            <span
              className={`
                absolute bottom-0 left-1/2 -translate-x-1/2 h-[1px] bg-soul-accent
                transition-all duration-300
                ${isActive ? 'w-full' : 'w-0 group-hover:w-1/2'}
              `}
            />
          </Link>
        )
      })}
    </nav>
  )
}
