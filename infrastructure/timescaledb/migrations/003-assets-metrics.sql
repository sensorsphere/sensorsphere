CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY,
    external_id TEXT NOT NULL UNIQUE,
    name TEXT,
    description TEXT,
    manufacturer TEXT,
    model TEXT,
    firmware_version TEXT,
    asset_type TEXT NOT NULL DEFAULT 'sensor',
    protocol TEXT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    gateway_id UUID,
    room_id UUID,
    source_sensor_uid TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_assets_gateway
        FOREIGN KEY (gateway_id) REFERENCES gateways(id) ON DELETE SET NULL,
    CONSTRAINT fk_assets_room
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_gateway ON assets(gateway_id);
CREATE INDEX IF NOT EXISTS idx_assets_room ON assets(room_id);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type);

CREATE TABLE IF NOT EXISTS asset_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL,
    metric_key TEXT NOT NULL,
    display_name TEXT NOT NULL,
    unit TEXT,
    value_type TEXT NOT NULL DEFAULT 'number',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_asset_metrics_asset
        FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    CONSTRAINT uq_asset_metrics_asset_key
        UNIQUE (asset_id, metric_key)
);

CREATE INDEX IF NOT EXISTS idx_asset_metrics_asset
    ON asset_metrics(asset_id);

INSERT INTO assets (
    id,
    external_id,
    name,
    description,
    manufacturer,
    model,
    firmware_version,
    asset_type,
    protocol,
    enabled,
    gateway_id,
    room_id,
    source_sensor_uid,
    created_at,
    updated_at
)
SELECT
    s.uuid,
    s.sensor_uid,
    s.name,
    s.description,
    s.manufacturer,
    s.model,
    s.firmware_version,
    'sensor',
    'ble',
    s.enabled,
    s.gateway_id,
    s.room_id,
    s.sensor_uid,
    s.created_at,
    s.updated_at
FROM sensors s
ON CONFLICT (id)
DO UPDATE SET
    external_id = EXCLUDED.external_id,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    manufacturer = EXCLUDED.manufacturer,
    model = EXCLUDED.model,
    firmware_version = EXCLUDED.firmware_version,
    enabled = EXCLUDED.enabled,
    gateway_id = EXCLUDED.gateway_id,
    room_id = EXCLUDED.room_id,
    source_sensor_uid = EXCLUDED.source_sensor_uid,
    updated_at = EXCLUDED.updated_at;

INSERT INTO asset_metrics (
    asset_id,
    metric_key,
    display_name,
    unit
)
SELECT
    a.id,
    metric.metric_key,
    metric.display_name,
    metric.unit
FROM assets a
CROSS JOIN LATERAL (
    VALUES
        ('temperature', 'Temperature', '°C'),
        ('humidity', 'Humidity', '%'),
        ('battery', 'Battery', '%'),
        ('voltage', 'Voltage', 'V'),
        ('rssi', 'RSSI', 'dBm')
) AS metric(metric_key, display_name, unit)
WHERE a.source_sensor_uid IS NOT NULL
  AND EXISTS (
      SELECT 1
      FROM measurements m
      WHERE m.sensor_uid = a.source_sensor_uid
        AND (
            (metric.metric_key = 'temperature' AND m.temperature IS NOT NULL)
            OR
            (metric.metric_key = 'humidity' AND m.humidity IS NOT NULL)
            OR
            (metric.metric_key = 'battery' AND m.battery IS NOT NULL)
            OR
            (metric.metric_key = 'voltage' AND m.voltage IS NOT NULL)
            OR
            (metric.metric_key = 'rssi' AND m.rssi IS NOT NULL)
        )
  )
ON CONFLICT (asset_id, metric_key)
DO NOTHING;
