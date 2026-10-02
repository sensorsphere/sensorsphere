# SensorSphere — Backup and Restore V2

> **Status:** design / working specification
> **Purpose:** define the next-generation SensorSphere backup, verification, retention, monitoring and disaster-recovery architecture.
> **Important:** this document is intentionally kept alongside `BACKUP-RESTORE.md`. The existing document remains the reference for the current V7 implementation until V2 has been implemented and validated end-to-end.

---

## 1. Executive summary

Backup and restore must become a first-class SensorSphere recovery subsystem before more functional data is accumulated.

The primary objective is not merely to produce backup files. It is to provide a recovery process that is:

- complete
- reproducible
- verifiable
- portable
- version-aware
- easy to operate
- independently maintainable
- observable
- testable through real restores
- suitable for local and off-host storage

The V2 architecture must **not embed backup/restore functionality into `install.sh`**.

`install.sh` remains responsible for the SensorSphere application lifecycle:

- install
- update
- rollback
- remove

Backup and restore must be provided by a **separate SensorSphere Core module**, with its own lifecycle, versioning, tests and image, while still being delivered by every compatible SensorSphere Stack Release.

The target is not a separately installed external product. The preferred architecture is a versioned backup component such as:

    ghcr.io/sensorsphere/sensorsphere-backup:<version>

invoked through the installed Compose project, for example:

    docker compose run --rm backup create
    docker compose run --rm backup verify latest
    docker compose run --rm backup restore --data <backup-id>

The exact implementation language and source-module path remain to be decided.

---

## 2. Why V2 is needed

SensorSphere now contains data that is costly or impossible to recreate manually:

- historical measurements
- discovered devices and entities
- Device Registry data
- manually curated identities and labels
- slots and associations
- Device Checks
- dashboards / History configuration
- agent metadata
- managed-runtime state
- authentication and administration data
- future user identities and access-control data
- configuration accumulated through the UI

Loss of the host, storage, database, or instance must not require rebuilding this information manually.

Backup/restore therefore becomes a prerequisite before continuing with larger functional projects such as multi-identity authentication and Microsoft OIDC.

---

## 3. Existing V7 implementation

The current repository already contains a substantial backup/restore implementation under:

    tools/backup/

including:

    sensorsphere-backup.sh
    sensorsphere-verify-backup.sh
    sensorsphere-restore.sh
    sensorsphere-prune-backups.sh

and systemd units under:

    tools/backup/systemd/

The current documentation is:

    docs/BACKUP-RESTORE.md

The current backup format is version 7.

### 3.1 Existing V7 backup content

The V7 implementation already creates:

    database.dump
    database-globals.sql
    app-data.tar.gz
    mosquitto.tar.gz
    project.tar.gz
    manifest.txt
    SHA256SUMS

It already performs several important operations correctly:

- PostgreSQL logical dump using custom format (`pg_dump -Fc`)
- PostgreSQL globals backup
- TimescaleDB version capture
- PostgreSQL version capture
- persistent application-data backup
- Mosquitto persistent-data backup
- project archive
- SHA256 generation and verification
- PostgreSQL dump catalog verification
- archive-integrity verification
- retention
- systemd scheduling
- explicit restore confirmation
- safety copy before restore
- preservation of target `.env`
- TimescaleDB pre/post restore workflow
- post-restore migration checks
- post-restore application checks
- documented disaster-recovery validation

These mechanisms are valuable and should be reused where they still match the current architecture.

---

## 4. Main architectural difference between V7 and V2

The most important difference is caused by the newer containerized Stack Release installation model.

### 4.1 V7 assumption

V7 assumes that the SensorSphere instance is a complete source checkout and therefore archives the project itself.

The verifier expects project content such as:

    apps/
    infrastructure/
    tools/
    docker-compose.yml

This matches the DEV checkout.

### 4.2 Current production-style installations

DIT and TEST1 are now installed from SensorSphere Stack Release bundles.

They contain files such as:

    .env
    .env.example
    .installed
    .stack-release.yaml
    .stack-release.previous.yaml
    docker-compose.yml
    install.sh

but they do **not** contain:

    apps/
    tools/backup/
    infrastructure/

Therefore the V7 project-archive model is no longer the right recovery abstraction for deployed instances.

### 4.3 V2 principle

V2 must consider a SensorSphere installation to be reproducible from:

    Stack Release
    +
    instance configuration
    +
    persistent data

rather than from a backup of the complete source repository.

The source tree should not be required to restore DIT, TEST1, FIT or a future production instance.

---

## 5. Separation from install.sh

Backup/restore functionality must remain separate from the SensorSphere installer.

The following is explicitly **not** the target design:

    ./install.sh backup
    ./install.sh restore

