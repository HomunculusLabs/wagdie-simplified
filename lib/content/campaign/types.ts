import type {
  LocationAdventureCatalogClock,
  LocationAdventureCatalogDecision,
  LocationAdventureCatalogSection,
} from '../../domain/location/metadata-types';
import type { ElizaLocationRoomGameplayDifficulty } from '../../eliza/config';
import type { SupportedDiceFormula } from '../../eliza/locationRooms/gameplay/dice';

/**
 * Source-only campaign authoring model.
 *
 * Location-room runtime ticks must not import this package or read these files.
 * Campaign source is rendered/validated ahead of time into locations.metadata.adventureCatalog,
 * and runtime continues to read only normalized location metadata plus live Official GM state.
 */
export type CampaignSourceKind =
  | 'setting'
  | 'plot'
  | 'scenario_prompt'
  | 'npc'
  | 'monster'
  | 'place'
  | 'item'
  | 'service'
  | 'faction'
  | 'hazard'
  | 'encounter'
  | 'rules_guidance';

export const CAMPAIGN_KIND_TO_CATALOG_SECTION: Record<CampaignSourceKind, LocationAdventureCatalogSection> = {
  setting: '00_setting',
  plot: '10_plot',
  scenario_prompt: '10_plot',
  npc: '20_characters',
  monster: '30_monsters',
  place: '40_places',
  item: '50_items',
  service: '60_shops_services',
  faction: '70_factions',
  hazard: '80_encounters',
  encounter: '80_encounters',
  rules_guidance: '90_rules_guidance',
};

export interface CampaignIpPolicyMetadata {
  originalityReviewRequired: boolean;
  approvedBy?: string | null;
  approvalDate?: string | null;
  notes?: string | null;
}

export interface CampaignSectionDensityTarget {
  min?: number;
  max?: number;
  visibleMin?: number;
}

export interface CampaignDensityTargets {
  minVisibleEncounters?: number;
  minVisibleMonsters?: number;
  sections?: Partial<Record<LocationAdventureCatalogSection, CampaignSectionDensityTarget>>;
}

export interface CampaignRegistryLocation {
  locationId: string;
  slug: string;
  title: string;
  /** `source_ready` means validated for render/check; production seeding still requires approval metadata. */
  status: 'source_ready' | 'scaffold';
  source?: CampaignLocationSource;
}

export interface CampaignPack {
  id: string;
  version: string;
  title: string;
  ipPolicy: CampaignIpPolicyMetadata;
  locations: CampaignRegistryLocation[];
}

interface CampaignEntryBase {
  id: string;
  kind: CampaignSourceKind;
  title: string;
  summary: string;
  tags?: string[];
  revealConditions?: string[];
  relatedEntryIds?: string[];
  authorNotes?: string;
}

export interface CampaignSettingEntry extends CampaignEntryBase {
  kind: 'setting';
  sensoryAnchors?: string[];
}

export interface CampaignPlotEntry extends CampaignEntryBase {
  kind: 'plot' | 'scenario_prompt';
  pressure?: string;
  nextQuestions?: string[];
}

export interface CampaignNpcEntry extends CampaignEntryBase {
  kind: 'npc';
  motive?: string;
  secret?: string;
  tells?: string[];
}

export interface CampaignMonsterEntry extends CampaignEntryBase {
  kind: 'monster';
  sensorySigns?: string[];
  behavior?: string;
  lairOrHaunt?: string;
  hungerOrDesire?: string;
  tactics?: string[];
  fearsOrLimits?: string[];
  encounterRoles?: string[];
}

export interface CampaignPlaceEntry extends CampaignEntryBase {
  kind: 'place';
  features?: string[];
  routes?: string[];
}

export interface CampaignItemEntry extends CampaignEntryBase {
  kind: 'item';
  use?: string;
  costSignal?: string;
}

export interface CampaignServiceEntry extends CampaignEntryBase {
  kind: 'service';
  provider?: string;
  terms?: string;
}

export interface CampaignFactionEntry extends CampaignEntryBase {
  kind: 'faction';
  agenda?: string;
  leverage?: string;
  pressureSigns?: string[];
}

export interface CampaignHazardEntry extends CampaignEntryBase {
  kind: 'hazard';
  visibleTrigger: string;
  immediatePressure: string;
  playerFacingChoice: string;
  consequenceDirection: string;
  escalationHints?: string[];
}

export interface CampaignEncounterEntry extends CampaignEntryBase {
  kind: 'encounter';
  visibleTrigger: string;
  immediatePressure: string;
  playerFacingChoice: string;
  consequenceDirection: string;
  escalationHints?: string[];
}

export interface CampaignRulesGuidanceEntry extends CampaignEntryBase {
  kind: 'rules_guidance';
  do?: string[];
  avoid?: string[];
}

export type CampaignEntry =
  | CampaignSettingEntry
  | CampaignPlotEntry
  | CampaignNpcEntry
  | CampaignMonsterEntry
  | CampaignPlaceEntry
  | CampaignItemEntry
  | CampaignServiceEntry
  | CampaignFactionEntry
  | CampaignHazardEntry
  | CampaignEncounterEntry
  | CampaignRulesGuidanceEntry;

export type CampaignDifficulty = ElizaLocationRoomGameplayDifficulty;
export type CampaignMonsterDamageFormula = Exclude<SupportedDiceFormula, 'd20'>;

export interface CampaignGameplayTemplate {
  /** Source-only authoring/test data. Never compiled into public adventureCatalog output. */
  id: string;
  sourceEntryIds: string[];
  proposal: Partial<{
    title: string;
    summary: string;
    difficulty: CampaignDifficulty;
    monsterCount: number;
    monsterName: string;
    monsterArchetype: string;
    totalMonsterHp: number;
    monsterAc: number;
    monsterAttackBonus: number;
    monsterDamageFormula: CampaignMonsterDamageFormula;
    sceneDc: number;
    rewardXpPerCharacter: number;
    temporaryBoons: unknown;
    narrativeRewards: unknown;
    victoryText: string;
    contextualChecks: unknown;
  }>;
}

export interface CampaignLocationDefaultsSource {
  arcSummary: string;
  currentStakes: string;
  openingDecision: LocationAdventureCatalogDecision;
  discoveries: string[];
  clocks: LocationAdventureCatalogClock[];
}

export interface CampaignLocationSource {
  locationId: string;
  slug: string;
  title: string;
  entries: CampaignEntry[];
  defaults: CampaignLocationDefaultsSource;
  privateGameplayTemplates?: CampaignGameplayTemplate[];
  densityTargets?: CampaignDensityTargets;
  ipPolicy?: CampaignIpPolicyMetadata;
}

export interface CampaignContentSourceProvenance {
  packId: string;
  version: string;
  locationSlug: string;
}

export interface CampaignLocationMetadataPatch {
  adventureCatalog: {
    sections: Record<LocationAdventureCatalogSection, unknown[]>;
    defaults: CampaignLocationDefaultsSource;
  };
  campaignContentSource: CampaignContentSourceProvenance;
}
