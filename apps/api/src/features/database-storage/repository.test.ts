import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";

import {
  DatabaseStorageRepository,
  classifyRelation,
  type StoragePolicy,
  type StorageRelation
} from "./repository.js";

test("classifies known SensorSphere storage families", () => {
  assert.equal(classifyRelation("measurements"), "Measurements");
  assert.equal(classifyRelation("observations"), "Observations");
  assert.equal(
    classifyRelation("gateway_device_ble_observations"),
    "BLE discovery/coverage"
  );
  assert.equal(classifyRelation("gateway_traffic_events"), "Gateway diagnostics");
  assert.equal(classifyRelation("metric_routing_events"), "Routing diagnostics");
  assert.equal(classifyRelation("observation_hourly"), "Aggregates");
  assert.equal(classifyRelation("auth_audit_log"), "Audit/operational state");
  assert.equal(classifyRelation("database_storage_snapshots"), "Audit/operational state");
  assert.equal(classifyRelation("assets"), "Core configuration");
});

test("classifies unrecognized relations explicitly", () => {
  assert.equal(classifyRelation("future_large_relation"), "Unknown");
});

test("snapshot capture prunes metadata outside the configured retention", async () => {
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const pool = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes("MAX(captured_at)")) {
        return { rows: [{ captured_at: null }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO database_storage_snapshots")) {
        return { rows: [{ id: 1 }], rowCount: 1 };
      }
      if (sql.includes("DELETE FROM database_storage_snapshots")) {
        return { rows: [], rowCount: 2 };
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    }
  } as unknown as Pool;

  class TestRepository extends DatabaseStorageRepository {
    override async getSummary() {
      return {
        databaseBytes: 1_000,
        allocatedRelationBytes: 900,
        dataBytes: 500,
        indexBytes: 400,
        toastBytes: 0
      };
    }

    override async getPolicies(): Promise<StoragePolicy[]> {
      return [];
    }

    override async getChunks() {
      return [];
    }

    override async getRelations(
      _policies: StoragePolicy[]
    ): Promise<StorageRelation[]> {
      return [];
    }
  }

  const repository = new TestRepository(pool);
  const result = await repository.captureSnapshotIfDue(6, 90);

  assert.deepEqual(result, { captured: true, deletedExpired: 2 });
  const deleteCall = calls.find(call =>
    call.sql.includes("DELETE FROM database_storage_snapshots")
  );
  assert.deepEqual(deleteCall?.params, [90]);
});

test("snapshot capture skips expensive collection when the interval is not due", async () => {
  let queryCount = 0;
  const pool = {
    query: async (sql: string) => {
      queryCount += 1;
      if (sql.includes("MAX(captured_at)")) {
        return {
          rows: [{ captured_at: new Date(Date.now() - 30 * 60 * 1000) }],
          rowCount: 1
        };
      }
      throw new Error("Unexpected query after due check");
    }
  } as unknown as Pool;

  const repository = new DatabaseStorageRepository(pool);
  const result = await repository.captureSnapshotIfDue(6, 90);

  assert.deepEqual(result, { captured: false, deletedExpired: 0 });
  assert.equal(queryCount, 1);
});
