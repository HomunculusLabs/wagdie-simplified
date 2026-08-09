'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  label: string;
  path: string;
  requiresArchiveFlag?: boolean;
}

const showLoreNav = process.env.NEXT_PUBLIC_SHOW_LORE_NAV !== 'false';

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', path: '/' },
  { label: 'Archive', path: '/lore', requiresArchiveFlag: true },
  { label: 'Pilgrims', path: '/characters' },
  { label: 'World', path: '/map' },
];

export interface NavigationProps {
  className?: string;
  isMobile?: boolean;
  onNavClick?: () => void;
  showConnectedActions?: boolean;
  showArchive?: boolean;
}

function isActiveRoute(pathname: string, itemPath: string): boolean {
  if (itemPath === '/') return pathname === '/';
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

/**
 * Main route navigation. Home is exact-match; route families stay active on descendants.
 */
export function Navigation({
  className = '',
  isMobile = false,
  onNavClick,
  showConnectedActions: _showConnectedActions = false,
  showArchive = showLoreNav,
}: NavigationProps) {
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter((item) => (
    !item.requiresArchiveFlag || showArchive
  ));

  return (
    <nav
      aria-label={isMobile ? 'Mobile navigation' : 'Primary navigation'}
      className={`flex ${isMobile ? 'flex-col gap-1' : 'flex-row gap-8 xl:gap-12'} ${className}`}
    >
      {visibleItems.map((item) => {
        const isActive = isActiveRoute(pathname, item.path);
        return (
          <Link
            key={item.path}
            href={item.path}
            aria-current={isActive ? 'page' : undefined}
            className={`
              group relative flex min-h-[44px] items-center px-3 py-3
              font-eskapade text-sm transition-colors duration-300
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment
              ${isActive
                ? 'text-parchment'
                : 'text-soul-accent/75 hover:text-parchment'
              }
            `}
            onClick={onNavClick}
          >
            {item.label}
            <span
              aria-hidden="true"
              className={`
                absolute bottom-0 left-1/2 h-px -translate-x-1/2 bg-parchment
                transition-all duration-300
                ${isActive ? 'w-full' : 'w-0 group-hover:w-1/2 group-focus-visible:w-1/2'}
              `}
            />
          </Link>
        );
      })}
    </nav>
  );
}
