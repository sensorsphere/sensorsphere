-- Durable SIM-02 thermostat command lifecycle. No secrets or OAuth tokens stored.
CREATE TABLE IF NOT EXISTS netatmo_command_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id TEXT NOT NULL REFERENCES netatmo_connections(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requested_by TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('manual','schedule','away','hg')),
  temperature DOUBLE PRECISION,
  duration_seconds INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','verified','mismatch','failed','unknown')),
  upstream_status INTEGER,
  returned_mode TEXT,
  returned_setpoint DOUBLE PRECISION,
  collected_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_netatmo_command_journal_recent ON netatmo_command_journal(connection_id,requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_netatmo_command_journal_awaiting ON netatmo_command_journal(connection_id,requested_at) WHERE status='accepted';
