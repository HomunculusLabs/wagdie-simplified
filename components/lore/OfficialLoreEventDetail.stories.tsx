import type { Meta, StoryObj } from '@storybook/react';
import { OfficialLoreEventDetail } from './OfficialLoreEventDetail';
import { loreStoryData } from './story-data';

const genesisEvent = loreStoryData.officialEvent;
const genesisSeason = loreStoryData.seasons.find((season) => season.id === genesisEvent.seasonId);
const genesisLocations = loreStoryData.locations.filter((location) => genesisEvent.locationIds.includes(location.id));
const genesisCharacters = loreStoryData.characters.filter((character) => genesisEvent.characterIds.includes(character.id));

const meta: Meta<typeof OfficialLoreEventDetail> = {
  title: 'Components/Lore/OfficialLoreEventDetail',
  component: OfficialLoreEventDetail,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Archive-cohesive official lore detail template used by /lore/events/[slug]. Uses the genesis-mint fixture as the reference state.',
      },
    },
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-soul-950 text-bone">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof OfficialLoreEventDetail>;

export const GenesisMintOfficialRecord: Story = {
  args: {
    event: genesisEvent,
    season: genesisSeason,
    locations: genesisLocations,
    characters: genesisCharacters,
    relatedEntities: loreStoryData.officialRelatedEntities,
    sources: loreStoryData.officialEventSources,
    media: loreStoryData.officialEventMedia,
    relatedContext: loreStoryData.officialRelatedContext,
    seasons: loreStoryData.seasons,
    allCharacters: loreStoryData.characters,
  },
};

export const SparseRelatedContext: Story = {
  args: {
    event: genesisEvent,
    season: genesisSeason,
    locations: genesisLocations,
    characters: genesisCharacters.slice(0, 1),
    relatedEntities: loreStoryData.officialRelatedEntities.slice(0, 1),
    sources: loreStoryData.officialEventSources,
    media: [],
    relatedContext: loreStoryData.sparseOfficialRelatedContext,
    seasons: loreStoryData.seasons,
    allCharacters: loreStoryData.characters,
  },
};
