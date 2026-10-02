# SensorSphere — Backup / Restore V2 — V7 Audit and Target Architecture

> **Status:** architecture audit
> **Scope:** compare the existing V7 backup/restore implementation with the current Stack Release deployment model and define the target V2 module architecture.
> **Related:** `BACKUP-RESTORE.md`, `BACKUP-RESTORE-V2.md`

---

## 1. Decision: Backup is a SensorSphere Core module

The V2 backup/recovery tool is **not an external product** and is **not implemented inside `install.sh`**.

It is a SensorSphere Core component delivered by every compatible Stack Release, alongside:

- API
- Frontend
- Ingestion
- Nginx
- Migrations

The component has its own:

- source module
- Docker image
- semantic version
- tests
- release lifecycle
- changelog
- Stack Release manifest entry

Conceptual image:

    ghcr.io/sensorsphere/sensorsphere-backup:<version>

Conceptual Stack Release component:

    components:
      backup:
        version: 1.0.0
        image: ghcr.io/sensorsphere/sensorsphere-backup:1.0.0

The exact module path is still to be chosen, for example:

    apps/backup/

or:

    tools/backup-v2/

A module under `apps/backup/` is currently preferred because it behaves like a versioned executable component of the stack rather than a development-only repository tool.

---

## 2. CLI model

The preferred canonical invocation is:

    docker compose run --rm backup <command> [options] [arguments]

Examples:

    docker compose run --rm backup create
    docker compose run --rm backup list
    docker compose run --rm backup status
    docker compose run --rm backup show latest
    docker compose run --rm backup verify latest
    docker compose run --rm backup verify --deep latest
    docker compose run --rm backup prune --dry-run
    docker compose run --rm backup prune --apply
    docker compose run --rm backup restore --data <backup-id>
    docker compose run --rm backup restore --full <backup-id>

### 2.1 Why `run --rm` is preferred over `exec`

`docker compose exec backup ...` requires a permanently running `backup` container.

The core backup engine does not need to be a daemon.

Using `run --rm` provides:

- no idle container
- no daemon dependency for manual backup/verify
- exact image version from the installed Stack Release
- no restart policy to manage
- easier upgrades
- smaller attack surface
- easier one-shot isolation
- works even if a future scheduler service is stopped

If a future always-running scheduler is added, `exec` may also be supported as a convenience, but it should not be the fundamental execution model.

---

## 3. Compose integration

The V2 Stack bundle should define a `backup` service.

The service should not start during ordinary:

    docker compose up -d

Preferred approach:

    profiles:
      - backup

Explicitly targeting the service should allow one-shot commands without making backup part of the normal application runtime.

Conceptual Compose shape:

    backup:
      image: ghcr.io/sensorsphere/sensorsphere-backup:${SENSORSPHERE_BACKUP_VERSION}
      profiles:
        - backup

      environment:
        DB_HOST: timescaledb
        DB_PORT: 5432
        DB_NAME: ${POSTGRES_DB}
        DB_USER: ${POSTGRES_USER}
        DB_PASSWORD: ${POSTGRES_PASSWORD}

        SENSORSPHERE_STACK_VERSION: ${SENSORSPHERE_STACK_VERSION}
        SENSORSPHERE_ENVIRONMENT: ${SENSORSPHERE_ENVIRONMENT}
        INSTANCE_NAME: ${INSTANCE_NAME}
        SENSORSPHERE_INSTALL_HOST: ${SENSORSPHERE_INSTALL_HOST}
        SENSORSPHERE_INSTALL_DIR: ${SENSORSPHERE_INSTALL_DIR}
        SENSORSPHERE_COMPOSE_PROJECT: ${SENSORSPHERE_COMPOSE_PROJECT}

      volumes:
        - ${DATA_ROOT}/app:/sensorsphere/app-data
        - ${DATA_ROOT}/mosquitto:/sensorsphere/mosquitto
        - ${SENSORSPHERE_BACKUP_ROOT}:/backups
        - .:/instance

      networks:
        - database

