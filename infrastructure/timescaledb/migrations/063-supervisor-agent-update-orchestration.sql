-- ============================================================================
-- SensorSphere
-- Migration 063 - Supervisor Agent version and self-update orchestration
-- ============================================================================

ALTER TABLE device_agents
    ADD COLUMN IF NOT EXISTS supervisor_version TEXT NULL,
    ADD COLUMN IF NOT EXISTS supervisor_configured_version TEXT NULL,
    ADD COLUMN IF NOT EXISTS supervisor_container_state TEXT NULL,
    ADD COLUMN IF NOT EXISTS supervisor_self_update_supported BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS supervisor_desired_version TEXT NULL,
    ADD COLUMN IF NOT EXISTS supervisor_previous_version TEXT NULL,
    ADD COLUMN IF NOT EXISTS supervisor_update_status TEXT NOT NULL DEFAULT 'IDLE',
    ADD COLUMN IF NOT EXISTS supervisor_update_command_id UUID NULL,
    ADD COLUMN IF NOT EXISTS supervisor_update_requested_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS supervisor_update_started_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS supervisor_update_finished_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS supervisor_update_error TEXT NULL;

ALTER TABLE device_agents DROP CONSTRAINT IF EXISTS chk_supervisor_agent_update_status;
ALTER TABLE device_agents
    ADD CONSTRAINT chk_supervisor_agent_update_status
    CHECK (supervisor_update_status IN ('IDLE','UPDATE_REQUESTED','UPDATING','VERIFYING','UPDATED','FAILED','ROLLED_BACK'));

CREATE INDEX IF NOT EXISTS idx_device_agents_supervisor_update_status
    ON device_agents(supervisor_update_status);
