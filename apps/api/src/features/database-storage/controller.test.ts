import assert from "node:assert/strict";
import test from "node:test";

import { DatabaseStorageController } from "./controller.js";

function fakeRepository() {
  return {
    getSummary: async () => ({
      databaseBytes: 1_000,
      allocatedRelationBytes: 900,
      dataBytes: 500,
      indexBytes: 400,
      toastBytes: 0
    }),
    getPolicies: async () => [],
    getChunks: async () => [],
    getIndexes: async () => [],
    getContinuousAggregates: async () => [],
    getHistory: async () => [],
    getRelations: async () => []
  };
}

test("database storage report rejects a non-admin user", async () => {
  process.env.SENSORSPHERE_ENVIRONMENT = "DEV";
  process.env.SENSORSPHERE_AUTH_ENABLED = "false";
  process.env.SENSORSPHERE_AUTH_DEV_ROLE_SWITCH_ENABLED = "false";

  const controller =
    new DatabaseStorageController(fakeRepository() as never);

  await assert.rejects(
    controller.report(
      {
        headers: {},
        sensorSphereUser: { role: "user" }
      } as never,
      { send: () => undefined } as never
    ),
    /Administrator role required/
  );
});

test("database storage report accepts an admin and remains read-only", async () => {
  const controller =
    new DatabaseStorageController(fakeRepository() as never);
  const sent: Array<Record<string, unknown>> = [];

  await controller.report(
    {
      headers: {},
      sensorSphereUser: { role: "admin" }
    } as never,
    {
      send: (value: Record<string, unknown>) => {
        sent.push(value);
      }
    } as never
  );

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.readOnly, true);
  assert.deepEqual(sent[0]?.history, []);
});
