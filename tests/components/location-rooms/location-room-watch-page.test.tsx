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
    messageCount: 5,
    latestSequence: 5,
    latestMessageCreatedAt: '2026-05-24T13:05:00.000Z',
    lastTickAt: '2026-05-24T13:00:00.000Z',
    tickCount: 4,
    completedTurnCount: 3,
    targetTurnCount: 100,
  },
  ttrpg: {
    phase: 'threat',
    combatReadiness: 'ready',
    threatLevel: 4,
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
      id: 'msg-5',
      sequence: 5,
      authorKind: 'game_master',
      tokenId: null,
      authorName: 'Internal GM Agent',
      content: 'The ghoul staggers as the blade bites.',
      createdAt: '2026-05-24T13:05:00.000Z',
      messageDomain: 'combat',
      messageKind: 'gm_outcome',
      ttrpgPhase: 'combat',
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
      createdAt: '2026-05-24T13:01:00.000Z',
      gameplayMessageKind: 'character_action',
    },
    {
      id: 'msg-4',
      sequence: 4,
      authorKind: 'game_master',
      tokenId: null,
      authorName: 'Internal GM Agent',
      content: 'Dice clatter against the ash.',
      createdAt: '2026-05-24T13:04:00.000Z',
      messageDomain: 'combat',
      messageKind: 'roll_card',
      ttrpgPhase: 'combat',
      gameplayMessageKind: 'roll_card',
      gameplayRolls: {
        action: {
          actionType: 'investigate',
          checkType: 'arcana',
          checkLabel: 'Read the Runes',
          checkSource: 'contextual',
          contextualCheckId: 'read-the-runes',
          actor: { kind: 'character', id: '7', tokenId: 7, name: 'Wagdie #7' },
          target: { kind: 'environment', id: null, name: null },
          roll: { formula: '1d20+5', total: 19 },
          modifier: 5,
          total: 19,
          dc: 13,
          tier: 'success',
          outcome: 'success',
        },
        publicEffects: [],
        retaliation: null,
        deaths: [],
        encounterStatusAfter: 'active',
      },
    },
    {
      id: 'msg-2',
      sequence: 2,
      authorKind: 'game_master',
      tokenId: null,
      authorName: 'Internal GM Agent',
      content: 'A bell tolls beneath the ash, promising teeth in the dark.',
      createdAt: '2026-05-24T13:02:00.000Z',
      messageDomain: 'narrative',
      messageKind: 'gm_beat',
      ttrpgPhase: 'threat',
    },
    {
      id: 'msg-3',
      sequence: 3,
      authorKind: 'agent',
      tokenId: 7,
      authorName: 'Wagdie #7',
      content: 'The bell wants blood. I can hear it laughing.',
      createdAt: '2026-05-24T13:03:00.000Z',
      messageDomain: 'narrative',
      messageKind: 'character_reaction',
      ttrpgPhase: 'threat',
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
  pagination: { page: 1, pageSize: 50, total: 5, hasMore: false },
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
    expect(screen.getByText('5 messages')).toBeInTheDocument();
    expect(screen.getByText('Phase Threat · Readiness Ready')).toBeInTheDocument();
    expect(screen.getByText('Phase Threat')).toBeInTheDocument();
    expect(screen.getByText('Readiness Ready')).toBeInTheDocument();
    expect(screen.getByText('Threat 4 / 5')).toBeInTheDocument();
    expect(screen.getByText('Threat level 4 / 5')).toBeInTheDocument();
    expect(screen.getByText('3 completed turns')).toBeInTheDocument();

    expect(screen.getByText('I raise my rusted blade.')).toBeInTheDocument();
    expect(screen.getByText('A bell tolls beneath the ash, promising teeth in the dark.')).toBeInTheDocument();
    expect(screen.getByText('The bell wants blood. I can hear it laughing.')).toBeInTheDocument();
    expect(screen.getByText('Story beat')).toBeInTheDocument();
    expect(screen.getByText('Character reaction')).toBeInTheDocument();
    expect(screen.getByText('Combat action')).toBeInTheDocument();
    expect(screen.getByText('Roll/check result')).toBeInTheDocument();
    expect(screen.getByText('Combat outcome')).toBeInTheDocument();
    expect(screen.getAllByText('Wagdie #7').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Token #7').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Game Master').length).toBeGreaterThan(0);
    expect(screen.queryByText('Internal GM Agent')).not.toBeInTheDocument();

    expect(screen.getByText('Fighter · Level 2')).toBeInTheDocument();
    expect(screen.getByText('Stats unavailable for this participant.')).toBeInTheDocument();
    expect(screen.getAllByText('Ash Ghoul').length).toBeGreaterThan(0);
    expect(screen.getByText('The shrine quiets.')).toBeInTheDocument();

    expect(screen.getAllByLabelText('Structured GM rolls')).toHaveLength(2);
    expect(screen.getByText('Read the Runes')).toBeInTheDocument();
    expect(screen.getByText(/Contextual check · action Investigate/)).toBeInTheDocument();
    expect(screen.getByText(/1d20\+5 → 19/)).toBeInTheDocument();
    expect(screen.getByText('The ghoul staggers as the blade bites.')).toBeInTheDocument();
    expect(screen.queryByText(/Rolls:/)).not.toBeInTheDocument();
    expect(screen.getByText(/1d20\+4 → 18/)).toBeInTheDocument();
    expect(screen.getByText(/Ash Ghoul takes 7 damage/)).toBeInTheDocument();
    expect(screen.getByText(/The ghoul misses/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Advance Gameplay/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Stir the Room/i })).not.toBeInTheDocument();
  });

  it('renders narrative scene-check labels and scene-specific structured roll wording', () => {
    const sceneRoomFixture: PublicLocationRoomRead = {
      ...roomFixture,
      activity: {
        ...roomFixture.activity!,
        messageCount: 3,
        latestSequence: 3,
        completedTurnCount: 4,
      },
      ttrpg: {
        phase: 'exploration',
        combatReadiness: 'none',
        threatLevel: 1,
      },
      messages: [
        {
          id: 'scene-msg-1',
          sequence: 1,
          authorKind: 'agent',
          tokenId: 7,
          authorName: 'Wagdie #7',
          content: 'I brush ash away from the hidden marks.',
          createdAt: '2026-05-24T13:01:00.000Z',
          messageDomain: 'narrative',
          messageKind: 'character_action',
          ttrpgPhase: 'exploration',
        },
        {
          id: 'scene-msg-2',
          sequence: 2,
          authorKind: 'game_master',
          tokenId: null,
          authorName: 'Internal GM Agent',
          content: 'The ash waits on a scene check.',
          createdAt: '2026-05-24T13:02:00.000Z',
          messageDomain: 'narrative',
          messageKind: 'roll_card',
          ttrpgPhase: 'exploration',
          gameplayRolls: {
            rollContext: 'scene_check',
            sceneCheck: {
              sceneCheckId: 'scene_check:beat-1:ash-marks',
              actionIntent: 'search',
              requestSource: 'game_master',
              adjudicationSource: 'game_master',
              adjudicationReason: 'gm_request',
            },
            action: {
              actionType: 'investigate',
              checkType: 'perception',
              checkLabel: 'Search the Ash Marks',
              checkSource: 'fixed',
              actor: { kind: 'character', id: '7', tokenId: 7, name: 'Wagdie #7' },
              target: { kind: 'environment', id: 'ash-marks', name: 'Ash marks' },
              roll: { formula: '1d20+2', total: 16 },
              modifier: 2,
              total: 16,
              dc: 14,
              tier: 'success',
              outcome: 'success',
            },
            publicEffects: [
              {
                kind: 'narrative',
                target: { kind: 'environment', id: 'ash-marks', name: 'Ash marks' },
                amount: null,
                status: null,
                summary: 'The marks reveal a safe path through the cinders.',
              },
            ],
            retaliation: null,
            deaths: [],
            encounterStatusAfter: 'unknown',
          },
        },
        {
          id: 'scene-msg-3',
          sequence: 3,
          authorKind: 'game_master',
          tokenId: null,
          authorName: 'Internal GM Agent',
          content: 'The marks reveal where the floor will not collapse.',
          createdAt: '2026-05-24T13:03:00.000Z',
          messageDomain: 'narrative',
          messageKind: 'gm_outcome',
          ttrpgPhase: 'exploration',
        },
      ],
      gameplay: undefined,
      pagination: { ...roomFixture.pagination, total: 3 },
    };
    mockUsePublicLocationRoom.mockReturnValueOnce({
      roomData: sceneRoomFixture,
      isLoading: false,
      error: null,
      lastFetchedAt: new Date('2026-05-24T13:06:00.000Z'),
      refetch: jest.fn(),
    });

    render(<LocationRoomWatchPage locationId="crows_den" />);

    expect(screen.getByText('Scene action')).toBeInTheDocument();
    expect(screen.getAllByText('Scene check').length).toBeGreaterThan(0);
    expect(screen.getByText('Scene outcome')).toBeInTheDocument();
    expect(screen.getByLabelText('Structured scene check roll')).toBeInTheDocument();
    expect(screen.getByText('Scene check roll')).toBeInTheDocument();
    expect(screen.getByText('Search the Ash Marks')).toBeInTheDocument();
    expect(screen.getByText(/Fixed scene check · intent Search/)).toBeInTheDocument();
    expect(screen.getByText(/1d20\+2 → 16/)).toBeInTheDocument();
    expect(screen.getByText(/Scene total 16 · Success/)).toBeInTheDocument();
    expect(screen.getByText('Scene effects')).toBeInTheDocument();
    expect(screen.getByText(/safe path through the cinders/)).toBeInTheDocument();
    expect(screen.queryByText('Combat action')).not.toBeInTheDocument();
    expect(screen.queryByText('Combat outcome')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Structured GM rolls')).not.toBeInTheDocument();
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
