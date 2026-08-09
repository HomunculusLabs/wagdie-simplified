'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type LoreArchiveSortValue = 'date' | 'title';

interface LoreArchiveSortProps {
  value: LoreArchiveSortValue;
}

export function LoreArchiveSort({ value }: LoreArchiveSortProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateSort = (nextValue: LoreArchiveSortValue) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextValue === 'date') params.delete('sort');
    else params.set('sort', nextValue);
    params.delete('page');
    const query = params.toString();
    router.push(`${pathname}${query ? `?${query}` : ''}`);
  };

  return (
    <label className="flex min-h-14 items-center gap-3 font-ui text-xs text-mist">
      <span>Sort By</span>
      <select
        aria-label="Sort archive"
        value={value}
        onChange={(event) => updateSort(event.target.value as LoreArchiveSortValue)}
        className="min-w-36 border border-midnight-light/70 bg-bone px-3 py-1.5 font-ui text-xs text-soul-950 outline-none focus:border-parchment"
      >
        <option value="date">Date</option>
        <option value="title">Title</option>
      </select>
    </label>
  );
}
