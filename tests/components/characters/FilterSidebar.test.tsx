import { fireEvent, render, screen } from '@testing-library/react'
import { FilterSidebar } from '@/components/characters/FilterSidebar'
import type { FilterSidebarModel } from '@/components/characters/filter-sidebar-types'
import { getFilterSidebarActiveCount } from '@/components/characters/filter-sidebar-types'

const origins = [
  { origin: 'Human', count: 12 },
  { origin: 'Undead', count: 5 },
]

const alignments = [
  { alignment: 'Lawful Good', count: 4 },
  { alignment: 'Chaotic Evil', count: 3 },
]

const the17 = [
  { value: 'Luta the Beacon', count: 1 },
]

const armor = [
  { value: 'Plate Mail', count: 2 },
]

const back = [
  { value: 'Cape', count: 7 },
]

const mask = [
  { value: 'Skull Mask', count: 8 },
]

function createModel(overrides: Partial<FilterSidebarModel> = {}): FilterSidebarModel {
  return {
    tab: {
      value: 'all',
      onChange: jest.fn(),
    },
    sort: {
      value: 'asc',
      onChange: jest.fn(),
    },
    search: {
      value: '',
      onChange: jest.fn(),
      onClear: jest.fn(),
    },
    toggles: [
      {
        id: 'hasSheet',
        checked: false,
        onChange: jest.fn(),
      },
      {
        id: 'hasElizaProfile',
        checked: false,
        onChange: jest.fn(),
        label: 'Has ElizaOS Profile',
        title: 'Show only characters with an ElizaOS profile',
      },
    ],
    traitGroups: {
      primary: [
        {
          id: 'origin',
          kind: 'origin',
          value: null,
          options: origins,
          onChange: jest.fn(),
          isLoading: false,
        },
        {
          id: 'alignment',
          kind: 'alignment',
          value: null,
          options: alignments,
          onChange: jest.fn(),
          isLoading: false,
        },
        {
          id: 'the17',
          kind: 'trait',
          label: 'The 17',
          value: null,
          options: the17,
          onChange: jest.fn(),
          isLoading: false,
        },
      ],
      equipment: [
        {
          id: 'armor',
          kind: 'trait',
          label: 'Armor',
          value: null,
          options: armor,
          onChange: jest.fn(),
          isLoading: false,
        },
        {
          id: 'back',
          kind: 'trait',
          label: 'Back',
          value: null,
          options: back,
          onChange: jest.fn(),
          isLoading: false,
        },
        {
          id: 'mask',
          kind: 'trait',
          label: 'Mask',
          value: null,
          options: mask,
          onChange: jest.fn(),
          isLoading: false,
        },
      ],
    },
    totalCount: 6231,
    onClearAllFilters: jest.fn(),
    ...overrides,
  }
}

describe('FilterSidebar', () => {
  it('renders controls from the grouped model', () => {
    render(<FilterSidebar model={createModel()} />)

    expect(screen.getByText('6,231 characters')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Name or token ID...')).toBeInTheDocument()
    expect(screen.getByText('Has Sheet')).toBeInTheDocument()
    expect(screen.getByText('Has ElizaOS Profile')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /All Origins/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /All Alignments/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Filter by The 17/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Filter by Armor/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Filter by Back/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Filter by Mask/i })).toBeInTheDocument()
  })

  it('derives active count from search, toggles, and dropdown model values', () => {
    const onClearAllFilters = jest.fn()
    const baseModel = createModel()
    const model = createModel({
      search: {
        ...baseModel.search,
        value: 'grim',
      },
      toggles: baseModel.toggles.map((toggle) => ({
        ...toggle,
        checked: true,
      })),
      traitGroups: {
        primary: baseModel.traitGroups.primary.map((filter) => {
          if (filter.id === 'origin') return { ...filter, value: 'Undead' }
          if (filter.id === 'alignment') return { ...filter, value: 'Chaotic Evil' }
          if (filter.id === 'the17') return { ...filter, value: 'Luta the Beacon' }
          return filter
        }),
        equipment: baseModel.traitGroups.equipment.map((filter) => {
          if (filter.id === 'armor') return { ...filter, value: 'Plate Mail' }
          if (filter.id === 'back') return { ...filter, value: 'Cape' }
          if (filter.id === 'mask') return { ...filter, value: 'Skull Mask' }
          return filter
        }),
      },
      onClearAllFilters,
    })

    expect(getFilterSidebarActiveCount(model)).toBe(9)

    render(<FilterSidebar model={model} />)

    const clearButton = screen.getByRole('button', { name: 'Clear All Filters (9)' })
    expect(clearButton).toBeInTheDocument()

    fireEvent.click(clearButton)
    expect(onClearAllFilters).toHaveBeenCalledTimes(1)
  })

  it('does not treat tab or sort choices as active filters', () => {
    const model = createModel({
      tab: {
        value: 'owned',
        onChange: jest.fn(),
      },
      sort: {
        value: 'desc',
        onChange: jest.fn(),
      },
    })

    expect(getFilterSidebarActiveCount(model)).toBe(0)

    render(<FilterSidebar model={model} />)

    expect(screen.queryByRole('button', { name: /Clear All Filters/i })).not.toBeInTheDocument()
  })
})
