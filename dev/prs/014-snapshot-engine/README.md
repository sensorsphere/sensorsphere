# PR-014 — Snapshot Engine

## Objective

Add repository snapshot support to the SensorSphere CLI.

## Commands

```bash
sensorsphere snapshot create
sensorsphere snapshot create /tmp
sensorsphere snapshot inspect <archive.tar.gz>
```

## Snapshot contents

Snapshots include project source and configuration files required to reproduce
the state of the repository.

## Exclusions

Snapshots exclude:

- `.git`
- `.env`
- `.env.*`
- `node_modules`
- `dist`
- coverage output
- TimescaleDB runtime data
- Mosquitto runtime data and logs
- PR backups
- generated binaries
- existing snapshot archives

## Output

The archive contains:

```text
sensorsphere-snapshot/
├── metadata.json
├── checksums.json
└── repository/
```

## Security

The snapshot command fails if it encounters files named `.env` or `.env.*`
inside the included repository tree.

## Apply

```bash
sensorsphere pr apply 014
```

## Verify

```bash
sensorsphere pr verify 014
```
