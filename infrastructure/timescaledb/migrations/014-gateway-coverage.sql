-- Temporary BLE gateway coverage measurements.
-- These samples are deliberately separate from normal SensorSphere observations.

CREATE TABLE IF NOT EXISTS gateway_sensor_rssi_samples (
  time timestamptz NOT NULL,
  gateway_id text NOT NULL,
  sensor_uid text NOT NULL,
  rssi double precision NOT NULL,
  source_topic text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

SELECT create_hypertable(
  'gateway_sensor_rssi_samples',
  'time',
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_gateway_sensor_rssi_sensor_time
  ON gateway_sensor_rssi_samples(sensor_uid, time DESC);

CREATE INDEX IF NOT EXISTS idx_gateway_sensor_rssi_gateway_time
  ON gateway_sensor_rssi_samples(gateway_id, time DESC);

SELECT add_retention_policy(
  'gateway_sensor_rssi_samples',
  drop_after => INTERVAL '30 days',
  if_not_exists => TRUE
);
