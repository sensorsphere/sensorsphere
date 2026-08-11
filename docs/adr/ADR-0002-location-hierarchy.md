# ADR-0002: Unified Location Hierarchy

## Status

Accepted

## Context

SensorSphere needs a generic physical hierarchy that can represent homes,
buildings, industrial sites, campuses, data centers, vehicles, and other
environments without introducing a dedicated database table for every level.

The legacy model contains a `rooms` concept, but future capabilities need a
more general structure that can organize assets independently of acquisition
protocols such as BLE, MQTT, Zigbee, or Modbus.

## Decision

SensorSphere uses a single hierarchical `locations` model.

A location has:

- a UUID identifier;
- an optional `parent_id`;
- a type;
- a name;
- an optional description;
- extensible JSON metadata;
- creation and update timestamps.

The supported initial types are:

- `SITE`
- `BUILDING`
- `FLOOR`
- `ROOM`
- `ZONE`
- `AREA`
- `OTHER`

The hierarchy is represented by the self-referencing `parent_id`.

A location may be a root when `parent_id` is `NULL`.

Assets will progressively reference locations rather than dedicated physical
entities such as rooms.

## Invariants

The location hierarchy MUST NOT contain cycles.

A location MUST NOT be its own parent.

Moving a location MUST preserve its descendants.

Deleting a location MUST NOT implicitly delete child locations or assets.

Location identity MUST remain stable when a location is moved.

The location type is descriptive and MUST NOT define the physical hierarchy
in the persistence model.

## Compatibility

The legacy `rooms` model remains available during the transition.

Existing room UUIDs are reused when rooms are represented as locations.

Destructive removal of legacy structures must happen only after all consumers
have migrated.

## Consequences

### Positive

- One model supports arbitrary physical hierarchies.
- New hierarchy levels do not require schema migrations.
- Assets can be organized consistently across different environments.
- API and frontend features can consume one generic tree.
- Future permissions, dashboards, reports, and analytics can share the same
  hierarchy.

### Negative

- Hierarchy validation must explicitly prevent cycles.
- Type-specific rules cannot rely solely on database structure.
- Legacy room compatibility must be maintained during migration.

## Follow-up

The location API provides list, tree, get, create, move, update, and delete
operations.

Business rules related to location hierarchy must remain independent from
protocol-specific ingestion code.
