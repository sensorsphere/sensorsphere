# SensorSphere — Backup / Restore V2 — Phase 1 Technical Specification

> **Status:** implementation specification
> **Scope:** Phase 1 — versioned Core backup module, local Recovery Bundle, verification, retention and operational state
> **Related documents:** `BACKUP-RESTORE.md`, `BACKUP-RESTORE-V2.md`, `BACKUP-RESTORE-V2-AUDIT.md`, `BACKUP-RESTORE-V2-TEST-PLAN.md`

---

## 1. Phase 1 objective

Phase 1 introduces Backup as a versioned SensorSphere Core component shipped by the Stack Release.

It must provide a safe local backup foundation without changing the normal SensorSphere runtime architecture.

Phase 1 intentionally does **not** implement:

- destructive restore orchestration
- full disaster-recovery reconstruction
- remote/off-host repositories
- deep isolated restore verification
- Backup & Restore UI
- notification delivery

Those capabilities are specified in the overall V2 architecture and test plan, but are delivered in later phases.

Phase 1 delivers:

- a versioned `backup` Core module
- a dedicated container image
- Stack Release integration
- a one-shot CLI
- PostgreSQL / Timescale logical backup
- application persistent-data backup
- Mosquitto persistence snapshot
- instance/release metadata capture
- a self-describing Recovery Bundle
- SHA256 integrity
- PostgreSQL dump-catalog validation
- local backup listing and inspection
- run status/history
- retention
- per-instance locking
- human-readable and JSON command output
- automated tests

---

## 2. Source module decision

The source module is:

    apps/backup/

Reasoning:

- it is a versioned executable SensorSphere Core component
- it is not a developer-only helper script
- it has a release lifecycle similar to API / Ingestion
- it is published as a dedicated OCI image
- it participates in Stack Release compatibility
- it can have its own tests and changelog

The legacy:

    tools/backup/

remains untouched initially as the V7 implementation/reference.

V2 must not silently replace V7 until the V2 acceptance tests pass.

---

## 3. Implementation language decision

The V2 backup engine will be implemented as a small **Go program**.

### 3.1 Why Go

The recovery subsystem needs:

- structured JSON
- atomic file operations
- robust process execution
- file locking
- checksums
- schema validation
- retention algorithms
- stable CLI behavior
- low runtime dependency count
- multi-architecture builds
- predictable error handling
- future remote/storage integration

A Go binary is a better long-term fit than extending the existing shell implementation indefinitely.

### 3.2 Relationship with proven V7 logic

The V7 scripts remain the behavioral reference for:

- PostgreSQL dump semantics
- dump validation
- Timescale metadata capture
- persistent-data inclusion
- checksums
- retention
- restore sequencing

Porting the behavior to Go is not permission to alter proven semantics without explicit design rationale.

---

## 4. Image decision

Image name:

    ghcr.io/sensorsphere/sensorsphere-backup

Initial semantic version:

    0.1.0

The first production-ready milestone may become:

    1.0.0

only after the restore acceptance gates are passed.

### 4.1 Multi-architecture

Official releases must support:

    linux/amd64
    linux/arm64

Phase 1 does not currently require arm/v7 for the Core stack.

### 4.2 Build layout

Preferred multi-stage build:

    golang:<version>-bookworm
        |
        +-- compile static/portable backup binary
        |
        v
    debian:bookworm-slim
        |
        +-- sensorsphere-backup binary
        +-- PostgreSQL 17 client tools from the official PGDG repository
        +-- tar
        +-- zstd
        +-- ca-certificates
        +-- required runtime utilities only

The runtime deliberately does not use the PostgreSQL server image. That image
inherits an exposed 5432/tcp port and a writable /var/lib/postgresql/data
volume, which are unnecessary and violate the constrained one-shot backup
container model.

The runtime installs PostgreSQL 17 client tools only:

    pg_dump
    pg_restore
    psql
    pg_dumpall

for the current PostgreSQL 17 / Timescale stack. A client older than the
server major version must not be used.

---

## 5. Module version metadata

The backup module must expose its own version.

