import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateStorageAnalytics,
  storageBudgetFromEnv,
  type StorageHistoryPoint
} from "./analytics.js";

function point(capturedAt: string, databaseBytes: number): StorageHistoryPoint {
  return {
    capturedAt,
    databaseBytes,
    allocatedRelationBytes: databaseBytes,
    dataBytes: databaseBytes / 2,
    indexBytes: databaseBytes / 2,
    toastBytes: 0,
    relationCount: 10,
    hypertableCount: 3,
    chunkCount: 20
  };
}

test("calculates growth from snapshots at or before each requested window", () => {
  const now = "2026-10-04T12:00:00.000Z";
  const history = [
    point("2026-09-04T11:00:00.000Z", 1_000),
    point("2026-09-27T11:00:00.000Z", 2_000),
    point("2026-10-03T11:00:00.000Z", 2_800)
  ];

  const result = calculateStorageAnalytics(3_000, now, history, {
    warningBytes: null,
    criticalBytes: null,
    status: "UNCONFIGURED",
    configurationError: null
  });

  assert.equal(result.growth.bytes24h, 200);
  assert.equal(result.growth.bytes7d, 1_000);
  assert.equal(result.growth.bytes30d, 2_000);
  assert.ok(result.growth.averageDailyBytes !== null);
  assert.ok(result.projection.bytes30d !== null);
  assert.ok(result.projection.bytes90d !== null);
  assert.ok(result.projection.bytes180d !== null);
  assert.ok(result.projection.bytes365d !== null);
});

test("does not project growth from less than twelve hours of history", () => {
  const result = calculateStorageAnalytics(
    2_000,
    "2026-10-04T12:00:00.000Z",
    [point("2026-10-04T06:30:00.000Z", 1_900)]
  );

  assert.equal(result.growth.averageDailyBytes, null);
  assert.equal(result.projection.bytes30d, null);
  assert.equal(result.projection.bytes90d, null);
  assert.equal(result.projection.bytes180d, null);
  assert.equal(result.projection.bytes365d, null);
});

test("calculates storage budget states and validates ordering", () => {
  assert.equal(storageBudgetFromEnv(50, "100", "200").status, "OK");
  assert.equal(storageBudgetFromEnv(150, "100", "200").status, "WARNING");
  assert.equal(storageBudgetFromEnv(250, "100", "200").status, "CRITICAL");
  assert.equal(storageBudgetFromEnv(50, undefined, undefined).status, "UNCONFIGURED");

  const invalid = storageBudgetFromEnv(50, "200", "100");
  assert.equal(invalid.status, "UNCONFIGURED");
  assert.match(invalid.configurationError ?? "", /lower than/);
});
