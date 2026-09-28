-- PR-284 Device Agent logical slots
CREATE TABLE IF NOT EXISTS device_agent_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  agent_id UUID NULL UNIQUE REFERENCES device_agents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO device_agent_slots (name, agent_id)
SELECT a.name, a.id
FROM device_agents a
WHERE NOT EXISTS (
  SELECT 1 FROM device_agent_slots s WHERE s.agent_id = a.id
);

ALTER TABLE device_registry_devices
  ADD COLUMN IF NOT EXISTS control_slot_id UUID NULL
    REFERENCES device_agent_slots(id) ON DELETE SET NULL;

UPDATE device_registry_devices d
SET control_slot_id = s.id
FROM device_agent_slots s
WHERE d.control_slot_id IS NULL
  AND d.control_agent_id = s.agent_id;

CREATE INDEX IF NOT EXISTS idx_device_registry_control_slot
  ON device_registry_devices(control_slot_id);

-- control_agent_id is retained temporarily as a compatibility/cache field.
-- Durable assignment is control_slot_id; runtime resolution follows
-- control_slot_id -> device_agent_slots.agent_id -> device_agents.id.
