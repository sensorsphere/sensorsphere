-- Per-connection OAuth diagnostic; never store secrets or token values.
ALTER TABLE netatmo_connections ADD COLUMN IF NOT EXISTS oauth_last_error TEXT;
ALTER TABLE netatmo_connections ADD COLUMN IF NOT EXISTS oauth_last_error_at TIMESTAMPTZ;
