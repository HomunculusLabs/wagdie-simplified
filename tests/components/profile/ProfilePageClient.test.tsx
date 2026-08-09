import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProfilePageClient } from '@/components/profile/ProfilePageClient';
import type { UseAuthReturn } from '@/hooks/useAuth';
import type { useCharacters as useCharactersHook } from '@/hooks/useCharacters';
import type { useSearingConcords as useSearingConcordsHook } from '@/hooks/useSearingConcords';
import type { useTokenBalances as useTokenBalancesHook } from '@/hooks/useTokenBalances';
import { apiClient } from '@/lib/api/client';

const mockUseAuth = jest.fn();
const mockUseCharacters = jest.fn();
const mockUseTokenBalances = jest.fn();
const mockUseSearingConcords = jest.fn();

jest.mock('@/hooks/useAuth', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('@/hooks/useCharacters', () => ({ useCharacters: (options: unknown) => mockUseCharacters(options) }));
jest.mock('@/hooks/useTokenBalances', () => ({ useTokenBalances: () => mockUseTokenBalances() }));
jest.mock('@/hooks/useSearingConcords', () => ({
  useSearingConcords: (options: unknown) => mockUseSearingConcords(options),
}));
jest.mock('@/lib/api/client', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, public statusText: string, message: string) {
      super(message);
    }
  },
  apiClient: { getEnvelope: jest.fn() },
}));
jest.mock('@/components/characters/CharacterCard', () => ({
  CharacterCard: ({
    character,
    href,
  }: {
    character: { name?: string; token_id: number };
    href: string;
  }) => (
    <a href={href}>
      {character.name ?? `Character ${character.token_id}`}
    </a>
  ),
}));

const mockGetEnvelope = apiClient.getEnvelope as jest.Mock;

const address = '0x1234567890123456789012345678901234567890';
const otherAddress = '0x9999999999999999999999999999999999999999';
const contractAddress = '0x1111111111111111111111111111111111111111' as const;
const authenticate = jest.fn(async () => {});

function authState(overrides: Record<string, unknown> = {}): UseAuthReturn {
  return {
    address,
    isConnected: true,
    isConnecting: false,
    isAuthenticated: true,
    isAuthenticating: false,
    isHydrating: false,
    hasHydrated: true,
    session: { address, expires: Date.now() + 60_000, selectedCharacter: 101 },
    siweStep: 'complete',
    error: null,
    connect: jest.fn(),
    disconnect: jest.fn(async () => {}),
    authenticate,
    refreshSession: jest.fn(async () => null),
    clearError: jest.fn(),
    ...overrides,
  } as UseAuthReturn;
}

const characterResult = {
  characters: [
    { token_id: 1, name: 'Direct Owner', owner_address: address },
    { token_id: 2, name: 'Current Staker', owner_address: otherAddress, staker_address: address },
    { token_id: 3, name: 'Unrelated Wallet', owner_address: otherAddress },
  ],
  totalCount: 3,
  totalPages: 2,
  currentPage: 1,
  hasMore: true,
  isLoading: false,
  isFetching: false,
  isError: false,
  error: null,
  refetch: jest.fn(async () => undefined),
};

const tokenResult = {
  balances: {
    concord: { tokenId: 1n, balance: 8n, contractAddress, tokenType: 'ERC1155' as const },
    corpse: { tokenId: 1n, balance: 2n, contractAddress, tokenType: 'ERC1155' as const },
    mushroom: { tokenId: 1n, balance: 0n, contractAddress, tokenType: 'ERC1155' as const },
  },
  isLoading: false,
  error: null,
  refetch: jest.fn(async () => {}),
};

