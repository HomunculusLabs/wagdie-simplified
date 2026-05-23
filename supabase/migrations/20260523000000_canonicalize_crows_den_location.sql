-- Canonicalize duplicate Crows Den location rows.
--
-- The chain-backed map/staking location is locations.id = '11'. A legacy
-- slug row, locations.id = 'crows_den', may exist from earlier map data. Keep
-- the legacy row for historical FK safety, but hide/deactivate it and point its
-- metadata at the canonical row. Do not silently merge or delete duplicate
-- operational room state.

BEGIN;

LOCK TABLE public.locations IN SHARE ROW EXCLUSIVE MODE;

-- Some restored/dev databases have the generic updated_at trigger attached to
-- locations without an updated_at column. Disable that specific invalid trigger
-- while updating locations, then restore it before commit.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.locations'::regclass
      AND tgname = 'update_locations_updated_at'
      AND NOT tgisinternal
  ) THEN
    ALTER TABLE public.locations DISABLE TRIGGER update_locations_updated_at;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.locations
    WHERE id = '11'
  ) THEN
    RAISE EXCEPTION 'Cannot canonicalize Crows Den: canonical locations.id=11 is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.locations
    WHERE id NOT IN ('11', 'crows_den')
      AND (
        chain_location_id = '11'
        OR BTRIM(metadata->>'chain_location_id') = '11'
      )
  ) THEN
    RAISE EXCEPTION 'Cannot canonicalize Crows Den: chain location 11 is referenced by an unexpected locations row or metadata value';
  END IF;
END $$;

-- Simple participant references can safely move to the canonical row.
UPDATE public.wagdie_characters
SET location_id = '11',
    updated_at = NOW()
WHERE location_id = 'crows_den';

DO $$
DECLARE
  legacy_room_count BIGINT := 0;
  legacy_room_operational_count BIGINT := 0;
  reference_count BIGINT := 0;
  reference_table TEXT;
  checked_tables TEXT[] := ARRAY[
    'eliza_location_room_ticks',
    'eliza_location_room_messages',
    'eliza_location_room_narrative_states',
    'eliza_location_room_narrative_beats',
    'eliza_location_room_gameplay_states',
    'eliza_location_room_gameplay_encounters',
    'eliza_location_room_gameplay_turns',
    'eliza_location_room_gameplay_death_reviews',
    'eliza_location_room_gameplay_reward_claims'
  ];
BEGIN
  IF to_regclass('public.eliza_location_rooms') IS NOT NULL THEN
    SELECT COUNT(*)
    INTO legacy_room_count
    FROM public.eliza_location_rooms
    WHERE location_id = 'crows_den';

    SELECT COUNT(*)
    INTO legacy_room_operational_count
    FROM public.eliza_location_rooms
    WHERE location_id = 'crows_den'
      AND (
        COALESCE(tick_count, 0) > 0
        OR last_tick_at IS NOT NULL
        OR next_tick_at IS NOT NULL
        OR NULLIF(BTRIM(COALESCE(last_error, '')), '') IS NOT NULL
      );

    IF legacy_room_operational_count > 0 THEN
      RAISE EXCEPTION 'Cannot canonicalize Crows Den: legacy crows_den room has non-empty scheduler state; inspect and merge manually';
    END IF;
  END IF;

  FOREACH reference_table IN ARRAY checked_tables LOOP
    IF to_regclass('public.' || reference_table) IS NOT NULL THEN
      EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE location_id = $1', reference_table)
      INTO reference_count
      USING 'crows_den';

      IF reference_count > 0 THEN
        RAISE EXCEPTION 'Cannot canonicalize Crows Den: %.location_id has % legacy crows_den rows; inspect and merge manually',
          reference_table,
          reference_count;
      END IF;
    END IF;
  END LOOP;

  -- Empty duplicate room shells have no transcript/ticks/narrative/gameplay state
  -- after the checks above, so they can be removed without cascading data.
  IF legacy_room_count > 0 THEN
    DELETE FROM public.eliza_location_rooms
    WHERE location_id = 'crows_den';
  END IF;
END $$;

-- Ensure staking sync and chain lookups map on-chain location 11 only to the
-- canonical DB row. Clear the legacy alias before asserting the canonical value
-- so this migration is safe even if an older restore gave the alias the chain id.
UPDATE public.locations
SET chain_location_id = NULL,
    is_active = FALSE,
    metadata = (
      (COALESCE(metadata, '{}'::JSONB) - 'chain_location_id') ||
      jsonb_build_object(
        'canonical_location_id', '11',
        'legacy_duplicate_of', '11',
        'hidden', TRUE,
        'deactivated', TRUE,
        'active', FALSE,
        'isActive', FALSE,
        'is_active', FALSE,
        'canonicalized_at', NOW()
      )
    )
WHERE id = 'crows_den';

UPDATE public.locations
SET chain_location_id = '11',
    is_active = TRUE,
    metadata = (
      (COALESCE(metadata, '{}'::JSONB) - 'hidden' - 'deactivated' - 'disabled' - 'legacy_duplicate_of') ||
      jsonb_build_object(
        'chain_location_id', '11',
        'canonical_location_id', '11',
        'active', TRUE,
        'isActive', TRUE,
        'is_active', TRUE
      )
    )
WHERE id = '11';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.locations'::regclass
      AND tgname = 'update_locations_updated_at'
      AND NOT tgisinternal
  ) THEN
    ALTER TABLE public.locations ENABLE TRIGGER update_locations_updated_at;
  END IF;
END $$;

COMMENT ON COLUMN public.locations.chain_location_id IS 'On-chain WAGDIE World location ID as a numeric string; canonical Crows Den is locations.id=11, not legacy crows_den';

NOTIFY pgrst, 'reload schema';

COMMIT;
