import Link from 'next/link';
import { LoreCharacterArchiveCard } from './LoreCharacterArchiveCard';
import { buildLoreArchiveHref } from '@/lib/lore/archive-view-params';
import type { LoreCharacterArchivePage } from '@/lib/lore/archive-character-summary';
import type { LoreArchiveFilters } from '@/lib/lore/types';

interface LoreCharacterArchiveGridProps {
  archivePage: LoreCharacterArchivePage;
  filters: LoreArchiveFilters;
  hasActiveFilters: boolean;
}

type PageItem = number | 'ellipsis';

const buildPageItems = (currentPage: number, totalPages: number): PageItem[] => {
  const visible = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const pages = [...visible]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);

  return pages.flatMap((page, index) => {
    const previous = pages[index - 1];
    return previous && page - previous > 1 ? ['ellipsis' as const, page] : [page];
  });
};

export function LoreCharacterArchiveGrid({
  archivePage,
  filters,
  hasActiveFilters,
}: LoreCharacterArchiveGridProps) {
  if (archivePage.totalItems === 0) {
    return (
      <section className="border border-midnight-light/60 bg-midnight/35 px-6 py-12 text-center md:px-10 md:py-16">
        <h2 className="font-display text-3xl text-parchment md:text-4xl">No lore characters found</h2>
        <p className="mx-auto mt-4 max-w-2xl font-ui text-base leading-7 text-ash">
          {hasActiveFilters
            ? 'No lore characters appear in records matching the current filters. Their profiles remain unchanged; clear the filters to browse the complete Archive.'
            : 'No effective lore-character profiles are available in the Archive yet.'}
        </p>
        {hasActiveFilters && (
          <Link
            href={buildLoreArchiveHref({ view: 'characters' })}
            className="mt-7 inline-flex min-h-11 items-center border border-arcane-muted px-5 font-ui text-sm text-arcane-bright transition-colors hover:border-arcane-bright hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arcane-bright"
          >
            Clear filters
          </Link>
        )}
      </section>
    );
  }

  const pageItems = buildPageItems(archivePage.page, archivePage.totalPages);

  return (
    <section aria-label="Lore characters" className="space-y-8">
      <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {archivePage.items.map((item) => (
          <LoreCharacterArchiveCard key={item.character.id} item={item} />
        ))}
      </div>

      {archivePage.totalPages > 1 && (
        <nav aria-label="Lore character pagination" className="flex flex-wrap items-center justify-center gap-2 font-ui text-sm">
          {archivePage.page > 1 && (
            <Link
              href={buildLoreArchiveHref({ view: 'characters', filters, page: archivePage.page - 1 })}
              aria-label="Previous lore character page"
              className="inline-flex min-h-11 items-center border border-midnight-light/70 px-4 text-ash transition-colors hover:border-arcane-muted hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arcane-bright"
            >
              Previous
            </Link>
          )}

          {pageItems.map((item, index) => item === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} className="px-2 text-mist" aria-hidden="true">…</span>
          ) : (
            <Link
              key={item}
              href={buildLoreArchiveHref({ view: 'characters', filters, page: item })}
              aria-label={`Lore character page ${item}`}
              aria-current={item === archivePage.page ? 'page' : undefined}
              className={`inline-flex min-h-11 min-w-11 items-center justify-center border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arcane-bright ${item === archivePage.page ? 'border-arcane-bright bg-arcane/20 text-parchment' : 'border-midnight-light/70 text-ash hover:border-arcane-muted hover:text-parchment'}`}
            >
              {item}
            </Link>
          ))}

          {archivePage.page < archivePage.totalPages && (
            <Link
              href={buildLoreArchiveHref({ view: 'characters', filters, page: archivePage.page + 1 })}
              aria-label="Next lore character page"
              className="inline-flex min-h-11 items-center border border-midnight-light/70 px-4 text-ash transition-colors hover:border-arcane-muted hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arcane-bright"
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
