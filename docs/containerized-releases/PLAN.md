# SensorSphere Containerized Module Releases Plan

## Goal

Move non-DEV SensorSphere deployments from local application builds to versioned GHCR images selected by a validated Stack Release.

DEV keeps source-based Docker builds. DIT/PROD must eventually run without a full SensorSphere repository checkout.

## Baseline

Audit date: 2026-09-25

- Branch: `dev`
- Baseline commit: `2fc38c0996e2c9c51abb6814a458bf04642eb9ff`
- API: `1.43.0`
- Frontend: `1.82.0`
- Ingestion service: `1.0.0`
- Database migration level: `72`
- Current DEV environment: `SENSORSPHERE_ENVIRONMENT=DEV`

## Architecture decisions

- Runtime `docker-compose.yml` references versioned application images.
- `docker-compose.dev.yml` restores local application builds for DEV.
- Stack Releases define validated component combinations.
- Application image tags use module version plus immutable commit-SHA tags.
- No `latest` tag is required for Stack Release deployment.
- Initial application image platforms: `linux/amd64` and `linux/arm64`.
- Nginx and migrations become dedicated SensorSphere images in PR2.
## PR1 — Containerized module releases / foundation

- [x] Audit current baseline.
- [x] Add this maintained plan.
- [x] Add dedicated GHCR publication documentation.
- [x] Ignore legacy `infrastructure/timescaledb/data/` runtime data.
- [x] Make API and ingestion dependency installs lockfile-strict.
- [x] Move frontend image build to the monorepo pnpm lockfile.
- [x] Make runtime Compose image-based for API/frontend/ingestion.
- [x] Add DEV Compose override with local builds.
- [x] Add image/version variables to `.env.example`.
- [x] Add initial Stack Release manifest.
- [x] Add Stack Release validator.
- [x] Add GHCR multi-module publication script.
- [x] Update DEV/runtime documentation.
- [x] Validate Compose merge for DEV.
- [x] Build/test all changed application images via Docker.
- [x] Validate release script in dry-run/local mode.
- [x] Produce and verify Git patch.
- [x] Commit and push PR1 baseline.

## PR2 — Containerized nginx and migrations

- [x] Add `sensorsphere-nginx` image containing SensorSphere nginx configuration.
- [x] Add `sensorsphere-migrations` image containing runner and migrations.
- [x] Remove non-DEV repository bind mounts for nginx and migrations.
- [x] Add nginx and migrations versions to Stack Release `2026.09.25.2`.
- [x] Keep Stack Release schema v1 validation compatible with PR1.
- [x] Validate migration-level compatibility metadata.
- [x] Build nginx and migrations images on native ARM64.
- [x] Validate nginx configuration from the packaged image.
- [x] Apply all 71 migrations to an isolated database through the image.
- [x] Re-run migration image idempotently: 0 applied, 71 skipped.
- [x] Smoke-test the full DEV stack with containerized nginx/migrations.
- [x] Produce and verify Git patch.
- [x] Commit and push PR2.
## PR3 — Stack installation and lifecycle

- [ ] Define minimal non-DEV distribution bundle.
- [ ] Add `install.sh`.
- [ ] Add Stack Release download/selection.
- [ ] Add generated/managed `.env`.
- [ ] Add pull -> migrations -> up workflow.
- [ ] Add application health checks.
- [ ] Add update workflow.
- [ ] Add `.env.previous` rollback state.
- [ ] Block unsafe rollback when DB compatibility is not guaranteed.

## PR4 — Compatibility contracts and release hardening

- [ ] Add explicit frontend/API contract version.
- [ ] Add Stack Release compatibility checks.
- [ ] Define database compatibility policy.
- [ ] Finalize immutable SHA tag policy.
- [ ] Finalize multi-architecture policy.
- [ ] Decide whether any moving tag is published.
- [ ] Evaluate image signing/attestations.
- [ ] Finalize CI/release automation and distribution artifacts.

## Open decisions

- [ ] Final Stack Release publication location.
- [ ] Final Stack Release naming/version convention after the date-based v1 format.
- [ ] Whether Stack Releases are also attached to GitHub Releases.
- [ ] Final install path for non-DEV environments.
- [ ] Exact update/rollback command interface.

## Plan changes

- 2026-09-25: Initial four-PR plan established after baseline audit.
- 2026-09-25: PR1 explicitly includes reproducible dependency installation and GHCR operational documentation.
- 2026-09-25: Lockfile validation exposed and repaired pre-existing API zod and ingestion shared-logger drift.
- 2026-09-25: Native ARM64 application image builds pass; local amd64 emulation was stopped after becoming excessively slow during TypeScript compilation.
- 2026-09-25: The repository-wide pnpm test command still fails on baseline packages with Vitest test scripts but no test files; ingestion-service tests pass (3/3).
- 2026-09-25: PR2 preserves Stack Release 2026.09.25.1 and introduces schema v2 release 2026.09.25.2 with nginx 1.0.0 and migrations 72.
- 2026-09-25: The migrations image was validated from a fresh initialized TimescaleDB through level 72 and a second no-op run.
