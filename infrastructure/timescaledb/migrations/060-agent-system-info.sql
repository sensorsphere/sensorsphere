-- ============================================================================
-- SensorSphere
-- Migration 060 - Agent system information
-- ============================================================================

ALTER TABLE device_agents
    ADD COLUMN IF NOT EXISTS os_name TEXT NULL,
    ADD COLUMN IF NOT EXISTS os_version TEXT NULL,
    ADD COLUMN IF NOT EXISTS architecture TEXT NULL;

ALTER TABLE monitoring_agents
    ADD COLUMN IF NOT EXISTS os_name TEXT NULL,
    ADD COLUMN IF NOT EXISTS os_version TEXT NULL,
    ADD COLUMN IF NOT EXISTS architecture TEXT NULL;
