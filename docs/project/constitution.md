# SensorSphere Project Constitution

## Mission

SensorSphere is an open, self-hostable and extensible platform for collecting,
storing, understanding and acting on data produced by physical devices.

## Product Values

SensorSphere favors:

1. Simplicity
2. Reliability
3. Reproducibility
4. Backward compatibility
5. Self-hosting
6. Open standards
7. Clear documentation
8. Operational transparency

## Product Principles

### Self-hosted first

A complete Community deployment must be possible without dependence on a
mandatory external cloud service.

### API first

User-facing capabilities should be accessible through stable APIs so that the
web UI is a consumer of the platform rather than a privileged implementation.

### Time-series native

Telemetry storage and querying must remain optimized for time-series workloads.

### Open-core ready

The Community edition must remain fully useful. Commercial capabilities may add
enterprise concerns without deliberately crippling Community functionality.

### Domain driven, pragmatically

Domain language should shape the codebase, but abstractions are introduced only
when they solve a real problem.

### Backward compatible by default

Public APIs, migrations and persisted data should evolve through explicit
migration strategies rather than silent breaking changes.

## Engineering Rules

A PR must not:

- modify an already applied migration
- introduce secrets into version control
- silently break a public API
- overwrite local source changes without detection
- require root-owned files inside the repository
- mix unrelated product objectives

## Definition of Done

A PR is complete when applicable checks pass:

- code builds
- tests pass
- verification passes
- rollback is available
- migrations are versioned
- documentation is updated
- changelog is updated
- `sensorsphere doctor` remains healthy
- no known regression remains

## Language

Source code and technical documentation are written in English.

User-facing product localization may support multiple languages independently.