The final mount permissions must be command-aware and security-reviewed.

---

## 4. No permanent Docker socket

The backup component must not receive:

    /var/run/docker.sock

as a permanent mount.

A Docker socket effectively grants host-level control and would unnecessarily enlarge the attack surface of a long-lived component.

Backup creation does not require the Docker socket:

- PostgreSQL can be accessed over the Compose database network
- application persistent data can be mounted
- Mosquitto persistent data can be mounted
- instance metadata can be mounted
- the backup repository can be mounted

Restore orchestration is treated separately in section 16.

---

## 5. Current V7 implementation summary

Current V7 files:

    tools/backup/sensorsphere-backup.sh
    tools/backup/sensorsphere-verify-backup.sh
    tools/backup/sensorsphere-restore.sh
    tools/backup/sensorsphere-prune-backups.sh

Current systemd integration:

    tools/backup/systemd/sensorsphere-backup.service
    tools/backup/systemd/sensorsphere-backup.timer

Current backup format:

    version 7

Current generated files:

    database.dump
    database-globals.sql
    app-data.tar.gz
    mosquitto.tar.gz
    project.tar.gz
    manifest.txt
    SHA256SUMS

The V7 implementation is substantial and contains proven recovery logic.

---

## 6. V7 -> V2 classification overview

| Capability | V7 | V2 action |
| --- | --- | --- |
| PostgreSQL `pg_dump -Fc` | Implemented | **REUSE** |
| `pg_restore --list` validation | Implemented | **REUSE / improve independence** |
| PostgreSQL globals | Implemented | **REUSE / review scope** |
| PostgreSQL version capture | Implemented | **REUSE** |
| TimescaleDB version capture | Implemented | **REUSE** |
| App persistent-data archive | Implemented | **ADAPT to mounted module paths** |
| Mosquitto persistent-data archive | Implemented | **ADAPT and verify online consistency** |
| Complete source-project archive | Implemented | **RETIRE for deployed instances** |
| Git branch/status in manifest | Implemented | **RETIRE from recovery manifest** |
| Plain-text manifest | Implemented | **REPLACE with structured JSON** |
| SHA256 checksums | Implemented | **REUSE** |
| TAR integrity validation | Implemented | **REUSE** |
| Backup-format version | Implemented | **REUSE** |
| Explicit restore confirmation | Implemented | **REUSE** |
| Safety copy before restore | Implemented | **ADAPT** |
| Preserve target `.env` | Implemented | **REUSE for data restore** |
| Delete complete Timescale PGDATA | Implemented | **RETIRE in normal logical restore** |
| Recreate empty DB | Implemented | **REUSE** |
| Timescale `pre_restore()` | Implemented | **REUSE** |
| Timescale `post_restore()` | Implemented | **REUSE** |
| `ANALYZE` after restore | Implemented | **REUSE** |
| `docker compose up -d --build` | Implemented | **RETIRE / replace by Stack images** |
| Migration verification | Documented/used | **REUSE / automate** |
| Post-restore health checks | Documented | **ADAPT / automate** |
| Daily/weekly/monthly retention | Implemented | **REUSE** |
| Dry-run prune | Implemented | **REUSE** |
| `flock` scheduling lock | Implemented | **REUSE concept** |
| Hardcoded systemd WorkingDirectory | Implemented | **REPLACE with per-instance template/config** |
| Off-host encrypted backup | Missing | **NEW** |
| Deep restore verification | Missing | **NEW** |
| Run history/status | Missing | **NEW** |
| UI monitoring | Missing | **NEW** |
| Alerting/staleness | Missing | **NEW** |
| Stack Release compatibility logic | Missing | **NEW** |
| Multiple deployed instances first-class | Partial | **NEW/ADAPT** |
| Secret-aware recovery material | Partial | **NEW** |

