# NET-MULTI — DEV validation handoff (2026-10-15)

## Release candidate

Stack 2026.10.15.1, API 1.76.0, frontend 1.122.0, migrations 90.
The multi-instance collector is OFF by default (`SENSORSPHERE_NETATMO_MULTI_COLLECT_INTERVAL_SECONDS=0`).
The legacy Netatmo integration and its credential row remain separate.

## Before manual testing

- Build and publish the three images with the release tooling, or use the local built images with a reviewed compose override. **Do not assume GHCR tags are published.**
- Take a verified DEV backup, verify the migration plan, then update DEV through the standard install/update procedure. Do not deploy to TEST1.
- Ensure the API's existing `SENSORSPHERE_NETATMO_TOKEN_ENCRYPTION_KEY` remains unchanged.
- Keep both legacy and multi-instance schedulers disabled until manual collection is verified.
- The simulator OAuth redirect URI for both connections must be the public HTTPS callback:
  `https://dev.sensorsphere.f-colas.com/api/v1/integrations/netatmo/connections/callback`.
  Register that URI in each simulator's OAuth client configuration, where supported.
- Admin login must remain active in the browser used for the callback.

## Manual checks

1. Confirm existing SIM-01 remains visible and legacy telemetry unchanged.
2. Administration > Netatmo Connections: create `sim-01` and `sim-02` using the separate simulator endpoints and client credentials. The existing legacy SIM-01 credentials are **not automatically migrated** into `sim-01`; perform OAuth for the new connection.
3. Authorize SIM-01 and SIM-02 separately; confirm browser callback success and replay rejection.
4. Discover both; confirm independent `sim-home-01` and `sim-home-02` identities in Device Registry.
5. Collect both manually; confirm timestamps and telemetry do not cross between devices.
6. Disable SIM-02 and confirm it cannot collect; re-enable and retry.
7. Stop only SIM-02 temporarily and confirm SIM-01 collection continues; restore SIM-02.
8. Enable the multi-collector with an interval of 60 seconds only after manual checks; inspect per-connection status, then turn it off again.

## Known gates

- Full end-to-end browser OAuth and real PostgreSQL migration have not yet been executed for this release.
- No deletion or automatic migration of legacy credentials is performed.
- The connection management UI currently supports create/list/enable/disable, not edit/delete.
- No DEV deployment or GHCR push has been performed by this handoff.
