-- SensorSphere migration 064 - optional per-device icon override
ALTER TABLE device_registry_devices
  ADD COLUMN IF NOT EXISTS icon_override TEXT NULL;
