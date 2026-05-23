-- Admin-managed official ElizaOS game-master agent settings and service-agent knowledge sync state.
-- These tables are service-role-only operational state and must not be exposed to anon/authenticated roles.

CREATE TABLE IF NOT EXISTS eliza_game_master_agent_settings (
  setting_key TEXT PRIMARY KEY CHECK (setting_key = 'location-room-game-master'),
  official_agent_id TEXT NOT NULL CHECK (btrim(official_agent_id) <> ''),
  external_id TEXT CHECK (external_id IS NULL OR btrim(external_id) <> ''),
  source TEXT NOT NULL CHECK (source IN ('admin', 'env_adopted', 'deterministic_created')),
  created_by TEXT CHECK (created_by IS NULL OR btrim(created_by) <> ''),
  updated_by TEXT CHECK (updated_by IS NULL OR btrim(updated_by) <> ''),
  last_validated_at TIMESTAMPTZ,
  validation_error TEXT,
  validation_error_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE eliza_game_master_agent_settings IS 'Service-only active official ElizaOS game-master agent settings for WAGDIE runtime narrative ticks.';
COMMENT ON COLUMN eliza_game_master_agent_settings.setting_key IS 'Singleton service-agent setting key; currently only location-room-game-master is allowed.';
COMMENT ON COLUMN eliza_game_master_agent_settings.official_agent_id IS 'Hosted official ElizaOS agent id used by future location-room narrative ticks.';
COMMENT ON COLUMN eliza_game_master_agent_settings.external_id IS 'Optional WAGDIE service external id when the active agent was deterministically created by WAGDIE.';
COMMENT ON COLUMN eliza_game_master_agent_settings.source IS 'How this active setting was established: admin, env_adopted, or deterministic_created.';
COMMENT ON COLUMN eliza_game_master_agent_settings.validation_error IS 'Last route-safe validation/adoption error, if any.';

CREATE INDEX IF NOT EXISTS idx_eliza_game_master_agent_settings_agent
  ON eliza_game_master_agent_settings(official_agent_id);

CREATE TABLE IF NOT EXISTS eliza_service_agent_knowledge_sync_states (
  service_agent_key TEXT NOT NULL CHECK (btrim(service_agent_key) <> ''),
  document_id TEXT NOT NULL CHECK (btrim(document_id) <> ''),
  official_agent_id TEXT,
  official_memory_id TEXT,
  content_hash TEXT,
  source_pointer JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(source_pointer) = 'object'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'indexed', 'deleted', 'error')),
  last_error TEXT,
  last_synced_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (service_agent_key, document_id)
);

COMMENT ON TABLE eliza_service_agent_knowledge_sync_states IS 'Official ElizaOS memory indexing state for non-token WAGDIE service-agent knowledge documents.';
COMMENT ON COLUMN eliza_service_agent_knowledge_sync_states.service_agent_key IS 'Stable WAGDIE service-agent key, e.g. location-room-game-master.';
COMMENT ON COLUMN eliza_service_agent_knowledge_sync_states.document_id IS 'Embedded service-agent knowledge document id.';
COMMENT ON COLUMN eliza_service_agent_knowledge_sync_states.official_agent_id IS 'Hosted official ElizaOS agent id used when indexing the document.';
COMMENT ON COLUMN eliza_service_agent_knowledge_sync_states.official_memory_id IS 'Hosted official ElizaOS memory id returned by the WAGDIE ingestion route.';
COMMENT ON COLUMN eliza_service_agent_knowledge_sync_states.content_hash IS 'SHA-256 hash of the embedded service-agent document content at last sync attempt.';
COMMENT ON COLUMN eliza_service_agent_knowledge_sync_states.source_pointer IS 'Durable WAGDIE source pointer payload sent to ElizaOS memory metadata.';
COMMENT ON COLUMN eliza_service_agent_knowledge_sync_states.status IS 'Last official knowledge sync result for this service-agent document.';
COMMENT ON COLUMN eliza_service_agent_knowledge_sync_states.last_error IS 'Last official knowledge sync error, route-safe and non-secret.';

CREATE INDEX IF NOT EXISTS idx_eliza_service_agent_knowledge_sync_agent_status
  ON eliza_service_agent_knowledge_sync_states(official_agent_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_eliza_service_agent_knowledge_sync_status_updated
  ON eliza_service_agent_knowledge_sync_states(status, updated_at DESC);

ALTER TABLE eliza_game_master_agent_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE eliza_service_agent_knowledge_sync_states ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE eliza_game_master_agent_settings FROM anon, authenticated;
REVOKE ALL ON TABLE eliza_service_agent_knowledge_sync_states FROM anon, authenticated;

GRANT ALL ON TABLE eliza_game_master_agent_settings TO service_role;
GRANT ALL ON TABLE eliza_service_agent_knowledge_sync_states TO service_role;

DROP POLICY IF EXISTS service_role_all_eliza_game_master_agent_settings
  ON eliza_game_master_agent_settings;
CREATE POLICY service_role_all_eliza_game_master_agent_settings
  ON eliza_game_master_agent_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_eliza_service_agent_knowledge_sync_states
  ON eliza_service_agent_knowledge_sync_states;
CREATE POLICY service_role_all_eliza_service_agent_knowledge_sync_states
  ON eliza_service_agent_knowledge_sync_states
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS update_eliza_game_master_agent_settings_updated_at
  ON eliza_game_master_agent_settings;
CREATE TRIGGER update_eliza_game_master_agent_settings_updated_at
  BEFORE UPDATE ON eliza_game_master_agent_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_eliza_service_agent_knowledge_sync_states_updated_at
  ON eliza_service_agent_knowledge_sync_states;
CREATE TRIGGER update_eliza_service_agent_knowledge_sync_states_updated_at
  BEFORE UPDATE ON eliza_service_agent_knowledge_sync_states
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
