import { render, screen } from '@testing-library/react';
import { LoreSubmissionForm } from '@/components/lore/submissions/LoreSubmissionForm';

const mockUseAuth = jest.fn();
const mockUseOwnedCharacters = jest.fn();

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/hooks/useOwnedCharacters', () => ({
  useOwnedCharacters: (...args: unknown[]) => mockUseOwnedCharacters(...args),
}));

jest.mock('@/components/lore/submissions/MarkdownEditor', () => ({
  MarkdownEditor: () => <div>Markdown editor</div>,
}));

jest.mock('@/components/lore/submissions/SourceUrlListEditor', () => ({
  SourceUrlListEditor: () => <div>Source URL editor</div>,
}));

const sessionAddress = '0x2222222222222222222222222222222222222222';

function authState(overrides = {}) {
  return {
    address: undefined,
    isConnected: false,
    isConnecting: false,
    isAuthenticated: false,
    isAuthenticating: false,
    isHydrating: false,
    hasHydrated: true,
    session: null,
    error: null,
    connect: jest.fn(),
    authenticate: jest.fn(),
    ...overrides,
  };
}

describe('LoreSubmissionForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseOwnedCharacters.mockReturnValue({
      characters: [],
      isLoading: false,
      error: null,
    });
  });

  it('renders the form from a valid signed session even when the connector has not restored', () => {
    mockUseAuth.mockReturnValue(authState({
      isAuthenticated: true,
      session: {
        address: sessionAddress,
        expires: Date.now() + 60_000,
        selectedCharacter: null,
      },
    }));

    render(<LoreSubmissionForm />);

    expect(screen.getByRole('heading', { name: 'Submit community lore' })).toBeInTheDocument();
    expect(screen.getByText(sessionAddress)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Wallet required' })).not.toBeInTheDocument();
    expect(mockUseOwnedCharacters).toHaveBeenCalledWith(sessionAddress, expect.objectContaining({ enabled: true }));
  });

  it('allows authenticated admins to enter any token ID', () => {
    const adminAddress = '0x08DF3044b520Fd001c93e97041D3F257D8c0dB7B';
    mockUseAuth.mockReturnValue(authState({
      isAuthenticated: true,
      session: {
        address: adminAddress,
        expires: Date.now() + 60_000,
        selectedCharacter: null,
      },
    }));
    mockUseOwnedCharacters.mockReturnValue({
      characters: [{ token_id: 7 }],
      isLoading: false,
      error: null,
    });

    render(<LoreSubmissionForm />);

    expect(screen.getByRole('textbox', { name: 'Token ID' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Token ID' })).not.toBeInTheDocument();
    expect(screen.getByText('Admin override: enter any valid WAGDIE token ID.')).toBeInTheDocument();
    expect(mockUseOwnedCharacters).toHaveBeenCalledWith(adminAddress, expect.objectContaining({ enabled: false }));
  });

  it('requires a signature when the connected wallet has no signed session', () => {
    mockUseAuth.mockReturnValue(authState({
      address: '0x1111111111111111111111111111111111111111',
      isConnected: true,
    }));

    render(<LoreSubmissionForm />);

    expect(screen.getByRole('heading', { name: 'Sign in to continue' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Submit community lore' })).not.toBeInTheDocument();
  });
});