Preferred files:

    apps/backup/VERSION

or, if useful for a Go build:

    apps/backup/internal/version/...

The release tooling must read the version deterministically.

The image must expose OCI labels consistent with other SensorSphere modules:

    org.opencontainers.image.source
    org.opencontainers.image.revision
    org.opencontainers.image.version

---

## 6. Stack Release integration

A future Stack Release schema version will include the Backup component.

Target conceptual manifest:

    stackVersion: ...
    schemaVersion: 4

    components:
      api:
        ...
      frontend:
        ...
      ingestion:
        ...
      nginx:
        ...
      migrations:
        ...
      backup:
        version: 0.1.0
        image: ghcr.io/sensorsphere/sensorsphere-backup:0.1.0
        releasedAt: ...

The exact schema bump must be implemented consistently in:

- stack validator
- stack build/release process
- installer manifest parser
- Build information UI later
- compatibility tests

Installer responsibility is limited to making the module available through the installed Stack Release.

The installer does **not** implement backup operations.

The installer sets:

    SENSORSPHERE_BACKUP_VERSION=<manifest version>

---

## 7. Compose service model

The distribution Compose file defines a service:

    backup

The service is behind a Compose profile so it is not part of ordinary runtime startup.

Conceptual design:

    backup:
      image: ghcr.io/sensorsphere/sensorsphere-backup:${SENSORSPHERE_BACKUP_VERSION}
      profiles:
        - backup

No:

    restart: unless-stopped

is required for the one-shot engine.

No TCP port is exposed.

The service joins only the networks it requires.

For Phase 1:

    database

is required to reach PostgreSQL.

---

## 8. Canonical command

The canonical Phase 1 invocation is:

    docker compose run --rm backup <command> [arguments] [options]

Examples:

    docker compose run --rm backup version
    docker compose run --rm backup create
    docker compose run --rm backup list
    docker compose run --rm backup show latest
    docker compose run --rm backup status
    docker compose run --rm backup verify latest
    docker compose run --rm backup prune --dry-run
    docker compose run --rm backup prune --apply

The tool must not require an already-running `backup` container.

---

## 9. Command surface — Phase 1

### 9.1 version

    backup version

Output:

- backup module version
- backup format version
- supported PostgreSQL major
- build revision when available

JSON equivalent:

    backup version --json

### 9.2 create

    backup create

Options planned for Phase 1:

    --json
    --label <text>
    --no-mosquitto

The default path and retention policy come from configuration, not positional arguments.

A successful `create` performs built-in basic verification before publishing the bundle as complete.

### 9.3 list

    backup list

Options:

    --json
    --limit <n>
    --all

Default behavior lists complete local backups only.

Invalid/incomplete work directories are hidden unless:

    --all

is supplied.

### 9.4 show

    backup show <backup-id|latest>

Options:

    --json

Displays manifest metadata and verification state.

### 9.5 status

    backup status

Options:

    --json

Displays:

- last run
- last successful backup
- last verified backup
- current age
- current state
- active lock
- local repository path

### 9.6 verify

    backup verify <backup-id|latest>

Options:

    --json

Phase 1 verification includes:

- manifest parse
- backup-format support
- required files
- checksums
- database dump catalog
- archive readability
- component-size sanity
- completion marker

Deep restore verification is a later phase.

### 9.7 prune

    backup prune --dry-run
    backup prune --apply

Options:

    --json

Default mode is dry-run.

No deletion occurs without:

    --apply

---

## 10. Configuration

Phase 1 reuses SensorSphere instance environment for instance/database identity and introduces dedicated backup variables.

Proposed variables:

    SENSORSPHERE_BACKUP_ROOT=./backups
    SENSORSPHERE_BACKUP_STATE_ROOT=./data/backup-state

    SENSORSPHERE_BACKUP_RETENTION_DAILY=7
    SENSORSPHERE_BACKUP_RETENTION_WEEKLY=4
    SENSORSPHERE_BACKUP_RETENTION_MONTHLY=6

    SENSORSPHERE_BACKUP_WARNING_AGE_HOURS=26
    SENSORSPHERE_BACKUP_CRITICAL_AGE_HOURS=48

