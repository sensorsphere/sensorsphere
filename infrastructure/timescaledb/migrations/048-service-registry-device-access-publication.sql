-- ============================================================================
-- SensorSphere
-- Migration 048 - Publish Device access links into Service Registry
-- ============================================================================

ALTER TABLE device_access_links
  ADD COLUMN IF NOT EXISTS publish_as_service BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS published_service_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS published_service_class TEXT NULL,
  ADD COLUMN IF NOT EXISTS published_service_type TEXT NULL,
  ADD COLUMN IF NOT EXISTS published_service_description TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_device_access_links_publish_service
  ON device_access_links (publish_as_service, device_id)
  WHERE publish_as_service = TRUE;
