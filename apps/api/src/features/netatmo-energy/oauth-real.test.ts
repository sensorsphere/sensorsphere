import test from 'node:test';
import assert from 'node:assert/strict';
import {exchangeCode,NetatmoOAuthExchangeError} from './client.js';
const config={baseUrl:'https://api.netatmo.com',clientId:'fake-id',clientSecret:'fake-secret',redirectUri:'https://dev.example.test/callback'};
test('real OAuth exchange sends scope, redirect URI and authorization code',async()=>{
 const saved=globalThis.fetch;
 globalThis.fetch=(async(url,init)=>{
   assert.equal(String(url),'https://api.netatmo.com/oauth2/token');
   const form=new URLSearchParams(String(init?.body));
   assert.equal(form.get('scope'),'read_thermostat');
   assert.equal(form.get('redirect_uri'),config.redirectUri);
   assert.equal(form.get('grant_type'),'authorization_code');
   assert.equal(form.get('code'),'one-use-code');
   return new Response(JSON.stringify({access_token:'access',refresh_token:'refresh',expires_in:3600,scope:['read_thermostat']}),{status:200});
 }) as typeof fetch;
 try{assert.ok(await exchangeCode(config,'one-use-code'));}finally{globalThis.fetch=saved;}
});
test('simulator exchange retains explicitly requested write scope',async()=>{
 const saved=globalThis.fetch;
 globalThis.fetch=(async(_url,init)=>{assert.equal(new URLSearchParams(String(init?.body)).get('scope'),'read_thermostat write_thermostat');return new Response('{}',{status:200});}) as typeof fetch;
 try{await exchangeCode(config,'temporary','read_thermostat write_thermostat');}finally{globalThis.fetch=saved;}
});
test('provider errors expose allowlisted codes only and no secrets',async()=>{
 const saved=globalThis.fetch;
 globalThis.fetch=(async()=>new Response(JSON.stringify({error:'invalid_grant',error_description:'secret=fake-secret code=one-use-code'}),{status:400})) as typeof fetch;
 try{await assert.rejects(exchangeCode(config,'one-use-code'),(e:unknown)=>{assert.ok(e instanceof NetatmoOAuthExchangeError);assert.equal(e.httpStatus,400);assert.equal(e.oauthCode,'invalid_grant');assert.ok(!e.message.includes('fake-secret'));return true;});}finally{globalThis.fetch=saved;}
});
test('unknown provider errors do not leak arbitrary identifiers',async()=>{
 const saved=globalThis.fetch;
 globalThis.fetch=(async()=>new Response(JSON.stringify({error:'secret=fake-secret'}),{status:401})) as typeof fetch;
 try{await assert.rejects(exchangeCode(config,'one-use-code'),(e:unknown)=>e instanceof NetatmoOAuthExchangeError&&e.oauthCode===null);}finally{globalThis.fetch=saved;}
});
