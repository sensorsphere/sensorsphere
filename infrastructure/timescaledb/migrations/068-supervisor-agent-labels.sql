ALTER TABLE supervisor_agents
  ADD COLUMN IF NOT EXISTS labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS agent_labels jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_supervisor_agents_labels_gin
  ON supervisor_agents USING GIN(labels);

CREATE INDEX IF NOT EXISTS idx_supervisor_agents_agent_labels_gin
  ON supervisor_agents USING GIN(agent_labels);