Phase 1 does not require remote repository configuration.

The backup module also receives:

    POSTGRES_DB
    POSTGRES_USER
    POSTGRES_PASSWORD

    SENSORSPHERE_STACK_VERSION
    SENSORSPHERE_ENVIRONMENT
    INSTANCE_NAME
    SENSORSPHERE_INSTALL_HOST
    SENSORSPHERE_INSTALL_DIR
    SENSORSPHERE_COMPOSE_PROJECT

    SENSORSPHERE_API_VERSION
    SENSORSPHERE_FRONTEND_VERSION
    SENSORSPHERE_INGESTION_VERSION
    SENSORSPHERE_NGINX_VERSION
    SENSORSPHERE_MIGRATIONS_VERSION
    SENSORSPHERE_BACKUP_VERSION

---

## 11. Host mount model

Proposed Phase 1 mounts:

    installation directory -> /instance:ro

    DATA_ROOT/app
        -> /source/app:ro

    DATA_ROOT/mosquitto/data
        -> /source/mosquitto:ro

    SENSORSPHERE_BACKUP_ROOT
        -> /backups:rw

    SENSORSPHERE_BACKUP_STATE_ROOT
        -> /state:rw

The installation directory is mounted read-only.

The backup module must whitelist the installation files it copies into a Recovery Bundle.

It must **not** recursively archive the source checkout.

### 11.1 Container runtime identity and host ownership

The official Mosquitto image creates its persistence file as:

    uid/gid 1883:1883
    mode 0600

Therefore a backup process running solely as the installation owner cannot read a valid `mosquitto.db`.

The Phase 1 backup container consequently runs as root **inside the one-shot container**, but with a deliberately constrained surface:

- no Docker socket
- no published ports
- installation mount read-only
- application-data mount read-only
- Mosquitto-data mount read-only
- only backup/state mounts writable
- database access limited to the Compose database network

The engine derives the host UID/GID from the mounted:

    /instance

directory and recursively normalizes newly created Recovery Bundle and run-state files to that owner before returning success.

This provides both:

- read access to Mosquitto's mode-0600 persistence file
- host-operable `0700/0600` backup files owned by the SensorSphere installation user

A failed/incomplete run should also normalize the ownership of its generated state and incomplete workspace whenever possible.

---

## 12. No Docker socket

The Phase 1 backup container must not mount:

    /var/run/docker.sock

Backup creation can operate with:

- PostgreSQL network access
- read-only persistent-data mounts
- read-only installation metadata
- writable backup/state mounts

No sibling-container management is required in Phase 1.

---

## 13. Backup root

Default host path:

    ./backups

relative to the installed SensorSphere bundle.

Reasons:

- clearly separated from application `DATA_ROOT`
- prevents recursive inclusion in app-data backup
- visible and easy to copy manually
- per-instance by default because each installed instance has its own directory

Operators can override it with an absolute path.

A production instance should eventually use storage separate from the application disk and an off-host repository.

---

## 14. Run-state root

Default host path:

    ./data/backup-state

This is operational metadata, not recovery payload.

It must not be included inside:

    app-data.tar.zst

The API may later mount it read-only for UI monitoring.

Conceptual layout:

    backup-state/
      current.json
      runs/
        <run-id>.json
      logs/
        <run-id>.log
      locks/
        instance.lock

Run-state corruption must not make existing Recovery Bundles unusable.

The authoritative recovery metadata remains inside each bundle.

---

## 15. Run identifiers

Every operation gets a Run ID.

Recommended format:

    UUID

Every created backup gets a Backup ID.

Recommended human-sortable format:

    YYYYMMDDTHHMMSSZ-<8-char-random>

Example:

    20261002T211500Z-a4c29f10

The timestamp is UTC.

Backup IDs must be unique even if two attempts start in the same second.

---

## 16. Atomic bundle creation

A backup must never appear complete while it is still being written.

