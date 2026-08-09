import { render, screen } from '@testing-library/react'
import CharactersPage from '@/app/characters/page'

const push = jest.fn()
const useCharacters = jest.fn()
let walletAddress: string | undefined
let browseState: ReturnType<typeof createBrowseState>
let characterState: ReturnType<typeof createCharacterState>

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}))

jest.mock('@/hooks/useWallet', () => ({
  useWallet: () => ({ address: walletAddress }),
}))

jest.mock('@/hooks/useCharacterBrowseFilters', () => ({
  useCharacterBrowseFilters: () => browseState,
}))

jest.mock('@/hooks/useCharacters', () => ({
  useCharacters: (input: unknown) => useCharacters(input),
}))

jest.mock('@/hooks/useOrigins', () => ({
  useOrigins: () => ({ origins: [], isLoading: false }),
}))

jest.mock('@/hooks/useAlignments', () => ({
  useAlignments: () => ({ alignments: [], isLoading: false }),
}))

jest.mock('@/hooks/useTraitCounts', () => ({
  useArmorTraits: () => ({ traits: [], isLoading: false }),
  useBackTraits: () => ({ traits: [], isLoading: false }),
  useMaskTraits: () => ({ traits: [], isLoading: false }),
  useThe17Traits: () => ({ traits: [], isLoading: false }),
}))

jest.mock('@/components/characters/FilterSidebar', () => ({
  FilterSidebar: () => <aside>Character filters</aside>,
}))

jest.mock('@/components/characters/MobileFilterBar', () => ({
  MobileFilterBar: () => <div>Mobile character filters</div>,
}))

jest.mock('@/components/characters/ActiveFilters', () => ({
  ActiveFilters: () => <div>Active character filters</div>,
}))

jest.mock('@/components/characters/CharacterCard', () => ({
  CharacterCard: ({ href, character }: { href: string; character: { token_id: number } }) => (
    <a href={href}>Character #{character.token_id}</a>
  ),
}))

const handlers = {
  onTabChange: jest.fn(),
  onSortChange: jest.fn(),
  onClearSearch: jest.fn(),
  onHasSheetChange: jest.fn(),
  onHasElizaProfileChange: jest.fn(),
  onOriginChange: jest.fn(),
  onAlignmentChange: jest.fn(),
  onThe17Change: jest.fn(),
  onArmorChange: jest.fn(),
  onBackChange: jest.fn(),
  onMaskChange: jest.fn(),
  onRemoveFilter: jest.fn(),
  onClearAllFilters: jest.fn(),
  onPageChange: jest.fn(),
}

function createBrowseState(overrides: Record<string, unknown> = {}) {
  return {
    filters: {
      tab: 'all',
      sort: 'asc',
      page: 1,
      searchQuery: '',
      hasSheet: false,
      hasElizaProfile: false,
      origin: null,
      alignment: null,
      the17: null,
      armor: null,
      back: null,
      mask: null,
    },
    searchInput: '',
    setSearchInput: jest.fn(),
    hasActiveFilters: false,
    walletForQuery: undefined,
    canQuery: true,
    handlers,
    ...overrides,
  }
}

function createCharacterState(overrides: Record<string, unknown> = {}) {
  return {
    characters: [],
    totalCount: 0,
    totalPages: 0,
    isLoading: false,
    isFetching: false,
    isError: false,
    ...overrides,
  }
}

describe('/characters browse surface', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    walletAddress = undefined
    browseState = createBrowseState()
    characterState = createCharacterState()
    useCharacters.mockImplementation(() => characterState)
  })

  it('keeps the owned-without-wallet query disabled and wallet warning visible', () => {
    browseState = createBrowseState({
      filters: { ...createBrowseState().filters, tab: 'owned' },
      canQuery: false,
    })

    render(<CharactersPage />)

    expect(useCharacters).toHaveBeenCalledWith(expect.objectContaining({
      tab: 'owned',
      wallet: undefined,
      enabled: false,
      perPage: 50,
    }))
    expect(screen.getByText('Wallet Required')).toBeInTheDocument()
  })

  it('preserves explicit error and empty states', () => {
    characterState = createCharacterState({ isError: true })
    const { rerender } = render(<CharactersPage />)
    expect(screen.getByText('Failed to load characters. Please try again.')).toBeInTheDocument()

    characterState = createCharacterState()
    rerender(<CharactersPage />)
    expect(screen.getByText('No characters found')).toBeInTheDocument()
  })

  it('keeps NFT destinations, background refresh, count, and pagination intact', () => {
    browseState = createBrowseState({
      filters: { ...createBrowseState().filters, page: 2 },
    })
    characterState = createCharacterState({
      characters: [{ token_id: 321 }],
      totalCount: 75,
      totalPages: 2,
      isFetching: true,
    })

    render(<CharactersPage />)

    expect(screen.getByRole('link', { name: 'Character #321' }))
      .toHaveAttribute('href', '/characters/321')
    expect(screen.getByText('Showing 51-75 of 75 characters')).toBeInTheDocument()
    expect(screen.getByText('Refreshing')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument()
  })
})
