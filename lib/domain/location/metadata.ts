import { LOCATION_ADVENTURE_CATALOG_SECTIONS } from './metadata-types';
import type {
  LocationAdventureCatalogClock,
  LocationAdventureCatalogDecision,
  LocationAdventureCatalogDecisionOption,
  LocationAdventureCatalogEntry,
  LocationAdventureCatalogSection,
  LocationBounds,
  LocationCenter,
  LocationCoordinatesObj,
  NormalizedLocationAdventureCatalog,
  NormalizedLocationMetadata,
} from './metadata-types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

const CATALOG_ENTRY_LIMIT_PER_SECTION = 12;
const CATALOG_TAG_LIMIT = 8;
const CATALOG_LINK_LIMIT = 8;
const CATALOG_DISCOVERY_LIMIT = 10;
const CATALOG_CLOCK_LIMIT = 6;
const CATALOG_DECISION_OPTION_LIMIT = 4;
const CATALOG_ID_MAX_LENGTH = 80;
const CATALOG_TEXT_BANNED_PATTERN = /\b(?:wallet|private\s*key|owner\s*address|staker\s*address|hit\s*points?|hp|xp|reward|loot\s*drop|death|dead|killed|fatal|finality|raw\s*model|system\s*prompt|mechanics?|mechanical\s*delta|adjudication|dc)\b|0x[a-f0-9]{20,}/i;

function nullableCatalogText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim().slice(0, maxLength).trim();
  if (!text || CATALOG_TEXT_BANNED_PATTERN.test(text)) return null;
  return text;
}

function normalizeCatalogId(value: unknown, fallback: string | null = null): string | null {
  const text = nullableCatalogText(value, CATALOG_ID_MAX_LENGTH);
  if (!text) return fallback;
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9:._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, CATALOG_ID_MAX_LENGTH);
  return normalized || fallback;
}

function normalizeCatalogStringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const text = nullableCatalogText(item, maxLength);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= maxItems) break;
  }
  return result;
}

function emptyAdventureCatalogSections(): Record<LocationAdventureCatalogSection, LocationAdventureCatalogEntry[]> {
  const sections = {} as Record<LocationAdventureCatalogSection, LocationAdventureCatalogEntry[]>;
  for (const section of LOCATION_ADVENTURE_CATALOG_SECTIONS) {
    sections[section] = [];
  }
  return sections;
}

function normalizeCatalogDecisionOption(value: unknown, index: number): LocationAdventureCatalogDecisionOption | null {
  if (!isPlainObject(value)) return null;
  const id = normalizeCatalogId(value.id, `option-${index + 1}`);
  const label = nullableCatalogText(value.label ?? value.title ?? value.summary, 80);
  if (!id || !label) return null;
  const summary = nullableCatalogText(value.summary, 180);
  return {
    id,
    label,
    ...(summary && summary !== label ? { summary } : {}),
  };
}

function normalizeCatalogDecision(value: unknown): LocationAdventureCatalogDecision | null {
  if (!isPlainObject(value)) return null;
  const id = normalizeCatalogId(value.id, 'opening-decision');
  const prompt = nullableCatalogText(value.prompt ?? value.summary, 280);
  const options = Array.isArray(value.options)
    ? value.options
      .map((option, index) => normalizeCatalogDecisionOption(option, index))
      .filter((option): option is LocationAdventureCatalogDecisionOption => Boolean(option))
      .slice(0, CATALOG_DECISION_OPTION_LIMIT)
    : [];
  if (!id || !prompt || options.length === 0) return null;
  return { id, prompt, options };
}

function normalizeCatalogClock(value: unknown, index: number): LocationAdventureCatalogClock | null {
  if (!isPlainObject(value)) return null;
  const id = normalizeCatalogId(value.id, `clock-${index + 1}`);
  const label = nullableCatalogText(value.label ?? value.title, 100);
  const summary = nullableCatalogText(value.summary ?? value.description ?? label, 240);
  const rawMax = typeof value.max === 'number' || typeof value.max === 'string' ? Number(value.max) : 6;
  const max = Math.max(1, Math.min(12, Number.isFinite(rawMax) ? Math.round(rawMax) : 6));
  const rawValue = typeof value.value === 'number' || typeof value.value === 'string' ? Number(value.value) : 0;
  const clockValue = Math.max(0, Math.min(max, Number.isFinite(rawValue) ? Math.round(rawValue) : 0));
  if (!id || !label || !summary) return null;
  return { id, label, value: clockValue, max, summary };
}

