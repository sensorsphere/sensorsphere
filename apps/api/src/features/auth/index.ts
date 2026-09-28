import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool, PoolClient } from "pg";

import {
  buildAuthorizationUrl,
  exchangeAndValidateIdToken,
  randomToken,
  sha256,
  type OidcProvider
} from "./oidc.js";
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  readSessionUser,
  setSessionCookie,
  type SessionUser
} from "./session.js";

export type SensorSphereRole = "admin" | "user";
export type SensorSphereUserStatus =
  | "pending"
  | "active"
  | "disabled"
  | "rejected";
export type IdentityProvider = "google" | "microsoft";

function flag(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(value?.trim() ?? "");
}

function authSettings() {
  const enabled = flag(process.env.SENSORSPHERE_AUTH_ENABLED);
  const environment = (process.env.SENSORSPHERE_ENVIRONMENT ?? "DEFAULT")
    .trim()
    .toUpperCase();
  const devRoleSwitchEnabled =
    !enabled &&
    environment === "DEV" &&
    flag(process.env.SENSORSPHERE_AUTH_DEV_ROLE_SWITCH_ENABLED);
  const defaultRole: SensorSphereRole =
    (process.env.SENSORSPHERE_AUTH_DEV_DEFAULT_ROLE ?? "admin")
      .trim()
      .toLowerCase() === "user"
      ? "user"
      : "admin";
  const bootstrapAdminEmail =
    process.env.SENSORSPHERE_AUTH_BOOTSTRAP_ADMIN_EMAIL
      ?.trim()
      .toLowerCase() || null;
  const providers = (process.env.SENSORSPHERE_AUTH_PROVIDERS ?? "google")
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter((value): value is IdentityProvider =>
      value === "google" || value === "microsoft"
    );

  return {
    enabled,
    devRoleSwitchEnabled,
    defaultRole,
    bootstrapAdminEmail,
    providers: [...new Set(providers)]
  };
}


function validateAuthStartupConfiguration(): void {
  const settings = authSettings();
  const environment = (process.env.SENSORSPHERE_ENVIRONMENT ?? "DEFAULT")
    .trim()
    .toUpperCase();

  if (environment !== "DEV" && !settings.enabled) {
    throw new Error(
      `Authentication cannot be disabled when SENSORSPHERE_ENVIRONMENT=${environment}`
    );
  }

  if (!settings.enabled) {
    return;
  }

  const publicUrl =
    process.env.SENSORSPHERE_PUBLIC_URL?.trim().replace(/\/$/, "") ?? "";
  if (!/^https:\/\/[^/]+(?::\d+)?$/.test(publicUrl)) {
    throw new Error(
      "SENSORSPHERE_PUBLIC_URL must be a public HTTPS origin when authentication is enabled"
    );
  }

  if (settings.providers.length === 0) {
    throw new Error(
      "SENSORSPHERE_AUTH_PROVIDERS must contain google and/or microsoft"
    );
  }

  for (const provider of settings.providers) {
    if (provider === "google") {
      const clientId =
        process.env.SENSORSPHERE_GOOGLE_CLIENT_ID?.trim() ?? "";
      const clientSecret =
        process.env.SENSORSPHERE_GOOGLE_CLIENT_SECRET?.trim() ?? "";
      if (!clientId || !clientSecret) {
        throw new Error(
          "Google OIDC is enabled but SENSORSPHERE_GOOGLE_CLIENT_ID / SENSORSPHERE_GOOGLE_CLIENT_SECRET are incomplete"
        );
      }
    } else if (provider === "microsoft") {
      const clientId =
        process.env.SENSORSPHERE_MICROSOFT_CLIENT_ID?.trim() ?? "";
      const clientSecret =
        process.env.SENSORSPHERE_MICROSOFT_CLIENT_SECRET?.trim() ?? "";
      if (!clientId || !clientSecret) {
        throw new Error(
          "Microsoft OIDC is enabled but SENSORSPHERE_MICROSOFT_CLIENT_ID / SENSORSPHERE_MICROSOFT_CLIENT_SECRET are incomplete"
        );
      }
    }
  }
}

