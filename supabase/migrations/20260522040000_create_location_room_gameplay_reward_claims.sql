-- Off-chain reward claim ledger for reviewed gameplay deaths.
-- Claims are private service-role state; public room APIs must not expose raw
-- performance counters, line items, or beneficiary data.

CREATE TABLE IF NOT EXISTS eliza_location_room_gameplay_reward_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL,
  location_id TEXT NOT NULL,
  encounter_id UUID NOT NULL,
  turn_id UUID,
  death_review_id UUID NOT NULL UNIQUE,
  token_id INTEGER NOT NULL CHECK (token_id BETWEEN 0 AND 6666),
  beneficiary_wallet TEXT NOT NULL CHECK (beneficiary_wallet = lower(beneficiary_wallet)),
  beneficiary_source TEXT NOT NULL CHECK (
    beneficiary_source IN ('staker_address', 'owner_address')
  ),
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (
    status IN ('pending_review', 'released', 'rejected', 'voided')
  ),
  policy_version TEXT NOT NULL,
  performance_score INTEGER NOT NULL CHECK (performance_score BETWEEN 0 AND 100),
  score_breakdown JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(score_breakdown) = 'object'),
  line_items JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(line_items) = 'array'),
  release_admin_wallet TEXT CHECK (
    release_admin_wallet IS NULL OR release_admin_wallet = lower(release_admin_wallet)
  ),
  released_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_eliza_location_room_gameplay_reward_claims_room_location
    FOREIGN KEY (room_id, location_id)
    REFERENCES eliza_location_rooms(id, location_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_eliza_location_room_gameplay_reward_claims_encounter_room_location
    FOREIGN KEY (encounter_id, room_id, location_id)
    REFERENCES eliza_location_room_gameplay_encounters(id, room_id, location_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_eliza_location_room_gameplay_reward_claims_turn_room_location
    FOREIGN KEY (turn_id, room_id, location_id)
    REFERENCES eliza_location_room_gameplay_turns(id, room_id, location_id),
  CONSTRAINT fk_eliza_location_room_gameplay_reward_claims_death_review
    FOREIGN KEY (death_review_id)
    REFERENCES eliza_location_room_gameplay_death_reviews(id)
    ON DELETE CASCADE,
  CONSTRAINT chk_eliza_location_room_gameplay_reward_claims_release_metadata
    CHECK (
      (status = 'released' AND release_admin_wallet IS NOT NULL AND released_at IS NOT NULL)
      OR (status <> 'released' AND release_admin_wallet IS NULL AND released_at IS NULL)
    )
);

COMMENT ON TABLE eliza_location_room_gameplay_reward_claims IS 'Service-only off-chain reward claim ledger for admin-reviewed gameplay deaths.';
COMMENT ON COLUMN eliza_location_room_gameplay_reward_claims.beneficiary_wallet IS 'Immutable death-time staker or owner wallet snapshot authorized for future claim visibility/release.';
COMMENT ON COLUMN eliza_location_room_gameplay_reward_claims.line_items IS 'Immutable off-chain reward line items; no on-chain transfer is performed by this ledger.';
COMMENT ON COLUMN eliza_location_room_gameplay_reward_claims.status IS 'Claim lifecycle controlled only by the admin death-review outcome flow.';

CREATE INDEX IF NOT EXISTS idx_eliza_location_room_gameplay_reward_claims_status
  ON eliza_location_room_gameplay_reward_claims(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eliza_location_room_gameplay_reward_claims_location_created
  ON eliza_location_room_gameplay_reward_claims(location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eliza_location_room_gameplay_reward_claims_room_created
  ON eliza_location_room_gameplay_reward_claims(room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eliza_location_room_gameplay_reward_claims_token_created
  ON eliza_location_room_gameplay_reward_claims(token_id, created_at DESC);

ALTER TABLE eliza_location_room_gameplay_reward_claims ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE eliza_location_room_gameplay_reward_claims FROM anon, authenticated;
GRANT ALL ON TABLE eliza_location_room_gameplay_reward_claims TO service_role;

DROP POLICY IF EXISTS service_role_all_eliza_location_room_gameplay_reward_claims
  ON eliza_location_room_gameplay_reward_claims;
CREATE POLICY service_role_all_eliza_location_room_gameplay_reward_claims
  ON eliza_location_room_gameplay_reward_claims
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION prevent_gameplay_reward_claim_immutable_updates()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.room_id IS DISTINCT FROM OLD.room_id
    OR NEW.location_id IS DISTINCT FROM OLD.location_id
    OR NEW.encounter_id IS DISTINCT FROM OLD.encounter_id
    OR NEW.turn_id IS DISTINCT FROM OLD.turn_id
    OR NEW.death_review_id IS DISTINCT FROM OLD.death_review_id
    OR NEW.token_id IS DISTINCT FROM OLD.token_id
    OR NEW.beneficiary_wallet IS DISTINCT FROM OLD.beneficiary_wallet
    OR NEW.beneficiary_source IS DISTINCT FROM OLD.beneficiary_source
    OR NEW.policy_version IS DISTINCT FROM OLD.policy_version
    OR NEW.performance_score IS DISTINCT FROM OLD.performance_score
    OR NEW.score_breakdown IS DISTINCT FROM OLD.score_breakdown
    OR NEW.line_items IS DISTINCT FROM OLD.line_items
  THEN
    RAISE EXCEPTION 'gameplay reward claim immutable fields cannot be updated';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_gameplay_reward_claim_immutable_updates_trigger
  ON eliza_location_room_gameplay_reward_claims;
CREATE TRIGGER prevent_gameplay_reward_claim_immutable_updates_trigger
  BEFORE UPDATE ON eliza_location_room_gameplay_reward_claims
  FOR EACH ROW
  EXECUTE FUNCTION prevent_gameplay_reward_claim_immutable_updates();

DROP TRIGGER IF EXISTS update_eliza_location_room_gameplay_reward_claims_updated_at
  ON eliza_location_room_gameplay_reward_claims;
CREATE TRIGGER update_eliza_location_room_gameplay_reward_claims_updated_at
  BEFORE UPDATE ON eliza_location_room_gameplay_reward_claims
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
