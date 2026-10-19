import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import type { NetatmoConfig } from './client.js';

export type OAuthTokens = { access_token: string; refresh_token: string; expires_in: number; scope?: string };
export function validateOAuthTokens(value: unknown): OAuthTokens {
  if (!value || typeof value !== 'object') throw new Error('Invalid OAuth response');
  const token = value as Record<string, unknown>;
  if (typeof token.access_token !== 'string' || !token.access_token || typeof token.refresh_token !== 'string' || !token.refresh_token || typeof token.expires_in !== 'number' || !Number.isFinite(token.expires_in) || token.expires_in <= 0) throw new Error('Invalid OAuth response');
  let scope:string|undefined;
  if(typeof token.scope==='string')scope=token.scope;
  else if(Array.isArray(token.scope)&&token.scope.every(item=>typeof item==='string'&&/^[a-z_]+$/.test(item)))scope=token.scope.join(' ');
  else if(token.scope!==undefined)throw new Error('Invalid OAuth scope');
  if(scope!==undefined&&scope.length>2048)throw new Error('Invalid OAuth scope');
  return {access_token:token.access_token,refresh_token:token.refresh_token,expires_in:token.expires_in,...(scope!==undefined?{scope}:{})};
}
export async function refreshNetatmoToken(config: NetatmoConfig, refreshToken: string): Promise<OAuthTokens> {
  if (!refreshToken) throw new Error('Missing refresh token');
  const response = await fetch(new URL('/oauth2/token', config.baseUrl), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: config.clientId, client_secret: config.clientSecret })
  });
  if (!response.ok) throw new Error('Netatmo token refresh failed');
  return validateOAuthTokens(await response.json());
}
export function encryptTokens(tokens: OAuthTokens, key: Buffer): string {
  if (key.length !== 32) throw new Error('Expected 256-bit encryption key');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
export function decryptTokens(blob: string, key: Buffer): OAuthTokens {
  if (key.length !== 32) throw new Error('Expected 256-bit encryption key');
  const bytes = Buffer.from(blob, 'base64');
  if (bytes.length < 30 || bytes[0] !== 1) throw new Error('Invalid encrypted token payload');
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(1, 13));
  decipher.setAuthTag(bytes.subarray(13, 29));
  return validateOAuthTokens(JSON.parse(Buffer.concat([decipher.update(bytes.subarray(29)), decipher.final()]).toString('utf8')));
}
