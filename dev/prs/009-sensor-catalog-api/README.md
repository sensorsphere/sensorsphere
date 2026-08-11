# PR-009 — Sensor Catalog API

## Revision

2

## Objective

Add the first write operation to the SensorSphere Inventory domain.

This PR adds:

- `GET /api/v1/sensors/:id`
- `PATCH /api/v1/sensors/:id`
- validation for editable sensor metadata
- repository update support
- consistent `400` and `404` responses
- `zod` as an API dependency for request validation

## Editable fields

- `name`
- `description`
- `manufacturer`
- `model`
- `firmwareVersion`
- `enabled`

Gateway and Room assignment are intentionally excluded from this PR.

## Database changes

None.

## Apply

```bash
./dev/tools/pr apply 009
```

## Verify

```bash
./dev/tools/pr verify 009
```

## Rollback

```bash
./dev/tools/pr rollback 009
```
