import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import Fastify from 'fastify';
import { installAuthGuard } from '../auth/session.js';
import { registerNetatmoEnergyFeature } from './index.js';
import { decryptTokens } from './token.js';
import type { Pool } from 'pg';

test('authenticated browser-style GET callback requires a valid admin cookie, stores tokens and rejects replay', async () => {
  const keys=['SENSORSPHERE_ENVIRONMENT','SENSORSPHERE_AUTH_ENABLED','SENSORSPHERE_AUTH_DEV_ROLE_SWITCH_ENABLED','SENSORSPHERE_NETATMO_BASE_URL','SENSORSPHERE_NETATMO_TOKEN_ENCRYPTION_KEY','SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS'];
  const saved=keys.map(k=>process.env[k]);
  const oldFetch=globalThis.fetch;
  const key=randomBytes(32);
  const states=new Map<string,string>();
  let stored:string|undefined;
  const pool={query:async (sql:string,params:string[]=[])=>{
    if(sql.includes('FROM auth_sessions s')) return {rows:[{id:'admin-id',email:'admin@example.test',display_name:'Admin',role:'admin',status:'active',is_bootstrap_admin:true}]};
    if(sql.startsWith('UPDATE auth_sessions')) return {rowCount:1,rows:[]};
    if(sql.startsWith('INSERT INTO netatmo_oauth_states')) {states.set(params[0],params[1]);return {rowCount:1,rows:[]};}
    if(sql.startsWith('DELETE FROM netatmo_oauth_states')) {const valid=states.get(params[0])===params[1];if(valid)states.delete(params[0]);return {rowCount:valid?1:0,rows:[]};}
    if(sql.startsWith('INSERT INTO netatmo_oauth_credentials')) {stored=params[1];return {rowCount:1,rows:[]};}
    throw new Error('Unexpected query');
  }} as unknown as Pool;
  const app=Fastify();
  try {
    process.env.SENSORSPHERE_ENVIRONMENT='DEV';
    process.env.SENSORSPHERE_AUTH_ENABLED='true';
    process.env.SENSORSPHERE_AUTH_DEV_ROLE_SWITCH_ENABLED='false';
    process.env.SENSORSPHERE_NETATMO_BASE_URL='https://netatmo.example.test';
    process.env.SENSORSPHERE_NETATMO_TOKEN_ENCRYPTION_KEY=key.toString('hex');
    process.env.SENSORSPHERE_NETATMO_COLLECT_INTERVAL_SECONDS='0';
    globalThis.fetch=async()=>new Response(JSON.stringify({access_token:'test-access',refresh_token:'test-refresh',expires_in:3600}),{status:200});
    installAuthGuard(app,pool);
    registerNetatmoEnergyFeature(app,pool);
    await app.ready();
    const base='/api/v1/integrations/netatmo';
    const unauth=await app.inject({method:'GET',url:`${base}/authorize`});
    assert.equal(unauth.statusCode,401);
    const cookie='sensorsphere_session=opaque-test-session';
    const authorized=await app.inject({method:'GET',url:`${base}/authorize`,headers:{cookie}});
    assert.equal(authorized.statusCode,200);
    const state=new URL(authorized.json().authorizationUrl).searchParams.get('state');
    assert.ok(state);
    const callback=`${base}/callback?code=sample-code&state=${state}`;
    assert.equal((await app.inject({method:'GET',url:callback})).statusCode,401);
    const success=await app.inject({method:'GET',url:callback,headers:{cookie}});
    assert.equal(success.statusCode,200,success.body);
    assert.match(success.headers['content-type'] as string,/text\/html/);
    assert.equal(success.headers['cache-control'],'no-store');
    assert.equal(success.headers['referrer-policy'],'no-referrer');
    assert.ok(stored);
    assert.equal(decryptTokens(stored,key).access_token,'test-access');
    assert.ok(!success.body.includes('test-access'));
    assert.equal((await app.inject({method:'GET',url:callback,headers:{cookie}})).statusCode,403);
  } finally {
    await app.close();
    globalThis.fetch=oldFetch;
    keys.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];});
  }
});
