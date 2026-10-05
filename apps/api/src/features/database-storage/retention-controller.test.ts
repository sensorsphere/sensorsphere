import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { DatabaseRetentionController } from "./retention-controller.js";

function fakeRepository() {
  return {
    getManagedPolicies: async () => [
      {
        key: "observations",
        configuredSeconds: 90 * 86400,
        actualSeconds: 90 * 86400,
        inSync: true,
        updatedAt: "2026-10-05T00:00:00.000Z",
        updatedByUserId: null,
        updatedByRole: null
      }
    ],
    previewImpact: async () => ({
      eligibleRows: 1000,
      eligibleChunks: 2,
      estimatedAllocatedBytes: 100_000,
      oldestAffectedAt: "2026-08-01T00:00:00.000Z",
      newestAffectedAt: "2026-09-01T00:00:00.000Z",
      physicalReclaimExpected: true,
      estimateMethod: "chunk-metadata" as const
    }),
    applyPolicy: async () => undefined,
    getAudit: async () => []
  };
}

async function makeRecentBackupState(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "sensorsphere-db3-"));
  const runs = path.join(root, "runs");
  await mkdir(runs, { recursive: true });
  await writeFile(
    path.join(runs, "recent.json"),
    JSON.stringify({
      command: "create",
      completedAt: new Date().toISOString(),
      status: "SUCCESS",
      phase: "COMPLETE",
      backupId: "recent-backup"
    })
  );
  return root;
}

test("retention preview rejects cross-instance target fields", async () => {
  process.env.SENSORSPHERE_ENVIRONMENT = "DEV";
  process.env.SENSORSPHERE_AUTH_ENABLED = "false";
  process.env.SENSORSPHERE_AUTH_DEV_ROLE_SWITCH_ENABLED = "true";

  const controller =
    new DatabaseRetentionController(fakeRepository() as never);

  await assert.rejects(
    controller.preview(
      {
        headers: { "x-sensorsphere-dev-role": "admin" },
        body: {
          policyKey: "observations",
          retentionSeconds: 30 * 86400,
          instance: "another-instance"
        }
      } as never,
      { send: () => undefined } as never
    ),
    /Unsupported request fields: instance/
  );
});

test("destructive retention preview requires and reports a recent recovery point", async () => {
  process.env.SENSORSPHERE_ENVIRONMENT = "DEV";
  process.env.SENSORSPHERE_AUTH_ENABLED = "false";
  process.env.SENSORSPHERE_AUTH_DEV_ROLE_SWITCH_ENABLED = "true";

  const statePath = await makeRecentBackupState();
  process.env.SENSORSPHERE_BACKUP_STATE_VIEW_PATH = statePath;
  process.env.SENSORSPHERE_DB_RETENTION_BACKUP_MAX_AGE_HOURS = "26";

  const controller =
    new DatabaseRetentionController(fakeRepository() as never);
  const sent: Array<Record<string, any>> = [];

  try {
    await controller.preview(
      {
        headers: { "x-sensorsphere-dev-role": "admin" },
        body: {
          policyKey: "observations",
          retentionSeconds: 30 * 86400
        }
      } as never,
      {
        send: (value: Record<string, any>) => {
          sent.push(value);
        }
      } as never
    );

    assert.equal(sent[0]?.risk, "DESTRUCTIVE");
    assert.equal(sent[0]?.backupSafety.ok, true);
    assert.equal(sent[0]?.backupSafety.backupId, "recent-backup");
    assert.equal(sent[0]?.canApply, true);
    assert.equal(sent[0]?.requiredConfirmation, "APPLY RETENTION");
  } finally {
    delete process.env.SENSORSPHERE_BACKUP_STATE_VIEW_PATH;
    await rm(statePath, { recursive: true, force: true });
  }
});

test("retention apply rejects stale preview state", async () => {
  process.env.SENSORSPHERE_ENVIRONMENT = "DEV";
  process.env.SENSORSPHERE_AUTH_ENABLED = "false";
  process.env.SENSORSPHERE_AUTH_DEV_ROLE_SWITCH_ENABLED = "true";

  const controller =
    new DatabaseRetentionController(fakeRepository() as never);

  await assert.rejects(
    controller.apply(
      {
        headers: { "x-sensorsphere-dev-role": "admin" },
        body: {
          policyKey: "observations",
          retentionSeconds: 30 * 86400,
          expectedCurrentSeconds: 60 * 86400,
          confirmation: "APPLY RETENTION"
        }
      } as never,
      { send: () => undefined } as never
    ),
    /changed since preview/
  );
});
