# SensorSphere — Backup / Restore V2 — BR2-012 Full Restore results

> **Date:** 2026-10-13
> **Status:** ACCEPTED — P2-K001..P2-K015 PASS
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

## 9. Stack Release publication

The first two publication attempts exposed a GitHub Packages permission issue:

    run 38322630126
    run 38352093904

Both built the API multi-arch image successfully but failed while pushing to
GHCR with:

    permission_denied: write_package

Package-side GitHub Actions access was corrected and the Backup package was
made public.

Final publication run:

    38352713536

Result:

    SUCCESS

Published immutable artifacts:

    ghcr.io/sensorsphere/sensorsphere-api:1.74.0
    ghcr.io/sensorsphere/sensorsphere-backup:0.2.1

Published GitHub Stack Release:

    stack-2026.10.13.1

Assets:

    2026.10.13.1.yaml
    sensorsphere-2026.10.13.1.tar.gz
    sensorsphere-2026.10.13.1.tar.gz.sha256

All Stack Release component images were subsequently verified as remotely
available before the final Full Restore.

---

## 10. Real Full Restore acceptance

A dedicated source instance was installed exclusively from the public
`stack-2026.10.13.1` release:

    /home/ubuntu/tmp/sensorsphere-full-source

Source deployment identity:

    instance        SensorSphere [FULL-SOURCE]
    environment     RECOVERY
    Stack           2026.10.13.1
    API             1.74.0
    Backup          0.2.1
    migrations      87

The accepted DEV reference dataset was restored into this deployed instance.
A fresh Backup 0.2.1 Recovery Point was then created:

    Backup ID: 20261013T055313Z-96edbd22
    Status:    VERIFIED
    Size:      58,610,956 bytes
    Stack:     2026.10.13.1
    Backup:    0.2.1
    Format:    1

Source equivalence snapshot:

    devices       26
    identities    61
    entities      112
    checks        24
    observations  5,545,919
    History SHA256
      a918d60e195e9ce5c9e4a3d1cb6e497be2facbfd8e21dbf130bbaa8eff561220

The Recovery Point was copied outside the source installation before recovery.

---

## 11. Brand-new installation reconstruction

The final recovery was executed from the `recover.sh` contained in the
publicly downloaded Stack Release bundle, not from the source checkout.

Off-installation Recovery Bundle:

    /home/ubuntu/tmp/br2-012-final-offhost/
      20261013T055313Z-96edbd22

Brand-new target:

    /home/ubuntu/tmp/sensorsphere-full-recovered

Operator deployment overrides:

    COMPOSE_PROJECT_NAME=sensorsphere-full-recovered
    WEB_BIND_ADDRESS=127.0.0.1
    WEB_PORT=28084
    MQTT_BIND_ADDRESS=127.0.0.1
    MQTT_PORT=11887
    SENSORSPHERE_AUTH_ENABLED=false

The Full Restore preflight:

- verified bundle checksums and VERIFIED status;
- downloaded and checksummed the public Stack Release;
- matched the downloaded Stack manifest to the backed-up manifest;
- verified every required immutable image in GHCR;
- printed the reconstruction plan;
- returned READY;
- left the target directory absent.

Evidence:

    /home/ubuntu/tmp/sensorsphere-recovery-evidence/
      br2-012-final-preflight.txt

---

## 12. Full Restore execution result

Result:

    SUCCESS

The bootstrap:

1. created the brand-new installation;
2. installed exact Stack 2026.10.13.1 from public immutable artifacts;
3. reached healthy runtime before data mutation;
4. copied the verified Recovery Point into the new backup repository;
5. ran the accepted data-restore workflow;
6. created and verified the mandatory target safety backup;
7. restored DB/app/Mosquitto data;
8. ran migration level 87;
9. restarted runtime;
10. completed all health checks;
11. finalized restore state as SUCCESS / COMPLETE.

Restore run:

    restore-20261013T055509Z-f569c816

Source Recovery Point:

    20261013T055313Z-96edbd22

Target safety backup:

    20261013T055503Z-f8cee403
    VERIFIED
    COMPLETE retained

Final target:

    Stack Release  2026.10.13.1
    API            1.74.0
    Frontend       1.121.0
    Ingestion      1.0.3
    nginx          1.0.0
    Migrations     87
    Backup         0.2.1

Runtime:

    timescaledb        healthy
    api                healthy
    frontend           healthy
    nginx              healthy
    ingestion-service  running
    mosquitto           running
    migrations         exited 0

Evidence:

    /home/ubuntu/tmp/sensorsphere-recovery-evidence/
      br2-012-final-full-recovery.log
      br2-012-final-gate.json

---

## 13. Data equivalence and functional smoke

Result:

    PASS

The source and fully recovered database snapshots are semantically identical
when the snapshot capture timestamp is excluded.

Verified:

    source observations  5,545,919
    target observations  5,545,919

    source devices       26
    target devices       26

    History source SHA256
      a918d60e195e9ce5c9e4a3d1cb6e497be2facbfd8e21dbf130bbaa8eff561220

    History target SHA256
      a918d60e195e9ce5c9e4a3d1cb6e497be2facbfd8e21dbf130bbaa8eff561220

The target PostgreSQL password differs from the source password, proving that
the target secret was regenerated rather than restored from the bundle.

Functional smoke inside the reconstructed runtime:

    API health       HTTP 200
    nginx -> API     HTTP 200
    History API      HTTP 200
    historical rows  1

The History API successfully returned an observation dated
2026-08-09T22:02:00Z after reconstruction.

Host-loopback curl from the RDC command context cannot reach any of the
127.0.0.1-published SensorSphere test ports, including the pre-existing
RECOVERY instance. Docker reports the expected published ports and internal
nginx/API health checks return 200, so this is recorded as an RDC/host-network
context limitation rather than a Full Restore regression.

Evidence:

    /home/ubuntu/tmp/sensorsphere-recovery-evidence/
      br2-012-full-source-snapshot.json
      br2-012-full-recovered-snapshot.json
      br2-012-equivalence.json
      br2-012-final-smoke.json
      br2-012-final-gate.json

---

## 14. BR2-012 acceptance

All mandatory P2-K acceptance criteria pass.

    P2-K001..P2-K015: PASS
    P2-K010: PASS
    P2-K011: PASS
    P2-K012: PASS

BR2-012:

    ACCEPTED

Backup / Restore V2 now has both:

    Data Restore Foundation — ACCEPTED
    Full Restore Foundation — ACCEPTED

No destructive TEST1 restore was used for BR2-012 acceptance.
