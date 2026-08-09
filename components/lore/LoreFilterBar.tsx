'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { canonStatusLabels } from '@/lib/lore/canonization';
import { buildLoreArchiveHref, type ArchiveView } from '@/lib/lore/archive-view-params';
import { canonStatuses } from '@/lib/lore/types';
import type { LoreArchiveFilters, LoreCharacter, LoreLocation, LoreSeason } from '@/lib/lore/types';

interface LoreFilterBarProps {
  view: ArchiveView;
  filters: LoreArchiveFilters;
  seasons: LoreSeason[];
  locations: LoreLocation[];
  characters: LoreCharacter[];
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

const unsetOption = (label: string) => ({ value: '', label });

const hasActiveFilter = (filters: LoreArchiveFilters) => {
  return Boolean(filters.season || filters.location || filters.character || filters.keyword || filters.canonStatus || filters.canonStage);
};

function SelectField({ label, value, options, onChange }: SelectFieldProps) {
  return (
    <label className="block space-y-2 font-ui text-sm text-neutral-400">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full border border-midnight-light/40 bg-black/30 px-3 py-2.5 font-ui text-sm text-bone outline-none transition-colors focus:border-soul-accent"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-soul-950 text-bone">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function LoreFilterBar({ view, filters, seasons: _seasons, locations, characters }: LoreFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [keyword, setKeyword] = useState(filters.keyword ?? '');
  const active = hasActiveFilter(filters);

  useEffect(() => {
    setKeyword(filters.keyword ?? '');
  }, [filters.keyword]);

  const locationOptions = useMemo(() => [
    unsetOption('All locations'),
    ...locations.map((location) => ({ value: location.slug, label: location.name })),
  ], [locations]);

  const characterOptions = useMemo(() => [
    unsetOption('All characters'),
    ...characters.map((character) => ({ value: character.slug, label: character.name })),
  ], [characters]);

  const canonOptions = useMemo(() => [
    unsetOption('All canon states'),
    ...canonStatuses.map((status) => ({ value: status, label: canonStatusLabels[status] })),
  ], []);

  const pushFilter = (key: keyof LoreArchiveFilters, value: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (value.trim()) {
      params.set(key, value.trim());
    } else {
      params.delete(key);
    }

    if (view === 'characters') {
      params.set('view', 'characters');
    } else {
      params.delete('view');
    }
    params.delete('page');
    const queryString = params.toString();
    router.push(`${pathname}${queryString ? `?${queryString}` : ''}`);
  };

  const handleKeywordSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    pushFilter('keyword', keyword);
  };

  return (
    <section className="border border-midnight-light/70 bg-midnight/20 p-4 sm:p-8">
      <div className="mb-4 flex items-center justify-between gap-4 border-b border-midnight-light/50 pb-3">
        <p className="font-ui text-sm text-neutral-300">
          Archive Filters
          {active && <span className="ml-3 text-sm text-soul-accent">Active</span>}
        </p>
        {active && (
          <Link href={buildLoreArchiveHref({ view })} className="font-ui text-sm text-soul-accent transition-colors hover:text-bone">
            Reset all
          </Link>
        )}
      </div>

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.4fr]">
          <SelectField
            label="Location"
            value={filters.location ?? ''}
            options={locationOptions}
            onChange={(value) => pushFilter('location', value)}
          />
          <SelectField
            label="Character"
            value={filters.character ?? ''}
            options={characterOptions}
            onChange={(value) => pushFilter('character', value)}
          />
          <SelectField
            label="Canon status"
            value={filters.canonStatus ?? ''}
            options={canonOptions}
            onChange={(value) => pushFilter('canonStatus', value)}
          />
          <form onSubmit={handleKeywordSubmit} className="space-y-2 font-ui text-sm text-neutral-400">
            <label htmlFor="lore-keyword">Keywords</label>
            <div className="flex gap-2">
              <input
                id="lore-keyword"
                aria-label="Search lore keyword"
                value={keyword}
                placeholder="..."
                onChange={(event) => setKeyword(event.target.value)}
                className="min-w-0 flex-1 border border-midnight-light/40 bg-black/30 px-3 py-2.5 font-ui text-sm text-bone outline-none transition-colors placeholder:text-neutral-600 focus:border-soul-accent"
              />
              <button
                type="submit"
                className="border border-parchment bg-parchment px-4 py-2.5 font-eskapade text-sm text-soul-950 transition-colors hover:bg-parchment/90"
              >
                Search
              </button>
            </div>
          </form>
        </div>

      </div>
    </section>
  );
}
