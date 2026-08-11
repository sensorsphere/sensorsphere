# PR-012 — Database Migration Engine

## Objective

Introduce deterministic database migration management for SensorSphere.

## Commands

```bash
./dev/tools/db status
./dev/tools/db migrate
./dev/tools/db history
```

## Behavior

The migration engine:

- discovers `infrastructure/timescaledb/migrations/*.sql`
- creates `schema_migrations` automatically
- stores migration version, filename, SHA-256 checksum, execution timestamp and duration
- applies migrations in numeric filename order
- refuses to continue when an applied migration file has changed
- runs each migration transactionally
- is safe to run repeatedly

## Existing migrations

Existing idempotent migration files such as `002-inventory.sql` can safely be
registered by the engine. If the schema changes are already present, the SQL
runs again and is then recorded in `schema_migrations`.

## Database changes

The engine itself creates only the internal table:

```text
schema_migrations
```

No SensorSphere business schema is changed by this PR.

## Apply

```bash
./dev/tools/pr apply 012
```

## Verify

```bash
./dev/tools/pr verify 012
```

## Rollback

```bash
./dev/tools/pr rollback 012
```

Rollback removes the migration tool and documentation but intentionally does
not delete `schema_migrations`, because migration history is operational data.
