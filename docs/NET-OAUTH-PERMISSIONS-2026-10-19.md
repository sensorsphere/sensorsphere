# Netatmo OAuth permissions — DEV validation

- Stack: 2026.10.19.1, API 1.76.12, Frontend 1.122.19, migrations unchanged (92).
- OAuth scopes are now retained inside the encrypted credential payload, not in plaintext database columns.
- Refresh responses preserve scope; if the upstream does not return a scope during refresh, an existing recorded scope is retained, otherwise status remains unknown.
- Admin-only connection listing displays read/write as granted, missing or unknown. An admin-only Verify scopes action forces a refresh using the existing advisory lock; tokens are never sent to the browser.
- Previous credentials without scope remain unknown until verification or reauthorization.
- Scope verification on 2026-10-19 09:59 UTC, using the SensorSphere credential store and upstream refresh:
  - SIM-01: read granted, write missing.
  - SIM-02: read granted, write granted.
- Docker builds: API and frontend PASS. Focused OAuth tests: 5/5 PASS.
- Post-deployment: API/frontend healthy; DEV HTTPS 200.
- No thermostat control commands sent. No TEST1 changes. No push.
- Pending: browser confirmation of indicators and button, then NET-CONTROL-2 through 4.
