import test from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { ingestNetatmoReadings } from './ingest.js';
import { importNetatmoDiscovery } from './registry.js';
import type { Discovery } from './client.js';

function fakePool() {
  const calls: { sql: string; params?: unknown[] }[] = [];
  let next = 0;
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes('FROM device_types')) return { rows: [{ code: 'thermostat' }] };
      if (sql.includes('SELECT device_id AS id FROM device_registry_identities')) return { rows: [] };
      if (sql.includes('RETURNING id')) return { rows: [{ id: `id-${++next}` }] };
      return { rows: [] };
    },
    release: () => {}
  };
  return { pool: { connect: async () => client } as unknown as Pool, calls };
}
const readings = {
  rooms: [{ homeId: 'home', roomId: 'room', moduleId: 'module', measuredTemperature: 21, setpointTemperature: null, setpointMode: null }],
  modules: [{ homeId: 'home', moduleId: 'module', heating: true, reachable: true, batteryPercent: 75 }]
};
const discovery: Discovery = { homes: 1, devices: [{
  clientKey: 'home:module', parentClientKey: null,
  device: { name: 'Thermostat', deviceClass: 'IOT', deviceType: 'thermostat', technology: 'http', manufacturer: 'Netatmo', model: 'NATherm1', description: 'Test',
    identities: [{ identityType: 'NETATMO_MODULE_ID', value: 'home:module', source: 'NETATMO_ENERGY', isPrimary: true }] }
}] };

test('two connections with identical remote device IDs produce distinct registry identities', async () => {
  const db = fakePool();
  await importNetatmoDiscovery(db.pool, discovery, 'sim-01');
  await importNetatmoDiscovery(db.pool, discovery, 'sim-02');
  const identities = db.calls.filter(c => c.sql.startsWith('INSERT INTO device_registry_identities'));
  assert.deepEqual(identities.map(c => c.params?.[2]), ['sim-01:home:module', 'sim-02:home:module']);
  assert.equal(discovery.devices[0]?.device.identities[0]?.value, 'home:module');
});

test('two connections with identical remote readings produce distinct assets, links and source references', async () => {
  const db = fakePool();
  await ingestNetatmoReadings(db.pool, readings, 'sim-01');
  await ingestNetatmoReadings(db.pool, readings, 'sim-02');
  const assets = db.calls.filter(c => c.sql.startsWith('INSERT INTO assets'));
  assert.deepEqual([...new Set(assets.map(c => c.params?.[0]))], ['sim-01:netatmo:module:home:module', 'sim-02:netatmo:module:home:module']);
  const links = db.calls.filter(c => c.sql.startsWith('INSERT INTO device_registry_links'));
  assert.deepEqual([...new Set(links.map(c => c.params?.[0]))], ['sim-01:home:module', 'sim-02:home:module']);
  const health = db.calls.filter(c => c.sql.includes('UPDATE device_registry_devices AS d'));
  assert.deepEqual(health.map(c => c.params?.[0]), ['sim-01:home:module', 'sim-02:home:module']);
  const observations = db.calls.filter(c => c.sql.startsWith('INSERT INTO observations'));
  assert.deepEqual([...new Set(observations.map(c => c.params?.[5]))], ['netatmo-energy:sim-01', 'netatmo-energy:sim-02']);
});

test('legacy ingestion and discovery retain original unscoped IDs', async () => {
  const db = fakePool();
  await importNetatmoDiscovery(db.pool, discovery);
  await ingestNetatmoReadings(db.pool, readings);
  assert.equal(db.calls.find(c => c.sql.startsWith('INSERT INTO device_registry_identities'))?.params?.[2], 'home:module');
  assert.equal(db.calls.find(c => c.sql.startsWith('INSERT INTO assets'))?.params?.[0], 'netatmo:module:home:module');
  assert.equal(db.calls.find(c => c.sql.startsWith('INSERT INTO observations'))?.params?.[5], 'netatmo-energy');
});
