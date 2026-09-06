BEGIN;

ALTER TABLE device_access_links
    ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT 'blue';

UPDATE device_access_links
SET color = 'blue'
WHERE color IS NULL OR BTRIM(color) = '';

COMMIT;
