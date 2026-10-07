# SensorSphere — Backup / Restore V2 — Test Plan

> **Status:** master validation plan
> **Scope:** complete validation of Backup / Restore V2 from the first Core backup module through scheduling, restore, off-host copy, monitoring and deep verification
> **Related documents:** `BACKUP-RESTORE.md`, `BACKUP-RESTORE-V2.md`, `BACKUP-RESTORE-V2-AUDIT.md`, `BACKUP-RESTORE-V2-PHASE1.md`, `BACKUP-RESTORE-V2-PHASE2.md`

---

# 1. Purpose

This document is the independent test specification for SensorSphere Backup / Restore V2.

It is deliberately separate from the implementation design.

Its purpose is to prove that:

- backups are complete
- backups are internally consistent
- corrupted backups are detected
- incomplete backups are never presented as valid
- retention cannot accidentally delete the only valid recovery point
- multi-instance installations remain isolated
- restore is safe
- restore recreates the expected data
- scheduling is observable
- off-host copies are verifiable
- a real disaster-recovery scenario succeeds

The guiding rule is:

> A backup is not trusted until its integrity has been verified, and the backup system is not trusted until a real restore has succeeded.

---

# 2. Test-plan phases

The test plan is divided into:

    P1  Backup Foundation
    P2  Restore Foundation
    P3  Scheduling / Retention / Monitoring State
    P4  SensorSphere UI / Alerting
    P5  Off-host Encrypted Backup
    P6  Deep Verification
    DR  End-to-End Disaster Recovery

PITR / WAL recovery is not part of the initial V2 acceptance gate and will receive a dedicated test extension if implemented.

---

# 3. Test priorities

Priority classes:

    P0  release blocker / data-loss or security risk
    P1  mandatory functional behavior
    P2  important robustness/usability
    P3  optional/diagnostic

No release may pass a gate with a failing P0 test.

P1 failures require explicit resolution or a documented deferral accepted before release.

---

# 4. Execution environments

## 4.1 DEV

Current source checkout:

    /home/ubuntu/sensorsphere

Characteristics:

- source tree exists
- may not contain .installed
- may not contain .stack-release.yaml
- large database
- useful for performance/load testing

Current observed DB size when this plan was created:

    approximately 3.8 GB

DEV is the preferred environment for:

- development
- unit/integration tests
- large database tests
- failure injection
- performance tests

---

## 4.2 DIT

Current Stack Release installation:

    /home/ubuntu/work/sensorsphere-dit

Characteristics:

- deployed bundle
- .installed exists
- .stack-release.yaml exists
- no source apps/ tree
- validates production-style installation behavior

DIT is mandatory for Phase 1 acceptance.

---

## 4.3 TEST1

Current Stack Release installation:

    /home/ubuntu/tmp/sensorsphere-test1

Characteristics:

- deployed bundle
- real validation data
- actively used functional test environment

Important safety rule:

> No destructive restore/update operation is performed automatically on TEST1 without explicit user approval.

Read-only checks are allowed.

Backup creation and verification may be executed when explicitly included in an agreed test scope.

---

## 4.4 RECOVERY

A dedicated disposable recovery installation must be created for destructive restore testing.

Example conceptual path:

    /home/ubuntu/tmp/sensorsphere-recovery

It must have:

- a unique Compose project
- isolated ports
- isolated DATA_ROOT
- no shared PostgreSQL storage
- no shared Mosquitto storage
- no shared backup-state directory

This environment may be destroyed/recreated freely.

All Phase 2 destructive restore acceptance must occur here before any production-like restore is considered.

---

# 5. Architecture matrix

Official Core Backup images must be validated on:

    linux/amd64
    linux/arm64

At least one automated image-level test must run on each architecture.

Host-level functional tests may use available architecture-specific hosts, but manifest inspection must prove both official variants exist.

---

# 6. Evidence requirements

Every formal validation run should capture:

- date/time UTC
- Stack Release
- Backup module version
- source environment
- source instance
- host architecture
- test IDs executed
- PASS/FAIL
- relevant backup IDs
- relevant run IDs
- backup size
- durations
- error output for failures
- hashes/digests where useful

Evidence may be recorded in:

    docs/test-results/
    CI artifacts
    release notes
    Project Todos evidence

The exact storage mechanism can evolve.

---

# 7. General pass criteria

A test passes only when:

- the expected exit code is returned
- expected files/state are produced
- unexpected side effects are absent
- SensorSphere remains in the expected runtime state
- logs do not expose secrets
- JSON output is valid when requested

A command printing a success-looking message with a wrong exit code is a failure.

---

# 8. General safety checks

Before any destructive test:

1. identify source instance
2. identify target instance
3. confirm target is disposable
4. confirm DATA_ROOT
5. confirm Compose project
6. confirm ports
7. confirm backup root
8. ensure no target path points at DEV/DIT/TEST1 unexpectedly

A destructive test must abort if the target identity is ambiguous.

---

# 9. Phase 1 Gate — Backup Foundation

Phase 1 is accepted only when all P0 and P1 tests in sections 10 through 20 pass.

---

# 10. P1-A — CLI and version tests

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P1-A001 | P0 | Run backup image with no command | Usage shown, exit 2 |
| P1-A002 | P0 | Unknown command | Clear error, exit 2 |
| P1-A003 | P1 | `version` | Module version displayed |
| P1-A004 | P1 | `version --json` | Valid JSON with version/format/PG major |
| P1-A005 | P1 | `--help` | Command help succeeds |
| P1-A006 | P1 | `create --help` | Create-specific help |
| P1-A007 | P1 | `verify --help` | Verify-specific help |
| P1-A008 | P1 | `prune --help` | Prune-specific help |
| P1-A009 | P1 | JSON mode with success | No invalid non-JSON text on stdout |
| P1-A010 | P1 | JSON mode with failure | Structured error + non-zero exit |
| P1-A011 | P2 | Unknown option | Actionable error |
| P1-A012 | P2 | Unicode instance name | Correct UTF-8 output/manifest |

---