function requestRole(request: FastifyRequest): SensorSphereRole | null {
  const settings = authSettings();
  if (!settings.devRoleSwitchEnabled) return null;
  const requested = request.headers["x-sensorsphere-dev-role"];
  if (requested === "admin" || requested === "user") return requested;
  return settings.defaultRole;
}
function requireAdmin(request: FastifyRequest): void {
  const sessionUser = (request as FastifyRequest & {
    sensorSphereUser?: SessionUser;
  }).sensorSphereUser;

  if (sessionUser?.role === "admin") return;
  if (requestRole(request) === "admin") return;

  const error = new Error("Administrator role required") as Error & {
    statusCode?: number;
  };
  error.statusCode = 403;
  throw error;
}

function httpError(statusCode: number, message: string): never {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = statusCode;
  throw error;
}

function mapIdentity(row: Record<string, any>) {
  return {
    provider: row.provider,
    providerSubject: row.provider_subject,
    providerTenant: row.provider_tenant,
    providerEmail: row.provider_email,
    createdAt: row.identity_created_at ?? row.created_at,
    lastLoginAt: row.identity_last_login_at ?? row.last_login_at
  };
}

async function readIdentities(pool: Pool, userId: string) {
  const result = await pool.query(
    `SELECT provider, provider_subject, provider_tenant, provider_email,
            created_at AS identity_created_at,
            last_login_at AS identity_last_login_at
     FROM user_identities
     WHERE user_id = $1
     ORDER BY provider, provider_email NULLS LAST, created_at`,
    [userId]
  );
  return result.rows.map(mapIdentity);
}

async function mapUser(pool: Pool, row: Record<string, any>) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    isBootstrapAdmin: row.is_bootstrap_admin,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    lastLoginAt: row.last_login_at,
    identities: await readIdentities(pool, row.id)
  };
}

async function audit(
  db: Pool | PoolClient,
  action: string,
  targetUserId: string | null,
  details: Record<string, unknown> = {}
) {
  await db.query(
    `INSERT INTO auth_audit_log (
       actor_user_id, actor_role, action, target_user_id, details
     ) VALUES (NULL, 'admin', $1, $2, $3::jsonb)`,
    [action, targetUserId, JSON.stringify(details)]
  );
}

async function ensureBootstrapAdmin(pool: Pool) {
  const { bootstrapAdminEmail } = authSettings();
  if (!bootstrapAdminEmail) return;

  const existing = await pool.query(
    `SELECT id, email
     FROM users
     WHERE is_bootstrap_admin = TRUE
     LIMIT 1`
  );

  if (existing.rows[0]) {
    const bootstrap = existing.rows[0];

    if (bootstrap.email === bootstrapAdminEmail) return;

    const identities = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM user_identities
       WHERE user_id = $1`,
      [bootstrap.id]
    );

    // Before the first real OIDC identity is attached, the bootstrap address
    // may be corrected in configuration without creating a permanent
    // privilege-escalation path. After first identity link it is immutable.
    if (Number(identities.rows[0]?.count ?? "0") > 0) return;

    const configuredUser = await pool.query(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      [bootstrapAdminEmail]
    );

    if (configuredUser.rows[0]) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE users
           SET role = 'admin',
               status = 'active',
               is_bootstrap_admin = TRUE,
               approved_at = COALESCE(approved_at, NOW())
           WHERE id = $1`,
          [configuredUser.rows[0].id]
        );
        await client.query(
          "DELETE FROM users WHERE id = $1",
          [bootstrap.id]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      return;
    }

    await pool.query(
      "UPDATE users SET email = $2 WHERE id = $1",
      [bootstrap.id, bootstrapAdminEmail]
    );
    return;
  }

  const admins = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM users
     WHERE role = 'admin' AND status = 'active'`
  );
  if (Number(admins.rows[0]?.count ?? "0") > 0) return;

  await pool.query(
    `INSERT INTO users (
       email, display_name, role, status, is_bootstrap_admin,
       approved_at
     ) VALUES ($1, 'Bootstrap Admin', 'admin', 'active', TRUE, NOW())
     ON CONFLICT (email) DO UPDATE
     SET role = 'admin',
         status = 'active',
         is_bootstrap_admin = TRUE,
         approved_at = COALESCE(users.approved_at, NOW())`,
    [bootstrapAdminEmail]
  );
}
async function activeAdminCount(
  db: Pool | PoolClient,
  excludingUserId?: string
): Promise<number> {
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM users
     WHERE role = 'admin'
       AND status = 'active'
       AND ($1::uuid IS NULL OR id <> $1::uuid)`,
    [excludingUserId ?? null]
  );
  return Number(result.rows[0]?.count ?? "0");
}

