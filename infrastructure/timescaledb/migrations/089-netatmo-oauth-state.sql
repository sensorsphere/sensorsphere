-- NET-2.3: one-time OAuth state, persisted for multi-instance callbacks.
CREATE TABLE IF NOT EXISTS netatmo_oauth_states (
  state_hash TEXT PRIMARY KEY,
  initiated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes'
);
CREATE INDEX IF NOT EXISTS netatmo_oauth_states_expires_idx ON netatmo_oauth_states (expires_at);
