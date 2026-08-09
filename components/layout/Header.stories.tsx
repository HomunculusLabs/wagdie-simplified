import type { Meta, StoryObj } from '@storybook/react';
import { Header } from './Header';

const meta: Meta<typeof Header> = {
  component: Header,
  title: 'Components/Layout/Header',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Responsive shell header with prefix-aware navigation and one wallet-aware account drawer.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Header>;

export const Authenticated: Story = {
  parameters: { mockState: 'connected' },
};

export const Disconnected: Story = {
  parameters: { mockState: 'disconnected' },
};

export const Hydrating: Story = {
  parameters: { mockState: 'loading' },
};

export const Authenticating: Story = {
  parameters: { mockState: 'authenticating' },
};

export const SignatureRejected: Story = {
  parameters: { mockState: 'signatureRejected' },
};

export const Admin: Story = {
  parameters: { mockState: 'admin' },
};

export const Mobile: Story = {
  parameters: {
    mockState: 'connected',
    viewport: { defaultViewport: 'mobile1' },
  },
};
