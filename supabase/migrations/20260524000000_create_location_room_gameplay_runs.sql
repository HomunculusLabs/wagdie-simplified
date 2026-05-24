-- Gameplay run automation state for location-pin public ElizaOS rooms.
-- Runs are service-role-only operational state; public/admin APIs must expose only curated summaries.

CREATE TABLE IF NOT EXISTS eliza_location_room_gameplay_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL,
  location_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'completed', 'stopped', 'failed')
  ),
  target_completed_turns INTEGER NOT NULL DEFAULT 100 CHECK (target_completed_turns > 0),
  completed_turns INTEGER NOT NULL DEFAULT 0 CHECK (completed_turns >= 0),
  started_by_actor TEXT NOT NULL CHECK (
    started_by_actor IN ('owner', 'admin', 'scheduler', 'system')
  ),
  started_by_wallet TEXT CHECK (
    started_by_wallet IS NULL OR started_by_wallet = lower(started_by_wallet)
  ),
  started_by_token_id INTEGER CHECK (
    started_by_token_id IS NULL OR started_by_token_id BETWEEN 0 AND 6666
  ),
  last_tick_id UUID REFERENCES eliza_location_room_ticks(id) ON DELETE SET NULL,
  last_advanced_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  stop_reason TEXT,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, room_id, location_id),
  CONSTRAINT fk_eliza_location_room_gameplay_runs_room_location
    FOREIGN KEY (room_id, location_id)
    REFERENCES eliza_location_rooms(id, location_id)
    ON DELETE CASCADE,
  CONSTRAINT chk_eliza_location_room_gameplay_runs_terminal_state CHECK (
    (status = 'active' AND completed_at IS NULL)
    OR (status IN ('completed', 'stopped', 'failed') AND completed_at IS NOT NULL)
  )
);

ALTER TABLE eliza_location_room_ticks
  ADD COLUMN IF NOT EXISTS gameplay_run_id UUID REFERENCES eliza_location_room_gameplay_runs(id) ON DELETE SET NULL;

COMMENT ON TABLE eliza_location_room_gameplay_runs IS 'Service-only automation state for bounded location-room gameplay runs.';
COMMENT ON COLUMN eliza_location_room_gameplay_runs.target_completed_turns IS 'Target number of completed gameplay turns for the run.';
COMMENT ON COLUMN eliza_location_room_gameplay_runs.completed_turns IS 'Denormalized durable progress recounted from completed run ticks and gameplay turns.';
COMMENT ON COLUMN eliza_location_room_gameplay_runs.started_by_wallet IS 'Lowercased wallet that initiated the run, if any; never exposed publicly.';
COMMENT ON COLUMN eliza_location_room_ticks.gameplay_run_id IS 'Optional gameplay run associated with this queued tick.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_eliza_location_room_gameplay_runs_one_active
  ON eliza_location_room_gameplay_runs(room_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_eliza_location_room_gameplay_runs_room_created
  ON eliza_location_room_gameplay_runs(room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eliza_location_room_gameplay_runs_active_worker
  ON eliza_location_room_gameplay_runs(last_advanced_at ASC NULLS FIRST, updated_at ASC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_eliza_location_room_gameplay_runs_status_updated
  ON eliza_location_room_gameplay_runs(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_eliza_location_room_ticks_gameplay_run
  ON eliza_location_room_ticks(gameplay_run_id, created_at ASC)
  WHERE gameplay_run_id IS NOT NULL;

ALTER TABLE eliza_location_room_gameplay_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE eliza_location_room_gameplay_runs FROM anon, authenticated;
GRANT ALL ON TABLE eliza_location_room_gameplay_runs TO service_role;

DROP POLICY IF EXISTS service_role_all_eliza_location_room_gameplay_runs
  ON eliza_location_room_gameplay_runs;
CREATE POLICY service_role_all_eliza_location_room_gameplay_runs
  ON eliza_location_room_gameplay_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS update_eliza_location_room_gameplay_runs_updated_at
  ON eliza_location_room_gameplay_runs;
CREATE TRIGGER update_eliza_location_room_gameplay_runs_updated_at
  BEFORE UPDATE ON eliza_location_room_gameplay_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
