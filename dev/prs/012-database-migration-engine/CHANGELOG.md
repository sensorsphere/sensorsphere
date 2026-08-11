# PR-012 Changelog

## Added

- Database migration engine.
- `db status`.
- `db migrate`.
- `db history`.
- SHA-256 migration integrity validation.
- Database migration documentation.

## Changed

- Project roadmap marks the migration engine as completed.

## Breaking Changes

None.

## Database Changes

Adds the internal `schema_migrations` table when the migration tool is first run.

## Rollback Notes

The `schema_migrations` table is intentionally preserved on rollback.