Instead, V2 should expose a dedicated **Core backup module** from the installed Compose project. The preferred canonical execution model is:

    docker compose run --rm backup <command> [options] [arguments]

Examples:

    docker compose run --rm backup create
    docker compose run --rm backup list
    docker compose run --rm backup verify latest
    docker compose run --rm backup restore --data <backup-id>

`run --rm` is preferred to `exec` because backup operations do not require a permanently running container. If a scheduler daemon is added later, `exec` may be supported as a convenience, but the recovery engine should remain usable as a one-shot component.

### 5.1 Reasons for separation

This provides:

- independent releases
- independent testing
- independent security review
- no coupling between application bootstrap and disaster recovery
- easier use against several SensorSphere instances
- easier deployment on a backup host
- easier future support for remote repositories
- easier compatibility with older/newer SensorSphere Stack Releases
- clearer operational responsibility

The backup module is delivered by the SensorSphere Stack Release and should appear as its own versioned component in the Stack manifest. It may remain independently maintainable inside the SensorSphere mono-repository while being published as its own image.

The detailed V7-to-V2 audit and target module architecture are documented in:

    docs/BACKUP-RESTORE-V2-AUDIT.md

---

## 6. Persistent SensorSphere content

The backup must be based on persistent state, not on containers.

### 6.1 PostgreSQL / TimescaleDB

This is the primary data store.

It contains, among other things:

- historical measurements
- Device Registry
- Registry identities
- entities
- discovery state
- slots
- checks
- agents
- managed-runtime information
- administration data
- authentication data
- configuration stored in database tables
- migrations metadata

At the time this V2 design was created, approximate database sizes were:

    DEV    ~3.8 GB
    DIT    ~15 MB
    TEST1  ~19 MB

DEV already demonstrates that backup-size and restore-duration considerations matter.

### 6.2 Application persistent data

The API currently mounts:

    DATA_ROOT/app -> /app/data

The known important file is currently:

    history-config.json

V2 must back up the complete application persistent-data tree rather than hard-code only this filename.

### 6.3 Mosquitto persistence

The stack persists:

    DATA_ROOT/mosquitto/data
    DATA_ROOT/mosquitto/log

The data directory is important for Mosquitto persistence.

Logs are less critical for recovery but may be included for diagnostics depending on policy.

### 6.4 Instance configuration

A full disaster-recovery backup must capture the information necessary to rebuild the instance, including at least:

    .env
    docker-compose.yml
    .stack-release.yaml
    .installed

and any future installation metadata required by Stack Releases.

The backup must also record the configured:

- instance name
- environment
- public URL
- host
- installation directory
- Compose project
- ports
- DATA_ROOT
- Stack Release

### 6.5 Secrets

The instance `.env` may contain secrets such as:

- database password
- OIDC client secrets
- future credentials

Therefore it cannot be treated as ordinary public metadata.

V2 must distinguish:

- non-secret recovery metadata
- secret recovery configuration

Secret material must never be displayed in normal logs, manifests, UI status or notification messages.

---

## 7. Proposed V2 Recovery Bundle

A logical backup should be represented as a self-describing recovery bundle.

Conceptual layout:

    sensorsphere-backup-20261002T020000Z/
    |
    +-- manifest.json
    +-- checksums.sha256
    |
    +-- database/
    |   +-- sensorsphere.dump
    |   +-- globals.sql
    |
    +-- app/
    |   +-- app-data.tar.zst
    |
    +-- mosquitto/
    |   +-- data.tar.zst
    |
    +-- instance/
        +-- stack-release.yaml
        +-- docker-compose.yml
        +-- install-metadata.json
        +-- environment.enc

The final artifact may optionally be packaged as:

    sensorsphere-backup-20261002T020000Z.tar.zst

The format must have its own independent version:

    backupFormatVersion

The recovery tool version must also be recorded.

---

## 8. Database backup format

The PostgreSQL / TimescaleDB backup should use:

    pg_dump -Fc

The custom PostgreSQL format provides:

- catalog inspection through `pg_restore --list`
- selective restore capability
- better restore control than a plain SQL stream
- compatibility with the existing V7 implementation

PostgreSQL global objects should also be captured when required:

    pg_dumpall --globals-only

The backup must record:

- PostgreSQL server version
- TimescaleDB extension version
- database name
- database size
- dump size
- schema migration version

---

## 9. Backup manifest

V2 should replace or complement the V7 text manifest with a machine-readable:

    manifest.json

