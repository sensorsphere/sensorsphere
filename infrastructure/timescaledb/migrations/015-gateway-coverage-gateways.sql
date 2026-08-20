-- Persistent metadata for candidate BLE gateways used by Gateway Coverage.
-- RSSI samples remain in gateway_sensor_rssi_samples and may be reset independently.

CREATE TABLE IF NOT EXISTS gateway_coverage_gateways (
  gateway_id text PRIMARY KEY,
  board_id text,
  mac_address text,
  wifi_rssi double precision,
  wifi_rssi_seen_at timestamptz,
  last_rssi_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO gateway_coverage_gateways (
  gateway_id,
  last_rssi_at
)
SELECT
  gateway_id,
  MAX(time)
FROM gateway_sensor_rssi_samples
GROUP BY gateway_id
ON CONFLICT (gateway_id) DO UPDATE
SET
  last_rssi_at = GREATEST(
    gateway_coverage_gateways.last_rssi_at,
    EXCLUDED.last_rssi_at
  ),
  updated_at = now();
