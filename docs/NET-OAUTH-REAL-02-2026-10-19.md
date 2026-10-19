# NET-OAUTH-REAL-02 — Coherent OAuth and Netatmo collection status

## Evidence
- Real `homefcs-01` OAuth credentials persisted and `read_thermostat` granted, `write_thermostat` intentionally missing (real device read-only).
- Collection error `Netatmo authorization required` was recorded before OAuth success. It remained visible while collector waited for next scheduling window.
- Immediate read-only collection against real Netatmo returned `/api/homesdata` with one home/room and relay + thermostat; `/api/homestatus` replied HTTP 200, status `ok`, but body home had only id and errors array containing code 2. No actual telemetry was available. No equipment identifiers or secret values output. No write requests.
- Public Netatmo user support discussions have documented code 2 in homestatus with incomplete home response; this is not sufficient to conclude credentials are invalid or that Netatmo's servers are currently down.

## Fix
- On successful OAuth callback, clear stale collection error and make automatic collection eligible immediately instead of waiting up to five minutes.
- On an incomplete homestatus response, preserve a concise, safe actionable error with numeric Netatmo device error codes; never claim collection succeeded or invent readings.
- Existing `Authorized`, `Read Granted` and `Write Missing` badges remain semantically correct, with write deliberately unavailable on real connections.

## Validation
- API tests 11/11 PASS; API build PASS; DEV only. No TEST1, push, or physical thermostat commands.
