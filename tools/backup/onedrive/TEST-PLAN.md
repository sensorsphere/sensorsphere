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