Creation sequence:

    /backups/.incomplete/<backup-id>/
             |
             v
    write components
             |
             v
    write manifest
             |
             v
    write checksums
             |
             v
    basic verify
             |
             v
    write COMPLETE marker
             |
             v
    atomic rename
             |
             v
    /backups/<backup-id>/

If any step fails:

- the final directory must not exist
- the incomplete directory is retained or cleaned according to failure policy
- run state is FAILED
- retention ignores it

---

## 17. Recovery Bundle format

Phase 1 writes:

    backupFormatVersion = 1

Canonical local layout:

    <backup-id>/
    |
    +-- manifest.json
    +-- checksums.sha256
    +-- COMPLETE
    |
    +-- database/
    |   +-- database.dump
    |   +-- globals.sql
    |
    +-- app/
    |   +-- app-data.tar.zst
    |
    +-- mosquitto/
    |   +-- mosquitto-data.tar.zst
    |
    +-- instance/
        +-- stack-release.yaml
        +-- docker-compose.yml
        +-- installed.txt
        +-- installation.json

The local directory is the canonical V2 Recovery Bundle.

A single-file export:

    <backup-id>.tar.zst

may be added later for transport, but is not the canonical storage format.

This choice simplifies:

- inspection
- verification
- retention
- partial metadata reads
- future restic deduplication
- remote snapshotting

---

## 18. COMPLETE marker

The file:

    COMPLETE

is created only after all Phase 1 validation passes.

It contains minimal non-secret data, for example:

    backupId=<id>
    completedAt=<UTC timestamp>
    formatVersion=1

Presence of `COMPLETE` alone does not replace checksum verification.

Retention considers a bundle valid only if:

- COMPLETE exists
- manifest parses
- basic structural requirements pass

---

## 19. manifest.json — schema v1

The manifest is machine-readable JSON.

Top-level conceptual structure:

    {
      "backupFormatVersion": 1,
      "backupId": "...",
      "runId": "...",
      "createdAt": "...",
      "completedAt": "...",

      "tool": { ... },
      "source": { ... },
      "stack": { ... },
      "database": { ... },
      "payload": { ... },
      "verification": { ... }
    }

### 19.1 tool

Fields:

    name
    version
    revision

### 19.2 source

Fields:

    host
    installDir
    composeProject
    environment
    instanceName

No secret values.

### 19.3 stack

Fields:

    stackVersion
    stackSchemaVersion

    components:
      api
      frontend
      ingestion
      nginx
      migrations
      backup

Each component includes:

    version
    image

and digest where reliably available.

### 19.4 database

Fields:

    name
    serverVersion
    serverMajor
    timescaleVersion
    migrationLevel
    sourceSizeBytes
    dumpSizeBytes

Optional sanity metadata:

    earliestMeasurementAt
    latestMeasurementAt

Exact query names are finalized with the implementation.

### 19.5 payload

Entries describe:

    database
    globals
    appData
    mosquitto
    instanceMetadata

Each component includes:

    included
    path
    sizeBytes
    required

### 19.6 verification

Fields:

    status
    verifiedAt
    checksumStatus
    dumpCatalogStatus
    archiveStatus

Phase 1 final states:

    VERIFIED
    FAILED

Remote/deep verification fields are added later without changing the meaning of format v1 fields.

---

## 20. checksums.sha256

The checksum file includes:

- manifest.json
- every database payload
- every archive
- instance metadata files

It does not checksum itself.

The COMPLETE marker is created after checksum verification and is not required inside the checksum set.

SHA256 generation order must be deterministic.

Paths must be relative to the bundle root.

---

## 21. Database backup

Phase 1 uses:

    pg_dump -Fc

The backup image connects to:

    DB_HOST=timescaledb
    DB_PORT=5432

No `docker compose exec timescaledb` is required from inside the backup module.

Required behavior:

1. test DB connectivity
2. capture DB version
3. capture TimescaleDB version
4. capture migration level
5. capture source DB size
6. run custom-format dump
7. ensure output is non-empty
8. run `pg_restore --list`
9. record dump size

A failed dump-catalog validation makes the entire backup fail.

