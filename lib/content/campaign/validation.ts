import { normalizeLocationAdventureCatalog } from '../../domain/location/metadata';
import { LOCATION_ADVENTURE_CATALOG_SECTIONS } from '../../domain/location/metadata-types';
import type {
  LocationAdventureCatalogEntry,
  LocationAdventureCatalogSection,
} from '../../domain/location/metadata-types';
import { compileCampaignLocationToMetadataPatch } from './compiler';
import type {
  CampaignEntry,
  CampaignGameplayTemplate,
  CampaignLocationSource,
  CampaignPack,
} from './types';

export interface CampaignValidationIssue {
  path: string;
  message: string;
}

export interface CampaignValidationResult {
  ok: boolean;
  issues: CampaignValidationIssue[];
}

const PUBLIC_TEXT_LIMITS = {
  id: 80,
  title: 100,
  summary: 360,
  tag: 40,
  revealCondition: 160,
  relatedEntryId: 80,
};

const PUBLIC_UNSAFE_PATTERN = /\b(?:wallet|private\s*key|owner\s*address|staker\s*address|hit\s*points?|hp|xp|reward|loot\s*drop|death|dead|killed|fatal|finality|raw\s*model|system\s*prompt|mechanics?|mechanical\s*delta|adjudication|dc)\b|0x[a-f0-9]{20,}/i;
const PUBLIC_MECHANICS_PATTERN = /\b(?:armor\s*class|ability\s*check|saving\s*throw|initiative|stat\s*block|challenge\s*rating|damage|dice|d20|roll\s+\d|spell\s*slot)\b/i;
const PROTECTED_IDENTITY_PATTERN = /\b(?:beholder|mind\s*flayer|illithid|faer[uû]n|forgotten\s*realms|waterdeep|vecna|strahd|tarrasque|displacer\s*beast|umber\s*hulk|yuan-ti|owlbear|rust\s*monster|drow|drizzt|baldur'?s\s*gate|wizards\s+of\s+the\s+coast|dungeons?\s*&?\s*dragons?|d&d)\b/i;
const CATALOG_ID_PATTERN = /^[a-z0-9][a-z0-9:._-]{0,79}$/;
const DIFFICULTIES = new Set(['easy', 'normal', 'hard', 'deadly']);
const MONSTER_DAMAGE_FORMULAS = new Set(['1d4', '1d6', '1d8', '2d6']);

function add(issues: CampaignValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function publicStringsForEntry(entry: CampaignEntry): Array<[string, string | undefined]> {
  const values: Array<[string, string | undefined]> = [
    ['id', entry.id],
    ['title', entry.title],
    ['summary', entry.summary],
    ...((entry.tags ?? []).map((value, index) => [`tags.${index}`, value] as [string, string])),
    ...((entry.revealConditions ?? []).map((value, index) => [`revealConditions.${index}`, value] as [string, string])),
    ...((entry.relatedEntryIds ?? []).map((value, index) => [`relatedEntryIds.${index}`, value] as [string, string])),
  ];

  if (entry.kind === 'monster') {
    values.push(
      ...((entry.sensorySigns ?? []).map((value, index) => [`sensorySigns.${index}`, value] as [string, string])),
      ['behavior', entry.behavior],
      ['lairOrHaunt', entry.lairOrHaunt],
      ['hungerOrDesire', entry.hungerOrDesire],
      ...((entry.tactics ?? []).map((value, index) => [`tactics.${index}`, value] as [string, string])),
      ...((entry.fearsOrLimits ?? []).map((value, index) => [`fearsOrLimits.${index}`, value] as [string, string])),
      ...((entry.encounterRoles ?? []).map((value, index) => [`encounterRoles.${index}`, value] as [string, string]))
    );
  }

  if (entry.kind === 'encounter' || entry.kind === 'hazard') {
    values.push(
      ['visibleTrigger', entry.visibleTrigger],
      ['immediatePressure', entry.immediatePressure],
      ['playerFacingChoice', entry.playerFacingChoice],
      ['consequenceDirection', entry.consequenceDirection],
      ...((entry.escalationHints ?? []).map((value, index) => [`escalationHints.${index}`, value] as [string, string]))
    );
  }

  if (entry.kind === 'npc') {
    values.push(['motive', entry.motive], ['secret', entry.secret], ...((entry.tells ?? []).map((value, index) => [`tells.${index}`, value] as [string, string])));
  }

  if (entry.kind === 'faction') {
    values.push(['agenda', entry.agenda], ['leverage', entry.leverage], ...((entry.pressureSigns ?? []).map((value, index) => [`pressureSigns.${index}`, value] as [string, string])));
  }

  if (entry.kind === 'rules_guidance') {
    values.push(...((entry.do ?? []).map((value, index) => [`do.${index}`, value] as [string, string])), ...((entry.avoid ?? []).map((value, index) => [`avoid.${index}`, value] as [string, string])));
  }

  return values;
}

function compactPublicText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function validatePublicText(issues: CampaignValidationIssue[], path: string, value: string | undefined, maxLength: number): void {
  if (value == null) return;
  const compact = compactPublicText(value);
  if (!compact) {
    add(issues, path, 'public text is required');
    return;
  }
  if (compact.length > maxLength) add(issues, path, `public text exceeds ${maxLength} characters`);
  if (PUBLIC_UNSAFE_PATTERN.test(compact)) add(issues, path, 'public text contains an unsafe location-catalog term');
  if (PUBLIC_MECHANICS_PATTERN.test(compact)) add(issues, path, 'public text contains rules/mechanics wording');
  if (PROTECTED_IDENTITY_PATTERN.test(compact)) add(issues, path, 'public text contains a protected or non-original identity term');
}

function validateEntry(issues: CampaignValidationIssue[], location: CampaignLocationSource, entry: CampaignEntry, index: number, ids: Set<string>): void {
  const path = `locations.${location.slug}.entries.${index}`;
  if (!CATALOG_ID_PATTERN.test(entry.id)) add(issues, `${path}.id`, 'entry id must already be normalized for catalog output');
  if (ids.has(entry.id)) add(issues, `${path}.id`, `duplicate entry id: ${entry.id}`);
  ids.add(entry.id);

  for (const [field, value] of publicStringsForEntry(entry)) {
    const maxLength = field === 'id'
      ? PUBLIC_TEXT_LIMITS.id
      : field === 'title'
        ? PUBLIC_TEXT_LIMITS.title
        : field.startsWith('tags.')
          ? PUBLIC_TEXT_LIMITS.tag
          : field.startsWith('revealConditions.')
            ? PUBLIC_TEXT_LIMITS.revealCondition
            : field.startsWith('relatedEntryIds.')
              ? PUBLIC_TEXT_LIMITS.relatedEntryId
              : PUBLIC_TEXT_LIMITS.summary;
    validatePublicText(issues, `${path}.${field}`, value, maxLength);
  }

  if ((entry.tags ?? []).length > 8) add(issues, `${path}.tags`, 'entry has more than 8 tags');
  if ((entry.relatedEntryIds ?? []).length > 8) add(issues, `${path}.relatedEntryIds`, 'entry has more than 8 related ids');
}

function validateGameplayTemplate(issues: CampaignValidationIssue[], location: CampaignLocationSource, template: CampaignGameplayTemplate, index: number, ids: Set<string>): void {
  const path = `locations.${location.slug}.privateGameplayTemplates.${index}`;
  if (!template.id.trim()) add(issues, `${path}.id`, 'private gameplay template id is required');
  for (const sourceId of template.sourceEntryIds) {
    if (!ids.has(sourceId)) add(issues, `${path}.sourceEntryIds`, `template references missing source entry: ${sourceId}`);
  }
  const proposal = template.proposal ?? {};
  const authoredDifficulty = proposal.difficulty;
  const difficultySupported = authoredDifficulty == null || DIFFICULTIES.has(authoredDifficulty);
  if (!difficultySupported) add(issues, `${path}.proposal.difficulty`, 'unsupported private gameplay difficulty');

  if (proposal.monsterDamageFormula && !MONSTER_DAMAGE_FORMULAS.has(proposal.monsterDamageFormula)) {
    add(issues, `${path}.proposal.monsterDamageFormula`, 'private gameplay damage formula would be normalized away by runtime rules');
  }

  for (const numericField of ['monsterCount', 'totalMonsterHp', 'monsterAc', 'monsterAttackBonus', 'sceneDc', 'rewardXpPerCharacter'] as const) {
    const value = proposal[numericField];
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      add(issues, `${path}.proposal.${numericField}`, 'private gameplay numeric fields must be non-negative finite numbers');
    }
  }
}

function sectionEntries(location: CampaignLocationSource, section: LocationAdventureCatalogSection): CampaignEntry[] {
  return location.entries.filter((entry) => sectionForEntryKind(entry.kind) === section);
}

function visibleCount(location: CampaignLocationSource, section: LocationAdventureCatalogSection): number {
  return sectionEntries(location, section).filter((entry) => (entry.revealConditions ?? []).length === 0).length;
}

function validateSectionDensity(issues: CampaignValidationIssue[], location: CampaignLocationSource): void {
  const sectionTargets = location.densityTargets?.sections ?? {};
  for (const section of LOCATION_ADVENTURE_CATALOG_SECTIONS) {
    const target = sectionTargets[section];
    if (!target) continue;

    const total = sectionEntries(location, section).length;
    const visible = visibleCount(location, section);
    const path = `locations.${location.slug}.density.${section}`;

    if (target.min != null && total < target.min) add(issues, path, `section count below target ${target.min}`);
    if (target.max != null && total > target.max) add(issues, path, `section count above target ${target.max}`);
    if (target.visibleMin != null && visible < target.visibleMin) add(issues, path, `visible section count below target ${target.visibleMin}`);
  }
}

function sectionForEntryKind(kind: CampaignEntry['kind']): LocationAdventureCatalogSection {
  switch (kind) {
    case 'setting': return '00_setting';
    case 'plot':
    case 'scenario_prompt': return '10_plot';
    case 'npc': return '20_characters';
    case 'monster': return '30_monsters';
    case 'place': return '40_places';
    case 'item': return '50_items';
    case 'service': return '60_shops_services';
    case 'faction': return '70_factions';
    case 'hazard':
    case 'encounter': return '80_encounters';
    case 'rules_guidance': return '90_rules_guidance';
  }
}

function validateDefaults(issues: CampaignValidationIssue[], location: CampaignLocationSource): void {
  const path = `locations.${location.slug}.defaults`;
  validatePublicText(issues, `${path}.arcSummary`, location.defaults.arcSummary, 500);
  validatePublicText(issues, `${path}.currentStakes`, location.defaults.currentStakes, 300);
  validatePublicText(issues, `${path}.openingDecision.prompt`, location.defaults.openingDecision.prompt, 280);
  if (location.defaults.openingDecision.options.length < 2 || location.defaults.openingDecision.options.length > 4) {
    add(issues, `${path}.openingDecision.options`, 'opening decision must have 2 to 4 options');
  }
  location.defaults.openingDecision.options.forEach((option, index) => {
    validatePublicText(issues, `${path}.openingDecision.options.${index}.label`, option.label, 80);
    validatePublicText(issues, `${path}.openingDecision.options.${index}.summary`, option.summary ?? undefined, 180);
  });
  if (location.defaults.clocks.length > 6) add(issues, `${path}.clocks`, 'defaults include more than 6 clocks');
  location.defaults.clocks.forEach((clock, index) => {
    validatePublicText(issues, `${path}.clocks.${index}.label`, clock.label, 100);
    validatePublicText(issues, `${path}.clocks.${index}.summary`, clock.summary, 240);
  });
  location.defaults.discoveries.forEach((discovery, index) => validatePublicText(issues, `${path}.discoveries.${index}`, discovery, 240));
}

function validateCompiledEncounterSummary(
  issues: CampaignValidationIssue[],
  location: CampaignLocationSource,
  compiledEntriesById: Map<string, LocationAdventureCatalogEntry>
): void {
  location.entries.forEach((entry, index) => {
    if (entry.kind !== 'encounter' && entry.kind !== 'hazard') return;

    const summary = compiledEntriesById.get(entry.id)?.summary ?? '';
    const path = `locations.${location.slug}.entries.${index}.compiled.summary`;
    if (summary.length > PUBLIC_TEXT_LIMITS.summary) {
      add(issues, path, `compiled encounter summary exceeds ${PUBLIC_TEXT_LIMITS.summary} characters`);
    }

    for (const [label, value] of [
      ['Trigger', entry.visibleTrigger],
      ['Pressure', entry.immediatePressure],
      ['Choice', entry.playerFacingChoice],
      ['Direction', entry.consequenceDirection],
    ] as const) {
      if (!summary.includes(`${label}:`) || !summary.includes(compactPublicText(value))) {
        add(issues, path, `compiled encounter summary dropped ${label.toLowerCase()} field`);
      }
    }
  });
}

function validateCompiledCatalog(issues: CampaignValidationIssue[], packId: string, version: string, location: CampaignLocationSource): void {
  const patch = compileCampaignLocationToMetadataPatch(packId, version, location);
  const normalized = normalizeLocationAdventureCatalog(patch.adventureCatalog);
  if (!normalized) {
    add(issues, `locations.${location.slug}.compiled`, 'compiled catalog normalizes to empty');
    return;
  }

  const compiledEntriesById = new Map<string, LocationAdventureCatalogEntry>();
  for (const section of LOCATION_ADVENTURE_CATALOG_SECTIONS) {
    for (const entry of patch.adventureCatalog.sections[section] ?? []) {
      if (typeof (entry as LocationAdventureCatalogEntry).id === 'string') {
        compiledEntriesById.set((entry as LocationAdventureCatalogEntry).id, entry as LocationAdventureCatalogEntry);
      }
    }

    const rawIds = (patch.adventureCatalog.sections[section] ?? []).map((entry) => (entry as { id?: unknown }).id).filter(Boolean);
    const normalizedIds = new Set((normalized.sections[section] ?? []).map((entry) => entry.id));
    if (rawIds.length !== normalized.sections[section].length) {
      add(issues, `locations.${location.slug}.compiled.${section}`, 'normalization dropped one or more entries');
    }
    for (const rawId of rawIds) {
      if (typeof rawId === 'string' && !normalizedIds.has(rawId)) {
        add(issues, `locations.${location.slug}.compiled.${section}.${rawId}`, 'normalization changed or dropped entry id');
      }
    }
  }

  if (JSON.stringify(patch.adventureCatalog.defaults) !== JSON.stringify(normalized.defaults)) {
    add(issues, `locations.${location.slug}.compiled.defaults`, 'normalization changed or dropped catalog defaults');
  }

  validateCompiledEncounterSummary(issues, location, compiledEntriesById);

  const serialized = JSON.stringify(patch.adventureCatalog);
  for (const privateField of ['totalMonsterHp', 'monsterAc', 'monsterAttackBonus', 'monsterDamageFormula', 'sceneDc', 'rewardXpPerCharacter']) {
    if (serialized.includes(privateField)) add(issues, `locations.${location.slug}.compiled`, `private gameplay field leaked into catalog: ${privateField}`);
  }
}

export function validateCampaignLocationSource(
  packId: string,
  version: string,
  location: CampaignLocationSource
): CampaignValidationResult {
  const issues: CampaignValidationIssue[] = [];
  const ids = new Set<string>();

  location.entries.forEach((entry, index) => validateEntry(issues, location, entry, index, ids));

  location.entries.forEach((entry, index) => {
    for (const relatedId of entry.relatedEntryIds ?? []) {
      if (!ids.has(relatedId)) {
        add(issues, `locations.${location.slug}.entries.${index}.relatedEntryIds`, `missing related entry target: ${relatedId}`);
      }
    }
  });

  for (const template of location.privateGameplayTemplates ?? []) {
    validateGameplayTemplate(issues, location, template, (location.privateGameplayTemplates ?? []).indexOf(template), ids);
  }

  validateDefaults(issues, location);

  const targets = location.densityTargets ?? {};
  if (targets.minVisibleEncounters != null && visibleCount(location, '80_encounters') < targets.minVisibleEncounters) {
    add(issues, `locations.${location.slug}.density.80_encounters`, `visible encounters below target ${targets.minVisibleEncounters}`);
  }
  if (targets.minVisibleMonsters != null && visibleCount(location, '30_monsters') < targets.minVisibleMonsters) {
    add(issues, `locations.${location.slug}.density.30_monsters`, `visible monsters below target ${targets.minVisibleMonsters}`);
  }
  validateSectionDensity(issues, location);

  validateCompiledCatalog(issues, packId, version, location);

  return { ok: issues.length === 0, issues };
}

export function validateCampaignPack(pack: CampaignPack): CampaignValidationResult {
  const issues: CampaignValidationIssue[] = [];
  if (!pack.id.trim()) add(issues, 'pack.id', 'campaign pack id is required');
  if (!pack.version.trim()) add(issues, 'pack.version', 'campaign pack version is required');
  for (const registryLocation of pack.locations) {
    if (registryLocation.status === 'source_ready' && !registryLocation.source) {
      add(issues, `locations.${registryLocation.slug}`, 'source-ready registry location requires a source module');
    }
    if (registryLocation.source) {
      issues.push(...validateCampaignLocationSource(pack.id, pack.version, registryLocation.source).issues);
    }
  }
  return { ok: issues.length === 0, issues };
}

export function assertValidCampaignPack(pack: CampaignPack): CampaignPack {
  const result = validateCampaignPack(pack);
  if (!result.ok) {
    throw new Error(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
  }
  return pack;
}
