import assert from "node:assert/strict";
import test from "node:test";

import { DatabaseRetentionRepository } from "./retention-repository.js";
import { retentionDefinition } from "./retention.js";

test("retention apply rolls back and audits a failed Timescale policy change", async () => {
  const clientCalls: string[] = [];
  const poolCalls: string[] = [];
  let released = false;

  const client = {
    query: async (sql: string) => {
      clientCalls.push(sql);

      if (sql === "BEGIN") return { rows: [], rowCount: 0 };
      if (sql.includes("remove_retention_policy")) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("add_retention_policy")) {
        throw new Error("injected retention apply failure");
      }
      if (sql === "ROLLBACK") return { rows: [], rowCount: 0 };

      throw new Error("Unexpected client SQL: " + sql);
    },
    release: () => {
      released = true;
    }
  };

  const pool = {
    connect: async () => client,
    query: async (sql: string, params?: unknown[]) => {
      poolCalls.push(sql);
      if (sql.includes("INSERT INTO database_retention_audit")) {
        assert.equal(params?.[6], "FAILED");
        assert.equal(params?.[8], "injected retention apply failure");
        return { rows: [], rowCount: 1 };
      }
      throw new Error("Unexpected pool SQL: " + sql);
    }
  };

  const repository =
    new DatabaseRetentionRepository(pool as never);

  await assert.rejects(
    repository.applyPolicy({
      definition: retentionDefinition("observations"),
      previousSeconds: 90 * 86400,
      requestedSeconds: 30 * 86400,
      risk: "DESTRUCTIVE",
      actor: { userId: null, role: "admin" },
      preview: { test: true }
    }),
    /injected retention apply failure/
  );

  assert.equal(clientCalls[0], "BEGIN");
  assert.ok(
    clientCalls.some(sql => sql.includes("remove_retention_policy"))
  );
  assert.ok(
    clientCalls.some(sql => sql.includes("add_retention_policy"))
  );
  assert.ok(clientCalls.includes("ROLLBACK"));
  assert.ok(
    !clientCalls.some(sql =>
      sql.includes("UPDATE database_retention_settings")
    )
  );
  assert.equal(poolCalls.length, 1);
  assert.equal(released, true);
});

test("diagnostic event retention uses an hourly Timescale schedule", async () => {
  const clientCalls: Array<{ sql: string; params?: unknown[] }> = [];
  let released = false;

  const client = {
    query: async (sql: string, params?: unknown[]) => {
      clientCalls.push({ sql, params });

      if (
        sql === "BEGIN" ||
        sql === "COMMIT" ||
        sql.includes("remove_retention_policy") ||
        sql.includes("add_retention_policy") ||
        sql.includes("UPDATE database_retention_settings") ||
        sql.includes("INSERT INTO database_retention_audit")
      ) {
        return { rows: [], rowCount: 1 };
      }

      throw new Error("Unexpected client SQL: " + sql);
    },
    release: () => {
      released = true;
    }
  };

  const pool = {
    connect: async () => client
  };

  const repository =
    new DatabaseRetentionRepository(pool as never);

  await repository.applyPolicy({
    definition: retentionDefinition("gateway_traffic_events"),
    previousSeconds: 48 * 3600,
    requestedSeconds: 72 * 3600,
    risk: "REVIEW_REQUIRED",
    actor: { userId: null, role: "admin" },
    preview: { test: true }
  });

  const addCall = clientCalls.find(call =>
    call.sql.includes("add_retention_policy")
  );

  assert.ok(addCall);
  assert.deepEqual(addCall.params, [
    "public.gateway_traffic_events",
    72 * 3600,
    3600
  ]);
  assert.ok(clientCalls.some(call => call.sql === "COMMIT"));
  assert.equal(released, true);
});