---

## 7. Database backup — REUSE

V7 already uses:

    pg_dump -Fc

This is the correct baseline for V2 logical recovery.

V2 keeps:

- custom PostgreSQL dump format
- non-empty dump validation
- `pg_restore --list` catalog validation
- PostgreSQL server version capture
- TimescaleDB extension version capture

### 7.1 Improvement

V7 validates the dump catalog through the running TimescaleDB container.

V2 should include compatible PostgreSQL client tools directly in the backup image.

Then:

    docker compose run --rm backup verify <backup>

can validate a dump without depending on the SensorSphere database service being healthy.

This is important for disaster recovery.

---

## 8. PostgreSQL globals — REUSE / review

V7 creates:

    database-globals.sql

using:

    pg_dumpall --globals-only

V2 should retain the ability to capture required global objects.

However, the exact restore policy must be reviewed.

SensorSphere currently relies primarily on the configured application database role.

Restoring every cluster-global object blindly onto a target cluster may be undesirable.

V2 should therefore distinguish:

- globals captured for forensic/completeness purposes
- globals actually required during automatic restore

---

## 9. Application persistent data — ADAPT

V7 archives:

    DATA_ROOT/app

This remains correct in principle.

V2 should access it through a Compose mount inside the backup module.

Conceptual container path:

    /sensorsphere/app-data

The module should archive the complete persistent tree rather than encode knowledge of individual files such as:

    history-config.json

This preserves future compatibility.

---

## 10. Mosquitto persistence — ADAPT

V7 executes `tar` inside the Mosquitto container.

V2 can access the persistent directory through a dedicated mount.

However, V2 must explicitly validate Mosquitto online-backup consistency.

Open question:

- can `mosquitto.db` be safely copied while Mosquitto is writing?
- should a persistence flush be triggered?
- should Mosquitto be stopped briefly?
- should only the data directory, not logs, be part of the recovery bundle?

This must be resolved before V2 backup format v1 is frozen.

Mosquitto logs are diagnostic data, not necessarily recovery-critical data.

---

## 11. Project/source archive — RETIRE

V7 creates:

    project.tar.gz

containing the complete SensorSphere checkout.

This is no longer appropriate for deployed Stack Release installations.

DIT and TEST1 currently contain:

    .env
    .env.example
    .installed
    .stack-release.yaml
    .stack-release.previous.yaml
    docker-compose.yml
    install.sh

They do not contain:

    apps/
    infrastructure/
    tools/

Therefore V2 must not require a source checkout.

### 11.1 Replacement

The recovery bundle should capture only runtime installation metadata required to reconstruct the installed instance, such as:

    stack-release.yaml
    docker-compose.yml
    installation metadata
    protected environment configuration

The actual application code/images are recovered from the recorded Stack Release.

---

## 12. Stack Release metadata — NEW

The current Stack manifest already provides a strong basis:

    stackVersion
    schemaVersion

    components:
      api
      frontend
      ingestion
      nginx
      migrations

    database:
      migrationLevel

    compatibility:
      apiContractVersion
      frontendRequiredApiContractVersion
      databaseMinMigrationLevel
      databaseMaxMigrationLevel

V2 should add the backup component to the manifest.

A future schema version will likely be required.

Conceptual evolution:

    components:
      backup:
        version: 1.0.0
        image: ghcr.io/sensorsphere/sensorsphere-backup:1.0.0

The installer must then populate:

    SENSORSPHERE_BACKUP_VERSION

exactly as it already does for other components.

---

## 13. Manifest — REPLACE

V7 uses:

    manifest.txt

containing key/value data plus free-form Git and image sections.

V2 should use:

    manifest.json

Benefits:

- machine-readable
- schema validation
- easier UI/API consumption
- explicit null/optional values
- structured component list
- safer compatibility checks
- easier future format evolution

