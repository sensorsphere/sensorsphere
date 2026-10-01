CREATE TABLE IF NOT EXISTS device_registry_entities (
    device_id UUID NOT NULL REFERENCES device_registry_devices(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    entity_key TEXT NOT NULL,
    entity_value TEXT NOT NULL,
    entity_name TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (device_id, provider, entity_key)
);

CREATE INDEX IF NOT EXISTS idx_device_registry_entities_device
    ON device_registry_entities(device_id);

WITH live_entities AS (
    SELECT
        s.device_id,
        UPPER(s.provider) AS provider,
        item,
        LOWER(COALESCE(NULLIF(item->>'type', ''), 'unknown')) AS entity_type,
        COALESCE(NULLIF(item->>'value', ''), NULLIF(item->>'id', ''), NULLIF(item->>'name', '')) AS raw_value
    FROM device_control_states s
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(s.state->'entities') = 'array' THEN s.state->'entities' ELSE '[]'::jsonb END
    ) item
), normalized_live AS (
    SELECT
        l.device_id,
        l.provider,
        l.item,
        l.entity_type,
        l.raw_value,
        CASE
            WHEN LOWER(l.raw_value) LIKE l.entity_type || ':%' THEN LOWER(l.raw_value)
            ELSE l.entity_type || ':' || LOWER(l.raw_value)
        END AS entity_key
    FROM live_entities l
    WHERE l.raw_value IS NOT NULL AND BTRIM(l.raw_value) <> ''
)
INSERT INTO device_registry_entities (
    device_id, provider, entity_key, entity_value, entity_name, entity_type, entity_snapshot, created_at, updated_at
)
SELECT
    l.device_id,
    l.provider,
    l.entity_key,
    l.raw_value,
    COALESCE(NULLIF(l.item->>'name', ''), NULLIF(l.item->>'label', ''), l.raw_value),
    l.entity_type,
    l.item,
    NOW(),
    NOW()
FROM normalized_live l
JOIN device_registry_devices d ON d.id = l.device_id
LEFT JOIN device_control_entity_exclusions e
    ON e.device_id = l.device_id
   AND e.provider = l.provider
   AND e.entity_value = l.raw_value
WHERE e.device_id IS NULL
  AND (
      d.discovery_entity_signature IS NULL
      OR l.entity_key = ANY(string_to_array(LOWER(d.discovery_entity_signature), E'\n'))
  )
ON CONFLICT (device_id, provider, entity_key) DO NOTHING;

WITH signature_entities AS (
    SELECT
        d.id AS device_id,
        UPPER(COALESCE(NULLIF(d.control_provider, ''), 'UNKNOWN')) AS provider,
        LOWER(BTRIM(key_value)) AS entity_key
    FROM device_registry_devices d
    CROSS JOIN LATERAL unnest(string_to_array(COALESCE(d.discovery_entity_signature, ''), E'\n')) key_value
    WHERE d.discovery_entity_signature IS NOT NULL
      AND BTRIM(key_value) <> ''
)
INSERT INTO device_registry_entities (
    device_id, provider, entity_key, entity_value, entity_name, entity_type, entity_snapshot, created_at, updated_at
)
SELECT
    s.device_id,
    s.provider,
    s.entity_key,
    s.entity_key,
    CASE WHEN POSITION(':' IN s.entity_key) > 0 THEN SUBSTRING(s.entity_key FROM POSITION(':' IN s.entity_key) + 1) ELSE s.entity_key END,
    CASE WHEN POSITION(':' IN s.entity_key) > 0 THEN SPLIT_PART(s.entity_key, ':', 1) ELSE 'unknown' END,
    jsonb_build_object(
        'type', CASE WHEN POSITION(':' IN s.entity_key) > 0 THEN SPLIT_PART(s.entity_key, ':', 1) ELSE 'unknown' END,
        'value', s.entity_key,
        'name', CASE WHEN POSITION(':' IN s.entity_key) > 0 THEN SUBSTRING(s.entity_key FROM POSITION(':' IN s.entity_key) + 1) ELSE s.entity_key END
    ),
    NOW(),
    NOW()
FROM signature_entities s
LEFT JOIN device_control_entity_exclusions e
    ON e.device_id = s.device_id
   AND e.provider = s.provider
   AND LOWER(e.entity_value) = s.entity_key
WHERE e.device_id IS NULL
ON CONFLICT (device_id, provider, entity_key) DO NOTHING;

UPDATE device_registry_devices d
SET discovery_entity_signature = inventory.signature,
    discovery_entity_count = inventory.entity_count,
    updated_at = NOW()
FROM (
    SELECT
        device_id,
        string_agg(entity_key, E'\n' ORDER BY entity_key) AS signature,
        COUNT(*)::integer AS entity_count
    FROM device_registry_entities
    GROUP BY device_id
) inventory
WHERE d.id = inventory.device_id
  AND d.discovery_entity_signature IS NULL;

DELETE FROM device_control_entity_exclusions
WHERE lifecycle = 'HARD_DELETED';

DROP INDEX IF EXISTS idx_device_control_entity_exclusions_lifecycle;

ALTER TABLE device_control_entity_exclusions
  DROP CONSTRAINT IF EXISTS device_control_entity_exclusions_lifecycle_check;

ALTER TABLE device_control_entity_exclusions
  DROP COLUMN IF EXISTS lifecycle;
