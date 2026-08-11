# SensorSphere Contribution Conventions

## General

- Technical code and documentation use English.
- One PR has one primary objective.
- Features belong to a named domain.
- Avoid generic `utils`, `misc` or catch-all modules.

## Backend Feature Structure

Prefer vertical slices:

```text
features/
  <feature>/
    controller.ts
    service.ts
    repository.ts
    mapper.ts
    dto.ts
    routes.ts
    index.ts
```

Only create files that have a real responsibility.

## API

- Version business endpoints under `/api/v1`.
- Public JSON uses camelCase.
- Controllers do not contain SQL.
- Repositories do not contain HTTP behavior.
- Breaking API changes require an explicit migration path.

## Database

- Migration files are immutable once applied.
- New schema changes require new numbered migrations.
- Migrations should be transactional.
- Use the SensorSphere migration engine.

## Docker

Containerized build steps writing into the repository must run with the host
UID/GID.

No root-owned repository artifacts are allowed.

## Pull Requests

Each distributable PR includes:

- manifest
- changelog
- apply
- verify
- rollback
- checksums

Complex domain changes require an RFC.

Structuring technical choices require an ADR.

## Verification

A PR should preserve a healthy:

```bash
sensorsphere doctor
```
