-- Add a configurable presentation color to gateway types.

ALTER TABLE gateway_types
    ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#7950f2';

UPDATE gateway_types
SET color = CASE key
    WHEN 'ble_gateway' THEN '#228be6'
    WHEN 'generic' THEN '#7950f2'
    ELSE color
END
WHERE color IS NULL OR color = '' OR color = '#7950f2';