# 11. P1-B — Stack Release and packaging tests

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P1-B001 | P0 | Stack manifest includes backup component | Version/image present |
| P1-B002 | P0 | Stack validator checks backup image/version match | Invalid mismatch rejected |
| P1-B003 | P0 | Distribution Compose contains backup service | Service present |
| P1-B004 | P0 | Normal `docker compose up -d` | Backup container does not start |
| P1-B005 | P0 | Backup service has no published ports | None exposed |
| P1-B006 | P0 | Backup service has no Docker socket | Socket absent |
| P1-B007 | P0 | Backup image immutable version tag | Exists and resolves |
| P1-B008 | P0 | Official image amd64 | Present |
| P1-B009 | P0 | Official image arm64 | Present |
| P1-B010 | P1 | Image OCI version label | Correct |
| P1-B011 | P1 | Image OCI revision label | Correct |
| P1-B012 | P1 | SBOM/provenance publication | Present per release policy |
| P1-B013 | P1 | Installer applies backup version from manifest | .env correct |
| P1-B014 | P1 | DIT-style bundle contains service | Works without source tree |
| P1-B015 | P1 | TEST1-style bundle contains service | Works without source tree |
| P1-B016 | P2 | Update between backup versions | New image selected correctly |
| P1-B017 | P2 | Rollback stack manifest | Backup version rolls back consistently |
| P1-B018 | P0 | Stack manifest missing backup on schema requiring it | Validation fails |

---

# 12. P1-C — Configuration and preflight tests

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P1-C001 | P0 | POSTGRES_PASSWORD missing | Configuration failure; no backup published |
| P1-C002 | P0 | Backup root unwritable | Fail before dump |
| P1-C003 | P0 | State root unwritable | Fail clearly |
| P1-C004 | P0 | DB hostname unreachable | Database connectivity error |
| P1-C005 | P0 | Wrong DB password | Authentication error; secret not echoed |
| P1-C006 | P1 | Relative backup root | Resolves correctly through Compose mount |
| P1-C007 | P1 | Absolute backup root | Works |
| P1-C008 | P1 | Custom retention values | Parsed correctly |
| P1-C009 | P1 | Invalid retention number | Rejected |
| P1-C010 | P1 | Warning/critical age values | Parsed correctly |
| P1-C011 | P1 | Missing optional instance name | Safe fallback; manifest explicit |
| P1-C012 | P1 | DEV without .stack-release.yaml | Correct manifest fallback |
| P1-C013 | P1 | DIT with .stack-release.yaml | Exact manifest captured |
| P1-C014 | P1 | TEST1 with .stack-release.yaml | Exact manifest captured |
| P1-C015 | P0 | Stack env and manifest disagree | Backup warns/fails according to policy; never silently lies |
| P1-C016 | P2 | Backup root path with spaces | Correct behavior |
| P1-C017 | P2 | Read-only installation mount | Create succeeds |
| P1-C018 | P0 | Insufficient free-space preflight | Fails before expensive dump |

---

# 13. P1-D — Database backup tests

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P1-D001 | P0 | Create DB dump | Non-empty custom-format dump |
| P1-D002 | P0 | `pg_restore --list` on created dump | Pass |
| P1-D003 | P0 | PostgreSQL server version capture | Exact source value |
| P1-D004 | P0 | PostgreSQL major capture | 17 on current stack |
| P1-D005 | P0 | TimescaleDB version capture | Exact extension version |
| P1-D006 | P0 | Migration level capture | Matches schema_migrations/current stack |
| P1-D007 | P1 | DB size capture | Non-zero and plausible |
| P1-D008 | P1 | Dump size capture | Matches actual file size |
| P1-D009 | P1 | Globals file creation | Non-empty valid SQL when expected |
| P1-D010 | P0 | Kill DB during dump | Create fails; no COMPLETE bundle |
| P1-D011 | P0 | Simulate pg_dump exit non-zero | Failure propagated |
| P1-D012 | P0 | Zero-byte dump injected | Verification rejects |
| P1-D013 | P0 | Truncated dump | Catalog validation rejects |
| P1-D014 | P1 | DB receives writes during pg_dump | Dump remains logically consistent |
| P1-D015 | P1 | Large DEV DB | Backup completes without OOM |
| P1-D016 | P1 | DB client version | pg_dump major compatible with server |
| P1-D017 | P2 | Connection interruption/retry policy | Defined behavior, no false success |
| P1-D018 | P0 | Password in process logs | Must not appear |

---

# 14. P1-E — Application persistent-data tests

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P1-E001 | P0 | history-config.json exists | Present in app archive |
| P1-E002 | P1 | Additional future file in app tree | Included automatically |
| P1-E003 | P1 | Empty app-data directory | Valid empty archive |
| P1-E004 | P0 | Unreadable app file | Backup fails, not silently omitted |
| P1-E005 | P1 | Nested directories | Paths preserved |
| P1-E006 | P1 | Unicode filename | Preserved |
| P1-E007 | P1 | Archive readability test | Pass |
| P1-E008 | P0 | Corrupt app archive after backup | Verify fails |
| P1-E009 | P1 | File changes during archive | Defined result, archive remains readable |
| P1-E010 | P0 | Source tree outside app mount | Not archived |
| P1-E011 | P0 | .git accidentally visible under /instance | Not included in app archive |
| P1-E012 | P2 | Empty file | Preserved |

---

# 15. P1-F — Mosquitto persistence tests

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P1-F001 | P1 | mosquitto.db exists | Included |
| P1-F002 | P1 | mosquitto.db absent on fresh instance | Backup still valid |
| P1-F003 | P0 | Mosquitto source unreadable | Backup fails if source is configured/present |
| P1-F003A | P0 | mosquitto.db mode 0600 owned by 1883:1883 | Backup still captures it through constrained root container execution |
| P1-F004 | P1 | Empty persistence directory | Valid archive |
| P1-F005 | P1 | Nested persistence content | Preserved |
| P1-F006 | P1 | Archive readability | Pass |
| P1-F007 | P0 | Corrupt Mosquitto archive | Verify fails |
| P1-F008 | P1 | `--no-mosquitto` | Manifest marks excluded intentionally |
| P1-F009 | P1 | Mosquitto container stopped | Snapshot still works from mounted data |
| P1-F010 | P1 | Mosquitto container running | Snapshot works/readable |
| P1-F011 | P2 | Persistence file changes during archive | Archive remains structurally valid |
| P1-F012 | P2 | Future flush mechanism | Verify flush timestamp/behavior when implemented |

---

