import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";

export interface DeviceControlFeatureOptions {
  pool: Pool;
}

const providerSchema = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
const actionSchema = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);

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

const commandCreateSchema = z.object({
  deviceId: z.string().uuid(),
  action: actionSchema,
  parameters: z.record(z.string(), z.unknown()).optional(),
  ttlSeconds: z.number().int().min(1).max(300).optional()
}).strict();

const helloMessageSchema = z.object({
  type: z.literal("HELLO"),
  agentName: z.string().trim().min(1).max(200).optional(),
  version: z.string().trim().max(200).nullable().optional(),
  hostname: z.string().trim().max(500).nullable().optional(),
  agentLabels: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
  capabilities: z.array(z.object({
    provider: providerSchema,
    actions: z.array(actionSchema).max(200)
  }).strict()).max(100).optional()
}).strict();

const heartbeatMessageSchema = z.object({ type: z.literal("HEARTBEAT") }).strict();

const commandResultMessageSchema = z.object({
  type: z.literal("COMMAND_RESULT"),
  commandId: z.string().uuid(),
  status: z.enum(["SUCCESS", "FAILED", "TIMEOUT", "REJECTED"]),
  result: z.record(z.string(), z.unknown()).nullable().optional(),
  error: z.string().max(5000).nullable().optional()
}).strict();

const deviceStateMessageSchema = z.object({
  type: z.literal("DEVICE_STATE"),
  deviceId: z.string().uuid(),
  provider: providerSchema,
  state: z.record(z.string(), z.unknown())
}).strict();

const discoverResultMessageSchema = z.object({
  type: z.literal("DISCOVER_RESULT"),
  commandId: z.string().uuid(),
  provider: providerSchema,
  devices: z.array(z.record(z.string(), z.unknown())).max(1000)
}).strict();

const agentMessageSchema = z.discriminatedUnion("type", [
  helloMessageSchema,
  heartbeatMessageSchema,
  commandResultMessageSchema,
  deviceStateMessageSchema,
  discoverResultMessageSchema
]);

interface AgentRow {
  id: string;
  name: string;
  enabled: boolean;
  labels: Record<string, string>;
  agent_labels: string[];
  reported_name: string | null;
  version: string | null;
  hostname: string | null;
  capabilities: Array<{ provider: string; actions: string[] }>;
  last_seen_at: Date | null;
  heartbeat_timeout_seconds: number;
  created_at: Date;
  updated_at: Date;
}

