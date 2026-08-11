# SensorSphere v1.0 Master Plan

## Milestone M1 — Platform Foundation

Status: Completed

- PR-011 Platform Foundation
- PR-012 Database Migration Engine
- PR-013 SensorSphere CLI
- PR-014 Snapshot Engine

## Milestone M2 — Product Foundation

Status: In Progress

- PR-015 Product Foundation
- PR-016 Asset Domain Model
- PR-017 Location Management
- PR-018 Gateway Management
- PR-019 Asset Metadata and Tags

## Milestone M3 — Inventory UX

- Asset catalog
- Room and location assignment
- Gateway relationships
- Search and filtering
- Bulk metadata operations

## Milestone M4 — Monitoring

- Dashboard v2
- Platform health
- Operational metrics
- Historical aggregations
- Export and reporting

## Milestone M5 — Automation

- Rules engine
- Alerts
- Notification channels
- Webhooks
- Scheduled actions

## Milestone M6 — Identity

- Authentication
- Users
- Roles
- API keys
- Audit trail

## Milestone M7 — Multi-site

- Organizations
- Sites
- Buildings
- Cross-site views
- Tenant boundaries

## Milestone M8 — Stable v1.0

- Stable API contracts
- Backup and restore
- Upgrade documentation
- Production deployment guide
- Release lifecycle
- Compatibility policy

## Architectural Dependencies

Inventory precedes Automation because rules must refer to stable assets and
metrics.

Identity precedes multi-tenant capabilities because tenant boundaries require
authenticated principals and authorization.

Analytics builds on Telemetry without changing the raw ingestion contract.
