import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { requireAdmin } from '../auth/index.js';
import { getConnection, setConnectionOAuthError } from './connections.js';
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
      await setConnectionOAuthError(pool,id,null);
      return reply.header('Cache-Control','no-store').header('Referrer-Policy','no-referrer').type('text/html').send('<!doctype html><title>Netatmo connected</title><p>Connection authorized. You may close this window.</p>');
    }catch{await setConnectionOAuthError(pool,id,'OAuth token exchange failed. Check client ID, client secret and simulator availability.');return reply.code(502).send({error:'Netatmo authorization failed: check OAuth client credentials and simulator availability'});}
  });
  app.get(base+'/:id/diagnostics',async(request,reply)=>{
    requireAdmin(request);
    const parsed=params.safeParse(request.params);if(!parsed.success)return reply.code(400).send({error:'Invalid connection'});
    const id=parsed.data.id;
    const statusRow=await pool.query("SELECT oauth_last_error,enabled FROM netatmo_connections WHERE id=$1",[id]);if(!statusRow.rows.length)return reply.code(404).send({error:'Connection not found'});
    const credential=await pool.query("SELECT EXISTS(SELECT 1 FROM netatmo_oauth_credentials WHERE integration_id=$1) AS stored",[credentialId(id)]);
    const data=await pool.query("SELECT count(DISTINCT a.id)::int AS assets,count(o.time)::int AS observations,max(o.time) AS last_collection FROM assets a LEFT JOIN asset_metrics m ON m.asset_id=a.id LEFT JOIN observations o ON o.asset_metric_id=m.id AND o.source=$1 WHERE a.external_id LIKE $2",[credentialId(id),id+':%']);
    const devices=await pool.query("SELECT count(DISTINCT d.id)::int AS devices,max(d.updated_at) AS last_discovery_update FROM device_registry_devices d JOIN device_registry_identities i ON i.device_id=d.id WHERE i.identity_type='NETATMO_MODULE_ID' AND i.value LIKE $1",[id+':%']);
    return {connectionId:id,registered:true,enabled:statusRow.rows[0]?.enabled===true,oauthStatus:credential.rows[0]?.stored?'authorized':statusRow.rows[0]?.oauth_last_error?'authorization_failed':'not_authorized',oauthCredentialsStored:Boolean(credential.rows[0]?.stored),assets:data.rows[0]?.assets??0,observations:data.rows[0]?.observations??0,lastCollection:data.rows[0]?.last_collection??null,devices:devices.rows[0]?.devices??0,lastDiscoveryUpdate:devices.rows[0]?.last_discovery_update??null};
  });
  const legacyAsset=z.object({id:z.string().uuid()});
  const legacyPreview=async(id:string)=>{
    const row=await pool.query("SELECT id,external_id FROM assets WHERE id=$1 AND external_id LIKE 'netatmo:%' AND external_id NOT LIKE 'sim-%'",[id]);
    if(!row.rows[0])return null;
    const stats=await pool.query("SELECT count(DISTINCT m.id)::int AS metrics,count(o.time)::int AS observations FROM asset_metrics m LEFT JOIN observations o ON o.asset_metric_id=m.id WHERE m.asset_id=$1",[id]);
    const refs=await pool.query("SELECT (SELECT count(*)::int FROM device_registry_links WHERE target_type='asset' AND target_id=$1) AS device_links,(SELECT count(*)::int FROM simple_dashboard_cards c JOIN asset_metrics m ON m.id=c.asset_metric_id WHERE m.asset_id=$1) AS dashboard_cards,(SELECT count(*)::int FROM alert_rules WHERE asset_id=$1) AS alert_rules",[id]);
    return {id,externalId:row.rows[0].external_id,metrics:stats.rows[0]?.metrics??0,observations:stats.rows[0]?.observations??0,dependencies:refs.rows[0]};
  };
  app.get(base+'/legacy-assets',async(request)=>{requireAdmin(request);const rows=await pool.query("SELECT id FROM assets WHERE external_id LIKE 'netatmo:%' AND external_id NOT LIKE 'sim-%' ORDER BY external_id");return {assets:await Promise.all(rows.rows.map(r=>legacyPreview(r.id)))};});
  app.delete(base+'/legacy-assets/:id',async(request,reply)=>{
    requireAdmin(request);const parsed=legacyAsset.safeParse(request.params);if(!parsed.success)return reply.code(400).send({error:'Invalid asset ID'});
    const id=parsed.data.id,preview=await legacyPreview(id);if(!preview)return reply.code(404).send({error:'Legacy Netatmo asset not found'});
    const confirm=z.object({confirmExternalId:z.string()}).safeParse(request.body);if(!confirm.success||confirm.data.confirmExternalId!==preview.externalId)return reply.code(400).send({error:'Exact asset ID confirmation required'});
    if(preview.dependencies.device_links||preview.dependencies.alert_rules||preview.dependencies.dashboard_cards)return reply.code(409).send({error:'Asset still referenced; unlink dependencies before deletion',preview});
    const client=await pool.connect();try{await client.query('BEGIN');const deleted=await client.query("DELETE FROM assets WHERE id=$1 AND external_id=$2 RETURNING id",[id,preview.externalId]);if(deleted.rowCount!==1){await client.query('ROLLBACK');return reply.code(409).send({error:'Asset changed; retry preview'});}await client.query('COMMIT');return {deleted:true,preview};}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
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
        if(operation==='telemetry/collect')return await ingestNetatmoReadings(pool,await readTelemetry(config,token),parsed.data.id);
        return await importNetatmoDiscovery(pool,await discover(config,token),parsed.data.id);
      }catch{return reply.code(502).send({error:'Netatmo operation failed'});}
    });
  }
}
