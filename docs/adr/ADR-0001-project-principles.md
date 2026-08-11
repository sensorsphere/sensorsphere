# ADR-0001 — SensorSphere Project Principles

## Status

Accepted

## Context

SensorSphere has evolved from a telemetry prototype into a platform with
multiple runtime services, development tooling, migrations and user-facing
inventory capabilities.

Without explicit principles, future features could introduce inconsistent
architecture and operational behavior.

## Decision

SensorSphere adopts the following principles:

1. Pragmatic modular-monolith architecture.
2. Vertical-slice organization for application features.
3. Native PostgreSQL/TimescaleDB usage for time-series workloads.
4. Repository isolation for SQL.
5. Service isolation for application behavior.
6. Controller isolation for HTTP concerns.
7. Versioned public APIs.
8. Immutable applied database migrations.
9. One primary objective per PR.
10. Reversible PR delivery.
11. Self-hosted-first Community deployment.
12. Open-core-ready architecture without Community degradation.

## Consequences

### Positive

- clearer ownership
- predictable code layout
- safer upgrades
- easier contribution
- lower operational complexity

### Trade-offs

- some changes require additional migration or compatibility work
- PRs may be smaller and more numerous
- design work happens before complex features

## Alternatives considered

### Distributed microservices from the beginning

Rejected because current scale does not justify the operational complexity.

### Framework-driven architecture

Rejected because SensorSphere should preserve domain boundaries independently
of a specific framework.
