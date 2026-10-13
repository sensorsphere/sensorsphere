# Backup/Restore V2 — Phase 3 validation results

Date: 2026-10-13. Status: **IN PROGRESS — NOT ACCEPTED**.

## Verified results

- P3-A001: PASS — generated per-instance systemd service/timer, verified on host.
- P3-A002: PASS — independent FULL-SOURCE (02:00 UTC) and FULL-RECOVERED (03:30 UTC) timers observed.
- P3-A003: PASS — real one-shot backup followed by prune dry-run and apply; backup VERIFIED.
- P3-A005: PASS — next run visible via systemd status.
- P3-A006/A007: PASS — stopping TimescaleDB on isolated FULL-RECOVERED yielded systemd failure and scheduler FAILED/BACKUP_CREATE/20; database restored healthy.
- P3-A008: PASS — deterministic recovery-lock holder caused scheduled backup refusal with exitCode 11.
- P3-A011/A012: PASS — escaped paths with spaces and wrong WorkingDirectory rejection covered by host tests; unit syntax checked by systemd-analyze.
- P3-A013/A014: PASS — live disable/re-enable preserved timer configuration.
- P3-A015: PASS — randomized delay rendering in host test.
- P3-B001–B007: PASS at Go unit-test level; verified-backup age, failure separation, corrupt latest bundle and threshold overrides/defaults.
- Backup Go suite: `go test ./...` PASS inside Docker build environment (2026-10-13).
- Scheduler host suite: `scripts/tests/test-backup-schedule.sh` PASS.
- Stack `2026.10.13.4`: manifest validation and distribution build PASS.

## Outstanding acceptance gates

- **P3-A004 P0**: `Persistent=true` is rendered and systemd units are valid, but a *missed run catch-up after downtime* has NOT been demonstrated. Static presence is insufficient for acceptance.
- **P3-A009 P1**: host reboot persistence has NOT been demonstrated. Do not reboot `na-01` without explicit approval; use an isolated systemd environment or an approved maintenance window.
- **P3-A010 P1**: stack update timer lifecycle requires an explicit end-to-end acceptance record (code and bundle compatibility tests exist).
- Phase 3 acceptance report and release publication remain pending these gates.

## Operational constraints

- No destructive TEST1 operations.
- Keep test timers and production scheduling clearly separated.
- Never mark Phase 3 ACCEPTED solely from `Persistent=true` in a timer file.
- Remote execution shell does not expose `systemctl`; privileged host helper operations may be blocked. A host reboot is explicitly out of scope without operator approval.