async function getUserRow(
  db: Pool | PoolClient,
  id: string
): Promise<Record<string, any>> {
  const result = await db.query(
    `SELECT id, email, display_name, role, status, is_bootstrap_admin,
            created_at, approved_at, approved_by, last_login_at
     FROM users
     WHERE id = $1`,
    [id]
  );
  if (!result.rows[0]) httpError(404, "User not found");
  return result.rows[0];
}

function parseRole(value: unknown): SensorSphereRole {
  if (value === "admin" || value === "user") return value;
  return httpError(400, "Role must be admin or user");
}

function parseProvider(value: unknown): IdentityProvider {
  if (value === "google" || value === "microsoft") return value;
  return httpError(400, "Provider must be google or microsoft");
}

function publicUrl(): string {
  const value =
    process.env.SENSORSPHERE_PUBLIC_URL?.trim().replace(/\/$/, "") ?? "";
  if (!value) {
    httpError(503, "SENSORSPHERE_PUBLIC_URL is not configured");
  }
  return value;
}

function parseOidcProvider(value: unknown): OidcProvider {
  if (value === "google" || value === "microsoft") return value;
  return httpError(404, "OIDC provider not found");
}

function identityFromClaims(
  provider: OidcProvider,
  claims: {
    sub?: string;
    oid?: string;
    tid?: string;
    email?: string;
    preferred_username?: string;
    name?: string;
  }
) {
  const providerEmail =
    (claims.email || claims.preferred_username)?.trim().toLowerCase() || null;

  if (provider === "google") {
    if (!claims.sub) httpError(401, "Google identity is missing sub");
    return {
      providerSubject: claims.sub,
      providerTenant: null,
      providerEmail,
      displayName: claims.name?.trim() || null
    };
  }

  if (!claims.oid || !claims.tid) {
    httpError(401, "Microsoft identity is missing oid or tid");
  }

  return {
    providerSubject: `${claims.tid}:${claims.oid}`,
    providerTenant: claims.tid,
    providerEmail,
    displayName: claims.name?.trim() || null
  };
}

