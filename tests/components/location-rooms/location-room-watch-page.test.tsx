import { fireEvent, render, screen } from '@testing-library/react';
import { LocationRoomWatchPage } from '@/components/location-rooms/LocationRoomWatchPage';
import type { PublicLocationRoomRead } from '@/lib/eliza/locationRooms/types';
import { usePublicLocationRoom } from '@/hooks/usePublicLocationRoom';

jest.mock('@/hooks/usePublicLocationRoom', () => ({
  PUBLIC_LOCATION_ROOM_DEFAULT_PAGE_SIZE: 50,
  usePublicLocationRoom: jest.fn(),
}));

const mockUsePublicLocationRoom = usePublicLocationRoom as jest.MockedFunction<typeof usePublicLocationRoom>;

const roomFixture: PublicLocationRoomRead = {
  room: {
    id: 'room-1',
    locationId: '11',
    locationName: 'Crows Den',
    tickEnabled: true,
    lastTickAt: '2026-05-24T13:00:00.000Z',
    nextTickAt: null,
    tickCount: 4,
    createdAt: '2026-05-24T12:00:00.000Z',
    updatedAt: '2026-05-24T13:05:00.000Z',
  },
  identity: {
    requestedLocationId: 'crows_den',
    canonicalLocationId: '11',
    canonicalLocationName: 'Crows Den',
    isAlias: true,
  },
  activity: {
    generatedAt: '2026-05-24T13:05:00.000Z',
    messageCount: 2,
    latestSequence: 2,
    latestMessageCreatedAt: '2026-05-24T13:04:00.000Z',
    lastTickAt: '2026-05-24T13:00:00.000Z',
    tickCount: 4,
    completedTurnCount: 3,
    targetTurnCount: 100,
  },
  participants: [
    {
      tokenId: 7,
      name: 'Wagdie #7',
      imageUrl: null,
      characterClass: 'Fighter',
      level: 2,
      coreStats: {
        strength: 14,
        dexterity: 12,
        constitution: 13,
        intelligence: 9,
        wisdom: 10,
        charisma: 8,
      },
      maxHp: 18,
      ac: 15,
      speed: 30,
    },
    {
      tokenId: 8,
      name: 'Wagdie #8',
      imageUrl: null,
    },
  ],
  messages: [
    {
      id: 'msg-2',
      sequence: 2,
      authorKind: 'game_master',
      tokenId: null,
      authorName: 'Internal GM Agent',
      content: 'The ghoul staggers as the blade bites.',
      createdAt: '2026-05-24T13:04:00.000Z',
      gameplayMessageKind: 'gm_outcome',
      gameplayRolls: {
        action: {
          actionType: 'attack',
          actor: { kind: 'character', id: '7', tokenId: 7, name: 'Wagdie #7' },
          target: { kind: 'monster', id: 'ghoul-1', name: 'Ash Ghoul' },
          roll: { formula: '1d20+4', total: 18 },
          modifier: 4,
          total: 18,
          dc: 13,
          tier: 'success',
          outcome: 'success',
        },
        publicEffects: [
          {
            kind: 'damage',
            target: { kind: 'monster', id: 'ghoul-1', name: 'Ash Ghoul' },
            amount: 7,
            status: null,
            summary: 'Ash Ghoul takes 7 damage.',
          },
        ],
        retaliation: {
          actor: { kind: 'monster', id: 'ghoul-1', name: 'Ash Ghoul' },
          target: { kind: 'character', id: '7', tokenId: 7, name: 'Wagdie #7' },
          attackRoll: { formula: '1d20+3', total: 10 },
          damageRoll: { formula: '1d6+1', total: 4 },
          targetAc: 15,
          hit: false,
          amount: 0,
          summary: 'The ghoul misses.',
        },
        deaths: [],
        encounterStatusAfter: 'active',
      },
    },
    {
      id: 'msg-1',
      sequence: 1,
      authorKind: 'agent',
      tokenId: 7,
      authorName: 'Wagdie #7',
      content: 'I raise my rusted blade.',
      createdAt: '2026-05-24T13:03:00.000Z',
      gameplayMessageKind: 'character_action',
    },
  ],
  gameplay: {
    mode: 'enabled',
    status: 'active_encounter',
    encounter: {
      publicTitle: 'The Ashen Maw',
      publicSummary: 'A ghoul stalks the ruin.',
      status: 'active',
      round: 2,
    },
    characters: [
      { tokenId: 7, name: 'Wagdie #7', status: 'alive', hpBand: 'injured' },
      { tokenId: 8, name: 'Wagdie #8', status: 'alive', hpBand: 'healthy' },
    ],
    monsters: [
      { id: 'ghoul-1', name: 'Ash Ghoul', archetype: 'undead', status: 'alive', hpBand: 'critical' },
    ],
    pendingRewardSummary: {
      victoryText: 'The shrine quiets.',
      temporaryBoons: ['Ash Ward'],
      narrativeRewards: ['A bone key'],
    },
  },
  pagination: { page: 1, pageSize: 50, total: 2, hasMore: false },
};

