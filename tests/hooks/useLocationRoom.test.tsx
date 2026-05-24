import { act, renderHook, waitFor } from '@testing-library/react';
import { useLocationRoom } from '@/hooks/map/useLocationRoom';
import { usePublicLocationRoom } from '@/hooks/usePublicLocationRoom';

const roomPayload = {
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
  participants: [],
  messages: [],
  pagination: { page: 1, pageSize: 30, total: 0, hasMore: false },
};

describe('useLocationRoom', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => roomPayload,
    })) as jest.Mock;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('loads public room data without a wallet when the room tab is active', async () => {
    const { result } = renderHook(() => useLocationRoom({
      locationId: 'loc-1',
      isActive: true,
      stakedHere: [],
      walletAddress: undefined,
      isConnected: false,
    }));

    await waitFor(() => expect(result.current.roomData?.room.id).toBe('room-1'));

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/eliza/location-rooms/loc-1?pageSize=30',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(result.current.canTriggerAsOwner).toBe(false);
  });

  it('loads public room data with the shared hook default page size and fetched timestamp', async () => {
    const { result } = renderHook(() => usePublicLocationRoom({
      locationId: 'loc-1',
    }));

    await waitFor(() => expect(result.current.roomData?.room.id).toBe('room-1'));

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/eliza/location-rooms/loc-1?pageSize=50',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(result.current.lastFetchedAt).toBeInstanceOf(Date);
  });

  it('pauses shared hook passive refresh while the document is hidden', async () => {
    jest.useFakeTimers();

    renderHook(() => usePublicLocationRoom({
      locationId: 'loc-1',
      passiveRefresh: true,
      passiveRefreshIntervalMs: 1_000,
    }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });

    await act(async () => {
      jest.advanceTimersByTime(1_000);
      await Promise.resolve();
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });

    await act(async () => {
      jest.advanceTimersByTime(1_000);
      await Promise.resolve();
    });

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });

  it('preserves manual tick POST and post-trigger polling behavior', async () => {
    jest.useFakeTimers();
    let getCount = 0;
    global.fetch = jest.fn(async (_url, init) => {
      if ((init as RequestInit | undefined)?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ success: true, queued: true }),
        };
      }

      getCount += 1;
      return {
        ok: true,
        json: async () => ({
          ...roomPayload,
          messages: [{ sequence: getCount }],
        }),
      };
    }) as jest.Mock;

    const { result } = renderHook(() => useLocationRoom({
      locationId: 'loc-1',
      isActive: true,
      stakedHere: [{
        token_id: 7,
        owner_address: '0xOwner',
        staker_address: null,
        location_id: 'loc-1',
      } as any],
      walletAddress: '0xowner',
      isConnected: true,
    }));

    await waitFor(() => expect(result.current.roomData?.messages[0]?.sequence).toBe(1));
    expect(result.current.canTriggerAsOwner).toBe(true);

    let triggerPromise: Promise<void> | null = null;
    await act(async () => {
      triggerPromise = result.current.triggerTick();
      await Promise.resolve();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/eliza/location-rooms/loc-1/tick',
      expect.objectContaining({ method: 'POST', cache: 'no-store' })
    );

    await act(async () => {
      jest.advanceTimersByTime(2_000);
      await triggerPromise;
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/eliza/location-rooms/loc-1?pageSize=30',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(result.current.triggerState).toBe('queued');
  });

  it('computes owner trigger eligibility from staked participant effective ownership', () => {
    const { result, rerender } = renderHook(
      (props: { wallet: string }) => useLocationRoom({
        locationId: 'loc-1',
        isActive: false,
        stakedHere: [{
          token_id: 7,
          owner_address: '0xOwner',
          staker_address: '0xStakeR',
          location_id: 'loc-1',
        } as any],
        walletAddress: props.wallet,
        isConnected: true,
      }),
      { initialProps: { wallet: '0xowner' } }
    );

    expect(result.current.canTriggerAsOwner).toBe(false);

    rerender({ wallet: '0xstaker' });

    expect(result.current.canTriggerAsOwner).toBe(true);
  });
});
