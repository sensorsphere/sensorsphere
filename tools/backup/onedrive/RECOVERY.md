# SS-OD-04 — OneDrive disaster recovery runbook

## Purpose

Recover DEV/DIT from the production Restic repository
`rclone:onedrive-backup:SensorSphere/production/na-01` even if na-01
is unavailable. These procedures must not overwrite a running instance.

## Prerequisites (store OUTSIDE na-01)

1. A protected copy of the production Restic password from
   `/home/ubuntu/.config/sensorsphere-onedrive/restic-password`.
   This is not the SS-OD-01 pilot password.
2. An independent method for re-authorizing the OneDrive account with
   rclone (Microsoft account access and MFA recovery), or a secured copy of
   the rclone configuration with working OAuth refresh tokens.
3. The repository URL, the corresponding Backup/Restore V2 image compatible
   with the saved backup format (format 1), and the installation runbook.
4. Trusted recovery host with sufficient disk, Docker, Restic, rclone and
   secure filesystem. Restore secrets only to mode-700 private directories.

A missing Restic password is an unrecoverable data loss. Neither an active
OneDrive session nor recovery of the Git repo replaces it.

## Recover on an independent host

```bash
# Secure directory, only accessible to recovery operator
umask 077
mkdir -p "$HOME/ss-recovery/config" "$HOME/ss-recovery/output"
chmod 700 "$HOME/ss-recovery" "$HOME/ss-recovery/config" "$HOME/ss-recovery/output"
# Put separately recovered Restic password and rclone.conf in config,
# with chmod 600. Do not paste them into a chat, log, or Git.
export RESTIC_PASSWORD_FILE="$HOME/ss-recovery/config/restic-password"
export RCLONE_CONFIG="$HOME/ss-recovery/config/rclone.conf"
export RESTIC_REPOSITORY='rclone:onedrive-backup:SensorSphere/production/na-01'
restic snapshots --tag env=DEV
restic snapshots --tag env=DIT
restic check --read-data
# Choose a known-good snapshot ID, never guess latest for a given env
restic --no-cache restore <DEV_SNAPSHOT_ID> --target "$HOME/ss-recovery/output/DEV"
restic --no-cache restore <DIT_SNAPSHOT_ID> --target "$HOME/ss-recovery/output/DIT"
```

Restic preserves absolute paths relative to the restore target. Examples:
`output/DEV/home/ubuntu/sensorsphere/backups/<bundle-id>/` and
`output/DEV/home/ubuntu/sensorsphere/.env`.
For DIT paths start with `home/ubuntu/work/sensorsphere-dit/`.

## Validate recovered files

Run `sha256sum -c checksums.sha256` inside each recovered bundle.
Read `manifest.json` to confirm the source environment, version,
migration level, and verification status. Before using the recovered
`.env` enforce `chmod 600`: snapshots created prior to SS-OD-03
may retain historical `644` permissions (DIT snapshot e58d2d60).
Never print or share the contents of `.env`.

Recover the database ONLY in a fresh isolated PostgreSQL/TimescaleDB
environment and use a compatible Backup/Restore V2 image; DIT backup
v0.1.0 has no built-in restore command. Validate app startup, migrations
and data consistency before production cutover.

## Already demonstrated (2026-11-22)

In an ephemeral Docker container isolated from all DEV/DIT live paths,
production snapshots DEV `1655e4d5` and DIT `e58d2d60` were restored
with `--no-cache`; the recovered dumps and `.env` matched originals
byte-for-byte, and all bundle SHA256 checks passed. This does NOT prove
restoration from a different physical/virtual host or successful
application/database startup. Those two acceptance tests remain pending.

## Safeguards

- Do not replace live DEV/DIT data during validation.
- Do not enable Restic forget/prune until separate recovery is accepted.
- Do not rely solely on OneDrive to store the Restic password.
- Never disclose OAuth credentials, passwords, or .env files in logs.
