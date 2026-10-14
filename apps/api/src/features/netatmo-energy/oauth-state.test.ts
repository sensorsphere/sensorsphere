import test from 'node:test';
import assert from 'node:assert/strict';
import { createOAuthState, consumeOAuthState } from './oauth-state.js';
import type { Pool } from 'pg';
test('OAuth state is random, hashed at rest, scoped to initiator, and single-use', async () => {
  const rows = new Map<string,string>();
  const pool = { query: async (sql: string, params: string[]) => {
    if (sql.startsWith('INSERT')) { rows.set(params[0],params[1]); return { rowCount:1 }; }
    const valid = rows.get(params[0]) === params[1];
    if (valid) rows.delete(params[0]);
    return { rowCount: valid ? 1 : 0 };
  }} as unknown as Pool;
  const state = await createOAuthState(pool,'user:1');
  assert.equal(state.length,43);
  assert.equal(rows.has(state),false);
  assert.equal(await consumeOAuthState(pool,state,'user:2'),false);
  assert.equal(await consumeOAuthState(pool,state,'user:1'),true);
  assert.equal(await consumeOAuthState(pool,state,'user:1'),false);
  assert.equal(await consumeOAuthState(pool,'invalid','user:1'),false);
});
