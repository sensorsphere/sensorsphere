import test from 'node:test';
import assert from 'node:assert/strict';
import {probeHistoricalRoomTemperature} from './historical-fallback.js';
const common = {baseUrl:'https://api.netatmo.test',accessToken:'test-token',homeId:'private-home',roomId:'private-room',now:new Date('2026-10-20T12:00:00.000Z')};
test('disabled by default; does not call network', async()=>{
 let called=false;
 await assert.rejects(probeHistoricalRoomTemperature({...common,fetcher:(async()=>{called=true;throw Error('unexpected')}) as typeof fetch}),/disabled by default/);
 assert.equal(called,false);
});
test('returns last valid temperature, historical provenance, and no claimed acquisition time',async()=>{
 let checked=false;
 const fetcher=(async(input: RequestInfo | URL,init?: RequestInit)=>{
  const url=new URL(String(input));
  checked=true;
  assert.equal(url.pathname,'/api/getroommeasure');
  assert.equal(url.searchParams.get('type'),'temperature');
  assert.equal(url.searchParams.get('limit'),'48');
  assert.equal(init?.method,'GET');
  assert.equal(new Headers(init?.headers).get('authorization'),'Bearer test-token');
  return new Response(JSON.stringify({status:'ok',body:[{beg_time:1,step_time:1800,value:[[19.9],null,[19.8]]},{beg_time:100,step_time:1800,value:[[19.7],['bad'],[21.2]]}]}));
 }) as typeof fetch;
 const v=await probeHistoricalRoomTemperature({...common,enabled:true,fetcher});
 assert.equal(checked,true);assert.equal(v.temperatureCelsius,21.2);
 assert.equal(v.provenance,'netatmo:getroommeasure:historical');
 assert.equal(v.timestampConfidence,'unverified');
 assert.equal(v.claimedAcquisitionAt,null);
 assert.equal(v.currentTelemetry,false);
 assert.equal(v.status,'historical-available');
 assert.equal(v.queriedAt,common.now.toISOString());
});
test('empty readings do not create a temperature',async()=>{
 const v=await probeHistoricalRoomTemperature({...common,enabled:true,fetcher:(async()=>new Response(JSON.stringify({status:'ok',body:[{value:[null,[],['bad']]}]}))) as typeof fetch});
 assert.equal(v.temperatureCelsius,null);
 assert.equal(v.status,'no-measurements');
});
test('rejects errors, malformed responses and insecure base URL',async()=>{
 await assert.rejects(probeHistoricalRoomTemperature({...common,enabled:true,baseUrl:'http://example.test'}),/HTTPS/);
 await assert.rejects(probeHistoricalRoomTemperature({...common,enabled:true,fetcher:(async()=>new Response('forbidden',{status:403})) as typeof fetch}),/HTTP 403/);
 await assert.rejects(probeHistoricalRoomTemperature({...common,enabled:true,fetcher:(async()=>new Response(JSON.stringify({status:'error',body:[]}))) as typeof fetch}),/Invalid historical/);
});
