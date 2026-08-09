import type { Meta, StoryObj } from '@storybook/react';
import { LoreArchive } from './LoreArchive';
import { buildLoreCharacterArchive } from '@/lib/lore/archive-character-summary';
import { loreStoryData } from './story-data';

const timelineItems = [loreStoryData.officialEvent, loreStoryData.communityCanonizingEvent];
const characterArchive = buildLoreCharacterArchive({
  characters: loreStoryData.characters,
  allEvents: timelineItems,
  matchingEvents: timelineItems,
  filtered: false,
});

const meta: Meta<typeof LoreArchive> = {
  title: 'Components/Lore/LoreArchive',
  component: LoreArchive,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof LoreArchive>;

const commonArgs = {
  seasons: loreStoryData.seasons,
  locations: loreStoryData.locations,
  characters: loreStoryData.characters,
  sourcesByEventId: {
    [loreStoryData.officialEvent.id]: loreStoryData.officialEventSources,
    [loreStoryData.communityCanonizingEvent.id]: loreStoryData.communityCanonizingSources,
  },
};

export const Timeline: Story = {
  args: {
    ...commonArgs,
    view: 'timeline',
    items: timelineItems,
    characterArchive,
    filters: {},
  },
};

export const LoreCharacters: Story = {
  args: {
    ...commonArgs,
    view: 'characters',
    items: timelineItems,
    characterArchive,
    filters: {},
  },
};

export const FilteredCharacters: Story = {
  args: {
    ...commonArgs,
    view: 'characters',
    items: [loreStoryData.communityCanonizingEvent],
    characterArchive: buildLoreCharacterArchive({
      characters: loreStoryData.characters,
      allEvents: timelineItems,
      matchingEvents: [loreStoryData.communityCanonizingEvent],
      filtered: true,
    }),
    filters: { canonStatus: 'canonizing' },
  },
};

export const EmptyFilteredTimeline: Story = {
  args: {
    ...commonArgs,
    view: 'timeline',
    items: [],
    characterArchive,
    filters: {
      character: 'ghost-archivist',
      canonStatus: 'canonizing',
      keyword: 'nonexistent altar',
    },
  },
};

export const EmptyFilteredCharacters: Story = {
  args: {
    ...commonArgs,
    view: 'characters',
    items: [],
    characterArchive: buildLoreCharacterArchive({
      characters: loreStoryData.characters,
      allEvents: timelineItems,
      matchingEvents: [],
      filtered: true,
    }),
    filters: { keyword: 'unrecorded figure' },
  },
};