interface DeviceControlRow {
  id: string;
  control_agent_id: string | null;
  control_provider: string | null;
  agent_enabled: boolean | null;
  agent_capabilities: Array<{ provider: string; actions: string[] }> | null;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateToken(): string {
  return `ssda_${randomBytes(32).toString("base64url")}`;
}

function agentDto(row: AgentRow, connected: boolean) {
  const timeoutMs = row.heartbeat_timeout_seconds * 1000;
  const recent = row.last_seen_at != null && Date.now() - row.last_seen_at.getTime() <= timeoutMs;
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    labels: row.labels ?? {},
    agentLabels: Array.isArray(row.agent_labels) ? row.agent_labels : [],
    reportedName: row.reported_name,
    version: row.version,
    hostname: row.hostname,
    capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
    lastSeenAt: row.last_seen_at?.toISOString() ?? null,
    heartbeatTimeoutSeconds: row.heartbeat_timeout_seconds,
    online: row.enabled && connected && recent,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

async function authenticateAgent(pool: Pool, request: IncomingMessage): Promise<AgentRow | null> {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  if (!token.startsWith("ssda_")) return null;
  const result = await pool.query<AgentRow>(
    "SELECT * FROM device_agents WHERE token_hash = $1 AND enabled = TRUE",
    [hashToken(token)]
  );
  return result.rows[0] ?? null;
}

export async function registerDeviceControlFeature(
  app: FastifyInstance,
  { pool }: DeviceControlFeatureOptions
): Promise<void> {
  const sockets = new Map<string, WebSocket>();
  const wss = new WebSocketServer({ noServer: true });

  const sendPendingCommands = async (agentId: string, socket: WebSocket) => {
    const result = await pool.query<{
      id: string;
      device_id: string;
      device_name: string;
      provider: string;
      action: string;
      parameters: Record<string, unknown>;
      expires_at: Date;
      identities: Array<{
        identityType: string;
        value: string;
        source: string | null;
        labelCode: string | null;
        label: string | null;
        isPrimary: boolean;
        sortOrder: number;
      }>;
    }>(`
      SELECT
        c.id, c.device_id, d.name AS device_name, c.provider, c.action, c.parameters, c.expires_at,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'identityType', i.identity_type,
              'value', i.value,
              'source', i.source,
              'labelCode', i.label_code,
              'label', COALESCE(il.label, i.label),
              'isPrimary', i.is_primary,
              'sortOrder', i.sort_order
            )
            ORDER BY i.identity_type, i.is_primary DESC, i.sort_order, i.value
          ) FILTER (WHERE i.id IS NOT NULL),
          '[]'::jsonb
        ) AS identities
      FROM device_control_commands c
      JOIN device_registry_devices d ON d.id = c.device_id
      LEFT JOIN device_registry_identities i ON i.device_id = c.device_id
      LEFT JOIN device_identity_labels il ON il.code = i.label_code
      WHERE c.agent_id = $1 AND c.status = 'PENDING' AND c.expires_at > NOW()
      GROUP BY c.id, c.device_id, d.name, c.provider, c.action, c.parameters, c.expires_at, c.created_at
      ORDER BY c.created_at, c.id
    `, [agentId]);

    for (const command of result.rows) {
      if (socket.readyState !== WebSocket.OPEN) break;
      socket.send(JSON.stringify({
        type: "COMMAND",
        commandId: command.id,
        deviceId: command.device_id,
        deviceName: command.device_name,
        target: { identities: command.identities ?? [] },
        provider: command.provider,
        action: command.action,
        parameters: command.parameters ?? {},
        expiresAt: command.expires_at.toISOString()
      }));
      await pool.query(
        "UPDATE device_control_commands SET status='SENT', sent_at=NOW(), updated_at=NOW() WHERE id=$1 AND status='PENDING'",
        [command.id]
      );
    }
  };

  const handleConnection = (socket: WebSocket, agent: AgentRow) => {
    const previous = sockets.get(agent.id);
    if (previous && previous !== socket) previous.close(4001, "Replaced by a newer connection");
    sockets.set(agent.id, socket);
    void pool.query("UPDATE device_agents SET last_seen_at=NOW(), updated_at=NOW() WHERE id=$1", [agent.id]);
    void sendPendingCommands(agent.id, socket);

    socket.on("message", data => {
      void (async () => {
        let raw: unknown;
        try {
          raw = JSON.parse(data.toString());
        } catch {
          socket.send(JSON.stringify({ type: "ERROR", error: "Invalid JSON" }));
          return;
        }
        const parsed = agentMessageSchema.safeParse(raw);
        if (!parsed.success) {
          socket.send(JSON.stringify({ type: "ERROR", error: parsed.error.issues[0]?.message ?? "Invalid message" }));
          return;
        }
        const message = parsed.data;
        if (message.type === "HELLO") {
          const labels = [...new Set((message.agentLabels ?? []).map(value => value.trim()).filter(Boolean))];
          await pool.query(`
            UPDATE device_agents SET
              reported_name=COALESCE($2,reported_name), version=COALESCE($3,version), hostname=COALESCE($4,hostname),
              agent_labels=$5::jsonb, capabilities=$6::jsonb, last_seen_at=NOW(), updated_at=NOW()
            WHERE id=$1
          `, [agent.id, message.agentName ?? null, message.version ?? null, message.hostname ?? null, JSON.stringify(labels), JSON.stringify(message.capabilities ?? [])]);
          socket.send(JSON.stringify({ type: "HELLO_ACK", agentId: agent.id, serverTime: new Date().toISOString() }));
          await sendPendingCommands(agent.id, socket);
          return;
        }
        if (message.type === "HEARTBEAT") {
          await pool.query("UPDATE device_agents SET last_seen_at=NOW(), updated_at=NOW() WHERE id=$1", [agent.id]);
          socket.send(JSON.stringify({ type: "HEARTBEAT_ACK", serverTime: new Date().toISOString() }));
          return;
        }
        if (message.type === "COMMAND_RESULT") {
          await pool.query(`
            UPDATE device_control_commands SET status=$3, result=$4::jsonb, error=$5, finished_at=NOW(), updated_at=NOW()
            WHERE id=$1 AND agent_id=$2
          `, [message.commandId, agent.id, message.status, JSON.stringify(message.result ?? {}), message.error ?? null]);
          return;
        }
        if (message.type === "DEVICE_STATE") {
          await pool.query(`
            INSERT INTO device_control_states (device_id, agent_id, provider, state, observed_at, updated_at)
            VALUES ($1,$2,$3,$4::jsonb,NOW(),NOW())
            ON CONFLICT (device_id) DO UPDATE SET
              agent_id=EXCLUDED.agent_id, provider=EXCLUDED.provider, state=EXCLUDED.state,
              observed_at=EXCLUDED.observed_at, updated_at=NOW()
          `, [message.deviceId, agent.id, message.provider, JSON.stringify(message.state)]);
          return;
        }
        if (message.type === "DISCOVER_RESULT") {
          await pool.query(`
            UPDATE device_control_commands SET status='SUCCESS', result=$3::jsonb, finished_at=NOW(), updated_at=NOW()
            WHERE id=$1 AND agent_id=$2
          `, [message.commandId, agent.id, JSON.stringify({ provider: message.provider, devices: message.devices })]);
        }
      })().catch(error => app.log.error({ err: error, agentId: agent.id }, "Device agent WebSocket message failed"));
    });

    socket.on("close", () => {
      if (sockets.get(agent.id) === socket) sockets.delete(agent.id);
    });
  };

  app.server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/api/v1/device-control/agent/ws") return;
    void (async () => {
      const agent = await authenticateAgent(pool, request);
      if (!agent) {
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, ws => {
        handleConnection(ws, agent);
      });
    })().catch(error => {
      app.log.error({ err: error }, "Device agent WebSocket upgrade failed");
      socket.destroy();
    });
  });