---

## 22. PostgreSQL globals

Phase 1 captures:

    pg_dumpall --globals-only

as:

    database/globals.sql

This file is included for completeness and future restore decisions.

Phase 1 does not automatically restore globals.

The future restore implementation will explicitly decide which roles/global objects are safe and required.

---

## 23. Application persistent-data archive

Input:

    /source/app

Output:

    app/app-data.tar.zst

The complete mounted tree is archived.

This currently includes:

    history-config.json

but the backup engine does not special-case that filename.

If the source directory is empty:

- archive creation still succeeds
- manifest records zero logical entries where possible
- backup remains valid

Archive readability is verified.

---

## 24. Mosquitto persistence snapshot

Input:

    /source/mosquitto

Output:

    mosquitto/mosquitto-data.tar.zst

Mosquitto persistence is classified as:

    recovery-useful runtime continuity state

rather than the authoritative SensorSphere data store.

The authoritative application state is PostgreSQL plus application persistent data.

### 24.1 Phase 1 consistency rule

The V2 engine must:

1. copy/archive the persistence directory read-only
2. verify archive readability
3. record whether `mosquitto.db` was present
4. never fail merely because `mosquitto.db` does not exist on a fresh/idle instance
5. fail if a present Mosquitto source cannot be read or archived

The implementation must not silently invent an empty successful snapshot after an I/O error.

### 24.2 Future improvement

Before production reliance, evaluate an explicit Mosquitto persistence flush immediately before snapshot.

This may be performed by a tiny host-side orchestration wrapper without granting Docker socket access to the backup container.

---

## 25. Instance metadata capture

The engine whitelists selected files from:

    /instance

Potential Phase 1 files:

    .stack-release.yaml
    stack-release.yaml
    docker-compose.yml
    .installed

DEV may not contain:

    .stack-release.yaml
    .installed

Therefore discovery order for the Stack manifest is:

1. `/instance/.stack-release.yaml`
2. `/instance/stack-release.yaml`
3. matching `/instance/releases/stacks/<SENSORSPHERE_STACK_VERSION>.yaml` when running from the DEV checkout
4. synthesized component metadata from supplied environment as a last resort

The chosen source is recorded in the manifest.

---

## 26. installation.json

The bundle contains non-secret installation metadata:

    instance/installation.json

Fields include:

    instanceName
    environment
    sourceHost
    sourceInstallDir
    composeProject
    stackVersion
    dataRoot metadata if safe
    createdAt

No passwords, tokens or OIDC secrets are stored in this file.

---

## 27. Secrets decision

Phase 1 does **not** store plaintext `.env` inside the Recovery Bundle.

This is deliberate.

Full secret-preserving disaster recovery belongs to the restore/full-recovery phase.

The selected V2 direction is encrypted secret material using an external recovery key/recipient, with `age` currently preferred.

Target future payload:

    instance/environment.env.age

The public encryption recipient may be present in backup configuration.

The private recovery key must not be stored only on the same SensorSphere host.

Until encrypted environment capture is implemented, the manifest must clearly state:

    instanceSecrets.included = false

and the backup must not claim to be a self-sufficient full-host recovery artifact.

It remains a complete **data recovery** artifact.

---

## 28. Compression

Application/Mosquitto archives use:

    zstd

through tar/zstd tooling.

Reasons:

- high decompression speed
- good compression
- widely supported
- good fit for multi-GB recovery workflows

Database custom format uses PostgreSQL's own format/compression behavior.

Compression level must be conservative to avoid excessive load on ingestion hosts.

Initial level should prioritize speed and stability over maximum compression.

---

## 29. Locking

Only one mutating backup operation may run per instance.

Commands requiring exclusive lock:

    create
    prune --apply

Future:

    restore
    deep verify where it mutates shared workspace

Read-only commands:

    list
    show
    status
    verify

may run concurrently when safe.

The lock is stored under:

    /state/locks/

The Go implementation should use an operating-system file lock, not merely existence of a lock file.

A stale process must not leave the instance permanently blocked.

---

## 30. Run state