It should contain at least:

    backupId
    backupFormatVersion
    recoveryToolVersion

    startedAt
    completedAt

    sourceHost
    sourceInstallDir
    sourceComposeProject

    instanceName
    environment
    publicUrl

    stackVersion
    frontendVersion
    apiVersion
    ingestionVersion
    nginxVersion
    migrationsVersion

    postgresVersion
    timescaleVersion
    databaseName
    databaseSizeBytes
    databaseDumpSizeBytes

    appDataIncluded
    mosquittoDataIncluded
    instanceConfigurationIncluded
    encryptedSecretsIncluded

    backupSizeBytes

    verificationStatus
    verificationCompletedAt

    sourceType
    backupMode

    componentChecksums

Where possible, image references/digests associated with the Stack Release should also be recorded.

The manifest must never contain plaintext secrets.

---

## 10. Checksums and basic verification

A backup is not SUCCESS merely because files were created.

The minimum successful backup workflow is:

    create database dump
            |
            v
    validate pg_restore catalog
            |
            v
    archive required persistent files
            |
            v
    generate manifest
            |
            v
    generate SHA256 checksums
            |
            v
    verify SHA256 checksums
            |
            v
    validate all archives
            |
            v
    SUCCESS / VERIFIED

The core rule is:

> A SensorSphere backup is considered successful only if the database dump exists, all required components are present, checksums validate, archives are readable, and `pg_restore --list` confirms that the PostgreSQL archive is readable.

Incomplete backups must never participate in retention as valid recovery points.

---

## 11. Recovery modes

V2 should explicitly distinguish two recovery scenarios.

### 11.1 Data restore

Example conceptual command:

    sensorsphere-backup restore --data <backup>

This restores the data into an existing SensorSphere instance.

The target instance keeps target-specific configuration such as:

- environment
- instance name
- public URL
- ports
- Compose project
- installation directory
- target credentials where appropriate

Typical use case:

    restore DEV data into a TEST recovery instance

without accidentally converting the target instance into DEV.

### 11.2 Full disaster-recovery restore

Example conceptual command:

    sensorsphere-backup restore --full <backup>

This reconstructs a lost SensorSphere instance from:

    Stack Release
    +
    backed-up instance configuration
    +
    persistent data

The recovery tool should retrieve or reconstruct the Stack Release specified in the manifest rather than depend on an archived source checkout.

This is the mode intended for:

- lost VM
- failed disk
- replacement server
- complete host rebuild

---

## 12. Restore safety rules

Restore is destructive and must be strongly guarded.

Before changing anything, the tool must:

1. verify the recovery bundle
2. read the manifest
3. verify PostgreSQL compatibility
4. verify TimescaleDB compatibility
5. verify Stack Release / migrations compatibility
6. display source and target information
7. display what will be overwritten
8. require explicit confirmation unless an explicit unattended mode has been deliberately selected

Before destructive restore actions, the tool should automatically create a safety backup of the current target state whenever possible.

A restore should never report success merely because `pg_restore` exited.

---

## 13. TimescaleDB restore sequence

The logical TimescaleDB restore remains broadly consistent with the V7 design.

Target sequence:

    validate recovery bundle
            |
            v
    create safety backup of target
            |
            v
    stop ingestion/API writers
            |
            v
    keep/start clean TimescaleDB
            |
            v
    recreate empty database
            |
            v
    enable TimescaleDB extension
            |
            v
    timescaledb_pre_restore()
            |
            v
    pg_restore
            |
            v
    timescaledb_post_restore()
            |
            v
    ANALYZE
            |
            v
    restore persistent files
            |
            v
    restore/reconstruct instance configuration
            |
            v
    start complete SensorSphere stack
            |
            v
    migrations validation
            |
            v
    health checks
            |
            v
    application sanity checks
            |
            v
    RESTORE SUCCESS

Parallel restore should not be introduced without explicit TimescaleDB validation.

---

## 14. Post-restore validation

A restore must include machine-verifiable checks.

At minimum:

- TimescaleDB healthy
- migrations container successful
- API healthy
- frontend healthy
- nginx healthy
- expected Stack Release running
- schema migration version correct
- important tables accessible
- row counts non-zero where expected
- application persistent files restored
- Mosquitto starts successfully

Useful restore metadata should compare selected pre-backup and post-restore counts.

Potential examples:

- number of devices
- number of entities
- number of Device Checks
- number of agents
- number of history configurations
- observation/measurement time boundaries
- latest measurement timestamp

The exact sanity-query set should be versioned with the recovery tool.

---

## 15. Real disaster-recovery validation requirement

A backup implementation is not considered production-ready until it has been restored successfully.

V2 acceptance requires a real test similar to:

    backup DEV
        |
        v
    provision empty recovery instance
        |
        v
    restore backup
        |
        v
    run migrations
        |
        v
    health checks
        |
        v
    compare selected data
        |
        v
    publish MQTT test
        |
        v
    verify ingestion
        |
        v
    verify API
        |
        v
    verify frontend

