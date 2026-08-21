-- Functional gateway registry and MQTT discovery metadata.

CREATE TABLE IF NOT EXISTS gateway_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO gateway_types (key, name, description)
VALUES
    ('ble_gateway', 'BLE Gateway', 'Gateway collecting BLE sensors and publishing them through MQTT.'),
    ('generic', 'Generic Gateway', 'Generic SensorSphere gateway.')
ON CONFLICT (key) DO UPDATE
SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    updated_at = NOW();

ALTER TABLE gateways
    ADD COLUMN IF NOT EXISTS gateway_id TEXT,
    ADD COLUMN IF NOT EXISTS gateway_type_id UUID,
    ADD COLUMN IF NOT EXISTS name_manually_set BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS mac_address TEXT,
    ADD COLUMN IF NOT EXISTS wifi_ssid TEXT,
    ADD COLUMN IF NOT EXISTS board_id TEXT,
    ADD COLUMN IF NOT EXISTS build_date TEXT,
    ADD COLUMN IF NOT EXISTS wifi_rssi DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS wifi_rssi_seen_at TIMESTAMPTZ;

-- Existing manually-created gateways predate the MQTT gateway_id field. Give them
-- a stable legacy identifier so the new NOT NULL/UNIQUE constraint can be applied.
UPDATE gateways
SET gateway_id = 'legacy-' || id::text
WHERE gateway_id IS NULL OR BTRIM(gateway_id) = '';

UPDATE gateways
SET gateway_type_id = (
    SELECT id
    FROM gateway_types
    WHERE key = 'generic'
)
WHERE gateway_type_id IS NULL;

ALTER TABLE gateways
    ALTER COLUMN gateway_id SET NOT NULL,
    ALTER COLUMN gateway_type_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gateways_gateway_id
    ON gateways(gateway_id);

CREATE INDEX IF NOT EXISTS idx_gateways_gateway_type
    ON gateways(gateway_type_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_gateways_gateway_type'
    ) THEN
        ALTER TABLE gateways
            ADD CONSTRAINT fk_gateways_gateway_type
            FOREIGN KEY (gateway_type_id)
            REFERENCES gateway_types(id)
            ON DELETE RESTRICT;
    END IF;
END
$$;
