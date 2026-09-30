ALTER TABLE device_control_entity_exclusions
  ADD COLUMN IF NOT EXISTS entity_snapshot JSONB NULL;

ALTER TABLE device_control_entity_exclusions
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE device_control_entity_exclusions
SET removed_at = COALESCE(updated_at, created_at, NOW())
WHERE removed_at IS NULL;
