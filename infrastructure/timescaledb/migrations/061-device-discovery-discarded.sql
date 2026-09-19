CREATE TABLE IF NOT EXISTS device_discovery_discarded (
  provider text NOT NULL,
  identity_key text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, identity_key)
);

CREATE INDEX IF NOT EXISTS idx_device_discovery_discarded_created_at
  ON device_discovery_discarded (created_at DESC);
