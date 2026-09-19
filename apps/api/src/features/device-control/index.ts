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

const discoveryCreateSchema = z.object({
  provider: providerSchema,
  timeoutSeconds: z.number().int().min(1).max(15).optional()
}).strict();

const discoveryDiscardSchema = z.object({
  provider: providerSchema,
  identityKey: z.string().trim().min(1).max(500),
  label: z.string().trim().max(500).nullable().optional(),
  discarded: z.boolean()
}).strict();

const discoveredDeviceActionCreateSchema = z.object({
  provider: providerSchema,
  action: actionSchema,
  target: z.record(z.string(), z.unknown()),
  parameters: z.record(z.string(), z.unknown()).optional(),
  timeoutSeconds: z.number().int().min(1).max(30).optional()
}).strict();

const commandCreateSchema = z.object({
  deviceId: z.string().uuid(),
  action: actionSchema,
  parameters: z.record(z.string(), z.unknown()).optional(),
  ttlSeconds: z.number().int().min(1).max(300).optional()
}).strict();

const agentUpdateRequestSchema = z.object({
  version: z.string().trim().min(1).max(100).regex(/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/, "Invalid Device Agent version")
}).strict();

const helloMessageSchema = z.object({
  type: z.literal("HELLO"),
  agentName: z.string().trim().min(1).max(200).optional(),
  version: z.string().trim().max(200).nullable().optional(),
  hostname: z.string().trim().max(500).nullable().optional(),
  systemInfo: z.object({
    os: z.string().trim().min(1).max(200),
    osVersion: z.string().trim().min(1).max(300),
    architecture: z.string().trim().min(1).max(100)
  }).strict().optional(),
  agentLabels: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
  capabilities: z.array(z.object({
    provider: providerSchema,
    actions: z.array(actionSchema).max(200),
    discovery: z.boolean().optional()
  }).strict()).max(100).optional(),
  agentUpdate: z.object({
    supported: z.boolean()
  }).strict().optional()
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
  status: z.enum(["SUCCESS", "FAILED"]).optional(),
  devices: z.array(z.record(z.string(), z.unknown())).max(1000),
  error: z.string().max(5000).nullable().optional()
}).strict();

const discoveredDeviceActionResultMessageSchema = z.object({
  type: z.literal("DISCOVERED_DEVICE_ACTION_RESULT"),
  commandId: z.string().uuid(),
  provider: providerSchema,
  action: actionSchema,
  status: z.enum(["SUCCESS", "FAILED"]),
  result: z.record(z.string(), z.unknown()).nullable().optional(),
  error: z.string().max(5000).nullable().optional()
}).strict();

const agentUpdateResultMessageSchema = z.object({
  type: z.literal("AGENT_UPDATE_RESULT"),
  commandId: z.string().uuid(),
  status: z.enum(["ACCEPTED", "SUCCESS", "FAILED", "REJECTED"]),
  currentVersion: z.string().trim().max(100).optional(),
  targetVersion: z.string().trim().max(100).optional(),
  result: z.unknown().optional(),
  error: z.string().max(5000).nullable().optional()
}).strict();

