# SensorSphere Backup/Restore V2 — Phase 1 DEV Results

Date: 2026-10-03
PR: PR-328 — Backup / Restore V2 Foundation
Environment: DEV
Host: na-01
Instance: SensorSphere [Dev]

## Result

P1-ACC-DEV procedure: **PASS**.

Phase 1 as a whole is **not yet declared complete**. DIT, publication checks,
multi-architecture GHCR checks, TEST1 acceptance, and several explicit
failure-injection/capacity cases remain separate gates.

Latest verified DEV recovery point at the end of this run:

    20261003T045218Z-f1615292

Previous verified concurrency recovery point:

    20261003T044803Z-25d62a6a

## Security correction discovered during P1-M validation

The initial runtime used `postgres:17-bookworm`. Runtime inspection showed
that this inherited both `EXPOSE 5432/tcp` and an anonymous writable
`/var/lib/postgresql/data` volume.

The runtime was changed to `debian:bookworm-slim` with PostgreSQL 17 client
tools installed from the official PGDG repository.

Revalidation after the change:

- image ExposedPorts: none
- image Volumes: none
- published port bindings: none
- Docker socket: absent
- `/instance`: read-only
- `/source/app`: read-only
- `/source/mosquitto`: read-only
- `/backups`: writable
- `/state`: writable
- PostgreSQL client tools: 17.11

## Directly validated test IDs

CLI / packaging:

    P1-A001..P1-A011 except P1-A012
    P1-B001, P1-B002, P1-B003, P1-B004, P1-B005, P1-B006, P1-B018

Configuration / DB:

    P1-C009, P1-C017, P1-C018
    P1-D001..P1-D009, P1-D013, P1-D015, P1-D016

Payload / metadata:

    P1-E001, P1-E007, P1-E010, P1-E011
    P1-F001, P1-F003A, P1-F006, P1-F010
    P1-G004, P1-G007..P1-G015 except DIT/TEST1-specific cases

Manifest / integrity / atomicity:

    P1-H001..P1-H019 except P1-H020 and P1-H022
    P1-H021
    P1-I006, P1-I007, P1-I009, P1-I010, P1-I011, P1-I012

Repository / status:

    P1-J002..P1-J014 except P1-J015 and P1-J016

Concurrency / retention:

    P1-K001..P1-K007
    P1-L001, P1-L002, P1-L006, P1-L007, P1-L008, P1-L009, P1-L017

Security:

    P1-M001..P1-M005
    P1-M008, P1-M009, P1-M010
    P1-M011, P1-M012, P1-M013, P1-M014
    P1-M015, P1-M015A, P1-M015B, P1-M015C

Environment / runtime / capacity:

    P1-N001
    P1-P001, P1-P002, P1-P004, P1-P005, P1-P006, P1-P007, P1-P008, P1-P009
    P1-Q001, P1-Q004, P1-Q009, P1-Q013

## Controlled corruption results

All tests used temporary copies, never the real recovery points.

- modified payload byte: rejected, exit 60
- missing referenced payload: rejected, exit 60
- truncated DB dump with refreshed checksum/size: pg_restore rejected it, exit 60
- manipulated manifest payload path `../escape`: rejected, exit 60
- missing COMPLETE marker under `.incomplete`: not resolvable as a recovery point

The temporary corruption repository was removed and the real latest backup was
verified again afterward.

## Concurrency result

Two simultaneous `create` commands:

- primary continued and completed VERIFIED
- secondary returned lock error with exit code 11

During a later create:

- `list`: succeeded
- `show` previous backup: succeeded
- `verify` previous backup: succeeded
- `prune --dry-run`: succeeded
- `prune --apply`: rejected with exit code 11

## Runtime non-regression

After backup operations all runtime services remained running. API, frontend,
nginx, and TimescaleDB were healthy. All inspected services reported
`restartCount=0`.

## Remaining gates before declaring Phase 1 complete

Still required or intentionally deferred:

- official GHCR image publication and immutable version verification
- linux/amd64 and linux/arm64 manifest verification
- OCI labels, SBOM and provenance verification
- real schema-4 Stack Release publication
- distribution bundle validation
- DIT acceptance without a source checkout
- TEST1 acceptance at an explicitly agreed validation time
- remaining destructive/failure-injection cases from P1-O
- remaining multi-instance isolation cases from P1-N
- remaining detailed performance measurements from P1-Q
- exact default retention 7/4/6 acceptance cases and boundary cases

No restore test is part of Phase 1. Restore remains Phase 2 and must first be
validated in a RECOVERY environment before any destructive TEST1 restore.
