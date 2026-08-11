# Development Workflow

## Pull Request Principle

One PR must have one primary objective.

Each distributable SensorSphere PR contains:

- `metadata.json` during transition periods when backward compatibility requires it
- `manifest.json`
- `README.md`
- `CHANGELOG.md`
- `apply.sh`
- `verify.sh`
- `rollback.sh`
- `checksums.json`
- optional `payload/`

## Lifecycle

Design -> Package -> Extract -> Inspect -> Apply -> Verify -> Commit or Rollback

## Commands

```bash
./dev/tools/pr extract <archive>
./dev/tools/pr info <number>
./dev/tools/pr apply <number>
./dev/tools/pr verify <number>
./dev/tools/pr rollback <number>
```

## Compatibility Rule

A PR that upgrades the PR engine must remain consumable by the immediately
previous PR engine.

## Definition of Done

A PR is complete when apply and verify succeed, rollback is available,
documentation is updated, and no known regression remains.
