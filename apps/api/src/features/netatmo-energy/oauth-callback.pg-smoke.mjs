// Isolated DEV E2E: session-local temporary tables; no persistent OAuth writes.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { netatmoConfig } from './client.js';
import { createOAuthState, consumeOAuthState } from './oauth-state.js';
import { completeNetatmoOAuth } from './oauth-complete.js';
import { decryptTokens } from './token.js';
const pool = new pg.Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
const client = await pool.connect();
const proxy = {connect: async () => ({query:(...args)=>client.query(...args),release:()=>{}}),query:(...args)=>client.query(...args)};
const previous = Object.fromEntries(['SENSORSPHERE_AUTH_ENABLED','SENSORSPHERE_AUTH_DEV_ROLE_SWITCH_ENABLED','SENSORSPHERE_ENVIRONMENT','SENSORSPHERE_NETATMO_TOKEN_ENCRYPTION_KEY'].map(k=>[k,process.env[k]]));
try {
  process.env.SENSORSPHERE_AUTH_ENABLED='false';
  process.env.SENSORSPHERE_AUTH_DEV_ROLE_SWITCH_ENABLED='true';
  process.env.SENSORSPHERE_ENVIRONMENT='DEV';
  const key=randomBytes(32);
  process.env.SENSORSPHERE_NETATMO_TOKEN_ENCRYPTION_KEY=key.toString('hex');
  await client.query('CREATE TEMP TABLE netatmo_oauth_credentials (integration_id text PRIMARY KEY, encrypted_tokens text NOT NULL, expires_at timestamptz NOT NULL, updated_at timestamptz DEFAULT now())');
  await client.query('CREATE TEMP TABLE netatmo_oauth_states (state_hash text PRIMARY KEY, initiated_by text NOT NULL, created_at timestamptz DEFAULT now(), expires_at timestamptz DEFAULT now()+interval \'10 minutes\')');
  const config=netatmoConfig();
  assert.ok(config);
  const initiator='dev-admin';
  const state=await createOAuthState(proxy,initiator);
  const authorize=new URL('/oauth2/authorize',config.baseUrl);
  authorize.search=new URLSearchParams({response_type:'code',client_id:config.clientId,redirect_uri:config.redirectUri,scope:'read_thermostat',state}).toString();
  const response=await fetch(authorize,{redirect:'manual'});
  assert.equal(response.status,302);
  const redirect=new URL(response.headers.get('location'));
  assert.equal(redirect.searchParams.get('state'),state);
  const code=redirect.searchParams.get('code');
  assert.ok(code);
  const request={headers:{'x-sensorsphere-dev-role':'admin'}};
  assert.equal(await completeNetatmoOAuth(request,proxy,code,state),'ok');
  assert.equal(await completeNetatmoOAuth(request,proxy,code,state),'invalid-state');
  const row=(await client.query('SELECT encrypted_tokens FROM netatmo_oauth_credentials')).rows[0];
  assert.ok(row);
  assert.ok(decryptTokens(row.encrypted_tokens,key).access_token);
  const expired=await createOAuthState(proxy,initiator);
  await client.query('UPDATE netatmo_oauth_states SET expires_at=now()-interval \'1 minute\'');
  assert.equal(await consumeOAuthState(proxy,expired,initiator),false);
  console.log('PASS: simulated OAuth redirect, state binding, encrypted storage, replay rejection, expired state rejection; persistent tables untouched');
} finally {
  for(const [k,v] of Object.entries(previous)) { if(v===undefined) delete process.env[k]; else process.env[k]=v; }
  client.release();await pool.end();
}