const agentMessageSchema = z.discriminatedUnion("type", [
  helloMessageSchema,
  heartbeatMessageSchema,
  commandResultMessageSchema,
  deviceStateMessageSchema,
  discoverResultMessageSchema,
  discoveredDeviceActionResultMessageSchema,
  agentUpdateResultMessageSchema
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
  os_name: string | null;
  os_version: string | null;
  architecture: string | null;
  capabilities: Array<{ provider: string; actions: string[]; discovery?: boolean }>;
  supervisor_available: boolean;
  desired_version: string | null;
  previous_version: string | null;
  update_status: string;
  update_command_id: string | null;
  update_requested_at: Date | null;
  update_started_at: Date | null;
  update_finished_at: Date | null;
  update_error: string | null;
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
  agent_capabilities: Array<{ provider: string; actions: string[]; discovery?: boolean }> | null;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generateToken(): string {
  return `ssda_${randomBytes(32).toString("base64url")}`;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readPower(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["on", "true", "1"].includes(normalized)) return true;
    if (["off", "false", "0"].includes(normalized)) return false;
  }
  if (typeof value === "number") return value !== 0;
  return null;
}


function yeelightStateSummary(state: Record<string, unknown>): Record<string, unknown> {
  const entities = Array.isArray(state.entities) ? state.entities as Array<Record<string, unknown>> : [];
  const powerEntity = entities.find(entity => String(entity.value ?? entity.id ?? "").toLowerCase() === "power");
  const power = readPower(state.power ?? powerEntity?.currentValue ?? powerEntity?.power);
  return {
    connected: typeof state.connected === "boolean" ? state.connected : null,
    power,
    entitiesCount: entities.length,
    entityValues: entities.slice(0, 12).map(entity => String(entity.value ?? entity.id ?? ""))
  };
}
function normalizeYeelightState(result: Record<string, unknown>): Record<string, unknown> {
  const source = result.state && typeof result.state === "object" && !Array.isArray(result.state)
    ? result.state as Record<string, unknown>
    : result;
  const observedAt = new Date().toISOString();
  const power = readPower(source.power);
  const brightness = readNumber(source.brightness ?? source.bright);
  const colorTemperature = readNumber(source.colorTemperature ?? source.ct);
  const rgb = readNumber(source.rgb);
  const hue = readNumber(source.hue);
  const saturation = readNumber(source.saturation ?? source.sat);
  const colorMode = source.colorMode ?? source.color_mode ?? null;
  const name = typeof source.name === "string" ? source.name : null;
  const firmwareVersion = source.firmwareVersion ?? source.fw_ver ?? null;
  const host = typeof source.host === "string" ? source.host : typeof result.host === "string" ? result.host : null;

  const entities: Array<Record<string, unknown>> = [
    { id: "power", value: "power", name: "Power", type: "light", currentValue: power, power, unit: null, controllable: true, observedAt },
    { id: "brightness", value: "brightness", name: "Brightness", type: "number", currentValue: brightness, unit: "%", controllable: false, observedAt },
    { id: "color_temperature", value: "color_temperature", name: "Color temperature", type: "number", currentValue: colorTemperature, unit: "K", controllable: false, observedAt },
    { id: "rgb", value: "rgb", name: "RGB", type: "number", currentValue: rgb, unit: null, controllable: false, observedAt },
    { id: "hue", value: "hue", name: "Hue", type: "number", currentValue: hue, unit: "°", controllable: false, observedAt },
    { id: "saturation", value: "saturation", name: "Saturation", type: "number", currentValue: saturation, unit: "%", controllable: false, observedAt },
    { id: "color_mode", value: "color_mode", name: "Color mode", type: "sensor", currentValue: colorMode as string | number | boolean | null, unit: null, controllable: false, observedAt },
    { id: "name", value: "name", name: "Name", type: "text_sensor", currentValue: name, unit: null, controllable: false, observedAt },
    { id: "firmware_version", value: "firmware_version", name: "Firmware version", type: "text_sensor", currentValue: firmwareVersion as string | number | boolean | null, unit: null, controllable: false, observedAt }
  ];

  return {
    ...source,
    provider: "YEELIGHT",
    realtime: true,
    connected: true,
    host,
    power,
    brightness,
    colorTemperature,
    rgb,
    hue,
    saturation,
    colorMode,
    name,
    firmwareVersion,
    entities
  };
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
    os: row.os_name,
    osVersion: row.os_version,
    architecture: row.architecture,
    capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
    supervisorAvailable: row.supervisor_available ?? false,
    desiredVersion: row.desired_version,
    previousVersion: row.previous_version,
    updateStatus: row.update_status ?? "IDLE",
    updateRequestedAt: row.update_requested_at?.toISOString() ?? null,
    updateStartedAt: row.update_started_at?.toISOString() ?? null,
    updateFinishedAt: row.update_finished_at?.toISOString() ?? null,
    updateError: row.update_error,
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

  type DiscoveryStatus = "SENT" | "SUCCESS" | "FAILED" | "TIMEOUT";
  interface DiscoveryRecord {
    id: string;
    agentId: string;
    provider: string;
    status: DiscoveryStatus;
    devices: Array<Record<string, unknown>>;
    error: string | null;
    createdAt: Date;
    expiresAt: Date;
    finishedAt: Date | null;
  }
  const discoveries = new Map<string, DiscoveryRecord>();

  type DiscoveredDeviceActionStatus = "SENT" | "SUCCESS" | "FAILED" | "TIMEOUT";
  interface DiscoveredDeviceActionRecord {
    id: string;
    agentId: string;
    provider: string;
    action: string;
    target: Record<string, unknown>;
    status: DiscoveredDeviceActionStatus;
    result: Record<string, unknown> | null;
    error: string | null;
    createdAt: Date;
    expiresAt: Date;
    finishedAt: Date | null;
  }
  const discoveredDeviceActions = new Map<string, DiscoveredDeviceActionRecord>();

  const discoveryDto = (record: DiscoveryRecord) => ({
    commandId: record.id,
    agentId: record.agentId,
    provider: record.provider,
    status: record.status,
    devices: record.devices,
    error: record.error,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    finishedAt: record.finishedAt?.toISOString() ?? null
  });

  const discoveredDeviceActionDto = (record: DiscoveredDeviceActionRecord) => ({
    commandId: record.id,
    agentId: record.agentId,
    provider: record.provider,
    action: record.action,
    target: record.target,
    status: record.status,
    result: record.result,
    error: record.error,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    finishedAt: record.finishedAt?.toISOString() ?? null
  });

  const expireDiscoveries = () => {
    const now = Date.now();
    for (const record of discoveries.values()) {
      if (record.status === "SENT" && record.expiresAt.getTime() <= now) {
        record.status = "TIMEOUT";
        record.error = "Discovery timed out";
        record.finishedAt = new Date();
      }
      if (record.createdAt.getTime() < now - 60 * 60 * 1000) discoveries.delete(record.id);
    }
    for (const record of discoveredDeviceActions.values()) {
      if (record.status === "SENT" && record.expiresAt.getTime() <= now) {
        record.status = "TIMEOUT";
        record.error = "Discovered device action timed out";
        record.finishedAt = new Date();
      }
      if (record.createdAt.getTime() < now - 60 * 60 * 1000) discoveredDeviceActions.delete(record.id);
    }
  };

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

  const sendRealtimeDeviceSync = async (agentId: string, socket: WebSocket) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    const result = await pool.query<{
      device_id: string;
      device_name: string;
      provider: string;
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
        d.id AS device_id,
        d.name AS device_name,
        UPPER(d.control_provider) AS provider,
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
            ) ORDER BY i.identity_type, i.is_primary DESC, i.sort_order, i.value
          ) FILTER (WHERE i.id IS NOT NULL),
          '[]'::jsonb
        ) AS identities
      FROM device_registry_devices d
      LEFT JOIN device_registry_identities i ON i.device_id = d.id
      LEFT JOIN device_identity_labels il ON il.code = i.label_code
      WHERE d.control_agent_id = $1
        AND d.enabled = TRUE
        AND UPPER(COALESCE(d.control_provider, '')) = 'ESPHOME'
      GROUP BY d.id, d.name, d.control_provider
      ORDER BY LOWER(d.name), d.id
    `, [agentId]);

    socket.send(JSON.stringify({
      type: "SYNC_DEVICES",
      provider: "ESPHOME",
      devices: result.rows.map(row => ({
        deviceId: row.device_id,
        deviceName: row.device_name,
        provider: row.provider,
        identities: row.identities ?? []
      }))
    }));
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
              agent_labels=$5::jsonb, capabilities=$6::jsonb,
              os_name=COALESCE($7,os_name), os_version=COALESCE($8,os_version), architecture=COALESCE($9,architecture),
              supervisor_available=$10,
              update_status=CASE
                WHEN desired_version IS NOT NULL AND $3 = desired_version AND update_status IN ('UPDATE_REQUESTED','UPDATING','VERIFYING') THEN 'UPDATED'
                ELSE update_status
              END,
              update_finished_at=CASE
                WHEN desired_version IS NOT NULL AND $3 = desired_version AND update_status IN ('UPDATE_REQUESTED','UPDATING','VERIFYING') THEN NOW()
                ELSE update_finished_at
              END,
              update_error=CASE
                WHEN desired_version IS NOT NULL AND $3 = desired_version AND update_status IN ('UPDATE_REQUESTED','UPDATING','VERIFYING') THEN NULL
                ELSE update_error
              END,
              last_seen_at=NOW(), updated_at=NOW()
            WHERE id=$1
          `, [agent.id, message.agentName ?? null, message.version ?? null, message.hostname ?? null, JSON.stringify(labels), JSON.stringify(message.capabilities ?? []),
              message.systemInfo?.os ?? null, message.systemInfo?.osVersion ?? null, message.systemInfo?.architecture ?? null, message.agentUpdate?.supported ?? false]);
          socket.send(JSON.stringify({ type: "HELLO_ACK", agentId: agent.id, serverTime: new Date().toISOString() }));
          await sendPendingCommands(agent.id, socket);
          await sendRealtimeDeviceSync(agent.id, socket);
          return;
        }
        if (message.type === "HEARTBEAT") {
          await pool.query("UPDATE device_agents SET last_seen_at=NOW(), updated_at=NOW() WHERE id=$1", [agent.id]);
          socket.send(JSON.stringify({ type: "HEARTBEAT_ACK", serverTime: new Date().toISOString() }));
          await sendRealtimeDeviceSync(agent.id, socket);
          return;
        }
        if (message.type === "AGENT_UPDATE_RESULT") {
          const nextStatus = message.status === "ACCEPTED" || message.status === "SUCCESS" ? "VERIFYING" : "FAILED";
          await pool.query(`
            UPDATE device_agents SET
              update_status=$3,
              update_started_at=CASE WHEN $3='VERIFYING' THEN COALESCE(update_started_at,NOW()) ELSE update_started_at END,
              update_finished_at=CASE WHEN $3='FAILED' THEN NOW() ELSE update_finished_at END,
              update_error=CASE WHEN $3='FAILED' THEN COALESCE($4,'Device Agent update failed') ELSE NULL END,
              previous_version=COALESCE(previous_version,$5),
              updated_at=NOW()
            WHERE id=$1 AND update_command_id=$2
          `, [agent.id, message.commandId, nextStatus, message.error ?? null, message.currentVersion ?? null]);
          return;
        }

        if (message.type === "COMMAND_RESULT") {
          const updated = await pool.query<{ device_id: string; provider: string; action: string }>(`
            UPDATE device_control_commands SET status=$3, result=$4::jsonb, error=$5, finished_at=NOW(), updated_at=NOW()
            WHERE id=$1 AND agent_id=$2
            RETURNING device_id, provider, action
          `, [message.commandId, agent.id, message.status, JSON.stringify(message.result ?? {}), message.error ?? null]);
          const command = updated.rows[0];
          if (command?.provider.toUpperCase() === "YEELIGHT") {
            app.log.info({
              event: "YEELIGHT_COMMAND_RESULT",
              commandId: message.commandId,
              deviceId: command.device_id,
              agentId: agent.id,
              action: command.action,
              status: message.status,
              error: message.error ?? null,
              result: message.result ?? null
            }, "[YEELIGHT] COMMAND_RESULT");
          }
          if (
            command
            && message.status === "SUCCESS"
            && command.provider.toUpperCase() === "YEELIGHT"
            && command.action.toUpperCase() === "GET_STATE"
            && message.result
          ) {
            const state = normalizeYeelightState(message.result);
            app.log.info({
              event: "YEELIGHT_NORMALIZED_STATE",
              commandId: message.commandId,
              deviceId: command.device_id,
              agentId: agent.id,
              source: "GET_STATE",
              ...yeelightStateSummary(state)
            }, "[YEELIGHT] NORMALIZED_STATE");
            await pool.query(`
              INSERT INTO device_control_states (device_id, agent_id, provider, state, observed_at, updated_at)
              VALUES ($1,$2,'YEELIGHT',$3::jsonb,NOW(),NOW())
              ON CONFLICT (device_id) DO UPDATE SET
                agent_id=EXCLUDED.agent_id, provider=EXCLUDED.provider, state=EXCLUDED.state,
                observed_at=EXCLUDED.observed_at, updated_at=NOW()
            `, [command.device_id, agent.id, JSON.stringify(state)]);
            app.log.info({
              event: "YEELIGHT_STATE_PERSISTED",
              commandId: message.commandId,
              deviceId: command.device_id,
              agentId: agent.id,
              source: "GET_STATE",
              ...yeelightStateSummary(state)
            }, "[YEELIGHT] STATE_PERSISTED");
          }
          return;
        }
        if (message.type === "DEVICE_STATE") {
          const isYeelight = message.provider.toUpperCase() === "YEELIGHT";
          const persistedState = isYeelight ? normalizeYeelightState(message.state) : message.state;
          if (isYeelight) {
            app.log.info({
              event: "YEELIGHT_DEVICE_STATE",
              deviceId: message.deviceId,
              agentId: agent.id,
              source: "DEVICE_STATE",
              ...yeelightStateSummary(message.state),
              state: message.state
            }, "[YEELIGHT] DEVICE_STATE");
            app.log.info({
              event: "YEELIGHT_NORMALIZED_STATE",
              deviceId: message.deviceId,
              agentId: agent.id,
              source: "DEVICE_STATE",
              ...yeelightStateSummary(persistedState)
            }, "[YEELIGHT] NORMALIZED_STATE");
          }
          await pool.query(`
            INSERT INTO device_control_states (device_id, agent_id, provider, state, observed_at, updated_at)
            VALUES ($1,$2,$3,$4::jsonb,NOW(),NOW())
            ON CONFLICT (device_id) DO UPDATE SET
              agent_id=EXCLUDED.agent_id, provider=EXCLUDED.provider, state=EXCLUDED.state,
              observed_at=EXCLUDED.observed_at, updated_at=NOW()
          `, [message.deviceId, agent.id, message.provider, JSON.stringify(persistedState)]);
          if (isYeelight) {
            app.log.info({
              event: "YEELIGHT_STATE_PERSISTED",
              deviceId: message.deviceId,
              agentId: agent.id,
              source: "DEVICE_STATE",
              ...yeelightStateSummary(persistedState)
            }, "[YEELIGHT] STATE_PERSISTED");
          }
          return;
        }
        if (message.type === "DISCOVERED_DEVICE_ACTION_RESULT") {
          const action = discoveredDeviceActions.get(message.commandId);
          if (!action || action.agentId !== agent.id) return;
          if (action.provider.toUpperCase() !== message.provider.toUpperCase() || action.action.toUpperCase() !== message.action.toUpperCase()) {
            action.status = "FAILED";
            action.error = "Discovered device action response does not match the request";
            action.finishedAt = new Date();
            return;
          }
          action.status = message.status;
          action.result = message.result ?? null;
          action.error = message.error ?? null;
          action.finishedAt = new Date();
          return;
        }

        if (message.type === "DISCOVER_RESULT") {
          const discovery = discoveries.get(message.commandId);
          if (!discovery || discovery.agentId !== agent.id) return;
          if (discovery.provider.toUpperCase() !== message.provider.toUpperCase()) {
            discovery.status = "FAILED";
            discovery.error = `Discovery provider mismatch: expected ${discovery.provider}, received ${message.provider}`;
            discovery.finishedAt = new Date();
            return;
          }
          discovery.status = message.status === "FAILED" ? "FAILED" : "SUCCESS";
          discovery.devices = message.devices;
          discovery.error = message.error ?? null;
          discovery.finishedAt = new Date();
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

  let yeelightPollRunning = false;
  const pollYeelightStates = async () => {
    if (yeelightPollRunning) return;
    yeelightPollRunning = true;
    try {
      await pool.query(`
        DELETE FROM device_control_commands
        WHERE provider = 'YEELIGHT'
          AND action = 'GET_STATE'
          AND parameters->>'source' = 'realtime-entity-poll'
          AND created_at < NOW() - INTERVAL '1 hour'
      `);
      const devices = await pool.query<{ device_id: string; agent_id: string }>(`
        SELECT d.id AS device_id, d.control_agent_id AS agent_id
        FROM device_registry_devices d
        JOIN device_agents a ON a.id = d.control_agent_id AND a.enabled = TRUE
        WHERE d.enabled = TRUE
          AND UPPER(COALESCE(d.control_provider, '')) = 'YEELIGHT'
          AND d.control_agent_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(a.capabilities, '[]'::jsonb)) capability
            WHERE UPPER(COALESCE(capability->>'provider', '')) = 'YEELIGHT'
          )
          AND NOT EXISTS (
            SELECT 1 FROM device_control_commands c
            WHERE c.device_id = d.id
              AND c.provider = 'YEELIGHT'
              AND c.action = 'GET_STATE'
              AND c.status IN ('PENDING', 'SENT')
              AND c.expires_at > NOW()
          )
        ORDER BY d.control_agent_id, d.id
      `);
      const touchedAgents = new Set<string>();
      for (const device of devices.rows) {
        const socket = sockets.get(device.agent_id);
        if (!socket || socket.readyState !== WebSocket.OPEN) continue;
        const commandId = randomUUID();
        const expiresAt = new Date(Date.now() + 15_000);
        await pool.query(`
          INSERT INTO device_control_commands (id, device_id, agent_id, provider, action, parameters, status, expires_at)
          VALUES ($1,$2,$3,'YEELIGHT','GET_STATE',$4::jsonb,'PENDING',$5)
        `, [commandId, device.device_id, device.agent_id, JSON.stringify({ source: "realtime-entity-poll" }), expiresAt]);
        touchedAgents.add(device.agent_id);
      }
      for (const agentId of touchedAgents) {
        const socket = sockets.get(agentId);
        if (socket?.readyState === WebSocket.OPEN) await sendPendingCommands(agentId, socket);
      }
    } catch (error) {
      app.log.error({ err: error }, "Yeelight realtime entity polling failed");
    } finally {
      yeelightPollRunning = false;
    }
  };

  const yeelightPollTimer = setInterval(() => { void pollYeelightStates(); }, 15_000);
  yeelightPollTimer.unref();
  setTimeout(() => { void pollYeelightStates(); }, 2_000).unref();

  app.addHook("onClose", async () => {
    clearInterval(yeelightPollTimer);
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

  app.post("/api/v1/device-control/agents/:id/update", async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply) => {
    const parsed = agentUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid Device Agent update request" });

    const result = await pool.query<AgentRow>("SELECT * FROM device_agents WHERE id=$1", [request.params.id]);
    const agent = result.rows[0];
    if (!agent) return reply.code(404).send({ error: "Device Agent not found" });
    if (!agent.enabled) return reply.code(409).send({ error: "Device Agent is disabled" });
    const socket = sockets.get(agent.id);
    if (socket?.readyState !== WebSocket.OPEN) return reply.code(409).send({ error: "Device Agent is offline" });
    if (!agent.supervisor_available) return reply.code(409).send({ error: "Supervisor Agent is unavailable for this Device Agent" });
    if (["UPDATE_REQUESTED", "UPDATING", "VERIFYING"].includes(agent.update_status)) {
      return reply.code(409).send({ error: "A Device Agent update is already in progress" });
    }

    const commandId = randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const updated = await pool.query<AgentRow>(`
      UPDATE device_agents SET
        previous_version=version, desired_version=$2, update_status='UPDATING', update_command_id=$3,
        update_requested_at=NOW(), update_started_at=NOW(), update_finished_at=NULL, update_error=NULL, updated_at=NOW()
      WHERE id=$1 RETURNING *
    `, [agent.id, parsed.data.version, commandId]);

    socket.send(JSON.stringify({
      type: "AGENT_UPDATE_REQUEST",
      commandId,
      version: parsed.data.version,
      expiresAt: expiresAt.toISOString()
    }));

    return reply.code(202).send(agentDto(updated.rows[0]!, true));
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


  app.post("/api/v1/device-control/agents/:id/discovered-actions", async (
    request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
    reply
  ) => {
    expireDiscoveries();
    const parsed = discoveredDeviceActionCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid discovered device action" });
    const input = parsed.data;

    const result = await pool.query<AgentRow>("SELECT * FROM device_agents WHERE id=$1", [request.params.id]);
    const agent = result.rows[0];
    if (!agent) return reply.code(404).send({ error: "Device Agent not found" });
    if (!agent.enabled) return reply.code(409).send({ error: "Device Agent is disabled" });
    const socket = sockets.get(agent.id);
    if (socket?.readyState !== WebSocket.OPEN) return reply.code(409).send({ error: "Device Agent is offline" });

    const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities : [];
    if (!capabilities.some(item => item.provider.toUpperCase() === input.provider.toUpperCase())) {
      return reply.code(409).send({ error: `Device Agent does not advertise provider ${input.provider}` });
    }

    const commandId = randomUUID();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + (input.timeoutSeconds ?? 10) * 1000);
    const record: DiscoveredDeviceActionRecord = {
      id: commandId,
      agentId: agent.id,
      provider: input.provider.toUpperCase(),
      action: input.action.toUpperCase(),
      target: input.target,
      status: "SENT",
      result: null,
      error: null,
      createdAt,
      expiresAt,
      finishedAt: null
    };
    discoveredDeviceActions.set(commandId, record);
    socket.send(JSON.stringify({
      type: "DISCOVERED_DEVICE_ACTION_REQUEST",
      commandId,
      provider: record.provider,
      action: record.action,
      target: record.target,
      parameters: input.parameters ?? {}
    }));
    return reply.code(202).send(discoveredDeviceActionDto(record));
  });

  app.get("/api/v1/device-control/discovered-actions/:id", async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply
  ) => {
    expireDiscoveries();
    const record = discoveredDeviceActions.get(request.params.id);
    if (!record) return reply.code(404).send({ error: "Discovered device action not found" });
    return reply.send(discoveredDeviceActionDto(record));
  });

  app.post("/api/v1/device-control/agents/:id/discover", async (
    request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
    reply
  ) => {
    expireDiscoveries();
    const parsed = discoveryCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid discovery request" });
    const input = parsed.data;

    const result = await pool.query<AgentRow>("SELECT * FROM device_agents WHERE id=$1", [request.params.id]);
    const agent = result.rows[0];
    if (!agent) return reply.code(404).send({ error: "Device Agent not found" });
    if (!agent.enabled) return reply.code(409).send({ error: "Device Agent is disabled" });

    const socket = sockets.get(agent.id);
    if (socket?.readyState !== WebSocket.OPEN) return reply.code(409).send({ error: "Device Agent is offline" });

    const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities : [];
    const capability = capabilities.find(item => item.provider.toUpperCase() === input.provider.toUpperCase());
    if (!capability) return reply.code(409).send({ error: `Device Agent does not advertise provider ${input.provider}` });
    if (!capability.discovery) return reply.code(409).send({ error: `Device Agent provider ${input.provider} does not support discovery` });

    const timeoutSeconds = input.timeoutSeconds ?? 4;
    const commandId = randomUUID();
    const record: DiscoveryRecord = {
      id: commandId,
      agentId: agent.id,
      provider: input.provider.toUpperCase(),
      status: "SENT",
      devices: [],
      error: null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + (timeoutSeconds + 5) * 1000),
      finishedAt: null
    };
    discoveries.set(commandId, record);

    socket.send(JSON.stringify({
      type: "DISCOVER_REQUEST",
      commandId,
      provider: record.provider,
      timeoutMs: timeoutSeconds * 1000
    }));

    return reply.code(202).send(discoveryDto(record));
  });

  app.get("/api/v1/device-control/discoveries", async (_request, reply) => {
    expireDiscoveries();
    return reply.send(
      [...discoveries.values()]
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .map(discoveryDto)
    );
  });

  app.get("/api/v1/device-control/discovery-discarded", async (_request, reply) => {
    const result = await pool.query<{ provider: string; identity_key: string; label: string | null; created_at: Date }>(`
      SELECT provider, identity_key, label, created_at
      FROM device_discovery_discarded
      ORDER BY provider, identity_key
    `);
    return reply.send(result.rows.map(row => ({
      provider: row.provider,
      identityKey: row.identity_key,
      label: row.label,
      createdAt: row.created_at.toISOString()
    })));
  });

  app.post("/api/v1/device-control/discovery-discarded", async (request: FastifyRequest<{ Body: unknown }>, reply) => {
    const parsed = discoveryDiscardSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid discarded discovery request" });
    const input = parsed.data;
    const provider = input.provider.toUpperCase();
    if (input.discarded) {
      await pool.query(`
        INSERT INTO device_discovery_discarded (provider, identity_key, label)
        VALUES ($1, $2, $3)
        ON CONFLICT (provider, identity_key) DO UPDATE SET label = EXCLUDED.label
      `, [provider, input.identityKey, input.label ?? null]);
    } else {
      await pool.query("DELETE FROM device_discovery_discarded WHERE provider=$1 AND identity_key=$2", [provider, input.identityKey]);
    }
    return reply.code(204).send();
  });

  app.get("/api/v1/device-control/discoveries/:id", async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply
  ) => {
    expireDiscoveries();
    const discovery = discoveries.get(request.params.id);
    if (!discovery) return reply.code(404).send({ error: "Discovery request not found" });
    return reply.send(discoveryDto(discovery));
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
    if (!device.control_agent_id) return reply.code(409).send({ error: "Device has no Device Agent" });
    if (!device.control_provider) return reply.code(409).send({ error: "Device has no control provider" });
    if (!device.agent_enabled) return reply.code(409).send({ error: "Assigned Device Agent is disabled or unavailable" });
    const socket = sockets.get(device.control_agent_id);
    if (socket?.readyState !== WebSocket.OPEN) return reply.code(409).send({ error: "Assigned Device Agent is offline" });
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

    if (device.control_provider.toUpperCase() === "YEELIGHT") {
      app.log.info({
        event: "YEELIGHT_COMMAND_CREATED",
        commandId,
        deviceId: device.id,
        agentId: device.control_agent_id,
        action: input.action,
        parameters: input.parameters ?? {}
      }, "[YEELIGHT] COMMAND_CREATED");
    }

    await sendPendingCommands(device.control_agent_id, socket);
    return reply.code(202).send({ commandId, status: "SENT", expiresAt: expiresAt.toISOString() });
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

  app.get("/api/v1/device-control/entities", async (_request, reply) => {
    const result = await pool.query<{
      deviceId: string;
      deviceName: string;
      agentId: string;
      agentName: string | null;
      provider: string;
      state: Record<string, unknown>;
      observedAt: Date;
    }>(`
      SELECT s.device_id AS "deviceId", d.name AS "deviceName", s.agent_id AS "agentId",
        a.name AS "agentName", s.provider, s.state, s.observed_at AS "observedAt"
      FROM device_control_states s
      JOIN device_registry_devices d ON d.id = s.device_id
      LEFT JOIN device_agents a ON a.id = s.agent_id
      ORDER BY lower(d.name), d.id
    `);

    const entities = result.rows.flatMap(row => {
      const state = row.state ?? {};
      const connected = state.connected === true;
      const host = typeof state.host === "string" ? state.host : null;
      const error = typeof state.error === "string" ? state.error : null;
      const rawEntities = Array.isArray(state.entities) ? state.entities : [];
      return rawEntities.flatMap(raw => {
        if (!raw || typeof raw !== "object") return [];
        const entity = raw as Record<string, unknown>;
        const value = typeof entity.value === "string" ? entity.value : typeof entity.id === "string" ? entity.id : null;
        if (!value) return [];
        return [{
          deviceId: row.deviceId,
          deviceName: row.deviceName,
          agentId: row.agentId,
          agentName: row.agentName,
          provider: row.provider,
          connected,
          host,
          error,
          entityId: typeof entity.id === "string" ? entity.id : value,
          entityValue: value,
          entityName: typeof entity.name === "string" ? entity.name : typeof entity.label === "string" ? entity.label : value,
          entityType: typeof entity.type === "string" ? entity.type : "unknown",
          currentValue: entity.currentValue ?? entity.power ?? null,
          unit: typeof entity.unit === "string" ? entity.unit : null,
          controllable: entity.controllable === true,
          observedAt: typeof entity.observedAt === "string" ? entity.observedAt : row.observedAt.toISOString(),
          deviceObservedAt: row.observedAt.toISOString()
        }];
      });
    });

    return reply.send(entities);
  });

  app.get("/api/v1/device-control/devices/:id/state", async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const result = await pool.query(`
      SELECT device_id AS "deviceId", agent_id AS "agentId", provider, state, observed_at AS "observedAt"
      FROM device_control_states WHERE device_id=$1
    `, [request.params.id]);
    return reply.send(result.rows[0] ?? null);
  });

  app.get("/api/v1/device-control/devices/:id/entities", async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const result = await pool.query<{
      deviceId: string;
      agentId: string;
      provider: string;
      state: Record<string, unknown>;
      observedAt: Date;
    }>(`
      SELECT device_id AS "deviceId", agent_id AS "agentId", provider, state, observed_at AS "observedAt"
      FROM device_control_states WHERE device_id=$1
    `, [request.params.id]);
    const row = result.rows[0];
    if (!row) return reply.send(null);
    const state = row.state ?? {};
    return reply.send({
      deviceId: row.deviceId,
      agentId: row.agentId,
      provider: row.provider,
      connected: state.connected === true,
      host: typeof state.host === "string" ? state.host : null,
      error: typeof state.error === "string" ? state.error : null,
      entities: Array.isArray(state.entities) ? state.entities : [],
      observedAt: row.observedAt.toISOString()
    });
  });
}
