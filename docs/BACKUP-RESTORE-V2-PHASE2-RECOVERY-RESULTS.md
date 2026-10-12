# SensorSphere — Backup / Restore V2 — Phase 2 RECOVERY results

> **Date:** 2026-10-13
> **Status:** PHASE 2 RESTORE FOUNDATION ACCEPTED; P2-ACC-001 PASS; P2-J001..P2-J010 PASS
> **Source:** DEV
> **Target:** isolated RECOVERY
> **Restore module:** 0.2.0 acceptance baseline; 0.2.1 final hardening/tests
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

## 11. BR2-010 failure-injection acceptance

Phase 2 is not yet globally accepted, but three P0 P2-J scenarios now have real
RECOVERY-FI evidence.

### P2-J001 — forced pg_restore failure

Result:

    PASS

The restore engine was forced to fail inside `pg_restore`. The wrapper returned
exit class 50, did not print a success-looking summary, left writers stopped and
retained the verified safety backup.

Evidence:

    /home/ubuntu/tmp/sensorsphere-recovery-evidence/
      p2-j001-pg-restore-failure.log

### P2-J002..P2-J008 — remaining destructive failure classes

Result:

    PASS

Each scenario was executed against the disposable RECOVERY-FI target with a
fresh target reset between tests:

| Test | Injection | Observed result |
| --- | --- | --- |
| P2-J002 | CREATE DATABASE failure | FAILED / DATABASE_RESTORE / code 50; safety backup retained |
| P2-J003 | timescaledb_post_restore failure | FAILED / DATABASE_RESTORE / code 50; safety backup retained |
| P2-J004 | app-data extraction failure | FAILED / code 60; writers stopped; safety backup retained |
| P2-J005 | migration failure | FAILED at MIGRATIONS; safety backup retained |
| P2-J006 | API health failure | FAILED at HEALTH_CHECK; no false SUCCESS |
| P2-J007 | Nginx health failure | FAILED at HEALTH_CHECK; no false SUCCESS |
| P2-J008 | ENOSPC during app-data extraction | FAILED / code 60; safety backup retained |

Evidence:

    /home/ubuntu/tmp/sensorsphere-recovery-evidence/
      p2-j002-db-create-failure.log
      p2-j003-post-restore-failure.log
      p2-j004-app-data-failure.log
      p2-j005-migration-failure.log
      p2-j006-api-health-failure.log
      p2-j007-nginx-health-failure.log
      p2-j008-enospc-failure.log

### P2-J009 — process killed mid-restore

Result:

    PASS

A restore run was started against the isolated `RECOVERY-FI` target and the
restore container was killed with exit 137 while the recorded phase was:

    DATABASE_RESTORE

The wrapper's interruption fallback then converted the active run to:

    status      INTERRUPTED
    phase       INTERRUPTED
    failedStep  RESTORE_ENGINE
    errorCode   80

The source backup remained:

    20261011T133418Z-5855a25c

The retained safety backup was:

    20261012T063900Z-57de37a3

All target writers remained stopped and the safety backup was re-verified after
the interruption.

Evidence:

    /home/ubuntu/tmp/sensorsphere-recovery-evidence/
      p2-j009-interrupted-restore.log
      p2-j009-interrupted-state.json

The test exposed and fixed one additional retry-safety defect: a partially
restored database could still answer metadata queries with migration level 0,
which previously caused preflight to label the target `READY` and omit the
prior safety-backup linkage. Preflight now evaluates failed/interrupted restore
state independently from target DB metadata availability. The same interrupted
target is therefore reported as:

    Target DB state      DEGRADED_RETRY
    Retry safety backup  20261012T063900Z-57de37a3

Evidence:

    /home/ubuntu/tmp/sensorsphere-recovery-evidence/
      p2-j009-retry-preflight-after-fix.txt

### P2-J010 — retry after failed/interrupted restore

Result:

    PASS

Two recovery paths have now been exercised:

- retry after an injected `pg_restore` failure;
- retry after a real container kill during `DATABASE_RESTORE`.

For the interrupted case, the retry re-verified and reused the original safety
backup instead of creating a new backup from the degraded target:

    20261012T063900Z-57de37a3

The retry completed the restore, migrations, runtime restart and health checks,
then finalized with:

    status                  SUCCESS
    phase                   COMPLETE
    restoredMigrationLevel  87

Evidence:

    /home/ubuntu/tmp/sensorsphere-recovery-evidence/
      p2-j010-retry-after-pg-restore-failure.log
      p2-j010-retry-after-interruption.log

### BR2-010 result

BR2-010 is complete.

    P2-J001..P2-J010: PASS

Failure semantics were exercised for database creation, pg_restore,
Timescale post-restore cleanup, app-data extraction, migration, API health,
Nginx health, ENOSPC, process interruption and safe retry.

---

## 12. Phase 2 P0/P1 acceptance matrix

All mandatory P0 and P1 cases in P2-A through P2-J are covered by live
RECOVERY/RECOVERY-FI execution, Docker-based module tests, or an explicit
non-applicable condition documented below.

