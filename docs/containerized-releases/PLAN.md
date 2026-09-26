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

- [x] Define minimal non-DEV distribution bundle.
- [x] Add `install.sh`.
- [x] Add Stack Release download/selection.
- [x] Add generated/managed `.env`.
- [x] Add pull -> migrations -> up lifecycle.
- [x] Add application health checks.
- [x] Add update workflow.
- [x] Add `.env.previous` rollback state.
- [x] Block unsafe rollback when migration level changed.
- [x] Validate isolated install, update, safe rollback, and rollback guard.
- [x] Produce and verify Git patch.
- [x] Commit and push PR3.

## PR4 — Compatibility contracts and release hardening

- [x] Add explicit frontend/API contract version.
- [x] Expose API version, contract version, and database migration level at runtime.
- [x] Stop normal frontend rendering on an incompatible API contract with a clear error.
- [x] Add Stack Release schema v3 compatibility checks.
- [x] Define database compatibility range and rollback policy.
- [x] Finalize immutable SHA tag policy using the full Git commit SHA.
- [x] Finalize official multi-architecture policy: `linux/amd64,linux/arm64`.
- [x] Decide moving-tag policy: no `latest` tag.
- [x] Add BuildKit provenance and SBOM attestations.
- [x] Evaluate cryptographic signing: deferred until a trust/identity policy is defined.
- [x] Add immutable distribution bundle and SHA-256 checksum generation.
- [x] Add manual GitHub Actions release workflow.
- [x] Define immutable GitHub Stack Release publication.
- [x] Validate frontend compatibility tests, Docker builds, runtime contract, bundle install, rollback guard, and workflow syntax.
- [x] Produce and verify Git patch.
- [x] Commit and push PR4.

## Follow-up UI

- [x] Extend **Build information** at the bottom of the sidebar to show the released versions of `sensorsphere-nginx` and `sensorsphere-migrations` in addition to the existing application modules (PR-271).

## Open decisions

- [x] Stack Release publication location: source manifests in `releases/stacks/`, published bundles/manifests as immutable GitHub Releases.
- [x] Stack Release naming/version convention: `YYYY.MM.DD.N`, published under Git tag/release `stack-<stackVersion>`.
- [x] Stack Releases are attached to GitHub Releases with the distribution archive and SHA-256 checksum.
- [x] Final install path for non-DEV environments: `/opt/sensorsphere` by default, overridable with `--install-dir`.
- [x] Update/rollback command interface defined by `distribution/install.sh`.

## Plan changes

- 2026-09-25: Initial four-PR plan established after baseline audit.
- 2026-09-25: PR1 explicitly includes reproducible dependency installation and GHCR operational documentation.
- 2026-09-25: Lockfile validation exposed and repaired pre-existing API zod and ingestion shared-logger drift.
- 2026-09-25: Native ARM64 application image builds pass; local amd64 emulation was stopped after becoming excessively slow during TypeScript compilation.
- 2026-09-25: The repository-wide pnpm test command still fails on baseline packages with Vitest test scripts but no test files; ingestion-service tests pass (3/3).
- 2026-09-25: PR2 preserves Stack Release 2026.09.25.1 and introduces schema v2 release 2026.09.25.2 with nginx 1.0.0 and migrations 72.
- 2026-09-25: The migrations image was validated from a fresh initialized TimescaleDB through level 72 and a second no-op run.
- 2026-09-25: PR3 standardizes non-DEV installs under `/opt/sensorsphere` by default and validates install/update/rollback on an isolated stack without Node.js or source-tree application builds.
- 2026-09-25: PR4 introduces Stack Release schema v3, API contract version 1, database compatibility range metadata, immutable full-SHA image tags, amd64+arm64 official releases, provenance/SBOM attestations, no `latest` tag, and immutable GitHub Stack Releases with checksummed distribution bundles.
- 2026-09-25: Cryptographic image signing is intentionally deferred until a trust/identity policy is defined; registry attestations and immutable Stack Release artifacts are enabled now.
- 2026-09-25: PR-271 adds nginx and migrations release versions to sidebar Build information through runtime configuration and Stack Release 2026.09.25.4.
- 2026-09-26: Stack Release 2026.09.25.4 is the first release published for all five SensorSphere images in GHCR with public anonymous pulls, amd64+arm64 manifests, immutable full-SHA tags, provenance and SBOM attestations.
- 2026-09-26: Git tag and GitHub Release `stack-2026.09.25.4` were published with manifest, distribution bundle and SHA-256 checksum.
- 2026-09-26: Published-artifact DIT smoke install passed using an empty Docker credential store; API 1.45.0, frontend 1.84.0, ingestion 1.0.0, nginx 1.0.0 and migrations 72 were pulled from public registries.
- 2026-09-26: PR-272 hardens release tooling after the first real publication: portable checksum filenames, deterministic tar/gzip metadata, and RDC GitHub release tooling.
- 2026-09-26: The main repository was transferred from `fareg/sensorsphere` to `sensorsphere/sensorsphere`; branches, Stack Release tag and GitHub Release 2026.09.25.4 were preserved.
- 2026-09-26: All five public GHCR application packages were connected to `sensorsphere/sensorsphere`; PR-273 aligns release/bootstrap URLs and switches GitHub Actions GHCR authentication to the repository `GITHUB_TOKEN`.
