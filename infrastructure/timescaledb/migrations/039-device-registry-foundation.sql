-- ============================================================================
-- SensorSphere
-- Migration 039 - Device Registry foundation
-- ============================================================================
-- Generic technical inventory for IoT, network, compute and virtual devices.
-- The registry remains loosely coupled from Sensors, Assets and Gateways through
-- optional typed links rather than foreign keys to those application domains.
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_health_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT NULL,
    warning_after_seconds INTEGER NULL,
    offline_after_seconds INTEGER NULL,
    battery_warning_percent DOUBLE PRECISION NULL,
    battery_critical_percent DOUBLE PRECISION NULL,
    rssi_warning DOUBLE PRECISION NULL,
    rssi_critical DOUBLE PRECISION NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_device_health_profile_warning_after
        CHECK (warning_after_seconds IS NULL OR warning_after_seconds > 0),
    CONSTRAINT chk_device_health_profile_offline_after
        CHECK (offline_after_seconds IS NULL OR offline_after_seconds > 0),
    CONSTRAINT chk_device_health_profile_timeout_order
        CHECK (
            warning_after_seconds IS NULL
            OR offline_after_seconds IS NULL
            OR warning_after_seconds < offline_after_seconds
        ),
    CONSTRAINT chk_device_health_profile_battery_warning
        CHECK (
            battery_warning_percent IS NULL
            OR battery_warning_percent BETWEEN 0 AND 100
        ),
    CONSTRAINT chk_device_health_profile_battery_critical
        CHECK (
            battery_critical_percent IS NULL
            OR battery_critical_percent BETWEEN 0 AND 100
        ),
    CONSTRAINT chk_device_health_profile_battery_order
        CHECK (
            battery_warning_percent IS NULL
            OR battery_critical_percent IS NULL
            OR battery_critical_percent <= battery_warning_percent
        )
);

CREATE TABLE IF NOT EXISTS device_registry_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    device_class TEXT NOT NULL,
    device_type TEXT NOT NULL,
    technology TEXT NULL,
    manufacturer TEXT NULL,
    model TEXT NULL,
    firmware_version TEXT NULL,
    description TEXT NULL,
    location_id UUID NULL,
    parent_device_id UUID NULL,
    health_profile_id UUID NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at TIMESTAMPTZ NULL,
    battery_percent DOUBLE PRECISION NULL,
    rssi DOUBLE PRECISION NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_device_registry_location
        FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
    CONSTRAINT fk_device_registry_parent
        FOREIGN KEY (parent_device_id) REFERENCES device_registry_devices(id) ON DELETE SET NULL,
    CONSTRAINT fk_device_registry_health_profile
        FOREIGN KEY (health_profile_id) REFERENCES device_health_profiles(id) ON DELETE SET NULL,
    CONSTRAINT chk_device_registry_not_self_parent
        CHECK (parent_device_id IS NULL OR parent_device_id <> id),
    CONSTRAINT chk_device_registry_battery
        CHECK (battery_percent IS NULL OR battery_percent BETWEEN 0 AND 100),
    CONSTRAINT chk_device_registry_class
        CHECK (device_class IN ('IOT', 'NETWORK', 'COMPUTE', 'VIRTUAL', 'INFRASTRUCTURE', 'OTHER'))
);

CREATE INDEX IF NOT EXISTS idx_device_registry_devices_name
    ON device_registry_devices(name);
CREATE INDEX IF NOT EXISTS idx_device_registry_devices_class
    ON device_registry_devices(device_class);
CREATE INDEX IF NOT EXISTS idx_device_registry_devices_type
    ON device_registry_devices(device_type);
CREATE INDEX IF NOT EXISTS idx_device_registry_devices_location
    ON device_registry_devices(location_id);
CREATE INDEX IF NOT EXISTS idx_device_registry_devices_parent
    ON device_registry_devices(parent_device_id);
CREATE INDEX IF NOT EXISTS idx_device_registry_devices_health_profile
    ON device_registry_devices(health_profile_id);

CREATE TABLE IF NOT EXISTS device_registry_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL,
    identity_type TEXT NOT NULL,
    value TEXT NOT NULL,
    source TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_device_registry_identity_device
        FOREIGN KEY (device_id) REFERENCES device_registry_devices(id) ON DELETE CASCADE,
    CONSTRAINT uq_device_registry_identity
        UNIQUE (identity_type, value)
);

CREATE INDEX IF NOT EXISTS idx_device_registry_identities_device
    ON device_registry_identities(device_id);

CREATE TABLE IF NOT EXISTS device_registry_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL,
    target_type TEXT NOT NULL,
    target_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_device_registry_link_device
        FOREIGN KEY (device_id) REFERENCES device_registry_devices(id) ON DELETE CASCADE,
    CONSTRAINT chk_device_registry_link_target_type
        CHECK (target_type IN ('sensor', 'asset', 'gateway')),
    CONSTRAINT uq_device_registry_link
        UNIQUE (device_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_device_registry_links_device
    ON device_registry_links(device_id);
CREATE INDEX IF NOT EXISTS idx_device_registry_links_target
    ON device_registry_links(target_type, target_id);
