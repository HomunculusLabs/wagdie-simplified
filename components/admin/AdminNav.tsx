'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const adminNavItems = [
  {
    href: '/admin',
    label: 'Overview',
    exact: true,
  },
  {
    href: '/admin/searing-map',
    label: 'Searing Map',
  },
  {
    href: '/admin/map-locations',
    label: 'Map Locations',
  },
  {
    href: '/admin/game-master-agent',
    label: 'GM Agent',
  },
  {
    href: '/admin/location-rooms',
    label: 'Location Rooms',
  },
  {
    href: '/admin/lore-canonization',
    label: 'Lore Canonization',
  },
  {
    href: '/admin/lore/submissions',
    label: 'Lore Submissions',
  },
]

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Admin sections" className="border-b border-soul-accent/20 bg-soul-shadow/80">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
        {adminNavItems.map((item) => {
          const active = isActive(pathname, item.href, item.exact)

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={[
                'rounded border px-3 py-2 text-sm font-display tracking-wide transition-colors',
                active
                  ? 'border-soul-accent bg-soul-accent/15 text-soul-accent'
                  : 'border-transparent text-soul-mist hover:border-soul-accent/40 hover:text-soul-bone',
              ].join(' ')}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
