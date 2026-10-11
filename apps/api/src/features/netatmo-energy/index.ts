import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { importNetatmoDiscovery } from './registry.js';
import { readTelemetry } from './telemetry.js';
import { z } from 'zod';
import { discover, exchangeCode, netatmoConfig } from './client.js';
const codeSchema = z.object({ code: z.string().min(1).max(2048) }).strict();
const tokenSchema = z.object({ accessToken: z.string().min(1).max(4096) }).strict();
export function registerNetatmoEnergyFeature(app: FastifyInstance, pool: Pool): void {
  app.get('/api/v1/integrations/netatmo/status', async () => ({ configured: Boolean(netatmoConfig()), readOnly: true, mode: 'preview' }));
  app.get('/api/v1/integrations/netatmo/authorize', async (_request, reply) => {
    const config = netatmoConfig(); if (!config) return reply.code(503).send({ error: 'Netatmo connector not configured' });
    const url = new URL('/oauth2/authorize', config.baseUrl);
    url.search = new URLSearchParams({ response_type: 'code', client_id: config.clientId, redirect_uri: config.redirectUri, scope: 'read_thermostat' }).toString();
    return { authorizationUrl: url.toString() };
  });
  app.post('/api/v1/integrations/netatmo/token', async (request, reply) => {
    const config = netatmoConfig(); if (!config) return reply.code(503).send({ error: 'Netatmo connector not configured' });
    const parsed = codeSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: 'Invalid code' });
    try { return await exchangeCode(config, parsed.data.code); } catch { return reply.code(502).send({ error: 'Netatmo authorization failed' }); }
  });
  app.post('/api/v1/integrations/netatmo/discovery/import', async (request, reply) => {
    const user = (request as typeof request & { sensorSphereUser?: { role: string } }).sensorSphereUser;
    if (user?.role !== 'admin') return reply.code(403).send({ error: 'Admin required' });
    const config = netatmoConfig(); if (!config) return reply.code(503).send({ error: 'Netatmo connector not configured' });
    const parsed = tokenSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: 'Invalid access token' });
    try { return await importNetatmoDiscovery(pool, await discover(config, parsed.data.accessToken)); } catch { return reply.code(502).send({ error: 'Netatmo import failed; transaction rolled back' }); }
  });
  app.post('/api/v1/integrations/netatmo/telemetry/preview', async (request, reply) => {
    const config = netatmoConfig(); if (!config) return reply.code(503).send({ error: 'Netatmo connector not configured' });
    const parsed = tokenSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: 'Invalid access token' });
    try { return await readTelemetry(config, parsed.data.accessToken); } catch { return reply.code(502).send({ error: 'Netatmo telemetry read failed' }); }
  });
  app.post('/api/v1/integrations/netatmo/discovery/preview', async (request, reply) => {
    const config = netatmoConfig(); if (!config) return reply.code(503).send({ error: 'Netatmo connector not configured' });
    const parsed = tokenSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: 'Invalid access token' });
    try { return await discover(config, parsed.data.accessToken); } catch { return reply.code(502).send({ error: 'Netatmo discovery failed' }); }
  });
}
