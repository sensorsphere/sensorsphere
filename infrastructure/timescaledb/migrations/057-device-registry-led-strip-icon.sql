-- ============================================================================
-- SensorSphere
-- Migration 057 - Device Registry LED Strip icon
-- ============================================================================

UPDATE device_types
SET icon = 'led-strip',
    updated_at = NOW()
WHERE code = 'led_strip';
