# SensorSphere — Backup / Restore V2 — Phase 2 Restore Foundation

> **Status:** implementation-ready specification
> **Prepared:** 2026-10-07
> **Target module:** Backup / Recovery 0.2.0
> **Primary acceptance environment:** RECOVERY
> **Related documents:** `BACKUP-RESTORE-V2.md`, `BACKUP-RESTORE-V2-PHASE1.md`, `BACKUP-RESTORE-V2-TEST-PLAN.md`

---

## 1. Objective

Phase 2 turns the Phase 1 Recovery Bundle into a proven restore mechanism.

The phase is not accepted because a restore command exists. It is accepted only
after a real DEV Recovery Bundle is restored into an isolated RECOVERY instance,
the restored runtime becomes healthy, selected data is proven equivalent, and a
new MQTT sample can be ingested and queried.

Phase 2 must satisfy the P2-A through P2-J tests and P2-ACC-001 in
`BACKUP-RESTORE-V2-TEST-PLAN.md`.

No destructive restore is performed on TEST1 as part of initial Phase 2
acceptance.

---

## 2. Non-negotiable architecture decisions

### 2.1 Same versioned recovery image

Restore extends the existing Core module:

    ghcr.io/sensorsphere/sensorsphere-backup

Target first Phase 2 version:

    0.2.0

There is no separate restore product and no restore implementation in
`install.sh`.

The existing Backup V2 0.1.0 Recovery Bundle format 1 remains a supported restore
input unless an explicit compatibility check rejects a particular bundle.

### 2.2 Backup service remains read-only

The existing Compose service:

    backup

keeps its Phase 1 security properties:

- no published ports;
- no Docker socket;
- source app/Mosquitto mounts remain read-only;
- instance files remain read-only;
- backup repository/state access remains constrained.

Phase 2 must not weaken the backup service merely to make restore convenient.

### 2.3 Separate one-shot restore service

The Stack bundle gains a second one-shot service using the same image:

    restore

Profile:

    restore

Conceptual mounts:

    /instance          read-only
    /backups           read-only
    /restore-state     read-write
    /target/app        read-write
    /target/mosquitto  read-write

Network:

    database

The restore service has:

- no published ports;
- no Docker socket;
- no dependency on API/frontend availability;
- PostgreSQL client access through the database network;
- root inside the one-shot container only where filesystem ownership recovery
  requires it.

The backup repository itself is read-only during restore. A restore may never
modify the Recovery Bundle it is consuming.

### 2.4 Small host orchestration wrapper

A destructive restore cannot be safely orchestrated solely from a container
that deliberately has no Docker socket.

The distribution therefore delivers a very small host-side wrapper, separate
from `install.sh`.

Planned bundle entry point:

    ./restore.sh

The wrapper is orchestration only. It may:

- discover the target installation;
- invoke restore preflight in the versioned recovery image;
- create/verify the target safety backup through the existing backup service;
- stop and start known SensorSphere Compose services;
- invoke the restore service;
- invoke migrations;
- perform Compose health checks;
- print the final restore report.

It must not implement database/archive restore logic itself.

---

## 3. Restore modes

### 3.1 Data restore

Canonical user intent:

    ./restore.sh --data <backup-id>

Engine-level conceptual command:

    sensorsphere-backup restore --data <backup-id>

Data restore restores SensorSphere data into an existing target installation.

It preserves target-specific configuration, including:

- `SENSORSPHERE_ENVIRONMENT`;
- instance name;
- public URL;
- published ports;
- Compose project;
- install directory;
- DATA_ROOT;
- target authentication/OIDC secrets;
- target host-specific settings.

The source instance/release identity remains visible in the restore report but
does not overwrite target identity.

Initial Phase 2 acceptance centers on data restore.

### 3.2 Full restore

Canonical intent:

    ./restore.sh --full <backup-id>

Full restore is for reconstruction of a lost instance/host.

