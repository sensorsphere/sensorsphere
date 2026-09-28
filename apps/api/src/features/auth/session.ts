import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from "fastify";
import type { Pool } from "pg";

import { randomToken, sha256 } from "./oidc.js";

const SESSION_COOKIE = "sensorsphere_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: "admin" | "user";
  status: "pending" | "active" | "disabled" | "rejected";
  isBootstrapAdmin: boolean;
};

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};

  return Object.fromEntries(
    header.split(";").map(item => {
      const index = item.indexOf("=");
      if (index < 0) return [item.trim(), ""];
      return [
        item.slice(0, index).trim(),
        decodeURIComponent(item.slice(index + 1).trim())
      ];
    })
  );
}

function authEnabled(): boolean {
  return /^(1|true|yes|on)$/i.test(
    process.env.SENSORSPHERE_AUTH_ENABLED?.trim() ?? ""
  );
}

export function setSessionCookie(
  reply: FastifyReply,
  token: string
): void {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  reply.header(
    "Set-Cookie",
    [
      `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      `Max-Age=${maxAge}`
    ].join("; ")
  );
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.header(
    "Set-Cookie",
    [
      `${SESSION_COOKIE}=`,
      "Path=/",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Max-Age=0"
    ].join("; ")
  );
}

export async function createSession(
  pool: Pool,
  userId: string
): Promise<string> {
  const token = randomToken(32);
  const tokenHash = sha256(token);

  await pool.query(
    `INSERT INTO auth_sessions (
       token_hash, user_id, expires_at
     ) VALUES (
       $1, $2, NOW() + INTERVAL '${SESSION_DAYS} days'
     )`,
    [tokenHash, userId]
  );

  return token;
}

export async function deleteSession(
  pool: Pool,
  request: FastifyRequest
): Promise<void> {
  const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
  if (!token) return;

  await pool.query(
    "DELETE FROM auth_sessions WHERE token_hash = $1",
    [sha256(token)]
  );
}

export async function readSessionUser(
  pool: Pool,
  request: FastifyRequest
): Promise<SessionUser | null> {
  const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;

  const result = await pool.query(
    `SELECT
       u.id,
       u.email,
       u.display_name,
       u.role,
       u.status,
       u.is_bootstrap_admin
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.expires_at > NOW()`,
    [sha256(token)]
  );

  const row = result.rows[0];
  if (!row) return null;

  await pool.query(
    `UPDATE auth_sessions
     SET last_seen_at = NOW()
     WHERE token_hash = $1`,
    [sha256(token)]
  );

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    isBootstrapAdmin: row.is_bootstrap_admin
  };
}

function isPublicApiPath(url: string): boolean {
  const path = url.split("?")[0];

  return (
    path === "/health" ||
    path === "/api/health" ||
    path === "/api/v1/config" ||
    path === "/api/v1/module-versions" ||
    path.startsWith("/api/v1/auth/")
  );
}

export function installAuthGuard(
  app: FastifyInstance,
  pool: Pool
): void {
  app.addHook("onRequest", async (request, reply) => {
    if (!authEnabled()) return;

    if (!request.url.startsWith("/api/")) return;
    if (isPublicApiPath(request.url)) return;

    // Monitoring Agent machine endpoints authenticate with their own bearer
    // tokens. Never treat an arbitrary Bearer header as a general bypass.
    const path = request.url.split("?")[0];
    const monitoringAgentPath =
      path === "/api/v1/monitoring/agent/heartbeat" ||
      path === "/api/v1/monitoring/agent/checks" ||
      path === "/api/v1/monitoring/agent/results";

    if (
      monitoringAgentPath &&
      request.headers.authorization?.startsWith("Bearer ")
    ) {
      return;
    }

    const user = await readSessionUser(pool, request);
    if (!user) {
      return reply.code(401).send({
        statusCode: 401,
        error: "Unauthorized",
        message: "Authentication required"
      });
    }

    if (user.status !== "active") {
      return reply.code(403).send({
        statusCode: 403,
        error: "Forbidden",
        message:
          user.status === "pending"
            ? "Access request pending approval"
            : "User account is not active"
      });
    }

    (request as FastifyRequest & {
      sensorSphereUser?: SessionUser;
    }).sensorSphereUser = user;
  });
}
