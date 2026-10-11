# NET-1 initial read-only connector

NET-1.1 / NET-1.2 / NET-1.3 **preview**, not yet registry persistence.

Environment (API process):

- `SENSORSPHERE_NETATMO_BASE_URL=http://100.64.0.8:8091`
- `SENSORSPHERE_NETATMO_CLIENT_ID=sim-client`
- `SENSORSPHERE_NETATMO_CLIENT_SECRET=sim-secret` (development only)
- `SENSORSPHERE_NETATMO_REDIRECT_URI=http://127.0.0.1/callback`

Authenticated SensorSphere endpoints:

- `GET /api/v1/integrations/netatmo/status` — read-only status
- `GET /api/v1/integrations/netatmo/authorize` — authorization URL
- `POST /api/v1/integrations/netatmo/token` — `{ "code": "..." }`
- `POST /api/v1/integrations/netatmo/discovery/preview` — `{ "accessToken": "..." }`

The preview maps Netatmo modules to Device Registry bulk-import-shaped objects with stable module identities and relay-parent links. It does **not** write to the registry, persist OAuth tokens, or control thermostats. Mapping of device class/type and identity types requires validation against deployed reference dictionaries before persistence. Avoid putting tokens in logs. Simulator and official Netatmo contracts still differ. Configure only a trusted upstream; never expose the development simulator publicly.

Next: dedicated credential storage, callback flow, idempotent database upsert with validated reference values, integration tests against the simulator, and UI configuration/discovery.

## Registry import (NET-1.3)

- `POST /api/v1/integrations/netatmo/discovery/import` with `{ "accessToken": "..." }`, available **only to authenticated SensorSphere administrators**. When SensorSphere authentication is disabled, imports are denied.
- Performs a transaction with an advisory lock, validates existing `device_types`, inserts/updates devices by `NETATMO_MODULE_ID` identity (`homeId:moduleId`), and links thermostats to their relay when present.
- Repeated imports update existing devices instead of duplicating them. Any error rolls back the transaction.
- Relay uses registered `gateway`/`INFRASTRUCTURE`; thermostat uses `thermostat`/`IOT`; technology `http`. A dedicated Netatmo technology can be introduced later through a migration.
- **Not yet exercised against a running SensorSphere database.** Requires authenticated end-to-end test and a production deployment decision.

## NET-1.4 read-only telemetry preview

`POST /api/v1/integrations/netatmo/telemetry/preview` with `{ "accessToken": "..." }` retrieves `/api/homesdata` and `/api/homestatus?home_id=...` for each home. Returns room temperatures, setpoints and modes plus module heating, reachability and battery readings. Invalid and absent values are represented as null. This is a read-only preview: no automatic polling, metric ingestion or database writes yet.

## NET-1.5 telemetry ingestion (manual, administrator only)

`POST /api/v1/integrations/netatmo/telemetry/ingest` with `{ "accessToken": "..." }` reads the simulator and writes a timestamped sample into existing `assets`, `asset_metrics` and `observations`. Rooms and modules use distinct stable external IDs. Ingestion uses a transaction and advisory lock. No scheduler, stored credentials, UI, or DEV deployment is included. The generated telemetry assets are distinct from Device Registry devices; linking these objects remains pending. End-to-end database tests remain pending.
