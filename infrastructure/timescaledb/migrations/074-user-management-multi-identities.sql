ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_bootstrap_admin BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_identities
  ADD COLUMN IF NOT EXISTS provider_tenant TEXT NULL;

ALTER TABLE user_identities
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ NULL;

ALTER TABLE user_identities
  DROP CONSTRAINT IF EXISTS user_identities_user_id_provider_key;

CREATE INDEX IF NOT EXISTS idx_user_identities_user_id
  ON user_identities(user_id);

CREATE TABLE IF NOT EXISTS auth_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT NULL,
  action TEXT NOT NULL,
  target_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_audit_log_created
  ON auth_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_audit_log_target
  ON auth_audit_log(target_user_id, created_at DESC);