# 16. P1-G — Instance metadata tests

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P1-G001 | P0 | DIT stack release captured | Exact .stack-release.yaml |
| P1-G002 | P0 | TEST1 stack release captured | Exact .stack-release.yaml |
| P1-G003 | P1 | DEV release manifest fallback | Correct release chosen |
| P1-G004 | P1 | docker-compose.yml captured | Exact source file |
| P1-G005 | P1 | .installed present | installed.txt captured |
| P1-G006 | P1 | .installed absent in DEV | Backup remains valid |
| P1-G007 | P0 | installation.json contains password | Must not |
| P1-G008 | P0 | installation.json contains OIDC client secret | Must not |
| P1-G009 | P1 | install host recorded | Correct |
| P1-G010 | P1 | install dir recorded | Correct |
| P1-G011 | P1 | compose project recorded | Correct |
| P1-G012 | P1 | environment recorded | Correct |
| P1-G013 | P1 | instance name recorded | Correct |
| P1-G014 | P0 | Source checkout files | Not recursively included |
| P1-G015 | P0 | Plain .env inside Phase 1 bundle | Must not be present |

---

# 17. P1-H — Manifest and checksum tests

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P1-H001 | P0 | manifest.json valid JSON | Pass |
| P1-H002 | P0 | backupFormatVersion | Equals 1 |
| P1-H003 | P0 | backupId | Matches directory |
| P1-H004 | P0 | runId | Present and valid |
| P1-H005 | P1 | UTC timestamps | Valid ISO-8601 |
| P1-H006 | P1 | Tool version | Correct |
| P1-H007 | P1 | Stack component versions | Match source stack |
| P1-H008 | P0 | Migration version | Correct |
| P1-H009 | P0 | Database metadata | Correct |
| P1-H010 | P1 | Payload paths | All relative/safe |
| P1-H011 | P1 | Payload sizes | Match files |
| P1-H012 | P0 | instanceSecrets.included | false in Phase 1 |
| P1-H013 | P0 | checksums file includes manifest | Yes |
| P1-H014 | P0 | checksums include DB dump | Yes |
| P1-H015 | P0 | checksums include app archive | Yes |
| P1-H016 | P1 | checksums include optional Mosquitto when included | Yes |
| P1-H017 | P0 | Modify one payload byte | Verify fails |
| P1-H018 | P0 | Modify manifest | Verify fails |
| P1-H019 | P0 | Delete payload referenced by manifest | Verify fails |
| P1-H020 | P0 | Add unrelated file | Does not create false verification |
| P1-H021 | P1 | Deterministic checksum path format | Relative paths only |
| P1-H022 | P0 | Path traversal entry in manipulated archive | Verify/recovery rejects before extraction later |

---

# 18. P1-I — Atomicity and incomplete backup tests

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P1-I001 | P0 | Observe during create | Final backup ID not visible as complete |
| P1-I002 | P0 | Kill backup during DB stage | Only .incomplete remains |
| P1-I003 | P0 | Kill during app archive | No COMPLETE final |
| P1-I004 | P0 | Kill during checksum stage | No COMPLETE final |
| P1-I005 | P0 | Kill during verify | No COMPLETE final |
| P1-I006 | P0 | Successful create | Atomic publish to final directory |
| P1-I007 | P0 | COMPLETE created only after verify | Confirm ordering |
| P1-I008 | P0 | Rename failure | Run fails |
| P1-I009 | P1 | Old incomplete directory | list hides by default |
| P1-I010 | P1 | list --all | Shows incomplete status |
| P1-I011 | P0 | prune --apply | Never deletes active .incomplete |
| P1-I012 | P1 | Restart after failed run | New backup can proceed |

---

# 19. P1-J — list / show / status tests

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P1-J001 | P1 | list empty repository | Clean empty result |
| P1-J002 | P1 | list one backup | Correct row |
| P1-J003 | P1 | list multiple | Newest-first |
| P1-J004 | P1 | list --json | Valid array/object |
| P1-J005 | P1 | list --limit | Correct limit |
| P1-J006 | P1 | show explicit ID | Correct manifest |
| P1-J007 | P1 | show latest | Latest VERIFIED |
| P1-J008 | P1 | show nonexistent | Clear failure |
| P1-J009 | P1 | status before first backup | NEVER |
| P1-J010 | P1 | status after success | OK |
| P1-J011 | P1 | status > warning age | WARNING |
| P1-J012 | P1 | status > critical age | CRITICAL |
| P1-J013 | P1 | status --json | Valid structured status |
| P1-J014 | P1 | current failed run | Last success retained separately |
| P1-J015 | P1 | corrupted latest bundle | Status does not call it verified |
| P1-J016 | P2 | State files deleted | list/show recover from bundle repository |

---

# 20. P1-K — Locking and concurrency tests

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P1-K001 | P0 | Start two create commands simultaneously | One succeeds/continues, other exit lock error |
| P1-K002 | P0 | Second create does not alter first run state | Isolation |
| P1-K003 | P1 | list during create | Works |
| P1-K004 | P1 | show previous backup during create | Works |
| P1-K005 | P1 | verify previous backup during create | Works |
| P1-K006 | P0 | prune --apply during create | Rejected or safely serialized |
| P1-K007 | P1 | prune --dry-run during create | Safe |
| P1-K008 | P0 | Kill lock-holding process | Lock released by OS |
| P1-K009 | P1 | Stale lock file | Does not permanently block |
| P1-K010 | P1 | Two different instances simultaneously | Both can create |
| P1-K011 | P0 | Shared state path accidentally configured across instances | Detect/avoid cross-instance corruption |
| P1-K012 | P2 | High-frequency repeated create | Unique IDs |

---

# 21. P1-L — Retention tests

Test dataset must include backups crossing:

- multiple days
- multiple ISO weeks
- multiple months
- year boundary

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P1-L001 | P0 | prune without mode | Defaults dry-run |
| P1-L002 | P0 | dry-run | Deletes nothing |
| P1-L003 | P1 | daily=7 | Correct 7 daily representatives |
| P1-L004 | P1 | weekly=4 | Correct weekly representatives |
| P1-L005 | P1 | monthly=6 | Correct monthly representatives |
| P1-L006 | P0 | newest VERIFIED backup | Always kept |
| P1-L007 | P0 | only one valid backup | Never deleted |
| P1-L008 | P0 | incomplete backup | Not counted as recovery point |
| P1-L009 | P0 | corrupt backup | Not selected as valid retained point |
| P1-L010 | P1 | duplicate day backups | Policy deterministic |
| P1-L011 | P1 | week boundary | Correct ISO-week behavior |
| P1-L012 | P1 | month boundary | Correct |
| P1-L013 | P1 | year boundary | Correct |
| P1-L014 | P1 | retention value 0 | Defined semantics |
| P1-L015 | P1 | --apply | Deletes only planned IDs |
| P1-L016 | P0 | deletion filesystem error | Report failure; do not misreport success |
| P1-L017 | P1 | JSON dry-run | Exact keep/delete plan |
| P1-L018 | P2 | Large repository listing | Reasonable runtime |

