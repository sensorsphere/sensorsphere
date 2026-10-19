import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { requireAdmin, requireUser } from '../auth/index.js';
import { startCommand, updateCommand, recentCommands } from './command-journal.js';
import { getConnection, setConnectionOAuthError } from './connections.js';
import { createConnectionOAuthState, consumeConnectionOAuthState, oauthInitiator } from './oauth-state.js';
import { exchangeCode, discover, NetatmoOAuthExchangeError } from './client.js';
import { validateOAuthTokens } from './token.js';
import { getNetatmoAccessToken, getNetatmoPermissions, netatmoEncryptionKey, storeNetatmoTokens } from './credentials.js';
import { readTelemetry } from './telemetry.js';
import { ingestNetatmoReadings } from './ingest.js';
import { importNetatmoDiscovery } from './registry.js';
import { getNetatmoHeatingOverview } from './heating-overview.js';

const base='/api/v1/integrations/netatmo/connections';
const params=z.object({id:z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)});
const credentialId=(id:string)=>`netatmo-energy:${id}`;
export function registerNetatmoMultiRoutes(app:FastifyInstance,pool:Pool):void {
  app.get(base+'/heating/overview',async request=>{requireUser(request);return getNetatmoHeatingOverview(pool);});
  app.get(`${base}/:id/authorize`,async(request,reply)=>{
    requireAdmin(request);
    const parsed=params.safeParse(request.params);
    if(!parsed.success)return reply.code(400).send({error:'Invalid connection'});
    const config=await getConnection(pool,parsed.data.id);
    if(!config)return reply.code(404).send({error:'Connection not found'});
    const state=await createConnectionOAuthState(pool,oauthInitiator(request),parsed.data.id);
    const url=new URL('/oauth2/authorize',config.baseUrl);
    url.search=new URLSearchParams({response_type:'code',client_id:config.clientId,redirect_uri:config.redirectUri,scope:parsed.data.id==='sim-02'?'read_thermostat write_thermostat':'read_thermostat',state}).toString();
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
      const expectedScope=id==='sim-02'?'read_thermostat write_thermostat':'read_thermostat';
      const tokens=validateOAuthTokens(await exchangeCode(config,parsed.data.code,expectedScope));
      await storeNetatmoTokens(pool,tokens,netatmoEncryptionKey(),credentialId(id));
      await setConnectionOAuthError(pool,id,null);
      // The previous collection error may predate authorization; retry immediately.
      await pool.query(`UPDATE netatmo_connections SET collect_last_error=NULL,collect_next_at=CASE WHEN collect_interval_seconds>0 THEN NOW() ELSE NULL END WHERE id=$1`,[id]);
      return reply.header('Cache-Control','no-store').header('Referrer-Policy','no-referrer').type('text/html').send('<!doctype html><title>Netatmo connected</title><p>Connection authorized. You may close this window.</p>');
    }catch(error){
      const exchange=error instanceof NetatmoOAuthExchangeError?error:null;
      const category=exchange?.category??(error instanceof Error&&error.message.startsWith('Invalid OAuth')?'invalid_token_response':'token_storage_failed');
      const detail=exchange?.message??(category==='invalid_token_response'?'OAuth provider returned an invalid token response':'Unable to validate or save OAuth tokens');
      // Never log response bodies, authorization codes, OAuth states, token payloads or secrets.
      request.log.warn({connectionId:id,phase:'oauth_token_exchange',category,httpStatus:exchange?.httpStatus??null,oauthCode:exchange?.oauthCode??null},'Netatmo OAuth connection failed');
      await setConnectionOAuthError(pool,id,detail);
      return reply.code(502).send({error:detail,phase:'oauth_token_exchange',category,httpStatus:exchange?.httpStatus??null,oauthCode:exchange?.oauthCode??null});
    }
  });
  app.post(base+'/:id/oauth/verify-permissions',async(request,reply)=>{
    requireAdmin(request);
    const parsed=params.safeParse(request.params);
    if(!parsed.success)return reply.code(400).send({error:'Invalid connection'});
    const config=await getConnection(pool,parsed.data.id);
    if(!config)return reply.code(404).send({error:'Connection missing or disabled'});
    try {
      const token=await getNetatmoAccessToken(pool,config,netatmoEncryptionKey(),credentialId(parsed.data.id),true);
      if(!token)return reply.code(409).send({error:'OAuth authorization required'});
      return {permissions:await getNetatmoPermissions(pool,credentialId(parsed.data.id))};
    }catch(requestError){request.log.warn({connectionId:parsed.data.id},'Netatmo scope verification failed');return reply.code(502).send({error:'Unable to verify OAuth permissions; check authorization and simulator availability'});}
  });
  const commandSchema=z.discriminatedUnion('mode',[
    z.object({mode:z.literal('manual'),temperature:z.number().min(7).max(30),durationSeconds:z.number().int().min(60).max(86400)}).strict(),
    z.object({mode:z.enum(['schedule','away','hg'])}).strict()
  ]);
  app.get(`${base}/:id/control/history`,async(request,reply)=>{
    requireUser(request);
    const parsed=params.safeParse(request.params);
    if(!parsed.success)return reply.code(400).send({error:"Invalid connection"});
    return recentCommands(pool,parsed.data.id);
  });
  app.post(`${base}/:id/control`,async(request,reply)=>{
    requireUser(request);
    const parsed=params.safeParse(request.params);
    const command=commandSchema.safeParse(request.body);
    if(!parsed.success||!command.success)return reply.code(400).send({error:'Invalid thermostat command',details:command.success?[]:command.error.issues});
    // Phase 1B pilot deliberately limited to SIM-02.
    if(parsed.data.id!=='sim-02')return reply.code(403).send({error:'Thermostat control restricted to SIM-02 during validation'});
    const config=await getConnection(pool,parsed.data.id);
    if(!config)return reply.code(404).send({error:'Connection missing or disabled'});
    if(new URL(config.baseUrl).host!=='100.64.0.8:8092')return reply.code(403).send({error:'SIM-02 control target is not the approved simulator endpoint'});
    const started=Date.now();
    const actor=(request as typeof request & {sensorSphereUser?:{id:string;role:string}}).sensorSphereUser;
    const commandId=await startCommand(pool,parsed.data.id,actor?.id??"dev-role-user",command.data);
    try {
      const token=await getNetatmoAccessToken(pool,config,netatmoEncryptionKey(),credentialId(parsed.data.id));
      if(!token){await updateCommand(pool,commandId,'failed',{errorCode:'OAUTH_REQUIRED',errorMessage:'Authorization required'});return reply.code(409).send({error:'Authorize SIM-02 with write_thermostat scope before control',commandId});}
      const permissions=await getNetatmoPermissions(pool,credentialId(parsed.data.id));
      if(permissions.write!=='granted'){await updateCommand(pool,commandId,'failed',{errorCode:'WRITE_SCOPE_REQUIRED',errorMessage:'OAuth write scope not verified'});return reply.code(403).send({error:'OAuth write_thermostat permission is not granted or cannot be verified',commandId});}
      const homes=await discover(config,token);
      if(homes.homes!==1){await updateCommand(pool,commandId,'failed',{errorCode:'HOME_COUNT',errorMessage:'Expected exactly one home'});return reply.code(409).send({error:'SIM-02 home count is not exactly one',commandId});}
      const homeId='sim-home-02',roomId='sim-room-02';
      const endpoint=command.data.mode==='manual'?'/api/setroomthermpoint':'/api/setthermmode';
      const payload=command.data.mode==='manual'
        ?{home_id:homeId,room_id:roomId,mode:'manual',temp:command.data.temperature,duration:command.data.durationSeconds}
        :{home_id:homeId,mode:command.data.mode};
      const response=await fetch(new URL(endpoint,config.baseUrl),{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(payload),redirect:'error',signal:AbortSignal.timeout(8000)});
      if(!response.ok){await updateCommand(pool,commandId,'failed',{upstreamStatus:response.status,errorCode:'UPSTREAM_REJECTED',errorMessage:response.status===401?'Write authorization required':'Netatmo simulator rejected command'});request.log.warn({connectionId:parsed.data.id,mode:command.data.mode,httpStatus:response.status},'Netatmo control rejected');return reply.code(response.status===401?409:502).send({error:response.status===401?'Write authorization required':'Netatmo command rejected',upstreamStatus:response.status,commandId});}
      await updateCommand(pool,commandId,'accepted',{upstreamStatus:response.status});
      const readings=await readTelemetry(config,token);
      const room=readings.rooms.find(item=>item.homeId===homeId&&item.roomId===roomId);
      if(!room){await updateCommand(pool,commandId,'unknown',{errorCode:'READBACK_MISSING',errorMessage:'Command accepted, immediate readback unavailable'});return reply.code(502).send({error:'Command accepted but no thermostat state returned',commandId});}
      await updateCommand(pool,commandId,'accepted',{returnedMode:room.setpointMode,returnedSetpoint:room.setpointTemperature});
      request.log.info({connectionId:parsed.data.id,mode:command.data.mode,temperature:command.data.mode==='manual'?command.data.temperature:null,durationSeconds:command.data.mode==='manual'?command.data.durationSeconds:null,elapsedMs:Date.now()-started,returnedMode:room.setpointMode,returnedSetpoint:room.setpointTemperature},'Netatmo thermostat command completed');
      return {accepted:true,commandId,connectionId:parsed.data.id,command:command.data,returnedState:{mode:room.setpointMode,setpoint:room.setpointTemperature,measuredTemperature:room.measuredTemperature},elapsedMs:Date.now()-started};
    }catch(error){await updateCommand(pool,commandId,'unknown',{errorCode:'REQUEST_OR_READBACK_FAILED',errorMessage:'Command outcome uncertain; check collection and simulator logs'});request.log.warn({connectionId:parsed.data.id,mode:command.data.mode,error:error instanceof Error?error.message:'unknown'},'Netatmo command failed');return reply.code(502).send({error:'Netatmo command outcome uncertain; check the command journal and subsequent collection',commandId});}
  });
  app.get(base+'/:id/diagnostics',async(request,reply)=>{
    requireAdmin(request);
    const parsed=params.safeParse(request.params);if(!parsed.success)return reply.code(400).send({error:'Invalid connection'});
    const id=parsed.data.id;
    const statusRow=await pool.query("SELECT oauth_last_error,enabled FROM netatmo_connections WHERE id=$1",[id]);if(!statusRow.rows.length)return reply.code(404).send({error:'Connection not found'});
    const credential=await pool.query("SELECT EXISTS(SELECT 1 FROM netatmo_oauth_credentials WHERE integration_id=$1) AS stored",[credentialId(id)]);
    const data=await pool.query("SELECT count(DISTINCT a.id)::int AS assets,count(o.time)::int AS observations,max(o.time) AS last_collection FROM assets a LEFT JOIN asset_metrics m ON m.asset_id=a.id LEFT JOIN observations o ON o.asset_metric_id=m.id AND o.source=$1 WHERE a.external_id LIKE $2",[credentialId(id),id+':%']);
    const devices=await pool.query("SELECT count(DISTINCT d.id)::int AS devices,max(d.updated_at) AS last_discovery_update FROM device_registry_devices d JOIN device_registry_identities i ON i.device_id=d.id WHERE i.identity_type='NETATMO_MODULE_ID' AND i.value LIKE $1",[id+':%']);
    return {connectionId:id,registered:true,enabled:statusRow.rows[0]?.enabled===true,oauthStatus:credential.rows[0]?.stored?'authorized':statusRow.rows[0]?.oauth_last_error?'authorization_failed':'not_authorized',oauthCredentialsStored:Boolean(credential.rows[0]?.stored),lastOAuthError:statusRow.rows[0]?.oauth_last_error??null,assets:data.rows[0]?.assets??0,observations:data.rows[0]?.observations??0,lastCollection:data.rows[0]?.last_collection??null,devices:devices.rows[0]?.devices??0,lastRegistryUpdate:devices.rows[0]?.last_discovery_update??null};
  });
  const legacyAsset=z.object({id:z.string().uuid()});
  const legacyPreview=async(id:string)=>{
    const row=await pool.query("SELECT id,external_id FROM assets WHERE id=$1 AND external_id LIKE 'netatmo:%' AND external_id NOT LIKE 'sim-%'",[id]);
    if(!row.rows[0])return null;
    const stats=await pool.query("SELECT count(DISTINCT m.id)::int AS metrics,count(o.time)::int AS observations FROM asset_metrics m LEFT JOIN observations o ON o.asset_metric_id=m.id WHERE m.asset_id=$1",[id]);
    const refs=await pool.query("SELECT (SELECT count(*)::int FROM device_registry_links WHERE target_type='asset' AND target_id=$1) AS device_links,(SELECT count(*)::int FROM simple_dashboard_cards c JOIN asset_metrics m ON m.id=c.asset_metric_id WHERE m.asset_id=$1) AS dashboard_cards,(SELECT count(*)::int FROM simple_dashboard_template_cards WHERE asset_id=$1) AS template_cards,(SELECT count(*)::int FROM alert_rules r WHERE r.asset_id=$1 OR r.asset_metric_id IN (SELECT id FROM asset_metrics WHERE asset_id=$1)) AS alert_rules,(SELECT count(*)::int FROM alert_events e WHERE e.asset_id=$1 OR e.asset_metric_id IN (SELECT id FROM asset_metrics WHERE asset_id=$1)) AS alert_events,(SELECT count(*)::int FROM asset_tags WHERE asset_id=$1) AS tags",[id]);
    return {id,externalId:row.rows[0].external_id,metrics:stats.rows[0]?.metrics??0,observations:stats.rows[0]?.observations??0,dependencies:refs.rows[0]};
  };
  app.get(base+'/legacy-assets',async(request)=>{requireAdmin(request);const rows=await pool.query("SELECT id FROM assets WHERE external_id LIKE 'netatmo:%' AND external_id NOT LIKE 'sim-%' ORDER BY external_id");return {assets:await Promise.all(rows.rows.map(r=>legacyPreview(r.id)))};});
  app.delete(base+'/legacy-assets/:id',async(request,reply)=>{
    requireAdmin(request);const parsed=legacyAsset.safeParse(request.params);if(!parsed.success)return reply.code(400).send({error:'Invalid asset ID'});
    const id=parsed.data.id,preview=await legacyPreview(id);if(!preview)return reply.code(404).send({error:'Legacy Netatmo asset not found'});
    const confirm=z.object({confirmExternalId:z.string()}).safeParse(request.body);if(!confirm.success||confirm.data.confirmExternalId!==preview.externalId)return reply.code(400).send({error:'Exact asset ID confirmation required'});
    if(Object.values(preview.dependencies).some(value=>Number(value)>0))return reply.code(409).send({error:'Asset still referenced; unlink dependencies before deletion',preview});
    const client=await pool.connect();try{await client.query('BEGIN');const deleted=await client.query("DELETE FROM assets WHERE id=$1 AND external_id=$2 RETURNING id",[id,preview.externalId]);if(deleted.rowCount!==1){await client.query('ROLLBACK');return reply.code(409).send({error:'Asset changed; retry preview'});}await client.query('COMMIT');return {deleted:true,preview};}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  });
  app.get(`${base}/:id/collection-diagnostics`,async(request,reply)=>{
    requireAdmin(request);
    const parsed=params.safeParse(request.params);
    if(!parsed.success)return reply.code(400).send({error:'Invalid connection'});
    const rows=await pool.query(`SELECT created_at AS "at",status,observation_count AS "observations",home_count AS "homes",home_available AS "homesAvailable",details
       FROM netatmo_collection_diagnostics WHERE connection_id=$1 ORDER BY created_at DESC LIMIT 20`,[parsed.data.id]);
    return {runs:rows.rows};
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
        const notifySimulator=async(data:Record<string,string|number>)=>{
          // Simulator diagnostics are not part of the real Netatmo API contract.
          if(!parsed.data.id.startsWith('sim-'))return;
          try{
            const response=await fetch(new URL('/api/integration-report',config.baseUrl),{
              method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
              body:JSON.stringify({connectionId:parsed.data.id,...data}),redirect:'error',signal:AbortSignal.timeout(2500)
            });
            if(!response.ok)request.log.warn({status:response.status},'Netatmo simulator diagnostic report rejected');
          }catch{request.log.warn('Netatmo simulator diagnostic report unavailable');}
        };
        if(operation==='telemetry/collect'){
          const readings=await readTelemetry(config,token);
          const result=await ingestNetatmoReadings(pool,readings,parsed.data.id);
          const issues=readings.diagnostics??[];
          const partial=issues.length>0||result.observations===0;
          const diagnostic=issues.map(d=>`home ${d.homeIndex} / ${d.moduleType}: code ${d.code}`).join(', ');
          await pool.query(`INSERT INTO netatmo_collection_diagnostics(connection_id,status,observation_count,home_count,home_available,details) VALUES($1,$2,$3,$4,$5,$6)`,[parsed.data.id,partial?'partial':'ok',result.observations,readings.homesTotal??0,readings.homesAvailable??0,JSON.stringify(issues)]);
          if(partial){
            await pool.query('UPDATE netatmo_connections SET collect_last_attempt_at=NOW(),collect_last_error=$2,collect_last_observations=$3 WHERE id=$1',[parsed.data.id,diagnostic?'Partial/unavailable homestatus ('+diagnostic+')':'No current telemetry returned',result.observations]);
            return {...result,status:'partial',diagnostics:issues};
          }
          await pool.query("UPDATE netatmo_connections SET collect_last_attempt_at=NOW(),collect_last_success_at=NOW(),collect_last_error=NULL,collect_last_observations=$2,collect_next_at=CASE WHEN collect_interval_seconds=0 THEN NULL ELSE NOW()+(collect_interval_seconds::text||' seconds')::interval END WHERE id=$1",[parsed.data.id,result.observations]);
          await notifySimulator({operation:'collection',assets:result.assets,observations:result.observations});
          return result;
        }
        const result=await importNetatmoDiscovery(pool,await discover(config,token),parsed.data.id);
        await notifySimulator({operation:'discovery',devices:result.devices.length});
        return result;
      }catch{return reply.code(502).send({error:'Netatmo operation failed'});}
    });
  }
}
