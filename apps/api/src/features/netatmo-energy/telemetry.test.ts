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
    const body = url.endsWith('/api/homesdata') ? { body: { homes: [{ id: 'home-1' }, { id: 'home-2' }] } } : url.includes('home-1') ? { body: { home: { rooms: [{ id: 'room-1', therm_measured_temperature: 20.5, therm_setpoint_temperature: 21, therm_setpoint_mode: 'schedule' }], modules: [{ id: 'module-1', boiler_status: true, reachable: false, battery_percent: 35 }] } } } : { body: { home: { rooms: [{ id: 'room-2' }], modules: [] } } };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  try {
    const result = await readTelemetry(config, 'token');
    assert.equal(calls.length, 3);
    assert.deepEqual(result.rooms[0], { homeId: 'home-1', roomId: 'room-1', measuredTemperature: 20.5, setpointTemperature: 21, setpointMode: 'schedule' });
    assert.equal(result.rooms[1]?.measuredTemperature, null);
    assert.deepEqual(result.modules[0], { homeId: 'home-1', moduleId: 'module-1', heating: true, reachable: false, batteryPercent: 35 });
  } finally { globalThis.fetch = original; }
});
test('rejects upstream HTTP errors', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('unavailable', { status: 503 });
  try { await assert.rejects(readTelemetry(config, 'token'), /503/); } finally { globalThis.fetch = original; }
});
