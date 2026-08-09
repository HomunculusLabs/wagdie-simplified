import type { Meta, StoryObj } from '@storybook/react';
import { HomeView } from './HomeView';

// Review widths mirror the plan's responsive targets, with closed-dock
// 1920x1080 as the primary desktop reference.
const viewports = {
  desktop1920: {
    name: 'Desktop 1920 (closed dock)',
    styles: { width: '1920px', height: '1080px' },
  },
  desktop1440: {
    name: 'Desktop 1440',
    styles: { width: '1440px', height: '900px' },
  },
  tablet768: {
    name: 'Tablet 768',
    styles: { width: '768px', height: '1024px' },
  },
  mobile375: {
    name: 'Mobile 375',
    styles: { width: '375px', height: '812px' },
  },
};

const meta: Meta<typeof HomeView> = {
  component: HomeView,
  title: 'Components/Home/HomeView',
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
    backgrounds: { default: 'dark' },
    viewport: { viewports, defaultViewport: 'desktop1920' },
    docs: {
      description: {
        component:
          'Shared public/connected homepage body. Consent state and the lore feature flag are the only inputs; no auth or owned-character data is fetched.',
      },
    },
  },
  args: {
    hasVideoConsent: true,
    onEnableVideo: () => undefined,
    showLoreNav: true,
  },
};

export default meta;
type Story = StoryObj<typeof HomeView>;

export const ConsentedLoreOn: Story = {
  name: 'Desktop — consented, lore on',
};

export const PosterRequired: Story = {
  name: 'Poster — consent required',
  args: {
    hasVideoConsent: false,
  },
};

export const LoreDisabled: Story = {
  name: 'Lore navigation disabled (no Archive CTA)',
  args: {
    showLoreNav: false,
  },
};

export const Tablet: Story = {
  name: 'Tablet 768',
  parameters: {
    viewport: { viewports, defaultViewport: 'tablet768' },
  },
};

export const Mobile: Story = {
  name: 'Mobile 375',
  parameters: {
    viewport: { viewports, defaultViewport: 'mobile375' },
  },
};