---

# 22. P1-M — Security tests

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P1-M001 | P0 | Inspect Compose | No Docker socket |
| P1-M002 | P0 | Inspect container ports | None published |
| P1-M003 | P0 | Inspect installation mount | Read-only |
| P1-M004 | P0 | Inspect app mount | Read-only |
| P1-M005 | P0 | Inspect Mosquitto mount | Read-only |
| P1-M006 | P0 | Grep run logs for POSTGRES_PASSWORD | Not present |
| P1-M007 | P0 | Grep JSON output for POSTGRES_PASSWORD | Not present |
| P1-M008 | P0 | Grep bundle for Google client secret | Not present Phase 1 |
| P1-M009 | P0 | Grep bundle for Microsoft client secret | Not present Phase 1 |
| P1-M010 | P0 | Grep bundle for API/token secrets known in .env | Not present |
| P1-M011 | P1 | Backup root directory mode | Restrictive |
| P1-M012 | P1 | Bundle file modes | Restrictive |
| P1-M013 | P0 | Archive symlink escape attempt | Reject unsafe path on future extract; verify flags |
| P1-M014 | P0 | Manipulated manifest path ../ | Reject |
| P1-M015 | P0 | One-shot container runs root with constrained mounts | Only backup/state writable; source mounts read-only; no Docker socket |
| P1-M015A | P0 | Bundle ownership after root container create | Matches mounted /instance host UID/GID |
| P1-M015B | P0 | Run-state ownership after root container create | Matches mounted /instance host UID/GID |
| P1-M015C | P1 | Bundle directory/file modes | Directories 0700, protected files 0600 |
| P1-M016 | P1 | DB password containing shell metacharacters | Safe, no command injection |
| P1-M017 | P1 | Instance name containing shell metacharacters | Safe |
| P1-M018 | P0 | Backup label containing path traversal | Sanitized/rejected |

---

# 23. P1-N — Multi-instance isolation tests

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P1-N001 | P0 | Backup DEV | Manifest says DEV |
| P1-N002 | P0 | Backup DIT | Manifest says DIT |
| P1-N003 | P0 | Backup TEST1 | Manifest says TEST1 |
| P1-N004 | P0 | DIT backup DB identity | DIT DB only |
| P1-N005 | P0 | TEST1 backup DB identity | TEST1 DB only |
| P1-N006 | P0 | Different backup roots | No cross-write |
| P1-N007 | P0 | Different state roots | No cross-run history |
| P1-N008 | P0 | Same host concurrent backups | Correct instance isolation |
| P1-N009 | P1 | Same backup module image | Works across all instances |
| P1-N010 | P1 | Different stack versions | Manifest captures each exact version |
| P1-N011 | P0 | Run from wrong directory intentionally | Source identity makes error obvious |
| P1-N012 | P0 | Misconfigured Compose project | Detect inconsistency where possible |
| P1-N013 | P1 | Instance color/name does not affect storage safety | Safe |
| P1-N014 | P1 | Custom DATA_ROOT per instance | Correct mounted sources |
| P1-N015 | P0 | No source checkout in DIT/TEST1 | Backup fully functional |

---

# 24. P1-O — Failure-injection tests

| ID | Pri | Failure | Expected |
| --- | --- | --- | --- |
| P1-O001 | P0 | DB unavailable before create | Fast fail |
| P1-O002 | P0 | DB stops mid-dump | Failed run |
| P1-O003 | P0 | Backup filesystem becomes read-only | Failed run |
| P1-O004 | P0 | Disk full during dump | Failed run; no final backup |
| P1-O005 | P0 | Disk full during app archive | Failed run |
| P1-O006 | P0 | Disk full during checksum write | Failed run |
| P1-O007 | P0 | Kill -9 backup process | No final valid bundle |
| P1-O008 | P0 | Corrupt manifest before publish test hook | Verify blocks publish |
| P1-O009 | P0 | Corrupt dump before publish test hook | Verify blocks publish |
| P1-O010 | P0 | Permission loss on app-data | Failed run |
| P1-O011 | P0 | Permission loss on Mosquitto data | Failed unless deliberately excluded |
| P1-O012 | P1 | Missing optional .installed | Still works |
| P1-O013 | P0 | Missing all stack metadata | Explicit degraded/failure policy |
| P1-O014 | P1 | Clock/timezone differs | IDs/timestamps remain UTC |
| P1-O015 | P1 | Hostname lookup failure | Safe fallback |
| P1-O016 | P1 | State write fails after backup payload | Backup publication policy deterministic |
| P1-O017 | P0 | Verification command interrupted | Existing bundle remains untouched |
| P1-O018 | P0 | Prune interrupted | No unrelated deletion |
| P1-O019 | P2 | Very long filesystem path | Defined behavior |
| P1-O020 | P1 | zstd/tar internal failure | Non-zero propagated |

---

# 25. P1-P — Runtime non-regression tests

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P1-P001 | P0 | SensorSphere before backup | Healthy |
| P1-P002 | P0 | Run create | API remains healthy |
| P1-P003 | P0 | Run create | Ingestion remains active |
| P1-P004 | P0 | Run create | Frontend remains healthy |
| P1-P005 | P0 | Run create | Nginx remains healthy |
| P1-P006 | P0 | Run create | Mosquitto remains available |
| P1-P007 | P0 | Run verify | No runtime service restart |
| P1-P008 | P0 | Run list/show/status | No runtime service restart |
| P1-P009 | P0 | Run prune | No runtime service restart |
| P1-P010 | P1 | Measurement ingestion during DEV backup | Continues |
| P1-P011 | P1 | Device agents heartbeat during backup | Continues |
| P1-P012 | P1 | UI History read during backup | Continues |

---

