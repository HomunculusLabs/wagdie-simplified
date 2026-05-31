import type { Meta, StoryObj } from '@storybook/react';
import { VideoPlayer } from './VideoPlayer';

const meta: Meta<typeof VideoPlayer> = {
  component: VideoPlayer,
  title: 'Components/Home/VideoPlayer',
  tags: ['autodocs'],
  argTypes: {
    videoSrc: {
      control: 'text',
      description: 'Video source URL',
    },
    posterSrc: {
      control: 'text',
      description: 'Poster image URL',
    },
    hasConsent: {
      control: 'boolean',
      description: 'Whether the visitor has granted video autoplay consent',
    },
  },
};

export default meta;
type Story = StoryObj<typeof VideoPlayer>;

export const ConsentGranted: Story = {
  args: {
    videoSrc: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    posterSrc: 'data:image/svg+xml,%3Csvg width="800" height="450" xmlns="http://www.w3.org/2000/svg"%3E%3Crect width="800" height="450" fill="%23000"/%3E%3Ctext x="50%25" y="50%25" font-size="24" text-anchor="middle" dy=".3em" fill="%23666"%3EVideo Poster%3C/text%3E%3C/svg%3E',
    className: 'aspect-video',
    hasConsent: true,
    onEnableVideo: () => undefined,
  },
};

export const ConsentRequired: Story = {
  args: {
    ...ConsentGranted.args,
    hasConsent: false,
  },
};
