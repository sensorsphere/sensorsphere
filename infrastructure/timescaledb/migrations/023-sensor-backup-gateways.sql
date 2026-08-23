-- Sensor backup gateways for routing failover dry-run.

CREATE TABLE IF NOT EXISTS sensor_gateway_assignments (
    id BIGSERIAL PRIMARY KEY,
    sensor_id BIGINT NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
    gateway_id UUID NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
    priority INTEGER NOT NULL CHECK (priority >= 2),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (sensor_id, priority),
    UNIQUE (sensor_id, gateway_id)
);

CREATE INDEX IF NOT EXISTS idx_sensor_gateway_assignments_gateway
    ON sensor_gateway_assignments(gateway_id);

ALTER TABLE metric_routing_events
    ADD COLUMN IF NOT EXISTS backup_gateway_id TEXT,
    ADD COLUMN IF NOT EXISTS primary_gateway_last_seen_at TIMESTAMPTZ;
