-- Backfill normalized observations from legacy measurements.
-- This migration is idempotent: existing observations are not duplicated.

INSERT INTO observations (
  time,
  asset_metric_id,
  value_double,
  source,
  source_ref
)
SELECT
  m.time,
  am.id,
  metric.value,
  'legacy-backfill',
  m.sensor_uid
FROM measurements m
JOIN assets a
  ON a.source_sensor_uid = m.sensor_uid
CROSS JOIN LATERAL (
  VALUES
    ('temperature', m.temperature),
    ('humidity', m.humidity),
    ('battery', m.battery),
    ('voltage', m.voltage),
    ('rssi', m.rssi)
) AS metric(
  metric_key,
  value
)
JOIN asset_metrics am
  ON am.asset_id = a.id
 AND am.metric_key = metric.metric_key
WHERE metric.value IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM observations existing
    WHERE existing.time = m.time
      AND existing.asset_metric_id = am.id
  );
