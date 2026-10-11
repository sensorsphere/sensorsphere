import test from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { ingestNetatmoReadings } from './ingest.js';
function fakePool(failOn?: string) {
  const calls: { sql: string; params?: unknown[] }[] = [];
  let released = false;
  const client = { query: async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    if (failOn && sql.includes(failOn)) throw new Error('injected database failure');
    if (sql.includes('RETURNING id')) return { rows: [{ id: sql.includes('asset_metrics') ? 'metric-id' : `asset-${params?.[0]}` }] };
    return { rows: [] };
  }, release: () => { released = true; } };
  return { pool: { connect: async () => client } as unknown as Pool, calls, get released() { return released; } };
}
const readings = { rooms: [{ homeId: 'h', roomId: 'r', measuredTemperature: 20.5, setpointTemperature: null, setpointMode: 'schedule' }], modules: [{ homeId: 'h', moduleId: 'm', heating: true, reachable: false, batteryPercent: 30 }] };
test('ingestion writes typed samples atomically and skips missing values', async () => {
  const db = fakePool();
  assert.deepEqual(await ingestNetatmoReadings(db.pool, readings), { assets: 2, observations: 5 });
  assert.equal(db.calls[0]?.sql, 'BEGIN');
  assert.equal(db.calls.at(-1)?.sql, 'COMMIT');
  const samples = db.calls.filter(c => c.sql.startsWith('INSERT INTO observations'));
  assert.equal(samples.length, 5);
  assert.ok(samples.some(c => c.params?.[2] === 20.5 && c.params?.[3] === null));
  assert.ok(samples.some(c => c.params?.[4] === false));
  assert.ok(samples.some(c => c.params?.[3] === 'schedule'));
  assert.equal(db.released, true);
});
test('ingestion rolls back and releases client on database error', async () => {
  const db = fakePool('INSERT INTO observations');
  await assert.rejects(ingestNetatmoReadings(db.pool, readings), /injected database failure/);
  assert.equal(db.calls.at(-1)?.sql, 'ROLLBACK');
  assert.equal(db.released, true);
});
