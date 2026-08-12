-- Configure downsampling and retention for normalized observations.
-- Raw observations are kept for 90 days.
-- Hourly aggregates are kept for 1 year.

CREATE MATERIALIZED VIEW observation_hourly
WITH (timescaledb.continuous) AS
SELECT
  asset_metric_id,
  time_bucket(
    INTERVAL '1 hour',
    time
  ) AS bucket_start,
  MIN(value_double) AS min_value,
  MAX(value_double) AS max_value,
  AVG(value_double) AS avg_value,
  COUNT(value_double) AS sample_count
FROM observations
WHERE value_double IS NOT NULL
GROUP BY
  asset_metric_id,
  bucket_start
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
  'observation_hourly',
  start_offset => INTERVAL '30 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour'
);

SELECT add_retention_policy(
  'observations',
  drop_after => INTERVAL '90 days',
  if_not_exists => TRUE
);

SELECT add_retention_policy(
  'observation_hourly',
  drop_after => INTERVAL '1 year',
  if_not_exists => TRUE
);
