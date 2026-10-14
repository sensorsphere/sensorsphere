import type { FastifyBaseLogger } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { netatmoConfig } from './client.js';
import { getNetatmoAccessToken, netatmoEncryptionKey } from './credentials.js';
import { readTelemetry } from './telemetry.js';
import { ingestNetatmoReadings } from './ingest.js';

export type CollectionStatus = { enabled: boolean; running: boolean; lastAttempt: string | null; lastSuccess: string | null; lastError: string | null; consecutiveFailures: number; lastObservations: number | null };
export function startNetatmoCollector(pool: Pool, logger: FastifyBaseLogger) {
  const raw = process.env.SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS;
  const interval = raw === undefined || raw === '0' ? 0 : Number(raw);
  if (!Number.isSafeInteger(interval) || interval < 0 || (interval !== 0 && (interval < 60 || interval > 86400))) throw new Error('Netatmo collection interval must be 0 or 60..86400 seconds');
  const status: CollectionStatus = { enabled: interval > 0, running: false, lastAttempt: null, lastSuccess: null, lastError: null, consecutiveFailures: 0, lastObservations: null };
  let stopped = false;
  async function collect() {
    if (status.running || stopped) return null;
    status.running = true;
    status.lastAttempt = new Date().toISOString();
    let client: PoolClient | undefined;
    let locked = false;
    try {
      client = await pool.connect();
      const lock = await client.query("SELECT pg_try_advisory_lock(hashtext($$sensorsphere:netatmo:collector$$)) AS acquired");
      locked = lock.rows[0]?.acquired === true;
      if (!locked) return null;
      const config = netatmoConfig();
      if (!config) throw new Error('Netatmo is not configured');
      const key = netatmoEncryptionKey();
      const token = await getNetatmoAccessToken(pool,config,key);
      if (!token) throw new Error('Netatmo authorization required');
      const result = await ingestNetatmoReadings(pool,await readTelemetry(config,token));
      status.lastSuccess = new Date().toISOString();
      status.lastError = null;
      status.consecutiveFailures = 0;
      status.lastObservations = result.observations;
      return result;
    } catch (error) {
      status.consecutiveFailures++;
      status.lastError = error instanceof Error ? error.message : 'Unknown collection error';
      logger.warn({ failures: status.consecutiveFailures }, 'Netatmo automatic collection failed');
      throw error;
    } finally {
      if (locked && client) await client.query("SELECT pg_advisory_unlock(hashtext('sensorsphere:netatmo:collector'))").catch(()=>{});
      client?.release();
      status.running = false;
    }
  }
  let timer: ReturnType<typeof setInterval> | undefined;
  if (interval) {
    timer = setInterval(() => { void collect().catch(()=>{}); }, interval * 1000);
    timer.unref();
  }
  return { status, collect, stop: () => { stopped = true; if (timer) clearInterval(timer); } };
}