# 26. P1-Q — Performance / capacity tests

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P1-Q001 | P1 | Backup DEV ~multi-GB DB | Completes |
| P1-Q002 | P1 | Peak RAM measurement | Within documented bound |
| P1-Q003 | P1 | Peak CPU measurement | Recorded |
| P1-Q004 | P1 | Backup duration | Recorded |
| P1-Q005 | P1 | pg_dump duration | Recorded |
| P1-Q006 | P1 | app archive duration | Recorded |
| P1-Q007 | P1 | checksum duration | Recorded |
| P1-Q008 | P1 | verify duration | Recorded |
| P1-Q009 | P1 | source DB size vs dump size | Recorded ratio |
| P1-Q010 | P0 | Free space below safety limit | Early fail |
| P1-Q011 | P1 | Free space just above limit | Defined behavior |
| P1-Q012 | P2 | nice/I/O priority later | No severe ingestion impact |
| P1-Q013 | P1 | Backup size in manifest | Correct |
| P1-Q014 | P1 | State/log growth | Bounded/retention plan documented |

---

# 27. Phase 1 environment acceptance scenarios

## P1-ACC-DEV

Priority:

    P0

Procedure:

1. record current DEV Stack/module versions
2. run baseline health checks
3. create backup
4. verify backup
5. inspect manifest
6. inspect app archive
7. inspect DB catalog
8. check runtime health
9. run status
10. run retention dry-run

Expected:

    PASS all mandatory checks

---

## P1-ACC-DIT

Priority:

    P0

Procedure:

1. use deployed DIT bundle with no source apps tree
2. create backup through Compose module
3. verify
4. confirm exact DIT Stack manifest
5. confirm DIT DB identity
6. confirm no Git/source dependency

Expected:

    PASS

---

## P1-ACC-TEST1

Priority:

    P0

Execution requires explicit agreed validation timing.

Procedure:

1. create local TEST1 backup
2. verify
3. ensure TEST1 remains healthy
4. inspect manifest
5. confirm current real data is represented

No restore occurs in Phase 1.

Expected:

    PASS

---

# 28. Phase 2 Gate — Restore Foundation

Phase 2 is accepted only after a real restore into RECOVERY succeeds.

No Phase 2 test initially targets TEST1 destructively.

---

# 29. P2-A — Restore CLI safety

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P2-A001 | P0 | restore without backup ID | Refuse |
| P2-A002 | P0 | restore nonexistent backup | Refuse |
| P2-A003 | P0 | restore corrupt backup | Refuse before target mutation |
| P2-A004 | P0 | restore unverified backup | Refuse/default safe policy |
| P2-A005 | P0 | source/target identity display | Correct |
| P2-A006 | P0 | destructive confirmation | Required interactively |
| P2-A007 | P0 | non-interactive without explicit flag | Refuse |
| P2-A008 | P0 | target looks like DEV when recovery expected | Warning/refuse per safeguards |
| P2-A009 | P0 | target DATA_ROOT ambiguous | Refuse |
| P2-A010 | P0 | Docker socket not permanent in backup module | Confirm |
| P2-A011 | P1 | cancel confirmation | No target changes |
| P2-A012 | P1 | JSON preflight mode | Valid machine-readable result |

---

# 30. P2-B — Pre-restore safety backup

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P2-B001 | P0 | Restore starts | Safety backup created first |
| P2-B002 | P0 | Safety backup verify fails | Restore aborts |
| P2-B003 | P0 | Safety backup disk insufficient | Restore aborts before mutation |
| P2-B004 | P1 | Safety backup manifest | Identifies target-before-restore |
| P2-B005 | P1 | Safety backup retained after restore success | Yes for defined period |
| P2-B006 | P0 | Restore failure | Safety backup remains available |

---

# 31. P2-C — Data restore database sequence

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P2-C001 | P0 | Writers stopped/quiesced | Confirm before DB drop |
| P2-C002 | P0 | Target active DB sessions | Terminated safely |
| P2-C003 | P0 | Target DB dropped | Correct DB only |
| P2-C004 | P0 | Empty DB recreated | Correct owner |
| P2-C005 | P0 | Timescale extension enabled | Success |
| P2-C006 | P0 | pre_restore called | Success |
| P2-C007 | P0 | pg_restore | Success |
| P2-C008 | P0 | post_restore called | Success |
| P2-C009 | P1 | ANALYZE | Success |
| P2-C010 | P0 | No parallel unsafe pg_restore | Confirm |
| P2-C011 | P0 | Restore failure while in restore mode | Cleanup attempts post_restore |
| P2-C012 | P0 | Wrong DB target | Must not touch unrelated DB |
| P2-C013 | P0 | PostgreSQL major incompatible | Reject preflight |
| P2-C014 | P0 | Timescale version incompatible | Reject/warn by compatibility policy |
| P2-C015 | P0 | Migration level too new for target API | Reject preflight |
| P2-C016 | P1 | Older source supported by target | Migrate forward correctly |

---

# 32. P2-D — Application-data restore

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P2-D001 | P0 | Restore history-config | Exact content |
| P2-D002 | P1 | Restore nested app files | Exact |
| P2-D003 | P0 | Corrupt archive | Refused before overwrite |
| P2-D004 | P0 | Path traversal archive | Reject |
| P2-D005 | P1 | Existing target app data | Replaced according to restore semantics |
| P2-D006 | P1 | Empty source app data | Defined result |
| P2-D007 | P0 | Restore write failure | Failure + safety backup retained |

---

# 33. P2-E — Mosquitto restore

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P2-E001 | P1 | Source mosquitto.db present | Restored |
| P2-E002 | P1 | Source mosquitto.db absent | Valid empty continuity state |
| P2-E003 | P0 | Corrupt Mosquitto archive | Refused |
| P2-E004 | P0 | Mosquitto stopped during destructive file replace | Confirm |
| P2-E005 | P1 | Mosquitto restart | Healthy |
| P2-E006 | P2 | Persistent session test | State preserved where applicable |

---

# 34. P2-F — Data restore target-preservation

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P2-F001 | P0 | DEV backup -> RECOVERY data restore | Target instance name preserved |
| P2-F002 | P0 | Target environment preserved | Yes |
| P2-F003 | P0 | Target public URL preserved | Yes |
| P2-F004 | P0 | Target ports preserved | Yes |
| P2-F005 | P0 | Target Compose project preserved | Yes |
| P2-F006 | P0 | Target install dir preserved | Yes |
| P2-F007 | P0 | Target OIDC secrets not overwritten | Yes |
| P2-F008 | P1 | Source instance metadata still viewable in restore report | Yes |

---

# 35. P2-G — Migration and runtime validation

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P2-G001 | P0 | Migrations container | Exit 0 |
| P2-G002 | P0 | schema_migrations level | Expected |
| P2-G003 | P0 | Timescale healthy | Yes |
| P2-G004 | P0 | API healthy | Yes |
| P2-G005 | P0 | Frontend healthy | Yes |
| P2-G006 | P0 | Nginx healthy | Yes |
| P2-G007 | P0 | Ingestion running | Yes |
| P2-G008 | P0 | Mosquitto running | Yes |
| P2-G009 | P1 | Build info | Target stack consistent |
| P2-G010 | P0 | No local source build required | Confirm |

