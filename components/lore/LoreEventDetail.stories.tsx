import type { Meta, StoryObj } from '@storybook/react';
import { LoreEventDetail } from './LoreEventDetail';
import { loreStoryData } from './story-data';

const meta: Meta<typeof LoreEventDetail> = {
  title: 'Components/Lore/LoreEventDetail/ProcessTemplate',
  component: LoreEventDetail,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Legacy/community-oriented process detail template. Official /lore/events/[slug] pages now use OfficialLoreEventDetail instead.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof LoreEventDetail>;

export const LegacyOfficialProcessReference: Story = {
  name: 'Legacy official fixture (process template)',
  args: {
    event: loreStoryData.officialEvent,
    season: loreStoryData.seasons.find((season) => season.id === loreStoryData.officialEvent.seasonId),
    locations: loreStoryData.locations.filter((location) => loreStoryData.officialEvent.locationIds.includes(location.id)),
    characters: loreStoryData.characters.filter((character) => loreStoryData.officialEvent.characterIds.includes(character.id)),
    relatedEntities: loreStoryData.officialRelatedEntities,
    sources: loreStoryData.officialEventSources,
    media: loreStoryData.officialEventMedia,
    relatedEvents: loreStoryData.relatedEvents,
    seasons: loreStoryData.seasons,
    allLocations: loreStoryData.locations,
  },
};

export const CommunityCanonizingProcess: Story = {
  name: 'Community canonizing process',
  args: {
    event: loreStoryData.communityCanonizingEvent,
    season: loreStoryData.seasons.find((season) => season.id === loreStoryData.communityCanonizingEvent.seasonId),
    locations: loreStoryData.locations.filter((location) => loreStoryData.communityCanonizingEvent.locationIds.includes(location.id)),
    characters: loreStoryData.characters.filter((character) => loreStoryData.communityCanonizingEvent.characterIds.includes(character.id)),
    relatedEntities: loreStoryData.communityRelatedEntities,
    sources: loreStoryData.communityCanonizingSources,
    media: loreStoryData.communityCanonizingMedia,
    relatedEvents: loreStoryData.relatedEvents,
    seasons: loreStoryData.seasons,
    allLocations: loreStoryData.locations,
    communityContext: true,
  },
};
