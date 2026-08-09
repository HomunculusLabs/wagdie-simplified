import { render, screen } from '@testing-library/react';
import { CharacterProfile } from '@/components/lore/CharacterProfile';
import type { LoreCharacter, LoreEvent } from '@/lib/lore/types';

const character: LoreCharacter = {
  id: 'character-keeper',
  slug: 'keeper',
  name: 'The Keeper',
  aliases: ['Ash Keeper'],
  summary: 'Keeper of the last archive door.',
  tokenId: 91,
  tags: ['archive'],
};

const appearance = (kind: LoreEvent['kind'], order: number): LoreEvent => ({
  id: `${kind}-${order}`,
  slug: `${kind}-${order}`,
  kind,
  title: `${kind === 'official' ? 'Official' : 'Community'} Appearance`,
  summary: 'An event-level appearance.',
  body: 'Body',
  locationIds: [],
  characterIds: [character.id],
  entityRefs: [],
  timelineOrder: order,
  canon: kind === 'official' ? {
    status: 'canon',
    stageId: 'canonized',
    path: [],
  } : {
    status: 'community',
    stageId: 'community_recorded',
    path: [],
  },
  sourceIds: [],
  tags: [],
  keywords: [],
});

const renderProfile = (appearedInEvents: LoreEvent[]) => render(
  <CharacterProfile
    character={character}
    appearedInEvents={appearedInEvents}
    firstAppearance={appearedInEvents[0]}
    associatedLocations={[]}
    characterConnections={[]}
    seasons={[]}
    allLocations={[]}
    sources={[]}
  />,
);

describe('CharacterProfile', () => {
  it('owns the route heading and keeps lore and NFT actions distinct', () => {
    renderProfile([appearance('official', 1)]);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'The Keeper' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View NFT character sheet' }))
      .toHaveAttribute('href', '/characters/91');
    expect(screen.getByRole('link', { name: 'Add a story for WAGDIE #91' }))
      .toHaveAttribute('href', '/lore/submit?tokenId=91');
  });

  it('uses appearance-only provenance wording and preserves event-level canon badges', () => {
    renderProfile([appearance('official', 1), appearance('community', 2)]);

    expect(screen.getAllByText('2 mixed official and community appearances').length).toBeGreaterThan(0);
    expect(screen.getByText('Canon')).toBeInTheDocument();
    expect(screen.getAllByText('Community').length).toBeGreaterThan(0);
    expect(screen.queryByText(/canon character/i)).not.toBeInTheDocument();
  });

  it('renders a sparse zero-appearance state without inventing provenance', () => {
    renderProfile([]);

    expect(screen.getAllByText('No recorded appearances').length).toBeGreaterThan(0);
    expect(screen.getByText('No appeared-in events are currently attached to this character.')).toBeInTheDocument();
  });
});
