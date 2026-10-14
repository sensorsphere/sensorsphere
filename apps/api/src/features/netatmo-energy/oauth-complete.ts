import type { FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { requireAdmin } from '../auth/index.js';
import { netatmoConfig, exchangeCode } from './client.js';
import { consumeOAuthState, oauthInitiator } from './oauth-state.js';
import { netatmoEncryptionKey, storeNetatmoTokens } from './credentials.js';
import { validateOAuthTokens } from './token.js';

export async function completeNetatmoOAuth(request: FastifyRequest, pool: Pool, code: string, state: string): Promise<'ok'|'invalid-state'> {
  requireAdmin(request);
  const config = netatmoConfig();
  if (!config) throw new Error('Netatmo connector not configured');
  const key = netatmoEncryptionKey();
  if (!await consumeOAuthState(pool, state, oauthInitiator(request))) return 'invalid-state';
  const tokens = validateOAuthTokens(await exchangeCode(config, code));
  await storeNetatmoTokens(pool, tokens, key);
  return 'ok';
}
