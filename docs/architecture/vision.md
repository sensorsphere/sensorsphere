# SensorSphere Architecture Vision

SensorSphere is an open, self-hostable and extensible IoT data platform.

## Architectural Style

SensorSphere follows a pragmatic modular-monolith approach with separate runtime
applications for API, frontend and ingestion, plus shared packages for stable
cross-cutting capabilities.

## Principles

1. Domain concepts come before framework details.
2. Features are organized vertically.
3. SQL is isolated in repositories.
4. HTTP behavior is isolated in controllers.
5. Time-series operations use native PostgreSQL and TimescaleDB capabilities.
6. Infrastructure is version controlled.
7. Documentation and code use English.
8. Backward compatibility is preserved whenever practical.
9. Operational simplicity is preferred over premature distribution.
10. SensorSphere remains open-core ready without reducing Community functionality.
