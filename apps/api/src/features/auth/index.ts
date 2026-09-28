import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";

export type SensorSphereRole = "admin" | "user";

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

  return { enabled, devRoleSwitchEnabled, defaultRole };
}
function requestRole(request: FastifyRequest): SensorSphereRole | null {
  const settings = authSettings();

  if (!settings.devRoleSwitchEnabled) {
    return null;
  }

  const requested = request.headers["x-sensorsphere-dev-role"];

  if (requested === "admin" || requested === "user") {
    return requested;
  }

  return settings.defaultRole;
}

function requireAdmin(request: FastifyRequest): void {
  if (requestRole(request) === "admin") {
    return;
  }

  const error = new Error("Administrator role required") as Error & {
    statusCode?: number;
  };
  error.statusCode = 403;
  throw error;
}
function mapUser(row: Record<string, any>) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by,
    lastLoginAt: row.last_login_at
  };
}

export async function registerAuthFeature(
  app: FastifyInstance,
  deps: { pool: Pool }
) {
  const { pool } = deps;

  app.get("/api/v1/auth/context", async request => {
    const settings = authSettings();
    const role = requestRole(request);

    return {
      enabled: settings.enabled,
      devRoleSwitchEnabled: settings.devRoleSwitchEnabled,
      devDefaultRole: settings.defaultRole,
      role,
      isAdmin: role === "admin"
    };
  });
  app.get("/api/v1/admin/users", async request => {
    requireAdmin(request);

    const result = await pool.query(
      `SELECT
         id, email, display_name, role, status,
         created_at, approved_at, approved_by, last_login_at
       FROM users
       ORDER BY created_at DESC`
    );

    return result.rows.map(mapUser);
  });

  app.post("/api/v1/admin/users/:id/approve", async request => {
    requireAdmin(request);

    const { id } = request.params as { id: string };

    const result = await pool.query(
      `UPDATE users
       SET status = 'active',
           approved_at = NOW()
       WHERE id = $1
         AND status = 'pending'
       RETURNING
         id, email, display_name, role, status,
         created_at, approved_at, approved_by, last_login_at`,
      [id]
    );
    if (!result.rows[0]) {
      const error = new Error("Pending user not found") as Error & {
        statusCode?: number;
      };
      error.statusCode = 404;
      throw error;
    }

    return mapUser(result.rows[0]);
  });

  app.post("/api/v1/auth/dev/users", async request => {
    const settings = authSettings();

    if (!settings.devRoleSwitchEnabled) {
      const error = new Error("DEV user creation is not available") as Error & {
        statusCode?: number;
      };
      error.statusCode = 404;
      throw error;
    }

    const body = request.body as {
      email?: string;
      displayName?: string;
    };
    const email = body?.email?.trim().toLowerCase();

    if (!email || !email.includes("@")) {
      const error = new Error("Valid email is required") as Error & {
        statusCode?: number;
      };
      error.statusCode = 400;
      throw error;
    }

    const result = await pool.query(
      `INSERT INTO users (email, display_name, role, status)
       VALUES ($1, $2, 'user', 'pending')
       ON CONFLICT (email)
       DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING
         id, email, display_name, role, status,
         created_at, approved_at, approved_by, last_login_at`,
      [email, body?.displayName?.trim() || null]
    );

    return mapUser(result.rows[0]);
  });
}
