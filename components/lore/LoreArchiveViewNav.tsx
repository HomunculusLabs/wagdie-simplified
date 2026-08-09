import Link from 'next/link';
import { buildLoreArchiveHref, type ArchiveView } from '@/lib/lore/archive-view-params';
import type { LoreArchiveFilters } from '@/lib/lore/types';

interface LoreArchiveViewNavProps {
  view: ArchiveView;
  filters: LoreArchiveFilters;
}

const views: Array<{ value: ArchiveView; label: string; description: string }> = [
  {
    value: 'timeline',
    label: 'Timeline',
    description: 'Official transmissions and community records in chronological order.',
  },
  {
    value: 'characters',
    label: 'Characters',
    description: 'Narrative profiles gathered from appearances across the Archive.',
  },
];

export function LoreArchiveViewNav({ view, filters }: LoreArchiveViewNavProps) {
  return (
    <nav aria-label="Archive views" className="flex flex-wrap items-end gap-7 sm:gap-10">
      {views.map((item) => {
        const active = item.value === view;
        return (
          <Link
            key={item.value}
            href={buildLoreArchiveHref({ view: item.value, filters })}
            aria-current={active ? 'page' : undefined}
            className={`group inline-flex min-h-14 items-center border-b px-1 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arcane-bright ${active ? 'border-parchment text-parchment' : 'border-transparent text-dark hover:text-parchment'}`}
          >
            <span className="block font-display text-2xl tracking-wide sm:text-3xl">{item.label}</span>
            <span className="sr-only">
              {item.description}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
