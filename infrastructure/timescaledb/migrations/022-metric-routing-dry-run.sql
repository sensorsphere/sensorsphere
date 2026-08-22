-- Metric routing dry-run observability and functional gateway location.

ALTER TABLE gateways
    ADD COLUMN IF NOT EXISTS location_id UUID;

CREATE INDEX IF NOT EXISTS idx_gateways_location
    ON gateways(location_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_gateways_location'
    ) THEN
        ALTER TABLE gateways
            ADD CONSTRAINT fk_gateways_location
            FOREIGN KEY (location_id)
            REFERENCES locations(id)
            ON DELETE SET NULL;
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS metric_routing_status (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    mode TEXT NOT NULL CHECK (mode IN ('legacy', 'dry_run', 'active')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO metric_routing_status (singleton, mode)
VALUES (TRUE, 'dry_run')
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS metric_routing_events (
    id BIGSERIAL PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL,
    gateway_id TEXT NOT NULL,
    sensor_uid TEXT NOT NULL,
    sensor_name TEXT,
    metric TEXT NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('ACCEPT', 'IGNORE', 'DEDUPLICATE', 'ERROR')),
    reason TEXT NOT NULL,
    assigned_gateway_id TEXT,
    mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'active')),
    source_topic TEXT NOT NULL,
    dedup_key TEXT,
    dedup_age_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metric_routing_events_occurred_at
    ON metric_routing_events(occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_metric_routing_events_sensor
    ON metric_routing_events(sensor_uid, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_metric_routing_events_gateway
    ON metric_routing_events(gateway_id, occurred_at DESC);
