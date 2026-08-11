# API Guidelines

## Base Path

Versioned business APIs use `/api/v1/`.

## Naming

Public JSON fields use camelCase. Database columns may use snake_case internally.

## Feature Structure

```text
features/
  sensors/
    controller.ts
    service.ts
    repository.ts
    mapper.ts
    dto.ts
    routes.ts
    index.ts
```

## Responsibilities

- Route: HTTP method and path
- Controller: HTTP input and output
- Service: application behavior
- Repository: persistence
- Mapper: persistence records to public DTOs

## Errors

Errors use a stable JSON shape:

```json
{
  "error": "Human-readable message"
}
```

Breaking changes require a new API version or an explicit transition plan.
