import type { Pool } from 'pg';
import { decryptTokens, encryptTokens, refreshNetatmoToken, type OAuthTokens } from './token.js';
import type { NetatmoConfig } from './client.js';

export const NETATMO_INTEGRATION_ID = 'netatmo-energy';
export function netatmoEncryptionKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const encoded = env.SENSORSPHERE_NETATMO_TOKEN_ENCRYPTION_KEY;
  if (!encoded || !/^[0-9a-fA-F]{64}$/.test(encoded)) throw new Error('Netatmo encryption key must be 32 bytes of hex');
  return Buffer.from(encoded, 'hex');
}
export async function storeNetatmoTokens(pool: Pool, tokens: OAuthTokens, key: Buffer, integrationId = NETATMO_INTEGRATION_ID): Promise<void> {
  const encrypted = encryptTokens(tokens, key);
  await pool.query(`INSERT INTO netatmo_oauth_credentials (integration_id,encrypted_tokens,expires_at)
    VALUES ($1,$2,NOW()+($3::double precision * INTERVAL '1 second'))
    ON CONFLICT (integration_id) DO UPDATE SET encrypted_tokens=EXCLUDED.encrypted_tokens,expires_at=EXCLUDED.expires_at,updated_at=NOW()`,
    [integrationId,encrypted,tokens.expires_in]);
}
export async function getNetatmoAccessToken(pool: Pool, config: NetatmoConfig, key: Buffer, integrationId = NETATMO_INTEGRATION_ID, forceRefresh = false): Promise<string | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('sensorsphere:netatmo:oauth:' || $1))", [integrationId]);
    const result = await client.query<{encrypted_tokens:string; refresh_required:boolean}>(
      `SELECT encrypted_tokens,expires_at <= NOW()+INTERVAL '2 minutes' AS refresh_required
       FROM netatmo_oauth_credentials WHERE integration_id=$1 FOR UPDATE`, [integrationId]);
    const stored = result.rows[0];
    if (!stored) { await client.query('COMMIT'); return null; }
    let tokens = decryptTokens(stored.encrypted_tokens,key);
    if (stored.refresh_required || forceRefresh) {
      const refreshed = await refreshNetatmoToken(config,tokens.refresh_token);
      tokens = { ...refreshed, ...(refreshed.scope === undefined && tokens.scope !== undefined ? {scope:tokens.scope} : {}) };
      await client.query(`UPDATE netatmo_oauth_credentials SET encrypted_tokens=$2,
        expires_at=NOW()+($3::double precision * INTERVAL '1 second'),updated_at=NOW()
        WHERE integration_id=$1`, [integrationId,encryptTokens(tokens,key),tokens.expires_in]);
    }
    await client.query('COMMIT');
    return tokens.access_token;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export type NetatmoPermission = 'granted' | 'missing' | 'unknown';
export function netatmoPermissions(scope: string | undefined): {read:NetatmoPermission;write:NetatmoPermission} {
  if (scope === undefined) return {read:'unknown',write:'unknown'};
  const granted = new Set(scope.split(/\s+/).filter(Boolean));
  return {read:granted.has('read_thermostat')?'granted':'missing',write:granted.has('write_thermostat')?'granted':'missing'};
}
export async function getNetatmoPermissions(pool:Pool, integrationId:string) {
  const result=await pool.query<{encrypted_tokens:string;updated_at:Date}>(
    'SELECT encrypted_tokens,updated_at FROM netatmo_oauth_credentials WHERE integration_id=$1',[integrationId]);
  if (!result.rows[0]) return {read:'unknown' as const,write:'unknown' as const,verifiedAt:null};
  const tokens=decryptTokens(result.rows[0].encrypted_tokens,netatmoEncryptionKey());
  return {...netatmoPermissions(tokens.scope),verifiedAt:tokens.scope===undefined?null:result.rows[0].updated_at};
}
