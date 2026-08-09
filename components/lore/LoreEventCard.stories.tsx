import type { Meta, StoryObj } from '@storybook/react';
import { LoreEventCard } from './LoreEventCard';
import { loreStoryData } from './story-data';

const meta: Meta<typeof LoreEventCard> = {
  title: 'Components/Lore/LoreEventCard',
  component: LoreEventCard,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof LoreEventCard>;

export const OfficialCanon: Story = {
  args: {
    event: loreStoryData.officialEvent,
    season: loreStoryData.seasons.find((season) => season.id === loreStoryData.officialEvent.seasonId),
    characters: loreStoryData.characters.filter((character) => loreStoryData.officialEvent.characterIds.includes(character.id)),
    sources: loreStoryData.officialEventSources,
  },
};

export const CommunityCanonizing: Story = {
  args: {
    event: loreStoryData.communityCanonizingEvent,
    season: loreStoryData.seasons.find((season) => season.id === loreStoryData.communityCanonizingEvent.seasonId),
    characters: loreStoryData.characters.filter((character) => loreStoryData.communityCanonizingEvent.characterIds.includes(character.id)),
    sources: loreStoryData.communityCanonizingSources,
  },
};
