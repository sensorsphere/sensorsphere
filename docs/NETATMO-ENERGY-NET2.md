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

## OAuth browser callback follow-up

The callback at `GET /api/v1/integrations/netatmo/callback` now requires an existing admin session, validates `code` and `state`, consumes the state once, exchanges the code, and stores encrypted credentials. It returns a minimal confirmation page with no token values and `Cache-Control: no-store` / `Referrer-Policy: no-referrer`. Configure `SENSORSPHERE_NETATMO_REDIRECT_URI` to the public HTTPS callback URL registered with Netatmo. Authentication cookies must be available on the callback origin; otherwise the request is denied. Simulator end-to-end and HTTPS deployment validation remain mandatory before enabling the scheduler.

## NET-2.3/2.4 isolated PostgreSQL E2E smoke results (DEV)

- `oauth-callback.pg-smoke.mjs`: simulator OAuth authorization redirect, state round-trip, encrypted token persistence, replay rejection and expired-state rejection. Uses PostgreSQL session-local temporary tables shadowing the credentials and state tables; no persistent OAuth writes. PASS.
- `collector.pg-smoke.mjs`: collector disabled by default, PostgreSQL advisory-lock acquisition/release, failed collection status and retryable lifecycle with intentionally absent encryption key. Does not ingest telemetry. PASS.

Run these scripts using a disposable API container with the compiled Netatmo module directory bind-mounted read-only and existing DEV database/simulator network configuration. These tests do **not** prove scheduled ingestion into persistent telemetry, concurrent multi-instance behavior, browser cookie callback across public HTTPS, or migration deployment. Keep the scheduler disabled until those are validated.

## NET-2.4 concurrency unit coverage

Additional unit tests verify that an instance skips collection when PostgreSQL reports an already-held advisory lock, releases its connection, and does not record a false failure; and that an in-flight collection prevents a second concurrent invocation. These tests do not yet validate real multi-process scheduling or telemetry ingestion rollback in a dedicated isolated database.

## Real PostgreSQL collector lock contention

`collector-concurrency.pg-smoke.mjs` opens separate PostgreSQL sessions. One acquires the Netatmo collector advisory lock; the other invokes `collect()` and must skip without an error, then the first releases the lock. PASS on DEV PostgreSQL with no persistent writes. This is a real inter-session test, but not yet an end-to-end multi-process timer/ingestion test.

## Isolated ingestion and timer validation

`collector-ingest.pg-smoke.mjs` completed simulator authorization, encrypted token persistence, Netatmo telemetry fetch, collector execution and insertion of 6 observations for 1 asset into session-local PostgreSQL temporary tables. PASS; no persistent assets, metrics, links or observations modified. `collector.test.ts` also tests a configured 60-second scheduler using a mocked clock, including failure reporting and stopping the timer; full Netatmo API test suite: 16/16 PASS. Real wall-clock periodic collection in a disposable deployment, production migration rollout, and public HTTPS browser callback remain unproven; scheduler must remain off by default.

## Real wall-clock scheduler E2E (disposable API container)

`collector-timer.pg-smoke.mjs` starts the collector with a real 60-second interval, waits 65 seconds without calling `collect()` manually, and verifies that the simulator telemetry is ingested. PASS (66-second run): 1 asset and 6 observations in session-local PostgreSQL temporary tables. The disposable API container used the compiled feature module bind-mounted read-only and the existing DEV database network, without persistent table changes. This validates the real timer path, but does not validate production migrations, a public HTTPS callback, or long-running restart/retry behavior.

## Preview authorization hardening

Both `POST /telemetry/preview` and `POST /discovery/preview` now require an admin session, consistent with other Netatmo endpoints. Fastify injection tests verify 403 for non-admin and non-403 for admin before token parsing. Netatmo TypeScript compilation and 17/17 tests PASS. No deployment or persistent database changes.

## Migrations 088/089 on disposable PostgreSQL 17

Validated both migration files on a disposable `postgres:17-alpine` container attached to the database Docker network, with no published ports or persistent volume. Ran both SQL files twice with `psql -v ON_ERROR_STOP=1`; initial creation and repeat idempotency PASS. Inserted and counted one dummy credential and one dummy OAuth state, PASS. Stopped the `--rm` test container afterwards. No migrations applied to persistent DEV/TEST1 databases. This does not replace a full stack migration-runner upgrade test.

## Authenticated callback HTTP integration test

`authenticated-callback.test.ts` installs the actual SensorSphere auth guard into Fastify, enables authentication, and exercises the admin-session cookie path through `GET /authorize` and `GET /callback`. It verifies unauthenticated 401 responses, a successful admin callback, encrypted token storage, no token leakage in HTML, no-store/referrer headers and OAuth-state replay rejection. Session DB queries and upstream token exchange are mocked, so this is **not** a real browser/HTTPS deployment test. TypeScript and 18/18 Netatmo API tests PASS. The final public HTTPS test requires a deployed callback URI, an authenticated admin browser session and explicit rollout approval.

## Official migration runner integration and release gate

Ran the actual `tools/database/sensorsphere-migrate.sh` against a disposable PostgreSQL 17 container, with only migrations 088/089 copied into a disposable runner container. First pass: applied 2, skipped 0, tracked versions 88 and 89 in `public.schema_migrations`. Second pass: applied 0, skipped 2. PASS. Both disposable containers were stopped with `--rm`; DEV/TEST1 persistent databases unchanged.

**Release blocker:** `apps/api/src/compatibility.ts` currently declares `DATABASE_MAX_MIGRATION_LEVEL=87`, while the source migrations reach 89 and `infrastructure/timescaledb/migrations/VERSION` is still 87. Before a deployable stack release, synchronize the API compatibility maximum, migration module version, release metadata, and verify stack-release validation. No production release version has been assigned yet. Public HTTPS OAuth callback remains untested with a real browser session.

## Prepared Stack Release 2026.10.14.1 (source validation only)

Prepared API 1.75.0 with database compatibility 72..89, migrations module version 89, and source-aligned schema-4 stack manifest `releases/stacks/2026.10.14.1.yaml`. Frontend 1.121.0, ingestion 1.0.3, nginx 1.0.0, backup 0.2.1. `scripts/validate-stack-release.sh --source` PASS; Docker-based API TypeScript compile and 18/18 Netatmo tests PASS. This is **not** a published stack: component images, release bundle, and deployment remain outstanding. The existing unrelated local `docker-compose.yml` change is intentionally excluded.
