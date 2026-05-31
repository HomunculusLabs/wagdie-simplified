/**
 * FilterSidebar Component
 * Collapsible sidebar containing all character filter controls
 * WAGDIE themed styling with mobile-responsive design
 */

'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { Tabs } from '@/components/ui'
import type { TabItem } from '@/components/ui'
import type { CharacterFilterTab } from '@/types/character'
import { SheetToggle } from './SheetToggle'
import { OriginDropdown } from './OriginDropdown'
import { AlignmentDropdown } from './AlignmentDropdown'
import { TraitDropdown } from './TraitDropdown'
import type {
  FilterSidebarDropdownModel,
  FilterSidebarModel,
  FilterSidebarTraitDropdownModel,
} from './filter-sidebar-types'
import { getFilterSidebarActiveCount } from './filter-sidebar-types'

interface FilterSidebarProps {
  model: FilterSidebarModel
  className?: string
  /** Controlled mobile drawer open state. When provided, the sidebar defers to the parent. */
  mobileOpen?: boolean
  /** Notifies the parent when the mobile drawer wants to open/close. */
  onMobileOpenChange?: (open: boolean) => void
  /** Show the floating mobile toggle button. Defaults to true. */
  showMobileToggle?: boolean
}

const TAB_ITEMS: TabItem[] = [
  { id: 'all', label: 'All' },
  { id: 'owned', label: 'My Characters' },
  { id: 'infected', label: 'Infected' },
  { id: 'cured', label: 'Cured' },
  { id: 'staked', label: 'Staked' },
  { id: 'fallen', label: 'Fallen Warriors' },
]

function renderTraitDropdown(filter: FilterSidebarTraitDropdownModel) {
  return (
    <TraitDropdown
      key={filter.id}
      label={filter.label}
      value={filter.value}
      options={filter.options}
      onChange={filter.onChange}
      isLoading={filter.isLoading}
      className="w-full"
    />
  )
}

function renderDropdown(filter: FilterSidebarDropdownModel) {
  switch (filter.kind) {
    case 'origin':
      return (
        <OriginDropdown
          key={filter.id}
          value={filter.value}
          options={filter.options}
          onChange={filter.onChange}
          isLoading={filter.isLoading}
          className="w-full"
        />
      )
    case 'alignment':
      return (
        <AlignmentDropdown
          key={filter.id}
          value={filter.value}
          options={filter.options}
          onChange={filter.onChange}
          isLoading={filter.isLoading}
          className="w-full"
        />
      )
    case 'trait':
      return renderTraitDropdown(filter)
  }
}