It may reconstruct runtime files from the Stack Release recorded in the backup
manifest plus backed-up instance metadata and persistent data.

Implementation order within Phase 2:

    P2.1  data restore
    P2.2  full restore reconstruction

The destructive database/file restore engine is shared by both modes.

---

## 4. CLI contract

### 4.1 Preflight

A non-mutating preflight is mandatory and machine-readable.

Conceptual forms:

    docker compose --profile restore run --rm restore       restore --data <backup-id> --preflight

    docker compose --profile restore run --rm restore       restore --data <backup-id> --preflight --json

Preflight never:

- stops services;
- drops a database;
- overwrites target files;
- writes to the selected Recovery Bundle.

It validates everything that can be proven before mutation.

### 4.2 Apply

The host wrapper performs the destructive workflow only after successful
preflight and safety backup.

Interactive mode requires a generated confirmation phrase containing both
backup and target identity.

Conceptual example:

    RESTORE 20261006T215225Z-65f854b6 INTO SensorSphere-Recovery

A simple `yes` is insufficient.

Non-interactive restore requires an explicit unattended flag plus the exact
confirmation token. Absence of either refuses the operation.

### 4.3 Exit classes

Initial stable classes:

    0   success
    2   CLI / argument error
    10  configuration / target identity error
    20  bundle verification / compatibility error
    30  safety-backup failure
    40  quiesce / orchestration failure
    50  database restore failure
    60  app/Mosquitto restore failure
    70  migration / runtime validation failure
    80  interrupted / cleanup-incomplete restore

JSON mode returns the same semantic code in structured output.

---

## 5. Preflight contract

Before any mutation, preflight must prove:

### Recovery Bundle

- requested backup ID is explicit and exists;
- `COMPLETE` marker exists;
- manifest format is supported;
- all SHA256 checksums pass;
- database dump catalog is readable;
- app archive is readable;
- Mosquitto archive is readable when included;
- no archive contains absolute paths or `..` traversal;
- bundle status is VERIFIED by current verification rules.

### Source identity

Display/capture:

    backup ID
    source instance
    source environment
    source host
    source Stack Release
    source DB migration level
    source PostgreSQL version
    source TimescaleDB version
    source component versions

### Target identity

Display/capture:

    target instance
    target environment
    target host
    target install directory
    target Compose project
    target DATA_ROOT
    target Stack Release
    target DB migration compatibility range

The target is derived from the actual installation, not supplied as an
arbitrary database hostname/path by the caller.

### Cross-instance safety

Preflight fails if:

- target install directory cannot be resolved canonically;
- DATA_ROOT is missing/ambiguous;
- Compose project cannot be resolved;
- target database service does not belong to that Compose project;
- a RECOVERY-only invocation targets DEV/DIT/TEST1;
- source and target identity are unexpectedly the same for an isolated recovery
  test.

A deliberate same-instance restore will require an explicit future policy and
is not part of initial Phase 2 acceptance.

---

## 6. Version compatibility policy

Phase 2 must reason about three independent dimensions.

### PostgreSQL

Initial 0.2.0 policy:

    target PostgreSQL major must equal source PostgreSQL major

Current accepted baseline:

    17

Major-version drift is rejected during preflight.

### TimescaleDB

Initial 0.2.0 acceptance uses the same TimescaleDB release as the source Stack.

For broader compatibility, the engine records source and target versions and
fails closed unless the version combination is explicitly supported.

No generic "ignore Timescale version" flag is included in the first release.

### SensorSphere migrations

Let:

    sourceLevel = migration level stored in the backup
    targetMin   = target API databaseMinMigrationLevel
    targetMax   = target API databaseMaxMigrationLevel

Rules:

- sourceLevel > targetMax: reject;
- sourceLevel < targetMin: reject unless a documented upgrade path explicitly
  supports it;
- sourceLevel within target range: restore source DB, then run the target
  migration image to migrate forward when needed;
- target Stack older than the source backup is rejected by default.

