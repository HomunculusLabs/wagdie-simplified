import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from '@/components/layout/Header';

let mockPathname = '/';
const mockUseAuth = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/components/wallet/WalletButton', () => ({
  WalletButton: () => <button type="button">Connect Wallet</button>,
}));

const address = '0x1234567890123456789012345678901234567890';

function authState(overrides = {}) {
  return {
    address,
    isConnected: true,
    isAuthenticated: true,
    isHydrating: false,
    authenticate: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('Header', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/';
    mockUseAuth.mockReturnValue(authState());
  });

  it('renders one connected account trigger without an immediate disconnect control', async () => {
    const user = userEvent.setup();
    render(<Header />);

    const accountTriggers = screen.getAllByRole('button', { name: new RegExp(`Open account drawer for ${address}`, 'i') });
    expect(accountTriggers).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Connect Wallet' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Disconnect wallet' })).not.toBeInTheDocument();

    await user.click(accountTriggers[0]);

    const drawer = screen.getByRole('dialog', { name: 'Account' });
    expect(accountTriggers[0]).toHaveAttribute('aria-expanded', 'true');
    expect(drawer.closest('header')).toBeNull();
    expect(screen.getByRole('link', { name: 'View profile' })).toHaveAttribute('href', '/profile');
    expect(screen.getAllByRole('button', { name: 'Disconnect wallet' })).toHaveLength(1);
  });

  it('opens the disconnected Menu drawer and keeps the connect affordance', async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue(authState({
      address: undefined,
      isConnected: false,
      isAuthenticated: false,
    }));

    render(<Header />);

    const menuTrigger = screen.getByRole('button', { name: 'Open menu drawer' });
    expect(menuTrigger).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Wallet' })).toBeInTheDocument();

    await user.click(menuTrigger);

    expect(menuTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeInTheDocument();
  });
});