export function FilterSidebar({
  model,
  className = '',
  mobileOpen,
  onMobileOpenChange,
  showMobileToggle = true,
}: FilterSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [internalMobileOpen, setInternalMobileOpen] = useState(false)

  const isControlled = mobileOpen !== undefined
  const isMobileOpen = isControlled ? mobileOpen : internalMobileOpen

  const setIsMobileOpen = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    const resolve = (prev: boolean) => (typeof next === 'function' ? next(prev) : next)
    if (isControlled) {
      onMobileOpenChange?.(resolve(isMobileOpen))
    } else {
      setInternalMobileOpen(resolve)
    }
  }, [isControlled, isMobileOpen, onMobileOpenChange])

  const { tab, sort, search, toggles, traitGroups, totalCount, onClearAllFilters } = model
  const activeFilterCount = getFilterSidebarActiveCount(model)

  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => !prev)
  }, [])

  const toggleMobile = useCallback(() => {
    setIsMobileOpen(prev => !prev)
  }, [setIsMobileOpen])

  const closeMobile = useCallback(() => {
    setIsMobileOpen(false)
  }, [setIsMobileOpen])

  // Lock body scroll while the mobile drawer is open
  useEffect(() => {
    if (!isMobileOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [isMobileOpen])

  // Close the drawer on Escape
  useEffect(() => {
    if (!isMobileOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMobileOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isMobileOpen, setIsMobileOpen])

  return (
    <>
      {/* Mobile Filter Toggle Button */}
      {showMobileToggle && (
        <button
          onClick={toggleMobile}
          className="lg:hidden fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-soul-accent text-black font-eskapade text-sm tracking-wider rounded-sm shadow-lg hover:bg-soul-accent/90 transition-colors"
          aria-label="Toggle filters"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="flex items-center justify-center w-5 h-5 bg-black/30 rounded-full text-xs">
              {activeFilterCount}
            </span>
          )}
        </button>
      )}

      {/* Mobile Overlay */}
      <div
        aria-hidden={!isMobileOpen}
        onClick={closeMobile}
        className={`
          lg:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm
          transition-opacity duration-300 ease-in-out
          ${isMobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
      />

      {/* Sidebar Container */}
      <aside
        className={`
          ${className}
          ${isCollapsed ? 'lg:w-16' : 'lg:w-72'}
          w-[min(85vw,20rem)] lg:w-72
          fixed inset-y-0 left-0 lg:relative lg:inset-auto
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          z-50 lg:z-10
          h-[100dvh] lg:h-auto lg:self-start lg:sticky lg:top-4
          bg-soul-950 border-r border-neutral-800
          shadow-2xl lg:shadow-none
          transition-transform duration-300 ease-in-out
          overflow-hidden flex-shrink-0
        `}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-800">
          {!isCollapsed && (
            <div className="flex items-center gap-2">
              <h2 className="font-eskapade text-lg text-neutral-200 tracking-wider">Filters</h2>
              {activeFilterCount > 0 && (
                <span className="flex items-center justify-center w-5 h-5 bg-soul-accent/20 text-soul-accent rounded-full text-xs font-eskapade">
                  {activeFilterCount}
                </span>
              )}
            </div>
          )}

          {/* Collapse Toggle (Desktop) */}
          <button
            onClick={toggleCollapse}
            className="hidden lg:flex items-center justify-center w-8 h-8 text-neutral-500 hover:text-neutral-300 transition-colors"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
              className={`w-5 h-5 transition-transform ${isCollapsed ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>

          {/* Close Button (Mobile) */}
          <button
            onClick={toggleMobile}
            className="lg:hidden flex items-center justify-center w-8 h-8 text-neutral-500 hover:text-neutral-300 transition-colors"
            aria-label="Close filters"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        {!isCollapsed && (
          <div className="flex flex-col overflow-y-auto max-h-[calc(100vh-180px)] lg:max-h-[calc(100vh-120px)]">
            {/* Results Count */}
            <div className="px-4 py-3 border-b border-neutral-800/50">
              <p className="text-sm text-neutral-500 font-eskapade">
                {totalCount.toLocaleString()} characters
              </p>
            </div>

            {/* Search Input */}
            <div className="p-4 border-b border-neutral-800/50">
              <label className="block text-xs font-eskapade text-neutral-500 mb-2 tracking-wider">
                SEARCH
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <svg
                    className="w-4 h-4 text-neutral-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={search.value}
                  onChange={(e) => search.onChange(e.target.value)}
                  placeholder="Name or token ID..."
                  className="w-full bg-black/40 border border-neutral-800 rounded-sm py-2 pl-10 pr-8 text-sm font-eskapade text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-soul-accent/50 focus:ring-1 focus:ring-soul-accent/30 transition-all"
                />
                {search.value && (
                  <button
                    onClick={search.onClear}
                    className="absolute inset-y-0 right-0 flex items-center pr-2 text-neutral-500 hover:text-neutral-300 transition-colors"
                    aria-label="Clear search"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Category Tabs */}
            <div className="p-4 border-b border-neutral-800/50">
              <label className="block text-xs font-eskapade text-neutral-500 mb-2 tracking-wider">
                CATEGORY
              </label>
              <Tabs
                items={TAB_ITEMS}
                activeId={tab.value}
                onChange={(id) => tab.onChange(id as CharacterFilterTab)}
                variant="vertical"
              />
            </div>

            {/* Sort Toggle */}
            <div className="p-4 border-b border-neutral-800/50">
              <label className="block text-xs font-eskapade text-neutral-500 mb-2 tracking-wider">
                SORT ORDER
              </label>
              <button
                onClick={() => sort.onChange(sort.value === 'asc' ? 'desc' : 'asc')}
                className="flex items-center justify-between w-full px-3 py-2 bg-black/40 border border-neutral-800 rounded-sm text-neutral-400 hover:text-soul-accent hover:border-soul-accent/50 transition-colors font-eskapade text-sm"
              >
                <span>Token ID</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500">
                    {sort.value === 'asc' ? 'Low → High' : 'High → Low'}
                  </span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {sort.value === 'asc' ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    )}
                  </svg>
                </div>
              </button>
            </div>

            {/* Trait Filters Section */}
            <div className="p-4 border-b border-neutral-800/50">
              <label className="block text-xs font-eskapade text-neutral-500 mb-3 tracking-wider">
                TRAIT FILTERS
              </label>

              <div className="space-y-3">
                {toggles.map((toggle) => (
                  <SheetToggle
                    key={toggle.id}
                    checked={toggle.checked}
                    onChange={toggle.onChange}
                    label={toggle.label}
                    title={toggle.title}
                  />
                ))}

                {traitGroups.primary.map(renderDropdown)}
              </div>
            </div>

            {/* Equipment Filters Section */}
            <div className="p-4 border-b border-neutral-800/50">
              <label className="block text-xs font-eskapade text-neutral-500 mb-3 tracking-wider">
                EQUIPMENT FILTERS
              </label>

              <div className="space-y-3">
                {traitGroups.equipment.map(renderTraitDropdown)}
              </div>
            </div>

            {/* Clear All Filters */}
            {activeFilterCount > 0 && (
              <div className="p-4">
                <button
                  onClick={onClearAllFilters}
                  className="w-full px-4 py-2 border border-neutral-700 text-neutral-400 hover:text-soul-accent hover:border-soul-accent/50 transition-colors font-eskapade text-sm tracking-wider rounded-sm"
                >
                  Clear All Filters ({activeFilterCount})
                </button>
              </div>
            )}

            {/* Spacer for mobile safe area */}
            <div className="h-20 lg:h-4 flex-shrink-0" />
          </div>
        )}

        {/* Collapsed State Icons */}
        {isCollapsed && (
          <div className="flex flex-col items-center gap-4 py-4">
            {/* Search Icon */}
            <button
              onClick={toggleCollapse}
              className="p-2 text-neutral-500 hover:text-neutral-300 transition-colors"
              title="Search"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>

            {/* Filter Icon */}
            <button
              onClick={toggleCollapse}
              className="p-2 text-neutral-500 hover:text-neutral-300 transition-colors relative"
              title="Filters"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 bg-soul-accent text-black rounded-full text-[10px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Sort Icon */}
            <button
              onClick={toggleCollapse}
              className="p-2 text-neutral-500 hover:text-neutral-300 transition-colors"
              title="Sort"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              </svg>
            </button>
          </div>
        )}
      </aside>
    </>
  )
}
