-- ============================================================================
-- SensorSphere
-- Migration 019 - Metric display settings
-- ============================================================================
--
-- Stores global display preferences for metric types.
-- Colors are shared by all sensors/graphs using the same metric_key.
--
-- ============================================================================

CREATE TABLE IF NOT EXISTS metric_display_settings (
    metric_key TEXT PRIMARY KEY,
    color VARCHAR(7) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_metric_display_settings_color
        CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
);

INSERT INTO metric_display_settings (
    metric_key,
    color
)
VALUES
    ('temperature', '#fab005'),
    ('humidity', '#228be6'),
    ('rssi', '#fa5252'),
    ('battery_level', '#40c057'),
    ('battery_voltage', '#845ef7'),
    ('battery', '#40c057'),
    ('voltage', '#845ef7'),
    ('pressure', '#15aabf'),
    ('co2', '#fd7e14')
ON CONFLICT (metric_key) DO NOTHING;
