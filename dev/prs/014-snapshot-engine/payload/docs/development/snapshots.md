# SensorSphere Snapshots

Snapshots capture the current source state of a SensorSphere repository so that
changes can be designed against the exact codebase.

## Create

```bash
sensorsphere snapshot create
```

Specify another output directory:

```bash
sensorsphere snapshot create /tmp
```

## Inspect

```bash
sensorsphere snapshot inspect /tmp/sensorsphere-snapshot-....tar.gz
```

## Included data

Snapshots include source code, Dockerfiles, manifests, migration SQL,
documentation and development tooling.

## Excluded data

Snapshots intentionally exclude:

- Git internals
- `.env` and `.env.*`
- dependency directories
- compiled frontend/backend output
- database data files
- MQTT persistence and logs
- generated CLI binaries
- PR backup directories
- other `.tar.gz` snapshots

## Archive structure

```text
sensorsphere-snapshot/
├── metadata.json
├── checksums.json
└── repository/
```

`checksums.json` contains a SHA-256 digest for every included repository file.

## Security

A snapshot is intended to contain source code, not secrets or runtime data.

Review archive contents before sharing a snapshot outside your trusted
development workflow.
