CREATE TABLE IF NOT EXISTS device_control_entity_exclusions (
    device_id UUID NOT NULL REFERENCES device_registry_devices(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    entity_value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (device_id, provider, entity_value)
);

CREATE INDEX IF NOT EXISTS idx_device_control_entity_exclusions_provider
    ON device_control_entity_exclusions(provider);
