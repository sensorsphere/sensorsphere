import type { Pool } from 'pg';
import { z } from 'zod';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { netatmoEncryptionKey } from './credentials.js';
import { netatmoConfig, type NetatmoConfig } from './client.js';

export const connectionSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  displayName: z.string().trim().min(1).max(120),
  baseUrl: z.string().url(),
  clientId: z.string().min(1).max(256),
  clientSecret: z.string().min(1).max(2048),
  enabled: z.boolean().default(true),
}).strict();

export function netatmoConnectionRedirectUri(publicUrl: string | undefined = process.env.SENSORSPHERE_PUBLIC_URL): string {
  if (!publicUrl?.trim()) throw new Error('SENSORSPHERE_PUBLIC_URL is required for Netatmo OAuth connections');
  const url = new URL(publicUrl.trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || !url.hostname) throw new Error('Invalid SENSORSPHERE_PUBLIC_URL for Netatmo OAuth');
  return url.origin + '/api/v1/integrations/netatmo/connections/callback';
}

function seal(secret: string): string {
  const key = netatmoEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm',key,iv);
  const body = Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64');
}
function unseal(payload: string): string {
  const data=Buffer.from(payload,'base64');
  if(data.length<29) throw new Error('Invalid encrypted secret');
  const decipher=createDecipheriv('aes-256-gcm',netatmoEncryptionKey(),data.subarray(0,12));
  decipher.setAuthTag(data.subarray(12,28));
  return Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8');
}
export function validateConnectionConfig(config: NetatmoConfig): NetatmoConfig {
  // Reuse the upstream SSRF protections from the legacy Netatmo configuration.
  const validated=netatmoConfig({
    SENSORSPHERE_NETATMO_BASE_URL:config.baseUrl,
    SENSORSPHERE_NETATMO_CLIENT_ID:config.clientId,
    SENSORSPHERE_NETATMO_CLIENT_SECRET:config.clientSecret,
    SENSORSPHERE_NETATMO_REDIRECT_URI:config.redirectUri,
  } as NodeJS.ProcessEnv);
  if(!validated) throw new Error('Invalid Netatmo connection');
  return validated;
}
export async function listConnections(pool: Pool) {
  const result=await pool.query('SELECT id,display_name,base_url,client_id,redirect_uri,enabled,created_at,updated_at FROM netatmo_connections ORDER BY id');
  return result.rows;
}
export async function createConnection(pool: Pool, input: z.infer<typeof connectionSchema>) {
  const config=validateConnectionConfig({baseUrl:input.baseUrl,clientId:input.clientId,clientSecret:input.clientSecret,redirectUri:netatmoConnectionRedirectUri()});
  await pool.query(`INSERT INTO netatmo_connections(id,display_name,base_url,client_id,encrypted_client_secret,redirect_uri,enabled)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,[input.id,input.displayName,config.baseUrl,config.clientId,seal(config.clientSecret),config.redirectUri,input.enabled]);
}
export async function getConnection(pool: Pool, id: string): Promise<NetatmoConfig | null> {
  const result=await pool.query('SELECT base_url,client_id,encrypted_client_secret,redirect_uri FROM netatmo_connections WHERE id=$1 AND enabled=true',[id]);
  if(!result.rows.length) return null;
  const row=result.rows[0];
  return validateConnectionConfig({baseUrl:row.base_url,clientId:row.client_id,clientSecret:unseal(row.encrypted_client_secret),redirectUri:row.redirect_uri});
}

export async function setConnectionEnabled(pool:Pool,id:string,enabled:boolean):Promise<boolean> {
  const result=await pool.query('UPDATE netatmo_connections SET enabled=$2,updated_at=NOW() WHERE id=$1 RETURNING id',[id,enabled]);
  return result.rowCount===1;
}