function normalizeCatalogEntry(
  value: unknown,
  section: LocationAdventureCatalogSection,
  index: number
): LocationAdventureCatalogEntry | null {
  if (!isPlainObject(value)) return null;
  const id = normalizeCatalogId(value.id, `${section}.${index + 1}`);
  const summary = nullableCatalogText(value.summary ?? value.description, 360);
  if (!id || !summary) return null;
  const title = nullableCatalogText(value.title ?? value.name, 100);
  return {
    id,
    section,
    ...(title ? { title } : {}),
    summary,
    tags: normalizeCatalogStringList(value.tags, CATALOG_TAG_LIMIT, 40).map((tag) => tag.toLowerCase()),
    revealConditions: normalizeCatalogStringList(value.revealConditions ?? value.reveal_conditions, 4, 160),
    relatedEntryIds: normalizeCatalogStringList(value.relatedEntryIds ?? value.related_entry_ids, CATALOG_LINK_LIMIT, CATALOG_ID_MAX_LENGTH)
      .map((relatedId) => normalizeCatalogId(relatedId))
      .filter((relatedId): relatedId is string => Boolean(relatedId)),
  };
}

function normalizeCatalogDefaults(value: unknown): NormalizedLocationAdventureCatalog['defaults'] {
  const defaults = isPlainObject(value) ? value : {};
  const clocks = Array.isArray(defaults.clocks)
    ? defaults.clocks
      .map((clock, index) => normalizeCatalogClock(clock, index))
      .filter((clock): clock is LocationAdventureCatalogClock => Boolean(clock))
      .slice(0, CATALOG_CLOCK_LIMIT)
    : [];

  return {
    arcSummary: nullableCatalogText(defaults.arcSummary, 500),
    currentStakes: nullableCatalogText(defaults.currentStakes, 300),
    openingDecision: normalizeCatalogDecision(defaults.openingDecision),
    discoveries: normalizeCatalogStringList(defaults.discoveries, CATALOG_DISCOVERY_LIMIT, 240),
    clocks,
  };
}

export function normalizeLocationAdventureCatalog(rawCatalog: unknown): NormalizedLocationAdventureCatalog | undefined {
  if (!isPlainObject(rawCatalog)) return undefined;
  const sections = emptyAdventureCatalogSections();
  const rawSections = isPlainObject(rawCatalog.sections) ? rawCatalog.sections : rawCatalog;

  for (const section of LOCATION_ADVENTURE_CATALOG_SECTIONS) {
    const sectionEntries = Array.isArray(rawSections[section]) ? rawSections[section] : [];
    sections[section] = sectionEntries
      .map((entry, index) => normalizeCatalogEntry(entry, section, index))
      .filter((entry): entry is LocationAdventureCatalogEntry => Boolean(entry))
      .slice(0, CATALOG_ENTRY_LIMIT_PER_SECTION);
  }

  const defaults = normalizeCatalogDefaults(rawCatalog.defaults);
  const hasContent = Object.values(sections).some((entries) => entries.length > 0) ||
    Boolean(defaults.arcSummary || defaults.currentStakes || defaults.openingDecision || defaults.discoveries.length || defaults.clocks.length);

  return hasContent ? { sections, defaults } : undefined;
}

export function parseCoordinates(meta: unknown): LocationCoordinatesObj | undefined {
  if (!isPlainObject(meta)) return undefined;

  const coordinatesValue = meta['coordinates'];
  if (!isPlainObject(coordinatesValue)) return undefined;

  const x = coordinatesValue['x'];
  const y = coordinatesValue['y'];

  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return undefined;

  return { x, y };
}

