/**
 * MobileFilterBar Component
 * Slim sticky bar shown on small screens above the character grid.
 * Surfaces the most common actions (category, sort, filter drawer) without
 * forcing users to open the full filter drawer first.
 */

'use client'

import React from 'react'
import type { CharacterFilterTab, SortOrder } from '@/types/character'

interface MobileFilterBarProps {
  tab: CharacterFilterTab
  onTabChange: (tab: CharacterFilterTab) => void
  sort: SortOrder
  onSortChange: (sort: SortOrder) => void
  activeFilterCount: number
  onOpenFilters: () => void
  className?: string
}

const TAB_OPTIONS: { id: CharacterFilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'owned', label: 'My Characters' },
  { id: 'infected', label: 'Infected' },
  { id: 'cured', label: 'Cured' },
  { id: 'staked', label: 'Staked' },
  { id: 'fallen', label: 'Fallen Warriors' },
]

export function MobileFilterBar({
  tab,
  onTabChange,
  sort,
  onSortChange,
  activeFilterCount,
  onOpenFilters,
  className = '',
}: MobileFilterBarProps) {
  return (
    <div
      className={`
        sticky top-16 z-30 -mx-4 mb-6 border-b border-midnight-light/60
        bg-soul-950/95 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:hidden
        flex items-center gap-2
        ${className}
      `}
    >
      {/* Filters button (opens drawer) */}
      <button
        onClick={onOpenFilters}
        className="flex min-h-11 flex-shrink-0 items-center gap-2 border border-midnight-light/70 bg-midnight/60 px-3 py-2 font-ui text-sm tracking-wide text-ash transition-colors hover:border-arcane-bright hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arcane-bright"
        aria-label="Open filters"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        <span>Filters</span>
        {activeFilterCount > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center bg-arcane/20 px-1 font-ui text-xs text-arcane-bright">
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Category select */}
      <div className="relative flex-1 min-w-0">
        <select
          value={tab}
          onChange={(e) => onTabChange(e.target.value as CharacterFilterTab)}
          className="min-h-11 w-full appearance-none border border-midnight-light/70 bg-midnight/60 py-2 pl-3 pr-8 font-ui text-sm text-ash transition-colors focus:border-arcane-bright focus:outline-none focus:ring-1 focus:ring-arcane-bright"
          aria-label="Category"
        >
          {TAB_OPTIONS.map((option) => (
            <option key={option.id} value={option.id} className="bg-soul-950 text-bone">
              {option.label}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Sort toggle */}
      <button
        onClick={() => onSortChange(sort === 'asc' ? 'desc' : 'asc')}
        className="flex min-h-11 flex-shrink-0 items-center gap-1 border border-midnight-light/70 bg-midnight/60 px-3 py-2 font-ui text-sm text-ash transition-colors hover:border-arcane-bright hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arcane-bright"
        aria-label={`Sort by token ID, currently ${sort === 'asc' ? 'low to high' : 'high to low'}`}
        title="Sort by token ID"
      >
        <span className="text-xs">#</span>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {sort === 'asc' ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          )}
        </svg>
      </button>
    </div>
  )
}
