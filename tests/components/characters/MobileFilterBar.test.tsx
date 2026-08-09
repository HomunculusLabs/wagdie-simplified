import { fireEvent, render, screen } from '@testing-library/react'
import { MobileFilterBar } from '@/components/characters/MobileFilterBar'

describe('MobileFilterBar', () => {
  it('preserves category, sort, active-count, and drawer callbacks', () => {
    const onTabChange = jest.fn()
    const onSortChange = jest.fn()
    const onOpenFilters = jest.fn()

    render(
      <MobileFilterBar
        tab="all"
        onTabChange={onTabChange}
        sort="asc"
        onSortChange={onSortChange}
        activeFilterCount={3}
        onOpenFilters={onOpenFilters}
      />
    )

    expect(screen.getByText('3')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), {
      target: { value: 'owned' },
    })
    expect(onTabChange).toHaveBeenCalledWith('owned')

    fireEvent.click(screen.getByRole('button', { name: 'Open filters' }))
    expect(onOpenFilters).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /currently low to high/i }))
    expect(onSortChange).toHaveBeenCalledWith('desc')
  })
})