The previous V7 disaster-recovery test remains useful historical evidence, but V2 must be validated again against the current Stack Release architecture.

---

## 16. Deep verification

A second validation level should be added.

Conceptual command:

    sensorsphere-backup verify --deep <backup>

A deep verification should restore the database into an isolated temporary PostgreSQL/TimescaleDB instance.

Conceptual process:

    backup
      |
      v
    temporary isolated TimescaleDB
      |
      v
    restore
      |
      v
    migrations/schema validation
      |
      v
    sanity queries
      |
      v
    PASS
      |
      v
    destroy temporary environment

This is stronger than checksum verification because it proves that the backup can actually be restored.

Because DEV is already several GB, deep verification may be expensive and should not necessarily run after every backup.

Suggested policy:

    basic verify   after every backup
    deep verify    weekly

---

## 17. Scheduling

Scheduling must belong to the independent backup/recovery tool, not `install.sh`.

The existing V7 systemd-timer approach is a good baseline.

Preferred mechanism:

    systemd service + timer

rather than a manually installed opaque cron entry.

Suggested initial schedule:

    daily backup at 02:00

Configuration should be explicit and instance-specific.

Conceptual settings:

    BACKUP_ENABLED=true
    BACKUP_SCHEDULE=02:00
    BACKUP_ROOT=/var/backups/sensorsphere-test1

The final configuration namespace will depend on the standalone tool.

Multiple SensorSphere instances on the same host must be supported cleanly.

For example:

    sensorsphere-dev
    sensorsphere-dit
    sensorsphere-test1

must each have separate:

- configuration
- lock
- schedule
- backup root
- status
- retention history

---

## 18. Retention

The existing V7 daily/weekly/monthly model is a good baseline.

Suggested initial retention:

    local:
      7 daily
      4 weekly

    remote:
      7 daily
      4 weekly
      6 monthly

Retention must only delete backups after identifying valid recovery points.

The newest valid backup should always be protected.

Retention should support:

    dry-run
    apply

and log exactly which backups were:

    KEPT
    DELETED
    IGNORED AS INVALID

---

## 19. Backup location

A local backup is useful for:

- accidental deletion
- database corruption
- application mistakes

but a backup stored only on the same host is not sufficient disaster recovery.

A host failure could destroy both:

    SensorSphere
    +
    local backup

Therefore V2 must distinguish:

    local recovery copy
    +
    off-host recovery copy

---

## 20. Off-host encrypted backup

A later V2 phase should support remote encrypted storage.

Potential destinations:

- another Linux server
- NAS
- SFTP
- S3-compatible object storage

A strong candidate for the storage layer is:

    restic

because it already provides:

- encryption
- deduplication
- repository integrity
- snapshots
- retention support
- local repositories
- SFTP
- S3-compatible backends

The recovery bundle generator should remain independent of the remote backend.

Conceptually:

    SensorSphere instance
           |
           v
    local verified Recovery Bundle
           |
           v
    encrypted remote repository

The backup must remain usable locally even if the remote repository is temporarily unavailable.

---

## 21. Secret handling

Full recovery requires access to sensitive instance configuration.

Possible design:

    instance/
      metadata.json        non-secret
      environment.enc      encrypted

The plaintext `.env` must not be stored in a generally readable backup archive.

Minimum local requirements:

- backup directory permissions 0700
- files containing secrets 0600
- no secrets in console logs
- no secrets in manifest.json
- no secrets in UI status
- no secrets in notifications

For off-host storage, encryption is mandatory.

Secret-management details remain to be finalized during implementation design.

---

## 22. Monitoring and status

Backup health must be visible without reading systemd logs manually.

The independent recovery tool should maintain machine-readable status.

Conceptual current status:

    lastRun
    lastSuccessfulBackup
    lastVerifiedBackup
    lastDeepVerifiedBackup
    nextScheduledBackup

    status
    ageSeconds

    backupId
    backupSize
    duration

    localStatus
    remoteStatus
    verificationStatus

A backup should have a unique:

    Backup Run ID

Each run should record:

    runId
    trigger
    startedAt
    completedAt
    status
    backupId
    sourceInstance
    databaseSize
    archiveSize
    duration
    destination
    checksumStatus
    verificationStatus
    remoteStatus
    error

The run history should exist independently of the SensorSphere application database so that it remains available when SensorSphere itself is unavailable.

---

## 23. SensorSphere UI integration

A future SensorSphere Administration page should display backup status, while keeping the recovery implementation independent.

Possible UI:

    Administration
      -> Backup & Restore

Summary card:

    Last successful backup   Today 02:00
    Age                      4 h 17 min
    Size                     ...
    Duration                 ...
    Local                    OK
    Remote                   OK
    Verification             VERIFIED
    Deep verification        ...
    Next backup              Tomorrow 02:00
    Retention                7 daily / 4 weekly / 6 monthly