export function parseBounds(meta: unknown): LocationBounds | undefined {
  if (!isPlainObject(meta)) return undefined;

  const boundsValue = meta['bounds'];

  // Format 1: [[x0, y0], [x1, y1]] - array format
  if (Array.isArray(boundsValue) && boundsValue.length === 2) {
    const b0 = boundsValue[0];
    const b1 = boundsValue[1];

    if (Array.isArray(b0) && Array.isArray(b1) && b0.length === 2 && b1.length === 2) {
      const x0 = b0[0];
      const y0 = b0[1];
      const x1 = b1[0];
      const y1 = b1[1];

      if (isFiniteNumber(x0) && isFiniteNumber(y0) && isFiniteNumber(x1) && isFiniteNumber(y1)) {
        return [[x0, y0], [x1, y1]];
      }
    }
  }

  // Format 2: { north, south, east, west } - cardinal format
  if (isPlainObject(boundsValue)) {
    const north = boundsValue['north'];
    const south = boundsValue['south'];
    const east = boundsValue['east'];
    const west = boundsValue['west'];

    if (isFiniteNumber(north) && isFiniteNumber(south) && isFiniteNumber(east) && isFiniteNumber(west)) {
      // Convert to [[west, south], [east, north]] format (min, max)
      return [[west, south], [east, north]];
    }

    // Format 3: { maxLat/latMax, minLat/latMin, maxLng/lngMax, minLng/lngMin }
    const maxLat = boundsValue['maxLat'] ?? boundsValue['latMax'];
    const minLat = boundsValue['minLat'] ?? boundsValue['latMin'];
    const maxLng = boundsValue['maxLng'] ?? boundsValue['lngMax'];
    const minLng = boundsValue['minLng'] ?? boundsValue['lngMin'];

    if (isFiniteNumber(maxLat) && isFiniteNumber(minLat) && isFiniteNumber(maxLng) && isFiniteNumber(minLng)) {
      return [[minLng, minLat], [maxLng, maxLat]];
    }

    // Format 4: { northeast: { lat, lng }, southwest: { lat, lng } }
    const ne = boundsValue['northeast'];
    const sw = boundsValue['southwest'];

    if (isPlainObject(ne) && isPlainObject(sw)) {
      const neLat = ne['lat'] ?? ne['latitude'];
      const neLng = ne['lng'] ?? ne['longitude'];
      const swLat = sw['lat'] ?? sw['latitude'];
      const swLng = sw['lng'] ?? sw['longitude'];

      if (isFiniteNumber(neLat) && isFiniteNumber(neLng) && isFiniteNumber(swLat) && isFiniteNumber(swLng)) {
        return [[swLng, swLat], [neLng, neLat]];
      }
    }
  }

  return undefined;
}

export function parseCenter(meta: unknown): LocationCenter | undefined {
  if (!isPlainObject(meta)) return undefined;

  const centerValue = meta['center'];

  // Format 1: [x, y] - array format
  if (Array.isArray(centerValue) && centerValue.length === 2) {
    const x = centerValue[0];
    const y = centerValue[1];

    if (isFiniteNumber(x) && isFiniteNumber(y)) {
      return [x, y];
    }
  }

  // Format 2: { lat, lng } or { latitude, longitude } - object format
  if (isPlainObject(centerValue)) {
    const lat = centerValue['lat'] ?? centerValue['latitude'] ?? centerValue['y'];
    const lng = centerValue['lng'] ?? centerValue['longitude'] ?? centerValue['x'];

    if (isFiniteNumber(lat) && isFiniteNumber(lng)) {
      return [lng, lat];
    }
  }

  return undefined;
}

export function deriveCenterFromBounds(bounds: LocationBounds): LocationCenter {
  return [
    (bounds[0][0] + bounds[1][0]) / 2,
    (bounds[0][1] + bounds[1][1]) / 2,
  ];
}

export function deriveBoundsFromPoint(
  point: LocationCoordinatesObj | LocationCenter,
  halfSize: number = 25
): LocationBounds {
  const x = Array.isArray(point) ? point[0] : point.x;
  const y = Array.isArray(point) ? point[1] : point.y;

  return [
    [x - halfSize, y - halfSize],
    [x + halfSize, y + halfSize],
  ];
}

export function normalizeLocationMetadata(rawMetadata: unknown): NormalizedLocationMetadata {
  const meta: Record<string, unknown> = isPlainObject(rawMetadata) ? rawMetadata : {};

  const coordinatesFromMeta = parseCoordinates(meta);
  const boundsFromMeta = parseBounds(meta);
  const centerFromMeta = parseCenter(meta);

  const centerFromBounds = boundsFromMeta ? deriveCenterFromBounds(boundsFromMeta) : undefined;

  const center: LocationCenter | undefined =
    centerFromMeta ??
    centerFromBounds ??
    (coordinatesFromMeta ? ([coordinatesFromMeta.x, coordinatesFromMeta.y] as LocationCenter) : undefined);

  const coordinates: LocationCoordinatesObj | undefined =
    coordinatesFromMeta ??
    (center ? { x: center[0], y: center[1] } : undefined);

  const bounds: LocationBounds =
    boundsFromMeta ??
    (coordinates
      ? deriveBoundsFromPoint(coordinates, 25)
      : center
        ? deriveBoundsFromPoint(center, 25)
        : ([[0, 0], [0, 0]] as LocationBounds));

  const adventureCatalog = normalizeLocationAdventureCatalog(meta.adventureCatalog);
  const { adventureCatalog: _rawAdventureCatalog, ...restMeta } = meta;

  return {
    ...restMeta,
    bounds,
    ...(center ? { center } : {}),
    ...(coordinates ? { coordinates } : {}),
    ...(adventureCatalog ? { adventureCatalog } : {}),
  };
}