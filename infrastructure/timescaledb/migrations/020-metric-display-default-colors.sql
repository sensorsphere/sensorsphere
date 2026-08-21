-- ============================================================================
-- SensorSphere
-- Migration 020 - Adjust default metric display colors
-- ============================================================================
--
-- Updates only values that still match the defaults introduced by migration 019.
-- User-customized colors are preserved.
--
-- ============================================================================

UPDATE metric_display_settings
SET
    color = CASE metric_key
        WHEN 'temperature' THEN '#40c057'
        WHEN 'rssi' THEN '#ff8787'
        WHEN 'battery_level' THEN '#fab005'
        WHEN 'battery' THEN '#fab005'
        ELSE color
    END,
    updated_at = NOW()
WHERE
    (metric_key = 'temperature' AND color = '#fab005')
    OR (metric_key = 'rssi' AND color = '#fa5252')
    OR (metric_key = 'battery_level' AND color = '#40c057')
    OR (metric_key = 'battery' AND color = '#40c057');