The compatibility decision and rationale are included in preflight JSON.

---

## 7. Mandatory target safety backup

Every destructive data restore begins with a new target Recovery Point.

Sequence:

    preflight target/source
        |
        v
    create target safety backup
        |
        v
    verify target safety backup
        |
        v
    only then allow quiesce/mutation

The safety backup is created using the existing Phase 1 backup service and is
labelled so it is unmistakable, for example:

    pre-restore safety backup for <source-backup-id>

The restore run records:

    safetyBackupId
    safetyBackupCompletedAt
    safetyBackupSizeBytes

If create or verify fails, restore stops before target mutation.

A successful or failed restore never prunes this safety backup immediately.
Retention policy for safety backups is conservative and independent of normal
daily pruning in Phase 2.

---

## 8. Quiesce sequence

The host wrapper stops external access/writers before database replacement.

Initial sequence:

    stop nginx
    stop api
    stop ingestion-service
    stop mosquitto

Frontend is static and may remain running, but it is no longer externally
reachable after nginx stops.

Keep running:

    timescaledb

The wrapper confirms the writer containers are stopped before the database drop.

If quiesce cannot be proven, restore aborts.

---

## 9. Database restore sequence

Inside the restore service:

1. validate selected bundle again immediately before mutation;
2. confirm the target database identity from environment/config;
3. terminate sessions only for the target SensorSphere database;
4. drop only the target database;
5. recreate it with the expected owner;
6. enable TimescaleDB extension;
7. enter Timescale restore mode with the supported pre-restore function;
8. run single-process `pg_restore`;
9. ensure Timescale post-restore cleanup is attempted even when pg_restore
   fails after pre-restore mode began;
10. run `ANALYZE`;
11. report restored migration level and database metadata.

Parallel pg_restore is intentionally prohibited in initial Phase 2.

The engine must never accept an arbitrary caller-provided database name that
bypasses the installation-derived target identity.

---

## 10. Persistent application-data restore

Data-restore mode restores only persistent application data from:

    app/app-data.tar.zst

It does not replace target:

- `.env`;
- Compose file;
- installation metadata;
- target Stack Release manifest;
- OIDC secrets;
- public URL / ports;
- install directory identity.

Archive validation occurs before overwrite.

Extraction uses a staging directory on the target filesystem.

Conceptual flow:

    validate archive paths
      -> extract staging
      -> validate staging
      -> replace target app data
      -> restore ownership/mode

The pre-restore safety backup remains the rollback source if filesystem restore
later fails.

---

## 11. Mosquitto restore

Mosquitto must be stopped before replacing persistence.

When the source archive is present:

    validate
    -> extract staging
    -> replace persistence
    -> restore ownership/mode

When the source backup intentionally omitted Mosquitto data, restore behavior is
explicit in preflight and no stale source state is invented.

Mosquitto is restarted only during complete stack restart after database and
file restore phases succeed.

---

## 12. Migrations and target Stack preservation

Data restore preserves the target Stack.

After the source database is restored:

    docker compose run/execute migrations for target Stack

Expected:

- migration container exits 0;
- resulting schema level is supported by target API;
- target Stack version does not silently change because of source metadata.

Source `instance/docker-compose.yml`, `installation.json` and
`stack-release.yaml` remain evidence inside the backup/report; they are not
blindly copied over the target in data-restore mode.

---

## 13. Runtime restart and validation

Host wrapper restart sequence:

    timescaledb already healthy
    migrations exit 0
    start mosquitto
    start ingestion-service
    start api
    start frontend
    recreate/start nginx

Success requires machine-verifiable checks:

- TimescaleDB healthy;
- migrations exit 0;
- API healthy;
- frontend healthy;
- nginx healthy;
- ingestion running;
- Mosquitto running;
- target Stack identity unchanged for data restore;
- expected migration level;
- representative restored tables readable;
- persistent app files present.

A successful `pg_restore` alone never yields RESTORE SUCCESS.

---

## 14. Restore run state

