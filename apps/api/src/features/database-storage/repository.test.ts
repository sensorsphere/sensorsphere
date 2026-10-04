import assert from "node:assert/strict";
import test from "node:test";

import { classifyRelation } from "./repository.js";

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
  assert.equal(classifyRelation("assets"), "Core configuration");
});

test("classifies unrecognized relations explicitly", () => {
  assert.equal(classifyRelation("future_large_relation"), "Unknown");
});
