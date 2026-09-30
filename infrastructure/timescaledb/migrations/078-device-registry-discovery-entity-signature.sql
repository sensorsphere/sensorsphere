ALTER TABLE device_registry_devices
  ADD COLUMN IF NOT EXISTS discovery_entity_signature TEXT NULL,
  ADD COLUMN IF NOT EXISTS discovery_entity_count INTEGER NULL
    CHECK (discovery_entity_count IS NULL OR discovery_entity_count >= 0);
