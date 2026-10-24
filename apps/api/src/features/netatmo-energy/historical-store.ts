import type {Pool} from 'pg';
import {createHash} from 'node:crypto';
import type {HistoricalGridSeries} from './historical-series.js';

export const RETENTION_DAYS=30;
export function roomDigest(roomId:string):string {
  if(!roomId || roomId.length>512)throw new Error('Invalid room key');
  return createHash('sha256').update(roomId).digest('hex');
}
export async function saveHistoricalSeries(pool:Pool,connectionId:string,roomId:string,series:HistoricalGridSeries):Promise<number>{
  // No inserts into observations or asset history; do not interpret grid as acquisition time.
  const result=await pool.query<{id:string}>(`INSERT INTO netatmo_historical_series
  (connection_id,room_digest,fetched_at,requested_begin,requested_end,grid_step_seconds,points)
  VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING id`,[
    connectionId,roomDigest(roomId),series.queriedAt,series.requestedWindow.begin,
    series.requestedWindow.end,series.sourceGridStepSeconds,JSON.stringify(series.points)
  ]);
  return Number(result.rows[0]?.id);
}
export async function listHistoricalSeries(pool:Pool,connectionId:string,limit=15){
  const result=await pool.query(`SELECT id,fetched_at AS "fetchedAt",
    requested_begin AS "requestedBegin",requested_end AS "requestedEnd",
    source,quality,grid_step_seconds AS "gridStepSeconds",points,
    NULL::timestamptz AS "acquisitionAt"
    FROM netatmo_historical_series WHERE connection_id=$1
    ORDER BY fetched_at DESC,id DESC LIMIT $2`,[connectionId,Math.max(1,Math.min(30,limit))]);
  return result.rows;
}
export async function purgeExpiredHistoricalSeries(pool:Pool):Promise<number>{
  const result=await pool.query(`DELETE FROM netatmo_historical_series WHERE created_at < NOW()- INTERVAL '30 days'`);
  return result.rowCount??0;
}
