export const loreEventKinds = ['official', 'community'] as const;
export type LoreEventKind = (typeof loreEventKinds)[number];

export const canonStatuses = [
  'canon',
  'canonizing',
  'community',
  'disputed',
  'non_canon',
  'archival',
] as const;
export type CanonStatus = (typeof canonStatuses)[number];

export const canonizationStageIds = [
  'archived',
  'community_recorded',
  'source_attributed',
  'continuity_review',
  'canon_candidate',
  'canonized',
  'disputed',
  'rejected',
] as const;
export type CanonizationStageId = (typeof canonizationStageIds)[number];

export const sourceKinds = [
  'tweet',
  'website',
  'image',
  'video',
  'discord',
  'manual_archive',
] as const;
export type SourceKind = (typeof sourceKinds)[number];

export const loreEntityKinds = [
  'character',
  'location',
  'faction',
  'artifact',
  'event',
] as const;
export type LoreEntityKind = (typeof loreEntityKinds)[number];

export type CanonizationStepStatus = 'complete' | 'current' | 'blocked' | 'not_started' | 'skipped';

export interface CanonizationStep {
  stageId: CanonizationStageId;
  label?: string;
  status: CanonizationStepStatus;
  date?: string;
  sourceIds?: string[];
  note?: string;
}

export interface Canonization {
  status: CanonStatus;
  stageId: CanonizationStageId;
  path: CanonizationStep[];
  note?: string;
  updatedAt?: string;
}

export interface LoreEntityRef {
  kind: LoreEntityKind;
  id: string;
  label?: string;
}

export interface LoreResolvedEntity extends LoreEntityRef {
  name: string;
  slug?: string;
  summary?: string;
}

export interface LoreSeason {
  id: string;
  slug: string;
  title: string;
  summary: string;
  order: number;
}

export interface LoreLocation {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  summary: string;
  description?: string;
  imageId?: string;
  sourceIds?: string[];
  tags: string[];
}

export interface LoreCharacter {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  summary: string;
  tokenId?: number;
  imageUrl?: string;
  externalUrl?: string;
  origin?: string;
  characterClass?: string;
  alignment?: string;
  level?: number;
  imageId?: string;
  firstAppearanceEventId?: string;
  tags: string[];
}

export interface LoreCharacterConnection {
  character: LoreCharacter;
  sharedEvents: LoreEvent[];
}

export interface LoreMedia {
  id: string;
  kind: Extract<SourceKind, 'image' | 'video'>;
  title: string;
  url?: string;
  archivedUrl?: string;
  alt?: string;
  attribution: string;
}

export interface SourceRecord {
  id: string;
  kind: SourceKind;
  title: string;
  url?: string;
  archivedUrl?: string;
  author?: string;
  platform?: string;
  publishedAt?: string;
  capturedAt?: string;
  attribution: string;
  preservationNote?: string;
  mediaIds?: string[];
}

export interface LoreEvent {
  id: string;
  slug: string;
  kind: LoreEventKind;
  title: string;
  summary: string;
  body: string;
  seasonId?: string;
  locationIds: string[];
  characterIds: string[];
  entityRefs: LoreEntityRef[];
  occurredAt?: string;
  publishedAt?: string;
  timelineOrder: number;
  canon: Canonization;
  sourceIds: string[];
  mediaIds?: string[];
  tags: string[];
  keywords: string[];
}

export interface EffectiveTokenCharacterSummary {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  summary: string;
  tokenId?: number;
  imageUrl?: string;
  externalUrl?: string;
  origin?: string;
  characterClass?: string;
  alignment?: string;
  level?: number;
  tags: string[];
}

export interface EffectiveTokenAppearanceSummary {
  id: string;
  slug: string;
  kind: LoreEventKind;
  title: string;
  summary: string;
  seasonId?: string;
  locationIds: string[];
  characterIds: string[];
  occurredAt?: string;
  publishedAt?: string;
  timelineOrder: number;
  canon: Canonization;
  sourceIds: string[];
  sourceCount: number;
  tags: string[];
}

export interface EffectiveTokenLocationSummary {
  id: string;
  slug: string;
  name: string;
  summary: string;
  imageId?: string;
  tags: string[];
}

export interface EffectiveTokenSeasonSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  order: number;
}

export interface EffectiveTokenSourceSummary {
  id: string;
  kind: SourceKind;
  title: string;
  url?: string;
  archivedUrl?: string;
  author?: string;
  platform?: string;
  publishedAt?: string;
  capturedAt?: string;
  attribution: string;
  preservationNote?: string;
}

export interface EffectiveTokenCharacterLore {
  character: EffectiveTokenCharacterSummary;
  matchedCharacterIds: string[];
  appearances: EffectiveTokenAppearanceSummary[];
  firstAppearance?: EffectiveTokenAppearanceSummary;
  locations: EffectiveTokenLocationSummary[];
  seasons: EffectiveTokenSeasonSummary[];
  sources: EffectiveTokenSourceSummary[];
  sourceCount: number;
}

export interface LoreArchiveFilters {
  season?: string;
  location?: string;
  character?: string;
  keyword?: string;
  canonStatus?: CanonStatus;
  canonStage?: CanonizationStageId;
}

export interface LoreArchiveValidationResult {
  valid: boolean;
  errors: string[];
}
