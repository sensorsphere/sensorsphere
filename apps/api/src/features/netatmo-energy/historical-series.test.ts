import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHistoricalGrid} from './historical-series.js';
const bounds={begin:1792600000,end:1792607200};
test('retains gaps, ordinal positions and explicitly unverified acquisition times',()=>{
 const result=parseHistoricalGrid({status:'ok',body:[{beg_time:1792600000,step_time:1800,value:[[20.5],null,[20.6],['bad']]}]},bounds,'2026-10-24T08:00:00Z');
 assert.deepEqual(result.points.map(p=>p.temperatureCelsius),[20.5,null,20.6,null]);
 assert.deepEqual(result.points.map(p=>p.position),[1,2,3,4]);
 assert.equal(result.acquisitionAt,null);
 assert.equal(result.currentTelemetry,false);
 assert.equal(result.quality,'historical_unverified_timestamp');
 assert.equal(result.sourceGridStepSeconds,1800);
});
test('moving the grid changes labels but not claimed acquisition times',()=>{
 const a=parseHistoricalGrid({status:'ok',body:[{beg_time:1792600000,step_time:1800,value:[[20.5]]}]},bounds,'2026-10-24T08:00:00Z');
 const b=parseHistoricalGrid({status:'ok',body:[{beg_time:1792600180,step_time:1800,value:[[20.5]]}]},bounds,'2026-10-24T08:00:00Z');
 assert.notEqual(a.points[0]?.reportedGridTime,b.points[0]?.reportedGridTime);
 assert.equal(a.acquisitionAt,null);assert.equal(b.acquisitionAt,null);
});
test('rejects malformed response and bounded point counts',()=>{
 assert.throws(()=>parseHistoricalGrid({status:'error',body:[]},bounds,'2026-10-24T08:00:00Z'),/Invalid historical/);
 const v=parseHistoricalGrid({status:'ok',body:[{value:Array(200).fill([20.5])}]},bounds,'2026-10-24T08:00:00Z');
 assert.equal(v.points.length,48);
});
