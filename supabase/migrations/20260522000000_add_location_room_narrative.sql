-- Game-master narrative foundation for location-pin public ElizaOS rooms.
-- Narrative state and beat rows are service-role-only operational memory;
-- public APIs should continue to expose only transcript messages.

ALTER TABLE eliza_location_room_messages
  DROP CONSTRAINT IF EXISTS eliza_location_room_messages_author_kind_check;

ALTER TABLE eliza_location_room_messages
  ADD CONSTRAINT eliza_location_room_messages_author_kind_check CHECK (
    author_kind IN ('agent', 'system', 'wallet', 'admin', 'scheduler', 'game_master')
  );

CREATE TABLE IF NOT EXISTS eliza_location_room_narrative_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL,
  location_id TEXT NOT NULL,
  state_summary TEXT NOT NULL DEFAULT '',
  current_objective TEXT,
  open_threads JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(open_threads) = 'array'),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id),
  UNIQUE (room_id, location_id),
  CONSTRAINT fk_eliza_location_room_narrative_states_room_location
    FOREIGN KEY (room_id, location_id)
    REFERENCES eliza_location_rooms(id, location_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS eliza_location_room_narrative_beats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL,
  location_id TEXT NOT NULL,
  tick_id UUID NOT NULL UNIQUE REFERENCES eliza_location_room_ticks(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (
    status IN (
      'planned',
      'game_master_message_appended',
      'character_appended',
      'completed',
      'failed',
      'dead'
    )
  ),
  selected_token_id INTEGER CHECK (
    selected_token_id IS NULL OR selected_token_id BETWEEN 0 AND 6666
  ),
  game_master_agent_id TEXT CHECK (
    game_master_agent_id IS NULL OR btrim(game_master_agent_id) <> ''
  ),
  public_narration TEXT,
  speaker_instruction TEXT,
  state_before JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(state_before) = 'object'),
  state_after JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(state_after) = 'object'),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT fk_eliza_location_room_narrative_beats_room_location
    FOREIGN KEY (room_id, location_id)
    REFERENCES eliza_location_rooms(id, location_id)
    ON DELETE CASCADE
);

COMMENT ON TABLE eliza_location_room_narrative_states IS 'Service-only game-master continuity memory for one location room.';
COMMENT ON COLUMN eliza_location_room_narrative_states.location_id IS 'Stable map location id from locations.id; not the on-chain location id.';
COMMENT ON COLUMN eliza_location_room_narrative_states.state_summary IS 'Private continuity summary used for future narrative prompting.';
COMMENT ON COLUMN eliza_location_room_narrative_states.open_threads IS 'Private open story threads used for future narrative prompting.';

COMMENT ON TABLE eliza_location_room_narrative_beats IS 'Service-only per-tick game-master planning and retry state.';
COMMENT ON COLUMN eliza_location_room_narrative_beats.tick_id IS 'One narrative beat per location-room tick for idempotent retries.';
COMMENT ON COLUMN eliza_location_room_narrative_beats.public_narration IS 'Optional public game-master narration mirrored into transcript messages.';
COMMENT ON COLUMN eliza_location_room_narrative_beats.speaker_instruction IS 'Private instruction for the selected character turn; never expose publicly.';
COMMENT ON COLUMN eliza_location_room_narrative_beats.state_before IS 'Narrative state snapshot before this beat.';
COMMENT ON COLUMN eliza_location_room_narrative_beats.state_after IS 'Narrative state snapshot proposed by the game master after this beat.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_eliza_location_room_messages_one_public_gm_per_tick
  ON eliza_location_room_messages(room_id, tick_id, visibility, author_kind)
  WHERE tick_id IS NOT NULL
    AND visibility = 'public'
    AND author_kind = 'game_master';

CREATE INDEX IF NOT EXISTS idx_eliza_location_room_narrative_states_location
  ON eliza_location_room_narrative_states(location_id);

CREATE INDEX IF NOT EXISTS idx_eliza_location_room_narrative_beats_room_created
  ON eliza_location_room_narrative_beats(room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eliza_location_room_narrative_beats_status
  ON eliza_location_room_narrative_beats(status, updated_at DESC);

ALTER TABLE eliza_location_room_narrative_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE eliza_location_room_narrative_beats ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE eliza_location_room_narrative_states FROM anon, authenticated;
REVOKE ALL ON TABLE eliza_location_room_narrative_beats FROM anon, authenticated;

GRANT ALL ON TABLE eliza_location_room_narrative_states TO service_role;
GRANT ALL ON TABLE eliza_location_room_narrative_beats TO service_role;

DROP POLICY IF EXISTS service_role_all_eliza_location_room_narrative_states
  ON eliza_location_room_narrative_states;
CREATE POLICY service_role_all_eliza_location_room_narrative_states
  ON eliza_location_room_narrative_states
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_eliza_location_room_narrative_beats
  ON eliza_location_room_narrative_beats;
CREATE POLICY service_role_all_eliza_location_room_narrative_beats
  ON eliza_location_room_narrative_beats
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS update_eliza_location_room_narrative_states_updated_at
  ON eliza_location_room_narrative_states;
CREATE TRIGGER update_eliza_location_room_narrative_states_updated_at
  BEFORE UPDATE ON eliza_location_room_narrative_states
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_eliza_location_room_narrative_beats_updated_at
  ON eliza_location_room_narrative_beats;
CREATE TRIGGER update_eliza_location_room_narrative_beats_updated_at
  BEFORE UPDATE ON eliza_location_room_narrative_beats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
