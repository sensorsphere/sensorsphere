# NET-2 — OAuth credential foundation (work in progress)

NET-2 adds server-side encrypted OAuth credential storage and an authenticated manual collection endpoint. This is **not yet an automatic scheduler**, nor an authorization callback UI.

## Configuration and deployment gates

- Apply migration `088-netatmo-oauth-credentials.sql` through the standard SensorSphere migrations release process before deploying this API version.
- Configure `SENSORSPHERE_NETATMO_TOKEN_ENCRYPTION_KEY` as **64 hexadecimal characters** representing 32 random bytes. Keep it out of Git, logs, and browser responses; back it up securely alongside the database. Losing the key makes stored tokens unrecoverable. Rotation is not implemented yet.
- The API must receive this variable explicitly through Compose; no default key is provided. Do not enable a scheduler before validating the full database and OAuth lifecycle.
- `POST /api/v1/integrations/netatmo/token` accepts `{ "code": "..." }`, requires admin authorization, exchanges the code, encrypts and persists the access/refresh token, and responds only `{ "connected": true }`.
- `POST /api/v1/integrations/netatmo/telemetry/collect` requires admin authorization, takes no access token, loads/refreshes stored credentials and writes telemetry.
- Refresh is serialized with a PostgreSQL advisory transaction lock; the refresh token is updated in the same transaction. Refresh failure rolls back and does not overwrite credentials.

## Known gaps / gates

- NET-1 preview and legacy ingestion endpoints still accept caller-supplied access tokens; remove these before exposing to untrusted users.
- The existing `/authorize` route does not yet implement a CSRF-bound state parameter or callback validation. Implement before real OAuth accounts.
- PostgreSQL integration tests for encrypted credential persistence and refresh rollback are still required.
- A configurable scheduler, collection status/metrics, error backoff, and UI are pending.
- No automatic DEV/TEST1 deployment is authorized by this document.

## NET-2.2 PostgreSQL smoke (2026-10-13, DEV)

The manual `credentials.pg-smoke.mjs` script runs against the actual DEV PostgreSQL service and the Netatmo simulator. It creates a **session-local temporary table** named `netatmo_oauth_credentials`, shadowing the future permanent table, so it does not require applying migration 088 and never writes real credentials. Verified: missing credential handling, encrypted storage, valid access token reuse, refresh-token rotation, and preservation of encrypted credentials after failed refresh. Result: PASS.

For manual reruns, build the API and run this script in an isolated test container with PostgreSQL network access and DB_* configuration; it imports compiled `client.js`, `token.js` and `credentials.js` from the same directory. Do not commit generated access tokens, refresh tokens, or encryption keys. The smoke test deliberately does not print token values.

## NET-2.3 / NET-2.4 development checkpoint

Migration `089-netatmo-oauth-state.sql` stores hashed, one-time OAuth state scoped to the initiating user, with a ten-minute expiry. `/authorize` issues the state and `/token` requires `code` plus `state` before storing tokens. `/callback` deliberately rejects unauthenticated GET callbacks; the complete browser callback and session binding remain a production gate.

`SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS` defaults to `0` (off); valid nonzero values are 60 through 86400 seconds. The API collector uses a PostgreSQL advisory lock across instances and tracks attempts, success, errors, and consecutive failures. It has no exponential backoff or persisted execution history yet. Do not enable it in production before E2E validation and applying migrations 088 and 089.
