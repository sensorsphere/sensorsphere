-- ============================================================================
-- SensorSphere
-- Migration 071 - Agent technical model unification
-- ============================================================================
-- Align the technical/runtime/lifecycle columns shared by Device, Monitoring
-- and Supervisor agents. Functional data remains type-specific (capabilities,
-- checks, managed agents, ...).
-- ============================================================================

ALTER TABLE device_agents
    ADD COLUMN IF NOT EXISTS host_networks JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS configured_version TEXT NULL,
    ADD COLUMN IF NOT EXISTS container_state TEXT NULL,
    ADD COLUMN IF NOT EXISTS self_update_supported BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE monitoring_agents
    ADD COLUMN IF NOT EXISTS reported_name TEXT NULL,
    ADD COLUMN IF NOT EXISTS host_networks JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS configured_version TEXT NULL,
    ADD COLUMN IF NOT EXISTS container_state TEXT NULL,
    ADD COLUMN IF NOT EXISTS self_update_supported BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS previous_version TEXT NULL,
    ADD COLUMN IF NOT EXISTS update_requested_at TIMESTAMPTZ NULL;

ALTER TABLE supervisor_agents
    ADD COLUMN IF NOT EXISTS desired_version TEXT NULL,
    ADD COLUMN IF NOT EXISTS previous_version TEXT NULL,
    ADD COLUMN IF NOT EXISTS update_requested_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS update_started_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS update_finished_at TIMESTAMPTZ NULL;

-- Environment is installation-wide since PR-259; it is no longer an attribute
-- of an individual Supervisor identity.
ALTER TABLE supervisor_agents
    DROP COLUMN IF EXISTS environment;

-- Normalize Monitoring lifecycle vocabulary with the other agent families.
UPDATE monitoring_agents SET update_status = 'IDLE' WHERE update_status = 'READY';
ALTER TABLE monitoring_agents ALTER COLUMN update_status SET DEFAULT 'IDLE';
ALTER TABLE monitoring_agents DROP CONSTRAINT IF EXISTS chk_monitoring_agent_update_status;
ALTER TABLE monitoring_agents
    ADD CONSTRAINT chk_monitoring_agent_update_status
    CHECK (update_status IN ('IDLE','REQUESTED','UPDATE_REQUESTED','UPDATING','VERIFYING','UPDATED','FAILED','ROLLED_BACK'));

CREATE INDEX IF NOT EXISTS idx_device_agents_host_networks_gin
    ON device_agents USING GIN(host_networks);
CREATE INDEX IF NOT EXISTS idx_monitoring_agents_host_networks_gin
    ON monitoring_agents USING GIN(host_networks);
