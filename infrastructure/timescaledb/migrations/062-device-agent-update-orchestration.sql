-- ============================================================================
-- SensorSphere
-- Migration 062 - Device Agent update orchestration
-- ============================================================================

ALTER TABLE device_agents
    ADD COLUMN IF NOT EXISTS supervisor_available BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS desired_version TEXT NULL,
    ADD COLUMN IF NOT EXISTS previous_version TEXT NULL,
    ADD COLUMN IF NOT EXISTS update_status TEXT NOT NULL DEFAULT 'IDLE',
    ADD COLUMN IF NOT EXISTS update_command_id UUID NULL,
    ADD COLUMN IF NOT EXISTS update_requested_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS update_started_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS update_finished_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS update_error TEXT NULL;

ALTER TABLE device_agents DROP CONSTRAINT IF EXISTS chk_device_agent_update_status;
ALTER TABLE device_agents
    ADD CONSTRAINT chk_device_agent_update_status
    CHECK (update_status IN ('IDLE','UPDATE_REQUESTED','UPDATING','VERIFYING','UPDATED','FAILED','ROLLED_BACK'));

CREATE INDEX IF NOT EXISTS idx_device_agents_update_status
    ON device_agents(update_status);
