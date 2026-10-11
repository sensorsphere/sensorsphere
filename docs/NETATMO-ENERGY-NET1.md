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
