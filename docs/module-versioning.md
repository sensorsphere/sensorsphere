# SensorSphere module versioning

SensorSphere versions the `frontend`, `api`, and `ingestion-service` modules independently.

## Version format

Versions use `MAJOR.MINOR.REV`.

- `MAJOR` increments for a major product or architecture evolution and resets `MINOR` and `REV` to zero.
- `MINOR` increments for a new functional patch affecting that module and resets `REV` to zero.
- `REV` increments for a correction or revision of the same functional patch.

Each module keeps its runtime version and structured changelog in `src/module_version.ts`. The corresponding `package.json` version mirrors the runtime module version.

## Changelog schema

Each release records:

- `releasedAt`: ISO 8601 timestamp with timezone.
- `patch`: exact patch filename.
- `changes`: structured changes with `type` and `description`.

Allowed change types are `added`, `changed`, `fixed`, `removed`, `deprecated`, and `security`.

Any code patch that changes a SensorSphere module must update that module's version and changelog in the same patch.