  app.addHook("onClose", async () => {
    for (const socket of sockets.values()) socket.close(1001, "Server shutting down");
    wss.close();
  });

  app.get("/api/v1/device-control/agents", async (_request, reply) => {
    const result = await pool.query<AgentRow>("SELECT * FROM device_agents ORDER BY LOWER(name), id");
    return reply.send(result.rows.map(row => agentDto(row, sockets.has(row.id))));
  });

  app.post("/api/v1/device-control/agents", async (request: FastifyRequest<{ Body: unknown }>, reply) => {
    const parsed = agentCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid device agent" });
    const input = parsed.data;
    const token = generateToken();
    const result = await pool.query<AgentRow>(`
      INSERT INTO device_agents (name, token_hash, labels, heartbeat_timeout_seconds)
      VALUES ($1,$2,$3::jsonb,$4) RETURNING *
    `, [input.name, hashToken(token), JSON.stringify(input.labels ?? {}), input.heartbeatTimeoutSeconds ?? 60]);
    return reply.code(201).send({ agent: agentDto(result.rows[0]!, false), token });
  });

  app.patch("/api/v1/device-control/agents/:id", async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply) => {
    const parsed = agentUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid device agent" });
    const input = parsed.data;
    const result = await pool.query<AgentRow>(`
      UPDATE device_agents SET
        name=COALESCE($2,name), enabled=COALESCE($3,enabled),
        labels=CASE WHEN $4 THEN $5::jsonb ELSE labels END,
        heartbeat_timeout_seconds=COALESCE($6,heartbeat_timeout_seconds), updated_at=NOW()
      WHERE id=$1 RETURNING *
    `, [request.params.id, input.name ?? null, input.enabled ?? null, Object.prototype.hasOwnProperty.call(input, "labels"), JSON.stringify(input.labels ?? {}), input.heartbeatTimeoutSeconds ?? null]);
    if (!result.rows[0]) return reply.code(404).send({ error: "Device agent not found" });
    if (input.enabled === false) sockets.get(request.params.id)?.close(4003, "Agent disabled");
    return reply.send(agentDto(result.rows[0], sockets.has(request.params.id)));
  });

  app.post("/api/v1/device-control/agents/:id/regenerate-token", async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const token = generateToken();
    const result = await pool.query<AgentRow>("UPDATE device_agents SET token_hash=$2, updated_at=NOW() WHERE id=$1 RETURNING *", [request.params.id, hashToken(token)]);
    if (!result.rows[0]) return reply.code(404).send({ error: "Device agent not found" });
    sockets.get(request.params.id)?.close(4002, "Token regenerated");
    return reply.send({ agent: agentDto(result.rows[0], false), token });
  });

  app.delete("/api/v1/device-control/agents/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    sockets.get(request.params.id)?.close(4004, "Agent deleted");
    const result = await pool.query("DELETE FROM device_agents WHERE id=$1", [request.params.id]);
    if ((result.rowCount ?? 0) === 0) return reply.code(404).send({ error: "Device agent not found" });
    return reply.code(204).send();
  });

  app.post("/api/v1/device-control/commands", async (request: FastifyRequest<{ Body: unknown }>, reply) => {
    const parsed = commandCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid device command" });
    const input = parsed.data;
    const deviceResult = await pool.query<DeviceControlRow>(`
      SELECT d.id, d.control_agent_id, d.control_provider, a.enabled AS agent_enabled, a.capabilities AS agent_capabilities
      FROM device_registry_devices d
      LEFT JOIN device_agents a ON a.id = d.control_agent_id
      WHERE d.id=$1
    `, [input.deviceId]);
    const device = deviceResult.rows[0];
    if (!device) return reply.code(404).send({ error: "Device not found" });
    if (!device.control_agent_id) return reply.code(409).send({ error: "Device has no control agent" });
    if (!device.control_provider) return reply.code(409).send({ error: "Device has no control provider" });
    if (!device.agent_enabled) return reply.code(409).send({ error: "Assigned Device Agent is disabled or unavailable" });
    const capabilities = Array.isArray(device.agent_capabilities) ? device.agent_capabilities : [];
    if (capabilities.length > 0) {
      const capability = capabilities.find(item => item.provider.toUpperCase() === device.control_provider!.toUpperCase());
      if (!capability) return reply.code(409).send({ error: `Assigned Device Agent does not advertise provider ${device.control_provider}` });
      if (!capability.actions.some(action => action.toUpperCase() === input.action.toUpperCase())) {
        return reply.code(409).send({ error: `Assigned Device Agent does not advertise action ${input.action}` });
      }
    }

    const commandId = randomUUID();
    const expiresAt = new Date(Date.now() + (input.ttlSeconds ?? 30) * 1000);
    await pool.query(`
      INSERT INTO device_control_commands (id, device_id, agent_id, provider, action, parameters, status, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,'PENDING',$7)
    `, [commandId, device.id, device.control_agent_id, device.control_provider, input.action, JSON.stringify(input.parameters ?? {}), expiresAt]);

    const socket = sockets.get(device.control_agent_id);
    if (socket?.readyState === WebSocket.OPEN) await sendPendingCommands(device.control_agent_id, socket);
    return reply.code(202).send({ commandId, status: socket?.readyState === WebSocket.OPEN ? "SENT" : "PENDING", expiresAt: expiresAt.toISOString() });
  });

  app.get("/api/v1/device-control/commands/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const result = await pool.query(`
      SELECT id, device_id AS "deviceId", agent_id AS "agentId", provider, action, parameters, status,
        result, error, expires_at AS "expiresAt", sent_at AS "sentAt", finished_at AS "finishedAt", created_at AS "createdAt"
      FROM device_control_commands WHERE id=$1
    `, [request.params.id]);
    if (!result.rows[0]) return reply.code(404).send({ error: "Device command not found" });
    return reply.send(result.rows[0]);
  });

  app.get("/api/v1/device-control/devices/:id/state", async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const result = await pool.query(`
      SELECT device_id AS "deviceId", agent_id AS "agentId", provider, state, observed_at AS "observedAt"
      FROM device_control_states WHERE device_id=$1
    `, [request.params.id]);
    return reply.send(result.rows[0] ?? null);
  });
}
