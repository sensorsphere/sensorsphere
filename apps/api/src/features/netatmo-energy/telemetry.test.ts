import test from 'node:test';
import assert from 'node:assert/strict';
import { readTelemetry } from './telemetry.js';
const config = { baseUrl: 'https://netatmo.example', clientId: 'test', clientSecret: 'test', redirectUri: 'https://callback.example' };
test('reads multi-home status with typed values and null for missing values', async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input); calls.push(url);
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer token');
    const body = url.endsWith('/api/homesdata') ? { body: { homes: [{ id: 'home-1', rooms: [{ id: 'room-1', module_ids: ['module-1'] }] }, { id: 'home-2' }] } } : url.includes('home-1') ? { body: { home: { rooms: [{ id: 'room-1', therm_measured_temperature: 20.5, therm_setpoint_temperature: 21, therm_setpoint_mode: 'schedule', outdoor_temperature: 8 }], modules: [{ id: 'module-1', boiler_status: true, boiler_fault: false, reachable: false, battery_percent: 35 }] } } } : { body: { home: { rooms: [{ id: 'room-2' }], modules: [] } } };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  try {
    const result = await readTelemetry(config, 'token');
    assert.equal(calls.length, 3);
    assert.deepEqual(result.rooms[0], { homeId: 'home-1', roomId: 'room-1', moduleId: 'module-1', measuredTemperature: 20.5, setpointTemperature: 21, setpointMode: 'schedule', outdoorTemperature: 8 });
    assert.equal(result.rooms[1]?.measuredTemperature, null);
    assert.equal(result.rooms[1]?.outdoorTemperature, null);
    assert.deepEqual(result.modules[0], { homeId: 'home-1', moduleId: 'module-1', heating: true, boilerFault: false, reachable: false, batteryPercent: 35 });
  } finally { globalThis.fetch = original; }
});
test('rejects upstream HTTP errors', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('unavailable', { status: 503 });
  try { await assert.rejects(readTelemetry(config, 'token'), /503/); } finally { globalThis.fetch = original; }
});
test('reports safe Netatmo device error codes instead of generic invalid status',async()=>{
 const saved=globalThis.fetch;
 globalThis.fetch=(async(input)=>new Response(JSON.stringify(String(input).includes('homesdata')?{body:{homes:[{id:'home-private',rooms:[],modules:[]}]}}:{status:'ok',body:{home:{id:'home-private'},errors:[{code:2,id:'private-device-id'}]}}),{status:200})) as typeof fetch;
 try{const result=await readTelemetry(config,'token');assert.equal(result.rooms.length,0);assert.equal(result.modules.length,0);assert.deepEqual(result.diagnostics,[{homeIndex:1,moduleType:'unknown',code:2}]);assert.equal(result.homesAvailable,0);}finally{globalThis.fetch=saved;}
});

test('preserves valid telemetry when a different home has an offline NAPlug',async()=>{
 const saved=globalThis.fetch;
 globalThis.fetch=(async input=>{
  const url=String(input);
  if(url.endsWith('/api/homesdata'))return new Response(JSON.stringify({body:{homes:[{id:'home-a',modules:[{id:'relay-private',type:'NAPlug'}]},{id:'home-b',modules:[]}]}}));
  if(url.includes('home-a'))return new Response(JSON.stringify({body:{home:{id:'home-a'},errors:[{code:2,id:'relay-private'}]}}));
  return new Response(JSON.stringify({body:{home:{rooms:[{id:'room',therm_measured_temperature:19.8}],modules:[]}}}));
 }) as typeof fetch;
 try{const result=await readTelemetry(config,'token');assert.equal(result.rooms.length,1);assert.equal(result.rooms[0].measuredTemperature,19.8);assert.deepEqual(result.diagnostics,[{homeIndex:1,moduleType:'NAPlug',code:2}]);assert.equal(result.homesAvailable,1);assert.equal(result.homesTotal,2);assert.ok(!JSON.stringify(result).includes('relay-private'));}finally{globalThis.fetch=saved;}
});
