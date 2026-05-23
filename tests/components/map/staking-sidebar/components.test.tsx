import { fireEvent, render, screen } from '@testing-library/react';
import { ApprovalBanner, ApprovalReadyBanner } from '@/components/map/staking-sidebar/ApprovalBanner';
import { LocationDetailsCard } from '@/components/map/staking-sidebar/LocationDetailsCard';
import { LocationTabs } from '@/components/map/staking-sidebar/LocationTabs';
import { LocationRoomPanel } from '@/components/map/staking-sidebar/LocationRoomPanel';
import { PaginationControls } from '@/components/map/staking-sidebar/PaginationControls';
import { WalletGate } from '@/components/map/staking-sidebar/WalletGate';
import { CharacterStakeList } from '@/components/map/staking-sidebar/CharacterStakeList';
import { StakedHereList } from '@/components/map/staking-sidebar/StakedHereList';
import type { StakableCharacter } from '@/hooks/map/useMapStakingPanel';

describe('staking-sidebar presentational components', () => {
  it('renders enriched location details', () => {
    render(
      <LocationDetailsCard
        location={{
          id: 'loc-1',
          name: 'The Abyss',
          description: 'A dark and treacherous realm',
          image_url: '/images/locations/abyss.png',
          lore: 'The dead whisper beneath the stones.',
          metadata: {
            center: [1, 2],
            bounds: [[0, 0], [10, 10]],
            properties: {
              region: 'North',
              terrain: 'Ash plains',
              difficulty: 'hard',
            },
            special_properties: ['Cursed', 'Hidden crypts'],
          },
        }}
      />
    );

    expect(screen.getByText('Location Details')).toBeInTheDocument();
    expect(screen.getByAltText('The Abyss image')).toHaveAttribute('src', '/images/locations/abyss.png');
    expect(screen.getByText('The dead whisper beneath the stones.')).toBeInTheDocument();
    expect(screen.getByText('North')).toBeInTheDocument();
    expect(screen.getByText('Ash plains')).toBeInTheDocument();
    expect(screen.getByText('hard')).toBeInTheDocument();
    expect(screen.getByText('Cursed')).toBeInTheDocument();
    expect(screen.getByText('Hidden crypts')).toBeInTheDocument();
  });

  it('renders nothing when location has no enriched details', () => {
    const { container } = render(
      <LocationDetailsCard
        location={{
          id: 'loc-1',
          name: 'The Abyss',
          metadata: { center: [1, 2], bounds: [[0, 0], [10, 10]] },
        }}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders wallet gate copy', () => {
    render(<WalletGate />);

    expect(screen.getByText('Wallet not connected')).toBeInTheDocument();
    expect(screen.getByText('Browse the map freely. Connect to view and stake your characters.')).toBeInTheDocument();
  });

  it('switches location tabs and shows counts', () => {
    const setActiveTab = jest.fn();

    render(
      <LocationTabs
        activeTab="your-characters"
        setActiveTab={setActiveTab}
        stakedCount={3}
        totalCharacters={12}
        isConnected
      />
    );

    expect(screen.getByRole('button', { name: /At This Location\s*3/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Room/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Stake Here\s*12/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /At This Location/i }));
    fireEvent.click(screen.getByRole('button', { name: /Room/i }));

    expect(setActiveTab).toHaveBeenCalledWith('staked-here');
    expect(setActiveTab).toHaveBeenCalledWith('room');
  });

  it('renders public room transcript and hides trigger controls from ineligible visitors', () => {
    render(
      <LocationRoomPanel
        roomData={{
          room: {
            id: 'room-1',
            locationId: 'loc-1',
            locationName: 'The Abyss',
            tickEnabled: true,
            lastTickAt: null,
            nextTickAt: null,
            tickCount: 1,
            createdAt: '2026-05-11T12:00:00.000Z',
            updatedAt: '2026-05-11T12:00:00.000Z',
          },
          participants: [{ tokenId: 7, name: 'Wagdie #7', imageUrl: null }],
          messages: [{
            id: 'msg-1',
            sequence: 1,
            authorKind: 'agent',
            tokenId: 7,
            authorName: 'Wagdie #7',
            content: 'The bell tolls beneath the ash.',
            createdAt: '2026-05-11T12:00:00.000Z',
          }],
          pagination: { page: 1, pageSize: 20, total: 1, hasMore: false },
        }}
        isLoading={false}
        error={null}
        canTriggerAsOwner={false}
        isTriggering={false}
        triggerState="idle"
        triggerError={null}
        onTrigger={jest.fn()}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText('Location Story')).toBeInTheDocument();
    expect(screen.getByText('Public story activity from the eligible characters staked at this location.')).toBeInTheDocument();
    expect(screen.getByText('The bell tolls beneath the ash.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Stir the Room/i })).not.toBeInTheDocument();
  });

  it('renders game-master room messages with narration styling without exposing character token copy', () => {
    render(
      <LocationRoomPanel
        roomData={{
          room: {
            id: 'room-1',
            locationId: 'loc-1',
            locationName: 'The Abyss',
            tickEnabled: true,
            lastTickAt: null,
            nextTickAt: null,
            tickCount: 2,
            createdAt: '2026-05-11T12:00:00.000Z',
            updatedAt: '2026-05-11T12:00:00.000Z',
          },
          participants: [
            { tokenId: 7, name: 'Wagdie #7', imageUrl: null },
            { tokenId: 8, name: 'Wagdie #8', imageUrl: null },
          ],
          messages: [
            {
              id: 'gm-msg-1',
              sequence: 1,
              authorKind: 'game_master',
              tokenId: null,
              authorName: 'Configured Service Agent',
              content: 'A red bell wakes beneath the ash.',
              createdAt: '2026-05-11T12:00:00.000Z',
            },
            {
              id: 'msg-2',
              sequence: 2,
              authorKind: 'agent',
              tokenId: 7,
              authorName: 'Wagdie #7',
              content: 'I hear it calling from below.',
              createdAt: '2026-05-11T12:01:00.000Z',
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 2, hasMore: false },
        }}
        isLoading={false}
        error={null}
        canTriggerAsOwner={false}
        isTriggering={false}
        triggerState="idle"
        triggerError={null}
        onTrigger={jest.fn()}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText('Game Master')).toBeInTheDocument();
    expect(screen.getByText('Story beat')).toBeInTheDocument();
    expect(screen.getByText('A red bell wakes beneath the ash.')).toBeInTheDocument();
    expect(screen.queryByText('Configured Service Agent')).not.toBeInTheDocument();
    expect(screen.getAllByText('Wagdie #7').length).toBeGreaterThan(0);
    expect(screen.getByText('#7')).toBeInTheDocument();
  });

  it('renders gameplay summary, death finality copy, rewards, and classified transcript labels', () => {
    render(
      <LocationRoomPanel
        roomData={{
          room: {
            id: 'room-1',
            locationId: 'loc-1',
            locationName: 'The Abyss',
            tickEnabled: true,
            lastTickAt: null,
            nextTickAt: null,
            tickCount: 3,
            createdAt: '2026-05-11T12:00:00.000Z',
            updatedAt: '2026-05-11T12:00:00.000Z',
          },
          participants: [
            { tokenId: 7, name: 'Wagdie #7', imageUrl: null },
            { tokenId: 8, name: 'Wagdie #8', imageUrl: null },
            { tokenId: 9, name: 'Wagdie #9', imageUrl: null },
          ],
          gameplay: {
            mode: 'enabled',
            status: 'active_encounter',
            encounter: {
              publicTitle: 'The Ashen Maw',
              publicSummary: 'A hooked horror guards the broken shrine.',
              status: 'active',
              round: 4,
            },
            characters: [
              { tokenId: 7, name: 'Wagdie #7', status: 'alive', hpBand: 'injured' },
              { tokenId: 8, name: 'Wagdie #8', status: 'downed', hpBand: 'critical' },
              { tokenId: 9, name: 'Wagdie #9', status: 'dead', hpBand: 'dead' },
            ],
            monsters: [
              {
                id: 'monster-1',
                name: 'Hooked Horror',
                archetype: 'brute',
                status: 'alive',
                hpBand: 'critical',
              },
            ],
            pendingRewardSummary: {
              victoryText: 'The shrine yields a blackened reliquary.',
              temporaryBoons: ['Ash Ward'],
              narrativeRewards: ['Shrine key'],
            },
          },
          messages: [
            {
              id: 'gm-setup',
              sequence: 1,
              authorKind: 'game_master',
              tokenId: null,
              authorName: 'Configured Service Agent',
              content: 'The Maw claws free of the ash.',
              createdAt: '2026-05-11T12:00:00.000Z',
              gameplayMessageKind: 'gm_setup',
            },
            {
              id: 'action',
              sequence: 2,
              authorKind: 'agent',
              tokenId: 7,
              authorName: 'Wagdie #7',
              content: 'I strike for the exposed ribs.',
              createdAt: '2026-05-11T12:01:00.000Z',
              gameplayMessageKind: 'character_action',
            },
            {
              id: 'outcome',
              sequence: 3,
              authorKind: 'game_master',
              tokenId: null,
              authorName: 'Configured Service Agent',
              content: 'The blow lands, but the Maw answers in blood.',
              createdAt: '2026-05-11T12:02:00.000Z',
              gameplayMessageKind: 'gm_outcome',
            },
          ],
          pagination: { page: 1, pageSize: 20, total: 3, hasMore: false },
        }}
        isLoading={false}
        error={null}
        canTriggerAsOwner
        isTriggering={false}
        triggerState="queued"
        triggerError={null}
        onTrigger={jest.fn()}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText('Location Encounter')).toBeInTheDocument();
    expect(screen.getByText('Public gameplay turns from the eligible characters staked at this location.')).toBeInTheDocument();
    expect(screen.getByText('Gameplay status')).toBeInTheDocument();
    expect(screen.getByText('Gameplay enabled')).toBeInTheDocument();
    expect(screen.getByText('Active Encounter')).toBeInTheDocument();
    expect(screen.getByText('Encounter Active')).toBeInTheDocument();
    expect(screen.getByText('Round 4')).toBeInTheDocument();
    expect(screen.getByText('The Ashen Maw')).toBeInTheDocument();
    expect(screen.getByText('A hooked horror guards the broken shrine.')).toBeInTheDocument();
    expect(screen.getByText('2 living · 1 dead')).toBeInTheDocument();
    expect(screen.getByText('Downed · Critical')).toBeInTheDocument();
    expect(screen.getByText('Gameplay death — not canonical/token-final.')).toBeInTheDocument();
    expect(screen.getByText('Hooked Horror')).toBeInTheDocument();
    expect(screen.getByText('brute · Critical')).toBeInTheDocument();
    expect(screen.getByText('Rewards')).toBeInTheDocument();
    expect(screen.getByText('The shrine yields a blackened reliquary.')).toBeInTheDocument();
    expect(screen.getByText('Boons: Ash Ward')).toBeInTheDocument();
    expect(screen.getByText('Narrative: Shrine key')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Advance Gameplay/i })).toBeInTheDocument();
    expect(screen.getByText('Gameplay turn queued. The transcript will refresh when the action resolves.')).toBeInTheDocument();
    expect(screen.getByText('GM setup')).toBeInTheDocument();
    expect(screen.getByText('Character action')).toBeInTheDocument();
    expect(screen.getByText('GM outcome')).toBeInTheDocument();
  });

  it('shows gameplay-aware disabled manual trigger copy', () => {
    render(
      <LocationRoomPanel
        roomData={{
          room: {
            id: 'room-1',
            locationId: 'loc-1',
            locationName: 'The Abyss',
            tickEnabled: false,
            lastTickAt: null,
            nextTickAt: null,
            tickCount: 0,
            createdAt: '2026-05-11T12:00:00.000Z',
            updatedAt: '2026-05-11T12:00:00.000Z',
          },
          participants: [
            { tokenId: 7, name: 'Wagdie #7', imageUrl: null },
            { tokenId: 8, name: 'Wagdie #8', imageUrl: null },
          ],
          gameplay: {
            mode: 'enabled',
            status: 'idle',
            encounter: null,
            characters: [],
            monsters: [],
            pendingRewardSummary: null,
          },
          messages: [],
          pagination: { page: 1, pageSize: 20, total: 0, hasMore: false },
        }}
        isLoading={false}
        error={null}
        canTriggerAsOwner
        isTriggering={false}
        triggerState="idle"
        triggerError={null}
        onTrigger={jest.fn()}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Advance Gameplay/i })).toBeDisabled();
    expect(screen.getByText('Manual gameplay turns are currently disabled.')).toBeInTheDocument();
  });

  it('shows owner trigger controls only for eligible owners and disables them when too few participants remain', () => {
    render(
      <LocationRoomPanel
        roomData={{
          room: {
            id: 'room-1',
            locationId: 'loc-1',
            locationName: 'The Abyss',
            tickEnabled: true,
            lastTickAt: null,
            nextTickAt: null,
            tickCount: 0,
            createdAt: '2026-05-11T12:00:00.000Z',
            updatedAt: '2026-05-11T12:00:00.000Z',
          },
          participants: [{ tokenId: 7, name: 'Wagdie #7', imageUrl: null }],
          messages: [],
          pagination: { page: 1, pageSize: 20, total: 0, hasMore: false },
        }}
        isLoading={false}
        error={null}
        canTriggerAsOwner
        isTriggering={false}
        triggerState="idle"
        triggerError={null}
        onTrigger={jest.fn()}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Stir the Room/i })).toBeDisabled();
    expect(screen.getByText('At least two eligible staked participants are required.')).toBeInTheDocument();
  });

  it('calls the room trigger action for eligible owners', () => {
    const onTrigger = jest.fn().mockResolvedValue(undefined);

    render(
      <LocationRoomPanel
        roomData={{
          room: {
            id: 'room-1',
            locationId: 'loc-1',
            locationName: 'The Abyss',
            tickEnabled: true,
            lastTickAt: null,
            nextTickAt: null,
            tickCount: 0,
            createdAt: '2026-05-11T12:00:00.000Z',
            updatedAt: '2026-05-11T12:00:00.000Z',
          },
          participants: [
            { tokenId: 7, name: 'Wagdie #7', imageUrl: null },
            { tokenId: 8, name: 'Wagdie #8', imageUrl: null },
          ],
          messages: [],
          pagination: { page: 1, pageSize: 20, total: 0, hasMore: false },
        }}
        isLoading={false}
        error={null}
        canTriggerAsOwner
        isTriggering={false}
        triggerState="idle"
        triggerError={null}
        onTrigger={onTrigger}
        onRetry={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Stir the Room/i }));

    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('updates pagination with functional page setters and honors disabled states', () => {
    const setPage = jest.fn();

    render(
      <PaginationControls
        page={1}
        totalPages={3}
        startIndex={10}
        endIndex={20}
        totalCharacters={25}
        isLoadingStatuses={false}
        setPage={setPage}
      />
    );

    expect(screen.getByText(/Showing/)).toHaveTextContent('Showing 11-20 of 25');
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);

    expect(setPage).toHaveBeenCalledTimes(2);
    expect(setPage.mock.calls[0][0](1)).toBe(0);
    expect(setPage.mock.calls[1][0](1)).toBe(2);
  });

  it('hides pagination when only one page is available', () => {
    const { container } = render(
      <PaginationControls
        page={0}
        totalPages={1}
        startIndex={0}
        endIndex={5}
        totalCharacters={5}
        isLoadingStatuses={false}
        setPage={jest.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders approval states and calls approve action when enabled', () => {
    const handleApprove = jest.fn().mockResolvedValue(undefined);

    render(
      <ApprovalBanner
        approvalState="not_approved"
        approvalError={null}
        isApproving={false}
        handleApprove={handleApprove}
      />
    );

    expect(screen.getByText('Contract approval required')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(handleApprove).toHaveBeenCalledTimes(1);
  });

  it('renders approval success and error states', () => {
    const { rerender } = render(<ApprovalReadyBanner />);
    expect(screen.getByText('Wallet approved — choose an unstaked character.')).toBeInTheDocument();

    rerender(
      <ApprovalBanner
        approvalState="error"
        approvalError="Approval check timed out"
        isApproving={false}
        handleApprove={jest.fn()}
      />
    );

    expect(screen.getByText('Approval check failed')).toBeInTheDocument();
    expect(screen.getByText('Approval check timed out')).toBeInTheDocument();
  });

  it('disables owned-character unstake actions when canUnstakeNow is false', () => {
    const character: StakableCharacter = {
      token_id: 7,
      name: 'Wagdie #7',
      image_url: '/images/placeholder-character.svg',
      isStaked: true,
    };

    render(
      <CharacterStakeList
        allCharacters={[character]}
        activeTokenId={null}
        isStaking={false}
        isUnstaking={false}
        isLoadingStatuses={false}
        canStakeNow
        canUnstakeNow={false}
        handleStake={jest.fn()}
        handleUnstake={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Unstake' })).toBeDisabled();
  });

  it('disables staked-here unstake actions when canUnstakeNow is false', () => {
    render(
      <StakedHereList
        stakedHere={[
          {
            token_id: 7,
            name: 'Wagdie #7',
            image_url: '/images/placeholder-character.svg',
            owner_address: '0xabc',
            staker_address: '0xabc',
          } as any,
        ]}
        effectiveWallet="0xabc"
        activeTokenId={null}
        isUnstaking={false}
        isLoadingStatuses={false}
        canUnstakeNow={false}
        handleUnstake={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Unstake' })).toBeDisabled();
  });

  it('disables matching owned-character stake and unstake actions while sync is pending', () => {
    const unstakedCharacter: StakableCharacter = {
      token_id: 7,
      name: 'Wagdie #7',
      image_url: '/images/placeholder-character.svg',
      isStaked: false,
    };
    const stakedCharacter: StakableCharacter = {
      token_id: 8,
      name: 'Wagdie #8',
      image_url: '/images/placeholder-character.svg',
      isStaked: true,
    };

    const { rerender } = render(
      <CharacterStakeList
        allCharacters={[unstakedCharacter]}
        activeTokenId={null}
        isStaking={false}
        isUnstaking={false}
        isLoadingStatuses={false}
        canStakeNow
        canUnstakeNow
        pendingSyncTokenIds={new Set([7])}
        handleStake={jest.fn()}
        handleUnstake={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Stake' })).toBeDisabled();

    rerender(
      <CharacterStakeList
        allCharacters={[stakedCharacter]}
        activeTokenId={null}
        isStaking={false}
        isUnstaking={false}
        isLoadingStatuses={false}
        canStakeNow
        canUnstakeNow
        pendingSyncTokenIds={new Set([8])}
        handleStake={jest.fn()}
        handleUnstake={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Unstake' })).toBeDisabled();
  });

  it('disables matching staked-here unstake actions while sync is pending', () => {
    render(
      <StakedHereList
        stakedHere={[
          {
            token_id: 7,
            name: 'Wagdie #7',
            image_url: '/images/placeholder-character.svg',
            owner_address: '0xabc',
            staker_address: '0xabc',
          } as any,
        ]}
        effectiveWallet="0xabc"
        activeTokenId={null}
        isUnstaking={false}
        isLoadingStatuses={false}
        canUnstakeNow
        pendingSyncTokenIds={new Set([7])}
        handleUnstake={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Unstake' })).toBeDisabled();
  });
});
