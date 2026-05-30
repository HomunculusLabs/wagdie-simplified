import { readFileSync } from 'fs'
import path from 'path'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260527010000_seed_crows_den_adventure_catalog.sql'
)

const sql = readFileSync(migrationPath, 'utf8')

const contentSafetyPattern = /\b(?:wallet|private\s*key|owner\s*address|staker\s*address|hit\s*points?|hp|xp|reward|loot\s*drop|death|dead|killed|fatal|finality|raw\s*model|system\s*prompt|mechanics?|mechanical\s*delta|adjudication|dc)\b|0x[a-f0-9]{20,}/i

function countSectionEntries(section: string): number {
  const matches = sql.match(new RegExp(`'section', '${section}'`, 'g'))
  return matches?.length ?? 0
}

function seededIds(): string[] {
  return Array.from(sql.matchAll(/'id', '([^']+)'/g), (match) => match[1])
}

function relatedEntryIds(): string[] {
  const ids: string[] = []
  for (const match of sql.matchAll(/'relatedEntryIds', jsonb_build_array\(([^)]*)\)/g)) {
    ids.push(...Array.from(match[1].matchAll(/'([^']+)'/g), (idMatch) => idMatch[1]))
  }
  return ids
}

describe('Crow\'s Den adventure catalog seed migration', () => {
  it('replaces location 11 adventure catalog using the supported metadata shape', () => {
    expect(sql).toContain("WHERE id = '11'")
    expect(sql).toContain("'adventureCatalog',")
    expect(sql).toContain("'defaults',")
    expect(sql).toContain("'sections',")
    expect(sql).not.toContain("coalesce(metadata -> 'adventureCatalog'")
    expect(sql).not.toContain("coalesce(metadata #> '{adventureCatalog,sections}'")
  })

  it('meets Crow\'s Den catalog section density targets within normalizer caps', () => {
    expect(countSectionEntries('00_setting')).toBe(5)
    expect(countSectionEntries('10_plot')).toBe(6)
    expect(countSectionEntries('20_characters')).toBe(8)
    expect(countSectionEntries('30_monsters')).toBe(6)
    expect(countSectionEntries('40_places')).toBe(10)
    expect(countSectionEntries('50_items')).toBe(8)
    expect(countSectionEntries('60_shops_services')).toBe(3)
    expect(countSectionEntries('70_factions')).toBe(4)
    expect(countSectionEntries('80_encounters')).toBe(12)
    expect(countSectionEntries('90_rules_guidance')).toBe(5)
  })

  it('seeds opening decision, discoveries, clocks, and public-safe non-mechanical copy', () => {
    expect(sql).toContain("'openingDecision'")
    expect(sql).toContain("'discoveries'")
    expect(sql).toContain("'clocks'")
    expect(sql).toContain("'crows-den-rafters'")
    expect(sql).toContain("'crows-den-salt-door-patience'")
    expect(sql).toContain("'crows-den-court-notice'")
    expect(sql).not.toMatch(contentSafetyPattern)
  })

  it('keeps seeded ids unique and related entry ids resolvable', () => {
    const ids = seededIds()
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index)
    const idSet = new Set(ids)
    const missingRelatedIds = relatedEntryIds().filter((id) => !idSet.has(id))

    expect(duplicateIds).toEqual([])
    expect(missingRelatedIds).toEqual([])
  })
})
