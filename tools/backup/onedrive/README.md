# SensorSphere OneDrive offsite backup (SS-OD-03)

This component is independent from `install.sh` and uses the installed SensorSphere
Backup V2 container as its sole exporter. It encrypts verified Recovery Bundles and
the separately selected instance `.env` with Restic, using rclone to reach OneDrive.

## Environments
- DEV: `/home/ubuntu/sensorsphere`, Backup 0.2.1
- DIT: `/home/ubuntu/work/sensorsphere-dit`, Backup 0.1.0

Both have backup format 1. The `.env` file is intentionally excluded from V2
bundles and therefore backed up separately by the offsite orchestrator.

## Secure setup
1. Store the production config at
   `/home/ubuntu/.config/sensorsphere-onedrive/backup.conf` mode 600.
2. Keep a unique production Restic password in the directory mode 700;
   save an independent, offline copy of the password AND rclone OAuth setup.
3. Set the production repository to
   `rclone:onedrive-backup:SensorSphere/production/na-01`.
4. Initialize it with `restic init` after exporting config values.
5. Check with `ss-od-backup.sh preflight DEV` and `preflight DIT`.
6. Run `ss-od-backup.sh run DEV`, then `run DIT`. Each operation creates a
   fresh V2 bundle, checks COMPLETE, manifest and SHA256, then uploads bundle + `.env`.
7. Validate `restic check --read-data` and perform off-host isolated restore
   before enabling scheduling.

## Commands
```bash
./tools/backup/onedrive/ss-od-backup.sh preflight DEV
./tools/backup/onedrive/ss-od-backup.sh upload-existing DEV <backup-id>
./tools/backup/onedrive/ss-od-backup.sh run DIT
./tools/backup/onedrive/ss-od-backup.sh status DEV
./tools/backup/onedrive/ss-od-backup.sh retention-plan DEV
```

`retention-plan` is deliberately DRY RUN ONLY. There is no automatic forget,
prune, deletion or unverified upload. The script uses per-environment flock locks,
an available-disk threshold, and checks manifest identity before uploads.
The Restic repository lock coordinates both environments. Do not run both concurrently.

## systemd (not enabled automatically)
Copy service and timers to /etc/systemd/system, run `systemd-analyze verify`,
then `systemctl daemon-reload`. Inspect existing legacy SensorSphere timers before
enabling anything. Timer calendars use explicit Europe/Paris time. Use
`systemctl enable --now sensorsphere-onedrive-dev.timer sensorsphere-onedrive-dit.timer`
only after restore tests and monitoring/alerting are accepted.

## Recovery
Obtain an off-server copy of the unique production Restic password and valid
OneDrive OAuth credentials, configure rclone on the recovery machine, then:
```bash
restic -r 'rclone:onedrive-backup:SensorSphere/production/na-01' snapshots
restic -r 'rclone:onedrive-backup:SensorSphere/production/na-01' restore <snapshot> --target /secure/recovery
```
Confirm `snapshot/bundle/manifest.json` environment and run
`sha256sum -c checksums.sha256`. Never apply directly to live DEV or DIT.
The DIT 0.1.0 backup binary has no restore command; use a compatible recovery
image and check migration compatibility in isolated recovery tests.
Restored `.env` files are secrets; keep them owner-only and avoid log disclosure.

## Future work before operational acceptance
- Fresh DEV and DIT backups with production repository and isolated restore.
- Off-host disaster recovery with credentials reconstructed independently.
- Monitoring/alerting, missed-run freshness checks and healthchecks notification.
- Retention apply/prune integration with safeguarding the last verified snapshot.
- Failure injection, OneDrive API throttling tests and free disk safeguards.
- Confirm shared Microsoft 365 Family storage conditions and account entitlement.
