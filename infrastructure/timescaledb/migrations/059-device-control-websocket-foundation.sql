-- ============================================================================
-- SensorSphere
-- Migration 059 - Device control / WebSocket agent foundation
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    token_hash TEXT NOT NULL UNIQUE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    labels JSONB NOT NULL DEFAULT '{}'::jsonb,
    agent_labels JSONB NOT NULL DEFAULT '[]'::jsonb,
    reported_name TEXT NULL,
    version TEXT NULL,
    hostname TEXT NULL,
    capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_seen_at TIMESTAMPTZ NULL,
    heartbeat_timeout_seconds INTEGER NOT NULL DEFAULT 60,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_device_agent_heartbeat_timeout CHECK (heartbeat_timeout_seconds BETWEEN 15 AND 3600)
);

CREATE INDEX IF NOT EXISTS idx_device_agents_last_seen ON device_agents(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_agents_agent_labels_gin ON device_agents USING GIN(agent_labels);

ALTER TABLE device_registry_devices
    ADD COLUMN IF NOT EXISTS control_agent_id UUID NULL,
    ADD COLUMN IF NOT EXISTS control_provider TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_device_registry_control_agent'
  ) THEN
    ALTER TABLE device_registry_devices
      ADD CONSTRAINT fk_device_registry_control_agent
      FOREIGN KEY (control_agent_id) REFERENCES device_agents(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_device_registry_control_agent ON device_registry_devices(control_agent_id);

-- Yeelight is the first device-control provider. Existing Yeelight devices gain
-- the provider automatically; an agent still has to be assigned explicitly.
UPDATE device_registry_devices d
SET control_provider = 'YEELIGHT', updated_at = NOW()
WHERE control_provider IS NULL
  AND EXISTS (
    SELECT 1 FROM device_registry_device_technologies dt
    WHERE dt.device_id = d.id AND LOWER(dt.technology_code) = 'yeelight'
  );

CREATE TABLE IF NOT EXISTS device_control_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES device_registry_devices(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES device_agents(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    action TEXT NOT NULL,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'PENDING',
    result JSONB NULL,
    error TEXT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ NULL,
    finished_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_device_control_command_status
      CHECK (status IN ('PENDING','SENT','SUCCESS','FAILED','TIMEOUT','REJECTED'))
);

CREATE INDEX IF NOT EXISTS idx_device_control_commands_agent_pending
    ON device_control_commands(agent_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_device_control_commands_device
    ON device_control_commands(device_id, created_at DESC);

CREATE TABLE IF NOT EXISTS device_control_states (
    device_id UUID PRIMARY KEY REFERENCES device_registry_devices(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES device_agents(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    state JSONB NOT NULL DEFAULT '{}'::jsonb,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
