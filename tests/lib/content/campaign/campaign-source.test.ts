/**
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';
import { normalizeLocationAdventureCatalog } from '@/lib/domain/location/metadata';
import {
  compileCampaignLocationToMetadataPatch,
  DARK_FANTASY_CAMPAIGN_GUIDE_DOCUMENT,
  DARK_FANTASY_CAMPAIGN_PACK,
  getCampaignLocationSource,
  validateCampaignLocationSource,
  validateCampaignPack,
} from '@/lib/content/campaign';
import type { CampaignLocationSource } from '@/lib/content/campaign';
import { GAME_MASTER_CANONICAL_CONTENT } from '@/lib/eliza/gameMasterAgent/canonicalContent';
import { buildCatalogPreferredEncounterSeed } from '@/lib/eliza/locationRooms/encounterEscalation';
import { retrieveAdventureCatalogEntries } from '@/lib/eliza/locationRooms/narrativeTypes';
import type { LocationRoomNarrativeState } from '@/lib/eliza/locationRooms/narrativeTypes';

function cloneLocation(source: CampaignLocationSource): CampaignLocationSource {
  return JSON.parse(JSON.stringify(source)) as CampaignLocationSource;
}

function crowsDenSource(): CampaignLocationSource {
  const source = getCampaignLocationSource('11');
  if (!source) throw new Error('Crow\'s Den source missing');
  return source;
}

function compiledCrowsDenCatalog() {
  const patch = compileCampaignLocationToMetadataPatch(
    DARK_FANTASY_CAMPAIGN_PACK.id,
    DARK_FANTASY_CAMPAIGN_PACK.version,
    crowsDenSource()
  );
  const normalized = normalizeLocationAdventureCatalog(patch.adventureCatalog);
  if (!normalized) throw new Error('Crow\'s Den catalog did not normalize');
  return { patch, normalized };
}

function narrativeStateWithCatalog(): Pick<LocationRoomNarrativeState, 'currentObjective' | 'openThreads' | 'metadata'> {
  const { normalized } = compiledCrowsDenCatalog();
  return {
    currentObjective: 'Answer the black bell and secure the salt threshold before the shutters count another name.',
    openThreads: ['The cellar casks are humming under the loose rug.'],
    metadata: {
      adventureCatalog: normalized,
      adventure: {
        currentStakes: normalized.defaults.currentStakes,
        activeDecision: normalized.defaults.openingDecision,
        discoveries: normalized.defaults.discoveries,
        clocks: normalized.defaults.clocks,
        spatialContext: {
          currentArea: "Crow's Den common room near the black bell",
          landmarks: ['salt threshold', 'counting shutters', 'cellar stair'],
          routes: ['main door', 'cellar stair'],
          unresolvedSpatialQuestions: ['Which road appears behind the inner threshold door?'],
        },
      },
    },
  };
}

function readRuntimeTypeScriptFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return readRuntimeTypeScriptFiles(fullPath);
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    return [fullPath];
  });
}

describe('dark fantasy campaign content source', () => {
  it('validates the registered campaign pack and Crow\'s Den location source', () => {
    const packResult = validateCampaignPack(DARK_FANTASY_CAMPAIGN_PACK);
    expect(packResult).toEqual({ ok: true, issues: [] });

    const locationResult = validateCampaignLocationSource(
      DARK_FANTASY_CAMPAIGN_PACK.id,
      DARK_FANTASY_CAMPAIGN_PACK.version,
      crowsDenSource()
    );
    expect(locationResult).toEqual({ ok: true, issues: [] });
  });

  it('compiles Crow\'s Den into public adventureCatalog metadata with density and defaults', () => {
    const { patch, normalized } = compiledCrowsDenCatalog();

    expect(patch.campaignContentSource).toEqual({
      packId: 'wagdie-dark-fantasy-campaign',
      version: '2026-05-31.1',
      locationSlug: 'crows-den',
    });
    expect(normalized.sections['10_plot']).toHaveLength(4);
    expect(normalized.sections['20_characters']).toHaveLength(4);
    expect(normalized.sections['30_monsters']).toHaveLength(4);
    expect(normalized.sections['40_places']).toHaveLength(6);
    expect(normalized.sections['50_items']).toHaveLength(4);
    expect(normalized.sections['80_encounters']).toHaveLength(10);
    expect(normalized.sections['90_rules_guidance']).toHaveLength(3);
    expect(normalized.sections['80_encounters'].filter((entry) => !entry.revealConditions?.length)).toHaveLength(10);
    expect(normalized.sections['30_monsters'].filter((entry) => !entry.revealConditions?.length)).toHaveLength(3);
    expect(normalized.defaults.openingDecision?.options).toHaveLength(3);
    expect(normalized.defaults.clocks.map((clock) => clock.id)).toEqual(['black-bell-answers', 'threshold-picks-a-side']);
  });

  it('preserves required encounter-facing fields in compiled summaries', () => {
    const { normalized } = compiledCrowsDenCatalog();
    const bellToll = normalized.sections['80_encounters'].find((entry) => entry.id === '80.11.black-bell-toll');

    expect(bellToll?.summary.length).toBeLessThanOrEqual(360);
    expect(bellToll?.summary).toContain('Trigger: A lie, omission, or disputed promise is spoken near the bar');
    expect(bellToll?.summary).toContain('Pressure: The room waits for the named guest to answer or redirect the omen');
    expect(bellToll?.summary).toContain('Choice: Answer the bell, accuse another witness, or silence the rope together');
    expect(bellToll?.summary).toContain('Direction: Truth steadies the room, evasion advances the bell clock, and blame draws the rafters closer');
  });

  it('keeps private gameplay templates compatible with downstream gameplay normalization', () => {
    const source = crowsDenSource();
    expect(source.privateGameplayTemplates?.map((template) => template.proposal.difficulty)).toEqual(['normal', 'hard']);
    expect(source.privateGameplayTemplates?.map((template) => template.proposal.monsterDamageFormula)).toEqual(['1d8', '1d6']);

    const unsupported = cloneLocation(source);
    unsupported.privateGameplayTemplates![0].proposal.difficulty = 'medium' as never;
    unsupported.privateGameplayTemplates![0].proposal.monsterDamageFormula = '1d8+3' as never;

    const result = validateCampaignLocationSource(
      DARK_FANTASY_CAMPAIGN_PACK.id,
      DARK_FANTASY_CAMPAIGN_PACK.version,
      unsupported
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'locations.crows-den.privateGameplayTemplates.0.proposal.difficulty' }),
      expect.objectContaining({ path: 'locations.crows-den.privateGameplayTemplates.0.proposal.monsterDamageFormula' }),
    ]));
  });

  it('keeps private gameplay templates out of compiled public catalog JSON', () => {
    const source = crowsDenSource();
    expect(source.privateGameplayTemplates?.[0].proposal).toHaveProperty('totalMonsterHp');

    const { patch } = compiledCrowsDenCatalog();
    const serializedCatalog = JSON.stringify(patch.adventureCatalog);

    expect(serializedCatalog).not.toMatch(/totalMonsterHp|monsterAc|monsterAttackBonus|monsterDamageFormula|sceneDc|rewardXpPerCharacter/);
    expect(serializedCatalog).not.toContain('template-bell-rope-thresher');
  });

  it('rejects unsafe, rules-heavy, or protected public terms before normalization can drop entries', () => {
    const source = cloneLocation(crowsDenSource());
    source.entries[0] = {
      ...source.entries[0],
      summary: 'A beholder with HP 10 asks for a wallet reward.',
    };

    const result = validateCampaignLocationSource(
      DARK_FANTASY_CAMPAIGN_PACK.id,
      DARK_FANTASY_CAMPAIGN_PACK.version,
      source
    );

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toContain('locations.crows-den.entries.0.summary');
    expect(result.issues.map((issue) => issue.message).join('\n')).toMatch(/unsafe|protected/i);
    expect(result.issues.map((issue) => issue.message).join('\n')).toMatch(/normalization dropped/i);
  });

  it('rejects missing related ids and does not count reveal-gated monsters as visible density', () => {
    const badRelated = cloneLocation(crowsDenSource());
    badRelated.entries[0].relatedEntryIds = ['99.99.missing-entry'];
    expect(validateCampaignLocationSource(
      DARK_FANTASY_CAMPAIGN_PACK.id,
      DARK_FANTASY_CAMPAIGN_PACK.version,
      badRelated
    ).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: 'missing related entry target: 99.99.missing-entry' }),
    ]));

    const revealGated = cloneLocation(crowsDenSource());
    revealGated.entries = revealGated.entries.map((entry) => entry.kind === 'monster'
      ? { ...entry, revealConditions: ['discovery:hidden-monster'] }
      : entry);
    expect(validateCampaignLocationSource(
      DARK_FANTASY_CAMPAIGN_PACK.id,
      DARK_FANTASY_CAMPAIGN_PACK.version,
      revealGated
    ).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'locations.crows-den.density.30_monsters' }),
    ]));
  });

  it('feeds existing retrieval and encounter escalation seams without runtime source reads', () => {
    const { normalized } = compiledCrowsDenCatalog();
    const retrieved = retrieveAdventureCatalogEntries(normalized, {
      currentObjective: 'Study the black bell and repair the salt threshold.',
      tags: ['bell', 'salt'],
      limit: 6,
    }).map((entry) => entry.id);

    expect(retrieved).toEqual(expect.arrayContaining(['00.12.black-bell', '00.13.salt-threshold']));

    const seed = buildCatalogPreferredEncounterSeed({
      narrativeState: narrativeStateWithCatalog(),
      recentOutcomeSummary: 'The black bell moves and the braided rope tightens above the bar.',
      catalogEntryIds: ['80.11.black-bell-toll'],
    });

    expect(seed).toMatchObject({
      title: 'Black bell toll',
      source: 'location_catalog',
      catalogEntryIds: expect.arrayContaining(['80.11.black-bell-toll', '30.13.bell-rope-thresher']),
      encounterHints: expect.arrayContaining([expect.stringContaining('Black bell toll')]),
      monsterHints: expect.arrayContaining([expect.stringContaining('Bell-Rope Thresher')]),
    });
  });

  it('integrates the campaign guide into canonical GM knowledge', () => {
    expect(DARK_FANTASY_CAMPAIGN_GUIDE_DOCUMENT.id).toBe('canonical:dark-fantasy-campaign-source-guide');
    expect(GAME_MASTER_CANONICAL_CONTENT.contentVersion).toBe('2026-05-31.1');
    expect(GAME_MASTER_CANONICAL_CONTENT.knowledge).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'canonical:dark-fantasy-campaign-source-guide',
        path: 'canonical/dark-fantasy-campaign-source-guide.md',
        title: 'Dark Fantasy Campaign Source Guide',
      }),
    ]));
  });

  it('preserves the runtime invariant that runtime code does not import campaign source files', () => {
    const runtimeDirs = [
      path.join(process.cwd(), 'lib/eliza'),
      path.join(process.cwd(), 'app/api/eliza'),
      path.join(process.cwd(), 'app/api/admin/eliza'),
    ];
    const allowedCampaignImportFiles = new Set([
      path.join(process.cwd(), 'lib/eliza/gameMasterAgent/canonicalContent.ts'),
    ]);
    const runtimeFiles = runtimeDirs.flatMap(readRuntimeTypeScriptFiles);

    const directSourceOffenders = runtimeFiles.filter((filePath) => {
      const source = fs.readFileSync(filePath, 'utf8');
      return source.includes('content/campaign/locations') || source.includes('lib/content/campaign/locations');
    });
    const campaignImportOffenders = runtimeFiles.filter((filePath) => {
      if (allowedCampaignImportFiles.has(filePath)) return false;
      const source = fs.readFileSync(filePath, 'utf8');
      return source.includes('content/campaign') || source.includes('lib/content/campaign');
    });

    expect(directSourceOffenders).toEqual([]);
    expect(campaignImportOffenders).toEqual([]);
  });
});
