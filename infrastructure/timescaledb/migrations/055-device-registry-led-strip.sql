-- ============================================================================
-- SensorSphere
-- Migration 055 - Device Registry LED Strip type
-- ============================================================================

INSERT INTO device_types (
    code,
    label,
    device_class,
    category,
    icon,
    color,
    enabled,
    sort_order
) VALUES (
    'led_strip',
    'LED Strip',
    'IOT',
    'Lighting',
    'bulb',
    'yellow',
    TRUE,
    255
)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    device_class = EXCLUDED.device_class,
    category = EXCLUDED.category,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    enabled = EXCLUDED.enabled,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();
