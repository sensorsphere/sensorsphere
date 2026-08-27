-- Soft blacklist for sensors. Blacklisted sensors remain registered but are ignored by ingestion.

ALTER TABLE sensors
  ADD COLUMN IF NOT EXISTS blacklisted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_sensors_blacklisted
  ON sensors(blacklisted);