Every command records structured state when applicable.

Conceptual:

    /state/current.json

and:

    /state/runs/<run-id>.json

Fields:

    runId
    command
    trigger
    startedAt
    completedAt
    status
    phase
    backupId
    errorCode
    errorMessage
    durations
    sizes

Statuses:

    STARTING
    RUNNING
    SUCCESS
    FAILED

Create sub-phases may include:

    PRECHECK
    DATABASE
    APP_DATA
    MOSQUITTO
    INSTANCE_METADATA
    MANIFEST
    CHECKSUMS
    VERIFY
    PUBLISH

---

## 31. Logs

Human logs are written to stdout/stderr and optionally duplicated to:

    /state/logs/<run-id>.log

Rules:

- timestamp every phase
- never print POSTGRES_PASSWORD
- never print OIDC secrets
- never dump the complete environment
- make command failures actionable
- include exit code where useful

Logs are operational data, not part of Recovery Bundle integrity.

---

## 32. Exit codes

Phase 1 should use stable exit categories.

Suggested mapping:

    0   success
    2   invalid CLI usage
    10  configuration error
    11  lock/concurrency error
    20  database connectivity error
    21  database dump error
    22  dump verification error
    30  app-data error
    31  Mosquitto snapshot error
    40  instance metadata error
    50  manifest/checksum error
    60  verification error
    70  retention error
    80  storage/capacity error
    90  unexpected internal error

Exact values may evolve before implementation freeze, but categories should remain stable for monitoring.

---

## 33. Human and JSON output

Every inspection command must support:

    --json

The JSON output is intended for:

- automated tests
- future API integration
- external monitoring
- scripts

Human output remains concise.

Example create output:

    SensorSphere Backup

    Instance........... SensorSphere [TEST1]
    Stack.............. 2026.10.xx.x
    Database........... OK
    Application data... OK
    Mosquitto........... OK
    Metadata............ OK
    Checksums........... OK
    Verification........ VERIFIED

    Backup ID........... 20261002T211500Z-a4c29f10
    Size................ 18.4 MB
    Duration............ 4.2 s

No ANSI formatting is required for JSON mode.

---

## 34. Storage preflight

Before starting a potentially large dump, `create` checks free space in:

    /backups

Phase 1 policy:

- record free space
- compare against configurable/minimum safety threshold
- fail early when clearly insufficient
- record the reason

Because dump compression ratio is unknown, initial free-space estimation should be conservative.

A future heuristic can use source DB size and recent backup ratios.

---

## 35. Retention

Default:

    daily   = 7
    weekly  = 4
    monthly = 6

Phase 1 applies retention only to local V2 bundles.

Rules:

- default command is dry-run
- invalid/incomplete bundles are never counted as valid recovery points
- newest VERIFIED bundle is always protected
- only `--apply` deletes
- deletion is logged with backup ID and reason
- active/incomplete backup directory is never deleted
- retention is per instance/repository

The V7 algorithm is the baseline behavior.

---

## 36. Backup age status

Phase 1 `status` computes age from the latest VERIFIED backup.

Default thresholds:

    warning  > 26 hours
    critical > 48 hours

Status:

    OK
    WARNING
    CRITICAL
    NEVER

This prepares later UI/alert integration.

---

## 37. Version compatibility

Phase 1 writes enough metadata for future restore compatibility checks.

It does not implement destructive restore compatibility yet.

At minimum the manifest records:

- stack version
- stack schema version
- migration level
- PostgreSQL major/version
- TimescaleDB version
- backup module version
- backup format version

---

## 38. V7 compatibility

Phase 1 V2 writes only format:

    1

V7 backup directories are not mixed into the V2 repository namespace automatically.

Initial compatibility target:

- V2 may later inspect/import V7
- V2 does not need to restore V7 in Phase 1

The legacy V7 scripts remain available until V2 restore is proven.

No V7 backup is deleted or migrated automatically.

---

## 39. Security

Phase 1 requirements:

