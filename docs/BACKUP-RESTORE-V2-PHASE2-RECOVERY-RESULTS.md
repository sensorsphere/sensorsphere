# SensorSphere — Backup / Restore V2 — Phase 2 RECOVERY results

> **Date:** 2026-10-11
> **Status:** P2-ACC-001 PASSED; Phase 2 remains open pending P2-J failure injection
> **Source:** DEV
> **Target:** isolated RECOVERY
> **Restore module:** 0.2.0
> **Backup format:** 1

---

## 1. Scope

This report records the first real Backup / Restore V2 data-restore acceptance:

    DEV -> RECOVERY

No destructive restore was performed on TEST1.

The acceptance validates the Phase 2 data-restore path defined in
`BACKUP-RESTORE-V2-PHASE2.md`, including mandatory preflight, target safety
backup, quiesce, database restore, application/Mosquitto restore, migrations,
runtime health, equivalence checks and post-restore MQTT ingestion.

---

## 2. Source and target

### DEV source

    Install dir:       /home/ubuntu/sensorsphere
    Environment:       DEV
    Stack:             2026.10.07.1
    API:               1.72.0
    Frontend:          1.121.0
    Ingestion:         1.0.3
    Migrations:        87
    Backup tool:       0.1.0
    Backup format:     1

Fresh source Recovery Point:

    20261011T133418Z-5855a25c
    VERIFIED
    96,253,551 bytes

The source bundle was intentionally created with Backup 0.1.0 to prove that
Restore 0.2.0 continues to consume supported format-1 Phase 1 bundles.

### RECOVERY target

    Install dir:       /home/ubuntu/tmp/sensorsphere-recovery
    Environment:       RECOVERY
    Compose project:   sensorsphere-recovery
    Stack:             2026.10.11.1
    API:               1.73.0
    Frontend:          1.121.0
    Ingestion:         1.0.3
    Migrations:        87
    Backup/Restore:    0.2.0
    Web bind:          127.0.0.1:28080
    MQTT bind:         127.0.0.1:11883

RECOVERY used isolated Compose/data/database/Mosquitto/app state.

---

## 3. Source equivalence snapshot

The versioned query set is:

    apps/backup/internal/restore/equivalence.sql

Snapshot captured before the source backup:

    /home/ubuntu/tmp/sensorsphere-recovery-evidence/p2-acc-001-source-dev.json

Key values:

    device registry devices      26
    identities                   61
    registered entities          112
    monitoring checks            24

    device-agent slots            3
    monitoring-agent slots        6
    monitoring-check slots       24

    device agents                 3
    monitoring agents             6
    supervisor agents             3

    project todo sections        13
    project todos               129
    users                         2
    admins                        1

    observations          5,545,870
    earliest              2026-08-09T22:02:00Z
    latest                2026-10-11T02:57:00Z

Representative first-100 observation checksum:

    6ef248a528d5f489826aa4f5a7548b71

History configuration:

    version                       4
    views                         2
    tabs                         11
    graphs                       33
    bytes                    60,629
    SHA256
    a918d60e195e9ce5c9e4a3d1cb6e497be2facbfd8e21dbf130bbaa8eff561220

---

## 4. Bundle transfer and preflight

The source bundle was copied into the isolated RECOVERY repository.

Every entry in `checksums.sha256` validated successfully:

- app archive;
- database dump;
- globals;
- instance Compose;
- installation metadata;
- Stack Release metadata;
- manifest;
- Mosquitto archive.

Restore preflight result:

    Status.............. READY
    Mode................ data
    Backup ID........... 20261011T133418Z-5855a25c
    Source.............. DEV / SensorSphere [Dev]
    Source Stack........ 2026.10.07.1
    Source DB........... PostgreSQL 17 / TimescaleDB 2.21.3 / migration 87
    Target.............. RECOVERY / SensorSphere [RECOVERY]
    Target Stack........ 2026.10.11.1
    Target DB........... PostgreSQL 17 / TimescaleDB 2.21.3 / migration 87
    DB compatibility.... 72..87
    Mutation............ none

Generated confirmation phrase:

    RESTORE 20261011T133418Z-5855a25c INTO SensorSphere [RECOVERY]

---

## 5. Mandatory target safety backup

Before target mutation, the wrapper created and verified:

    Safety backup:
    20261011T133519Z-53bc81b5

    Status:
    VERIFIED

    Size:
    48,085,360 bytes

The safety backup remained available after restore success.

---

## 6. Restore execution

Restore run:

    restore-20261011T133531Z-09e16f5f

Final state:

    status                       SUCCESS
    phase                        COMPLETE
    sourceBackupId               20261011T133418Z-5855a25c
    safetyBackupId               20261011T133519Z-53bc81b5
    sourceStackVersion           2026.10.07.1
    targetStackVersionBefore     2026.10.11.1
    targetStackVersionAfter      2026.10.11.1
    restoredMigrationLevel       87