describe('LocationRoomWatchPage', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = jest.fn();
    mockUsePublicLocationRoom.mockReturnValue({
      roomData: roomFixture,
      isLoading: false,
      error: null,
      lastFetchedAt: new Date('2026-05-24T13:06:00.000Z'),
      refetch: jest.fn(),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('uses the public hook as a passive watch reader with page size 50', () => {
    render(<LocationRoomWatchPage locationId="crows_den" />);

    expect(mockUsePublicLocationRoom).toHaveBeenCalledWith({
      locationId: 'crows_den',
      pageSize: 50,
      passiveRefresh: true,
    });
  });

  it('renders alias freshness, map link, readable transcript identity, sidebar stats, and structured rolls', () => {
    render(<LocationRoomWatchPage locationId="crows_den" />);

    expect(screen.getByRole('link', { name: /Back to map/i })).toHaveAttribute('href', '/map');
    expect(screen.getAllByText('Crows Den').length).toBeGreaterThan(0);
    expect(screen.getByText('Requested crows_den aliases to 11')).toBeInTheDocument();
    expect(screen.getByText('2 messages')).toBeInTheDocument();
    expect(screen.getByText('3 completed turns')).toBeInTheDocument();

    expect(screen.getByText('I raise my rusted blade.')).toBeInTheDocument();
    expect(screen.getAllByText('Wagdie #7').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Token #7').length).toBeGreaterThan(0);
    expect(screen.getByText('Game Master')).toBeInTheDocument();
    expect(screen.queryByText('Internal GM Agent')).not.toBeInTheDocument();

    expect(screen.getByText('Fighter · Level 2')).toBeInTheDocument();
    expect(screen.getByText('Stats unavailable for this participant.')).toBeInTheDocument();
    expect(screen.getAllByText('Ash Ghoul').length).toBeGreaterThan(0);
    expect(screen.getByText('The shrine quiets.')).toBeInTheDocument();

    expect(screen.getByLabelText('Structured GM rolls')).toBeInTheDocument();
    expect(screen.getByText('The ghoul staggers as the blade bites.')).toBeInTheDocument();
    expect(screen.queryByText(/Rolls:/)).not.toBeInTheDocument();
    expect(screen.getByText(/1d20\+4 → 18/)).toBeInTheDocument();
    expect(screen.getByText(/Ash Ghoul takes 7 damage/)).toBeInTheDocument();
    expect(screen.getByText(/The ghoul misses/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Advance Gameplay/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Stir the Room/i })).not.toBeInTheDocument();
  });

  it('renders loading, error, and empty states', async () => {
    const refetch = jest.fn();

    mockUsePublicLocationRoom.mockReturnValueOnce({
      roomData: null,
      isLoading: true,
      error: null,
      lastFetchedAt: null,
      refetch,
    });
    const { rerender } = render(<LocationRoomWatchPage locationId="loc-1" />);
    expect(screen.getByText('Loading room transcript…')).toBeInTheDocument();

    mockUsePublicLocationRoom.mockReturnValueOnce({
      roomData: null,
      isLoading: false,
      error: 'Failed to load room transcript',
      lastFetchedAt: null,
      refetch,
    });
    rerender(<LocationRoomWatchPage locationId="loc-1" />);
    expect(screen.getByText('Failed to load room transcript')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
    expect(refetch).toHaveBeenCalled();

    mockUsePublicLocationRoom.mockReturnValueOnce({
      roomData: { ...roomFixture, messages: [], activity: { ...roomFixture.activity!, messageCount: 0, latestSequence: null, latestMessageCreatedAt: null } },
      isLoading: false,
      error: null,
      lastFetchedAt: null,
      refetch,
    });
    rerender(<LocationRoomWatchPage locationId="loc-1" />);
    expect(screen.getByText('no public story activity yet')).toBeInTheDocument();
  });
});
