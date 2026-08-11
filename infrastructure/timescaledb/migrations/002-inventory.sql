CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ---------------------------------------------------------------------------
-- Rooms
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name TEXT NOT NULL,
    description TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ---------------------------------------------------------------------------
-- Gateways
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gateways (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name TEXT NOT NULL,

    type TEXT NOT NULL,

    version TEXT,
    ip_address INET,

    enabled BOOLEAN NOT NULL DEFAULT TRUE,

    last_seen_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ---------------------------------------------------------------------------
-- Extend existing sensors table
-- ---------------------------------------------------------------------------

ALTER TABLE sensors
    ADD COLUMN IF NOT EXISTS uuid UUID
        DEFAULT gen_random_uuid();

UPDATE sensors
SET uuid = gen_random_uuid()
WHERE uuid IS NULL;

ALTER TABLE sensors
    ALTER COLUMN uuid SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS
    idx_sensors_uuid
    ON sensors(uuid);


ALTER TABLE sensors
    ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE sensors
    ADD COLUMN IF NOT EXISTS manufacturer TEXT;

ALTER TABLE sensors
    ADD COLUMN IF NOT EXISTS model TEXT;

ALTER TABLE sensors
    ADD COLUMN IF NOT EXISTS firmware_version TEXT;

ALTER TABLE sensors
    ADD COLUMN IF NOT EXISTS enabled BOOLEAN
        NOT NULL DEFAULT TRUE;

ALTER TABLE sensors
    ADD COLUMN IF NOT EXISTS gateway_id UUID;

ALTER TABLE sensors
    ADD COLUMN IF NOT EXISTS room_id UUID;


-- Existing schema already contains name/mac_address/location.
-- location is kept temporarily for backward compatibility.


DO $$
BEGIN

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_sensors_gateway'
    ) THEN

        ALTER TABLE sensors
            ADD CONSTRAINT fk_sensors_gateway
            FOREIGN KEY (gateway_id)
            REFERENCES gateways(id)
            ON DELETE SET NULL;

    END IF;


    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_sensors_room'
    ) THEN

        ALTER TABLE sensors
            ADD CONSTRAINT fk_sensors_room
            FOREIGN KEY (room_id)
            REFERENCES rooms(id)
            ON DELETE SET NULL;

    END IF;

END
$$;


CREATE INDEX IF NOT EXISTS
    idx_sensors_gateway
    ON sensors(gateway_id);

CREATE INDEX IF NOT EXISTS
    idx_sensors_room
    ON sensors(room_id);
