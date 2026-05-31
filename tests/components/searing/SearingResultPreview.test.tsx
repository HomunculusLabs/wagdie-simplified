import { render, screen } from '@testing-library/react'
import { SearingResultPreview } from '@/components/searing/SearingResultPreview'
import type { OwnedSearableConcord } from '@/hooks/useSearingConcords'
import type { Character } from '@/types/character'

function character(): Character {
  return {
    token_id: 7,
    metadata: {
      name: 'The Seared One',
    },
  }
}

function concord(): OwnedSearableConcord {
  const map = {
    token_name: 'Body Concord',
    location: 'Body',
    new_trait: 'Ashen',
    makesBald: false,
    tokenId: '42',
    concordTokenId: 42,
  }

  return {
    concordId: 42,
    tokenId: '42',
    name: 'Body Concord',
    location: 'Body',
    newTrait: 'Ashen',
    makesBald: false,
    amount: 1n,
    imageUrl: 'https://storage.googleapis.com/concord-images/42.gif',
    map,
    balance: {
      concordId: 42,
      tokenId: 42n,
      balance: 1n,
      isOwned: true,
      contractAddress: '0x0000000000000000000000000000000000000000',
    },
  }
}

describe('SearingResultPreview', () => {
  it('uses the searing preview API image before materialization completes', () => {
    render(
      <SearingResultPreview
        character={character()}
        concord={concord()}
        syncState={{ status: 'idle' }}
      />
    )

    expect(screen.getByRole('img', { name: 'The Seared One' })).toHaveAttribute(
      'src',
      '/api/characters/7/searing/preview?concordId=42'
    )
    expect(screen.getByText('Preview only — confirm the transaction to make this permanent')).toBeInTheDocument()
  })

  it('prefers the completed sync image once materialization finishes', () => {
    render(
      <SearingResultPreview
        character={character()}
        concord={concord()}
        syncState={{ status: 'completed', imageUrl: 'https://cdn.example/seared-7.png' }}
      />
    )

    expect(screen.getByRole('img', { name: 'The Seared One' })).toHaveAttribute(
      'src',
      'https://cdn.example/seared-7.png'
    )
    expect(screen.getByText('Materialized seared result')).toBeInTheDocument()
  })
})
