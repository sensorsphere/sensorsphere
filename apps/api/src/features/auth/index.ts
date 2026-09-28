import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool, PoolClient } from "pg";

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

function requestRole(request: FastifyRequest): SensorSphereRole | null {
  const settings = authSettings();
  if (!settings.devRoleSwitchEnabled) return null;
  const requested = request.headers["x-sensorsphere-dev-role"];
  if (requested === "admin" || requested === "user") return requested;
  return settings.defaultRole;
}
function requireAdmin(request: FastifyRequest): void {
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
  if (existing.rows[0]) return;

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

export async function registerAuthFeature(
  app: FastifyInstance,
  deps: { pool: Pool }
) {
  const { pool } = deps;
  await ensureBootstrapAdmin(pool);

  app.get("/api/v1/auth/context", async request => {
    const settings = authSettings();
    const role = requestRole(request);
    return {
      enabled: settings.enabled,
      devRoleSwitchEnabled: settings.devRoleSwitchEnabled,
      devDefaultRole: settings.defaultRole,
      role,
      isAdmin: role === "admin",
      providers: settings.providers
    };
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
