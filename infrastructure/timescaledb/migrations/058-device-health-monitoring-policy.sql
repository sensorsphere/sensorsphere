-- ============================================================================
-- SensorSphere
-- Migration 058 - Device health monitoring policy
-- ============================================================================
-- Allow Health Profiles to aggregate stabilized PING monitoring check states.
-- Existing profiles keep their previous behavior through the IGNORE default.
-- ============================================================================

ALTER TABLE device_health_profiles
    ADD COLUMN IF NOT EXISTS monitoring_policy TEXT NOT NULL DEFAULT 'IGNORE';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_device_health_profile_monitoring_policy'
    ) THEN
        ALTER TABLE device_health_profiles
            ADD CONSTRAINT chk_device_health_profile_monitoring_policy
            CHECK (monitoring_policy IN ('IGNORE', 'ANY_UP', 'ALL_UP'));
    END IF;
END $$;
