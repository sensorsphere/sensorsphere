import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { connectionSchema, netatmoConnectionRedirectUri, createConnection, getConnection, listConnections } from './connections.js';
import { createConnectionOAuthState, consumeConnectionOAuthState } from './oauth-state.js';

test('connections isolate encrypted secrets and never expose them in listing',async()=>{
  const priorUrl=process.env.SENSORSPHERE_PUBLIC_URL;
  process.env.SENSORSPHERE_PUBLIC_URL="https://dev.sensorsphere.f-colas.com";
  const prior=process.env.SENSORSPHERE_NETATMO_TOKEN_ENCRYPTION_KEY;
  process.env.SENSORSPHERE_NETATMO_TOKEN_ENCRYPTION_KEY=randomBytes(32).toString('hex');
  const rows=new Map<string,any>();
  const pool={query:async(sql:string,values:any[]=[])=>{
    if(sql.startsWith('INSERT INTO netatmo_connections')){
      rows.set(values[0],{id:values[0],display_name:values[1],base_url:values[2],client_id:values[3],encrypted_client_secret:values[4],redirect_uri:values[5],enabled:values[6]});return {rows:[]};
    }
    if(sql.startsWith('SELECT base_url')){const row=rows.get(values[0]);return {rows:row?.enabled?[row]:[]};}
    if(sql.startsWith('SELECT id,display_name'))return {rows:[...rows.values()].map(({encrypted_client_secret,...safe})=>safe)};
    throw new Error('Unexpected query');
  }} as unknown as Pool;
  try{
    for(const id of ['sim-01','sim-02']){
      const input=connectionSchema.parse({id,displayName:id,baseUrl:id==='sim-01'?'http://100.64.0.8:8091':'http://100.64.0.8:8092',clientId:id,clientSecret:'secret-'+id});
      await createConnection(pool,input);
      assert.equal((await getConnection(pool,id))?.clientSecret,'secret-'+id);
    }
    assert.equal(rows.get('sim-01').redirect_uri,'https://dev.sensorsphere.f-colas.com/api/v1/integrations/netatmo/connections/callback');
    assert.notEqual(rows.get('sim-01').encrypted_client_secret,rows.get('sim-02').encrypted_client_secret);
    assert.equal(JSON.stringify(await listConnections(pool)).includes('secret-sim-01'),false);
    assert.throws(()=>connectionSchema.parse({id:'invalid/path',displayName:'bad',baseUrl:'http://example.com',clientId:'a',clientSecret:'b'}));
  }finally{if(priorUrl===undefined)delete process.env.SENSORSPHERE_PUBLIC_URL;else process.env.SENSORSPHERE_PUBLIC_URL=priorUrl;if(prior===undefined)delete process.env.SENSORSPHERE_NETATMO_TOKEN_ENCRYPTION_KEY;else process.env.SENSORSPHERE_NETATMO_TOKEN_ENCRYPTION_KEY=prior;}
});

test('OAuth states are isolated by initiator and one-time bound to connection',async()=>{
  const states=new Map<string,{initiator:string;id:string}>();
  const pool={query:async(sql:string,params:string[])=>{
    if(sql.startsWith('INSERT INTO netatmo_oauth_states')){states.set(params[0],{initiator:params[1],id:params[2]});return {rows:[]};}
    const row=states.get(params[0]);
    if(!row||row.initiator!==params[1])return {rows:[]};
    states.delete(params[0]);return {rows:[{connection_id:row.id}]};
  }} as unknown as Pool;
  const state=await createConnectionOAuthState(pool,'user:1','sim-02');
  assert.equal(await consumeConnectionOAuthState(pool,state,'user:2'),null);
  assert.equal(await consumeConnectionOAuthState(pool,state,'user:1'),'sim-02');
  assert.equal(await consumeConnectionOAuthState(pool,state,'user:1'),null);
});

test('redirect URI uses trusted configured public origin, never caller input',()=>{assert.equal(netatmoConnectionRedirectUri('https://example.org/'),'https://example.org/api/v1/integrations/netatmo/connections/callback');for(const url of ['','http://example.org','https://example.org/path','https://user@example.org','https://example.org/?foo=1'])assert.throws(()=>netatmoConnectionRedirectUri(url));});