const searingResult = {
  concords: [],
  allSearableConcords: [],
  isLoading: false,
  error: null,
  refetch: jest.fn(async () => {}),
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

const submission = {
  id: 'submission-1',
  tokenId: '1',
  title: 'A Private Chronicle',
  summary: 'Visible only through the matching signed wallet session.',
  status: 'submitted',
  visibility: 'pending',
  publishedSlug: null,
  submittedAt: '2026-08-01T12:00:00.000Z',
  updatedAt: '2026-08-01T12:00:00.000Z',
};

describe('ProfilePageClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue(authState());
    mockUseCharacters.mockReturnValue(characterResult as ReturnType<typeof useCharactersHook>);
    mockUseTokenBalances.mockReturnValue(tokenResult as ReturnType<typeof useTokenBalancesHook>);
    mockUseSearingConcords.mockReturnValue(searingResult as ReturnType<typeof useSearingConcordsHook>);
    mockGetEnvelope.mockImplementation(() => new Promise(() => {}));
  });

  it('does not request holdings or private posts while disconnected', () => {
    const connect = jest.fn();
    mockUseAuth.mockReturnValue(authState({
      address: undefined,
      isConnected: false,
      isAuthenticated: false,
      hasHydrated: false,
      session: null,
      connect,
    }));

    render(<ProfilePageClient />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
    expect(connect).toHaveBeenCalledTimes(1);
    expect(mockUseCharacters).not.toHaveBeenCalled();
    expect(mockUseTokenBalances).not.toHaveBeenCalled();
    expect(mockGetEnvelope).not.toHaveBeenCalled();
  });

  it('keeps public holdings visible after signature rejection and retries SIWE with force true', async () => {
    mockUseAuth.mockReturnValue(authState({
      isAuthenticated: false,
      session: null,
      siweStep: 'error',
      error: { message: 'Signature rejected', step: 'signing' },
    }));

    render(<ProfilePageClient />);

    expect(screen.getByText('Direct Owner')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(mockGetEnvelope).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Sign wallet message' }));
    await waitFor(() => expect(authenticate).toHaveBeenCalledWith({ force: true }));
  });

  it('keeps authentication failures contained and retryable', async () => {
    const rejectedAuthenticate = jest.fn().mockRejectedValue(new Error('Wallet extension unavailable'));
    mockUseAuth.mockReturnValue(authState({
      isAuthenticated: false,
      session: null,
      authenticate: rejectedAuthenticate,
    }));

    render(<ProfilePageClient />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign wallet message' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Wallet extension unavailable');
    expect(rejectedAuthenticate).toHaveBeenCalledWith({ force: true });
    expect(screen.getByText('Direct Owner')).toBeInTheDocument();
  });

  it('fetches submissions only for an authenticated matching session', async () => {
    mockGetEnvelope.mockResolvedValue({ submissions: [submission] });
    const { rerender } = render(<ProfilePageClient />);

    await screen.findByText('A Private Chronicle');
    expect(mockGetEnvelope).toHaveBeenCalledTimes(1);

    mockUseAuth.mockReturnValue(authState({
      isAuthenticated: true,
      session: { address: otherAddress, expires: Date.now() + 60_000 },
    }));
    rerender(<ProfilePageClient />);

    expect(screen.queryByText('A Private Chronicle')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign wallet message' })).toBeInTheDocument();
  });

  it('aborts and hides an old wallet private-post request when the wallet changes', async () => {
    const oldRequest = deferred<{ submissions: typeof submission[] }>();
    const newSubmission = { ...submission, id: 'submission-2', title: 'New Wallet Chronicle' };
    mockGetEnvelope
      .mockImplementationOnce(() => oldRequest.promise)
      .mockResolvedValueOnce({ submissions: [newSubmission] });

    const { rerender } = render(<ProfilePageClient />);
    await waitFor(() => expect(mockGetEnvelope).toHaveBeenCalledTimes(1));
    const oldSignal = mockGetEnvelope.mock.calls[0][1].signal as AbortSignal;

    mockUseAuth.mockReturnValue(authState({
      address: otherAddress,
      session: { address: otherAddress, expires: Date.now() + 60_000 },
    }));
    rerender(<ProfilePageClient />);

    expect(oldSignal.aborted).toBe(true);
    await screen.findByText('New Wallet Chronicle');

    await act(async () => {
      oldRequest.resolve({ submissions: [submission] });
      await oldRequest.promise;
    });

    expect(screen.queryByText('A Private Chronicle')).not.toBeInTheDocument();
  });

  it('uses paginated owned queries and defensively keeps owner-or-staker custody only', () => {
    render(<ProfilePageClient />);

    expect(mockUseCharacters).toHaveBeenCalledWith(expect.objectContaining({
      tab: 'owned',
      wallet: address,
      page: 1,
      perPage: 12,
    }));
    expect(screen.getByText('Direct Owner')).toBeInTheDocument();
    expect(screen.getByText('Current Staker')).toBeInTheDocument();
    expect(screen.queryByText('Unrelated Wallet')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Direct Owner' })).toHaveAttribute(
      'href',
      '/characters/1'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(mockUseCharacters).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
  });

  it('resets owned-character pagination when the wallet changes', async () => {
    const { rerender } = render(<ProfilePageClient />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(mockUseCharacters).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));

    mockUseAuth.mockReturnValue(authState({
      address: otherAddress,
      session: { address: otherAddress, expires: Date.now() + 60_000 },
    }));
    rerender(<ProfilePageClient />);

    await waitFor(() => expect(mockUseCharacters).toHaveBeenLastCalledWith(expect.objectContaining({
      wallet: otherAddress,
      page: 1,
    })));
  });

  it('loads searable Concord detail only after expansion and labels it as a subset', () => {
    render(<ProfilePageClient />);

    expect(mockUseSearingConcords).toHaveBeenCalledWith({
      enabled: false,
      walletAddress: address,
    });

    fireEvent.click(screen.getByRole('button', {
      name: 'Searable Concords — subset of your Concord balance',
    }));

    expect(mockUseSearingConcords).toHaveBeenLastCalledWith({
      enabled: true,
      walletAddress: address,
    });
  });

  it('isolates token RPC failure from characters and Archive posts', async () => {
    mockGetEnvelope.mockResolvedValue({ submissions: [submission] });
    mockUseTokenBalances.mockReturnValue({
      ...tokenResult,
      balances: { concord: null, corpse: null, mushroom: null },
      error: { message: 'RPC unavailable', type: 'unknown' as const },
    });

    render(<ProfilePageClient />);

    expect(screen.getByText('RPC unavailable')).toBeInTheDocument();
    expect(screen.getByText('Direct Owner')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('A Private Chronicle')).toBeInTheDocument());
  });

  it('isolates an Archive submission failure from public holdings', async () => {
    mockGetEnvelope.mockRejectedValueOnce(new Error('Archive service unavailable'));

    render(<ProfilePageClient />);

    expect(await screen.findByRole('heading', {
      name: 'Archive posts could not be loaded',
    })).toBeInTheDocument();
    expect(screen.getByText('Archive service unavailable')).toBeInTheDocument();
    expect(screen.getByText('Direct Owner')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });
});
