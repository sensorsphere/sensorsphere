import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  readBackupSafetyStatus,
  retentionDefinition,
  retentionRisk,
  validateRetentionSeconds
} from "./retention.js";

test("retention risk distinguishes extensions from destructive reductions", () => {
  assert.equal(retentionRisk(90 * 86400, 90 * 86400), "LOW_RISK");
  assert.equal(retentionRisk(90 * 86400, 180 * 86400), "REVIEW_REQUIRED");
  assert.equal(retentionRisk(90 * 86400, null), "REVIEW_REQUIRED");
  assert.equal(retentionRisk(90 * 86400, 30 * 86400), "DESTRUCTIVE");
  assert.equal(retentionRisk(null, 30 * 86400), "DESTRUCTIVE");
});

test("retention validation enforces per-family bounds and unlimited", () => {
  const observations = retentionDefinition("observations");
  assert.equal(
    validateRetentionSeconds(observations, 30 * 86400),
    30 * 86400
  );
  assert.equal(validateRetentionSeconds(observations, null), null);
  assert.throws(
    () => validateRetentionSeconds(observations, 3600),
    /retention must be between/
  );
  assert.throws(
    () => retentionDefinition("other-instance"),
    /Unsupported retention policy/
  );
});

test("backup safety gate accepts only a recent successful create run", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sensorsphere-retention-"));
  const runs = path.join(root, "runs");
  await mkdir(runs, { recursive: true });

  const now = Date.parse("2026-10-05T20:00:00Z");
  await writeFile(
    path.join(runs, "failed.json"),
    JSON.stringify({
      command: "create",
      completedAt: "2026-10-05T19:50:00Z",
      status: "FAILED",
      phase: "FAILED",
      backupId: "failed"
    })
  );
  await writeFile(
    path.join(runs, "valid.json"),
    JSON.stringify({
      command: "create",
      completedAt: "2026-10-05T18:00:00Z",
      status: "SUCCESS",
      phase: "COMPLETE",
      backupId: "valid-backup"
    })
  );

  try {
    const status = await readBackupSafetyStatus(root, 26, true, now);
    assert.equal(status.ok, true);
    assert.equal(status.backupId, "valid-backup");
    assert.equal(status.ageHours, 2);
    assert.equal(status.verificationBasis, "successful-create");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("backup safety gate fails closed when the latest recovery point is stale", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sensorsphere-retention-"));
  const runs = path.join(root, "runs");
  await mkdir(runs, { recursive: true });
  await writeFile(
    path.join(runs, "old.json"),
    JSON.stringify({
      command: "create",
      completedAt: "2026-10-01T00:00:00Z",
      status: "SUCCESS",
      phase: "COMPLETE",
      backupId: "old-backup"
    })
  );

  try {
    const status = await readBackupSafetyStatus(
      root,
      26,
      true,
      Date.parse("2026-10-05T20:00:00Z")
    );
    assert.equal(status.ok, false);
    assert.equal(status.backupId, "old-backup");
    assert.match(status.reason ?? "", /older than 26 hours/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
