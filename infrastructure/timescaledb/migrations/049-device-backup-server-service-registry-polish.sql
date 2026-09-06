-- PR-149 v4: Device Backup Server taxonomy entry.

INSERT INTO device_types (code, label, device_class, category, description, icon, color, enabled, sort_order)
VALUES ('backup_server', 'Backup Server', 'COMPUTE', 'Backup', 'Backup server appliance or platform, for example Proxmox Backup Server', 'storage', 'violet', TRUE, 65)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    device_class = EXCLUDED.device_class,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    enabled = EXCLUDED.enabled,
    sort_order = EXCLUDED.sort_order;
