-- ============================================================================
-- SensorSphere
-- Migration 040 - Device Registry reference types and technologies
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_types (
    code TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    device_class TEXT NOT NULL,
    category TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_device_types_class
        CHECK (device_class IN ('IOT', 'NETWORK', 'COMPUTE', 'VIRTUAL', 'INFRASTRUCTURE', 'OTHER'))
);

CREATE TABLE IF NOT EXISTS device_technologies (
    code TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    category TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO device_types (code, label, device_class, category, sort_order) VALUES
    ('router', 'Router', 'NETWORK', 'Network', 10),
    ('switch', 'Switch', 'NETWORK', 'Network', 20),
    ('access_point', 'Access point', 'NETWORK', 'Network', 30),
    ('firewall', 'Firewall', 'NETWORK', 'Network', 40),
    ('server', 'Server', 'COMPUTE', 'Compute', 50),
    ('hypervisor', 'Hypervisor', 'COMPUTE', 'Virtualization', 60),
    ('virtual_machine', 'Virtual machine', 'VIRTUAL', 'Virtualization', 70),
    ('lxc_container', 'LXC container', 'VIRTUAL', 'Virtualization', 80),
    ('docker_host', 'Docker host', 'COMPUTE', 'Containers', 90),
    ('nas', 'NAS', 'INFRASTRUCTURE', 'Storage', 100),
    ('gateway', 'Gateway', 'INFRASTRUCTURE', 'Gateway', 110),
    ('mqtt_gateway', 'MQTT gateway', 'IOT', 'Gateway', 120),
    ('zigbee_gateway', 'Zigbee gateway', 'IOT', 'Gateway', 130),
    ('ble_gateway', 'BLE gateway', 'IOT', 'Gateway', 140),
    ('sensor', 'Sensor', 'IOT', 'Sensor', 150),
    ('environment_sensor', 'Environment sensor', 'IOT', 'Sensor', 160),
    ('temperature_sensor', 'Temperature sensor', 'IOT', 'Sensor', 170),
    ('humidity_sensor', 'Humidity sensor', 'IOT', 'Sensor', 180),
    ('motion_sensor', 'Motion sensor', 'IOT', 'Sensor', 190),
    ('contact_sensor', 'Contact sensor', 'IOT', 'Sensor', 200),
    ('button', 'Button', 'IOT', 'Control', 210),
    ('smart_plug', 'Smart plug', 'IOT', 'Power', 220),
    ('smart_switch', 'Smart switch', 'IOT', 'Power', 230),
    ('light', 'Light', 'IOT', 'Lighting', 240),
    ('light_bulb', 'Light bulb', 'IOT', 'Lighting', 250),
    ('thermostat', 'Thermostat', 'IOT', 'HVAC', 260),
    ('camera', 'Camera', 'IOT', 'Video', 270),
    ('display', 'Display', 'IOT', 'Display', 280),
    ('controller', 'Controller', 'INFRASTRUCTURE', 'Control', 290),
    ('ups', 'UPS', 'INFRASTRUCTURE', 'Power', 300),
    ('printer', 'Printer', 'INFRASTRUCTURE', 'Peripheral', 310),
    ('other', 'Other', 'OTHER', 'Other', 999)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    device_class = EXCLUDED.device_class,
    category = EXCLUDED.category,
    sort_order = EXCLUDED.sort_order;

INSERT INTO device_technologies (code, label, category, sort_order) VALUES
    ('ethernet', 'Ethernet', 'Network', 10),
    ('wifi', 'Wi-Fi', 'Network', 20),
    ('bluetooth', 'Bluetooth', 'Wireless', 30),
    ('ble', 'Bluetooth Low Energy', 'Wireless', 40),
    ('zigbee', 'Zigbee', 'Wireless', 50),
    ('zwave', 'Z-Wave', 'Wireless', 60),
    ('thread', 'Thread', 'Wireless', 70),
    ('matter', 'Matter', 'IoT', 80),
    ('esphome', 'ESPHome', 'IoT', 90),
    ('mqtt', 'MQTT', 'Messaging', 100),
    ('yeelight', 'Yeelight', 'IoT', 110),
    ('snmp', 'SNMP', 'Management', 120),
    ('modbus', 'Modbus', 'Industrial', 130),
    ('proxmox', 'Proxmox', 'Virtualization', 140),
    ('docker', 'Docker', 'Containers', 150),
    ('linux', 'Linux', 'Operating system', 160),
    ('windows', 'Windows', 'Operating system', 170),
    ('http', 'HTTP', 'Application', 180),
    ('https', 'HTTPS', 'Application', 190),
    ('ssh', 'SSH', 'Management', 200),
    ('icmp', 'ICMP', 'Network', 210),
    ('other', 'Other', 'Other', 999)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    category = EXCLUDED.category,
    sort_order = EXCLUDED.sort_order;

-- Preserve any values that may already have been entered in the foundation release.
INSERT INTO device_types (code, label, device_class, category, enabled, sort_order)
SELECT DISTINCT d.device_type, d.device_type, d.device_class, 'Custom', TRUE, 900
FROM device_registry_devices d
WHERE d.device_type IS NOT NULL AND BTRIM(d.device_type) <> ''
ON CONFLICT (code) DO NOTHING;

INSERT INTO device_technologies (code, label, category, enabled, sort_order)
SELECT DISTINCT d.technology, d.technology, 'Custom', TRUE, 900
FROM device_registry_devices d
WHERE d.technology IS NOT NULL AND BTRIM(d.technology) <> ''
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS device_registry_device_technologies (
    device_id UUID NOT NULL,
    technology_code TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (device_id, technology_code),
    CONSTRAINT fk_device_registry_technology_device
        FOREIGN KEY (device_id) REFERENCES device_registry_devices(id) ON DELETE CASCADE,
    CONSTRAINT fk_device_registry_technology_reference
        FOREIGN KEY (technology_code) REFERENCES device_technologies(code)
);

INSERT INTO device_registry_device_technologies (device_id, technology_code)
SELECT d.id, d.technology
FROM device_registry_devices d
WHERE d.technology IS NOT NULL AND BTRIM(d.technology) <> ''
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_device_registry_device_technologies_code
    ON device_registry_device_technologies(technology_code);

-- device_type remains a compact stable code, now backed by a reference table.
ALTER TABLE device_registry_devices
    DROP CONSTRAINT IF EXISTS fk_device_registry_device_type;
ALTER TABLE device_registry_devices
    ADD CONSTRAINT fk_device_registry_device_type
    FOREIGN KEY (device_type) REFERENCES device_types(code);