| Group | Result | Evidence summary |
| --- | --- | --- |
| P2-A Restore CLI safety | PASS | Live refusal/cancel/preflight evidence plus config/compatibility tests |
| P2-B Pre-restore safety backup | PASS | Main restore safety backup; forced verify failure; forced ENOSPC before quiesce |
| P2-C Database sequence | PASS | Main restore; failure injection; strict target-DB test; live migration-86 -> 87 restore |
| P2-D Application data | PASS | Exact History restore; archive/path tests; replacement tests; live empty-app restore |
| P2-E Mosquitto | PASS | Main mosquitto.db restore; corrupt archive refusal; live no-mosquitto.db continuity |
| P2-F Target preservation | PASS | Target instance/environment/ports/project/install dir/Stack preserved; source secrets excluded |
| P2-G Migration/runtime | PASS | Migration exit 0/level 87; Timescale/API/Frontend/Nginx healthy; ingestion/Mosquitto running |
| P2-H Data equivalence | PASS | Source/target snapshots, cutoff comparison, History SHA/checksum, pve-1 and lifecycle checks |
| P2-I Post-restore ingestion | PASS | MQTT -> routing -> ingestion -> DB -> API; pre-backup History API read; authenticated agent heartbeat |
| P2-J Failure injection | PASS | P2-J001 through P2-J010 real RECOVERY-FI evidence |

Additional explicit evidence produced during final gate closure:

    p2-a-negative-smoke.txt
    p2-a003-corrupt-refusal.txt
    p2-a004-unverified-refusal.txt
    p2-a006-a011-cancel-after-fix.txt
    p2-a009-ambiguous-data-root.txt
    p2-a012-preflight.json
    p2-b002-safety-verify-failure.log
    p2-b003-safety-enospc.log
    p2-c016-forward-migration.log
    p2-d006-e002-empty-persistent.log
    p2-e003-corrupt-mosquitto.txt
    p2-i005-i006-api-heartbeat.json
    p2-phase2-final-gate.txt

Notable P1 proofs:

- P2-A011: EOF/cancel exits 40, prints an explicit cancellation message and
  leaves restore state byte-for-byte unchanged.
- P2-A012: JSON preflight returns READY and `mutatesTarget=false`.
- P2-B004/B005: safety backup manifest identifies the target-before-restore and
  the verified COMPLETE bundle remains retained after success.
- P2-C009: ANALYZE completed in the successful database sequence.
- P2-C016: a migration-86 source bundle was restored to a migration-87 target;
  migration 087 was applied once and the final run completed SUCCESS at level 87.
- P2-D006/P2-E002: a valid fixture with empty app data and no mosquitto.db
  restored successfully with defined empty continuity state.
- P2-I005: an observation from 2026-08-09 was read through the History API
  after restore.
- P2-I006: a temporary monitoring agent sent an authenticated heartbeat,
  last_seen_at advanced, online=true was observed, and the fixture agent was
  deleted afterward.

Applicability notes:

- P2-E006 is P2 priority and is not a mandatory Phase 2 exit-gate test.
- P2-F003 public URL preservation is structurally covered by data-restore write
  boundaries: the target .env/instance configuration is never replaced. The
  acceptance RECOVERY target has auth disabled and therefore no public URL to
  compare live.
- P2-H013 lifecycle/exclusion data was empty at source and remained empty after
  restore. No non-empty lifecycle fixture existed in the accepted DEV source.
- P2-H014 is covered by the source/target user/admin counts (2 users, 1 admin).
- P2-H015 is covered by preserved Device/Monitoring/Supervisor agent records and
  slot counts in the equivalence snapshot.

---

## 13. Phase 2 exit gate

Result:

    ACCEPTED

The Phase 2 Restore Foundation exit criteria are satisfied:

- all mandatory P0 P2-A through P2-J tests pass;
- all mandatory P1 tests pass or have an explicit applicability note;
- P2-ACC-001 DEV -> clean RECOVERY passes;
- the verified target safety backup remains retained;
- database, application and Mosquitto restore semantics pass;
- target identity and target Stack are preserved for data restore;
- migrations and runtime health checks pass;
- post-restore MQTT ingestion is proven;
- FAILED and INTERRUPTED failure semantics are proven;
- safe retry from failed/interrupted targets is proven;
- no Docker socket is permanently mounted;
- no destructive TEST1 restore was used for acceptance.

Main final-gate evidence:

    /home/ubuntu/tmp/sensorsphere-recovery-evidence/
      p2-phase2-final-gate.txt

BR2-010:

    DONE / PASS

BR2-011:

    ACCEPTED

P2-ACC-001:

    PASS

---

## 14. Follow-up

BR2-012 remains intentionally open:

    Full restore foundation

It follows the accepted data-restore foundation and is not claimed complete by
this acceptance. Its scope remains exact Stack Release recovery, reconstruction
of a new installation without source-checkout dependency, and deployed-instance
backup recovery into a new installation.
