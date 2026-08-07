
import type { Meta, StoryObj } from '@storybook/react';
import { Navigation } from './Navigation';

const meta: Meta<typeof Navigation> = {
  component: Navigation,
  title: 'Components/Layout/Navigation',
  tags: ['autodocs'],
  argTypes: {
    className: {
      control: 'text',
      description: 'Additional CSS classes',
    },
    isMobile: {
      control: 'boolean',
      description: 'Whether to render in mobile layout',
    },
    onNavClick: {
      action: 'navigation clicked',
      description: 'Click handler for navigation items',
    },
    showConnectedActions: {
      control: 'boolean',
      description: 'Shows connected-only links such as Searing and Spread',
    },
  },
};

export default meta;
type Story = StoryObj<typeof Navigation>;

export const Desktop: Story = {
  args: {
    className: 'flex gap-6',
    isMobile: false,
    showConnectedActions: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Public desktop navigation. Connected-only links such as Searing and Spread are hidden.',
      },
    },
  },
};

export const ConnectedDesktop: Story = {
  args: {
    className: 'flex gap-6',
    isMobile: false,
    showConnectedActions: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Connected desktop navigation with Searing and Spread visible.',
      },
    },
  },
};

export const Mobile: Story = {
  args: {
    isMobile: true,
    showConnectedActions: false,
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
    docs: {
      description: {
        story: 'Public mobile navigation. Connected-only links such as Searing and Spread are hidden.',
      },
    },
  },
};

export const ConnectedMobile: Story = {
  args: {
    isMobile: true,
    showConnectedActions: true,
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
    docs: {
      description: {
        story: 'Connected mobile navigation with Searing and Spread visible.',
      },
    },
  },
};

export const WithClickHandler: Story = {
  args: {
    onNavClick: () => alert('Navigation item clicked!'),
    showConnectedActions: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Interactive story demonstrating onClick handler. Click any nav item to trigger the action.',
      },
    },
  },
};
