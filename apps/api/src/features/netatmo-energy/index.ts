import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { requireAdmin } from '../auth/index.js';
import { importNetatmoDiscovery } from './registry.js';
import { readTelemetry } from './telemetry.js';
import { ingestNetatmoReadings } from './ingest.js';
import { z } from 'zod';
import { discover, exchangeCode, netatmoConfig } from './client.js';
import { getNetatmoAccessToken, netatmoEncryptionKey, storeNetatmoTokens } from './credentials.js';
import { validateOAuthTokens } from './token.js';
import { createOAuthState, consumeOAuthState, oauthInitiator } from './oauth-state.js';
import { startNetatmoCollector } from './collector.js';

const codeSchema = z.object({ code: z.string().min(1).max(2048), state: z.string().min(1) }).strict();
const tokenSchema = z.object({ accessToken: z.string().min(1).max(4096) }).strict();
const base = '/api/v1/integrations/netatmo';
export function registerNetatmoEnergyFeature(app: FastifyInstance, pool: Pool): void {
  const collector = startNetatmoCollector(pool, app.log);
  app.addHook('onClose', async () => { collector.stop(); });
  app.get(`${base}/status`, async () => ({ configured: Boolean(netatmoConfig()), readOnly: true, mode: 'preview', collector: collector.status }));
  app.get(`${base}/authorize`, async (request, reply) => {
    requireAdmin(request);
    const config = netatmoConfig(); if (!config) return reply.code(503).send({ error: 'Netatmo connector not configured' });
    const state = await createOAuthState(pool, oauthInitiator(request));
    const url = new URL('/oauth2/authorize', config.baseUrl);
    url.search = new URLSearchParams({ response_type: 'code', client_id: config.clientId, redirect_uri: config.redirectUri, scope: 'read_thermostat', state }).toString();
    return { authorizationUrl: url.toString() };
  });
  // NET-2: exchange and store encrypted tokens server-side; never send tokens to the browser.
  app.post(`${base}/token`, async (request, reply) => {
    requireAdmin(request);
    const config = netatmoConfig(); if (!config) return reply.code(503).send({ error: 'Netatmo connector not configured' });
    const parsed = codeSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: 'Invalid code' });
    let key: Buffer;
    try { key = netatmoEncryptionKey(); } catch { return reply.code(503).send({ error: 'Netatmo token encryption not configured' }); }
    try {
      if (!await consumeOAuthState(pool, parsed.data.state, oauthInitiator(request))) return reply.code(403).send({ error: 'Invalid or expired OAuth state' });
      const tokens = validateOAuthTokens(await exchangeCode(config, parsed.data.code));
      await storeNetatmoTokens(pool, tokens, key);
      return { connected: true };
    } catch { return reply.code(502).send({ error: 'Netatmo authorization or storage failed' }); }
  });
  app.get(`${base}/callback`, async (request, reply) => {
    // Do not exchange codes in a GET callback without a browser-bound authenticated session.
    return reply.code(400).send({ error: 'Complete OAuth with an authenticated POST /token containing code and state' });
  });
  app.post(`${base}/discovery/import`, async (request, reply) => {
    requireAdmin(request);
    const config = netatmoConfig(); if (!config) return reply.code(503).send({ error: 'Netatmo connector not configured' });
    const parsed = tokenSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: 'Invalid access token' });
    try { return await importNetatmoDiscovery(pool, await discover(config, parsed.data.accessToken)); } catch { return reply.code(502).send({ error: 'Netatmo import failed; transaction rolled back' }); }
  });
  app.post(`${base}/telemetry/ingest`, async (request, reply) => {
    requireAdmin(request);
    const config = netatmoConfig(); if (!config) return reply.code(503).send({ error: 'Netatmo connector not configured' });
    const parsed = tokenSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: 'Invalid access token' });
    try { return await ingestNetatmoReadings(pool, await readTelemetry(config, parsed.data.accessToken)); } catch { return reply.code(502).send({ error: 'Netatmo ingestion failed; transaction rolled back' }); }
  });
  app.post(`${base}/telemetry/collect`, async (request, reply) => {
    requireAdmin(request);
    const config = netatmoConfig(); if (!config) return reply.code(503).send({ error: 'Netatmo connector not configured' });
    let key: Buffer;
    try { key = netatmoEncryptionKey(); } catch { return reply.code(503).send({ error: 'Netatmo token encryption not configured' }); }
    try {
      const accessToken = await getNetatmoAccessToken(pool, config, key);
      if (!accessToken) return reply.code(409).send({ error: 'Netatmo authorization required' });
      return await ingestNetatmoReadings(pool, await readTelemetry(config, accessToken));
    } catch { return reply.code(502).send({ error: 'Netatmo collection failed' }); }
  });
  app.post(`${base}/telemetry/preview`, async (request, reply) => {
    const config = netatmoConfig(); if (!config) return reply.code(503).send({ error: 'Netatmo connector not configured' });
    const parsed = tokenSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: 'Invalid access token' });
    try { return await readTelemetry(config, parsed.data.accessToken); } catch { return reply.code(502).send({ error: 'Netatmo telemetry read failed' }); }
  });
  app.post(`${base}/discovery/preview`, async (request, reply) => {
    const config = netatmoConfig(); if (!config) return reply.code(503).send({ error: 'Netatmo connector not configured' });
    const parsed = tokenSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: 'Invalid access token' });
    try { return await discover(config, parsed.data.accessToken); } catch { return reply.code(502).send({ error: 'Netatmo discovery failed' }); }
  });
}
