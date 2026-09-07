-- ============================================================================
-- SensorSphere
-- Migration 053 - Device Registry Raspberry Pi type
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
    'raspberry_pi',
    'Raspberry Pi',
    'COMPUTE',
    'Single-board computer',
    'server',
    'violet',
    TRUE,
    55
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
