-- Gameplay foundation for location-pin public ElizaOS rooms.
-- Gameplay rows are service-role-only operational state; public APIs must expose
-- only explicitly curated summaries in later rollout waves.

CREATE TABLE IF NOT EXISTS eliza_location_room_gameplay_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL,
  location_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (
    status IN ('idle', 'active_encounter', 'aftermath')
  ),
  active_encounter_id UUID,
  characters JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(characters) = 'object'),
  rewards JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(rewards) = 'object'),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id),
  UNIQUE (room_id, location_id),
  CONSTRAINT fk_eliza_location_room_gameplay_states_room_location
    FOREIGN KEY (room_id, location_id)
    REFERENCES eliza_location_rooms(id, location_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS eliza_location_room_gameplay_encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL,
  location_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'victory', 'defeat', 'fled', 'abandoned')
  ),
  difficulty TEXT NOT NULL DEFAULT 'normal' CHECK (
    difficulty IN ('easy', 'normal', 'hard', 'deadly')
  ),
  round_number INTEGER NOT NULL DEFAULT 1 CHECK (round_number >= 0),
  public_title TEXT,
  public_summary TEXT,
  monster_state JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(monster_state) = 'array'),
  reward_plan JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(reward_plan) = 'object'),
  mechanics JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(mechanics) = 'object'),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (id, room_id, location_id),
  CONSTRAINT fk_eliza_location_room_gameplay_encounters_room_location
    FOREIGN KEY (room_id, location_id)
    REFERENCES eliza_location_rooms(id, location_id)
    ON DELETE CASCADE
);

ALTER TABLE eliza_location_room_gameplay_states
  DROP CONSTRAINT IF EXISTS fk_eliza_location_room_gameplay_states_active_encounter;

ALTER TABLE eliza_location_room_gameplay_states
  ADD CONSTRAINT fk_eliza_location_room_gameplay_states_active_encounter
    FOREIGN KEY (active_encounter_id, room_id, location_id)
    REFERENCES eliza_location_room_gameplay_encounters(id, room_id, location_id);

CREATE TABLE IF NOT EXISTS eliza_location_room_gameplay_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL,
  location_id TEXT NOT NULL,
  tick_id UUID NOT NULL UNIQUE REFERENCES eliza_location_room_ticks(id) ON DELETE CASCADE,
  encounter_id UUID,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (
    status IN ('planned', 'action_recorded', 'resolved', 'completed', 'failed', 'dead')
  ),
  selected_token_id INTEGER CHECK (
    selected_token_id IS NULL OR selected_token_id BETWEEN 0 AND 6666
  ),
  action JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(action) = 'object'),
  dice_results JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(dice_results) = 'array'),
  mechanical_deltas JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(mechanical_deltas) = 'object'),
  public_message_ids JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(public_message_ids) = 'array'),
  outcome_summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (id, room_id, location_id),
  CONSTRAINT fk_eliza_location_room_gameplay_turns_room_location
    FOREIGN KEY (room_id, location_id)
    REFERENCES eliza_location_rooms(id, location_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_eliza_location_room_gameplay_turns_encounter_room_location
    FOREIGN KEY (encounter_id, room_id, location_id)
    REFERENCES eliza_location_room_gameplay_encounters(id, room_id, location_id)
);

