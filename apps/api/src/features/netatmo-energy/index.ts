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
import { completeNetatmoOAuth } from './oauth-complete.js';
import { connectionSchema, netatmoConnectionRedirectUri, createConnection, listConnections, setConnectionEnabled, connectionEditSchema, updateConnection } from './connections.js';
import { registerNetatmoMultiRoutes } from './multi-routes.js';
import { startNetatmoMultiCollector } from './multi-collector.js';

const codeSchema = z.object({ code: z.string().min(1).max(2048), state: z.string().min(1) }).strict();
const tokenSchema = z.object({ accessToken: z.string().min(1).max(4096) }).strict();
const base = '/api/v1/integrations/netatmo';
export function registerNetatmoEnergyFeature(app: FastifyInstance, pool: Pool): void {
  const collector = startNetatmoCollector(pool, app.log);
  registerNetatmoMultiRoutes(app,pool);
  const multiCollector=startNetatmoMultiCollector(pool,app.log);
  app.get(`${base}/connections/collector/status`,async(request)=>{requireAdmin(request);return {connections:Object.fromEntries(multiCollector.statuses)};});
  app.patch(`${base}/connections/:id/collection-schedule`,async(request,reply)=>{requireAdmin(request);const id=z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/).safeParse((request.params as {id?:unknown}).id);const data=z.object({intervalSeconds:z.number().int().refine(v=>v===0||(v>=60&&v<=86400))}).strict().safeParse(request.body);if(!id.success||!data.success)return reply.code(400).send({error:'Interval must be 0 (off) or 60..86400 seconds'});const result=await pool.query("UPDATE netatmo_connections SET collect_interval_seconds=$2,collect_next_at=CASE WHEN $2=0 THEN NULL ELSE NOW()+($2::text||' seconds')::interval END,updated_at=NOW() WHERE id=$1 RETURNING id,collect_interval_seconds,collect_next_at",[id.data,data.data.intervalSeconds]);if(!result.rows[0])return reply.code(404).send({error:'Connection not found'});return result.rows[0];});
  app.get(`${base}/connections/redirect-uri`, async (request) => { requireAdmin(request); return {redirectUri:netatmoConnectionRedirectUri()}; });
  app.get(`${base}/connections`, async (request) => { requireAdmin(request); return { connections: await listConnections(pool) }; });
  app.patch(`${base}/connections/:id`,async(request,reply)=>{
    requireAdmin(request);
    const id=z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/).safeParse((request.params as {id?:unknown}).id);
    const body=z.object({enabled:z.boolean()}).strict().safeParse(request.body);
    if(!id.success||!body.success)return reply.code(400).send({error:'Invalid connection update'});
    if(!await setConnectionEnabled(pool,id.data,body.data.enabled))return reply.code(404).send({error:'Connection not found'});
    return {id:id.data,enabled:body.data.enabled};
  });
  app.put(`${base}/connections/:id`,async(request,reply)=>{
    requireAdmin(request);
    const id=z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/).safeParse((request.params as {id?:unknown}).id);
    const parsed=connectionEditSchema.safeParse(request.body);
    if(!id.success||!parsed.success)return reply.code(400).send({error:'Invalid connection fields',details:parsed.success?[]:parsed.error.issues.map(issue=>({field:issue.path.join('.')||'request',message:issue.message}))});
    try{const result=await updateConnection(pool,id.data,parsed.data);if(!result.updated)return reply.code(404).send({error:'Connection not found'});return {id:id.data,reauthorizationRequired:result.reauthorizationRequired};}
    catch(error){if(error instanceof Error&&(error.message.startsWith('Invalid Netatmo')||error.message.startsWith('Netatmo HTTP endpoint')))return reply.code(400).send({error:error.message});throw error;}
  });
  app.post(`${base}/connections`, async (request, reply) => {
    requireAdmin(request);
    const parsed = connectionSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid Netatmo connection fields', details: parsed.error.issues.map(issue=>({field:issue.path.join('.')||'request',message:issue.code==='unrecognized_keys'?'Unexpected field(s) in request':issue.message})) });
    try { await createConnection(pool, parsed.data); return reply.code(201).send({ id: parsed.data.id, displayName: parsed.data.displayName }); }
    catch (error) { if (error instanceof Error && (error.message.startsWith('SENSORSPHERE_PUBLIC_URL') || error.message.startsWith('Invalid SENSORSPHERE_PUBLIC_URL'))) return reply.code(503).send({error:'Netatmo OAuth callback URL is not configured correctly on this SensorSphere instance'}); if (error instanceof Error && (error.message.startsWith('Invalid Netatmo') || error.message.startsWith('Netatmo HTTP endpoint'))) return reply.code(400).send({error:error.message}); if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') return reply.code(409).send({ error: 'Connection already exists' }); throw error; }
  });
  app.addHook('onClose', async () => { collector.stop(); multiCollector.stop(); });
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
    try {
      const result = await completeNetatmoOAuth(request, pool, parsed.data.code, parsed.data.state);
      if (result === 'invalid-state') return reply.code(403).send({ error: 'Invalid or expired OAuth state' });
      return { connected: true };
    } catch { return reply.code(502).send({ error: 'Netatmo authorization or storage failed' }); }
  });
  app.get(`${base}/callback`, async (request, reply) => {
    reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer').header('X-Content-Type-Options', 'nosniff');
    requireAdmin(request);
    const parsed = z.object({ code: z.string().min(1).max(2048), state: z.string().min(1).max(128) }).strict().safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid OAuth callback' });
    try {
      const result = await completeNetatmoOAuth(request, pool, parsed.data.code, parsed.data.state);
      if (result === 'invalid-state') return reply.code(403).send({ error: 'Invalid or expired OAuth state' });
      return reply.type('text/html; charset=utf-8').send('<!doctype html><html><head><meta name="referrer" content="no-referrer"><title>Netatmo connected</title></head><body><p>Netatmo authorization completed. You may close this window.</p></body></html>');
    } catch { return reply.code(502).send({ error: 'Netatmo authorization or storage failed' }); }
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
    requireAdmin(request);
    const config = netatmoConfig(); if (!config) return reply.code(503).send({ error: 'Netatmo connector not configured' });
    const parsed = tokenSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: 'Invalid access token' });
    try { return await readTelemetry(config, parsed.data.accessToken); } catch { return reply.code(502).send({ error: 'Netatmo telemetry read failed' }); }
  });
  app.post(`${base}/discovery/preview`, async (request, reply) => {
    requireAdmin(request);
    const config = netatmoConfig(); if (!config) return reply.code(503).send({ error: 'Netatmo connector not configured' });
    const parsed = tokenSchema.safeParse(request.body); if (!parsed.success) return reply.code(400).send({ error: 'Invalid access token' });
    try { return await discover(config, parsed.data.accessToken); } catch { return reply.code(502).send({ error: 'Netatmo discovery failed' }); }
  });
}