History:

    DATE             STATUS    SIZE    DURATION    VERIFY    REMOTE
    02/10 02:00      SUCCESS   ...     ...         OK        OK
    01/10 02:00      SUCCESS   ...     ...         OK        OK
    30/09 02:00      FAILED    -       ...         -         -

Possible actions:

    Backup now
    Verify
    Deep verify
    View manifest
    View log

### 23.1 Restore UI

Restore should **not** initially be exposed through the web UI.

The first V2 releases should require the standalone recovery tool for restore operations.

Only after multiple real restore validations should a web-based restore workflow be considered.

### 23.2 Maintaining architectural separation

The SensorSphere API should not embed the recovery implementation.

Possible integration mechanisms to investigate:

- read-only status files produced by the recovery tool
- dedicated local recovery service
- dedicated sidecar
- authenticated local API/socket

The final integration must preserve independent maintenance of the recovery subsystem.

---

## 24. Alerts

The UI should make stale or failed backups difficult to miss.

Possible states:

    Backup OK

    Backup WARNING
    no verified backup for > 26h

    Backup CRITICAL
    no verified backup for > 48h

The thresholds should be configurable.

Potential global indicator:

    Backup ✓

or:

    Backup ⚠ 27h

or:

    Backup ERROR

Future notification channels may include:

- email
- webhook
- external monitoring
- future SensorSphere notification subsystem

An alert must distinguish between:

- backup generation failure
- verification failure
- remote-copy failure
- stale backup
- deep-verification failure

---

## 25. Notification philosophy

A successful scheduled backup does not necessarily need a noisy notification every day.

Recommended default:

    SUCCESS
      recorded in history
      visible in UI

    FAILURE
      visible immediately
      notification generated

    STALE
      warning/critical indicator
      notification generated

    REMOTE COPY FAILURE
      warning even if local backup succeeded

    DEEP VERIFY FAILURE
      critical warning

A periodic success summary may later be optional.

---

## 26. Backup consistency

V2 must define what application activity is allowed while the backup is taken.

For PostgreSQL, `pg_dump` provides a consistent logical snapshot.

Application-data and Mosquitto files need their own consistency rules.

The implementation design must determine whether:

- Mosquitto persistence can be safely archived online
- Mosquitto should briefly flush/reload/stop during its file backup
- application files require any locking or atomic-copy strategy

The goal is to minimize service interruption while guaranteeing recoverability.

---

## 27. Backup concurrency

Only one backup/restore operation per SensorSphere instance should run at a time.

The V7 use of:

    flock

is a good baseline.

V2 should define locks for:

- backup
- restore
- deep verify
- retention

Restore must prevent backup and pruning from running concurrently.

Lock status should be observable.

---

## 28. Backup of containers and images

Docker containers themselves should not be backed up.

Container images are reproducible artifacts.

The backup should instead record:

- exact image references
- version tags
- image digests where available
- Stack Release version

A full restore should obtain the required images through the Stack Release mechanism.

This avoids unnecessarily storing rebuildable image layers inside every backup.

---

## 29. Project/source backup policy

V7 archives the complete SensorSphere project checkout.

V2 should not require this for deployed environments.

For DEV, source-code protection belongs primarily to Git/GitHub rather than SensorSphere disaster recovery.

The V2 Recovery Bundle may include small runtime installation files, but should not archive:

- `.git`
- source trees
- node_modules
- build caches
- Docker image layers
- development artifacts

unless a separate explicit developer-workspace backup policy is introduced.

---

## 30. Migration compatibility

Restore must reason about both:

    source backup migration version
    target Stack Release migration version

Potential scenarios:

### Same Stack Release

Straightforward restore.

### Newer target Stack Release

Restore the old database first, then allow the current migration image to migrate forward, provided the upgrade path is supported.

### Older target Stack Release

Potentially unsafe and should normally be rejected unless explicitly supported.

### Missing original Stack Release

Full disaster recovery should fail clearly if the exact required release is unavailable and no supported upgrade path has been selected.

These compatibility rules must be versioned and tested.

---

## 31. Restore target identity

A restore must clearly display:

    Source instance
    Source environment
    Source host
    Source Stack Release

    Target instance
    Target environment
    Target host
    Target install directory
    Target Compose project
    Target DATA_ROOT

This is particularly important when restoring:

    DEV -> recovery test
    PROD -> DR host
    DIT -> temporary validation instance

The tool should make cross-environment restore obvious before confirmation.

---

## 32. Backup list and inspection commands

The standalone tool should make backup discovery easy.

Conceptual commands:

    sensorsphere-backup list

    sensorsphere-backup show <backup-id>

    sensorsphere-backup verify <backup-id>

    sensorsphere-backup verify --deep <backup-id>

