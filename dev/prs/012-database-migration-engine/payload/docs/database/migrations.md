# Database Migrations

SensorSphere database schema changes are stored in:

```text
infrastructure/timescaledb/migrations/
```

## Naming

Migration filenames use:

```text
NNN-description.sql
```

Example:

```text
003-rooms.sql
004-buildings.sql
```

Versions are strictly numeric and unique.

## Commands

### Status

```bash
./dev/tools/db status
```

Shows migrations as `APPLIED` or `PENDING`.

### Apply pending migrations

```bash
./dev/tools/db migrate
```

Migrations are executed in numeric order.

### History

```bash
./dev/tools/db history
```

Displays the recorded migration history.

## Integrity

SensorSphere records the SHA-256 checksum of each applied migration.

An applied migration must never be edited.

If its checksum changes, all migration commands stop with an error.

The correct way to change the database after a migration has been applied is to
create a new migration.

## Transactions

Each SQL migration runs inside a PostgreSQL transaction.

If a migration fails, its changes are rolled back and it is not recorded as
applied.

## Existing installations

The migration engine can be introduced after manual migrations have already
been executed.

Existing migrations should therefore be idempotent where practical. The current
inventory migration uses `IF NOT EXISTS` constructs and can be safely recorded
by running:

```bash
./dev/tools/db migrate
```

## Internal Table

Migration state is stored in:

```text
schema_migrations
```

This table is operational metadata and must not be modified manually.