---

# 36. P2-H — Data equivalence tests

Before backup, capture a source snapshot report.

Compare after restore:

| ID | Pri | Data | Expected |
| --- | --- | --- | --- |
| P2-H001 | P0 | Device Registry device count | Equal/expected |
| P2-H002 | P0 | Identity count | Equal |
| P2-H003 | P0 | Entity count | Equal |
| P2-H004 | P0 | Device Checks count | Equal |
| P2-H005 | P0 | Slot count | Equal |
| P2-H006 | P0 | Agent records | Equal/expected freshness |
| P2-H007 | P1 | Project/administration data | Equal where applicable |
| P2-H008 | P0 | History config | Equal |
| P2-H009 | P0 | Measurement earliest timestamp | Equal |
| P2-H010 | P0 | Measurement latest pre-backup timestamp | Present |
| P2-H011 | P1 | Representative measurements checksum/query | Equal |
| P2-H012 | P0 | Registered Proxmox pve-1 on TEST-derived backup | Preserved where source contains it |
| P2-H013 | P1 | Removed/tombstone/entity lifecycle data | Preserved |
| P2-H014 | P1 | User/admin records | Preserved when source has auth |
| P2-H015 | P1 | Runtime managed-agent metadata | Preserved/expected |

---

# 37. P2-I — Post-restore ingestion test

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P2-I001 | P0 | Publish controlled MQTT sample after restore | Accepted |
| P2-I002 | P0 | Ingestion stores new measurement | Yes |
| P2-I003 | P0 | API queries new measurement | Yes |
| P2-I004 | P0 | Frontend/History can read it | Yes |
| P2-I005 | P1 | Existing pre-restore history still readable | Yes |
| P2-I006 | P1 | Agent heartbeat resumes | Yes |

---

# 38. P2-J — Restore failure injection

| ID | Pri | Failure | Expected |
| --- | --- | --- | --- |
| P2-J001 | P0 | pg_restore forced failure | Overall restore FAILED |
| P2-J002 | P0 | DB creation failure | Stop |
| P2-J003 | P0 | post_restore failure | Critical failure reported |
| P2-J004 | P0 | app-data restore failure | Overall restore FAILED |
| P2-J005 | P0 | migration failure | Overall restore FAILED |
| P2-J006 | P0 | API health failure | Restore not declared success |
| P2-J007 | P0 | Nginx health failure | Restore not declared success |
| P2-J008 | P0 | Disk full mid-restore | Failure + safety backup retained |
| P2-J009 | P0 | Process killed mid-restore | State indicates interrupted/failed |
| P2-J010 | P0 | Retry after failed restore | Defined safe behavior |

---

# 39. Phase 2 acceptance scenario

## P2-ACC-001 — DEV to clean RECOVERY

Priority:

    P0

Steps:

1. create and verify fresh DEV backup
2. capture source equivalence report
3. create empty RECOVERY installation
4. perform data restore
5. verify migration
6. verify health
7. compare source/target data
8. publish MQTT sample
9. verify new ingestion
10. retain safety backup/evidence

Expected:

    PASS

No Phase 2 release is accepted without this scenario.

---

# 40. Phase 3 Gate — Scheduling and retention

---

# 41. P3-A — systemd scheduling tests

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P3-A001 | P0 | Per-instance timer install | Correct instance |
| P3-A002 | P0 | DEV and DIT timers | Independent |
| P3-A003 | P0 | Timer runs one-shot Compose command | Success |
| P3-A004 | P0 | Persistent=true behavior after host downtime | Missed run handled |
| P3-A005 | P1 | Next run visible | Correct |
| P3-A006 | P0 | Timer failure | Non-zero visible in systemd |
| P3-A007 | P0 | Failed scheduled run state | Recorded |
| P3-A008 | P1 | Manual create while timer due | Lock handles |
| P3-A009 | P1 | Reboot | Timer remains configured |
| P3-A010 | P1 | Stack update | Timer still valid |
| P3-A011 | P1 | Install dir with spaces | Unit escaping correct |
| P3-A012 | P0 | Wrong instance WorkingDirectory | Detect/config prevents |
| P3-A013 | P1 | Disable schedule | No future runs |
| P3-A014 | P1 | Re-enable schedule | Works |
| P3-A015 | P2 | Randomized delay optional | Correct if implemented |

---

# 42. P3-B — stale status tests

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P3-B001 | P1 | Last verified <26h | OK |
| P3-B002 | P1 | >26h | WARNING |
| P3-B003 | P1 | >48h | CRITICAL |
| P3-B004 | P1 | Never backed up | NEVER/critical semantics |
| P3-B005 | P0 | Latest run failed but previous valid <26h | Failure visible separately |
| P3-B006 | P0 | Latest backup corrupt | Not counted as verified |
| P3-B007 | P1 | Threshold overrides | Applied |

---

# 43. Phase 4 Gate — UI and alerts

---

# 44. P4-A — Backup Administration UI

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P4-A001 | P0 | Admin page loads | No error |
| P4-A002 | P1 | Last successful backup | Correct |
| P4-A003 | P1 | Backup age | Correct |
| P4-A004 | P1 | Backup size | Correct |
| P4-A005 | P1 | Duration | Correct |
| P4-A006 | P1 | Verification | Correct |
| P4-A007 | P1 | Next schedule | Correct |
| P4-A008 | P1 | Retention policy | Correct |
| P4-A009 | P1 | History list | Correct |
| P4-A010 | P1 | Failed run | Visible |
| P4-A011 | P1 | Local/remote state | Distinct |
| P4-A012 | P1 | View manifest | Secrets absent |
| P4-A013 | P1 | View log | Secrets absent |
| P4-A014 | P0 | Restore action initially absent/disabled | Correct |
| P4-A015 | P1 | Responsive layout | Usable |

---

# 45. P4-B — Global status/alerts

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P4-B001 | P1 | Healthy backup | Normal indicator |
| P4-B002 | P1 | Warning age | Warning indicator |
| P4-B003 | P1 | Critical age | Error/critical indicator |
| P4-B004 | P0 | Last run failed | Failure visible |
| P4-B005 | P1 | Local OK remote failed | Distinct warning |
| P4-B006 | P1 | Deep verify failed | Critical/defined |
| P4-B007 | P1 | Click indicator | Opens relevant page |
| P4-B008 | P1 | Auto-refresh | Status updates |
| P4-B009 | P1 | Disabled backup schedule | Clearly indicated |
| P4-B010 | P0 | Non-admin permissions | Enforced |

