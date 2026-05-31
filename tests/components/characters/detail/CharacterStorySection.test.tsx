import { fireEvent, render, screen } from '@testing-library/react'
import { CharacterStorySection } from '@/components/characters/detail/CharacterStorySection'

const baseProps = {
  story: 'A remembered vow.',
  isEditMode: false,
  isOwner: false,
  showLoreNav: true,
  canSubmitCommunityStory: true,
  onChange: jest.fn(),
  onAddCommunityStory: jest.fn(),
}

describe('CharacterStorySection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows the community story CTA when the explicit admin-inclusive permission is true', () => {
    const onAddCommunityStory = jest.fn()

    render(
      <CharacterStorySection
        {...baseProps}
        isOwner={false}
        canSubmitCommunityStory={true}
        onAddCommunityStory={onAddCommunityStory}
      />
    )

    const button = screen.getByRole('button', { name: /add community story/i })
    fireEvent.click(button)

    expect(onAddCommunityStory).toHaveBeenCalledTimes(1)
  })

  it('hides the community story CTA without permission, in edit mode, or when lore nav is disabled', () => {
    const { rerender } = render(
      <CharacterStorySection {...baseProps} canSubmitCommunityStory={false} />
    )
    expect(screen.queryByRole('button', { name: /add community story/i })).not.toBeInTheDocument()

    rerender(<CharacterStorySection {...baseProps} isEditMode={true} />)
    expect(screen.queryByRole('button', { name: /add community story/i })).not.toBeInTheDocument()

    rerender(<CharacterStorySection {...baseProps} showLoreNav={false} />)
    expect(screen.queryByRole('button', { name: /add community story/i })).not.toBeInTheDocument()
  })
})
