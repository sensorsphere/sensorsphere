import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";

export interface MonitoringFeatureOptions {
  pool: Pool;
}

const checkTypeSchema = z.enum(["PING", "TCP", "HTTP", "HTTPS"]);
const targetModeSchema = z.enum(["PRIMARY_IP", "PRIMARY_FQDN", "PRIMARY_ADDRESS", "CUSTOM"]);
const identityTargetPattern = /^\{\{identity:([^:}]+):([^}]+)\}\}$/i;
const executionModeSchema = z.enum(["FAILOVER", "ALL"]);
const resultStatusSchema = z.enum(["UP", "DOWN", "UNKNOWN"]);

const agentCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  labels: z.record(z.string(), z.string()).optional(),
  heartbeatTimeoutSeconds: z.number().int().min(15).max(3600).optional()
}).strict();

const agentUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  enabled: z.boolean().optional(),
  labels: z.record(z.string(), z.string()).optional(),
  heartbeatTimeoutSeconds: z.number().int().min(15).max(3600).optional()
}).strict().refine(value => Object.keys(value).length > 0, "At least one field is required");

const assignmentSchema = z.object({
  agentId: z.string().uuid(),
  priority: z.number().int().min(0).max(100000).optional(),
  enabled: z.boolean().optional()
}).strict();

const checkBaseSchema = z.object({
  deviceId: z.string().uuid(),
  name: z.string().trim().min(1).max(300),
  enabled: z.boolean().optional(),
  checkType: checkTypeSchema,
  targetMode: targetModeSchema,
  targetValue: z.string().trim().max(1000).nullable().optional(),
  port: z.number().int().min(1).max(65535).nullable().optional(),
  path: z.string().trim().max(2000).nullable().optional(),
  intervalSeconds: z.number().int().min(5).max(86400),
  timeoutSeconds: z.number().int().min(1).max(300),
  failureThreshold: z.number().int().min(1).max(100),
  recoveryThreshold: z.number().int().min(1).max(100),
  executionMode: executionModeSchema,
  assignments: z.array(assignmentSchema).min(1).max(100),
  config: z.record(z.string(), z.unknown()).optional()
}).strict().superRefine((value, context) => {
  if (value.targetMode === "CUSTOM" && !value.targetValue) {
    context.addIssue({ code: "custom", message: "Custom target is required", path: ["targetValue"] });
  }
  if (value.targetMode === "CUSTOM" && value.targetValue?.startsWith("{{identity:") && !identityTargetPattern.test(value.targetValue)) {
    context.addIssue({ code: "custom", message: "Invalid identity target. Expected {{identity:TYPE:LABEL}}", path: ["targetValue"] });
  }
  if ((value.checkType === "TCP" || value.checkType === "HTTP" || value.checkType === "HTTPS") && value.port == null) {
    context.addIssue({ code: "custom", message: "Port is required for this check type", path: ["port"] });
  }
  const ids = value.assignments.map(item => item.agentId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "An agent can only be assigned once", path: ["assignments"] });
  }
});

const checkUpdateSchema = z.object({
  deviceId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(300).optional(),
  enabled: z.boolean().optional(),
  checkType: checkTypeSchema.optional(),
  targetMode: targetModeSchema.optional(),
  targetValue: z.string().trim().max(1000).nullable().optional(),
  port: z.number().int().min(1).max(65535).nullable().optional(),
  path: z.string().trim().max(2000).nullable().optional(),
  intervalSeconds: z.number().int().min(5).max(86400).optional(),
  timeoutSeconds: z.number().int().min(1).max(300).optional(),
  failureThreshold: z.number().int().min(1).max(100).optional(),
  recoveryThreshold: z.number().int().min(1).max(100).optional(),
  executionMode: executionModeSchema.optional(),
  assignments: z.array(assignmentSchema).min(1).max(100).optional(),
  config: z.record(z.string(), z.unknown()).optional()
}).strict().refine(value => Object.keys(value).length > 0, "At least one field is required");

