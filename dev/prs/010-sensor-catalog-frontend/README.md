# PR-010 — Sensor Catalog Frontend

## Objective

Expose the SensorSphere Inventory catalog in the web UI and allow editing sensor metadata.

## User value

Operators can now:

- see all registered sensors, including offline sensors
- see friendly sensor names
- see UID, status, room, gateway, manufacturer and model
- edit sensor metadata from the browser

## API used

- `GET /api/v1/sensors`
- `GET /api/v1/sensors/:id`
- `PATCH /api/v1/sensors/:id`

## Editable fields

- name
- description
- manufacturer
- model
- firmware version
- enabled

Room and gateway assignment remain read-only in this PR.

## Database changes

None.

## Apply

```bash
./dev/tools/pr apply 010
```

## Verify

```bash
./dev/tools/pr verify 010
```

## Rollback

```bash
./dev/tools/pr rollback 010
```
