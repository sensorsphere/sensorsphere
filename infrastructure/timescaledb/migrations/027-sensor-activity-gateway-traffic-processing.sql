-- Sensor activity independent from productive measurement persistence,
-- plus Gateway Traffic processing classification.

ALTER TABLE sensors
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sensors_last_seen_at
  ON sensors(last_seen_at DESC);

ALTER TABLE gateway_traffic_events
  ADD COLUMN IF NOT EXISTS processing TEXT
  DEFAULT 'UNRECOGNIZED';

-- This migration may be retried after a partially applied v1.
-- Set the default before the backfill so concurrent inserts from the
-- still-running ingestion service cannot create new NULL values.
ALTER TABLE gateway_traffic_events
  ALTER COLUMN processing SET DEFAULT 'UNRECOGNIZED';

UPDATE gateway_traffic_events
SET processing = CASE
  WHEN message_type = 'METADATA' THEN 'GATEWAY_METADATA'
  WHEN message_type = 'UNKNOWN' THEN 'UNRECOGNIZED'
  WHEN metric IN ('manufacturer', 'model', 'firmware') THEN 'SENSOR_METADATA'
  WHEN metric = 'rssi' THEN 'COVERAGE_ROUTING'
  ELSE 'METRIC_ROUTING'
END
WHERE processing IS NULL;

-- Defensive retry-safe cleanup before enforcing NOT NULL.
UPDATE gateway_traffic_events
SET processing = 'UNRECOGNIZED'
WHERE processing IS NULL;

ALTER TABLE gateway_traffic_events
  ALTER COLUMN processing SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_gateway_traffic_processing'
  ) THEN
    ALTER TABLE gateway_traffic_events
      ADD CONSTRAINT chk_gateway_traffic_processing
      CHECK (processing IN (
        'GATEWAY_METADATA',
        'SENSOR_METADATA',
        'METRIC_ROUTING',
        'COVERAGE_ROUTING',
        'UNRECOGNIZED'
      ));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_gateway_traffic_events_processing
  ON gateway_traffic_events(processing, occurred_at DESC);
