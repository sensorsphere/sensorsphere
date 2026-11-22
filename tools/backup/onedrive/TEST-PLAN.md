# SS-OD-03 — Test plan and acceptance

## Scope

DEV Stack 2026.10.25.1 / Backup V2 0.2.1, DIT Stack 2026.10.07.1 /
Backup V2 0.1.0. Restic production repository
`rclone:onedrive-backup:SensorSphere/production/na-01`.
Never include a plaintext `.env` in Git, logs, or unencrypted remote storage.

## Mandatory tests before enabling systemd timers

| ID | Test | Expected |
| --- | --- | --- |
| OD03-01 | bash -n on script | exit 0 |
| OD03-02 | config directory mode 700, files 600 | pass |
| OD03-03 | preflight DEV and DIT | exit 0, free disk checked |
| OD03-04 | run DEV | V2 VERIFIED, Restic snapshot tag env=DEV |
| OD03-05 | run DIT | V2 VERIFIED, Restic snapshot tag env=DIT |
| OD03-06 | restic check --read-data | no errors |
| OD03-07 | restore both snapshots into isolated directories | SHA256SUMS, dump, and .env match |
| OD03-08 | retention-plan DEV and DIT | dry-run only, strict environment isolation |
| OD03-09 | wrong environment / malformed backup ID | refuse before remote upload |
| OD03-10 | missing or invalid credentials | fail closed and non-zero |
| OD03-11 | low disk threshold | fail closed before creating V2 bundle |
| OD03-12 | concurrent same-environment invocation | second run refused via flock |
| OD03-13 | old legacy timers inventory | no accidental duplicate scheduling |
| OD03-14 | render and verify systemd units | no activation |
| OD03-15 | schedule through systemd one-shot DEV then DIT | verified snapshots and log timestamps |
| OD03-16 | off-host recovery using archived secrets | successful independent restore |
| OD03-17 | interrupted network or Microsoft Graph throttling | failure surfaced; no false success |
| OD03-18 | monitoring misses >26h / operation failures | alert delivered |
| OD03-19 | production retention apply/prune after independent backups | no deletion of final verified snapshot |

## Evidence — 2026-11-22

- Previous SS-OD-02 remote restoration from validation repository:
  DEV 20261122T181410Z-e98b0913 and DIT 20261122T181809Z-8a60c220.
- Production repository initialized: e6c1e20f24 (separate password).
- Production snapshots: DEV 0ee3adc5, 1655e4d5; DIT 10d2a717, e58d2d60.
- Real `run` completed: DIT 20261122T182736Z-f149ba4b, DEV
  20261122T182814Z-89f9cce8, both V2 VERIFIED and uploaded.
- `restic check --read-data` passed: four snapshots, thirteen packs.
- Retention plans for DEV and DIT succeeded, kept two snapshots each;
  no forget/prune executed.
- The first test `run` from an isolated runner was refused by the Docker
  socket because supplementary group 989 had not been supplied; re-run
  with `--group-add 989` passed. Native host unit User=ubuntu already
  has access to the Docker socket.
- Timers intentionally NOT installed or enabled.
- Off-server password archival, off-host restore, alerting, network-failure
  behavior and live scheduled jobs remain open.

## Safety

Never run destructive Restore V2 against a live DEV/DIT instance for a test.
Never invoke `restic forget` without `--dry-run` or `prune` before formal
retention acceptance. Production secrets are not part of the repository.


## SS-OD-04 evidence (2026-11-22)

- Host inventory: three enabled timer symlinks associated with legacy
  `sensorsphere-backup.timer` and two isolated full-source/full-recovered
  test environments (02:00 / 03:30). Unit file evidence is not proof of
  effective active timers; host systemd bus was not reachable from the RDC
  execution container. No legacy timer changed.
- `systemd-analyze calendar` accepted both 02:15 and 03:15
  `Europe/Paris` schedules. The computed next UTC triggers were
  2026-11-23 01:15 and 02:15 UTC respectively.
- `systemd-analyze verify` exited 0 for all six new service/timer files.
  Warnings concerned unrelated executable Oracle monitoring units.
- Freshness check real repository: `OK DEV`, `OK DIT`,
  `SS_OD_MAX_AGE_HOURS=26`; exit 0.
- Simulated stale timestamp: `STALE DEV`, exit 1. No snapshot modified.
- Without external notification endpoint: `ALERT_NOT_DELIVERED`,
  exit 2; journald-compatible local event emitted. Real outbound alert
  remains unproven and is a release gate.
- Production Restic snapshots restored with `--no-cache` in an isolated
  container with no DEV/DIT source mounts: DEV `1655e4d5` (80.029 MiB)
  and DIT `e58d2d60` (331.001 KiB). All bundle checksums passed, and
  both PostgreSQL dumps and `.env` files matched originals byte-for-byte.
- Recovered DIT `.env` had historical file mode 644; secured recovered
  copy to 600. Future offsite snapshots use corrected source mode 600.
- Off-host physical machine restore, functional DB restore, secure off-host
  archive of production password, outbound alert delivery and active timers:
  NOT ACCEPTED / NOT EXECUTED.

**SS-OD-04 gate:** do not activate timers or prune before resolving existing
legacy schedules and verifying alert transport and independent recovery.

## SS-OD-04-FINAL follow-up — 2026-11-22

Host journal evidence confirms the existing schedules are **not merely stale symlinks**:

- `sensorsphere-backup.service` finished successfully on
  2026-11-22 at 02:01:12 UTC (03:01:12 Europe/Paris). It runs
  `sensorsphere-prune-backups --apply` for its **existing legacy local**
  backups. This is NOT Restic OneDrive retention.
- `sensorsphere-backup-sensorsphere-full-source-e315760c.service`
  finished successfully at 02:00:50 UTC.
- `sensorsphere-backup-sensorsphere-full-recovered-b00a3ccf.service`
  finished successfully at 03:30:26 UTC.
- Those test environments also run their separate V2 local prune
  `--apply` scripts. No modification to these existing timers was made.
- Consequence: leave new scheduled backups disabled until the old
  schedules are reviewed; monitor CPU/disk overlap if retained.

### HTTPS alert transport verification

- A temporary HTTPS receiver with a 1-day self-signed test certificate
  was started on 127.0.0.1:19443.
- A secure, isolated test copy of backup.conf and a curl CA file were used.
- `ss-od-health.sh notify freshness` returned
  `ALERT_DELIVERED: freshness`.
- Receiver observed HTTP POST, `text/plain; charset=utf-8`, and the
  expected SensorSphere freshness message. The temporary server was
  terminated. The live production config still has **no**
  `SS_OD_ALERT_URL` and cannot deliver an external notification.
- Do not confuse a local receiver test with delivery to the intended
  user's phone/email/service.

### Activation checklist

- [ ] Choose and validate a real HTTPS alert endpoint; simulate a failure
      and confirm message arrival from the intended recipient.
- [ ] Protect a copy of the **production** Restic password independently
      of na-01; validate independent OAuth reauthorization.
- [ ] Perform an actual recovery on a different host and confirm bundle
      integrity and functional application/database restore.
- [ ] Decide whether the existing generic and recovery-test timers remain
      necessary; schedule DEV and DIT without conflict.
- [ ] Install and recheck systemd units; run each oneshot with systemctl,
      review journal output, then enable timers after sign-off.
- [ ] Keep OneDrive Restic forget/prune disabled until its own acceptance.

No new timer or purge was activated by this work.
