// Static compatibility: Storybook fixtures intentionally exercise the checked-in
// fallback archive without requiring a DB/effective-query context.
import {
  getAllLoreCharacters,
  getAllLoreLocations,
  getAllLoreSources,
  getCommunityEvents,
  getMediaForEvent,
  getOfficialEvents,
  getRelatedEntitiesForEvent,
  getSourcesForEvent,
  loreSeasons,
} from '@/lib/lore';
import type { LoreCharacter, LoreLocation } from '@/lib/lore/types';

const officialEvents = getOfficialEvents();
const officialEvent = officialEvents.find((event) => event.slug === 'genesis-mint') ?? officialEvents[0];
const communityEvents = getCommunityEvents();
const communityCanonizingEvent = communityEvents.find((event) => event.canon.status === 'canonizing')!;
const communityRecordedEvent = communityEvents.find((event) => event.canon.status === 'community')!;
const disputedEvent = communityEvents.find((event) => event.canon.status === 'disputed')!;
const sortedOfficialEvents = [...officialEvents].sort((a, b) => a.timelineOrder - b.timelineOrder || a.title.localeCompare(b.title));
const officialEventTimelineIndex = sortedOfficialEvents.findIndex((event) => event.id === officialEvent.id);
const officialRelatedContext = {
  timelineNeighbors: {
    previous: officialEventTimelineIndex > 0 ? sortedOfficialEvents[officialEventTimelineIndex - 1] : undefined,
    next: officialEventTimelineIndex >= 0 && officialEventTimelineIndex < sortedOfficialEvents.length - 1
      ? sortedOfficialEvents[officialEventTimelineIndex + 1]
      : undefined,
  },
  connectedEvents: [
    ...officialEvents.filter((event) => event.id !== officialEvent.id),
    ...communityEvents.filter((event) => event.id !== officialEvent.id),
  ].filter((event) => (
    event.locationIds.some((locationId) => officialEvent.locationIds.includes(locationId)) ||
    event.characterIds.some((characterId) => officialEvent.characterIds.includes(characterId))
  )).slice(0, 6),
};
const sparseOfficialRelatedContext = {
  timelineNeighbors: {},
  connectedEvents: [],
};

export const loreStoryData = {
  seasons: loreSeasons,
  locations: getAllLoreLocations(),
  characters: getAllLoreCharacters(),
  allSources: getAllLoreSources(),
  officialEvents,
  officialEvent,
  communityCanonizingEvent,
  communityRecordedEvent,
  disputedEvent,
  officialEventSources: getSourcesForEvent(officialEvent),
  communityCanonizingSources: getSourcesForEvent(communityCanonizingEvent),
  communityRecordedSources: getSourcesForEvent(communityRecordedEvent),
  disputedSources: getSourcesForEvent(disputedEvent),
  officialEventMedia: getMediaForEvent(officialEvent),
  communityCanonizingMedia: getMediaForEvent(communityCanonizingEvent),
  officialRelatedEntities: getRelatedEntitiesForEvent(officialEvent),
  communityRelatedEntities: getRelatedEntitiesForEvent(communityCanonizingEvent),
  officialRelatedContext,
  sparseOfficialRelatedContext,
  relatedEvents: officialEvents.filter((event) => event.id !== officialEvent.id),
};

export const characterWithNoAppearances: LoreCharacter = {
  id: 'character-ghost-archivist',
  slug: 'ghost-archivist',
  name: 'Ghost Archivist',
  aliases: ['The Silent Ledger'],
  summary: 'A placeholder archivist profile used to exercise empty appearance states.',
  tags: ['archive', 'observer'],
};


export const locationWithNoEvents: LoreLocation = {
  id: 'location-silent-barrow',
  slug: 'silent-barrow',
  name: 'Silent Barrow',
  aliases: ['The Unrecorded Mound'],
  summary: 'A story fixture for a location with no linked archive records.',
  description: 'The Silent Barrow exists only in Storybook to verify the location empty state.',
  tags: ['fixture', 'empty'],
};