Example output:

    DATE                 STACK           SIZE      VERIFIED   REMOTE
    2026-10-02 02:00     2026.10.02.1    ...       YES        YES
    2026-10-01 02:00     2026.10.01.9    ...       YES        YES
    2026-09-30 02:00     2026.09.30.18   ...       YES        YES

The exact CLI remains to be finalized.

---

## 33. Manual backup

A manual backup should be possible without changing the schedule.

Conceptual command:

    sensorsphere-backup create

Expected output should be concise but explicit:

    Creating SensorSphere backup...

    Database................ OK
    Application data........ OK
    Mosquitto persistence... OK
    Instance configuration.. OK
    Manifest................ OK
    Checksums................ OK
    Verification............ OK

    Backup ID:
    20261002T020000Z

    Size:
    ...

    Destination:
    /var/backups/sensorsphere-test1/...

    Status:
    VERIFIED

---

## 34. Scheduled execution

The standalone recovery package should provide templates or an installer for systemd integration.

Example units may conceptually be instance-specific:

    sensorsphere-backup@sensorsphere-test1.service
    sensorsphere-backup@sensorsphere-test1.timer

or generated from recovery-tool configuration.

The systemd integration should use:

- persistent timers
- per-instance locking
- explicit timeout
- low scheduling priority where useful
- clear journal logs

The exact packaging remains to be designed.

---

## 35. Backup configuration

The standalone recovery tool should have its own configuration instead of relying entirely on SensorSphere application environment variables.

A possible configuration might contain:

    instance:
      install_dir: /home/ubuntu/tmp/sensorsphere-test1

    backup:
      root: /var/backups/sensorsphere-test1
      schedule: "02:00"

    retention:
      daily: 7
      weekly: 4
      monthly: 6

    verify:
      basic_after_backup: true
      deep_schedule: weekly

    remote:
      enabled: true
      backend: restic

The recovery tool can still read SensorSphere `.env` to discover database/container configuration, but its own operational settings should not pollute the SensorSphere application configuration unnecessarily.

---

## 36. Multiple instances on one host

This is a hard requirement.

The tool must safely manage multiple installations such as:

    /home/ubuntu/sensorsphere
    /home/ubuntu/work/sensorsphere-dit
    /home/ubuntu/tmp/sensorsphere-test1

Each instance must remain isolated by:

- install directory
- Compose project
- DATA_ROOT
- backup root
- schedule
- lock
- run history
- remote repository path/snapshot tags

The tool should prevent an accidental backup or restore against the wrong Compose project.

---

## 37. Storage capacity monitoring

Because DEV already has a multi-GB database, V2 should track backup storage growth.

Useful metrics:

    backup size
    database dump size
    local free space before backup
    local free space after backup
    remote repository size if available

The backup should fail early with a clear message if there is insufficient local workspace.

Retention should not be the only mechanism preventing a full disk.

---

## 38. Performance and load

Backup must minimize impact on ingestion.

The recovery tool should record:

    backup duration
    pg_dump duration
    file archive duration
    verification duration
    remote-copy duration

Where appropriate:

- process nice level
- I/O scheduling priority
- compression level

should be configurable.

Performance changes must never trade away backup integrity.

---

## 39. Failure semantics

A run should use explicit states such as:

    STARTING
    DATABASE_BACKUP
    FILE_BACKUP
    VERIFYING
    COPYING_REMOTE
    COMPLETED
    FAILED

A run is not globally successful merely because the local database dump succeeded.

A useful result model is:

    localBackupStatus
    localVerificationStatus
    remoteCopyStatus
    remoteVerificationStatus
    deepVerificationStatus

This allows the UI to distinguish:

    local backup OK, remote copy failed

from:

    no valid backup exists

---

## 40. Recovery logs

Each run should keep a dedicated log associated with its Run ID.

Logs must:

- include timestamps
- identify the instance
- identify the backup ID
- avoid secrets
- record command phases
- preserve meaningful PostgreSQL/TimescaleDB errors
- distinguish warnings from fatal failures

Long-term logs should themselves have retention rules.

---

## 41. Audit

Backup and restore actions should be auditable.

Record at least:

    scheduled/manual/API-triggered
    initiating user when available
    source host
    target host for restore
    backup ID
    result
    timestamps

For CLI restores, the operating-system user should be recorded.

For future UI-triggered backup actions, the authenticated SensorSphere user should be recorded.

---

## 42. Recovery without SensorSphere running

A critical architectural requirement is:

> The recovery tool must be usable when the SensorSphere API and frontend are completely unavailable.

Therefore:

