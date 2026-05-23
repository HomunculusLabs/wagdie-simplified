import Link from 'next/link'
import { AdminGate } from '@/components/admin/AdminGate'
import { AdminShell } from '@/components/admin/AdminShell'

const adminSections = [
  {
    href: '/admin/searing-map',
    title: 'Searing Map',
    description: 'Create, update, and delete Concord searing trait mappings.',
  },
  {
    href: '/admin/map-locations',
    title: 'Map Locations',
    description: 'Create, move, edit, and delete interactive world map location pins.',
  },
  {
    href: '/admin/game-master-agent',
    title: 'GM Agent',
    description: 'Create or adopt the official location-room GM agent, edit persona, and manage knowledge.',
  },
  {
    href: '/admin/location-rooms',
    title: 'Location Rooms',
    description: 'Diagnose location-room health, canonical IDs, GM readiness, participants, ticks, and transcript state.',
  },
  {
    href: '/admin/lore-canonization',
    title: 'Lore Canonization',
    description: 'Draft, preview, publish, and reset canon workflow overrides for lore events.',
  },
  {
    href: '/admin/lore/submissions',
    title: 'Lore Submissions',
    description: 'Review community lore submissions, curate metadata, publish, canonize, decanonize, and hide records.',
  },
]

export default function AdminPage() {
  return (
    <AdminGate>
      <AdminShell
        title="Admin"
        description="Operational tools for maintaining WAGDIE map, searing, lore, and game-master agent workflows."
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {adminSections.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="group rounded-lg border border-soul-accent/20 bg-soul-shadow/70 p-5 transition-colors hover:border-soul-accent/60 hover:bg-soul-shadow"
            >
              <h2 className="font-display text-xl text-soul-accent transition-colors group-hover:text-soul-bone">
                {section.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-soul-mist/75">
                {section.description}
              </p>
            </Link>
          ))}
        </div>
      </AdminShell>
    </AdminGate>
  )
}
