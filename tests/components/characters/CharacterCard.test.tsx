import { fireEvent, render, screen } from '@testing-library/react'
import { CharacterCard } from '@/components/characters/CharacterCard'
import type { Character } from '@/types/character'

jest.mock('@/components/OwnershipVerificationBanner', () => ({
  OwnershipBadge: () => null,
}))

const character = {
  token_id: 321,
  name: 'Ash Walker',
  image_url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/%3E',
  infection_status: 'healthy',
  staking_status: 'unstaked',
  burned: false,
  location_id: null,
} as Character

describe('CharacterCard browse interactions', () => {
  it('exposes a native NFT detail link when an href is supplied', () => {
    render(<CharacterCard character={character} href="/characters/321" />)

    expect(screen.getByRole('link', { name: 'View Ash Walker' }))
      .toHaveAttribute('href', '/characters/321')
  })

  it('keeps callback click and keyboard activation for existing consumers', () => {
    const onClick = jest.fn()
    render(<CharacterCard character={character} onClick={onClick} />)

    const card = screen.getByRole('button', { name: 'View Ash Walker' })
    fireEvent.click(card)
    fireEvent.keyDown(card, { key: 'Enter' })
    fireEvent.keyDown(card, { key: ' ' })

    expect(onClick).toHaveBeenNthCalledWith(1, 321)
    expect(onClick).toHaveBeenNthCalledWith(2, 321)
    expect(onClick).toHaveBeenNthCalledWith(3, 321)
  })

  it('keeps the searing action separate from card navigation', () => {
    const onClick = jest.fn()
    const onSearClick = jest.fn()
    render(
      <CharacterCard
        character={character}
        onClick={onClick}
        onSearClick={onSearClick}
        showSearingLink
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'sear concord' }))

    expect(onSearClick).toHaveBeenCalledWith(321)
    expect(onClick).not.toHaveBeenCalled()
  })
})
