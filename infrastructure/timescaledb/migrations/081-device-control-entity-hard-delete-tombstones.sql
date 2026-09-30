ALTER TABLE device_control_entity_exclusions
  ADD COLUMN IF NOT EXISTS lifecycle TEXT NOT NULL DEFAULT 'REMOVED';

UPDATE device_control_entity_exclusions
SET lifecycle = 'REMOVED'
WHERE lifecycle IS NULL
   OR lifecycle NOT IN ('REMOVED', 'HARD_DELETED');

ALTER TABLE device_control_entity_exclusions
  DROP CONSTRAINT IF EXISTS device_control_entity_exclusions_lifecycle_check;

ALTER TABLE device_control_entity_exclusions
  ADD CONSTRAINT device_control_entity_exclusions_lifecycle_check
  CHECK (lifecycle IN ('REMOVED', 'HARD_DELETED'));

CREATE INDEX IF NOT EXISTS idx_device_control_entity_exclusions_lifecycle
  ON device_control_entity_exclusions(lifecycle);
