import type { Meta, StoryObj } from '@storybook/react';
import { CharacterProfile } from './CharacterProfile';
import { characterWithNoAppearances, loreStoryData } from './story-data';
import type { LoreCharacter, LoreEvent } from '@/lib/lore/types';

const baseCharacter = loreStoryData.characters.find(
  (character) => character.id === loreStoryData.communityCanonizingEvent.characterIds[0],
)!;
const officialAppearance: LoreEvent = {
  ...loreStoryData.officialEvent,
  id: 'story-official-character-appearance',
  slug: 'story-official-character-appearance',
  characterIds: [baseCharacter.id],
};
const communityAppearance: LoreEvent = {
  ...loreStoryData.communityCanonizingEvent,
  characterIds: [baseCharacter.id],
};
const tokenLinkedCharacter: LoreCharacter = {
  ...baseCharacter,
  id: 'story-token-linked-character',
  slug: 'story-token-linked-character',
  name: 'The Token-Bound Witness',
  tokenId: 42,
  imageUrl: undefined,
};

const meta: Meta<typeof CharacterProfile> = {
  title: 'Components/Lore/CharacterProfile',
  component: CharacterProfile,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof CharacterProfile>;

const argsFor = (character: LoreCharacter, appearances: LoreEvent[]) => ({
  character,
  appearedInEvents: appearances,
  firstAppearance: appearances[0],
  associatedLocations: loreStoryData.locations.filter((location) =>
    appearances.some((event) => event.locationIds.includes(location.id)),
  ),
  characterConnections: [],
  seasons: loreStoryData.seasons,
  allLocations: loreStoryData.locations,
  sources: loreStoryData.allSources.filter((source) =>
    appearances.some((event) => event.sourceIds.includes(source.id)),
  ),
});

export const OfficialAppearances: Story = {
  args: argsFor(baseCharacter, [officialAppearance]),
};

export const CommunityAppearances: Story = {
  args: argsFor(baseCharacter, [communityAppearance]),
};

export const MixedAppearances: Story = {
  args: argsFor(baseCharacter, [officialAppearance, communityAppearance]),
};

export const NoAppearances: Story = {
  args: argsFor(characterWithNoAppearances, []),
};

export const MissingImageAndTokenLinked: Story = {
  args: argsFor(tokenLinkedCharacter, [officialAppearance, communityAppearance]),
};
