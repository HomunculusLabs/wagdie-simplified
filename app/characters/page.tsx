/**
 * Characters Browse Page
 * Browse and filter all WAGDIE characters with pagination
 * Uses clean architecture: presentation layer only
 */

'use client'

import { useCallback, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { BannerHeader } from '@/components/shared/BannerHeader'
import { FilterSidebar } from '@/components/characters/FilterSidebar'
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

  const handleCharacterClick = useCallback((tokenId: number) => {
    router.push(`/characters/${tokenId}`)
  }, [router])

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

  return (
    <div className="min-h-screen bg-soul-950">
      <BannerHeader
        title="Characters"
        subtitle="Explore the WAGDIE collection - 6,666 unique characters"
      />

      <div className="flex">
        {/* Filter Sidebar */}
        <FilterSidebar model={filterSidebarModel} />

        {/* Main Content */}
        <main className="flex-1 min-h-screen">
          <div className="px-6 py-8">
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
                <div className="flex items-center justify-between mb-6">
                  <p className="text-md font-eskapade text-neutral-500">
                    Showing {((page - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(page * ITEMS_PER_PAGE, totalCount)} of {totalCount} characters
                  </p>
                  {isFetching && !isLoading && (
                    <Spinner size="sm" />
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 md:gap-6 mb-12">
                  {characters.filter(character => character && character.token_id).map((character) => (
                    <CharacterCard
                      key={character.token_id}
                      character={character}
                      onClick={handleCharacterClick}
                      onSearClick={handleCharacterSearClick}
                      showSearingLink={canSearCharacter(character)}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center py-8 border-t border-neutral-800">
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
    <div className="min-h-screen flex items-center justify-center bg-soul-950">
      <div className="flex flex-col items-center gap-4">
        <Spinner size="lg" />
        <p className="text-neutral-500 font-eskapade text-md">
          Loading Characters
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
