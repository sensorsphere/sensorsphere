-- Raw MQTT gateway traffic observability at ingestion entry.

CREATE TABLE IF NOT EXISTS gateway_traffic_events (
    id BIGSERIAL PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL,
    gateway_id TEXT,
    message_type TEXT NOT NULL CHECK (message_type IN ('METADATA', 'SENSOR', 'UNKNOWN')),
    sensor_uid TEXT,
    metric TEXT,
    payload TEXT NOT NULL,
    source_topic TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gateway_traffic_events_occurred_at
    ON gateway_traffic_events(occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_gateway_traffic_events_gateway
    ON gateway_traffic_events(gateway_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_gateway_traffic_events_sensor
    ON gateway_traffic_events(sensor_uid, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_gateway_traffic_events_type
    ON gateway_traffic_events(message_type, occurred_at DESC);
