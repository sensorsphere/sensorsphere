// Real PostgreSQL lock contention, no persistent data writes.
import assert from 'node:assert/strict';
import pg from 'pg';
import { startNetatmoCollector } from './collector.js';
const pool = new pg.Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,max:5});
const lockClient=await pool.connect();
const previous=process.env.SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS;
let collector;
let held=false;
try {
  process.env.SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS='0';
  collector=startNetatmoCollector(pool,{warn:()=>{}});
  const acquired=await lockClient.query("SELECT pg_try_advisory_lock(hashtext('sensorsphere:netatmo:collector')) AS acquired");
  assert.equal(acquired.rows[0].acquired,true);
  held=true;
  assert.equal(await collector.collect(),null,'second session must skip collection');
  assert.equal(collector.status.consecutiveFailures,0);
  assert.equal(collector.status.running,false);
  const unlocked=await lockClient.query("SELECT pg_advisory_unlock(hashtext('sensorsphere:netatmo:collector')) AS released");
  assert.equal(unlocked.rows[0].released,true);
  held=false;
  console.log('PASS: real PostgreSQL session lock contention; skipped without error; no data writes');
} finally {
  if(held) await lockClient.query("SELECT pg_advisory_unlock(hashtext('sensorsphere:netatmo:collector'))");
  collector?.stop();
  lockClient.release();
  if(previous===undefined) delete process.env.SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS; else process.env.SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS=previous;
  await pool.end();
}
