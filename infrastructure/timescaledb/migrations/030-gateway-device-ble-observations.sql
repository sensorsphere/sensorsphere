-- Generalize BLE RSSI samples as gateway-to-device observations.
-- Existing coverage data is preserved in place by renaming the hypertable and device key.

DO $$
BEGIN
  IF to_regclass('public.gateway_device_ble_observations') IS NULL
     AND to_regclass('public.gateway_sensor_rssi_samples') IS NOT NULL THEN
    ALTER TABLE gateway_sensor_rssi_samples
      RENAME TO gateway_device_ble_observations;
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'gateway_device_ble_observations'
      AND column_name = 'sensor_uid'
  ) THEN
    ALTER TABLE gateway_device_ble_observations
      RENAME COLUMN sensor_uid TO device_uid;
  END IF;
END
$$;

ALTER INDEX IF EXISTS idx_gateway_sensor_rssi_sensor_time
  RENAME TO idx_gateway_device_ble_device_time;

ALTER INDEX IF EXISTS idx_gateway_sensor_rssi_gateway_time
  RENAME TO idx_gateway_device_ble_gateway_time;
