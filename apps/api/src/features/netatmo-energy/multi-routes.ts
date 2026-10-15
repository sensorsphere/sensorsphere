import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { requireAdmin } from '../auth/index.js';
import { getConnection } from './connections.js';
import { createConnectionOAuthState, consumeConnectionOAuthState, oauthInitiator } from './oauth-state.js';
import { exchangeCode, discover } from './client.js';
import { validateOAuthTokens } from './token.js';
import { getNetatmoAccessToken, netatmoEncryptionKey, storeNetatmoTokens } from './credentials.js';
import { readTelemetry } from './telemetry.js';
import { ingestNetatmoReadings } from './ingest.js';
import { importNetatmoDiscovery } from './registry.js';

const base='/api/v1/integrations/netatmo/connections';
const params=z.object({id:z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)});
const credentialId=(id:string)=>`netatmo-energy:${id}`;
export function registerNetatmoMultiRoutes(app:FastifyInstance,pool:Pool):void {
  app.get(`${base}/:id/authorize`,async(request,reply)=>{
    requireAdmin(request);
    const parsed=params.safeParse(request.params);
    if(!parsed.success)return reply.code(400).send({error:'Invalid connection'});
    const config=await getConnection(pool,parsed.data.id);
    if(!config)return reply.code(404).send({error:'Connection not found'});
    const state=await createConnectionOAuthState(pool,oauthInitiator(request),parsed.data.id);
    const url=new URL('/oauth2/authorize',config.baseUrl);
    url.search=new URLSearchParams({response_type:'code',client_id:config.clientId,redirect_uri:config.redirectUri,scope:'read_thermostat',state}).toString();
    return {authorizationUrl:url.toString()};
  });
  app.get(`${base}/callback`,async(request,reply)=>{
    requireAdmin(request);
    const parsed=z.object({code:z.string().min(1).max(2048),state:z.string().length(43)}).strict().safeParse(request.query);
    if(!parsed.success)return reply.code(400).send({error:'Invalid OAuth callback'});
    const id=await consumeConnectionOAuthState(pool,parsed.data.state,oauthInitiator(request));
    if(!id)return reply.code(403).send({error:'Invalid or expired OAuth state'});
    const config=await getConnection(pool,id);
    if(!config)return reply.code(404).send({error:'Connection not found'});
    try {
      const tokens=validateOAuthTokens(await exchangeCode(config,parsed.data.code));
      await storeNetatmoTokens(pool,tokens,netatmoEncryptionKey(),credentialId(id));
      return reply.header('Cache-Control','no-store').header('Referrer-Policy','no-referrer').type('text/html').send('<!doctype html><title>Netatmo connected</title><p>Connection authorized. You may close this window.</p>');
    }catch{return reply.code(502).send({error:'Netatmo authorization failed'});}
  });
  for(const operation of ['telemetry/collect','discovery/import'] as const){
    app.post(`${base}/:id/${operation}`,async(request,reply)=>{
      requireAdmin(request);
      const parsed=params.safeParse(request.params);
      if(!parsed.success)return reply.code(400).send({error:'Invalid connection'});
      const config=await getConnection(pool,parsed.data.id);
      if(!config)return reply.code(404).send({error:'Connection not found'});
      const token=await getNetatmoAccessToken(pool,config,netatmoEncryptionKey(),credentialId(parsed.data.id));
      if(!token)return reply.code(409).send({error:'Authorization required'});
      try {
        if(operation==='telemetry/collect')return await ingestNetatmoReadings(pool,await readTelemetry(config,token));
        return await importNetatmoDiscovery(pool,await discover(config,token));
      }catch{return reply.code(502).send({error:'Netatmo operation failed'});}
    });
  }
}
