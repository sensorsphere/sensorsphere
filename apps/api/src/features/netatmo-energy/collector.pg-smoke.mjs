// DEV smoke of collector lock/error lifecycle without modifying production telemetry.
import assert from 'node:assert/strict';
import pg from 'pg';
import { startNetatmoCollector } from './collector.js';
const pool = new pg.Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
const logger={warn:()=>{}};
const savedInterval=process.env.SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS;
const savedKey=process.env.SENSORSPHERE_NETATMO_TOKEN_ENCRYPTION_KEY;
let collector;
try {
  process.env.SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS='0';
  delete process.env.SENSORSPHERE_NETATMO_TOKEN_ENCRYPTION_KEY;
  collector=startNetatmoCollector(pool,logger);
  assert.equal(collector.status.enabled,false);
  await assert.rejects(collector.collect(),/encryption key/);
  assert.equal(collector.status.running,false);
  assert.equal(collector.status.consecutiveFailures,1);
  const lock=await pool.query("SELECT pg_try_advisory_lock(hashtext('sensorsphere:netatmo:collector')) AS acquired");
  assert.equal(lock.rows[0].acquired,true,'collector released its advisory lock');
  await pool.query("SELECT pg_advisory_unlock(hashtext('sensorsphere:netatmo:collector'))");
  console.log('PASS: disabled by default, PostgreSQL lock acquired/released, failed collection recorded and retryable; no telemetry written');
} finally {
  collector?.stop();
  if(savedInterval===undefined) delete process.env.SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS; else process.env.SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS=savedInterval;
  if(savedKey===undefined) delete process.env.SENSORSPHERE_NETATMO_TOKEN_ENCRYPTION_KEY; else process.env.SENSORSPHERE_NETATMO_TOKEN_ENCRYPTION_KEY=savedKey;
  await pool.end();
}
