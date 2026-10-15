import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import type { FastifyRequest } from 'fastify';

function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
export function oauthInitiator(request: FastifyRequest): string {
  const user = (request as FastifyRequest & { sensorSphereUser?: { id: string } }).sensorSphereUser;
  if (user?.id) return `user:${user.id}`;
  if (process.env.SENSORSPHERE_AUTH_ENABLED === 'false' && process.env.SENSORSPHERE_AUTH_DEV_ROLE_SWITCH_ENABLED === 'true' && process.env.SENSORSPHERE_ENVIRONMENT === 'DEV') return 'dev-admin';
  throw new Error('Authenticated OAuth initiator required');
}
export async function createOAuthState(pool: Pool, initiator: string): Promise<string> {
  const state = randomBytes(32).toString('base64url');
  await pool.query('INSERT INTO netatmo_oauth_states (state_hash,initiated_by) VALUES ($1,$2)', [hash(state),initiator]);
  return state;
}
export async function consumeOAuthState(pool: Pool, state: string, initiator: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return false;
  const result = await pool.query(`DELETE FROM netatmo_oauth_states WHERE state_hash=$1 AND initiated_by=$2 AND expires_at>NOW() RETURNING state_hash`,[hash(state),initiator]);
  return result.rowCount === 1;
}

export async function createConnectionOAuthState(pool: Pool, initiator: string, connectionId: string): Promise<string> {
  const state=randomBytes(32).toString('base64url');
  await pool.query('INSERT INTO netatmo_oauth_states (state_hash,initiated_by,connection_id) VALUES ($1,$2,$3)',[hash(state),initiator,connectionId]);
  return state;
}
export async function consumeConnectionOAuthState(pool: Pool, state: string, initiator: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return null;
  const result=await pool.query<{connection_id:string}>('DELETE FROM netatmo_oauth_states WHERE state_hash=$1 AND initiated_by=$2 AND connection_id IS NOT NULL AND expires_at>NOW() RETURNING connection_id',[hash(state),initiator]);
  return result.rows[0]?.connection_id ?? null;
}