const heartbeatSchema = z.object({
  version: z.string().trim().max(200).nullable().optional(),
  hostname: z.string().trim().max(500).nullable().optional(),
  labels: z.record(z.string(), z.string()).optional()
}).strict();

const resultSchema = z.object({
  checkId: z.string().uuid(),
  status: resultStatusSchema,
  startedAt: z.string().datetime({ offset: true }).optional(),
  finishedAt: z.string().datetime({ offset: true }).optional(),
  latencyMs: z.number().min(0).nullable().optional(),
  message: z.string().max(5000).nullable().optional()
}).strict();

const resultsSchema = z.object({ results: z.array(resultSchema).min(1).max(1000) }).strict();

interface AgentRow {
  id: string;
  name: string;
  enabled: boolean;
  labels: Record<string, string>;
  version: string | null;
  hostname: string | null;
  last_ip: string | null;
  last_seen_at: Date | null;
  heartbeat_timeout_seconds: number;
  config_revision: string | number;
  created_at: Date;
  updated_at: Date;
}

interface CheckRow {
  id: string;
  device_id: string;
  device_name: string;
  name: string;
  enabled: boolean;
  check_type: "PING" | "TCP" | "HTTP" | "HTTPS";
  target_mode: "PRIMARY_IP" | "PRIMARY_FQDN" | "PRIMARY_ADDRESS" | "CUSTOM";
  target_value: string | null;
  port: number | null;
  path: string | null;
  interval_seconds: number;
  timeout_seconds: number;
  failure_threshold: number;
  recovery_threshold: number;
  execution_mode: "FAILOVER" | "ALL";
  config: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface AssignmentRow {
  check_id: string;
  agent_id: string;
  agent_name: string;
  enabled: boolean;
  priority: number;
  agent_enabled: boolean;
  agent_last_seen_at: Date | null;
  heartbeat_timeout_seconds: number;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateToken(): string {
  return `ssma_${randomBytes(32).toString("base64url")}`;
}

function requestIp(request: FastifyRequest): string | null {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0]?.trim() ?? null;
  return request.ip ?? null;
}

function agentDto(row: AgentRow) {
  const timeoutMs = row.heartbeat_timeout_seconds * 1000;
  const online = row.enabled && row.last_seen_at != null && Date.now() - row.last_seen_at.getTime() <= timeoutMs;
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    labels: row.labels ?? {},
    version: row.version,
    hostname: row.hostname,
    lastIp: row.last_ip,
    lastSeenAt: row.last_seen_at?.toISOString() ?? null,
    heartbeatTimeoutSeconds: row.heartbeat_timeout_seconds,
    configRevision: Number(row.config_revision),
    online,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

async function authenticateAgent(pool: Pool, request: FastifyRequest): Promise<AgentRow | null> {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  if (!token.startsWith("ssma_")) return null;
  const result = await pool.query<AgentRow>(
    `SELECT * FROM monitoring_agents WHERE token_hash = $1 AND enabled = TRUE`,
    [hashToken(token)]
  );
  return result.rows[0] ?? null;
}

async function bumpAgentRevisions(client: PoolClient, agentIds: string[]): Promise<void> {
  const unique = [...new Set(agentIds)];
  if (unique.length === 0) return;
  await client.query(
    `UPDATE monitoring_agents SET config_revision = config_revision + 1, updated_at = NOW() WHERE id = ANY($1::uuid[])`,
    [unique]
  );
}

async function loadAssignments(pool: Pool, checkIds: string[]): Promise<Map<string, AssignmentRow[]>> {
  const map = new Map<string, AssignmentRow[]>();
  if (checkIds.length === 0) return map;
  const result = await pool.query<AssignmentRow>(
    `SELECT ca.check_id, ca.agent_id, a.name AS agent_name, ca.enabled, ca.priority,
            a.enabled AS agent_enabled, a.last_seen_at AS agent_last_seen_at,
            a.heartbeat_timeout_seconds
       FROM monitoring_check_agents ca
       JOIN monitoring_agents a ON a.id = ca.agent_id
      WHERE ca.check_id = ANY($1::uuid[])
      ORDER BY ca.check_id, ca.priority, a.name`,
    [checkIds]
  );
  for (const row of result.rows) {
    const rows = map.get(row.check_id) ?? [];
    rows.push(row);
    map.set(row.check_id, rows);
  }
  return map;
}

async function loadStates(pool: Pool, checkIds: string[]): Promise<Map<string, Array<Record<string, unknown>>>> {
  const map = new Map<string, Array<Record<string, unknown>>>();
  if (checkIds.length === 0) return map;
  const result = await pool.query(
    `SELECT s.check_id, s.agent_id, a.name AS agent_name, s.status, s.latency_ms, s.message,
            s.last_check_at, s.last_success_at, s.last_failure_at,
            s.consecutive_successes, s.consecutive_failures
       FROM monitoring_check_states s
       JOIN monitoring_agents a ON a.id = s.agent_id
      WHERE s.check_id = ANY($1::uuid[])
      ORDER BY a.name`,
    [checkIds]
  );
  for (const row of result.rows) {
    const rows = map.get(row.check_id) ?? [];
    rows.push({
      agentId: row.agent_id,
      agentName: row.agent_name,
      status: row.status,
      latencyMs: row.latency_ms,
      message: row.message,
      lastCheckAt: row.last_check_at?.toISOString?.() ?? null,
      lastSuccessAt: row.last_success_at?.toISOString?.() ?? null,
      lastFailureAt: row.last_failure_at?.toISOString?.() ?? null,
      consecutiveSuccesses: row.consecutive_successes,
      consecutiveFailures: row.consecutive_failures
    });
    map.set(row.check_id, rows);
  }
  return map;
}

function checkDto(row: CheckRow, assignments: AssignmentRow[], states: Array<Record<string, unknown>>) {
  return {
    id: row.id,
    deviceId: row.device_id,
    deviceName: row.device_name,
    name: row.name,
    enabled: row.enabled,
    checkType: row.check_type,
    targetMode: row.target_mode,
    targetValue: row.target_value,
    port: row.port,
    path: row.path,
    intervalSeconds: row.interval_seconds,
    timeoutSeconds: row.timeout_seconds,
    failureThreshold: row.failure_threshold,
    recoveryThreshold: row.recovery_threshold,
    executionMode: row.execution_mode,
    config: row.config ?? {},
    assignments: assignments.map(item => ({
      agentId: item.agent_id,
      agentName: item.agent_name,
      enabled: item.enabled,
      priority: item.priority
    })),
    states,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

async function resolveTarget(pool: Pool, check: CheckRow): Promise<string | null> {
  const identities = await pool.query<{ identity_type: string; value: string; is_primary: boolean; sort_order: number; label_code: string | null; source: string | null }>(
    `SELECT identity_type, value, is_primary, sort_order,
            to_jsonb(device_registry_identities)->>'label_code' AS label_code,
            source
       FROM device_registry_identities
      WHERE device_id = $1
        AND UPPER(identity_type) IN ('IP', 'FQDN', 'HOSTNAME')
      ORDER BY is_primary DESC, sort_order, created_at`,
    [check.device_id]
  );
  const find = (types: string[]) => identities.rows.find(row => types.includes(row.identity_type.toUpperCase()))?.value ?? null;
  if (check.target_mode === "CUSTOM") {
    const value = check.target_value?.trim() ?? "";
    const match = identityTargetPattern.exec(value);
    if (!match) return value || null;
    const identityType = match[1]!.trim().toUpperCase();
    const identityLabel = match[2]!.trim().toUpperCase();
    return identities.rows.find(row =>
      row.identity_type.toUpperCase() === identityType &&
      [row.label_code, row.source].some(candidate => candidate?.trim().toUpperCase() === identityLabel)
    )?.value ?? null;
  }
  if (check.target_mode === "PRIMARY_IP") return find(["IP"]);
  if (check.target_mode === "PRIMARY_FQDN") return find(["FQDN", "HOSTNAME"]);
  return find(["IP"]) ?? find(["FQDN", "HOSTNAME"]);
}

async function replaceAssignments(client: PoolClient, checkId: string, assignments: z.infer<typeof assignmentSchema>[]): Promise<string[]> {
  const old = await client.query<{ agent_id: string }>(`SELECT agent_id FROM monitoring_check_agents WHERE check_id = $1`, [checkId]);
  await client.query(`DELETE FROM monitoring_check_agents WHERE check_id = $1`, [checkId]);
  for (let index = 0; index < assignments.length; index += 1) {
    const assignment = assignments[index]!;
    await client.query(
      `INSERT INTO monitoring_check_agents (check_id, agent_id, enabled, priority)
       VALUES ($1, $2, $3, $4)`,
      [checkId, assignment.agentId, assignment.enabled ?? true, assignment.priority ?? ((index + 1) * 10)]
    );
  }
  return [...old.rows.map(row => row.agent_id), ...assignments.map(item => item.agentId)];
}

export async function registerMonitoringFeature(app: FastifyInstance, options: MonitoringFeatureOptions): Promise<void> {
  const { pool } = options;

  app.get("/api/v1/monitoring/agents", async () => {
    const result = await pool.query<AgentRow>(`SELECT * FROM monitoring_agents ORDER BY name`);
    return result.rows.map(agentDto);
  });

  app.post("/api/v1/monitoring/agents", async (request, reply) => {
    const input = agentCreateSchema.parse(request.body);
    const token = generateToken();
    const result = await pool.query<AgentRow>(
      `INSERT INTO monitoring_agents (name, token_hash, labels, heartbeat_timeout_seconds)
       VALUES ($1, $2, $3::jsonb, $4)
       RETURNING *`,
      [input.name, hashToken(token), JSON.stringify(input.labels ?? {}), input.heartbeatTimeoutSeconds ?? 90]
    );
    reply.code(201);
    return { agent: agentDto(result.rows[0]!), token };
  });

  app.patch("/api/v1/monitoring/agents/:id", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = agentUpdateSchema.parse(request.body);
    const current = await pool.query<AgentRow>(`SELECT * FROM monitoring_agents WHERE id = $1`, [params.id]);
    if (!current.rows[0]) return reply.code(404).send({ error: "Monitoring agent not found" });
    const row = current.rows[0];
    const result = await pool.query<AgentRow>(
      `UPDATE monitoring_agents
          SET name = $2, enabled = $3, labels = $4::jsonb,
              heartbeat_timeout_seconds = $5, updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [params.id, input.name ?? row.name, input.enabled ?? row.enabled, JSON.stringify(input.labels ?? row.labels ?? {}), input.heartbeatTimeoutSeconds ?? row.heartbeat_timeout_seconds]
    );
    return agentDto(result.rows[0]!);
  });

  app.post("/api/v1/monitoring/agents/:id/regenerate-token", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const token = generateToken();
    const result = await pool.query<AgentRow>(
      `UPDATE monitoring_agents SET token_hash = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [params.id, hashToken(token)]
    );
    if (!result.rows[0]) return reply.code(404).send({ error: "Monitoring agent not found" });
    return { agent: agentDto(result.rows[0]), token };
  });

  app.delete("/api/v1/monitoring/agents/:id", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await pool.query(`DELETE FROM monitoring_agents WHERE id = $1`, [params.id]);
    if (result.rowCount === 0) return reply.code(404).send({ error: "Monitoring agent not found" });
    return reply.code(204).send();
  });

  app.get("/api/v1/monitoring/checks", async (request) => {
    const query = z.object({ deviceId: z.string().uuid().optional() }).parse(request.query);
    const values: unknown[] = [];
    let where = "";
    if (query.deviceId) { values.push(query.deviceId); where = `WHERE c.device_id = $${values.length}`; }
    const result = await pool.query<CheckRow>(
      `SELECT c.*, d.name AS device_name
         FROM monitoring_checks c
         JOIN device_registry_devices d ON d.id = c.device_id
         ${where}
        ORDER BY d.name, c.name`,
      values
    );
    const ids = result.rows.map(row => row.id);
    const [assignmentMap, stateMap] = await Promise.all([loadAssignments(pool, ids), loadStates(pool, ids)]);
    return result.rows.map(row => checkDto(row, assignmentMap.get(row.id) ?? [], stateMap.get(row.id) ?? []));
  });

  app.post("/api/v1/monitoring/checks", async (request, reply) => {
    const input = checkBaseSchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<CheckRow>(
        `INSERT INTO monitoring_checks
          (device_id, name, enabled, check_type, target_mode, target_value, port, path,
           interval_seconds, timeout_seconds, failure_threshold, recovery_threshold, execution_mode, config)
         SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb
         FROM device_registry_devices d WHERE d.id = $1
         RETURNING *, (SELECT name FROM device_registry_devices WHERE id = $1) AS device_name`,
        [input.deviceId, input.name, input.enabled ?? true, input.checkType, input.targetMode, input.targetValue ?? null,
         input.port ?? null, input.path ?? null, input.intervalSeconds, input.timeoutSeconds, input.failureThreshold,
         input.recoveryThreshold, input.executionMode, JSON.stringify(input.config ?? {})]
      );
      if (!result.rows[0]) { await client.query("ROLLBACK"); return reply.code(404).send({ error: "Device not found" }); }
      const affected = await replaceAssignments(client, result.rows[0].id, input.assignments);
      await bumpAgentRevisions(client, affected);
      await client.query("COMMIT");
      reply.code(201);
      const assignments = await loadAssignments(pool, [result.rows[0].id]);
      return checkDto(result.rows[0], assignments.get(result.rows[0].id) ?? [], []);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  });

  app.patch("/api/v1/monitoring/checks/:id", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = checkUpdateSchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<CheckRow>(
        `SELECT c.*, d.name AS device_name FROM monitoring_checks c JOIN device_registry_devices d ON d.id=c.device_id WHERE c.id=$1`,
        [params.id]
      );
      if (!current.rows[0]) { await client.query("ROLLBACK"); return reply.code(404).send({ error: "Monitoring check not found" }); }
      const row = current.rows[0];
      const result = await client.query<CheckRow>(
        `UPDATE monitoring_checks SET
          device_id=$2,name=$3,enabled=$4,check_type=$5,target_mode=$6,target_value=$7,port=$8,path=$9,
          interval_seconds=$10,timeout_seconds=$11,failure_threshold=$12,recovery_threshold=$13,execution_mode=$14,
          config=$15::jsonb,updated_at=NOW()
         WHERE id=$1
         RETURNING *, (SELECT name FROM device_registry_devices WHERE id=$2) AS device_name`,
        [params.id, input.deviceId ?? row.device_id, input.name ?? row.name, input.enabled ?? row.enabled,
         input.checkType ?? row.check_type, input.targetMode ?? row.target_mode,
         input.targetValue !== undefined ? input.targetValue : row.target_value,
         input.port !== undefined ? input.port : row.port, input.path !== undefined ? input.path : row.path,
         input.intervalSeconds ?? row.interval_seconds, input.timeoutSeconds ?? row.timeout_seconds,
         input.failureThreshold ?? row.failure_threshold, input.recoveryThreshold ?? row.recovery_threshold,
         input.executionMode ?? row.execution_mode, JSON.stringify(input.config ?? row.config ?? {})]
      );
      let affected: string[] = [];
      if (input.assignments) affected = await replaceAssignments(client, params.id, input.assignments);
      else {
        const assigned = await client.query<{ agent_id: string }>(`SELECT agent_id FROM monitoring_check_agents WHERE check_id=$1`, [params.id]);
        affected = assigned.rows.map(item => item.agent_id);
      }
      await bumpAgentRevisions(client, affected);
      await client.query("COMMIT");
      const assignments = await loadAssignments(pool, [params.id]);
      const states = await loadStates(pool, [params.id]);
      return checkDto(result.rows[0]!, assignments.get(params.id) ?? [], states.get(params.id) ?? []);
    } catch (error) {
      await client.query("ROLLBACK"); throw error;
    } finally { client.release(); }
  });

