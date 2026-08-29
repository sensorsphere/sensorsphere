-- Extend runtime component metadata with semantic module version information.

ALTER TABLE component_build_info
  ADD COLUMN IF NOT EXISTS version TEXT,
  ADD COLUMN IF NOT EXISTS changelog JSONB;

COMMENT ON COLUMN component_build_info.version IS
  'SensorSphere module version reported by the running component.';

COMMENT ON COLUMN component_build_info.changelog IS
  'Structured SensorSphere module changelog reported by the running component.';
