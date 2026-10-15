# Netatmo Energy — multi-connection implementation plan

Status: design baseline; implementation and validation pending. Target: DEV first. Do not touch TEST1.

## Current behavior and preservation requirements

- One global Netatmo upstream configuration (SENSORSPHERE_NETATMO_*).
- One encrypted credential row, integration_id=netatmo-energy.
- OAuth states are one-time, hashed, bound to initiating user, but not to a connection.
- One automatic collector and advisory lock.
- Existing SIM-01 OAuth credentials must remain readable, without overwrite.
- Existing discovery identities and telemetry must remain intact.
- SIM-01 and SIM-02 are independent simulator processes and OAuth issuers.

## Proposed data model

- netatmo_connections: stable connection id, display name, base URL, OAuth client id,
  encrypted client secret, redirect URI, enabled, created/updated timestamps.
- netatmo_oauth_credentials: continue using integration_id as per-connection key
  while preserving the legacy netatmo-energy row for SIM-01.
- netatmo_oauth_states: add nullable connection_id, bind it to the hashed state
  and authenticated initiator; consume exactly once.
- Do not expose OAuth client secrets or tokens in GET responses or logs.
- Connection deletion must be explicit, authorized, and never cascade to registry assets.

## API and behavior

- Admin-only list/create/update/disable connection endpoints with strict validation.
- Per-connection authorize, callback, status, discovery preview/import,
  telemetry preview/collect and automatic collection.
- OAuth callback must resolve its connection from the one-time state record;
  never trust a caller-supplied connection id on callback.
- Per-connection refresh serialization, collector locks, metrics and error isolation.
- Keep legacy routes and env configuration functional until migration verified.
- No arbitrary upstream HTTP URLs: enforce existing loopback/Tailnet rules.
- Ensure discovery identities remain globally unique across connections.

## Acceptance tests

1. Existing SIM-01 credentials and collector remain functional after migration.
2. Add SIM-02 with 100.64.0.8:8092 and separate client credentials.
3. OAuth callback for SIM-02 does not change SIM-01 credential ciphertext.
4. Concurrent discovery and telemetry preserve both homes and devices.
5. One simulator offline/401/429 does not block collection from the other.
6. Wrong OAuth state, mismatched initiator, replay, and cross-connection callback fail.
7. Restart API and confirm encrypted credentials survive and refresh correctly.
8. Admin UI shows both connection statuses, never tokens or secrets.
9. Run DB migration and automated tests in DEV; manual TEST1 only with approval.

## Release requirements

Increment affected module versions and stack release, build/test via Docker,
commit with explicit paths. Preserve untracked .env-save.
