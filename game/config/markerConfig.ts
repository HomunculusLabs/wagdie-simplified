/**
 * Marker Configuration
 *
 * Single source of truth for map marker visual properties.
 * Replaces 4 switch statements in MapScene.ts with a declarative config.
 */

// Marker type union
export type MarkerType = 'location' | 'character' | 'burn' | 'death' | 'fight';

// Layer visibility keys
export type LayerVisibilityKey = 'locations' | 'characters' | 'burns' | 'deaths' | 'fights';

// Configuration shape for each marker type
export interface MarkerConfig {
  icon: string;                    // Icon asset key (e.g., 'icon_location')
  scale: number;                   // Display scale (0.0 - 1.0+)
  depth: number;                   // Z-index for layering (higher = on top)
  visibilityKey: LayerVisibilityKey;  // Key in LayerVisibility object
}

// Complete configuration map
export type MarkerConfigMap = Record<MarkerType, MarkerConfig>;

// Default marker configuration
const DEFAULT_CONFIG: MarkerConfig = {
  icon: 'icon_location',
  scale: 0.6,
  depth: 75,
  visibilityKey: 'locations',
};

/**
 * Marker configuration - single source of truth
 */
export const MARKER_CONFIG: MarkerConfigMap = {
  location: {
    icon: 'icon_location',
    scale: 0.6,
    // Keep location markers above staked character stacks so locations remain clickable.
    depth: 150,
    visibilityKey: 'locations',
  },
  character: {
    icon: 'icon_youarehere',
    scale: 0.8,
    depth: 100,
    visibilityKey: 'characters',
  },
  burn: {
    icon: 'icon_burn',
    scale: 0.6,
    depth: 75,
    visibilityKey: 'burns',
  },
  death: {
    icon: 'icon_death',
    scale: 0.6,
    depth: 75,
    visibilityKey: 'deaths',
  },
  fight: {
    icon: 'icon_fight',
    scale: 0.6,
    depth: 75,
    visibilityKey: 'fights',
  },
};

/**
 * Get marker icon key for a given type
 */
export function getMarkerIcon(type: MarkerType): string {
  return MARKER_CONFIG[type]?.icon ?? DEFAULT_CONFIG.icon;
}

/**
 * Get marker scale for a given type
 */
export function getMarkerScale(type: MarkerType): number {
  return MARKER_CONFIG[type]?.scale ?? DEFAULT_CONFIG.scale;
}

/**
 * Get marker depth (z-index) for a given type
 */
export function getMarkerDepth(type: MarkerType): number {
  return MARKER_CONFIG[type]?.depth ?? DEFAULT_CONFIG.depth;
}

/**
 * Check if marker should be visible based on layer visibility settings
 */
export function isMarkerVisible(
  type: MarkerType,
  visibility: Record<LayerVisibilityKey, boolean>
): boolean {
  const key = MARKER_CONFIG[type]?.visibilityKey ?? DEFAULT_CONFIG.visibilityKey;
  return visibility[key] ?? true;
}

/**
 * Get complete config for a marker type
 */
export function getMarkerConfig(type: MarkerType): MarkerConfig {
  return MARKER_CONFIG[type] ?? DEFAULT_CONFIG;
}
