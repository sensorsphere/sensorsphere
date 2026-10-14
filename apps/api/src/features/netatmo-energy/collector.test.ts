import test from 'node:test';
import assert from 'node:assert/strict';
import { startNetatmoCollector } from './collector.js';
import type { Pool } from 'pg';
import type { FastifyBaseLogger } from 'fastify';
const logger = { warn: () => {} } as unknown as FastifyBaseLogger;
test('automatic collector defaults to disabled and does not access DB', async () => {
  const previous = process.env.SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS;
  delete process.env.SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS;
  try {
    const collector = startNetatmoCollector({ connect: () => { throw new Error('Unexpected DB access'); } } as unknown as Pool,logger);
    assert.equal(collector.status.enabled,false);
    assert.equal(collector.status.lastAttempt,null);
    collector.stop();
  } finally { if (previous === undefined) delete process.env.SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS; else process.env.SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS = previous; }
});
test('automatic collector rejects invalid intervals', () => {
  const previous = process.env.SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS;
  try {
    for (const invalid of ['-1','1','59','abc','86401']) {
      process.env.SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS = invalid;
      assert.throws(() => startNetatmoCollector({} as Pool,logger));
    }
  } finally { if (previous === undefined) delete process.env.SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS; else process.env.SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS = previous; }
});
test('failed PostgreSQL connection clears running state and permits retry', async () => {
  let attempts = 0;
  const pool = { connect: async () => { attempts++; throw new Error('database offline'); } } as unknown as Pool;
  const collector = startNetatmoCollector(pool,logger);
  try {
    await assert.rejects(collector.collect(), /database offline/);
    assert.equal(collector.status.running,false);
    assert.equal(collector.status.consecutiveFailures,1);
    await assert.rejects(collector.collect(), /database offline/);
    assert.equal(attempts,2);
    assert.equal(collector.status.consecutiveFailures,2);
  } finally { collector.stop(); }
});
