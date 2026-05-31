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
        lg:hidden sticky top-0 z-30 -mx-6 mb-6 px-6 py-3
        bg-soul-950/90 backdrop-blur-md border-b border-neutral-800
        flex items-center gap-2
        ${className}
      `}
    >
      {/* Filters button (opens drawer) */}
      <button
        onClick={onOpenFilters}
        className="flex items-center gap-2 px-3 py-2 bg-black/40 border border-neutral-800 rounded-sm text-neutral-300 hover:text-soul-accent hover:border-soul-accent/50 transition-colors font-eskapade text-sm tracking-wider flex-shrink-0"
        aria-label="Open filters"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        <span>Filters</span>
        {activeFilterCount > 0 && (
          <span className="flex items-center justify-center min-w-5 h-5 px-1 bg-soul-accent/20 text-soul-accent rounded-full text-xs">
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Category select */}
      <div className="relative flex-1 min-w-0">
        <select
          value={tab}
          onChange={(e) => onTabChange(e.target.value as CharacterFilterTab)}
          className="w-full appearance-none bg-black/40 border border-neutral-800 rounded-sm py-2 pl-3 pr-8 text-sm font-eskapade text-neutral-300 focus:outline-none focus:border-soul-accent/50 transition-colors"
          aria-label="Category"
        >
          {TAB_OPTIONS.map((option) => (
            <option key={option.id} value={option.id} className="bg-soul-950 text-neutral-200">
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
        className="flex items-center gap-1 px-3 py-2 bg-black/40 border border-neutral-800 rounded-sm text-neutral-400 hover:text-soul-accent hover:border-soul-accent/50 transition-colors font-eskapade text-sm flex-shrink-0"
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