Restore uses the same operational state root model as backup, with separate
restore run records.

Suggested phases:

    STARTING
    PREFLIGHT
    SAFETY_BACKUP
    QUIESCING
    DATABASE_PREPARE
    DATABASE_RESTORE
    APP_DATA_RESTORE
    MOSQUITTO_RESTORE
    MIGRATIONS
    STARTING_RUNTIME
    HEALTH_CHECK
    SANITY_CHECK
    COMPLETE
    FAILED
    INTERRUPTED

Restore record fields include:

    runId
    command=restore
    mode=data|full
    sourceBackupId
    sourceInstance
    targetInstance
    targetEnvironment
    targetInstallDir
    safetyBackupId
    startedAt
    completedAt
    phase
    status
    failedStep
    errorCode
    errorSummary
    sourceStackVersion
    targetStackVersionBefore
    targetStackVersionAfter
    restoredMigrationLevel
    operatingSystemUser

Secrets are never stored in run state.

---

## 15. Failure semantics

General rule:

> Stop at the first failed phase, preserve the safety backup, record FAILED,
> and never print a success-looking summary.

Special database rule:

If Timescale pre-restore mode was entered and pg_restore fails, the engine must
attempt the matching post-restore cleanup before returning failure.

The tool does not automatically restore the safety backup after an arbitrary
failure in Phase 2. Automatic rollback after partially restored database/files
can itself destroy evidence and compound failure.

Instead it:

- leaves target writers stopped when target consistency cannot be proven;
- records the exact failed phase;
- prints the safety backup ID;
- provides a defined retry / restore-safety-backup path.

Retry behavior is idempotent at the workflow level: a new preflight is required
and target state is assessed again.

---

## 16. Locking

Backup and restore for one installation share an exclusive instance-level
recovery lock.

Restore refuses when:

- backup create is active;
- prune apply is active;
- another restore is active.

Read-only `list`, `show` and preflight inspection may remain available when
safe.

---

## 17. RECOVERY environment

Initial destructive validation target:

    /home/ubuntu/tmp/sensorsphere-recovery

Requirements:

    unique Compose project
    unique WEB_PORT
    unique MQTT_PORT
    isolated DATA_ROOT
    isolated backup root
    isolated backup-state / restore-state
    no shared PostgreSQL storage
    no shared Mosquitto storage
    no shared app persistent storage

The RECOVERY environment is disposable.

A guard file/metadata marker will explicitly identify it as:

    SENSORSPHERE_ENVIRONMENT=RECOVERY

or an equivalent dedicated recovery marker supported by the Stack validator.

The restore wrapper must be able to require this marker during P2 acceptance.

DEV is the backup source only.
DIT is not a destructive restore target.
TEST1 is not a destructive restore target without explicit user approval.

---

## 18. Source equivalence snapshot

Before the P2-ACC-001 DEV backup, record a machine-readable source snapshot.

Minimum fields map directly to P2-H:

    device registry device count
    identity count
    entity count
    device checks count
    slot counts
    agent counts
    project/admin counts
    history configuration count
    measurement earliest timestamp
    measurement latest timestamp
    representative measurement checksum/query
    lifecycle/tombstone counts where applicable

The same query set runs after restore and produces a comparison artifact.

The query set is versioned with Phase 2 so acceptance evidence is reproducible.

---

## 19. Post-restore ingestion proof

P2 acceptance includes a controlled MQTT publication after restore.

Evidence must prove:

    publish test sample
      -> ingestion receives it
      -> database stores it
      -> API returns it
      -> frontend/history can read it

The test sample must be uniquely identifiable and removable/ignorable according
to the RECOVERY test procedure.

---

## 20. Phase 2 implementation work packages

Stable implementation IDs:

### BR2-001 — CLI / model foundation
- add restore command parsing;
- data/full modes;
- preflight JSON;
- confirmation model;
- exit-code model.

