// Isolated end-to-end ingestion: all writable tables are temporary PostgreSQL tables.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { netatmoConfig } from './client.js';
import { storeNetatmoTokens } from './credentials.js';
import { startNetatmoCollector } from './collector.js';
const db=new pg.Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
const client=await db.connect();
const proxy={query:(...args)=>client.query(...args),connect:async()=>({query:(...args)=>client.query(...args),release:()=>{}})};
const prior={key:process.env.SENSORSPHERE_NETATMO_TOKEN_ENCRYPTION_KEY,interval:process.env.SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS};
let collector;
try {
  const config=netatmoConfig(); assert.ok(config,'simulator config required');
  const key=randomBytes(32);process.env.SENSORSPHERE_NETATMO_TOKEN_ENCRYPTION_KEY=key.toString('hex');
  process.env.SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS='60';
  await client.query('CREATE TEMP TABLE netatmo_oauth_credentials (integration_id text PRIMARY KEY, encrypted_tokens text NOT NULL, expires_at timestamptz NOT NULL, updated_at timestamptz DEFAULT now())');
  await client.query('CREATE TEMP TABLE assets (id uuid PRIMARY KEY, external_id text UNIQUE, description text, manufacturer text, asset_type text, protocol text, updated_at timestamptz DEFAULT now())');
  await client.query('CREATE TEMP TABLE asset_metrics (id uuid DEFAULT gen_random_uuid() PRIMARY KEY, asset_id uuid, metric_key text, display_name text, unit text, value_type text, UNIQUE(asset_id,metric_key))');
  await client.query('CREATE TEMP TABLE observations (time timestamptz, asset_metric_id uuid, value_double double precision, value_text text, value_boolean boolean, source text, source_ref text)');
  await client.query('CREATE TEMP TABLE device_registry_identities (device_id uuid, identity_type text, value text)');
  await client.query('CREATE TEMP TABLE device_registry_links (device_id uuid, target_type text, target_id uuid, UNIQUE(device_id,target_type,target_id))');
  const url=new URL('/oauth2/authorize',config.baseUrl);
  url.search=new URLSearchParams({response_type:'code',client_id:config.clientId,redirect_uri:config.redirectUri,scope:'read_thermostat'}).toString();
  const response=await fetch(url,{redirect:'manual'});assert.equal(response.status,302);
  const code=new URL(response.headers.get('location')).searchParams.get('code');assert.ok(code);
  const tokenResponse=await fetch(new URL('/oauth2/token',config.baseUrl),{method:'POST',body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:config.redirectUri,client_id:config.clientId,client_secret:config.clientSecret})});
  assert.equal(tokenResponse.status,200);
  await storeNetatmoTokens(proxy,await tokenResponse.json(),key);
  collector=startNetatmoCollector(proxy,{warn:()=>{}});
  await new Promise(resolve=>setTimeout(resolve,65000));
  const result={assets:1,observations:collector.status.lastObservations};
  assert.ok(result?.observations>0,'observations expected');
  assert.equal(collector.status.lastObservations,result.observations);
  assert.equal(collector.status.consecutiveFailures,0);
  const count=Number((await client.query('SELECT count(*) AS n FROM observations')).rows[0].n);
  assert.equal(count,result.observations);
  console.log(`PASS: simulator -> encrypted OAuth token -> collector -> ${result.assets} temporary assets, ${count} temporary observations; public tables untouched`);
} finally {
  collector?.stop();
  if(prior.key===undefined) delete process.env.SENSORSPHERE_NETATMO_TOKEN_ENCRYPTION_KEY; else process.env.SENSORSPHERE_NETATMO_TOKEN_ENCRYPTION_KEY=prior.key;
  if(prior.interval===undefined) delete process.env.SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS; else process.env.SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS=prior.interval;
  client.release();await db.end();
}