---

# 46. Phase 5 Gate — Off-host encrypted backup

---

# 47. P5-A — Encryption tests

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P5-A001 | P0 | Remote repository content inspection | No plaintext secrets |
| P5-A002 | P0 | Wrong repository password/key | Cannot read |
| P5-A003 | P0 | Correct key | Can inspect/restore |
| P5-A004 | P0 | Key not stored only on SensorSphere host | Operational check |
| P5-A005 | P1 | Key rotation procedure | Works/documented |
| P5-A006 | P0 | Logs | No key/password |
| P5-A007 | P0 | JSON status | No key/password |

---

# 48. P5-B — Remote backend tests

Backends as implemented:

    local/restic
    SFTP
    S3-compatible

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P5-B001 | P0 | Push verified bundle | Remote success |
| P5-B002 | P0 | Network unavailable | Local remains success, remote failed |
| P5-B003 | P0 | Remote credentials wrong | Clear failure |
| P5-B004 | P0 | Remote repository read-only | Clear failure |
| P5-B005 | P1 | Retry | Defined safe behavior |
| P5-B006 | P0 | Remote snapshot verify/check | Pass |
| P5-B007 | P1 | Remote retention | Correct |
| P5-B008 | P0 | Local deleted after valid remote copy only if policy says | Safe |
| P5-B009 | P0 | Remote corrupt repository | Detected |
| P5-B010 | P1 | Large DEV backup | Transfer completes |
| P5-B011 | P1 | Interrupted upload | Resume/dedup behavior correct |
| P5-B012 | P1 | Repeated similar backup | Dedup measurable |
| P5-B013 | P0 | Wrong instance tag/path | No cross-instance confusion |
| P5-B014 | P1 | SFTP backend | Pass when supported |
| P5-B015 | P1 | S3-compatible backend | Pass when supported |

---

# 49. Phase 6 Gate — Deep verification

---

# 50. P6-A — Isolated restore verifier

| ID | Pri | Test | Expected |
| --- | --- | --- | --- |
| P6-A001 | P0 | Deep verify valid backup | PASS |
| P6-A002 | P0 | Temporary DB isolated | No production DB contact |
| P6-A003 | P0 | Restore dump | Success |
| P6-A004 | P0 | Timescale extension | Correct |
| P6-A005 | P0 | Migration/schema checks | Pass |
| P6-A006 | P0 | Sanity queries | Pass |
| P6-A007 | P0 | Corrupt dump | Deep verify fails |
| P6-A008 | P0 | Semantically invalid DB fixture | Fails relevant sanity check |
| P6-A009 | P1 | Temporary resources removed after success | Yes |
| P6-A010 | P1 | Temporary resources removed after failure | Yes |
| P6-A011 | P0 | Never connects to source production DB during restore stage | Confirm |
| P6-A012 | P1 | Deep verify duration recorded | Yes |
| P6-A013 | P1 | Weekly schedule | Works |
| P6-A014 | P1 | UI status later | Correct |
| P6-A015 | P0 | Deep verify failure alert | Raised |

---

# 51. Full disaster recovery gate

A production-ready V2 recovery system requires the DR gate.

---

# 52. DR-001 — Loss of original host simulation

Priority:

    P0

Scenario:

1. create a VERIFIED backup
2. copy it to off-host encrypted repository
3. record only documented recovery prerequisites
4. make source SensorSphere unavailable to the recovery operator
5. provision a clean host
6. install Docker/Compose prerequisites
7. retrieve the required Stack Release / backup module
8. retrieve the backup from remote storage
9. decrypt required protected instance configuration
10. reconstruct the instance
11. restore DB
12. restore app data
13. restore Mosquitto state
14. run migrations
15. start stack
16. run health checks
17. compare source evidence
18. test ingestion

Expected:

    SensorSphere is recovered without access to the original host filesystem.

---

# 53. DR-002 — Stack Release availability

Priority:

    P0

Test:

- restore requires an older exact Stack Release
- release exists publicly

Expected:

    recovery retrieves/verifies it successfully

Then test unavailable release:

Expected:

    fail clearly before destructive action unless documented compatible upgrade path exists

---

# 54. DR-003 — Data restore into newer compatible Stack

Priority:

    P1

Scenario:

- backup source migration level is older
- target API compatibility range supports it
- restore then migrations

Expected:

    supported upgrade succeeds

---

# 55. DR-004 — Data restore into incompatible older Stack

Priority:

    P0

Expected:

    rejected before target mutation

---

# 56. DR-005 — Recovery-key loss scenario

Priority:

    P0

Purpose:

prove operational documentation makes clear that encrypted secret recovery is impossible without the external key.

Expected:

- data backup may still be recoverable if separately accessible
- protected environment secrets cannot be decrypted
- tool reports exact limitation
- no insecure bypass exists

---

# 57. DR-006 — Backup repository loss

Priority:

    P1

Scenario:

- local backup disk lost
- remote repository still available

Expected:

    full recovery possible from remote copy

---

# 58. DR-007 — SensorSphere DB fully corrupted

Priority:

    P0

Scenario:

- original DB cannot start / is unusable
- recovery tool and verified backup available

Expected:

    recovery does not depend on original DB

---

# 59. DR-008 — SensorSphere API/frontend unavailable

Priority:

    P0

Expected:

    CLI recovery works independently

---

# 60. DR-009 — Multi-instance host loss

Priority:

    P0

Scenario:

host contains:

    DEV
    DIT
    TEST1-like instances

Recover two different instances from their own remote backups.

Expected:

- no repository cross-over
- correct instance identity
- correct data per instance

---

# 61. DR-010 — Measured RTO

Priority:

    P1

During final DR test record:

    retrieval duration
    DB restore duration
    file restore duration
    migrations duration
    health-validation duration
    total recovery duration

Use the measurements to define a realistic RTO.

---

# 62. DR-011 — Measured RPO

Priority:

    P1

For daily logical backups, verify the worst-case recoverable timestamp.

Document:

    effective logical-backup RPO

Later PITR work should explicitly improve this metric.

---

# 63. DR-012 — Operator-only documentation test

Priority:

    P0

