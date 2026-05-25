export type LocationBounds = [[number, number], [number, number]];
export type LocationCenter = [number, number];
export interface LocationCoordinatesObj { x: number; y: number; }

export const LOCATION_ADVENTURE_CATALOG_SECTIONS = [
  '00_setting',
  '10_plot',
  '20_characters',
  '30_monsters',
  '40_places',
  '50_items',
  '60_shops_services',
  '70_factions',
  '80_encounters',
  '90_rules_guidance',
] as const;

export type LocationAdventureCatalogSection = typeof LOCATION_ADVENTURE_CATALOG_SECTIONS[number];

export interface LocationAdventureCatalogEntry {
  id: string;
  section: LocationAdventureCatalogSection;
  title?: string | null;
  summary: string;
  tags: string[];
  revealConditions?: string[];
  relatedEntryIds?: string[];
}

export interface LocationAdventureCatalogDecisionOption {
  id: string;
  label: string;
  summary?: string | null;
}

export interface LocationAdventureCatalogDecision {
  id: string;
  prompt: string;
  options: LocationAdventureCatalogDecisionOption[];
}

export interface LocationAdventureCatalogClock {
  id: string;
  label: string;
  value: number;
  max: number;
  summary: string;
}

export interface LocationAdventureCatalogDefaults {
  arcSummary: string | null;
  currentStakes: string | null;
  openingDecision: LocationAdventureCatalogDecision | null;
  discoveries: string[];
  clocks: LocationAdventureCatalogClock[];
}

export interface NormalizedLocationAdventureCatalog {
  /** Location-authored reusable adventure content grouped by Johnny Decimal-style sections. */
  sections: Record<LocationAdventureCatalogSection, LocationAdventureCatalogEntry[]>;
  /** Optional defaults used only to seed/reset live room adventure memory. */
  defaults: LocationAdventureCatalogDefaults;
}

export interface NormalizedLocationMetadata extends Record<string, unknown> {
  bounds: LocationBounds;                 // always present
  adventureCatalog?: NormalizedLocationAdventureCatalog;
  center?: LocationCenter;                // present when derivable
  coordinates?: LocationCoordinatesObj;   // present when derivable
  properties?: {
    region?: string;
    terrain?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
    special?: boolean;
  };
  special_properties?: string[];
}