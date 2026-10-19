CREATE TABLE IF NOT EXISTS netatmo_collection_diagnostics (
  id BIGSERIAL PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES netatmo_connections(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('ok','partial','failed')),
  observation_count INTEGER NOT NULL DEFAULT 0,
  home_count INTEGER NOT NULL DEFAULT 0,
  home_available INTEGER NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_netatmo_diag_recent ON netatmo_collection_diagnostics(connection_id,created_at DESC);
