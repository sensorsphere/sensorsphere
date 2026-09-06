-- ============================================================================
-- SensorSphere
-- Migration 042 - Device Registry multi-identities and unique hardware IDs
-- ============================================================================

ALTER TABLE device_registry_identities
    ADD COLUMN IF NOT EXISTS label TEXT NULL,
    ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 100,
    ADD COLUMN IF NOT EXISTS normalized_value TEXT NULL;

-- Promote legacy first-class fields into the identity collection.  The old
-- columns remain as compatibility/summary fields and are maintained by the API.
INSERT INTO device_registry_identities (device_id, identity_type, value, source, label, is_primary, sort_order)
SELECT id, 'MAC', mac_address, 'migration-042', 'Primary', TRUE, 10
FROM device_registry_devices d
WHERE mac_address IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM device_registry_identities i
    WHERE i.device_id = d.id
      AND UPPER(i.identity_type) IN ('MAC', 'MAC_ADDRESS', 'MAC_WIFI', 'MAC_ETHERNET')
      AND regexp_replace(upper(i.value), '[^0-9A-F]', '', 'g') = regexp_replace(upper(d.mac_address), '[^0-9A-F]', '', 'g')
  );

INSERT INTO device_registry_identities (device_id, identity_type, value, source, label, is_primary, sort_order)
SELECT id, 'IP', host(ip_address), 'migration-042', 'Primary', TRUE, 20
FROM device_registry_devices d
WHERE ip_address IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM device_registry_identities i
    WHERE i.device_id = d.id AND UPPER(i.identity_type) IN ('IP', 'IP_ADDRESS') AND i.value = host(d.ip_address)
  );

INSERT INTO device_registry_identities (device_id, identity_type, value, source, label, is_primary, sort_order)
SELECT id, 'IEEE', ieee_address, 'migration-042', 'Primary', TRUE, 30
FROM device_registry_devices d
WHERE ieee_address IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM device_registry_identities i
    WHERE i.device_id = d.id
      AND UPPER(i.identity_type) IN ('IEEE', 'IEEE_ADDRESS', 'ZIGBEE_IEEE')
      AND regexp_replace(upper(i.value), '[^0-9A-F]', '', 'g') = regexp_replace(upper(d.ieee_address), '[^0-9A-F]', '', 'g')
  );

INSERT INTO device_registry_identities (device_id, identity_type, value, source, label, is_primary, sort_order)
SELECT id, 'FQDN', fqdn, 'migration-042', 'Primary', TRUE, 40
FROM device_registry_devices d
WHERE fqdn IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM device_registry_identities i
    WHERE i.device_id = d.id AND UPPER(i.identity_type) IN ('FQDN', 'HOSTNAME') AND lower(i.value) = lower(d.fqdn)
  );

UPDATE device_registry_identities
SET identity_type = CASE
      WHEN UPPER(identity_type) IN ('MAC', 'MAC_ADDRESS', 'MAC_WIFI', 'MAC_ETHERNET') THEN 'MAC'
      WHEN UPPER(identity_type) IN ('IP', 'IP_ADDRESS') THEN 'IP'
      WHEN UPPER(identity_type) IN ('IEEE', 'IEEE_ADDRESS', 'ZIGBEE_IEEE') THEN 'IEEE'
      WHEN UPPER(identity_type) IN ('FQDN', 'HOSTNAME') THEN 'FQDN'
      ELSE UPPER(identity_type)
    END,
    normalized_value = CASE
      WHEN UPPER(identity_type) IN ('MAC', 'MAC_ADDRESS', 'MAC_WIFI', 'MAC_ETHERNET')
        THEN regexp_replace(upper(value), '[^0-9A-F]', '', 'g')
      WHEN UPPER(identity_type) IN ('IEEE', 'IEEE_ADDRESS', 'ZIGBEE_IEEE')
        THEN regexp_replace(upper(value), '[^0-9A-F]', '', 'g')
      WHEN UPPER(identity_type) IN ('FQDN', 'HOSTNAME') THEN lower(value)
      ELSE value
    END,
    updated_at = NOW();

-- Pick one primary identity for every type/device when legacy data did not
-- provide an explicit choice.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY device_id, identity_type ORDER BY is_primary DESC, sort_order, created_at, id) AS rn
  FROM device_registry_identities
)
UPDATE device_registry_identities i
SET is_primary = (ranked.rn = 1)
FROM ranked
WHERE ranked.id = i.id;

CREATE INDEX IF NOT EXISTS idx_device_registry_identities_device_order
    ON device_registry_identities(device_id, identity_type, sort_order, value);

CREATE UNIQUE INDEX IF NOT EXISTS uq_device_registry_identity_mac
    ON device_registry_identities(normalized_value)
    WHERE identity_type = 'MAC' AND normalized_value IS NOT NULL AND normalized_value <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_device_registry_identity_ieee
    ON device_registry_identities(normalized_value)
    WHERE identity_type = 'IEEE' AND normalized_value IS NOT NULL AND normalized_value <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_device_registry_identity_primary_type
    ON device_registry_identities(device_id, identity_type)
    WHERE is_primary = TRUE;
