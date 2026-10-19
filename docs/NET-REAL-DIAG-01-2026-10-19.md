# NET-REAL-DIAG-01 — Real Netatmo partial collection and diagnostics

## Endpoint responsibilities
- `/api/homesdata`: topology (homes, rooms, relay NAPlug, thermostat NATherm1), bridging, schedules and programmed setpoints, but not reliably the current measured room temperature or active applied setpoint.
- `/api/homestatus`: observed dynamic telemetry (measured temperature, current thermostat setpoint, availability, heating demand etc.). Necessary for the current SensorSphere telemetry implementation, but **not** for importing equipment via Discovery.
- A programmed timetable temperature must never be substituted for a measured temperature.

## Functional behavior
- Parse errors at per-home/per-module granularity; include only home ordinal index, module type and numeric error code in diagnostics — never module IDs, user profile, home identifiers, location, tokens or HTTP body.
- Preserve readings from healthy homes even if a different home's homestatus is incomplete or fails at the module level.
- If no dynamic observation is returned, mark collection `partial` with 0 observations and retain previous last-success timestamp. Do not fabricate or carry forward observations as freshly collected data.
- Record every new automatic attempt as `ok`/`partial`/`failed` with observation count and sanitized diagnostic details in persistent migration 094 table `netatmo_collection_diagnostics`.
- Add admin-only endpoint GET `/api/v1/integrations/netatmo/connections/:id/collection-diagnostics`, last 20 attempts, and a Diagnostics button in Netatmo Connections.
- Manual collection also reports `partial` when appropriate and records diagnostic data without claiming success.
- Discovery remains independently available through existing import workflow, even when telemetry is unavailable.

## DEV validation
- Stack 2026.10.19.11; API 1.76.19; frontend 1.122.27; migration 94 applied.
- Production API/frontend builds PASS; 13/13 selected tests PASS, including a multi-home partial failure.
- Real `homefcs-01` read-only collection: 0 observations, `partial`, `home 1 / NAPlug: code 2`, no last-success set. Topology already discovered: 2 devices; real control disabled.
- SIM-01: 8 observations, `ok`. SIM-02: 8 observations, `ok`.
- API/frontend healthy, HTTPS 200. No thermostat commands, no TEST1, no push.

## Limitations
- This patch cannot make Netatmo deliver missing `/homestatus` data; code 2 is also reproduced via Netatmo's official API tester.
- Existing past attempts prior to migration 094 are not backfilled; only newly recorded attempts are in the diagnostic history.
- Detailed measurement availability remains dependent on Netatmo's real API. Physical heating write authorization stays disabled.
