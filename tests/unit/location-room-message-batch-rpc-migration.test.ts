import { readFileSync } from 'fs'
import path from 'path'

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260605010000_append_location_room_messages_batch_rpc.sql'
)

const sql = readFileSync(migrationPath, 'utf8')
const compactSql = sql.replace(/\s+/g, ' ').trim()

describe('location-room message batch RPC migration', () => {
  it('defines a security-definer transactional batch append RPC', () => {
    expect(compactSql).toContain('create or replace function append_location_room_messages_batch( p_messages jsonb ) returns jsonb language plpgsql security definer')
    expect(compactSql).toContain('set search_path = public')
    expect(compactSql).toContain('revoke all on function append_location_room_messages_batch(jsonb) from public')
    expect(compactSql).toContain('grant execute on function append_location_room_messages_batch(jsonb) to service_role')
  })

  it('iterates input with ordinality and appends results in input order', () => {
    expect(compactSql).toContain('from jsonb_array_elements(p_messages) with ordinality')
    expect(compactSql).toContain('v_results jsonb := \'[]\'::jsonb')
    expect(compactSql.match(/v_results := v_results \|\| jsonb_build_array\(to_jsonb\(v_row\)\)/g)?.length).toBeGreaterThanOrEqual(2)
    expect(compactSql).toContain('return v_results')
  })

  it('normalizes dedupeKey exactly once into metadata and reuses existing public tick rows', () => {
    expect(compactSql).toContain("v_dedupe_key := nullif(btrim(coalesce(v_message->>'dedupeKey', v_message->>'dedupe_key', '')), '')")
    expect(compactSql).toContain("v_metadata := v_metadata || jsonb_build_object('dedupeKey', v_dedupe_key)")
    expect(compactSql).toContain("v_metadata := v_metadata - 'dedupeKey'")
    expect(compactSql).toContain("if v_tick_id is not null and v_visibility = 'public' then")
    expect(compactSql).toContain("and metadata->>'dedupeKey' = v_dedupe_key")
    expect(compactSql).toContain("and coalesce(metadata->>'dedupeKey', '') = ''")
    expect(compactSql).toContain('order by sequence asc limit 1')
    expect(compactSql).toContain('continue')
  })

  it('lets non-dedupe failures abort the function so no partial rows remain', () => {
    expect(compactSql).toContain('exception when unique_violation then')
    expect(compactSql).not.toContain('exception when others')
    expect(compactSql).toContain("raise exception 'Message at position % is missing room_id'")
    expect(compactSql).toContain("raise exception 'Message at position % is missing content'")
    expect(compactSql).toContain('if v_tick_id is null or v_visibility <> \'public\' then raise')
    expect(compactSql).toContain('if not found then raise')
  })
})
