# SensorSphere — Backup / Restore V2 — BR2-012 Full Restore results

> **Date:** 2026-10-13
> **Status:** IMPLEMENTED / REAL ACCEPTANCE BLOCKED BY GHCR PACKAGE ACTIONS ACCESS
> **Bootstrap:** `recover.sh`
> **Candidate Stack:** 2026.10.13.1
> **Backup module:** 0.2.1
> **Backup format:** 1

---

## 1. Goal

BR2-012 reconstructs a lost SensorSphere installation from:

    exact Stack Release
    +
    verified Recovery Bundle
    +
    operator-supplied recovery configuration/secrets

The recovery path must not depend on a SensorSphere source checkout.

The Recovery Bundle deliberately keeps:

    instanceSecrets.included=false

so secrets are never recovered from plaintext backup metadata.

---

## 2. Implemented bootstrap

`recover.sh` is shipped in the Stack Release distribution and supports:

    ./recover.sh       --full <recovery-bundle-path>       --install-dir <new-install-dir>       --env-file <recovery.env>

Optional controls:

    --release-base-url <url>
    --preflight-only
    --unattended
    --confirm <exact phrase>

Execution sequence:

1. verify Recovery Bundle checksums;
2. require `verification.status=VERIFIED`;
3. validate COMPLETE/manifest/installation/Stack identity;
4. download the exact Stack Release archive and checksum;
5. verify the release archive checksum;
6. compare the downloaded `stack-release.yaml` byte-for-byte with the one in
   the Recovery Bundle;
7. verify every Stack Release image is available from its registry;
8. print the full recovery plan;
9. require strong confirmation;
10. create the new installation;
11. copy operator recovery configuration/secrets;
12. generate a new target PostgreSQL password when one is not supplied;
13. seed backed-up non-secret logical identity unless explicitly overridden;
14. install the exact Stack Release;
15. copy the verified Recovery Bundle into the new backup repository;
16. invoke the already-accepted data-restore workflow;
17. run installation status and report Full recovery SUCCESS.

---

## 3. Safety behavior

The full bootstrap refuses:

- a missing/unverified/corrupt Recovery Bundle;
- mismatched COMPLETE / manifest backup identity;
- mismatched Stack versions across manifest, installation metadata and
  `stack-release.yaml`;
- a non-absolute or dangerous target install directory;
- an already-installed or non-empty target;
- a missing operator env file;
- a missing exact Stack Release;
- a release archive checksum failure;
- a downloaded release whose manifest differs from the backed-up manifest;
- any Stack Release image unavailable from its registry;
- unattended execution without the exact confirmation phrase.

`--preflight-only` performs no target installation mutation.

---

## 4. Automated bootstrap proof

Test:

    scripts/tests/test-recover-full-bootstrap.sh

Result:

    PASS

The test uses a synthetic off-host Recovery Bundle, a synthetic Stack Release
mirror and a fake container-registry probe. It proves:

- preflight does not create the target;
- exact release retrieval/checksum/manifest matching;
- registry-image availability checks;
- target DB password generation when omitted;
- backed-up environment and instance name defaults;
- explicit operator Compose-project override;
- Recovery Bundle copy into the new repository;
- invocation of the accepted data-restore workflow;
- successful Full recovery completion path.

---

## 5. Real deployed-instance source

A fresh Backup V2 Recovery Point was created from the deployed RECOVERY
instance:

    Backup ID: 20261012T232819Z-b3a412cf
    Status:    VERIFIED
    Stack:     2026.10.11.1
    Backup:    0.2.0
    Format:    1
    Size:      63,439,886 bytes

The bundle was copied to an off-installation test location before recovery.

---

## 6. No-source-checkout reconstruction proof

The real test was launched from:

    /home/ubuntu/tmp/br2-012-bootstrap/recover.sh

using:

    /home/ubuntu/tmp/br2-012-offhost/20261012T232819Z-b3a412cf

and an independent Stack Release mirror:

    /home/ubuntu/tmp/br2-012-release-mirror/

The initial preflight returned READY and confirmed that the target directory was
not created.

Evidence:

    /home/ubuntu/tmp/sensorsphere-recovery-evidence/
      br2-012-full-preflight.txt

---

## 7. Artifact-availability defect found

The first real execution proved that Stack Release 2026.10.11.1 was not
actually reconstructible on a clean host.

The release references:

    ghcr.io/sensorsphere/sensorsphere-api:1.73.0
    ghcr.io/sensorsphere/sensorsphere-backup:0.2.0

but those tags are unavailable from GHCR.

The existing RECOVERY instance only runs because the API image is still cached
locally on na-01.

The bootstrap was hardened so image availability is now checked during
preflight, before target creation.

Retest result:

    ERROR: required Stack Release image is unavailable from its registry:
           ghcr.io/sensorsphere/sensorsphere-api:1.73.0

    target_not_created=true

Evidence:

    /home/ubuntu/tmp/sensorsphere-recovery-evidence/
      br2-012-missing-image-preflight.txt

This is an important BR2-012 safety requirement: a Stack Release is not
disaster-recovery-capable unless all referenced immutable artifacts are
retrievable.

---

## 8. Replacement Stack Release

Prepared:

    Stack 2026.10.13.1

Components:

    API        1.74.0
    Frontend   1.121.0
    Ingestion  1.0.3
    nginx      1.0.0
    Migrations 87
    Backup     0.2.1

The locally built distribution contains:

    install.sh
    restore.sh
    recover.sh
    stack-release.yaml

The manifest passes Stack Release validation.

---

## 9. Publication blocker

The normal GitHub Actions release workflow was triggered:

    run 38322630126

Result:

    FAILURE

Successful before failure:

- checkout;
- QEMU/buildx setup;
- Stack manifest validation;
- GHCR authentication;
- API amd64/arm64 build.

Failure:

    failed to push ghcr.io/sensorsphere/sensorsphere-api:1.74.0
    denied: permission_denied: write_package

GitHub package inspection shows:

    sensorsphere-api
      visibility: public
      repository: sensorsphere/sensorsphere

    sensorsphere-backup
      visibility: private
      repository: null

The repository currently has no Actions secret/PAT configured for GHCR.

GitHub requires explicit package-side **Manage Actions access** for repositories
whose workflows write granular-permission packages. This package permission is
not exposed by the REST endpoints available to the current automation.

---

## 10. Remaining acceptance action

BR2-012 code is implemented and locally validated.

Real acceptance remains open until:

1. GitHub package settings grant `sensorsphere/sensorsphere` Actions write
   access to:
   - `sensorsphere-api`;
   - `sensorsphere-backup`;
2. `sensorsphere-backup` is made public;
3. the Stack 2026.10.13.1 release workflow succeeds;
4. a deployed 2026.10.13.1 instance creates a VERIFIED Recovery Point;
5. `recover.sh --full` reconstructs that bundle into a brand-new installation
   without source checkout dependency;
6. runtime/equivalence checks pass.

Until those steps pass:

    BR2-012 = IMPLEMENTED / NOT YET ACCEPTED
