# Compatibility policy

SensorSphere Stack Release schema version 3 makes frontend/API and
application/database compatibility explicit.

## Frontend and API contract

The API exposes the following runtime fields through `/api/v1/config`:

- `apiVersion`
- `contractVersion`
- `databaseMigrationLevel`

The frontend embeds `REQUIRED_API_CONTRACT_VERSION`. If the running API
contract differs, the frontend stops normal rendering and displays a clear
incompatibility message asking the operator to deploy a validated Stack
Release.

The contract version is an integer. Increment it only for a change that makes
an older frontend/API pairing incompatible. Ordinary additive API changes do
not require a contract bump.

## Database compatibility

The API source defines:

- `DATABASE_MIN_MIGRATION_LEVEL`
- `DATABASE_MAX_MIGRATION_LEVEL`

A schema-v3 Stack Release records the same bounds:

```yaml
compatibility:
  apiContractVersion: 1
  frontendRequiredApiContractVersion: 1
  databaseMinMigrationLevel: 72
  databaseMaxMigrationLevel: 72
```

The Stack Release validator rejects:

- frontend/API contract mismatches;
- a selected migration level outside the API's declared DB range;
- source/manifest compatibility values that differ when validation uses
  `--source`.

## Rollback

Database migrations are never reversed automatically.

The installer may roll an application stack back across a migration-level
change only when the previous schema-v3 Stack Release explicitly declares the
current database migration level inside its compatibility range. Otherwise the
rollback is blocked.

`--force` bypasses that guard only after an operator has independently
verified application/database compatibility.

## Stack Release validation

Historical manifests can be checked structurally:

```bash
scripts/validate-stack-release.sh releases/stacks/2026.09.25.2.yaml
```

A release built from the current source tree must use source validation:

```bash
scripts/validate-stack-release.sh --source releases/stacks/2026.09.30.7.yaml
```
