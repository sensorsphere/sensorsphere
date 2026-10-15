-- Multi-connection Netatmo: additive migration, preserves existing credentials.
CREATE TABLE IF NOT EXISTS netatmo_connections (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  client_id TEXT NOT NULL,
  encrypted_client_secret TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT netatmo_connection_id_format CHECK (id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  CONSTRAINT netatmo_connection_display_name_nonempty CHECK (length(trim(display_name)) > 0)
);
ALTER TABLE netatmo_oauth_states ADD COLUMN IF NOT EXISTS connection_id TEXT;
CREATE INDEX IF NOT EXISTS netatmo_oauth_states_connection_idx ON netatmo_oauth_states (connection_id);
-- Legacy integration_id='netatmo-energy' is intentionally untouched.
