import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encryptTokens, decryptTokens, refreshNetatmoToken, validateOAuthTokens } from './token.js';
const tokens = { access_token: 'access-test', refresh_token: 'refresh-test', expires_in: 3600 };
test('OAuth tokens encrypted with authenticated encryption and reject tampering', () => {
  const key = randomBytes(32), blob = encryptTokens(tokens, key);
  assert.deepEqual(decryptTokens(blob, key), tokens);
  assert.notEqual(blob.includes(tokens.refresh_token), true);
  assert.throws(() => decryptTokens(blob, randomBytes(32)));
  const corrupted = Buffer.from(blob, 'base64'); corrupted[corrupted.length - 1] ^= 1;
  assert.throws(() => decryptTokens(corrupted.toString('base64'), key));
});
test('OAuth token validation rejects incomplete responses', () => {
  assert.throws(() => validateOAuthTokens({ access_token: 'a', refresh_token: 'b' }));
  assert.deepEqual(validateOAuthTokens(tokens), tokens);
});
test('refresh uses refresh_token grant and validates response', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (_url, init) => {
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get('grant_type'), 'refresh_token');
    assert.equal(body.get('refresh_token'), 'old');
    return new Response(JSON.stringify(tokens), { status: 200 });
  }) as typeof fetch;
  try {
    assert.deepEqual(await refreshNetatmoToken({ baseUrl: 'http://127.0.0.1:8091', clientId: 'sim-client', clientSecret: 'sim-secret', redirectUri: 'http://127.0.0.1/callback' }, 'old'), tokens);
  } finally { globalThis.fetch = original; }
});

test('OAuth scope is preserved inside encrypted token and never inferred when absent', () => {
  const key=randomBytes(32);
  const scoped={...tokens,scope:'read_thermostat write_thermostat'};
  assert.deepEqual(decryptTokens(encryptTokens(validateOAuthTokens(scoped),key),key),scoped);
  assert.deepEqual(validateOAuthTokens(tokens),tokens);
  assert.throws(()=>validateOAuthTokens({...tokens,scope:['write_thermostat']}));
});
