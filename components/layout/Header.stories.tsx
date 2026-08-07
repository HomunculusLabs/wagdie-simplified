
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
        component: 'Main site header with logo, navigation, and wallet connection. Features sticky positioning and responsive mobile menu. Searing and Spread are connected-only menu items.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Header>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Default header state with desktop layout. Resize browser window to see mobile menu. Storybook auth mocks may show the connected menu by default.',
      },
    },
  },
};

export const MobileMenuOpen: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
    docs: {
      description: {
        story: 'Mobile view with hamburger menu open. Click the hamburger icon to toggle menu.',
      },
    },
  },
  args: {},
};

export const DarkModeToggle: Story = {
  args: {},
  parameters: {
    docs: {
      description: {
        story: 'Click the sun/moon icon to toggle dark mode (visual only). The icon changes but theme remains dark.',
      },
    },
  },
};
