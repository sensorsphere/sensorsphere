-- Asset classification catalogs and tag assignments.
-- Existing textual asset_type/manufacturer columns remain authoritative for
-- compatibility with ingestion; catalogs provide managed values for UX/API.

CREATE TABLE IF NOT EXISTS asset_types (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_types_name_ci
    ON asset_types (LOWER(name));

UPDATE assets
SET asset_type = LOWER(TRIM(asset_type)),
    updated_at = NOW()
WHERE asset_type IS DISTINCT FROM LOWER(TRIM(asset_type));

INSERT INTO asset_types (key, name)
VALUES
    ('sensor', 'Sensor'),
    ('gateway', 'Gateway'),
    ('meter', 'Meter'),
    ('controller', 'Controller'),
    ('device', 'Device'),
    ('other', 'Other')
ON CONFLICT DO NOTHING;

INSERT INTO asset_types (key, name)
SELECT DISTINCT
    LOWER(TRIM(asset_type)),
    INITCAP(REPLACE(TRIM(asset_type), '_', ' '))
FROM assets
WHERE NULLIF(TRIM(asset_type), '') IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS manufacturers (
    name TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_manufacturers_name_ci
    ON manufacturers (LOWER(name));

INSERT INTO manufacturers (name)
SELECT name
FROM (
    SELECT DISTINCT ON (LOWER(TRIM(manufacturer)))
        TRIM(manufacturer) AS name
    FROM assets
    WHERE NULLIF(TRIM(manufacturer), '') IS NOT NULL
    ORDER BY LOWER(TRIM(manufacturer)), TRIM(manufacturer)
) existing_manufacturers
ON CONFLICT (name) DO NOTHING;

UPDATE assets a
SET manufacturer = m.name,
    updated_at = NOW()
FROM manufacturers m
WHERE a.manufacturer IS NOT NULL
  AND LOWER(a.manufacturer) = LOWER(m.name)
  AND a.manufacturer IS DISTINCT FROM m.name;

CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tags_name_ci
    ON tags (LOWER(name));

CREATE TABLE IF NOT EXISTS asset_tags (
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (asset_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_asset_tags_tag_id
    ON asset_tags(tag_id);
