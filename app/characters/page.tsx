/**
 * Characters Browse Page
 * Browse and filter all WAGDIE characters with pagination
 * Uses clean architecture: presentation layer only
 */

'use client'

import { useCallback, useMemo, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { EditorialHeading } from '@/components/shared/EditorialHeading'
import { FilterSidebar } from '@/components/characters/FilterSidebar'
import { MobileFilterBar } from '@/components/characters/MobileFilterBar'
import { getFilterSidebarActiveCount } from '@/components/characters/filter-sidebar-types'
import { CharacterCard } from '@/components/characters/CharacterCard'
import { ActiveFilters } from '@/components/characters/ActiveFilters'
import { Alert, Spinner, Pagination, Empty } from '@/components/ui'
import { useCharacters } from '@/hooks/useCharacters'
import { useOrigins } from '@/hooks/useOrigins'
import { useAlignments } from '@/hooks/useAlignments'
import { useArmorTraits, useBackTraits, useMaskTraits, useThe17Traits } from '@/hooks/useTraitCounts'
import { useWallet } from '@/hooks/useWallet'
import { useCharacterBrowseFilters } from '@/hooks/useCharacterBrowseFilters'
import type { Character } from '@/types/character'
import { THE_17_COUNT, THE_17_FILTER_VALUE } from '@/lib/domain/character/the17'
import type { FilterSidebarModel } from '@/components/characters/filter-sidebar-types'

const ITEMS_PER_PAGE = 50

function CharactersPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { address } = useWallet()
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  const {
    filters,
    searchInput,
    setSearchInput,
    hasActiveFilters,
    walletForQuery,
    canQuery,
    handlers,
  } = useCharacterBrowseFilters({
    searchParams,
    router,
    walletAddress: address,
  })

  const {
    tab,
    sort,
    page,
    searchQuery,
    hasSheet,
    hasElizaProfile,
    origin,
    alignment,
    the17,
    armor,
    back,
    mask,
  } = filters

  // Fetch available trait options for dropdowns
  const { origins, isLoading: originsLoading } = useOrigins()
  const { alignments, isLoading: alignmentsLoading } = useAlignments()
  const { traits: armorTraits, isLoading: armorLoading } = useArmorTraits()
  const { traits: backTraits, isLoading: backLoading } = useBackTraits()
  const { traits: maskTraits, isLoading: maskLoading } = useMaskTraits()
  const { traits: the17Traits } = useThe17Traits()
  const the17Options = useMemo(() => {
    const manualThe17Option = {
      value: THE_17_FILTER_VALUE,
      count: THE_17_COUNT,
    }

    return [
      manualThe17Option,
      ...the17Traits.filter((trait) => trait.value !== THE_17_FILTER_VALUE),
    ]
  }, [the17Traits])

  // Fetch characters using custom hook with React Query
  const {
    characters,
    totalCount,
    totalPages,
    isLoading,
    isFetching,
    isError,
  } = useCharacters({
    tab,
    sort,
    wallet: walletForQuery,
    page,
    perPage: ITEMS_PER_PAGE,
    search: searchQuery || undefined,
    hasSheet: hasSheet || undefined,
    hasElizaProfile: hasElizaProfile || undefined,
    origin: origin || undefined,
    alignment: alignment || undefined,
    the17: the17 || undefined,
    armor: armor || undefined,
    back: back || undefined,
    mask: mask || undefined,
    enabled: canQuery,
  })

  const handleCharacterSearClick = useCallback((tokenId: number) => {
    router.push(`/characters/${tokenId}?sear=true`)
  }, [router])

  const canSearCharacter = useCallback((character: Character) => {
    if (!address) return false

    const walletAddress = address.toLowerCase()
    return character.owner_address?.toLowerCase() === walletAddress ||
      character.staker_address?.toLowerCase() === walletAddress
  }, [address])

  const filterSidebarModel: FilterSidebarModel = {
    tab: {
      value: tab,
      onChange: handlers.onTabChange,
    },
    sort: {
      value: sort,
      onChange: handlers.onSortChange,
    },
    search: {
      value: searchInput,
      onChange: setSearchInput,
      onClear: handlers.onClearSearch,
    },
    toggles: [
      {
        id: 'hasSheet',
        checked: hasSheet,
        onChange: handlers.onHasSheetChange,
      },
      {
        id: 'hasElizaProfile',
        checked: hasElizaProfile,
        onChange: handlers.onHasElizaProfileChange,
        label: 'Has ElizaOS Profile',
        title: 'Show only characters with an ElizaOS profile',
      },
    ],
    traitGroups: {
      primary: [
        {
          id: 'origin',
          kind: 'origin',
          value: origin,
          options: origins,
          onChange: handlers.onOriginChange,
          isLoading: originsLoading,
        },
        {
          id: 'alignment',
          kind: 'alignment',
          value: alignment,
          options: alignments,
          onChange: handlers.onAlignmentChange,
          isLoading: alignmentsLoading,
        },
        {
          id: 'the17',
          kind: 'trait',
          label: 'The 17',
          value: the17,
          options: the17Options,
          onChange: handlers.onThe17Change,
          isLoading: false,
        },
      ],
      equipment: [
        {
          id: 'armor',
          kind: 'trait',
          label: 'Armor',
          value: armor,
          options: armorTraits,
          onChange: handlers.onArmorChange,
          isLoading: armorLoading,
        },
        {
          id: 'back',
          kind: 'trait',
          label: 'Back',
          value: back,
          options: backTraits,
          onChange: handlers.onBackChange,
          isLoading: backLoading,
        },
        {
          id: 'mask',
          kind: 'trait',
          label: 'Mask',
          value: mask,
          options: maskTraits,
          onChange: handlers.onMaskChange,
          isLoading: maskLoading,
        },
      ],
    },
    totalCount,
    onClearAllFilters: handlers.onClearAllFilters,
  }

  const activeFilterCount = getFilterSidebarActiveCount(filterSidebarModel)

  return (
    <div className="min-h-screen bg-soul-950 text-bone">
      <header className="border-b border-midnight-light/60 bg-gradient-to-b from-midnight/60 to-soul-950">
        <div className="mx-auto w-full max-w-[1680px] px-4 py-10 sm:px-6 sm:py-12 lg:px-10 lg:py-16">
          <EditorialHeading
            eyebrow="The NFT Collection"
            title="Characters"
            description="Explore the WAGDIE collection — 6,666 unique characters."
          />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1680px]">
        {/* Filter Sidebar */}
        <FilterSidebar
          model={filterSidebarModel}
          mobileOpen={mobileFiltersOpen}
          onMobileOpenChange={setMobileFiltersOpen}
          showMobileToggle={false}
        />

        {/* Main Content */}
        <main className="min-h-screen min-w-0 flex-1">
          <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
            {/* Sticky mobile filter bar */}
            <MobileFilterBar
              tab={tab}
              onTabChange={handlers.onTabChange}
              sort={sort}
              onSortChange={handlers.onSortChange}
              activeFilterCount={activeFilterCount}
              onOpenFilters={() => setMobileFiltersOpen(true)}
            />

            {/* Active Filters Display (mobile-visible summary) */}
            {hasActiveFilters && (
              <ActiveFilters
                filters={{
                  hasSheet,
                  hasElizaProfile,
                  origin,
                  alignment,
                  the17,
                  armor,
                  back,
                  mask,
                  search: searchQuery || null,
                  tab
                }}
                onRemoveFilter={handlers.onRemoveFilter}
                onClearAll={handlers.onClearAllFilters}
              />
            )}

            {/* Owned tab warning */}
            {tab === 'owned' && !address && (
              <Alert
                variant="warning"
                title="Wallet Required"
                className="mb-8"
              >
                Connect your wallet to view your characters
              </Alert>
            )}

            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center py-20">
                <Spinner size="lg" />
              </div>
            )}

            {isError && (
              <Alert
                variant="destructive"
                title="Error"
                className="mb-8"
              >
                Failed to load characters. Please try again.
              </Alert>
            )}

            {/* Empty State */}
            {!isLoading && !isError && characters.length === 0 && (
              <Empty
                message={hasActiveFilters
                  ? "No characters match your current filters"
                  : "No characters found"
                }
                className="my-12"
              />
            )}

            {/* Character Grid */}
            {!isLoading && characters.length > 0 && (
              <>
                {/* Results count */}
                <div className="mb-6 flex min-h-8 items-center justify-between gap-4 border-b border-midnight-light/40 pb-4">
                  <p className="font-ui text-sm leading-6 text-mist">
                    Showing {((page - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(page * ITEMS_PER_PAGE, totalCount)} of {totalCount} characters
                  </p>
                  {isFetching && !isLoading && (
                    <span className="inline-flex items-center gap-2 font-ui text-xs uppercase tracking-[0.16em] text-arcane-bright">
                      <Spinner size="sm" />
                      Refreshing
                    </span>
                  )}
                </div>

                <div className="mb-12 grid grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-3 sm:grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] sm:gap-4 lg:grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] lg:gap-6">
                  {characters.filter(character => character && character.token_id).map((character) => (
                    <CharacterCard
                      key={character.token_id}
                      character={character}
                      href={`/characters/${character.token_id}`}
                      onSearClick={handleCharacterSearClick}
                      showSearingLink={canSearCharacter(character)}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center border-t border-midnight-light/60 py-8">
                    <Pagination
                      currentPage={page}
                      totalPages={totalPages}
                      onPageChange={handlers.onPageChange}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

function LoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-soul-950 px-4">
      <div className="flex flex-col items-center gap-4 border border-midnight-light/60 bg-midnight/40 px-10 py-12">
        <Spinner size="lg" />
        <p className="font-ui text-sm uppercase tracking-[0.2em] text-mist">
          Loading characters
        </p>
      </div>
    </div>
  )
}

export default function CharactersPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <CharactersPageContent />
    </Suspense>
  )
}
