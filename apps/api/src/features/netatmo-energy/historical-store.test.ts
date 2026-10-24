import test from 'node:test';
import assert from 'node:assert/strict';
import {roomDigest,saveHistoricalSeries,listHistoricalSeries,purgeExpiredHistoricalSeries,RETENTION_DAYS} from './historical-store.js';
import type {Pool} from 'pg';
import {parseHistoricalGrid} from './historical-series.js';
test('room digest stable and does not leak raw identifier',()=>{
 const digest=roomDigest('private-room');assert.match(digest,/^[a-f0-9]{64}$/);assert.equal(digest,roomDigest('private-room'));
 assert.notEqual(digest,roomDigest('other-room'));assert.throws(()=>roomDigest(''));
});
test('repository writes only isolated historical table and never claims acquisition time',async()=>{
 const sql:string[]=[];let args:unknown[]=[];
 const pool={query:async(q:string,p:unknown[])=>{sql.push(q);args=p;return {rows:[{id:'14'}],rowCount:1};}} as unknown as Pool;
 const series=parseHistoricalGrid({status:'ok',body:[{beg_time:1792600000,step_time:1800,value:[[20.5]]}]},{begin:1792600000,end:1792603600},'2026-10-24T10:00:00Z');
 assert.equal(await saveHistoricalSeries(pool,'homefcs-01','private-room',series),14);
 assert.match(sql[0],/INSERT INTO netatmo_historical_series/);
 assert.doesNotMatch(sql[0],/INSERT INTO observations/);
 assert.equal(args[1],roomDigest('private-room'));
 assert.equal(RETENTION_DAYS,30);
 await listHistoricalSeries(pool,'homefcs-01');
 assert.match(sql[1],/NULL::timestamptz AS "acquisitionAt"/);
 await purgeExpiredHistoricalSeries(pool);assert.match(sql[2],/INTERVAL '30 days'/);
});
