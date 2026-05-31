import { LOCATION_ADVENTURE_CATALOG_SECTIONS } from '../../domain/location/metadata-types';
import type {
  LocationAdventureCatalogEntry,
  LocationAdventureCatalogSection,
} from '../../domain/location/metadata-types';
import {
  CAMPAIGN_KIND_TO_CATALOG_SECTION,
  type CampaignEntry,
  type CampaignLocationMetadataPatch,
  type CampaignLocationSource,
} from './types';

function uniqueLowerBounded(values: string[] | undefined, limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values ?? []) {
    const text = value.trim().toLowerCase();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function sentenceList(label: string, values: string[] | undefined): string | null {
  const clean = (values ?? [])
    .map((value) => value.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 3);
  return clean.length ? `${label}: ${clean.join('; ')}.` : null;
}

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function boundedOptionalSummary(parts: string[], limit = 360): string {
  const joined = parts
    .map(compactText)
    .filter(Boolean)
    .join(' ');

  if (joined.length <= limit) return joined;

  return `${joined.slice(0, limit - 1).trimEnd()}…`;
}

function collapseSummary(entry: CampaignEntry): string {
  const parts: string[] = [entry.summary];

  if (entry.kind === 'monster') {
    parts.push(
      sentenceList('Signs', entry.sensorySigns) ?? '',
      entry.behavior ? `Behavior: ${entry.behavior}.` : '',
      entry.lairOrHaunt ? `Haunt: ${entry.lairOrHaunt}.` : '',
      sentenceList('Limits', entry.fearsOrLimits) ?? ''
    );
  }

  if (entry.kind === 'encounter' || entry.kind === 'hazard') {
    parts.push(
      `Trigger: ${entry.visibleTrigger}.`,
      `Pressure: ${entry.immediatePressure}.`,
      `Choice: ${entry.playerFacingChoice}.`,
      `Direction: ${entry.consequenceDirection}.`
    );
  }

  if (entry.kind === 'npc') {
    parts.push(entry.motive ? `Motive: ${entry.motive}.` : '');
  }

  if (entry.kind === 'faction') {
    parts.push(
      entry.agenda ? `Agenda: ${entry.agenda}.` : '',
      entry.leverage ? `Leverage: ${entry.leverage}.` : ''
    );
  }

  if (entry.kind === 'rules_guidance') {
    parts.push(
      sentenceList('Use', entry.do) ?? '',
      sentenceList('Avoid', entry.avoid) ?? ''
    );
  }

  if (entry.kind === 'encounter' || entry.kind === 'hazard') {
    return parts
      .filter((part) => /^(Trigger|Pressure|Choice|Direction):/.test(part))
      .map(compactText)
      .filter(Boolean)
      .join(' ');
  }

  return boundedOptionalSummary(parts);
}

function compileEntry(entry: CampaignEntry): LocationAdventureCatalogEntry {
  const section = CAMPAIGN_KIND_TO_CATALOG_SECTION[entry.kind];
  const tags = uniqueLowerBounded([entry.kind, ...(entry.tags ?? [])], 8);

  return {
    id: entry.id,
    section,
    title: entry.title,
    summary: collapseSummary(entry),
    tags,
    ...(entry.revealConditions?.length ? { revealConditions: entry.revealConditions } : {}),
    ...(entry.relatedEntryIds?.length ? { relatedEntryIds: entry.relatedEntryIds } : {}),
  };
}

function emptySections(): Record<LocationAdventureCatalogSection, LocationAdventureCatalogEntry[]> {
  const sections = {} as Record<LocationAdventureCatalogSection, LocationAdventureCatalogEntry[]>;
  for (const section of LOCATION_ADVENTURE_CATALOG_SECTIONS) {
    sections[section] = [];
  }
  return sections;
}

export function compileCampaignLocationToCatalog(location: CampaignLocationSource): CampaignLocationMetadataPatch['adventureCatalog'] {
  const sections = emptySections();
  for (const entry of location.entries) {
    const compiled = compileEntry(entry);
    sections[compiled.section].push(compiled);
  }

  return {
    sections,
    defaults: location.defaults,
  };
}

export function compileCampaignLocationToMetadataPatch(
  packId: string,
  version: string,
  location: CampaignLocationSource
): CampaignLocationMetadataPatch {
  return {
    adventureCatalog: compileCampaignLocationToCatalog(location),
    campaignContentSource: {
      packId,
      version,
      locationSlug: location.slug,
    },
  };
}
