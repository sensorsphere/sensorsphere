-- ============================================================================
-- SensorSphere
-- Migration 041 - Device Registry identities, access links and managed taxonomy
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_classes (
    code TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    description TEXT NULL,
    icon TEXT NOT NULL DEFAULT 'device',
    color TEXT NOT NULL DEFAULT 'gray',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO device_classes (code, label, description, icon, color, sort_order) VALUES
    ('IOT', 'IoT', 'Connected sensors, actuators and gateways', 'antenna', 'cyan', 10),
    ('NETWORK', 'Network', 'Routers, switches, access points and firewalls', 'network', 'blue', 20),
    ('COMPUTE', 'Compute', 'Physical compute and server platforms', 'server', 'violet', 30),
    ('VIRTUAL', 'Virtual', 'Virtual machines and containers', 'virtual', 'grape', 40),
    ('INFRASTRUCTURE', 'Infrastructure', 'Shared infrastructure and appliances', 'infrastructure', 'orange', 50),
    ('OTHER', 'Other', 'Unclassified technical equipment', 'device', 'gray', 999)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    sort_order = EXCLUDED.sort_order;

ALTER TABLE device_registry_devices DROP CONSTRAINT IF EXISTS chk_device_registry_class;
ALTER TABLE device_types DROP CONSTRAINT IF EXISTS chk_device_types_class;

ALTER TABLE device_types
    ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT 'device',
    ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT 'gray';

ALTER TABLE device_technologies
    ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT 'link',
    ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT 'gray';

UPDATE device_types SET icon = CASE code
    WHEN 'router' THEN 'router' WHEN 'switch' THEN 'switch' WHEN 'access_point' THEN 'wifi'
    WHEN 'firewall' THEN 'shield' WHEN 'server' THEN 'server' WHEN 'hypervisor' THEN 'server-stack'
    WHEN 'virtual_machine' THEN 'virtual' WHEN 'lxc_container' THEN 'container' WHEN 'docker_host' THEN 'container'
    WHEN 'nas' THEN 'storage' WHEN 'gateway' THEN 'gateway' WHEN 'mqtt_gateway' THEN 'gateway'
    WHEN 'zigbee_gateway' THEN 'gateway' WHEN 'ble_gateway' THEN 'gateway' WHEN 'sensor' THEN 'sensor'
    WHEN 'environment_sensor' THEN 'thermometer' WHEN 'temperature_sensor' THEN 'thermometer'
    WHEN 'humidity_sensor' THEN 'droplet' WHEN 'motion_sensor' THEN 'motion' WHEN 'contact_sensor' THEN 'contact'
    WHEN 'button' THEN 'button' WHEN 'smart_plug' THEN 'plug' WHEN 'smart_switch' THEN 'switch-toggle'
    WHEN 'light' THEN 'bulb' WHEN 'light_bulb' THEN 'bulb' WHEN 'thermostat' THEN 'thermostat'
    WHEN 'camera' THEN 'camera' WHEN 'display' THEN 'display' WHEN 'controller' THEN 'controller'
    WHEN 'ups' THEN 'battery' WHEN 'printer' THEN 'printer' ELSE 'device' END,
    color = CASE device_class
      WHEN 'IOT' THEN 'cyan' WHEN 'NETWORK' THEN 'blue' WHEN 'COMPUTE' THEN 'violet'
      WHEN 'VIRTUAL' THEN 'grape' WHEN 'INFRASTRUCTURE' THEN 'orange' ELSE 'gray' END;

UPDATE device_technologies SET icon = CASE code
    WHEN 'ethernet' THEN 'ethernet' WHEN 'wifi' THEN 'wifi' WHEN 'bluetooth' THEN 'bluetooth'
    WHEN 'ble' THEN 'bluetooth' WHEN 'zigbee' THEN 'antenna' WHEN 'zwave' THEN 'antenna'
    WHEN 'thread' THEN 'network' WHEN 'matter' THEN 'network' WHEN 'esphome' THEN 'chip'
    WHEN 'mqtt' THEN 'message' WHEN 'yeelight' THEN 'bulb' WHEN 'snmp' THEN 'activity'
    WHEN 'modbus' THEN 'activity' WHEN 'proxmox' THEN 'server-stack' WHEN 'docker' THEN 'container'
    WHEN 'linux' THEN 'terminal' WHEN 'windows' THEN 'display' WHEN 'http' THEN 'globe'
    WHEN 'https' THEN 'globe-lock' WHEN 'ssh' THEN 'terminal' WHEN 'icmp' THEN 'activity'
    ELSE 'link' END;

ALTER TABLE device_registry_devices
    ADD COLUMN IF NOT EXISTS mac_address TEXT NULL,
    ADD COLUMN IF NOT EXISTS ip_address INET NULL,
    ADD COLUMN IF NOT EXISTS ieee_address TEXT NULL,
    ADD COLUMN IF NOT EXISTS fqdn TEXT NULL;

UPDATE device_registry_devices d SET mac_address = x.value
FROM (
    SELECT DISTINCT ON (device_id) device_id, value
    FROM device_registry_identities
    WHERE UPPER(identity_type) IN ('MAC', 'MAC_ADDRESS', 'MAC_WIFI', 'MAC_ETHERNET')
    ORDER BY device_id, updated_at DESC
) x WHERE x.device_id = d.id AND d.mac_address IS NULL;

UPDATE device_registry_devices d SET ip_address = x.value::inet
FROM (
    SELECT DISTINCT ON (device_id) device_id, value
    FROM device_registry_identities
    WHERE UPPER(identity_type) IN ('IP', 'IP_ADDRESS')
      AND value ~ '^([0-9]{1,3}\.){3}[0-9]{1,3}(/[0-9]{1,2})?$'
    ORDER BY device_id, updated_at DESC
) x WHERE x.device_id = d.id AND d.ip_address IS NULL;

UPDATE device_registry_devices d SET ieee_address = x.value
FROM (
    SELECT DISTINCT ON (device_id) device_id, value
    FROM device_registry_identities
    WHERE UPPER(identity_type) IN ('IEEE', 'IEEE_ADDRESS', 'ZIGBEE_IEEE')
    ORDER BY device_id, updated_at DESC
) x WHERE x.device_id = d.id AND d.ieee_address IS NULL;

UPDATE device_registry_devices d SET fqdn = x.value
FROM (
    SELECT DISTINCT ON (device_id) device_id, value
    FROM device_registry_identities
    WHERE UPPER(identity_type) IN ('FQDN', 'HOSTNAME')
    ORDER BY device_id, updated_at DESC
) x WHERE x.device_id = d.id AND d.fqdn IS NULL;

CREATE TABLE IF NOT EXISTS device_access_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL,
    name TEXT NOT NULL,
    link_type TEXT NOT NULL DEFAULT 'CUSTOM',
    url_template TEXT NOT NULL,
    username TEXT NULL,
    port INTEGER NULL,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    icon TEXT NOT NULL DEFAULT 'link',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_device_access_links_device
        FOREIGN KEY (device_id) REFERENCES device_registry_devices(id) ON DELETE CASCADE,
    CONSTRAINT chk_device_access_links_port
        CHECK (port IS NULL OR port BETWEEN 1 AND 65535)
);

CREATE INDEX IF NOT EXISTS idx_device_access_links_device
    ON device_access_links(device_id, sort_order, name);

ALTER TABLE device_registry_devices DROP CONSTRAINT IF EXISTS fk_device_registry_device_class;
ALTER TABLE device_registry_devices ADD CONSTRAINT fk_device_registry_device_class
    FOREIGN KEY (device_class) REFERENCES device_classes(code);

ALTER TABLE device_types DROP CONSTRAINT IF EXISTS fk_device_types_class;
ALTER TABLE device_types ADD CONSTRAINT fk_device_types_class
    FOREIGN KEY (device_class) REFERENCES device_classes(code);