Git status/branch should not be part of normal deployed-instance recovery metadata.

For DEV, source control remains Git's responsibility.

---

## 14. Checksums — REUSE

V7 SHA256 generation and verification are good foundations.

V2 keeps:

    checksums.sha256

Every recovery component should be covered.

A bundle is not VERIFIED unless all checksums pass.

---

## 15. Verify command — REUSE and expand

V7 already verifies:

- required files
- checksums
- TAR readability
- manifest fields
- project exclusions
- persistent app-data layout
- Mosquitto data
- PostgreSQL dump catalog
- sizes

V2 removes project-source checks and adds:

- JSON manifest schema
- Stack Release component compatibility
- image/release metadata
- encrypted environment payload presence
- migration-level compatibility
- optional remote-repository verification
- optional deep restore verification

Canonical command:

    docker compose run --rm backup verify <backup-id>

---

## 16. Restore orchestration — ADAPT carefully

This is the main area that cannot simply be moved into a one-shot container unchanged.

A safe restore must ensure that application writers are stopped or quiesced:

- ingestion-service
- API write paths
- any future writer service

The backup module should **not** receive a permanent Docker socket merely so it can stop sibling containers.

### 16.1 Preferred options to evaluate

#### Option A — Small host wrapper delivered in the bundle

Example:

    ./backup restore --data <backup-id>

The wrapper is independent from `install.sh`.

It performs only orchestration:

    docker compose stop writers
    docker compose run --rm backup restore ...
    docker compose run --rm migrations
    docker compose up -d
    health validation

The actual backup/restore logic remains in the versioned backup image.

Advantages:

- simple
- no Docker socket inside backup container
- restore remains one command
- wrapper is small and auditable

This is currently the **preferred restore orchestration model**.

#### Option B — Explicit operator stop/start

Example:

    docker compose stop api ingestion-service
    docker compose run --rm backup restore --data ...
    docker compose up -d

Advantages:

- simplest implementation

Disadvantages:

- less friendly
- easier operator error
- not ideal for the requested "easy restore"

Suitable only as an initial development mode.

#### Option C — Docker socket inside one-shot restore container

Possible but not currently recommended.

Although limiting the socket to a one-shot container reduces exposure, it still effectively grants host control.

Use only if the alternatives prove significantly worse.

#### Option D — Application maintenance protocol

API/ingestion cooperate with a maintenance mode so the backup module can safely restore without Docker control.

Architecturally elegant but significantly more complex.

Could be considered later.

---

## 17. Physical PGDATA deletion — RETIRE for logical restore

V7 deletes:

    DATA_ROOT/timescaledb

before recreating TimescaleDB.

For normal V2 logical restore this is unnecessarily destructive.

Preferred V2 behavior:

1. stop/quiesce application writers
2. connect to PostgreSQL maintenance DB
3. terminate target DB sessions
4. drop target application DB
5. recreate empty DB
6. enable TimescaleDB
7. pre_restore
8. pg_restore
9. post_restore
10. ANALYZE

The PostgreSQL cluster itself should remain intact unless doing a dedicated bare-storage recovery.

This reduces risk and avoids manipulating PGDATA from the recovery container.

---

## 18. Target environment preservation — REUSE

V7 preserves the target `.env`.

This is the right principle for:

    restore --data

V2 must make this an explicit mode rather than an implicit behavior.

### Data restore

Keep:

- target environment
- target public URL
- target ports
- target Compose project
- target installation directory
- target credentials unless explicitly overridden

Restore:

- database
- application persistent data
- relevant Mosquitto state

### Full restore

Reconstruct the original instance from:

- recorded Stack Release
- protected instance configuration
- persistent data

---

## 19. Restore safety copy — ADAPT

V7 moves the entire project directory to:

    <project>.pre-restore-<timestamp>

This made sense when the project checkout itself was the restore payload.

V2 should instead create a **pre-restore recovery point** using the same backup engine before destructive changes.

