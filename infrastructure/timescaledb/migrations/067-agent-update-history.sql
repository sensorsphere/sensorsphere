-- ============================================================================
-- SensorSphere
-- Migration 067 - Agent update history
-- ============================================================================

ALTER TABLE device_agents
  ADD COLUMN IF NOT EXISTS last_successful_update_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_successful_update_version TEXT NULL;

ALTER TABLE monitoring_agents
  ADD COLUMN IF NOT EXISTS desired_version TEXT NULL,
  ADD COLUMN IF NOT EXISTS update_status TEXT NOT NULL DEFAULT 'READY',
  ADD COLUMN IF NOT EXISTS update_error TEXT NULL,
  ADD COLUMN IF NOT EXISTS update_started_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS update_finished_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_successful_update_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_successful_update_version TEXT NULL;

ALTER TABLE supervisor_agents
  ADD COLUMN IF NOT EXISTS last_successful_update_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_successful_update_version TEXT NULL;
