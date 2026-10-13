-- NET-2: encrypted OAuth credentials; plaintext tokens must never be stored here.
CREATE TABLE IF NOT EXISTS netatmo_oauth_credentials (
  integration_id TEXT PRIMARY KEY,
  encrypted_tokens TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (length(encrypted_tokens) > 40)
);
