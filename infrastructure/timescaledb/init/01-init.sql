CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS sensors (
  id BIGSERIAL PRIMARY KEY,
  sensor_uid TEXT UNIQUE NOT NULL,
  name TEXT,
  mac_address TEXT,
  location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS measurements (
  time TIMESTAMPTZ NOT NULL,
  sensor_uid TEXT NOT NULL,
  temperature DOUBLE PRECISION,
  humidity DOUBLE PRECISION,
  battery DOUBLE PRECISION,
  voltage DOUBLE PRECISION,
  rssi INTEGER,
  source_topic TEXT
);

SELECT create_hypertable(
  'measurements',
  by_range('time'),
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_measurements_sensor_time
  ON measurements(sensor_uid, time DESC);