- the CLI cannot depend on SensorSphere being healthy
- backup manifests cannot depend solely on the SensorSphere DB
- restore metadata cannot exist solely inside the database being restored
- remote repository access cannot require the SensorSphere UI

The UI is an observability and control convenience, not a recovery dependency.

---

## 43. Recovery module delivery

The backup/recovery implementation is delivered with SensorSphere Core as a Stack Release component.

The preferred model is a versioned container image referenced by the Stack manifest and Compose file:

    ghcr.io/sensorsphere/sensorsphere-backup:<version>

The module is not started as part of the normal application runtime. It is invoked explicitly, preferably as:

    docker compose run --rm backup ...

A very small host-side orchestration wrapper may also be delivered in the Stack bundle for destructive restore workflows that must stop/restart sibling services. Such a wrapper remains separate from `install.sh`; the actual recovery logic stays inside the versioned backup image.

The module should minimize host dependencies while preserving access to:

- the Compose database network
- instance files
- persistent application and Mosquitto data
- backup storage
- systemd where scheduling is enabled

A permanent Docker socket mount is not part of the target architecture.

---

## 44. Relationship with Stack Releases

Full recovery should integrate with Stack Releases but remain separate from the stack installer implementation.

The recovery tool may:

1. read the Stack Release version from the backup manifest
2. obtain the corresponding public release bundle
3. verify its checksum
4. reconstruct the runtime files
5. restore the instance configuration
6. restore persistent data

It should not require a Git checkout.

The Stack Release is a dependency/artifact used by recovery, not the implementation of recovery itself.

---

## 45. Existing V7 features to preserve

The following V7 concepts should explicitly survive into V2 unless a better implementation replaces them:

- `pg_dump -Fc`
- PostgreSQL globals where required
- dump catalog verification
- SHA256 verification
- explicit backup format version
- TimescaleDB version capture
- PostgreSQL version capture
- application persistent-data archive
- Mosquitto persistent-data archive
- destructive restore confirmation
- target-environment preservation for data restore
- TimescaleDB pre/post restore sequence
- migration validation
- post-restore health checks
- retention with dry-run
- systemd timer approach
- lock against concurrent backups
- real disaster-recovery testing

---

## 46. Major V2 evolutions over V7

The major V2 changes are:

1. **Independent Core backup module**
   - no backup/restore implementation inside `install.sh`
   - delivered by every compatible Stack Release
   - independent component version/image/tests/changelog
   - canonical one-shot CLI through `docker compose run --rm backup ...`

2. **Stack Release-aware recovery**
   - restore deployed instances without a source checkout
   - no dependency on `apps/`, `tools/` or `infrastructure/`

3. **Self-describing Recovery Bundle**
   - structured JSON manifest
   - richer version and component metadata

4. **Explicit data vs full restore**
   - preserve target environment for data restore
   - reconstruct original instance for disaster recovery

5. **Secret-aware design**
   - no plaintext secrets in normal manifest/log/UI
   - encrypted secret recovery material

6. **Off-host encrypted copies**
   - local backup alone is not considered sufficient disaster recovery
   - likely restic-based remote repository support

7. **Backup run model and observability**
   - run IDs
   - history
   - durations
   - sizes
   - explicit local/remote/verify status

8. **SensorSphere UI visibility**
   - last/next backup
   - age
   - verification
   - failure/stale badge
   - history

9. **Alerts**
   - backup failure
   - stale backup
   - remote-copy failure
   - deep-verify failure

10. **Deep restore verification**
    - restore into isolated temporary TimescaleDB
    - scheduled proof that backups are recoverable

11. **Multi-instance support as a first-class requirement**
    - DEV / DIT / TEST1 on one host

12. **Storage/capacity monitoring**
    - relevant now that DEV is already several GB

13. **No backup of rebuildable containers/source**
    - record exact release/image identity instead

---

## 47. Suggested implementation phases

The numbering is tentative and should be reconciled with the active SensorSphere PR sequence before implementation.

### Phase 1 — Backup foundation

Deliver:

- standalone recovery-tool skeleton
- instance discovery/configuration
- PostgreSQL custom dump
- globals backup
- app-data backup
- Mosquitto backup
- instance/release metadata
- manifest.json
- checksums
- backup create
- backup list
- backup show
- basic verify
- per-instance locking

Acceptance:

- backup created from DEV
- backup created from DIT-style Stack Release installation
- backup created from TEST1-style Stack Release installation
- all bundles verify successfully

### Phase 2 — Restore foundation

Deliver:

- data restore
- full restore
- safety backup
- version compatibility checks
- Timescale pre/post restore
- migrations validation
- health checks
- sanity queries
- clear rollback/failure handling

Acceptance:

- real restore of DEV backup into an empty recovery instance
- real restore of a deployed-instance backup into a new installation
- preserved target configuration validated for data-restore mode

