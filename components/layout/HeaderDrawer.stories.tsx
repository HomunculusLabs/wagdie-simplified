import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { HeaderDrawer, type HeaderDrawerProps } from './HeaderDrawer';

const connectedAddress = '0x1234567890123456789012345678901234567890';

function ControlledDrawer(args: HeaderDrawerProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="m-4 min-h-[44px] border border-parchment px-4 font-ui text-parchment"
      >
        Open account drawer
      </button>
      <HeaderDrawer
        {...args}
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
          args.onClose();
        }}
      />
    </>
  );
}

const meta: Meta<typeof HeaderDrawer> = {
  component: HeaderDrawer,
  title: 'Components/Layout/HeaderDrawer',
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  render: (args) => <ControlledDrawer {...args} />,
  args: {
    isOpen: true,
    address: connectedAddress,
    isConnected: true,
    isAuthenticated: true,
    isHydrating: false,
    isAdmin: false,
    onClose: () => {},
    onAuthenticate: async () => {},
    onDisconnect: async () => {},
  },
};

export default meta;
type Story = StoryObj<typeof HeaderDrawer>;

export const Authenticated: Story = {
  parameters: { mockState: 'connected' },
};

export const Disconnected: Story = {
  args: {
    address: undefined,
    isConnected: false,
    isAuthenticated: false,
  },
  parameters: { mockState: 'disconnected' },
};

export const Hydrating: Story = {
  args: {
    isAuthenticated: false,
    isHydrating: true,
  },
  parameters: { mockState: 'loading' },
};

export const SignatureRejected: Story = {
  args: {
    isAuthenticated: false,
  },
  parameters: { mockState: 'signatureRejected' },
};

export const Admin: Story = {
  args: {
    address: '0x5a7F5938deA6238137043415e28efd99A6532dD3',
    isAdmin: true,
  },
  parameters: { mockState: 'admin' },
};

export const LongAddress: Story = {
  args: {
    address: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCDEF',
  },
};

export const DisconnectFailure: Story = {
  args: {
    onDisconnect: async () => {
      throw new Error('The wallet provider did not respond.');
    },
  },
};

export const Mobile: Story = {
  parameters: {
    mockState: 'connected',
    viewport: { defaultViewport: 'mobile1' },
  },
};
