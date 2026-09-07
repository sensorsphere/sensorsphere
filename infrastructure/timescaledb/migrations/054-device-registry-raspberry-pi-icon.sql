-- ============================================================================
-- SensorSphere
-- Migration 054 - Raspberry Pi dedicated icon
-- ============================================================================

UPDATE device_types
SET icon = 'raspberry-pi',
    updated_at = NOW()
WHERE code = 'raspberry_pi'
  AND icon IS DISTINCT FROM 'raspberry-pi';