Restore sequence observed:

1. preflight repeated;
2. safety backup created and verified;
3. nginx/api/ingestion/Mosquitto quiesced;
4. target database sessions terminated;
5. target database recreated;
6. Timescale restore mode used;
7. single-process `pg_restore`;
8. Timescale post-restore cleanup;
9. `ANALYZE`;
10. app persistent data restored;
11. Mosquitto persistent data restored;
12. target Stack migrations executed;
13. runtime restarted;
14. health checks executed;
15. restore finalized from live database metadata.

Target Stack identity was preserved.

---

## 7. Migrations and runtime health

Target migration image inspected all migrations through 087.

Result:

    Found:    86
    Applied:   0
    Skipped:  86

The restored database was already at migration level 87.

Health checks passed:

    timescaledb    healthy
    api            healthy
    frontend       healthy
    nginx          healthy

Ingestion and Mosquitto restarted and remained running.

---

## 8. Source / restored equivalence

The same database query set and History configuration checks ran against
RECOVERY after restore.

Initial direct comparison:

    17 / 19 fields exactly equal

The only differences were:

    observationCount
      source: 5,545,870
      target: 5,545,919

    observationLatest
      source: 2026-10-11T02:57:00Z
      target: 2026-10-11T13:38:00Z

These were not restore differences. After runtime restart, restored Mosquitto /
ingestion resumed and produced 49 new observations.

Cutoff comparison at the source snapshot boundary proved:

    target observations <= 2026-10-11T02:57:00Z
      5,545,870

    target latest <= cutoff
      2026-10-11T02:57:00Z

Therefore the full source historical window is exactly present in RECOVERY.

The 49 post-cutoff rows were all produced by:

    source = ingestion-service

The representative historical checksum was identical, and all device,
identity, entity, check, slot, agent, project/admin and History configuration
checks were identical.

History file SHA256 was identical.

Evidence files:

    /home/ubuntu/tmp/sensorsphere-recovery-evidence/
      p2-acc-001-source-dev.json
      p2-acc-001-target-recovery.json
      p2-acc-001-equivalence.json
      p2-acc-001-preflight.txt
      p2-acc-001-restore.log

---

## 9. Controlled post-restore MQTT proof

A first probe using a non-qualified MQTT topic was intentionally not accepted
because the active collector subscribes to gateway-qualified topics:

    sensors/ble_gateway/+/sensor/+/state

The valid controlled proof then used the restored routing assignment:

    sensor UID:        d0_ca_52
    primary gateway:   ble-gateway-03
    metric:            temperature
    unique value:      77.211011

Published topic:

    sensors/ble_gateway/ble-gateway-03/sensor/temperature_d0_ca_52/state

Metric-routing evidence:

    decision = ACCEPT
    reason   = assigned_primary

Database evidence:

    time       2026-10-11T13:42:00Z
    value      77.211011
    source     ingestion-service
    sourceRef  d0_ca_52

Nginx -> API health returned:

    {"status":"ok","module":"api","version":"1.73.0"}

History API returned the controlled measurement:

    {
      "sensorUid": "d0_ca_52",
      "time": "2026-10-11T13:42:00.000Z",
      "temperature": 77.211011
    }

This proves:

    MQTT publish
      -> active gateway routing ACCEPT
      -> ingestion
      -> database
      -> Nginx/API History

The API evidence is stored in:

    /home/ubuntu/tmp/sensorsphere-recovery-evidence/
      p2-acc-001-mqtt-api.json

Note: Remote Desktop Commander command execution uses a network namespace where
`127.0.0.1` is not the Docker host loopback. Host-published port testing from
that command context therefore failed even while Docker reported the port
published and Nginx remained healthy. Nginx -> API was verified from inside the
RECOVERY Compose runtime, which is also the application routing path.

---

## 10. Acceptance result

P2-ACC-001:

    PASS

Validated:

- fresh DEV source backup;
- format-1 / Backup-0.1.0 compatibility with Restore 0.2.0;
- isolated RECOVERY target;
- mandatory preflight;
- mandatory target safety backup;
- writer quiesce;
- database restore;
- app-data restore;
- Mosquitto restore;
- migration validation;
- target Stack preservation;
- runtime health;
- source/restored equivalence;
- post-restore MQTT ingestion;
- API History query of a new restored-runtime measurement.

No TEST1 destructive restore was performed.

---

## 11. Remaining Phase 2 gate

Phase 2 is not yet globally accepted.

The next mandatory work package is:

    BR2-010 — P2-J failure injection

P0 scenarios still requiring real evidence include forced restore/database/file
failures, runtime health failures, interruption semantics and retry after an
interrupted/failed restore.

After BR2-010, the Phase 2 exit gate can be evaluated and BR2-011 can be closed
formally.