Give the recovery documentation and required credentials/keys to an operator who did not implement the feature.

Expected:

    operator can complete recovery without undocumented knowledge

This is one of the strongest usability tests.

---

# 64. Data-set requirements

The formal restore test dataset should include at least:

- multiple Device Agents
- at least one Monitoring Agent
- at least one Supervisor Agent if applicable
- Device Registry entries
- multiple identity types
- at least one Proxmox PVE node
- entities
- active + removed entity lifecycle examples
- slots
- Device Checks
- History configuration
- sufficient time-series measurements
- manually entered data
- administration/user data where auth is enabled
- Mosquitto persistence if meaningful

This prevents a technically successful restore of an unrealistically empty database.

---

# 65. Representative SQL/data snapshot

Before formal restore, the test harness should generate a source snapshot report.

The exact SQL evolves with schema, but should include:

- migration level
- table row counts
- registry device count
- identity count by type
- entity count/status
- agent count/version
- check count
- slot count
- earliest/latest measurement timestamps
- representative aggregate/checksum values

The report must avoid secrets.

The same report is generated after restore and compared.

---

# 66. Test automation policy

Automate wherever deterministic:

- CLI parser tests
- manifest tests
- checksum corruption
- retention fixtures
- locking
- JSON schemas
- path-safety tests
- DB integration tests
- Compose packaging tests

Keep explicit/manual validation for:

- real Stack Release DIT backup
- real TEST1 backup
- destructive recovery scenario
- off-host credential/key procedure
- operator documentation test

---

# 67. Unit-test expectations

The Go module should have unit tests for at least:

- Backup ID generation
- manifest serialization/deserialization
- manifest schema validation
- checksum generation/validation
- retention selection
- UTC/date bucket logic
- path sanitization
- archive path validation
- config parsing
- environment redaction
- state transitions
- exit-code mapping
- size formatting
- age status
- Stack manifest parsing
- compatibility checks

Target:

    critical pure functions >= 90% statement coverage

Coverage percentage is not a substitute for integration tests.

---

# 68. Integration-test expectations

Containerized integration tests should cover:

- PostgreSQL 17
- TimescaleDB current supported image
- pg_dump
- pg_restore catalog
- app-data mounted fixture
- Mosquitto fixture
- backup root
- state root
- corruption scenarios

No host npm/node/tool installation is required for these tests.

---

# 69. Regression suite

Every future Backup module release must rerun at minimum:

    P1 mandatory automated suite
    Stack packaging suite
    manifest/checksum suite
    retention suite
    DB dump/catalog suite
    security redaction suite

Restore-capable releases additionally rerun:

    P2 automated restore integration
    one real RECOVERY restore

Major Stack/PostgreSQL/Timescale changes require expanded DR validation.

---

# 70. PostgreSQL / Timescale upgrade trigger

A change to any of the following requires explicit backup/restore compatibility testing:

- PostgreSQL major
- TimescaleDB major/minor when restore-sensitive
- migrations framework
- migration-level compatibility policy
- DB user/ownership model

Do not assume logical dumps remain automatically compatible without validation.

---

# 71. Stack schema change trigger

Any Stack Release schema change affecting:

- component naming
- image metadata
- migrations
- compatibility block
- install metadata

requires:

- manifest parser tests
- old/new Stack backup tests
- restore compatibility tests where applicable

---

# 72. Security regression trigger

Any feature that adds:

- remote credentials
- encryption keys
- OIDC secrets
- Docker socket
- host mounts
- UI-triggered backup actions

requires a dedicated security review and new P0 tests.

---

# 73. Test result template

Each formal validation report should include:

    Test run ID:
    Date UTC:
    Operator:
    Host:
    Architecture:

    SensorSphere Stack:
    Backup module:
    PostgreSQL:
    TimescaleDB:

    Source instance:
    Target instance:

    Tests:
      PASS:
      FAIL:
      SKIP:

    Backup IDs:
    Restore IDs:

    DB source size:
    Backup size:
    Backup duration:
    Verify duration:
    Restore duration:

    Known deviations:
    Evidence:

    Final gate:
      PASS / FAIL

---

# 74. Phase 1 release checklist

Before publishing the first Phase 1 stack:

- [ ] Backup module image built
- [ ] amd64 manifest present
- [ ] arm64 manifest present
- [ ] Stack schema updated
- [ ] Stack validator updated
- [ ] installer propagates Backup version
- [ ] Compose profile does not start by default
- [ ] no Docker socket
- [ ] unit tests pass
- [ ] DB integration tests pass
- [ ] corruption tests pass
- [ ] retention tests pass
- [ ] concurrency tests pass
- [ ] secret-redaction tests pass
- [ ] DEV create+verify pass
- [ ] DIT create+verify pass
- [ ] TEST1 create+verify pass when explicitly executed
- [ ] runtime health unchanged
- [ ] documentation updated
- [ ] test evidence stored

---

# 75. Phase 2 release checklist

- [ ] all Phase 1 regression tests pass
- [ ] restore preflight tests pass
- [ ] pre-restore safety backup pass
- [ ] DB restore integration pass
- [ ] app-data restore pass
- [ ] Mosquitto restore pass
- [ ] migration validation pass
- [ ] health checks pass
- [ ] source/target data equivalence pass
- [ ] MQTT ingestion after restore pass
- [ ] failure-injection restore tests pass
- [ ] DEV -> RECOVERY real restore pass
- [ ] no destructive TEST1 restore performed without explicit approval

---

# 76. Production-readiness checklist

Before relying on Backup V2 as the only recovery mechanism:

- [ ] local Phase 1 accepted
- [ ] restore Phase 2 accepted
- [ ] scheduling accepted
- [ ] stale/failure visibility accepted
- [ ] off-host encrypted backup accepted
- [ ] deep verification accepted
- [ ] DR clean-host recovery accepted
- [ ] external recovery key documented/stored safely
- [ ] operator-only recovery test passed
- [ ] measured RTO documented
- [ ] effective RPO documented

Until these are complete, existing V7 or other proven backup safeguards should not be removed solely because V2 exists.

---

# 77. Final acceptance principle

SensorSphere Backup / Restore V2 reaches production-ready status only when all of the following are true:

    backup creation is proven
        +
    corruption detection is proven
        +
    retention safety is proven
        +
    restore is proven
        +
    independent clean-host recovery is proven
        +
    off-host recovery is proven
        =
    trusted disaster recovery

A green "backup completed" message alone is never sufficient evidence.