async function resolveOidcUser(
  pool: Pool,
  provider: OidcProvider,
  identity: {
    providerSubject: string;
    providerTenant: string | null;
    providerEmail: string | null;
    displayName: string | null;
  },
  linkUserId: string | null
): Promise<Record<string, any>> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (linkUserId) {
      const target = await getUserRow(client, linkUserId);

      try {
        await client.query(
          `INSERT INTO user_identities (
             user_id, provider, provider_subject, provider_tenant,
             provider_email, last_login_at
           ) VALUES ($1, $2, $3, $4, $5, NOW())`,
          [
            linkUserId,
            provider,
            identity.providerSubject,
            identity.providerTenant,
            identity.providerEmail
          ]
        );
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "23505"
        ) {
          httpError(409, "This provider identity is already linked");
        }
        throw error;
      }

      await audit(client, "identity.link.oidc", linkUserId, { provider });
      await client.query("COMMIT");
      return target;
    }

    const existingIdentity = await client.query(
      `SELECT u.*
       FROM user_identities i
       JOIN users u ON u.id = i.user_id
       WHERE i.provider = $1
         AND i.provider_subject = $2
       LIMIT 1`,
      [provider, identity.providerSubject]
    );

    if (existingIdentity.rows[0]) {
      const user = existingIdentity.rows[0];

      await client.query(
        `UPDATE user_identities
         SET provider_tenant = $3,
             provider_email = $4,
             last_login_at = NOW()
         WHERE provider = $1
           AND provider_subject = $2`,
        [
          provider,
          identity.providerSubject,
          identity.providerTenant,
          identity.providerEmail
        ]
      );

      await client.query(
        "UPDATE users SET last_login_at = NOW() WHERE id = $1",
        [user.id]
      );

      await client.query("COMMIT");
      return {
        ...user,
        last_login_at: new Date()
      };
    }

    const settings = authSettings();
    const bootstrapMatch =
      settings.bootstrapAdminEmail &&
      identity.providerEmail === settings.bootstrapAdminEmail;

    if (bootstrapMatch) {
      const bootstrap = await client.query(
        `SELECT *
         FROM users
         WHERE is_bootstrap_admin = TRUE
            OR email = $1
         ORDER BY is_bootstrap_admin DESC
         LIMIT 1`,
        [settings.bootstrapAdminEmail]
      );

      if (bootstrap.rows[0]) {
        const user = bootstrap.rows[0];
        await client.query(
          `INSERT INTO user_identities (
             user_id, provider, provider_subject, provider_tenant,
             provider_email, last_login_at
           ) VALUES ($1, $2, $3, $4, $5, NOW())`,
          [
            user.id,
            provider,
            identity.providerSubject,
            identity.providerTenant,
            identity.providerEmail
          ]
        );
        await client.query(
          "UPDATE users SET last_login_at = NOW() WHERE id = $1",
          [user.id]
        );
        await audit(client, "identity.bootstrap.link", user.id, { provider });
        await client.query("COMMIT");
        return user;
      }
    }

    if (!identity.providerEmail) {
      httpError(409, "Provider did not return an email for a new account");
    }

    const sameEmail = await client.query(
      "SELECT id FROM users WHERE email = $1 LIMIT 1",
      [identity.providerEmail]
    );
    if (sameEmail.rows[0]) {
      httpError(
        409,
        "This email already belongs to a SensorSphere account; sign in with an existing identity and link this provider explicitly"
      );
    }

    const created = await client.query(
      `INSERT INTO users (
         email, display_name, role, status
       ) VALUES ($1, $2, 'user', 'pending')
       RETURNING *`,
      [identity.providerEmail, identity.displayName]
    );
    const user = created.rows[0];

    await client.query(
      `INSERT INTO user_identities (
         user_id, provider, provider_subject, provider_tenant,
         provider_email, last_login_at
       ) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        user.id,
        provider,
        identity.providerSubject,
        identity.providerTenant,
        identity.providerEmail
      ]
    );
    await audit(client, "user.create.oidc", user.id, { provider });
    await client.query("COMMIT");
    return user;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function registerAuthFeature(
  app: FastifyInstance,
  deps: { pool: Pool }
) {
  const { pool } = deps;
  validateAuthStartupConfiguration();
  await ensureBootstrapAdmin(pool);

  app.get("/api/v1/auth/context", async request => {
    const settings = authSettings();

    if (settings.enabled) {
      const user = await readSessionUser(pool, request);
      return {
        enabled: true,
        authenticated: Boolean(user),
        devRoleSwitchEnabled: false,
        devDefaultRole: settings.defaultRole,
        role: user?.role ?? null,
        isAdmin: user?.role === "admin" && user.status === "active",
        status: user?.status ?? null,
        user: user
          ? {
              id: user.id,
              email: user.email,
              displayName: user.displayName,
              role: user.role,
              status: user.status,
              isBootstrapAdmin: user.isBootstrapAdmin
            }
          : null,
        providers: settings.providers
      };
    }

    const role = requestRole(request);
    return {
      enabled: false,
      authenticated: true,
      devRoleSwitchEnabled: settings.devRoleSwitchEnabled,
      devDefaultRole: settings.defaultRole,
      role,
      isAdmin: role === "admin",
      status: "active",
      user: null,
      providers: settings.providers
    };
  });

  app.get("/api/v1/auth/oidc/:provider/start", async (request, reply) => {
    const settings = authSettings();
    if (!settings.enabled) {
      httpError(404, "OIDC authentication is not enabled");
    }

    const { provider: rawProvider } = request.params as { provider: string };
    const provider = parseOidcProvider(rawProvider);
    if (!settings.providers.includes(provider)) {
      httpError(404, "OIDC provider is not enabled");
    }

    const state = randomToken();
    const nonce = randomToken();

    await pool.query(
      `DELETE FROM auth_oidc_requests WHERE expires_at <= NOW()`
    );
    await pool.query(
      `INSERT INTO auth_oidc_requests (
         state_hash, provider, nonce, link_user_id,
         redirect_after, expires_at
       ) VALUES ($1, $2, $3, NULL, '/', NOW() + INTERVAL '10 minutes')`,
      [sha256(state), provider, nonce]
    );

    return reply.redirect(
      await buildAuthorizationUrl(provider, state, nonce)
    );
  });

  app.get("/api/v1/auth/oidc/:provider/link", async (request, reply) => {
    const settings = authSettings();
    if (!settings.enabled) {
      httpError(404, "OIDC authentication is not enabled");
    }

    const user = await readSessionUser(pool, request);
    if (!user || user.status !== "active") {
      httpError(401, "Active authentication session required");
    }

    const { provider: rawProvider } = request.params as { provider: string };
    const provider = parseOidcProvider(rawProvider);
    if (!settings.providers.includes(provider)) {
      httpError(404, "OIDC provider is not enabled");
    }

    const state = randomToken();
    const nonce = randomToken();

    await pool.query(
      `INSERT INTO auth_oidc_requests (
         state_hash, provider, nonce, link_user_id,
         redirect_after, expires_at
       ) VALUES ($1, $2, $3, $4, '/?page=users', NOW() + INTERVAL '10 minutes')`,
      [sha256(state), provider, nonce, user.id]
    );

    return reply.redirect(
      await buildAuthorizationUrl(provider, state, nonce)
    );
  });

  app.get("/api/v1/auth/oidc/:provider/callback", async (request, reply) => {
    const { provider: rawProvider } = request.params as { provider: string };
    const provider = parseOidcProvider(rawProvider);
    const query = request.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    if (query.error) {
      return reply.redirect(
        `${publicUrl()}/?auth_error=${encodeURIComponent(query.error)}`
      );
    }
    if (!query.code || !query.state) {
      httpError(400, "OIDC callback is missing code or state");
    }

    const stateResult = await pool.query(
      `DELETE FROM auth_oidc_requests
       WHERE state_hash = $1
         AND provider = $2
         AND expires_at > NOW()
       RETURNING nonce, link_user_id, redirect_after`,
      [sha256(query.state), provider]
    );
    const oidcRequest = stateResult.rows[0];
    if (!oidcRequest) {
      httpError(400, "OIDC state is invalid or expired");
    }

    const claims = await exchangeAndValidateIdToken(
      provider,
      query.code,
      oidcRequest.nonce
    );
    const identity = identityFromClaims(provider, claims);

    if (oidcRequest.link_user_id) {
      const currentUser = await readSessionUser(pool, request);
      if (
        !currentUser ||
        currentUser.status !== "active" ||
        currentUser.id !== oidcRequest.link_user_id
      ) {
        httpError(401, "Identity linking session no longer matches");
      }

      await resolveOidcUser(
        pool,
        provider,
        identity,
        oidcRequest.link_user_id
      );
      return reply.redirect(
        `${publicUrl()}${oidcRequest.redirect_after || "/"}`
      );
    }

    const user = await resolveOidcUser(pool, provider, identity, null);

    if (user.status === "disabled" || user.status === "rejected") {
      return reply.redirect(
        `${publicUrl()}/?auth_error=account_${encodeURIComponent(user.status)}`
      );
    }

    const sessionToken = await createSession(pool, user.id);
    setSessionCookie(reply, sessionToken);

    return reply.redirect(publicUrl() + "/");
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    await deleteSession(pool, request);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/api/v1/admin/users", async request => {
    requireAdmin(request);
    const result = await pool.query(
      `SELECT id, email, display_name, role, status, is_bootstrap_admin,
              created_at, approved_at, approved_by, last_login_at
       FROM users
       ORDER BY is_bootstrap_admin DESC, created_at DESC`
    );
    return Promise.all(result.rows.map(row => mapUser(pool, row)));
  });

  app.get("/api/v1/admin/users/summary", async request => {
    requireAdmin(request);
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending')::integer AS pending,
         COUNT(*) FILTER (WHERE status = 'active')::integer AS active,
         COUNT(*) FILTER (WHERE status = 'disabled')::integer AS disabled,
         COUNT(*) FILTER (WHERE status = 'rejected')::integer AS rejected
       FROM users`
    );
    return result.rows[0];
  });
  app.post("/api/v1/admin/users/:id/approve", async request => {
    requireAdmin(request);
    const { id } = request.params as { id: string };
    const result = await pool.query(
      `UPDATE users
       SET status = 'active', approved_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING id, email, display_name, role, status, is_bootstrap_admin,
                 created_at, approved_at, approved_by, last_login_at`,
      [id]
    );
    if (!result.rows[0]) httpError(404, "Pending user not found");
    await audit(pool, "user.approve", id);
    return mapUser(pool, result.rows[0]);
  });

  app.post("/api/v1/admin/users/:id/reject", async request => {
    requireAdmin(request);
    const { id } = request.params as { id: string };
    const user = await getUserRow(pool, id);
    if (user.is_bootstrap_admin) {
      httpError(409, "Bootstrap admin cannot be rejected");
    }
    const result = await pool.query(
      `UPDATE users
       SET status = 'rejected'
       WHERE id = $1 AND status = 'pending'
       RETURNING id, email, display_name, role, status, is_bootstrap_admin,
                 created_at, approved_at, approved_by, last_login_at`,
      [id]
    );
    if (!result.rows[0]) httpError(409, "Only pending users can be rejected");
    await audit(pool, "user.reject", id);
    return mapUser(pool, result.rows[0]);
  });

  app.patch("/api/v1/admin/users/:id/role", async request => {
    requireAdmin(request);
    const { id } = request.params as { id: string };
    const { role } = request.body as { role?: unknown };
    const nextRole = parseRole(role);
    const user = await getUserRow(pool, id);

    if (user.is_bootstrap_admin && nextRole !== "admin") {
      httpError(409, "Bootstrap admin cannot be demoted");
    }
    if (
      user.role === "admin" &&
      nextRole === "user" &&
      user.status === "active" &&
      await activeAdminCount(pool, id) === 0
    ) {
      httpError(409, "The last active administrator cannot be demoted");
    }

    const result = await pool.query(
      `UPDATE users SET role = $2 WHERE id = $1
       RETURNING id, email, display_name, role, status, is_bootstrap_admin,
                 created_at, approved_at, approved_by, last_login_at`,
      [id, nextRole]
    );
    await audit(pool, "user.role.change", id, {
      previousRole: user.role,
      role: nextRole
    });
    return mapUser(pool, result.rows[0]);
  });
  app.post("/api/v1/admin/users/:id/disable", async request => {
    requireAdmin(request);
    const { id } = request.params as { id: string };
    const user = await getUserRow(pool, id);

    if (user.is_bootstrap_admin) {
      httpError(409, "Bootstrap admin cannot be disabled");
    }
    if (
      user.role === "admin" &&
      user.status === "active" &&
      await activeAdminCount(pool, id) === 0
    ) {
      httpError(409, "The last active administrator cannot be disabled");
    }

    const result = await pool.query(
      `UPDATE users SET status = 'disabled'
       WHERE id = $1 AND status = 'active'
       RETURNING id, email, display_name, role, status, is_bootstrap_admin,
                 created_at, approved_at, approved_by, last_login_at`,
      [id]
    );
    if (!result.rows[0]) httpError(409, "Only active users can be disabled");
    await audit(pool, "user.disable", id);
    return mapUser(pool, result.rows[0]);
  });

  app.post("/api/v1/admin/users/:id/enable", async request => {
    requireAdmin(request);
    const { id } = request.params as { id: string };
    const result = await pool.query(
      `UPDATE users SET status = 'active'
       WHERE id = $1 AND status IN ('disabled', 'rejected')
       RETURNING id, email, display_name, role, status, is_bootstrap_admin,
                 created_at, approved_at, approved_by, last_login_at`,
      [id]
    );
    if (!result.rows[0]) {
      httpError(409, "Only disabled or rejected users can be enabled");
    }
    await audit(pool, "user.enable", id);
    return mapUser(pool, result.rows[0]);
  });
  app.post("/api/v1/admin/users/:id/identities", async request => {
    requireAdmin(request);
    const settings = authSettings();
    if (!settings.devRoleSwitchEnabled) {
      httpError(403, "Manual identity creation is DEV-only");
    }

    const { id } = request.params as { id: string };
    await getUserRow(pool, id);
    const body = request.body as {
      provider?: unknown;
      providerSubject?: string;
      providerTenant?: string | null;
      providerEmail?: string | null;
    };
    const provider = parseProvider(body.provider);
    const providerSubject = body.providerSubject?.trim();
    if (!providerSubject) httpError(400, "Provider subject is required");

    try {
      await pool.query(
        `INSERT INTO user_identities (
           user_id, provider, provider_subject, provider_tenant, provider_email
         ) VALUES ($1, $2, $3, $4, $5)`,
        [
          id,
          provider,
          providerSubject,
          body.providerTenant?.trim() || null,
          body.providerEmail?.trim().toLowerCase() || null
        ]
      );
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23505"
      ) {
        httpError(409, "This provider identity is already linked");
      }
      throw error;
    }

    await audit(pool, "identity.link.dev", id, { provider });
    return mapUser(pool, await getUserRow(pool, id));
  });

  app.delete(
    "/api/v1/admin/users/:id/identities/:provider/:subject",
    async request => {
      requireAdmin(request);
      const { id, provider, subject } = request.params as {
        id: string;
        provider: string;
        subject: string;
      };
      const user = await getUserRow(pool, id);
      const countResult = await pool.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM user_identities WHERE user_id = $1",
        [id]
      );
      const identityCount = Number(countResult.rows[0]?.count ?? "0");
      if (authSettings().enabled && identityCount <= 1) {
        httpError(409, "The last login identity cannot be unlinked");
      }
      if (user.is_bootstrap_admin && identityCount <= 1) {
        httpError(409, "Bootstrap admin must retain a login identity");
      }

      const result = await pool.query(
        `DELETE FROM user_identities
         WHERE user_id = $1 AND provider = $2 AND provider_subject = $3`,
        [id, parseProvider(provider), subject]
      );
      if (result.rowCount === 0) httpError(404, "Identity not found");
      await audit(pool, "identity.unlink", id, { provider });
      return { ok: true };
    }
  );
  app.get("/api/v1/admin/auth-audit", async request => {
    requireAdmin(request);
    const result = await pool.query(
      `SELECT id, actor_user_id AS "actorUserId", actor_role AS "actorRole",
              action, target_user_id AS "targetUserId",
              details, created_at AS "createdAt"
       FROM auth_audit_log
       ORDER BY created_at DESC
       LIMIT 100`
    );
    return result.rows;
  });

  app.post("/api/v1/auth/dev/users", async request => {
    const settings = authSettings();
    if (!settings.devRoleSwitchEnabled) {
      httpError(404, "DEV user creation is not available");
    }

    const body = request.body as {
      email?: string;
      displayName?: string;
    };
    const email = body?.email?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      httpError(400, "Valid email is required");
    }

    const result = await pool.query(
      `INSERT INTO users (email, display_name, role, status)
       VALUES ($1, $2, 'user', 'pending')
       ON CONFLICT (email)
       DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING id, email, display_name, role, status, is_bootstrap_admin,
                 created_at, approved_at, approved_by, last_login_at`,
      [email, body?.displayName?.trim() || null]
    );

    await audit(pool, "user.create.dev", result.rows[0].id);
    return mapUser(pool, result.rows[0]);
  });
}