CREATE TABLE IF NOT EXISTS eliza_location_room_gameplay_death_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL,
  location_id TEXT NOT NULL,
  encounter_id UUID NOT NULL,
  turn_id UUID,
  token_id INTEGER NOT NULL CHECK (token_id BETWEEN 0 AND 6666),
  gameplay_death_status TEXT NOT NULL DEFAULT 'dead' CHECK (
    gameplay_death_status IN ('dead', 'restored')
  ),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    review_status IN ('pending', 'rejected', 'gameplay_only', 'finality_approved')
  ),
  admin_wallet TEXT CHECK (
    admin_wallet IS NULL OR admin_wallet = lower(admin_wallet)
  ),
  decided_at TIMESTAMPTZ,
  burn_sync_status TEXT NOT NULL DEFAULT 'not_applicable' CHECK (
    burn_sync_status IN ('not_applicable', 'pending', 'synced', 'failed')
  ),
  context JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(context) = 'object'),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_eliza_location_room_gameplay_death_reviews_room_location
    FOREIGN KEY (room_id, location_id)
    REFERENCES eliza_location_rooms(id, location_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_eliza_location_room_gameplay_death_reviews_encounter_room_location
    FOREIGN KEY (encounter_id, room_id, location_id)
    REFERENCES eliza_location_room_gameplay_encounters(id, room_id, location_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_eliza_location_room_gameplay_death_reviews_turn_room_location
    FOREIGN KEY (turn_id, room_id, location_id)
    REFERENCES eliza_location_room_gameplay_turns(id, room_id, location_id)
);

COMMENT ON TABLE eliza_location_room_gameplay_states IS 'Service-only private gameplay state for one location room.';
COMMENT ON COLUMN eliza_location_room_gameplay_states.characters IS 'Private gameplay-local character HP, status, XP, temporary boons, and wounds keyed by token id.';
COMMENT ON TABLE eliza_location_room_gameplay_encounters IS 'Service-only active and historical gameplay encounters for location rooms.';
COMMENT ON TABLE eliza_location_room_gameplay_turns IS 'Service-only per-tick gameplay action, dice, outcome, and retry state.';
COMMENT ON COLUMN eliza_location_room_gameplay_turns.tick_id IS 'One gameplay turn per location-room tick for idempotent retries.';
COMMENT ON TABLE eliza_location_room_gameplay_death_reviews IS 'Service-only admin review queue for gameplay deaths; token finality is not automatic.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_eliza_location_room_gameplay_one_active_encounter
  ON eliza_location_room_gameplay_encounters(room_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_eliza_location_room_gameplay_one_pending_death_review
  ON eliza_location_room_gameplay_death_reviews(token_id, encounter_id)
  WHERE review_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_eliza_location_room_gameplay_states_location
  ON eliza_location_room_gameplay_states(location_id);

CREATE INDEX IF NOT EXISTS idx_eliza_location_room_gameplay_encounters_room_created
  ON eliza_location_room_gameplay_encounters(room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eliza_location_room_gameplay_encounters_status
  ON eliza_location_room_gameplay_encounters(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_eliza_location_room_gameplay_turns_encounter_created
  ON eliza_location_room_gameplay_turns(encounter_id, created_at DESC)
  WHERE encounter_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eliza_location_room_gameplay_turns_status
  ON eliza_location_room_gameplay_turns(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_eliza_location_room_gameplay_death_reviews_pending
  ON eliza_location_room_gameplay_death_reviews(review_status, created_at DESC)
  WHERE review_status = 'pending';

ALTER TABLE eliza_location_room_gameplay_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE eliza_location_room_gameplay_encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE eliza_location_room_gameplay_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE eliza_location_room_gameplay_death_reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE eliza_location_room_gameplay_states FROM anon, authenticated;
REVOKE ALL ON TABLE eliza_location_room_gameplay_encounters FROM anon, authenticated;
REVOKE ALL ON TABLE eliza_location_room_gameplay_turns FROM anon, authenticated;
REVOKE ALL ON TABLE eliza_location_room_gameplay_death_reviews FROM anon, authenticated;

GRANT ALL ON TABLE eliza_location_room_gameplay_states TO service_role;
GRANT ALL ON TABLE eliza_location_room_gameplay_encounters TO service_role;
GRANT ALL ON TABLE eliza_location_room_gameplay_turns TO service_role;
GRANT ALL ON TABLE eliza_location_room_gameplay_death_reviews TO service_role;

DROP POLICY IF EXISTS service_role_all_eliza_location_room_gameplay_states
  ON eliza_location_room_gameplay_states;
CREATE POLICY service_role_all_eliza_location_room_gameplay_states
  ON eliza_location_room_gameplay_states
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_eliza_location_room_gameplay_encounters
  ON eliza_location_room_gameplay_encounters;
CREATE POLICY service_role_all_eliza_location_room_gameplay_encounters
  ON eliza_location_room_gameplay_encounters
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_eliza_location_room_gameplay_turns
  ON eliza_location_room_gameplay_turns;
CREATE POLICY service_role_all_eliza_location_room_gameplay_turns
  ON eliza_location_room_gameplay_turns
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_eliza_location_room_gameplay_death_reviews
  ON eliza_location_room_gameplay_death_reviews;
CREATE POLICY service_role_all_eliza_location_room_gameplay_death_reviews
  ON eliza_location_room_gameplay_death_reviews
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS update_eliza_location_room_gameplay_states_updated_at
  ON eliza_location_room_gameplay_states;
CREATE TRIGGER update_eliza_location_room_gameplay_states_updated_at
  BEFORE UPDATE ON eliza_location_room_gameplay_states
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_eliza_location_room_gameplay_encounters_updated_at
  ON eliza_location_room_gameplay_encounters;
CREATE TRIGGER update_eliza_location_room_gameplay_encounters_updated_at
  BEFORE UPDATE ON eliza_location_room_gameplay_encounters
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_eliza_location_room_gameplay_turns_updated_at
  ON eliza_location_room_gameplay_turns;
CREATE TRIGGER update_eliza_location_room_gameplay_turns_updated_at
  BEFORE UPDATE ON eliza_location_room_gameplay_turns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_eliza_location_room_gameplay_death_reviews_updated_at
  ON eliza_location_room_gameplay_death_reviews;
CREATE TRIGGER update_eliza_location_room_gameplay_death_reviews_updated_at
  BEFORE UPDATE ON eliza_location_room_gameplay_death_reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
