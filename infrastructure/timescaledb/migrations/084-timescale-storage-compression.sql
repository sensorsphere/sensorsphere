-- DB-2: enable validated Timescale compression policies.
--
-- Reference DEV benchmarks on representative closed 7-day chunks showed
-- approximately 96.6% to 97.6% physical-size reduction with no query
-- regression in the tested history/aggregate paths.
--
-- The migration configures compression and recurring policies only. It does
-- not synchronously compress existing chunks, keeping the schema migration
-- short and allowing normal Timescale jobs to process eligible chunks.
--
-- With the current 7-day chunk interval and compress_after = 7 days, the
-- effective writable/uncompressed window is approximately 7 to 14 days.

ALTER TABLE observations SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'asset_metric_id',
  timescaledb.compress_orderby = 'time DESC'
);

ALTER TABLE gateway_device_ble_observations SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'device_uid,gateway_id',
  timescaledb.compress_orderby = 'time DESC'
);

ALTER TABLE measurements SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'sensor_uid',
  timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy(
  'observations',
  compress_after => INTERVAL '7 days',
  if_not_exists => TRUE,
  schedule_interval => INTERVAL '1 hour'
);

SELECT add_compression_policy(
  'gateway_device_ble_observations',
  compress_after => INTERVAL '7 days',
  if_not_exists => TRUE,
  schedule_interval => INTERVAL '1 hour'
);

SELECT add_compression_policy(
  'measurements',
  compress_after => INTERVAL '7 days',
  if_not_exists => TRUE,
  schedule_interval => INTERVAL '1 hour'
);
