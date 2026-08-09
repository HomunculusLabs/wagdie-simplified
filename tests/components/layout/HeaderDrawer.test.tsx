import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HeaderDrawer, type HeaderDrawerProps } from '@/components/layout/HeaderDrawer';

let mockPathname = '/';
const mockConnect = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    address: undefined,
    isConnected: false,
    isAuthenticating: false,
    isHydrating: false,
    connect: mockConnect,
    disconnect: jest.fn(),
  }),
}));

const address = '0x1234567890123456789012345678901234567890';

function createProps(overrides: Partial<HeaderDrawerProps> = {}): HeaderDrawerProps {
  return {
    isOpen: true,
    address,
    isConnected: true,
    isAuthenticated: true,
    isHydrating: false,
    isAdmin: false,
    onClose: jest.fn(),
    onAuthenticate: jest.fn().mockResolvedValue(undefined),
    onDisconnect: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function DrawerHarness({ props }: { props: HeaderDrawerProps }) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>Open drawer</button>
      <HeaderDrawer
        {...props}
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
          props.onClose();
        }}
      />
    </>
  );
}

describe('HeaderDrawer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/';
    document.body.style.overflow = '';
  });

  it('locks scroll, traps focus, closes on Escape, and restores trigger focus', async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<DrawerHarness props={props} />);

    const trigger = screen.getByRole('button', { name: 'Open drawer' });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Account' });
    expect(dialog).toBeInTheDocument();
    expect(dialog.parentElement).toHaveClass('md:right-[var(--chat-dock-offset)]');
    expect(document.body.style.overflow).toBe('hidden');
    const closeButton = screen.getByRole('button', { name: 'Close account drawer' });
    expect(closeButton).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Disconnect wallet' })).toHaveFocus();
    await user.tab();
    expect(closeButton).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
    expect(trigger).toHaveFocus();
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the backdrop is pressed', async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<DrawerHarness props={props} />);

    await user.click(screen.getByRole('button', { name: 'Open drawer' }));
    fireEvent.mouseDown(screen.getByTestId('header-drawer-backdrop'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('preserves connected profile, submission, gameplay, social, and admin destinations', () => {
    render(<HeaderDrawer {...createProps({ isAdmin: true })} />);

    expect(screen.getByRole('link', { name: 'View profile' })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('link', { name: 'Owned characters' })).toHaveAttribute('href', '/characters?tab=owned');
    expect(screen.getByRole('link', { name: 'Submit to the Archive' })).toHaveAttribute('href', '/lore/submit');
    expect(screen.getByRole('link', { name: 'Sear your equipment' })).toHaveAttribute('href', '/searing');
    expect(screen.getByRole('link', { name: 'Spread infection' })).toHaveAttribute('href', '/spread');
    expect(screen.getByRole('link', { name: 'Map Editor' })).toHaveAttribute('href', '/map-editor');
    expect(screen.getByRole('link', { name: 'Discord' })).toHaveAttribute('target', '_blank');
  });

  it('shows public, social, orientation, and connect affordances while disconnected', async () => {
    const user = userEvent.setup();
    render(<HeaderDrawer {...createProps({
      address: undefined,
      isConnected: false,
      isAuthenticated: false,
    })} />);

    expect(screen.getByText('Welcome, pilgrim')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Account links' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse NFT characters' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'OpenSea' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Connect Wallet' }));
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('forces authentication once while pending and announces a retryable failure', async () => {
    const user = userEvent.setup();
    let rejectAuthentication: (error: Error) => void = () => {};
    const onAuthenticate = jest.fn(() => new Promise<void>((_resolve, reject) => {
      rejectAuthentication = reject;
    }));
    render(<HeaderDrawer {...createProps({ isAuthenticated: false, onAuthenticate })} />);

    const authenticateButton = screen.getByRole('button', { name: 'Sign wallet message' });
    await user.click(authenticateButton);

    expect(onAuthenticate).toHaveBeenCalledWith({ force: true });
    expect(screen.getByRole('button', { name: 'Waiting for wallet signature…' })).toBeDisabled();

    await act(async () => {
      rejectAuthentication(new Error('Signature rejected.'));
    });

    expect(await screen.findByText(/Wallet authentication failed.*Signature rejected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign wallet message' })).toBeEnabled();
  });

  it('closes after disconnect success but stays open and announces failure on rejection', async () => {
    const user = userEvent.setup();
    const successfulClose = jest.fn();
    const { unmount } = render(<HeaderDrawer {...createProps({ onClose: successfulClose })} />);

    await user.click(screen.getByRole('button', { name: 'Disconnect wallet' }));
    await waitFor(() => expect(successfulClose).toHaveBeenCalledTimes(1));
    unmount();

    const failedClose = jest.fn();
    render(<HeaderDrawer {...createProps({
      onClose: failedClose,
      onDisconnect: jest.fn().mockRejectedValue(new Error('Provider unavailable.')),
    })} />);

    await user.click(screen.getByRole('button', { name: 'Disconnect wallet' }));
    expect(await screen.findByText(/disconnect failed.*Provider unavailable/i)).toBeInTheDocument();
    expect(failedClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('requests close when the wallet address changes', async () => {
    const onClose = jest.fn();
    const props = createProps({ onClose });
    const { rerender } = render(<HeaderDrawer {...props} />);

    rerender(<HeaderDrawer {...props} address="0x9999999999999999999999999999999999999999" />);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('requests close when route navigation changes the pathname', async () => {
    const onClose = jest.fn();
    const props = createProps({ onClose });
    const { rerender } = render(<HeaderDrawer {...props} />);

    mockPathname = '/map';
    rerender(<HeaderDrawer {...props} />);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
