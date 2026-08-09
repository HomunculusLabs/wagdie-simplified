/**
 * ActiveFilters Component
 * Displays currently active filters with removal options
 * WAGDIE themed styling
 */

'use client'

import React from 'react'
import type { CharacterFilterTab } from '@/types/character'

type FilterType = 'hasSheet' | 'hasElizaProfile' | 'origin' | 'alignment' | 'the17' | 'armor' | 'back' | 'mask' | 'search'

interface ActiveFiltersProps {
  filters: {
    hasSheet: boolean
    hasElizaProfile: boolean
    origin: string | null
    alignment: string | null
    the17?: string | null
    armor?: string | null
    back?: string | null
    mask?: string | null
    search: string | null
    tab: CharacterFilterTab
  }
  onRemoveFilter: (filterType: FilterType) => void
  onClearAll: () => void
}

export function ActiveFilters({
  filters,
  onRemoveFilter,
  onClearAll
}: ActiveFiltersProps) {
  const activeCount = [
    filters.hasSheet,
    filters.hasElizaProfile,
    Boolean(filters.origin),
    Boolean(filters.alignment),
    Boolean(filters.the17),
    Boolean(filters.armor),
    Boolean(filters.back),
    Boolean(filters.mask),
    Boolean(filters.search?.length)
  ].filter(Boolean).length

  if (activeCount === 0) return null

  return (
    <section aria-label="Active character filters" className="mb-6 flex flex-wrap items-center gap-2 border border-midnight-light/50 bg-midnight/35 px-3 py-3">
      <span className="mr-2 font-ui text-xs uppercase tracking-[0.16em] text-mist">
        Active Filters:
      </span>

      {/* Has Sheet Filter Badge */}
      {filters.hasSheet && (
        <FilterBadge
          label="Has Sheet"
          onRemove={() => onRemoveFilter('hasSheet')}
        />
      )}

      {/* ElizaOS Profile Filter Badge */}
      {filters.hasElizaProfile && (
        <FilterBadge
          label="ElizaOS Profile"
          onRemove={() => onRemoveFilter('hasElizaProfile')}
        />
      )}

      {/* Origin Filter Badge */}
      {filters.origin && (
        <FilterBadge
          label={`Origin: ${filters.origin}`}
          onRemove={() => onRemoveFilter('origin')}
        />
      )}

      {/* Alignment Filter Badge */}
      {filters.alignment && (
        <FilterBadge
          label={`Alignment: ${filters.alignment}`}
          onRemove={() => onRemoveFilter('alignment')}
        />
      )}

      {/* The 17 Filter Badge */}
      {filters.the17 && (
        <FilterBadge
          label={`The 17: ${filters.the17}`}
          onRemove={() => onRemoveFilter('the17')}
        />
      )}

      {/* Equipment Filter Badges */}
      {filters.armor && (
        <FilterBadge
          label={`Armor: ${filters.armor}`}
          onRemove={() => onRemoveFilter('armor')}
        />
      )}

      {filters.back && (
        <FilterBadge
          label={`Back: ${filters.back}`}
          onRemove={() => onRemoveFilter('back')}
        />
      )}

      {filters.mask && (
        <FilterBadge
          label={`Mask: ${filters.mask}`}
          onRemove={() => onRemoveFilter('mask')}
        />
      )}

      {/* Search Filter Badge */}
      {filters.search && (
        <FilterBadge
          label={`Search: "${filters.search}"`}
          onRemove={() => onRemoveFilter('search')}
        />
      )}

      {/* Clear All Button */}
      {activeCount > 1 && (
        <button
          onClick={onClearAll}
          className="ml-auto min-h-11 px-2 font-ui text-xs uppercase tracking-[0.14em] text-mist transition-colors hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment"
        >
          Clear All
        </button>
      )}
    </section>
  )
}

interface FilterBadgeProps {
  label: string
  onRemove: () => void
}

function FilterBadge({ label, onRemove }: FilterBadgeProps) {
  return (
    <span className="inline-flex min-h-9 items-center gap-1.5 border border-arcane-muted/50 bg-arcane/10 py-1 pl-2.5 pr-1">
      <span className="max-w-[180px] truncate font-ui text-sm text-arcane-bright">
        {label}
      </span>
      <button
        onClick={onRemove}
        className="flex h-8 w-8 items-center justify-center text-arcane-bright/75 transition-colors hover:text-parchment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parchment"
        aria-label={`Remove ${label} filter`}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </span>
  )
}
