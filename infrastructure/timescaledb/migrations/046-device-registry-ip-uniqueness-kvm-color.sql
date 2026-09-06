-- ============================================================================
-- SensorSphere
-- Migration 046 - Device Registry IP uniqueness and KVM color consistency
-- ============================================================================

-- Keep the KVM type visually consistent with the NETWORK family.
UPDATE device_types
SET color = 'blue', updated_at = NOW()
WHERE code = 'kvm';

-- IP identities are unique across devices. Existing duplicate IP rows are kept
-- so upgrades never destroy inventory data. The trigger prevents any new or
-- modified row from introducing (or preserving through an edit) a duplicate IP
-- on another device. Once legacy duplicates are corrected, this provides the
-- same database-side integrity guarantee for future writes.
CREATE OR REPLACE FUNCTION enforce_device_registry_unique_ip()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    conflicting_device_id UUID;
BEGIN
    IF NEW.identity_type <> 'IP' OR NEW.normalized_value IS NULL OR NEW.normalized_value = '' THEN
        RETURN NEW;
    END IF;

    SELECT i.device_id
      INTO conflicting_device_id
      FROM device_registry_identities i
     WHERE i.identity_type = 'IP'
       AND i.normalized_value = NEW.normalized_value
       AND i.device_id <> NEW.device_id
       AND i.id <> NEW.id
     LIMIT 1;

    IF conflicting_device_id IS NOT NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '23505',
            MESSAGE = 'Duplicate IP identity',
            DETAIL = format('IP %s is already assigned to device %s', NEW.value, conflicting_device_id),
            CONSTRAINT = 'uq_device_registry_identity_ip';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_device_registry_unique_ip ON device_registry_identities;
CREATE TRIGGER trg_device_registry_unique_ip
BEFORE INSERT OR UPDATE OF identity_type, normalized_value, device_id
ON device_registry_identities
FOR EACH ROW
EXECUTE FUNCTION enforce_device_registry_unique_ip();
