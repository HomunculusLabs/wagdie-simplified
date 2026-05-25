-- Persist accepted room tick routing intent through enqueue, dedupe, claim, retry, and processing.

ALTER TABLE eliza_location_room_ticks
  ADD COLUMN IF NOT EXISTS turn_intent TEXT NOT NULL DEFAULT 'auto';

UPDATE eliza_location_room_ticks
SET turn_intent = 'auto'
WHERE turn_intent IS NULL;

ALTER TABLE eliza_location_room_ticks
  ALTER COLUMN turn_intent SET DEFAULT 'auto',
  ALTER COLUMN turn_intent SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_eliza_location_room_ticks_turn_intent'
      AND conrelid = 'eliza_location_room_ticks'::regclass
  ) THEN
    ALTER TABLE eliza_location_room_ticks
      ADD CONSTRAINT chk_eliza_location_room_ticks_turn_intent
      CHECK (turn_intent IN ('auto', 'story', 'combat'));
  END IF;
END $$;

COMMENT ON COLUMN eliza_location_room_ticks.turn_intent IS
  'Durable tick routing intent: auto, story, or combat.';

CREATE INDEX IF NOT EXISTS idx_eliza_location_room_ticks_room_intent_status
  ON eliza_location_room_ticks(room_id, turn_intent, status, created_at DESC);
