import { fireEvent, render, screen, within } from '@testing-library/react';
import { LoreArchive } from '@/components/lore/LoreArchive';
import { buildLoreCharacterArchive } from '@/lib/lore/archive-character-summary';
import type { LoreCharacter, LoreEvent } from '@/lib/lore/types';

const mockRouterPush = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
  usePathname: () => '/lore',
  useSearchParams: () => mockSearchParams,
}));

const character: LoreCharacter = {
  id: 'character-witness',
  slug: 'the-witness',
  name: 'The Witness',
  aliases: [],
  summary: 'A figure preserved across contradictory records.',
  tokenId: 77,
  tags: ['witness'],
};

const event = (
  id: string,
  kind: LoreEvent['kind'],
  timelineOrder: number,
): LoreEvent => ({
  id,
  slug: id,
  kind,
  title: kind === 'official' ? 'The Official Record' : 'The Community Record',
  summary: `${kind} appearance`,
  body: `${kind} body`,
  characterIds: [character.id],
  locationIds: [],
  entityRefs: [],
  timelineOrder,
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

const events = [event('official-record', 'official', 1), event('community-record', 'community', 2)];
const characterArchive = buildLoreCharacterArchive({
  characters: [character],
  allEvents: events,
  matchingEvents: events,
  filtered: false,
});
const commonProps = {
  filters: {},
  seasons: [],
  locations: [],
  characters: [character],
  characterArchive,
};

describe('LoreArchive views', () => {
  beforeEach(() => {
    mockRouterPush.mockReset();
    mockSearchParams = new URLSearchParams();
  });

  it('renders Timeline as link navigation with event routes', () => {
    render(<LoreArchive {...commonProps} view="timeline" items={events} />);

    expect(screen.getByRole('link', { name: /Timeline Official transmissions/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Characters Narrative profiles/i }))
      .toHaveAttribute('href', '/lore?view=characters');
    expect(screen.getByRole('heading', { name: 'The Official Record' })).toBeInTheDocument();
  });

  it('renders lore-character cards with distinct lore and NFT destinations', () => {
    render(<LoreArchive {...commonProps} view="characters" items={events} />);

    expect(screen.getByRole('link', { name: /Characters Narrative profiles/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Open lore profile for The Witness' }))
      .toHaveAttribute('href', '/lore/characters/the-witness');
    expect(screen.getByRole('link', { name: 'View NFT character sheet' }))
      .toHaveAttribute('href', '/characters/77');

    const card = screen.getByRole('article');
    expect(within(card).getByText('2 mixed official and community appearances')).toBeInTheDocument();
    expect(within(card).queryByText(/canon character/i)).not.toBeInTheDocument();
  });

  it('preserves the current view and removes character page when a filter changes', () => {
    mockSearchParams = new URLSearchParams('view=characters&page=4&location=old-place');
    render(
      <LoreArchive
        {...commonProps}
        view="characters"
        items={events}
        filters={{ location: 'old-place' }}
        locations={[
          { id: 'old', slug: 'old-place', name: 'Old Place', aliases: [], summary: '', tags: [] },
          { id: 'new', slug: 'new-place', name: 'New Place', aliases: [], summary: '', tags: [] },
        ]}
      />,
    );

    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'new-place' } });
    expect(mockRouterPush).toHaveBeenCalledWith('/lore?view=characters&location=new-place');
  });

  it('preserves the character view in clear links and explains filtered empty results', () => {
    const emptyPage = buildLoreCharacterArchive({
      characters: [character],
      allEvents: events,
      matchingEvents: [],
      filtered: true,
    });

    render(
      <LoreArchive
        {...commonProps}
        view="characters"
        items={[]}
        filters={{ keyword: 'missing' }}
        characterArchive={emptyPage}
      />,
    );

    expect(screen.getByRole('heading', { name: 'No lore characters found' })).toBeInTheDocument();
    screen.getAllByRole('link', { name: 'Clear filters' }).forEach((link) => {
      expect(link).toHaveAttribute('href', '/lore?view=characters');
    });
  });
});