Conceptual sequence:

    verify requested backup
    create pre-restore backup of target
    verify pre-restore backup
    perform restore

This provides a consistent rollback artifact instead of a special project-directory backup mechanism.

---

## 20. Stack startup after restore — REPLACE

V7 executes:

    docker compose up -d --build

This is incompatible with production-style Stack Releases where source code is not present.

V2 must never require application builds during restore.

It should use the exact Stack Release images.

Expected behavior:

    docker compose pull
    docker compose run --rm migrations
    docker compose up -d

or equivalent orchestration using the release manifest.

---

## 21. Migration validation — REUSE and automate

V7 documentation already checks:

    schema_migrations

V2 should make migration validation part of automatic restore success criteria.

The recovery bundle records:

    source migration level

The target Stack Release records:

    migrationLevel
    databaseMinMigrationLevel
    databaseMaxMigrationLevel

Restore must validate the compatibility matrix before destructive actions.

---

## 22. Retention — REUSE

The V7 daily/weekly/monthly retention algorithm is a good baseline.

Keep:

- daily retention
- weekly retention
- monthly retention
- newest backup protection
- dry-run
- explicit apply
- ignore incomplete backups

Adapt to:

- V2 manifest format
- verified status
- local vs remote retention
- per-instance repositories

---

## 23. Scheduling — ADAPT

V7 systemd is a good model but currently hardcodes:

    User=ubuntu
    WorkingDirectory=/home/ubuntu/sensorsphere

V2 must support arbitrary installed instances.

Preferred target:

    systemd template or generated unit per instance

The timer invokes the canonical one-shot module command, conceptually:

    cd <install-dir>
    docker compose run --rm backup create

followed by verification/retention either:

- inside the `create` workflow
- or as explicit chained commands

Scheduling remains separate from `install.sh`.

The backup module/bundle may expose its own setup command for scheduling.

---

## 24. Permanent scheduler container — not required initially

A permanent backup daemon is not necessary for V2 phase 1.

Benefits of avoiding it initially:

- no idle service
- fewer runtime dependencies
- manual backup works even if scheduler is broken
- systemd already provides durable host scheduling
- no need to implement cron-like semantics inside an application container

A future scheduler service may be added if UI-triggered scheduling or cross-platform deployment makes it valuable.

---

## 25. Run status/history — NEW

The backup image should write run metadata to a persistent recovery-state directory.

Example:

    ${DATA_ROOT}/backup-state/

or a dedicated path outside application data.

Possible layout:

    state.json
    runs/
      <run-id>.json
    logs/
      <run-id>.log

This state is independent from the SensorSphere DB.

The API can later mount the state directory read-only for UI monitoring.

This means the UI can show backup health without owning the backup implementation.

---

## 26. UI integration — NEW, read-mostly

The SensorSphere API/frontend should initially consume backup status rather than implement backup logic.

Potential UI actions:

- Backup now
- Verify
- Deep verify

can later call a controlled integration path.

Restore should remain operator/CLI-oriented until repeatedly validated.

The backup module remains the source of truth for backup metadata.

---

## 27. Deep verification — NEW

V7 validates structure but does not perform a full isolated restore.

V2 should add:

    verify --deep

that starts or uses an isolated temporary TimescaleDB, restores the dump, runs checks, then destroys the test environment.

This is essential proof of recoverability.

---

## 28. Off-host encryption — NEW

V7 is primarily local.

V2 must add an off-host encrypted path before being considered sufficient disaster recovery.

Restic remains a strong candidate.

The backup module should first create and verify a local Recovery Bundle.

Remote copy is a second phase.

This separation allows:

    local SUCCESS
    remote FAILED

to be reported accurately.

---

## 29. Secrets — NEW architecture

V7 project backup can implicitly capture `.env`.

V2 should make secret capture explicit.

The normal manifest must not contain secrets.

