import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerNetatmoEnergyFeature } from './index.js';

test('OAuth callback requires admin and rejects missing parameters without DB access', async () => {
  const keys = ['SENSORSPHERE_ENVIRONMENT','SENSORSPHERE_AUTH_ENABLED','SENSORSPHERE_AUTH_DEV_ROLE_SWITCH_ENABLED','SENSORSPHERE_AUTH_DEV_DEFAULT_ROLE','SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS'];
  const saved = keys.map(k => process.env[k]);
  const app = Fastify();
  try {
    process.env.SENSORSPHERE_ENVIRONMENT='DEV';
    process.env.SENSORSPHERE_AUTH_ENABLED='false';
    process.env.SENSORSPHERE_AUTH_DEV_ROLE_SWITCH_ENABLED='true';
    process.env.SENSORSPHERE_AUTH_DEV_DEFAULT_ROLE='user';
    process.env.SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS='0';
    registerNetatmoEnergyFeature(app, {} as never);
    await app.ready();
    const url='/api/v1/integrations/netatmo/callback';
    const denied=await app.inject({method:'GET',url,headers:{'x-sensorsphere-dev-role':'user'}});
    assert.equal(denied.statusCode,403);
    const malformed=await app.inject({method:'GET',url,headers:{'x-sensorsphere-dev-role':'admin'}});
    assert.equal(malformed.statusCode,400);
    assert.equal(malformed.headers['cache-control'],'no-store');
    assert.equal(malformed.headers['referrer-policy'],'no-referrer');
  } finally {
    await app.close();
    keys.forEach((k,i)=>{ if(saved[i]===undefined) delete process.env[k]; else process.env[k]=saved[i]; });
  }
});