### BR2-002 — Bundle restore validation
- strict verify-before-mutate;
- traversal checks;
- compatibility evaluator;
- source identity model.

### BR2-003 — Restore Compose service
- same backup image;
- dedicated restore profile;
- RW target mounts;
- read-only backup repository;
- no Docker socket / ports.

### BR2-004 — Host orchestration wrapper
- target identity discovery;
- RECOVERY guard;
- safety backup;
- stop/start sequence;
- migration invocation;
- health checks.

### BR2-005 — Database restore engine
- session termination;
- DB recreate;
- Timescale pre/post restore;
- pg_restore;
- ANALYZE;
- failure cleanup.

### BR2-006 — Application/Mosquitto restore
- staging extraction;
- traversal prevention;
- atomic/recoverable replace;
- ownership/mode handling.

### BR2-007 — Target preservation
- environment/name/URL/ports/project/install-dir preserved;
- source config retained only as evidence;
- target secrets never overwritten in data mode.

### BR2-008 — Run state / locking
- restore phases;
- failure/interruption state;
- shared backup/restore lock;
- safetyBackupId linkage.

### BR2-009 — Equivalence / sanity tooling
- source snapshot;
- post-restore comparison;
- migration/runtime checks;
- MQTT ingestion proof.

### BR2-010 — Failure injection
- pg_restore failure;
- DB create failure;
- post_restore failure;
- archive write failure;
- migration/health failure;
- process kill / retry semantics.

### BR2-011 — RECOVERY acceptance
- create isolated target;
- DEV -> RECOVERY P2-ACC-001;
- retain evidence/report.

### BR2-012 — Full restore foundation
- recover exact Stack Release bundle;
- reconstruct a new installation;
- no source checkout dependency;
- validate deployed-instance backup into new installation.

---

## 21. Planned source layout

Go packages to add:

    apps/backup/internal/restore/
    apps/backup/internal/compatibility/
    apps/backup/internal/recoveryreport/

Existing packages reused:

    manifest
    repository
    verify
    archive
    database
    runstate
    config

Host wrapper:

    distribution/restore.sh

Compose integration:

    distribution/docker-compose.yml
        service: restore
        profile: restore

The normal runtime remains unchanged.

---

## 22. Versioning plan

Phase 1 immutable image:

    backup 0.1.0

First Phase 2 development/release image:

    backup 0.2.0

Backup format remains:

    format 1

unless implementation proves that restore requires new bundle metadata that
cannot be represented compatibly. If format changes, the reader must continue
to identify format 1 explicitly and apply documented compatibility rules.

A Stack Release carrying Backup 0.2.0 is not considered Phase 2 accepted until
P2-ACC-001 passes.

---

## 23. Implementation order

Recommended order:

    BR2-001 CLI/preflight
      -> BR2-002 compatibility/validation
      -> BR2-003 restore service
      -> BR2-008 state/lock
      -> BR2-005 database engine
      -> BR2-006 files
      -> BR2-004 host wrapper
      -> BR2-007 target preservation
      -> BR2-009 equivalence
      -> BR2-010 failure injection
      -> BR2-011 RECOVERY acceptance
      -> BR2-012 full restore

No destructive code is exercised outside isolated test fixtures and RECOVERY
until BR2-011 has passed.

---

## 24. Phase 2 exit gate

Phase 2 Restore Foundation is accepted only when:

- all P0 P2-A through P2-J tests pass;
- all mandatory P1 tests pass or have an explicitly approved documented
  deferral;
- P2-ACC-001 DEV -> clean RECOVERY passes;
- a target safety backup is retained;
- database/app/Mosquitto equivalence checks pass as applicable;
- target identity is preserved for data restore;
- migrations and all runtime health checks pass;
- new post-restore MQTT ingestion is proven;
- failure-injection tests prove FAILED/interrupted state semantics;
- no Docker socket is permanently mounted;
- no TEST1 destructive restore was required for acceptance.

The Phase 2 acceptance report will be stored separately from this
specification.