  app.delete("/api/v1/monitoring/checks/:id", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const assigned = await client.query<{ agent_id: string }>(`SELECT agent_id FROM monitoring_check_agents WHERE check_id=$1`, [params.id]);
      const result = await client.query(`DELETE FROM monitoring_checks WHERE id=$1`, [params.id]);
      if (result.rowCount === 0) { await client.query("ROLLBACK"); return reply.code(404).send({ error: "Monitoring check not found" }); }
      await bumpAgentRevisions(client, assigned.rows.map(item => item.agent_id));
      await client.query("COMMIT");
      return reply.code(204).send();
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  });

  app.post("/api/v1/monitoring/agent/heartbeat", async (request, reply) => {
    const agent = await authenticateAgent(pool, request);
    if (!agent) return reply.code(401).send({ error: "Invalid monitoring agent token" });
    const input = heartbeatSchema.parse(request.body ?? {});
    const result = await pool.query<AgentRow>(
      `UPDATE monitoring_agents SET last_seen_at=NOW(), last_ip=$2, version=COALESCE($3,version),
              hostname=COALESCE($4,hostname), labels=CASE WHEN $5::jsonb='{}'::jsonb THEN labels ELSE $5::jsonb END,
              updated_at=NOW() WHERE id=$1 RETURNING *`,
      [agent.id, requestIp(request), input.version ?? null, input.hostname ?? null, JSON.stringify(input.labels ?? {})]
    );
    return { agentId: agent.id, configRevision: Number(result.rows[0]!.config_revision), serverTime: new Date().toISOString() };
  });

  app.get("/api/v1/monitoring/agent/checks", async (request, reply) => {
    const agent = await authenticateAgent(pool, request);
    if (!agent) return reply.code(401).send({ error: "Invalid monitoring agent token" });
    await pool.query(`UPDATE monitoring_agents SET last_seen_at=NOW(), last_ip=$2, updated_at=NOW() WHERE id=$1`, [agent.id, requestIp(request)]);
    const result = await pool.query<CheckRow>(
      `SELECT c.*, d.name AS device_name
         FROM monitoring_checks c
         JOIN device_registry_devices d ON d.id=c.device_id
         JOIN monitoring_check_agents own ON own.check_id=c.id AND own.agent_id=$1 AND own.enabled=TRUE
        WHERE c.enabled=TRUE
        ORDER BY c.name`,
      [agent.id]
    );
    const assignmentMap = await loadAssignments(pool, result.rows.map(row => row.id));
    const checks: Array<Record<string, unknown>> = [];
    const now = Date.now();
    for (const check of result.rows) {
      const assignments = (assignmentMap.get(check.id) ?? []).filter(item => item.enabled && item.agent_enabled);
      let selected = check.execution_mode === "ALL";
      if (check.execution_mode === "FAILOVER") {
        const active = assignments.find(item => item.agent_last_seen_at != null && now - item.agent_last_seen_at.getTime() <= item.heartbeat_timeout_seconds * 1000);
        selected = active?.agent_id === agent.id;
      }
      if (!selected) continue;
      const target = await resolveTarget(pool, check);
      checks.push({
        id: check.id,
        deviceId: check.device_id,
        deviceName: check.device_name,
        name: check.name,
        type: check.check_type,
        target,
        targetMode: check.target_mode,
        port: check.port,
        path: check.path,
        intervalSeconds: check.interval_seconds,
        timeoutSeconds: check.timeout_seconds,
        failureThreshold: check.failure_threshold,
        recoveryThreshold: check.recovery_threshold,
        config: check.config ?? {}
      });
    }
    const revision = await pool.query<{ config_revision: string | number }>(`SELECT config_revision FROM monitoring_agents WHERE id=$1`, [agent.id]);
    return { agentId: agent.id, revision: Number(revision.rows[0]?.config_revision ?? 1), checks };
  });

  app.post("/api/v1/monitoring/agent/results", async (request, reply) => {
    const agent = await authenticateAgent(pool, request);
    if (!agent) return reply.code(401).send({ error: "Invalid monitoring agent token" });
    const input = resultsSchema.parse(request.body);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`UPDATE monitoring_agents SET last_seen_at=NOW(), last_ip=$2, updated_at=NOW() WHERE id=$1`, [agent.id, requestIp(request)]);
      let accepted = 0;
      for (const result of input.results) {
        const assignment = await client.query(
          `SELECT 1 FROM monitoring_check_agents ca JOIN monitoring_checks c ON c.id=ca.check_id
            WHERE ca.check_id=$1 AND ca.agent_id=$2 AND ca.enabled=TRUE AND c.enabled=TRUE`,
          [result.checkId, agent.id]
        );
        if (assignment.rowCount === 0) continue;
        const previous = await client.query<{ status: "UP" | "DOWN" | "UNKNOWN"; consecutive_successes: number; consecutive_failures: number }>(
          `SELECT status, consecutive_successes, consecutive_failures FROM monitoring_check_states WHERE check_id=$1 AND agent_id=$2`,
          [result.checkId, agent.id]
        );
        const previousStatus = previous.rows[0]?.status ?? "UNKNOWN";
        const successes = result.status === "UP" ? (previous.rows[0]?.consecutive_successes ?? 0) + 1 : 0;
        const failures = result.status === "DOWN" ? (previous.rows[0]?.consecutive_failures ?? 0) + 1 : 0;
        const checkedAt = result.finishedAt ?? result.startedAt ?? new Date().toISOString();
        await client.query(
          `INSERT INTO monitoring_check_states
             (check_id,agent_id,status,latency_ms,message,last_check_at,last_success_at,last_failure_at,consecutive_successes,consecutive_failures)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (check_id,agent_id) DO UPDATE SET
             status=EXCLUDED.status,latency_ms=EXCLUDED.latency_ms,message=EXCLUDED.message,last_check_at=EXCLUDED.last_check_at,
             last_success_at=COALESCE(EXCLUDED.last_success_at,monitoring_check_states.last_success_at),
             last_failure_at=COALESCE(EXCLUDED.last_failure_at,monitoring_check_states.last_failure_at),
             consecutive_successes=EXCLUDED.consecutive_successes,consecutive_failures=EXCLUDED.consecutive_failures,updated_at=NOW()`,
          [result.checkId, agent.id, result.status, result.latencyMs ?? null, result.message ?? null, checkedAt,
           result.status === "UP" ? checkedAt : null, result.status === "DOWN" ? checkedAt : null, successes, failures]
        );
        if (result.status !== previousStatus) {
          await client.query(
            `INSERT INTO monitoring_state_transitions (check_id,agent_id,previous_status,status,message,latency_ms,occurred_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [result.checkId, agent.id, previousStatus, result.status, result.message ?? null, result.latencyMs ?? null, checkedAt]
          );
        }
        accepted += 1;
      }
      await client.query("COMMIT");
      return { accepted };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  });
}
