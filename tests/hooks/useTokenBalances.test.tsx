import { act, renderHook, waitFor } from '@testing-library/react';
import { useTokenBalances } from '@/hooks/useTokenBalances';

let currentAddress: `0x${string}` | undefined;
const publicClient = {};
const walletClient = {};
const mockInitialize = jest.fn(async () => {});
const mockGetAllBalances = jest.fn();

jest.mock('wagmi', () => ({
  useAccount: () => ({ address: currentAddress }),
  usePublicClient: () => publicClient,
  useWalletClient: () => ({ data: walletClient }),
}));
jest.mock('@/lib/services/blockchain/balances', () => ({
  BalancesService: jest.fn(() => ({
    initialize: mockInitialize,
    getAllBalances: mockGetAllBalances,
  })),
}));
jest.mock('@/lib/utils/errors', () => ({ logError: jest.fn() }));

const addressA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
const addressB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const;
const contractAddress = '0x1111111111111111111111111111111111111111' as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function balances(value: bigint) {
  const token = (tokenId: bigint) => ({
    tokenId,
    balance: value,
    contractAddress,
    tokenType: 'ERC1155' as const,
  });
  return {
    data: {
      concord: token(1n),
      corpse: token(2n),
      mushroom: token(3n),
    },
  };
}

describe('useTokenBalances wallet request guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentAddress = addressA;
  });

  it('does not let a previous wallet completion replace the current wallet balances', async () => {
    const firstRequest = deferred<ReturnType<typeof balances>>();
    mockGetAllBalances.mockImplementation((address: string) => (
      address.toLowerCase() === addressA
        ? firstRequest.promise
        : Promise.resolve(balances(22n))
    ));

    const { result, rerender } = renderHook(() => useTokenBalances());
    await waitFor(() => expect(mockGetAllBalances).toHaveBeenCalledWith(addressA));

    currentAddress = addressB;
    rerender();

    expect(result.current.balances.concord).toBeNull();
    await waitFor(() => expect(result.current.balances.concord?.balance).toBe(22n));

    await act(async () => {
      firstRequest.resolve(balances(11n));
      await firstRequest.promise;
    });

    expect(result.current.balances.concord?.balance).toBe(22n);
  });

  it('clears exposed balances when the address disappears', async () => {
    mockGetAllBalances.mockResolvedValue(balances(9n));
    const { result, rerender } = renderHook(() => useTokenBalances());

    await waitFor(() => expect(result.current.balances.concord?.balance).toBe(9n));

    currentAddress = undefined;
    rerender();

    expect(result.current.balances).toEqual({
      concord: null,
      corpse: null,
      mushroom: null,
    });
  });
});
