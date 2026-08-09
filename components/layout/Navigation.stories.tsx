import type { Meta, StoryObj } from '@storybook/react';
import { Navigation } from './Navigation';

const meta: Meta<typeof Navigation> = {
  component: Navigation,
  title: 'Components/Layout/Navigation',
  tags: ['autodocs'],
  args: {
    isMobile: false,
    showConnectedActions: false,
    showArchive: true,
  },
  argTypes: {
    onNavClick: { action: 'navigation clicked' },
  },
};

export default meta;
type Story = StoryObj<typeof Navigation>;

export const Public: Story = {};

export const Connected: Story = {
  args: { showConnectedActions: true },
};

export const ArchiveDisabled: Story = {
  args: { showArchive: false },
};

export const Mobile: Story = {
  args: {
    isMobile: true,
    showConnectedActions: true,
  },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};
