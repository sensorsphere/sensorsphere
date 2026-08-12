-- Add configurable asset health thresholds.
-- Health is calculated from the latest measurement timestamp.

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS
    warning_after_seconds integer NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS
    offline_after_seconds integer NOT NULL DEFAULT 600;

ALTER TABLE assets
  DROP CONSTRAINT IF EXISTS chk_assets_health_thresholds;

ALTER TABLE assets
  ADD CONSTRAINT chk_assets_health_thresholds
  CHECK (
    warning_after_seconds > 0
    AND offline_after_seconds > warning_after_seconds
  );
