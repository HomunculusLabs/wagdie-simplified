import { readFileSync } from 'fs'
import path from 'path'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260523000000_canonicalize_crows_den_location.sql'
)

const sql = readFileSync(migrationPath, 'utf8')

const normalizeSql = (value: string) => value.replace(/\s+/g, ' ').trim()

describe('Crows Den canonicalization migration', () => {
  it('makes location 11 canonical and keeps crows_den hidden/non-chain-backed', () => {
    const compact = normalizeSql(sql)

    expect(compact).toContain("UPDATE public.locations SET chain_location_id = '11', is_active = TRUE")
    expect(compact).toContain("WHERE id = '11'")

    expect(compact).toContain("UPDATE public.locations SET chain_location_id = NULL, is_active = FALSE")
    expect(compact).toContain("WHERE id = 'crows_den'")
    expect(compact).toContain("'canonical_location_id', '11'")
    expect(compact).toContain("'legacy_duplicate_of', '11'")
    expect(compact).toContain("'hidden', TRUE")
    expect(compact).toContain("COALESCE(metadata, '{}'::JSONB) - 'chain_location_id'")
    expect(compact).toContain("BTRIM(metadata->>'chain_location_id') = '11'")
  })

  it('repoints simple character location references to 11', () => {
    const compact = normalizeSql(sql)

    expect(compact).toContain("UPDATE public.wagdie_characters SET location_id = '11'")
    expect(compact).toContain("WHERE location_id = 'crows_den'")
  })

  it('fails loudly instead of silently deleting duplicate operational room state', () => {
    const expectedTables = [
      'eliza_location_room_ticks',
      'eliza_location_room_messages',
      'eliza_location_room_narrative_states',
      'eliza_location_room_narrative_beats',
      'eliza_location_room_gameplay_states',
      'eliza_location_room_gameplay_encounters',
      'eliza_location_room_gameplay_turns',
      'eliza_location_room_gameplay_death_reviews',
      'eliza_location_room_gameplay_reward_claims',
    ]

    for (const table of expectedTables) {
      expect(sql).toContain(`'${table}'`)
    }

    expect(sql).toContain("RAISE EXCEPTION 'Cannot canonicalize Crows Den: chain location 11 is referenced by an unexpected locations row or metadata value'")
    expect(sql).toContain("RAISE EXCEPTION 'Cannot canonicalize Crows Den: legacy crows_den room has non-empty scheduler state")
    expect(sql).toContain("RAISE EXCEPTION 'Cannot canonicalize Crows Den: %.location_id has % legacy crows_den rows")
    expect(sql).toContain("DELETE FROM public.eliza_location_rooms")
  })
})
