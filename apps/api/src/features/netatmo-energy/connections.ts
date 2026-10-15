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
  const result=await pool.query(`SELECT c.id,c.display_name,c.base_url,c.client_id,c.redirect_uri,c.enabled,c.created_at,c.updated_at,c.oauth_last_error,c.oauth_last_error_at,CASE WHEN cred.integration_id IS NOT NULL THEN 'authorized' WHEN c.oauth_last_error IS NOT NULL THEN 'authorization_failed' ELSE 'not_authorized' END AS oauth_status FROM netatmo_connections c LEFT JOIN netatmo_oauth_credentials cred ON cred.integration_id='netatmo-energy:' || c.id ORDER BY c.id`);
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

export async function setConnectionOAuthError(pool: Pool,id:string,message:string|null):Promise<void>{await pool.query('UPDATE netatmo_connections SET oauth_last_error=$2,oauth_last_error_at=CASE WHEN $2::text IS NULL THEN NULL ELSE NOW() END WHERE id=$1',[id,message]);}

export const connectionEditSchema=z.object({displayName:z.string().trim().min(1).max(120),baseUrl:z.string().url(),clientId:z.string().min(1).max(256),clientSecret:z.string().max(2048).optional()}).strict();
export async function updateConnection(pool:Pool,id:string,input:z.infer<typeof connectionEditSchema>):Promise<{updated:boolean;reauthorizationRequired:boolean}>{
 const client=await pool.connect();
 try{await client.query('BEGIN');const old=await client.query<{base_url:string;client_id:string;encrypted_client_secret:string;redirect_uri:string}>('SELECT base_url,client_id,encrypted_client_secret,redirect_uri FROM netatmo_connections WHERE id=$1 FOR UPDATE',[id]);if(!old.rows[0]){await client.query('ROLLBACK');return {updated:false,reauthorizationRequired:false};}
 const row=old.rows[0];const changed=old.rows[0].base_url!==input.baseUrl||old.rows[0].client_id!==input.clientId||Boolean(input.clientSecret);
 const config=validateConnectionConfig({baseUrl:input.baseUrl,clientId:input.clientId,clientSecret:input.clientSecret||unseal(row.encrypted_client_secret),redirectUri:netatmoConnectionRedirectUri()});
 await client.query('UPDATE netatmo_connections SET display_name=$2,base_url=$3,client_id=$4,encrypted_client_secret=$5,redirect_uri=$6,updated_at=NOW(),oauth_last_error=NULL,oauth_last_error_at=NULL WHERE id=$1',[id,input.displayName,config.baseUrl,config.clientId,input.clientSecret?seal(config.clientSecret):row.encrypted_client_secret,config.redirectUri]);
 if(changed){await client.query('DELETE FROM netatmo_oauth_credentials WHERE integration_id=$1',[`netatmo-energy:${id}`]);await client.query('DELETE FROM netatmo_oauth_states WHERE connection_id=$1',[id]);}
 await client.query('COMMIT');return {updated:true,reauthorizationRequired:changed};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