- one-shot container may run as root only to read protected persistence and normalize output ownership
- no Docker socket
- no published port
- instance mount read-only
- app source mount read-only
- Mosquitto source mount read-only
- database password only via process environment
- no secret environment dump
- backup root writable only where required
- state root writable only where required
- generated bundle permissions restrictive
- generated bundle/run-state ownership normalized to the installation directory owner
- root execution must not expand writable host mounts beyond backup/state
- no world-readable secret material
- no source-tree archive

Backup repository default permissions should target:

    directory 0700
    regular metadata/payload 0600

subject to operational needs.

---

## 40. Scheduling interface preparation

Phase 1 does not need to install systemd automatically, but the CLI must be safe for non-interactive scheduling.

A future unit will effectively run:

    cd <instance-dir>
    docker compose run --rm backup create

A scheduled `create` must:

- never prompt
- fail with non-zero code
- record run state
- preserve diagnostics
- not require an interactive TTY

Destructive restore remains interactive by default in later phases.

---

## 41. Release tooling changes required by Phase 1

Implementation will update:

    scripts/release-module-images.sh

to support:

    backup

with:

    image_name=sensorsphere-backup

The Stack validator must validate the component.

The build distribution process automatically carries the updated Compose template and release manifest.

Official image publication rules remain:

- immutable semantic-version tag
- immutable source-revision tag
- provenance
- SBOM
- amd64 + arm64

---

## 42. Build information

Once Backup is a Stack component, the Build Information UI should eventually show:

    Backup
    0.x.y / 1.x.y
    release timestamp

This UI addition is not required to validate the first backup engine implementation, but the Stack manifest must already carry the metadata.

---

## 43. Phase 1 implementation slices

Recommended implementation order:

### Slice A — module skeleton

- `apps/backup`
- Go module
- CLI framework
- version command
- Dockerfile
- unit tests
- multi-arch dry-run build

### Slice B — Stack integration

- Compose backup service/profile
- Stack schema
- manifest validator
- installer version propagation
- release-image tooling

### Slice C — repository/state

- backup root
- state root
- IDs
- locking
- atomic incomplete/final directory handling
- JSON output

### Slice D — database

- connectivity
- metadata
- `pg_dump -Fc`
- globals
- catalog verify
- manifest DB metadata

### Slice E — files

- app-data archive
- Mosquitto persistence archive
- instance metadata whitelist
- zstd archive verification

### Slice F — integrity

- manifest.json
- checksums
- COMPLETE marker
- verify command

### Slice G — operations

- list
- show
- status
- retention dry-run/apply

### Slice H — Stack Release publication

- backup image release
- new Stack Release
- DEV validation
- DIT validation
- TEST1 validation under explicit user control

---

## 44. Phase 1 acceptance gate

Phase 1 is accepted only when all mandatory Phase 1 tests in:

    docs/BACKUP-RESTORE-V2-TEST-PLAN.md

pass.

Minimum acceptance evidence:

- official amd64 image works
- official arm64 image works
- DEV backup succeeds and verifies
- DIT backup succeeds and verifies
- TEST1 backup succeeds and verifies when explicitly tested
- PostgreSQL dump catalog is readable
- History/app persistent data is present
- Mosquitto persistence behavior is correct
- manifest metadata matches source instance
- checksums catch corruption
- incomplete backup is never published
- retention dry-run is safe
- retention apply keeps the newest valid backup
- simultaneous create is rejected cleanly
- failure leaves SensorSphere runtime healthy
- no secret is printed in logs/JSON
- normal `docker compose up -d` does not start backup
- no Docker socket is mounted

---

## 45. Phase 2 boundary

Phase 1 intentionally stops before destructive restore.

Phase 2 starts with:

- data restore engine
- host orchestration wrapper
- pre-restore verified safety backup
- Timescale pre/post restore
- migration compatibility
- health checks
- real isolated recovery

The same backup image is extended rather than creating a separate restore product.

---

## 46. Design principle

The central design principle for implementation is:

> A backup that cannot prove its own integrity is not a successful backup.

And for later restore:

> A backup system that has never restored SensorSphere successfully is not yet a disaster-recovery system.
