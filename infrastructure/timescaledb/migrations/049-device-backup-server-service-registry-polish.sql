-- PR-149 v4/v5: Device Backup Server taxonomy entry.
-- device_types intentionally has no description column; descriptive metadata is
-- carried by the class/category and the managed taxonomy fields.

INSERT INTO device_types (code, label, device_class, category, icon, color, enabled, sort_order)
VALUES ('backup_server', 'Backup Server', 'COMPUTE', 'Backup', 'storage', 'violet', TRUE, 65)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    device_class = EXCLUDED.device_class,
    category = EXCLUDED.category,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    enabled = EXCLUDED.enabled,
    sort_order = EXCLUDED.sort_order;
