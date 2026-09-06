-- ============================================================================
-- SensorSphere
-- Migration 045 - Device Registry KVM type and identity uniqueness cleanup
-- ============================================================================

-- The foundation schema made every identity value globally unique.  The
-- Device Registry now intentionally allows duplicate IP/FQDN/hostname/etc.
-- values and only reserves hardware identifiers that are globally unique.
ALTER TABLE device_registry_identities
    DROP CONSTRAINT IF EXISTS uq_device_registry_identity;

-- MAC and IEEE uniqueness continue to be enforced by the partial unique
-- indexes introduced by migration 042.

INSERT INTO device_types (
    code, label, device_class, category, enabled, sort_order, icon, color
) VALUES (
    'kvm', 'KVM', 'NETWORK', 'Network', TRUE, 35, 'display', 'teal'
)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label,
    device_class = EXCLUDED.device_class,
    category = EXCLUDED.category,
    enabled = EXCLUDED.enabled,
    sort_order = EXCLUDED.sort_order,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    updated_at = NOW();