A full-recovery bundle may contain:

    environment.enc

The encryption key must not be stored only beside the encrypted backup.

Key-management design remains open.

---

## 30. Multi-instance support — first-class V2 requirement

V2 must support several SensorSphere instances on one host.

Current examples:

    /home/ubuntu/sensorsphere
    /home/ubuntu/work/sensorsphere-dit
    /home/ubuntu/tmp/sensorsphere-test1

Each instance needs separate:

- backup root
- run state
- locks
- schedule
- remote tags/path
- retention

The canonical Compose command naturally targets the installation directory from which it is run.

---

## 31. Proposed V2 module dependencies

The backup image should contain the tools it requires rather than relying on utilities inside sibling containers.

Expected tools/libraries include:

- PostgreSQL client matching the supported PostgreSQL major version
- `pg_dump`
- `pg_restore`
- `psql`
- archive/compression support
- SHA256 implementation
- JSON schema validation
- optional restic client in the remote phase

This makes the backup module independently testable.

---

## 32. Network access

For backup creation the module needs:

    database network

to reach:

    timescaledb:5432

It does not need frontend or public network exposure.

No TCP port needs to be published.

This keeps the module private to the stack.

---

## 33. Mount access

Initial design:

### Backup create / verify

Need read access to:

- application persistent data
- Mosquitto persistent data
- installation metadata

Need write access to:

- backup repository
- recovery run-state directory

### Restore

Need write access to:

- application persistent data
- Mosquitto persistent data
- possibly selected instance metadata in full-restore mode

Mount design should avoid granting more access than required.

If Compose cannot express command-specific read-only/read-write mounts cleanly enough, separate services using the same image may be preferable:

    backup
    recovery

with different mounts/profiles.

This is an implementation design decision, not a reason to split the image.

---

## 34. Proposed command surface V1

Initial CLI:

    create
    list
    show
    status
    verify
    prune
    restore

Potential syntax:

    docker compose run --rm backup create

    docker compose run --rm backup list

    docker compose run --rm backup show latest

    docker compose run --rm backup status

    docker compose run --rm backup verify latest

    docker compose run --rm backup prune --dry-run
    docker compose run --rm backup prune --apply

    docker compose run --rm backup restore --data <backup-id>

    docker compose run --rm backup restore --full <backup-id>

Later:

    verify --deep
    remote push
    remote check
    remote snapshots

---

## 35. Proposed Stack Release evolution

A future Stack Release schema should include:

    backup:
      version
      image
      releasedAt

The Stack Build information UI should eventually display:

    Backup
    1.x.y · release date

The installer should set:

    SENSORSPHERE_BACKUP_VERSION

but should not implement backup operations.

The distribution Compose file contains the service definition.

The backup module is therefore always available after installing a compatible stack.

---

## 36. Compatibility with old backups

V2 should consider read compatibility with V7 backups.

Potential policy:

    V2 can inspect/verify V7
    V2 may restore V7 through a compatibility adapter
    V2 writes only new V2 format

This is valuable because existing V7 backups should not become useless immediately.

The feasibility must be tested during implementation.

---

## 37. Current V7 hardcoded assumptions to remove

The audit found these assumptions that are incompatible with modern deployed stacks:

    complete Git checkout exists
    apps/ exists
    infrastructure/ exists
    tools/ exists
    restore can rebuild images locally
    systemd WorkingDirectory=/home/ubuntu/sensorsphere
    systemd User=ubuntu
    project directory itself is the main restore payload

These are explicit V2 migration targets.

---

## 38. Current V7 logic worth preserving

The strongest existing V7 implementation elements are:

1. custom-format PostgreSQL dump
2. catalog validation
3. PostgreSQL/Timescale version metadata
4. application-data archive
5. Mosquitto-data archive
6. checksums
7. backup format version
8. explicit destructive restore confirmation
9. target-env preservation concept
10. DB session termination before recreate
11. empty database creation
12. Timescale pre/post restore
13. restore `ANALYZE`
14. retention algorithm
15. dry-run pruning
16. systemd scheduling concept
17. `flock`
18. real disaster-recovery validation philosophy

