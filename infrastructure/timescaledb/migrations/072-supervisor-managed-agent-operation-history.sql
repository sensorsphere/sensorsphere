CREATE TABLE IF NOT EXISTS supervisor_managed_agent_operations (
  command_id UUID PRIMARY KEY,
  supervisor_agent_id UUID NOT NULL REFERENCES supervisor_agents(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  agent_type TEXT NULL,
  instance TEXT NOT NULL DEFAULT 'main',
  device_agent_id UUID NULL REFERENCES device_agents(id) ON DELETE SET NULL,
  monitoring_agent_id UUID NULL REFERENCES monitoring_agents(id) ON DELETE SET NULL,
  target_version TEXT NULL,
  status TEXT NOT NULL,
  error TEXT NULL,
  progress JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supervisor_managed_agent_operations_created
  ON supervisor_managed_agent_operations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supervisor_managed_agent_operations_supervisor_created
  ON supervisor_managed_agent_operations(supervisor_agent_id, created_at DESC);
