import type { Pool, PoolClient } from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import { getConnection, listConnections } from './connections.js';
import { getNetatmoAccessToken, netatmoEncryptionKey } from './credentials.js';
import { readTelemetry } from './telemetry.js';
import { ingestNetatmoReadings } from './ingest.js';
import type { CollectionStatus } from './collector.js';

export function startNetatmoMultiCollector(pool:Pool, logger:FastifyBaseLogger) {
  const raw=process.env.SENSORSPHERE_NETATMO_MULTI_COLLECT_INTERVAL_SECONDS ?? '0';
  const interval=Number(raw);
  if(!Number.isSafeInteger(interval)||interval<0||(interval!==0&&(interval<60||interval>86400)))throw new Error('Invalid Netatmo multi collection interval');
  const statuses=new Map<string,CollectionStatus>();
  let stopped=false;
  async function collect(id:string) {
    if(stopped)return null;
    const status=statuses.get(id) ?? {enabled:interval>0,running:false,lastAttempt:null,lastSuccess:null,lastError:null,consecutiveFailures:0,lastObservations:null};
    statuses.set(id,status);
    if(status.running)return null;
    status.running=true;
    status.lastAttempt=new Date().toISOString();
    let client:PoolClient|undefined;
    let locked=false;
    try {
      client=await pool.connect();
      const result=await client.query("SELECT pg_try_advisory_lock(hashtext('sensorsphere:netatmo:collector:' || $1)) AS acquired",[id]);
      locked=result.rows[0]?.acquired===true;
      if(!locked)return null;
      const config=await getConnection(pool,id);
      if(!config)throw new Error('Netatmo connection unavailable');
      const token=await getNetatmoAccessToken(pool,config,netatmoEncryptionKey(),`netatmo-energy:${id}`);
      if(!token)throw new Error('Netatmo authorization required');
      const ingested=await ingestNetatmoReadings(pool,await readTelemetry(config,token));
      status.lastSuccess=new Date().toISOString();status.lastError=null;status.consecutiveFailures=0;status.lastObservations=ingested.observations;
      return ingested;
    }catch(error){status.consecutiveFailures++;status.lastError=error instanceof Error?error.message:'Unknown error';logger.warn({connectionId:id,failures:status.consecutiveFailures},'Netatmo multi collector failed');return null;}
    finally {if(locked&&client)await client.query("SELECT pg_advisory_unlock(hashtext('sensorsphere:netatmo:collector:' || $1))",[id]).catch(()=>{});client?.release();status.running=false;}
  }
  async function collectAll() {
    const connections=await listConnections(pool);
    await Promise.allSettled(connections.filter(c=>c.enabled).map(c=>collect(c.id)));
  }
  const timer=interval?setInterval(()=>{void collectAll().catch(error=>logger.warn({error},'Netatmo multi collector enumeration failed'));},interval*1000):undefined;
  timer?.unref();
  return {statuses,collect,collectAll,stop:()=>{stopped=true;if(timer)clearInterval(timer);}};
}