V2 should evolve these, not rewrite them without reason.

---

## 39. Implementation language decision

The V7 code is shell.

For V2, shell remains possible, but the scope now includes:

- JSON manifests
- schema validation
- run-state files
- compatibility logic
- encryption orchestration
- remote backends
- deep verification
- future API/UI integration
- structured error reporting

A small program may be more maintainable than continuing to grow shell scripts.

This decision should be made before Phase 1 implementation.

Requirements for any implementation language:

- multi-arch image
- small runtime
- predictable behavior
- no host language dependency
- easy automated tests
- structured JSON output
- safe process execution
- good filesystem/archive support

Because the tool is containerized, the host does not need the implementation runtime.

---

## 40. Recommended V2 architecture after audit

The audit currently recommends:

    SensorSphere Stack Release
             |
             +-- api
             +-- frontend
             +-- ingestion
             +-- nginx
             +-- migrations
             +-- backup  <--- new core module
                         |
                         +-- one-shot CLI
                         +-- backup/verify/prune
                         +-- restore engine
                         +-- run-state writer
                         +-- later remote/deep verify

Invocation:

    docker compose run --rm backup ...

Scheduling:

    host systemd timer
            |
            v
    docker compose run --rm backup create

UI:

    backup state files
            |
            v
    API read-only integration
            |
            v
    Frontend status/history

Restore:

    small bundle-provided host orchestrator
            |
            +-- stop/quiesce writers
            +-- run backup restore engine
            +-- migrations
            +-- restart stack
            +-- health checks

No permanent Docker socket in the backup module.

---

## 41. Phase 1 implementation recommendation

Phase 1 should implement only the solid foundation:

- new versioned backup module
- add backup component to Stack Release
- add Compose profile/service
- `create`
- `list`
- `show`
- `status`
- `verify`
- `prune`
- V2 Recovery Bundle
- manifest.json
- checksums
- database custom dump
- application persistent data
- Mosquitto persistent data
- instance/release metadata
- per-instance run state
- locks

Do **not** add UI, remote storage or full restore in the first code increment.

Phase 1 should be validated on:

- DEV source checkout
- DIT Stack Release installation
- TEST1 Stack Release installation

without changing the application data.

---

## 42. Phase 2 implementation recommendation

Phase 2:

- data restore
- restore orchestration wrapper
- pre-restore verified safety backup
- Timescale pre/post restore
- automatic migration validation
- automatic stack health validation
- real restore into isolated recovery instance
- V7 restore compatibility investigation

Only after this passes should `restore --full` be considered stable.

---

## 43. Immediate technical decisions still required

Before coding Phase 1:

1. choose module path:
   - `apps/backup`
   - alternative

2. choose implementation language/runtime

3. freeze V2 Recovery Bundle format v1

4. decide Mosquitto consistency method

5. decide encrypted-secret mechanism

6. decide backup-root default

7. decide run-state path

8. decide Stack Release schema evolution

9. decide whether backup image should contain restic immediately or in a later release

10. decide whether V2 must read V7 backups from day one

---

## 44. Audit conclusion

The old V7 work is **not obsolete**.

Its database backup, verification, Timescale restore and retention logic form a strong foundation.

The part that became obsolete is mainly the assumption that a recoverable SensorSphere instance is a complete Git/source checkout.

The modern recovery identity is:

    exact Stack Release
    +
    instance configuration
    +
    persistent application state
    +
    verified recovery metadata

The new backup module should be a **Core SensorSphere component shipped by the Stack Release**, but operationally independent from `install.sh`.

This preserves both goals:

- backup/recovery evolves independently
- every SensorSphere installation receives the correct compatible backup tool automatically
