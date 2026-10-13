import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { registerNetatmoEnergyFeature } from './index.js';

const paths = ['/api/v1/integrations/netatmo/discovery/import', '/api/v1/integrations/netatmo/telemetry/ingest'];

test('Netatmo writes use shared admin authorization, including DEV role switch', async () => {
  const saved = Object.fromEntries(['SENSORSPHERE_ENVIRONMENT', 'SENSORSPHERE_AUTH_ENABLED', 'SENSORSPHERE_AUTH_DEV_ROLE_SWITCH_ENABLED', 'SENSORSPHERE_AUTH_DEV_DEFAULT_ROLE', 'SENSORSPHERE_NETATMO_BASE_URL'].map(key => [key, process.env[key]]));
  const app = Fastify();
  try {
    process.env.SENSORSPHERE_ENVIRONMENT = 'DEV';
    process.env.SENSORSPHERE_AUTH_ENABLED = 'false';
    process.env.SENSORSPHERE_AUTH_DEV_ROLE_SWITCH_ENABLED = 'true';
    process.env.SENSORSPHERE_AUTH_DEV_DEFAULT_ROLE = 'user';
    process.env.SENSORSPHERE_NETATMO_BASE_URL = 'http://127.0.0.1:8091';
    registerNetatmoEnergyFeature(app, {} as never);
    await app.ready();
    for (const url of paths) {
      for (const role of ['user', 'admin']) {
        const response = await app.inject({ method: 'POST', url, headers: { 'x-sensorsphere-dev-role': role }, payload: {} });
        assert.equal(response.statusCode, role === 'admin' ? 400 : 403, `${url} ${role}`);
      }
    }
    process.env.SENSORSPHERE_AUTH_DEV_ROLE_SWITCH_ENABLED = 'false';
    for (const url of paths) {
      const response = await app.inject({ method: 'POST', url, headers: { 'x-sensorsphere-dev-role': 'admin' }, payload: {} });
      assert.equal(response.statusCode, 403, `${url} disabled switch`);
    }
    process.env.SENSORSPHERE_AUTH_ENABLED = 'true';
    process.env.SENSORSPHERE_AUTH_DEV_ROLE_SWITCH_ENABLED = 'true';
    for (const url of paths) {
      const response = await app.inject({ method: 'POST', url, headers: { 'x-sensorsphere-dev-role': 'admin' }, payload: {} });
      assert.equal(response.statusCode, 403, `${url} auth enabled`);
    }
  } finally {
    await app.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
