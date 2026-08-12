-- Add the unified location reference to assets.
-- room_id remains available for legacy compatibility.

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS location_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_assets_location'
  ) THEN
    ALTER TABLE assets
      ADD CONSTRAINT fk_assets_location
      FOREIGN KEY (location_id)
      REFERENCES locations(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_assets_location_id
  ON assets(location_id);
