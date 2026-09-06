-- ============================================================================
-- SensorSphere
-- Migration 050 - Service Registry WebUI and App Protocol taxonomy
-- ============================================================================

INSERT INTO service_classes (code, label, description, icon, color, sort_order) VALUES
    ('APP_PROTOCOL', 'App Protocol', 'Services opened through an application protocol such as SSH, RDP or VNC', 'terminal-2', 'violet', 15),
    ('WEBUI', 'WebUI', 'Web user interfaces exposed by devices or hosted services', 'browser', 'blue', 85)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color;

INSERT INTO service_types (code, label, service_class, description, icon, color, sort_order) VALUES
    ('app_protocol', 'Other app protocol', 'APP_PROTOCOL', 'Other application protocol launcher', 'terminal-2', 'violet', 10),
    ('rdp_protocol', 'RDP', 'APP_PROTOCOL', 'Remote Desktop Protocol access', 'device-desktop', 'violet', 20),
    ('ssh_protocol', 'SSH', 'APP_PROTOCOL', 'Secure Shell access', 'terminal-2', 'violet', 30),
    ('vnc_protocol', 'VNC', 'APP_PROTOCOL', 'Virtual Network Computing access', 'device-desktop', 'violet', 40),
    ('web_ui', 'Web UI', 'WEBUI', 'Browser-based user interface', 'browser', 'blue', 10)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    service_class = EXCLUDED.service_class,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color;
