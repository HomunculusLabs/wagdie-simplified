import type { Meta, StoryObj } from '@storybook/react';
import { EditorialHeading } from './EditorialHeading';

const meta: Meta<typeof EditorialHeading> = {
  component: EditorialHeading,
  title: 'Components/Shared/EditorialHeading',
  tags: ['autodocs'],
  args: {
    eyebrow: 'The Archive',
    title: 'Stories carried through the dark',
    description: 'A fallback-safe editorial heading with explicit semantic level and responsive alignment.',
    headingLevel: 1,
    align: 'left',
  },
  argTypes: {
    headingLevel: { control: 'inline-radio', options: [1, 2, 3] },
    align: { control: 'inline-radio', options: ['left', 'center'] },
  },
};

export default meta;
type Story = StoryObj<typeof EditorialHeading>;

export const LeftAligned: Story = {};

export const CenteredSectionHeading: Story = {
  args: {
    eyebrow: 'Community records',
    title: 'Every witness leaves a mark',
    headingLevel: 2,
    align: 'center',
  },
};
