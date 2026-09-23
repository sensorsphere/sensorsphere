-- SensorSphere migration 069 - Supervisor host network inventory
ALTER TABLE supervisor_agents
  ADD COLUMN IF NOT EXISTS host_networks JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_supervisor_agents_host_networks_gin
  ON supervisor_agents USING GIN(host_networks);
