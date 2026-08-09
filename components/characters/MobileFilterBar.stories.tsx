import type { Meta, StoryObj } from '@storybook/react'
import { MobileFilterBar } from './MobileFilterBar'

const meta: Meta<typeof MobileFilterBar> = {
  title: 'Characters/MobileFilterBar',
  component: MobileFilterBar,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile1' },
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-soul-950 px-4 py-8">
        <Story />
      </div>
    ),
  ],
  args: {
    tab: 'all',
    sort: 'asc',
    activeFilterCount: 0,
    onTabChange: () => undefined,
    onSortChange: () => undefined,
    onOpenFilters: () => undefined,
  },
}

export default meta

type Story = StoryObj<typeof MobileFilterBar>

export const Default: Story = {}

export const OwnedWithActiveFilters: Story = {
  args: {
    tab: 'owned',
    sort: 'desc',
    activeFilterCount: 4,
  },
}