### Phase 3 — Scheduling and retention

Deliver:

- systemd integration
- daily scheduling
- per-instance timers
- daily/weekly/monthly retention
- dry-run prune
- status/run history

### Phase 4 — Monitoring and SensorSphere UI

Deliver:

- Backup & Restore administration page
- last successful backup
- last verification
- next backup
- history
- status badge
- Backup now
- Verify
- View manifest/log

Restore remains CLI-only initially.

### Phase 5 — Off-host encrypted backup

Deliver:

- restic integration or equivalent
- local + remote status separation
- SFTP
- S3-compatible backend
- remote verification
- remote retention

### Phase 6 — Deep verification

Deliver:

- isolated temporary Timescale restore
- schema/migration checks
- sanity queries
- weekly scheduling
- UI status

This phase may be moved earlier if implementation effort is low.

### Future phase — PITR

After logical recovery is proven and stable, evaluate:

    pgBackRest
    PostgreSQL WAL archiving
    Point-In-Time Recovery

This is not the first implementation target.

---

## 48. Future PITR layer

Logical Recovery Bundles optimize for:

- portability
- inspectability
- migration across hosts
- simple disaster recovery

They do not provide near-zero Recovery Point Objective.

If SensorSphere later requires recovery to an exact point shortly before failure, add:

    physical PostgreSQL backup
    +
    WAL archiving
    +
    Point-In-Time Recovery

Potential technology:

    pgBackRest

This should complement, not replace, the logical Recovery Bundle.

---

## 49. Initial policy proposal

Suggested initial production policy:

    logical backup:
      daily at 02:00

    local retention:
      7 daily
      4 weekly

    remote retention:
      7 daily
      4 weekly
      6 monthly

    basic verification:
      every backup

    deep verification:
      weekly

    warning:
      no verified backup for > 26 hours

    critical:
      no verified backup for > 48 hours

These values must be configurable.

---

## 50. Recovery objectives

Formal RPO/RTO targets should eventually be defined.

Initial conceptual targets:

### RPO

With daily logical backups only:

    up to ~24 hours of data loss

This may be unacceptable later for production metrics.

### RTO

The restore duration is currently unknown for multi-GB databases and must be measured during V2 recovery tests.

The tool should record actual restore durations so realistic RTO targets can be set.

PITR/WAL can later reduce RPO.

---

## 51. Definition of done for Backup V2

Backup V2 is not considered complete merely when a backup command succeeds.

Minimum definition of done:

- backup module is delivered as a versioned SensorSphere Core Stack component
- canonical backup commands work directly from Stack Release installations
- backs up all identified persistent state
- secrets handled safely
- manifest is complete
- checksums verified
- PostgreSQL catalog verified
- retention works
- multi-instance support validated
- real restore onto a separate clean instance succeeds
- restored database validated
- restored History configuration validated
- restored Mosquitto persistence validated
- migrations validated
- API/frontend/ingestion health validated
- recovery procedure documented
- failure scenarios tested
- backup age/status observable
- at least one off-host recovery path documented or implemented before production reliance

The strongest acceptance criterion remains:

> **A backup is trustworthy only after SensorSphere has demonstrated that it can restore it successfully.**

---

## 52. Open design decisions

The following decisions remain intentionally open for implementation design:

- final source-module path/name (`apps/backup` is currently preferred)
- shell vs compiled/programmatic implementation
- exact Compose profile/service design
- exact restore orchestration wrapper design
- encryption mechanism for local secret material
- exact restic repository model
- exact UI-to-recovery-tool integration
- Mosquitto online-backup consistency mechanism
- whether logs are included in the Recovery Bundle
- exact compatibility rules between Stack Releases
- exact set of post-restore sanity queries
- exact RPO/RTO targets

These decisions should be resolved before implementation of the corresponding phase, not guessed implicitly in code.

---

## 53. Immediate next step

The focused V7-to-V2 design review has now been performed and is documented in:

    docs/BACKUP-RESTORE-V2-AUDIT.md

The audit classifies the existing V7 behavior into reusable, adaptable and retired parts and establishes the target architecture: a versioned `backup` Core module delivered in the Stack Release.

Before coding Phase 1, the remaining immediate decisions are:

1. final module source path (`apps/backup` is currently preferred)
2. implementation language/runtime
3. V2 Recovery Bundle format version 1 specification
4. Mosquitto consistency method
5. encrypted-secret mechanism
6. backup-root and run-state defaults
7. Stack Release schema evolution for the backup component
8. V7 read/restore compatibility policy

The existing V7 implementation remains a strong baseline. V2 should evolve its proven database, verification, retention and Timescale restore logic while removing the dependency on a full SensorSphere source checkout.
