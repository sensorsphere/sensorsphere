-- ============================================================================
-- SensorSphere
-- Migration 004 - Unified Location Model
-- ============================================================================
--
-- Introduces the generic hierarchical Location model.
--
-- Existing rooms are preserved and copied to locations with the same UUID.
-- The legacy rooms table remains untouched during the transition.
--
-- ============================================================================


-- ============================================================================
-- Locations
-- ============================================================================

CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    parent_id UUID NULL,

    type TEXT NOT NULL,

    name TEXT NOT NULL,

    description TEXT NULL,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_locations_parent
        FOREIGN KEY (parent_id)
        REFERENCES locations(id)
        ON DELETE RESTRICT,

    CONSTRAINT chk_locations_type
        CHECK (
            type IN (
                'SITE',
                'BUILDING',
                'FLOOR',
                'ROOM',
                'ZONE',
                'AREA',
                'OTHER'
            )
        ),

    CONSTRAINT chk_locations_not_self_parent
        CHECK (
            parent_id IS NULL
            OR parent_id <> id
        )
);


-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_locations_parent_id
    ON locations(parent_id);

CREATE INDEX IF NOT EXISTS idx_locations_type
    ON locations(type);

CREATE INDEX IF NOT EXISTS idx_locations_name
    ON locations(name);


-- ============================================================================
-- Legacy Room Backfill
-- ============================================================================
--
-- Room UUIDs are intentionally reused as Location UUIDs.
--
-- This allows existing:
--
--   sensors.room_id
--   assets.room_id
--
-- to be mapped to locations later without changing identity.
--
-- ============================================================================

INSERT INTO locations (
    id,
    parent_id,
    type,
    name,
    description,
    metadata,
    created_at,
    updated_at
)
SELECT
    r.id,
    NULL,
    'ROOM',
    r.name,
    r.description,
    '{}'::jsonb,
    r.created_at,
    r.updated_at
FROM rooms r
ON CONFLICT (id)
DO NOTHING;


-- ============================================================================
-- Legacy Compatibility View
-- ============================================================================
--
-- This view is NOT currently used by the application.
--
-- It establishes the future compatibility contract that allows the physical
-- rooms table to eventually be retired without changing consumers expecting
-- room-shaped data.
--
-- ============================================================================

CREATE OR REPLACE VIEW legacy_rooms AS
SELECT
    id,
    name,
    description,
    created_at,
    updated_at
FROM locations
WHERE type = 'ROOM';


-- ============================================================================
-- Location Path
-- ============================================================================
--
-- Returns a human-readable hierarchy:
--
--   Maison > RDC > Cuisine
--
-- Cycles are guarded against using the visited UUID array.
--
-- ============================================================================

CREATE OR REPLACE FUNCTION location_path(
    location_uuid UUID
)
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
    WITH RECURSIVE hierarchy AS (

        SELECT
            l.id,
            l.parent_id,
            l.name,
            ARRAY[l.id] AS visited,
            1 AS depth

        FROM locations l

        WHERE l.id = location_uuid


        UNION ALL


        SELECT
            parent.id,
            parent.parent_id,
            parent.name,
            hierarchy.visited || parent.id,
            hierarchy.depth + 1

        FROM locations parent

        JOIN hierarchy
          ON parent.id = hierarchy.parent_id

        WHERE NOT parent.id = ANY(hierarchy.visited)
          AND hierarchy.depth < 100
    )

    SELECT string_agg(
        name,
        ' > '
        ORDER BY depth DESC
    )

    FROM hierarchy;
$$;
