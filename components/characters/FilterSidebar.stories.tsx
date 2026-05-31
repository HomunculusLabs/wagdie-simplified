/**
 * FilterSidebar Stories
 * Collapsible sidebar containing all character filter controls
 */

import type { Meta, StoryObj } from '@storybook/react'
import { FilterSidebar } from './FilterSidebar'
import type { FilterSidebarModel } from './filter-sidebar-types'
import type { OriginCount, AlignmentCount, TraitCount } from '@/types/character'

const mockOrigins: OriginCount[] = [
  { origin: 'Human', count: 1200 },
  { origin: 'Undead', count: 800 },
  { origin: 'Demon', count: 450 },
  { origin: 'Spirit', count: 320 },
]

const mockAlignments: AlignmentCount[] = [
  { alignment: 'Lawful Good', count: 500 },
  { alignment: 'Neutral Good', count: 400 },
  { alignment: 'Chaotic Good', count: 350 },
  { alignment: 'True Neutral', count: 300 },
  { alignment: 'Chaotic Evil', count: 250 },
]

const mockThe17: TraitCount[] = [
  { value: 'Luta the Beacon', count: 1 },
  { value: 'Piyu the Godling', count: 1 },
  { value: 'Child of Her', count: 1 },
]

const mockArmor: TraitCount[] = [
  { value: 'Plate Mail', count: 200 },
  { value: 'Chain Mail', count: 350 },
  { value: 'Leather Armor', count: 500 },
  { value: 'Robes', count: 280 },
]

const mockBack: TraitCount[] = [
  { value: 'Cape', count: 400 },
  { value: 'Wings', count: 150 },
  { value: 'Quiver', count: 200 },
]

const mockMask: TraitCount[] = [
  { value: 'Skull Mask', count: 180 },
  { value: 'Iron Mask', count: 220 },
  { value: 'Hood', count: 300 },
]

const noop = () => {}

function createFilterSidebarModel(overrides: Partial<FilterSidebarModel> = {}): FilterSidebarModel {
  return {
    tab: {
      value: 'all',
      onChange: noop,
    },
    sort: {
      value: 'asc',
      onChange: noop,
    },
    search: {
      value: '',
      onChange: noop,
      onClear: noop,
    },
    toggles: [
      {
        id: 'hasSheet',
        checked: false,
        onChange: noop,
      },
      {
        id: 'hasElizaProfile',
        checked: false,
        onChange: noop,
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
          options: mockOrigins,
          onChange: noop,
          isLoading: false,
        },
        {
          id: 'alignment',
          kind: 'alignment',
          value: null,
          options: mockAlignments,
          onChange: noop,
          isLoading: false,
        },
        {
          id: 'the17',
          kind: 'trait',
          label: 'The 17',
          value: null,
          options: mockThe17,
          onChange: noop,
          isLoading: false,
        },
      ],
      equipment: [
        {
          id: 'armor',
          kind: 'trait',
          label: 'Armor',
          value: null,
          options: mockArmor,
          onChange: noop,
          isLoading: false,
        },
        {
          id: 'back',
          kind: 'trait',
          label: 'Back',
          value: null,
          options: mockBack,
          onChange: noop,
          isLoading: false,
        },
        {
          id: 'mask',
          kind: 'trait',
          label: 'Mask',
          value: null,
          options: mockMask,
          onChange: noop,
          isLoading: false,
        },
      ],
    },
    totalCount: 6231,
    onClearAllFilters: noop,
    ...overrides,
  }
}

const defaultModel = createFilterSidebarModel()

const meta: Meta<typeof FilterSidebar> = {
  title: 'Characters/FilterSidebar',
  component: FilterSidebar,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div className="flex min-h-screen bg-soul-950">
        <Story />
        <div className="flex-1 p-8">
          <p className="text-neutral-400">Main content area</p>
        </div>
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof FilterSidebar>

const defaultArgs = {
  model: defaultModel,
}

export const Default: Story = {
  args: defaultArgs,
}

export const WithActiveFilters: Story = {
  args: {
    model: createFilterSidebarModel({
      tab: {
        ...defaultModel.tab,
        value: 'owned',
      },
      search: {
        ...defaultModel.search,
        value: 'grimwald',
      },
      toggles: defaultModel.toggles.map((toggle) => ({
        ...toggle,
        checked: true,
      })),
      traitGroups: {
        primary: defaultModel.traitGroups.primary.map((filter) => {
          if (filter.id === 'origin') return { ...filter, value: 'Undead' }
          if (filter.id === 'alignment') return { ...filter, value: 'Chaotic Evil' }
          if (filter.id === 'the17') return { ...filter, value: 'Luta the Beacon' }
          return filter
        }),
        equipment: defaultModel.traitGroups.equipment.map((filter) => {
          if (filter.id === 'armor') return { ...filter, value: 'Plate Mail' }
          return filter
        }),
      },
      totalCount: 42,
    }),
  },
}

export const Loading: Story = {
  args: {
    model: createFilterSidebarModel({
      traitGroups: {
        primary: defaultModel.traitGroups.primary.map((filter) => ({
          ...filter,
          isLoading: true,
        })),
        equipment: defaultModel.traitGroups.equipment.map((filter) => ({
          ...filter,
          isLoading: true,
        })),
      },
    }),
  },
}

export const OwnedTab: Story = {
  args: {
    model: createFilterSidebarModel({
      tab: {
        ...defaultModel.tab,
        value: 'owned',
      },
      totalCount: 12,
    }),
  },
}

export const InfectedTab: Story = {
  args: {
    model: createFilterSidebarModel({
      tab: {
        ...defaultModel.tab,
        value: 'infected',
      },
      totalCount: 1847,
    }),
  },
}

export const DescendingSort: Story = {
  args: {
    model: createFilterSidebarModel({
      sort: {
        ...defaultModel.sort,
        value: 'desc',
      },
    }),
  },
}

export const WithSearch: Story = {
  args: {
    model: createFilterSidebarModel({
      search: {
        ...defaultModel.search,
        value: 'token 1234',
      },
    }),
  },
}
