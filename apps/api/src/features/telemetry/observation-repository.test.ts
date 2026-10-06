import assert from "node:assert/strict";
import test from "node:test";

import {
  PostgresObservationRepository,
  observationAggregateTier
} from "./observation-repository.js";

test("observation aggregate tier routes fine buckets to raw", () => {
  assert.equal(observationAggregateTier("1 minute"), "raw");
  assert.equal(observationAggregateTier("5 minutes"), "raw");
  assert.equal(observationAggregateTier("15 minutes"), "raw");
});

test("observation aggregate tier routes hourly-compatible buckets to the continuous aggregate", () => {
  assert.equal(observationAggregateTier("1 hour"), "hourly");
  assert.equal(observationAggregateTier("6 hours"), "hourly");
  assert.equal(observationAggregateTier("1 day"), "hourly");
});

test("raw aggregate query does not depend on observation_hourly", async () => {
  let capturedSql = "";
  let capturedParams: unknown[] = [];

  const pool = {
    query: async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      capturedParams = params;
      return { rows: [] };
    }
  };

  const repository =
    new PostgresObservationRepository(pool as never);

  const from = new Date("2026-10-01T00:07:00.000Z");
  const to = new Date("2026-10-02T00:07:00.000Z");

  await repository.aggregate({
    metricId: "00000000-0000-0000-0000-000000000001",
    from,
    to,
    bucket: "15 minutes"
  });

  assert.match(capturedSql, /FROM observations o/);
  assert.doesNotMatch(capturedSql, /observation_hourly/);
  assert.deepEqual(capturedParams, [
    "00000000-0000-0000-0000-000000000001",
    from,
    to,
    "15 minutes"
  ]);
});

test("hourly aggregate query merges continuous-aggregate full hours with raw boundaries", async () => {
  let capturedSql = "";
  let capturedParams: unknown[] = [];

  const pool = {
    query: async (sql: string, params: unknown[]) => {
      capturedSql = sql;
      capturedParams = params;
      return { rows: [] };
    }
  };

  const repository =
    new PostgresObservationRepository(pool as never);

  const from = new Date("2026-10-01T00:07:00.000Z");
  const to = new Date("2026-10-10T05:43:00.000Z");

  await repository.aggregate({
    metricId: "00000000-0000-0000-0000-000000000001",
    from,
    to,
    bucket: "6 hours"
  });

  assert.match(capturedSql, /FROM observation_hourly h/);
  assert.match(capturedSql, /raw_boundary_segments/);
  assert.match(capturedSql, /o\.time >= \$2::timestamptz/);
  assert.match(capturedSql, /o\.time <= \$3::timestamptz/);
  assert.match(capturedSql, /o\.time >=\s*time_bucket\(\s*INTERVAL '1 hour',\s*\$3::timestamptz/s);
  assert.match(capturedSql, /SUM\(\s*avg_value \*\s*sample_count/s);
  assert.deepEqual(capturedParams, [
    "00000000-0000-0000-0000-000000000001",
    from,
    to,
    "6 hours"
  ]);
});
