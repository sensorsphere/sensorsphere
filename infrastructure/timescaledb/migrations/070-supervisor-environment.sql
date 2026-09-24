ALTER TABLE supervisor_agents
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'DEFAULT';

CREATE INDEX IF NOT EXISTS idx_supervisor_agents_environment
  ON supervisor_agents (environment);
