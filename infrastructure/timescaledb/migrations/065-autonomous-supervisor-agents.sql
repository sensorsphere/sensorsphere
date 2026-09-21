CREATE TABLE IF NOT EXISTS supervisor_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT TRUE,
  reported_name text,
  version text,
  hostname text,
  os_name text,
  os_version text,
  architecture text,
  managed_agents jsonb NOT NULL DEFAULT '[]'::jsonb,
  configured_version text,
  container_state text,
  self_update_supported boolean NOT NULL DEFAULT FALSE,
  update_status text NOT NULL DEFAULT 'IDLE',
  update_error text,
  last_seen_at timestamptz,
  heartbeat_timeout_seconds integer NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supervisor_agents_hostname
  ON supervisor_agents (LOWER(hostname));
