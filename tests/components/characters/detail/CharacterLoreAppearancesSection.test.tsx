import { render, screen, within } from '@testing-library/react'
import { CharacterLoreAppearancesSection } from '@/components/characters/detail/CharacterLoreAppearancesSection'
import type { EffectiveTokenCharacterLore } from '@/lib/lore/types'

const lore: EffectiveTokenCharacterLore = {
  character: {
    id: 'character-777',
    slug: 'ashen-pilgrim-777',
    name: 'Ashen Pilgrim',
    aliases: [],
    summary: 'A pilgrim remembered by the archive.',
    tokenId: 777,
    tags: ['pilgrim'],
  },
  matchedCharacterIds: ['character-777'],
  appearances: [
    {
      id: 'event-official',
      slug: 'official-rite',
      kind: 'official',
      title: 'Official Rite',
      summary: 'The official archive names the pilgrim.',
      seasonId: 'season-one',
      locationIds: ['location-crypt'],
      characterIds: ['character-777'],
      occurredAt: '2026-05-01T00:00:00.000Z',
      timelineOrder: 1,
      canon: { status: 'canon', stageId: 'canonized', path: [] },
      sourceIds: ['source-one'],
      sourceCount: 1,
      tags: [],
    },
    {
      id: 'event-community',
      slug: 'community-memory',
      kind: 'community',
      title: 'Community Memory',
      summary: 'A community record preserves another sighting.',
      locationIds: [],
      characterIds: ['character-777'],
      publishedAt: '2026-05-02T00:00:00.000Z',
      timelineOrder: 2,
      canon: { status: 'community', stageId: 'community_recorded', path: [] },
      sourceIds: ['source-two'],
      sourceCount: 1,
      tags: [],
    },
  ],
  firstAppearance: {
    id: 'event-official',
    slug: 'official-rite',
    kind: 'official',
    title: 'Official Rite',
    summary: 'The official archive names the pilgrim.',
    seasonId: 'season-one',
    locationIds: ['location-crypt'],
    characterIds: ['character-777'],
    occurredAt: '2026-05-01T00:00:00.000Z',
    timelineOrder: 1,
    canon: { status: 'canon', stageId: 'canonized', path: [] },
    sourceIds: ['source-one'],
    sourceCount: 1,
    tags: [],
  },
  locations: [
    {
      id: 'location-crypt',
      slug: 'ashen-crypt',
      name: 'Ashen Crypt',
      summary: 'A place in the record.',
      tags: [],
    },
  ],
  seasons: [
    {
      id: 'season-one',
      slug: 'season-one',
      title: 'Season One',
      summary: 'The first season.',
      order: 1,
    },
  ],
  sources: [
    {
      id: 'source-one',
      kind: 'tweet',
      title: 'Official source',
      url: 'https://example.com/source-one',
      attribution: 'Archive',
    },
    {
      id: 'source-two',
      kind: 'manual_archive',
      title: 'Community source',
      attribution: 'Community',
    },
  ],
  sourceCount: 2,
}

describe('CharacterLoreAppearancesSection', () => {
  it('renders compact archive context with profile, official, community, location, and source links', () => {
    render(<CharacterLoreAppearancesSection lore={lore} />)

    expect(screen.getByRole('heading', { name: /archive appearances/i })).toBeInTheDocument()
    expect(screen.getByText(/separate from the editable story above/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /full lore profile/i })).toHaveAttribute('href', '/lore/characters/ashen-pilgrim-777')
    expect(screen.getAllByRole('link', { name: 'Official Rite' })[0]).toHaveAttribute('href', '/lore/events/official-rite')
    expect(screen.getByRole('link', { name: 'Community Memory' })).toHaveAttribute('href', '/lore/community/community-memory')
    expect(screen.getByRole('link', { name: 'Ashen Crypt' })).toHaveAttribute('href', '/lore/locations/ashen-crypt')

    const context = screen.getByLabelText(/lore archive context/i)
    expect(within(context).getByText(/2 sources/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Official source' })).toHaveAttribute('href', 'https://example.com/source-one')
  })
})
