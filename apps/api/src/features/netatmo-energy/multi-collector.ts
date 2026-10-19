import type { Pool, PoolClient } from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import { getConnection } from './connections.js';
import { getNetatmoAccessToken, netatmoEncryptionKey } from './credentials.js';
import { readTelemetry } from './telemetry.js';
import { ingestNetatmoReadings } from './ingest.js';
import type { CollectionStatus } from './collector.js';

// Scheduling state is durable in Postgres; the short interval merely checks due connections.
// A database advisory lock avoids duplicate collection when more than one API instance is running.
export function startNetatmoMultiCollector(pool:Pool, logger:FastifyBaseLogger) {
  const statuses=new Map<string,CollectionStatus>();
  let stopped=false;
  let enumerating=false;
  async function collect(id:string, scheduled=false) {
    if(stopped)return null;
    const status=statuses.get(id) ?? {enabled:true,running:false,lastAttempt:null,lastSuccess:null,lastError:null,consecutiveFailures:0,lastObservations:null};
    statuses.set(id,status);
    if(status.running)return null;
    status.running=true;
    let client:PoolClient|undefined;
    let locked=false;
    try {
      client=await pool.connect();
      locked=(await client.query("SELECT pg_try_advisory_lock(hashtext('sensorsphere:netatmo:collector:' || $1)) AS acquired",[id])).rows[0]?.acquired===true;
      if(!locked)return null;
      const schedule=await pool.query<{enabled:boolean;collect_interval_seconds:number;collect_next_at:Date|null}>('SELECT enabled,collect_interval_seconds,collect_next_at FROM netatmo_connections WHERE id=$1',[id]);
      const row=schedule.rows[0];
      if(!row||!row.enabled||scheduled&&(row.collect_interval_seconds===0||row.collect_next_at&&row.collect_next_at.getTime()>Date.now()))return null;
      const at=new Date().toISOString();
      status.lastAttempt=at;
      await pool.query('UPDATE netatmo_connections SET collect_last_attempt_at=NOW() WHERE id=$1',[id]);
      const config=await getConnection(pool,id);
      if(!config)throw new Error('Connection disabled or unavailable');
      const token=await getNetatmoAccessToken(pool,config,netatmoEncryptionKey(),`netatmo-energy:${id}`);
      if(!token)throw new Error('Netatmo authorization required');
      const readings=await readTelemetry(config,token);
      const ingested=await ingestNetatmoReadings(pool,readings,id);
      const codes=(readings.diagnostics??[]).map(d=>`home ${d.homeIndex} / ${d.moduleType}: code ${d.code}`);
      const incomplete=codes.length>0||ingested.observations===0;
      const diagnostic=incomplete?(codes.length?`Partial/unavailable homestatus (${codes.join(', ')})`:'No current telemetry returned by homestatus'):null;
      await pool.query(`INSERT INTO netatmo_collection_diagnostics(connection_id,status,observation_count,home_count,home_available,details)
        VALUES($1,$2,$3,$4,$5,$6)`,[id,incomplete?'partial':'ok',ingested.observations,readings.homesTotal??0,readings.homesAvailable??0,JSON.stringify(readings.diagnostics??[])]);
      if(incomplete){
        status.lastError=diagnostic;status.consecutiveFailures++;
        await pool.query(`UPDATE netatmo_connections SET collect_last_error=$2,collect_last_observations=$3,
          collect_next_at=CASE WHEN collect_interval_seconds=0 THEN NULL ELSE NOW()+(collect_interval_seconds::text||' seconds')::interval END WHERE id=$1`,[id,diagnostic,ingested.observations]);
        return ingested;
      }
      status.lastSuccess=new Date().toISOString();status.lastError=null;status.consecutiveFailures=0;status.lastObservations=ingested.observations;
      await pool.query("UPDATE netatmo_connections SET collect_last_success_at=NOW(),collect_last_error=NULL,collect_last_observations=$2,collect_next_at=CASE WHEN collect_interval_seconds=0 THEN NULL ELSE NOW()+(collect_interval_seconds::text||' seconds')::interval END WHERE id=$1",[id,ingested.observations]);
      if(id.startsWith('sim-')){
        try{
          const response=await fetch(new URL('/api/integration-report',config.baseUrl),{
            method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
            body:JSON.stringify({connectionId:id,operation:'collection',assets:ingested.assets,observations:ingested.observations}),
            redirect:'error',signal:AbortSignal.timeout(2500)
          });
          if(!response.ok)logger.warn({connectionId:id,httpStatus:response.status},'Simulator collection status report rejected');
        }catch{logger.warn({connectionId:id},'Simulator collection status report unavailable');}
      }
      return ingested;
    }catch(error){
      const message=error instanceof Error?error.message:'Unknown Netatmo collector error';
      status.consecutiveFailures++;status.lastError=message;
      await pool.query("UPDATE netatmo_connections SET collect_last_error=$2,collect_next_at=CASE WHEN collect_interval_seconds=0 THEN NULL ELSE NOW()+(collect_interval_seconds::text||' seconds')::interval END WHERE id=$1",[id,message]).catch(()=>{});
      await pool.query(`INSERT INTO netatmo_collection_diagnostics(connection_id,status,observation_count,home_count,home_available,details) VALUES($1,'failed',0,0,0,$2)`,[id,JSON.stringify([{error:message.replace(/[0-9a-f]{2}(:[0-9a-f]{2}){5}/gi,'[module]')}])]).catch(()=>{});
      logger.warn({connectionId:id,error:message},'Scheduled Netatmo collection failed');
      return null;
    }finally{
      if(locked&&client)await client.query("SELECT pg_advisory_unlock(hashtext('sensorsphere:netatmo:collector:' || $1))",[id]).catch(()=>{});
      client?.release();status.running=false;
    }
  }
  async function collectAll(){
    if(stopped||enumerating)return;
    enumerating=true;
    try{
      const due=await pool.query<{id:string}>("SELECT id FROM netatmo_connections WHERE enabled=TRUE AND collect_interval_seconds>0 AND collect_next_at<=NOW() ORDER BY collect_next_at LIMIT 30");
      await Promise.allSettled(due.rows.map(row=>collect(row.id,true)));
    }finally{enumerating=false;}
  }
  const timer=setInterval(()=>{void collectAll().catch(error=>logger.warn({error},'Netatmo scheduler failed'));},15000);
  timer.unref();
  return {statuses,collect,collectAll,stop:()=>{stopped=true;clearInterval(timer);}};
}
