-- PR-279 Monitoring Agent logical slots
CREATE TABLE IF NOT EXISTS monitoring_agent_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  agent_id UUID NULL UNIQUE REFERENCES monitoring_agents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO monitoring_agent_slots (name, agent_id)
SELECT a.name, a.id
FROM monitoring_agents a
WHERE NOT EXISTS (
  SELECT 1 FROM monitoring_agent_slots s WHERE s.agent_id = a.id
);

CREATE TABLE IF NOT EXISTS monitoring_check_slots (
  check_id UUID NOT NULL REFERENCES monitoring_checks(id) ON DELETE CASCADE,
  slot_id UUID NOT NULL REFERENCES monitoring_agent_slots(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (check_id, slot_id),
  CONSTRAINT chk_monitoring_check_slot_priority CHECK (priority BETWEEN 0 AND 100000)
);

INSERT INTO monitoring_check_slots (check_id, slot_id, enabled, priority, created_at, updated_at)
SELECT ca.check_id, s.id, ca.enabled, ca.priority, ca.created_at, ca.updated_at
FROM monitoring_check_agents ca
JOIN monitoring_agent_slots s ON s.agent_id = ca.agent_id
ON CONFLICT (check_id, slot_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_monitoring_check_slots_slot
  ON monitoring_check_slots(slot_id, enabled, priority);

ALTER TABLE monitoring_check_states
  ADD COLUMN IF NOT EXISTS slot_id UUID NULL REFERENCES monitoring_agent_slots(id) ON DELETE SET NULL;

UPDATE monitoring_check_states st
SET slot_id = s.id
FROM monitoring_agent_slots s
WHERE st.slot_id IS NULL AND s.agent_id = st.agent_id;

ALTER TABLE monitoring_state_transitions
  ADD COLUMN IF NOT EXISTS slot_id UUID NULL REFERENCES monitoring_agent_slots(id) ON DELETE SET NULL;
ALTER TABLE monitoring_state_transitions
  ADD COLUMN IF NOT EXISTS agent_name TEXT NULL;

UPDATE monitoring_state_transitions tr
SET slot_id = s.id,
    agent_name = COALESCE(tr.agent_name, a.name)
FROM monitoring_agent_slots s
JOIN monitoring_agents a ON a.id = s.agent_id
WHERE tr.agent_id = a.id
  AND (tr.slot_id IS NULL OR tr.agent_name IS NULL);

-- Keep the physical agent UUID as immutable historical evidence even after
-- the Monitoring Agent object is deleted. History must not depend on the
-- continued existence of the runtime object.
ALTER TABLE monitoring_state_transitions
  DROP CONSTRAINT IF EXISTS fk_monitoring_transition_agent;

DROP TABLE monitoring_check_agents;
