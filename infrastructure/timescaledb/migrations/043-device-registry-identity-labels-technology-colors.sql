-- ============================================================================
-- SensorSphere
-- Migration 043 - Device Registry identity labels and technology colors
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_identity_labels (
    code TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO device_identity_labels (code, label, description, sort_order) VALUES
    ('LAN', 'LAN', 'Local area network interface/address', 10),
    ('WAN', 'WAN', 'Wide area network interface/address', 20),
    ('WIFI', 'Wi-Fi', 'Wireless LAN interface/address', 30),
    ('MANAGEMENT', 'Management', 'Management interface/address', 40),
    ('UPLINK', 'Uplink', 'Upstream network interface/address', 50),
    ('DOWNLINK', 'Downlink', 'Downstream network interface/address', 60),
    ('CLUSTER', 'Cluster', 'Cluster communication interface/address', 70),
    ('STORAGE', 'Storage', 'Storage network interface/address', 80),
    ('SERVICE', 'Service', 'Service-facing address', 90),
    ('VPN', 'VPN', 'VPN interface/address', 100),
    ('GUEST', 'Guest', 'Guest network interface/address', 110),
    ('LOOPBACK', 'Loopback', 'Loopback interface/address', 120),
    ('OTHER', 'Other', 'Other identity/address role', 999)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order;

ALTER TABLE device_registry_identities
    ADD COLUMN IF NOT EXISTS label_code TEXT NULL;

-- Migrate the most common free-form labels to stable reference codes.
UPDATE device_registry_identities
SET label_code = CASE UPPER(BTRIM(label))
    WHEN 'LAN' THEN 'LAN'
    WHEN 'WAN' THEN 'WAN'
    WHEN 'WI-FI' THEN 'WIFI'
    WHEN 'WIFI' THEN 'WIFI'
    WHEN 'MANAGEMENT' THEN 'MANAGEMENT'
    WHEN 'MGMT' THEN 'MANAGEMENT'
    WHEN 'UPLINK' THEN 'UPLINK'
    WHEN 'DOWNLINK' THEN 'DOWNLINK'
    WHEN 'CLUSTER' THEN 'CLUSTER'
    WHEN 'STORAGE' THEN 'STORAGE'
    WHEN 'SERVICE' THEN 'SERVICE'
    WHEN 'VPN' THEN 'VPN'
    WHEN 'GUEST' THEN 'GUEST'
    WHEN 'LOOPBACK' THEN 'LOOPBACK'
    WHEN 'OTHER' THEN 'OTHER'
    ELSE label_code
END
WHERE label IS NOT NULL;

ALTER TABLE device_registry_identities
    DROP CONSTRAINT IF EXISTS fk_device_registry_identity_label;
ALTER TABLE device_registry_identities
    ADD CONSTRAINT fk_device_registry_identity_label
    FOREIGN KEY (label_code) REFERENCES device_identity_labels(code);

CREATE INDEX IF NOT EXISTS idx_device_registry_identities_label_code
    ON device_registry_identities(label_code);

-- Technologies should be visually distinguishable by default instead of all gray.
ALTER TABLE device_technologies
    ALTER COLUMN color SET DEFAULT 'blue';

UPDATE device_technologies SET color = CASE code
    WHEN 'ethernet' THEN 'blue'
    WHEN 'wifi' THEN 'cyan'
    WHEN 'bluetooth' THEN 'indigo'
    WHEN 'ble' THEN 'cyan'
    WHEN 'zigbee' THEN 'orange'
    WHEN 'zwave' THEN 'violet'
    WHEN 'thread' THEN 'teal'
    WHEN 'matter' THEN 'indigo'
    WHEN 'esphome' THEN 'green'
    WHEN 'mqtt' THEN 'violet'
    WHEN 'yeelight' THEN 'yellow'
    WHEN 'snmp' THEN 'teal'
    WHEN 'modbus' THEN 'orange'
    WHEN 'proxmox' THEN 'orange'
    WHEN 'docker' THEN 'blue'
    WHEN 'linux' THEN 'yellow'
    WHEN 'windows' THEN 'blue'
    WHEN 'http' THEN 'cyan'
    WHEN 'https' THEN 'green'
    WHEN 'ssh' THEN 'violet'
    WHEN 'icmp' THEN 'lime'
    WHEN 'other' THEN 'orange'
    ELSE CASE WHEN color = 'gray' OR color IS NULL OR BTRIM(color) = '' THEN 'blue' ELSE color END
END;
