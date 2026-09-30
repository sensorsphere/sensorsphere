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
  heartbeatTimeoutSeconds: z.number().int().min(15).max(3600).optional(),
  slotId: z.string().uuid().optional(),
  slotName: z.string().trim().min(1).max(200).optional()
}).strict().refine(
  value => !(value.slotId && value.slotName),
  "Provide either slotId or slotName, not both"
);

const agentUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  enabled: z.boolean().optional(),
  labels: z.record(z.string(), z.string()).optional(),
  heartbeatTimeoutSeconds: z.number().int().min(15).max(3600).optional()
}).strict().refine(value => Object.keys(value).length > 0, "At least one field is required");

const discoveryCreateSchema = z.object({
  provider: providerSchema,
  timeoutSeconds: z.number().int().min(1).max(30).optional()
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

const supervisorUpdateRequestSchema = z.object({
  version: z.string().trim().min(1).max(100).regex(/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/, "Invalid Supervisor Agent version")
}).strict();

const managedAgentRequestSchema = z.object({
  operation: z.enum(["LIST", "DEPLOY", "UPDATE", "REMOVE", "CHECK_TOKEN"]),
  agentType: z.enum(["device-agent", "monitor-agent"]).optional(),
  instance: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/).optional(),
  version: z.string().trim().min(1).max(100).regex(/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/).optional(),
  environment: z.record(z.string(), z.string()).optional(),
  agentId: z.string().uuid().optional(),
  installDir: z.string().trim().min(1).max(2000).optional()
}).strict().superRefine((value, ctx) => {
  if (value.operation !== "LIST" && !value.agentType) ctx.addIssue({ code: "custom", message: "agentType is required" });
  if (["DEPLOY", "UPDATE"].includes(value.operation) && !value.version) ctx.addIssue({ code: "custom", message: "version is required" });
});

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
  }).strict().optional(),
  supervisor: z.object({
    available: z.boolean(),
    version: z.string().trim().max(100).nullable().optional(),
    configuredVersion: z.string().trim().max(100).nullable().optional(),
    containerState: z.string().trim().max(100).nullable().optional(),
    selfUpdateSupported: z.boolean().optional(),
    updateStatus: z.string().trim().max(100).nullable().optional(),
    updateTargetVersion: z.string().trim().max(100).nullable().optional(),
    updateError: z.string().max(5000).nullable().optional()
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

const entityRemovalSchema = z.object({
  entities: z.array(z.object({
    deviceId: z.string().uuid(),
    provider: providerSchema,
    entityValue: z.string().trim().min(1).max(500),
    snapshot: z.record(z.string(), z.unknown()).optional()
  }).strict()).min(1).max(2000)
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

const supervisorUpdateResultMessageSchema = z.object({
  type: z.literal("SUPERVISOR_UPDATE_RESULT"),
  commandId: z.string().uuid(),
  status: z.enum(["ACCEPTED", "SUCCESS", "FAILED", "REJECTED"]),
  currentVersion: z.string().trim().max(100).optional(),
  targetVersion: z.string().trim().max(100).optional(),
  result: z.unknown().optional(),
  error: z.string().max(5000).nullable().optional()
}).strict();

const managedAgentResultMessageSchema = z.object({
  type: z.literal("MANAGED_AGENT_RESULT"),
  commandId: z.string().uuid(),
  operation: z.enum(["LIST", "DEPLOY", "UPDATE", "REMOVE"]),
  status: z.enum(["SUCCESS", "FAILED"]),
  result: z.unknown().nullable().optional(),
  error: z.string().max(5000).nullable().optional()
}).strict();

const agentMessageSchema = z.discriminatedUnion("type", [
  helloMessageSchema,
  heartbeatMessageSchema,
  commandResultMessageSchema,
  deviceStateMessageSchema,
  discoverResultMessageSchema,
  discoveredDeviceActionResultMessageSchema,
  agentUpdateResultMessageSchema,
  supervisorUpdateResultMessageSchema,
  managedAgentResultMessageSchema
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
  host_networks: Array<Record<string, unknown>>;
  configured_version: string | null;
  container_state: string | null;
  self_update_supported: boolean;
  capabilities: Array<{ provider: string; actions: string[]; discovery?: boolean }>;
  supervisor_available: boolean;
  supervisor_version: string | null;
  supervisor_configured_version: string | null;
  supervisor_container_state: string | null;
  supervisor_self_update_supported: boolean;
  supervisor_desired_version: string | null;
  supervisor_previous_version: string | null;
  supervisor_update_status: string;
  supervisor_update_command_id: string | null;
  supervisor_update_requested_at: Date | null;
  supervisor_update_started_at: Date | null;
  supervisor_update_finished_at: Date | null;
  supervisor_update_error: string | null;
  desired_version: string | null;
  previous_version: string | null;
  update_status: string;
  update_command_id: string | null;
  update_requested_at: Date | null;
  update_started_at: Date | null;
  update_finished_at: Date | null;
  update_error: string | null;
  last_successful_update_at: Date | null;
  last_successful_update_version: string | null;
  last_seen_at: Date | null;
  heartbeat_timeout_seconds: number;
  created_at: Date;
  updated_at: Date;
  managed_association_id?: string | null;
  managed_by_supervisor_id?: string | null;
  managed_by_supervisor_name?: string | null;
  managed_instance?: string | null;
  slot_id?: string | null;
  slot_name?: string | null;
}

interface DeviceAgentSlotRow {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  agent_id: string | null;
  agent_name?: string | null;
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

function tokenFingerprint(tokenHash: string | null | undefined): string | null {
  if (!tokenHash || tokenHash.length < 8) return null;
  return `${tokenHash.slice(0, 4).toUpperCase()}-${tokenHash.slice(4, 8).toUpperCase()}`;
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
    hostNetworks: row.host_networks ?? [],
    configuredVersion: row.configured_version,
    containerState: row.container_state,
    selfUpdateSupported: row.self_update_supported ?? false,
    capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
    supervisorAvailable: row.supervisor_available ?? false,
    supervisorVersion: row.supervisor_version,
    supervisorConfiguredVersion: row.supervisor_configured_version,
    supervisorContainerState: row.supervisor_container_state,
    supervisorSelfUpdateSupported: row.supervisor_self_update_supported ?? false,
    supervisorDesiredVersion: row.supervisor_desired_version,
    supervisorPreviousVersion: row.supervisor_previous_version,
    supervisorUpdateStatus: row.supervisor_update_status ?? "IDLE",
    supervisorUpdateRequestedAt: row.supervisor_update_requested_at?.toISOString() ?? null,
    supervisorUpdateStartedAt: row.supervisor_update_started_at?.toISOString() ?? null,
    supervisorUpdateFinishedAt: row.supervisor_update_finished_at?.toISOString() ?? null,
    supervisorUpdateError: row.supervisor_update_error,
    desiredVersion: row.desired_version,
    previousVersion: row.previous_version,
    updateStatus: row.update_status ?? "IDLE",
    updateRequestedAt: row.update_requested_at?.toISOString() ?? null,
    updateStartedAt: row.update_started_at?.toISOString() ?? null,
    updateFinishedAt: row.update_finished_at?.toISOString() ?? null,
    updateError: row.update_error,
    lastSuccessfulUpdateAt: row.last_successful_update_at?.toISOString() ?? null,
    lastSuccessfulUpdateVersion: row.last_successful_update_version,
    managedAssociationId: row.managed_association_id ?? null,
    managedBySupervisorId: row.managed_by_supervisor_id ?? null,
    managedBySupervisorName: row.managed_by_supervisor_name ?? null,
    managedInstance: row.managed_instance ?? null,
    slotId: row.slot_id ?? null,
    slotName: row.slot_name ?? null,
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

const AGENT_RELEASE_CACHE_TTL_MS = 5 * 60 * 1000;
const AGENT_RELEASE_REPOSITORIES = {
  deviceAgent: "sensorsphere/sensorsphere-device-agent",
  monitorAgent: "sensorsphere/sensorsphere-monitor-agent",
  supervisorAgent: "sensorsphere/sensorsphere-supervisor-agent"
} as const;

type AgentReleaseKind = keyof typeof AGENT_RELEASE_REPOSITORIES;
interface AgentReleaseInfo {
  repository: string;
  latestVersion: string | null;
  status: "OK" | "ERROR";
  error: string | null;
}
interface AgentReleaseSnapshot {
  checkedAt: string;
  cacheTtlSeconds: number;
  agents: Record<AgentReleaseKind, AgentReleaseInfo>;
}

function compareStableSemver(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return 0;
}

async function fetchGhcrLatestVersion(repository: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const scope = `repository:${repository}:pull`;
    const tokenResponse = await fetch(`https://ghcr.io/token?scope=${encodeURIComponent(scope)}`, { signal: controller.signal });
    if (!tokenResponse.ok) throw new Error(`GHCR token request returned ${tokenResponse.status}`);
    const tokenPayload = await tokenResponse.json() as { token?: string };
    if (!tokenPayload.token) throw new Error("GHCR token response did not contain a token");

    const tagsResponse = await fetch(`https://ghcr.io/v2/${repository}/tags/list?n=1000`, {
      headers: { Authorization: `Bearer ${tokenPayload.token}` },
      signal: controller.signal
    });
    if (!tagsResponse.ok) throw new Error(`GHCR tags request returned ${tagsResponse.status}`);
    const tagsPayload = await tagsResponse.json() as { tags?: string[] };
    const versions = (tagsPayload.tags ?? []).filter(tag => /^\d+\.\d+\.\d+$/.test(tag)).sort(compareStableSemver);
    const latest = versions.at(-1);
    if (!latest) throw new Error("GHCR did not return a stable semantic-version tag");
    return latest;
  } finally {
    clearTimeout(timer);
  }
}


const supervisorEnvironmentSchema = z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/).transform(value => value.toUpperCase());

const supervisorCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  labels: z.record(z.string(), z.string()).optional(),
  heartbeatTimeoutSeconds: z.number().int().min(15).max(3600).optional()
}).strict();

const supervisorUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  enabled: z.boolean().optional(),
  labels: z.record(z.string(), z.string()).optional(),
  heartbeatTimeoutSeconds: z.number().int().min(15).max(3600).optional()
}).strict().refine(value => Object.keys(value).length > 0, "At least one field is required");

const supervisorHostNetworksSchema = z.array(z.object({
  interface: z.string().trim().min(1).max(200),
  mac: z.string().trim().max(64).nullable(),
  addresses: z.array(z.object({
    family: z.enum(["IPv4", "IPv6"]),
    address: z.string().trim().min(1).max(200),
    prefixLength: z.number().int().min(0).max(128),
    cidr: z.string().trim().min(1).max(240),
    network: z.string().trim().max(240).nullable()
  }).strict()).max(100)
}).strict()).max(100);

const supervisorHelloSchema = z.object({
  type: z.literal("HELLO"),
  supervisorName: z.string().trim().min(1).max(200).optional(),
  environment: supervisorEnvironmentSchema.optional(),
  namespace: z.string().trim().min(1).max(64).regex(/^[a-z0-9][a-z0-9_-]{0,63}$/).optional(),
  version: z.string().trim().max(100).nullable().optional(),
  hostname: z.string().trim().max(500).nullable().optional(),
  systemInfo: z.object({
    os: z.string().trim().min(1).max(200),
    osVersion: z.string().trim().min(1).max(300),
    architecture: z.string().trim().min(1).max(100)
  }).strict().optional(),
  selfUpdateSupported: z.boolean().optional(),
  hostNetworks: supervisorHostNetworksSchema.optional(),
  managedAgents: z.array(z.record(z.string(), z.unknown())).max(500).optional(),
  selfStatus: z.record(z.string(), z.unknown()).optional()
}).strict();

const supervisorHeartbeatSchema = z.object({
  type: z.literal("HEARTBEAT"),
  hostNetworks: supervisorHostNetworksSchema.optional(),
  managedAgents: z.array(z.record(z.string(), z.unknown())).max(500).optional(),
  selfStatus: z.record(z.string(), z.unknown()).optional()
}).strict();

const supervisorCommandResultSchema = z.object({
  type: z.literal("SUPERVISOR_COMMAND_RESULT"),
  commandId: z.string().trim().min(1).max(200),
  operation: z.enum(["LIST", "DEPLOY", "UPDATE", "REMOVE", "CHECK_TOKEN", "GET_PROXMOX_CONFIG", "SET_PROXMOX_CONFIG", "DELETE_PROXMOX_CONFIG", "UPDATE_SELF"]),
  status: z.enum(["SUCCESS", "FAILED"]),
  result: z.unknown().optional(),
  error: z.string().max(2000).optional()
}).strict();

const supervisorCommandProgressSchema = z.object({
  type: z.literal("SUPERVISOR_COMMAND_PROGRESS"),
  commandId: z.string().trim().min(1).max(200),
  operation: z.enum(["DEPLOY", "UPDATE", "REMOVE"]),
  agentType: z.enum(["device-agent", "monitor-agent"]).nullable().optional(),
  instance: z.string().trim().min(1).max(64),
  step: z.string().trim().min(1).max(100),
  elapsedMs: z.number().int().nonnegative(),
  details: z.record(z.string(), z.unknown()).optional()
}).strict();

const supervisorRemoteMessageSchema = z.discriminatedUnion("type", [supervisorHelloSchema, supervisorHeartbeatSchema, supervisorCommandResultSchema, supervisorCommandProgressSchema]);

const supervisorSelfUpdateSchema = z.object({
  version: z.string().trim().regex(/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/)
}).strict();

const proxmoxEndpointSchema = z.object({
  id: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  product: z.enum(["PVE", "PBS"]),
  url: z.string().trim().url().max(1000),
  tokenId: z.string().trim().min(3).max(500),
  tokenSecret: z.string().max(2000).optional(),
  originalId: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/).optional(),
  verifyTls: z.boolean()
}).strict();
const proxmoxConfigSchema = z.object({ endpoints: z.array(proxmoxEndpointSchema).max(50) }).strict();

function supervisorSelfStatusFields(selfStatus: Record<string, unknown> | undefined) {
  const update = selfStatus && typeof selfStatus.update === "object" && selfStatus.update != null
    ? selfStatus.update as Record<string, unknown>
    : undefined;
  return {
    configuredVersion: typeof selfStatus?.configured_version === "string" ? selfStatus.configured_version : null,
    containerState: typeof selfStatus?.container_state === "string" ? selfStatus.container_state : null,
    updateStatus: typeof update?.status === "string" ? update.status : null,
    updateError: typeof update?.error === "string" ? update.error : null
  };
}

interface SupervisorAgentRow {
  id: string; name: string; enabled: boolean; labels: Record<string, string>; agent_labels: string[]; reported_name: string | null; version: string | null; hostname: string | null;
  os_name: string | null; os_version: string | null; architecture: string | null; host_networks: Array<Record<string, unknown>>; managed_agents: Array<Record<string, unknown>>;
  configured_version: string | null; container_state: string | null; self_update_supported: boolean; desired_version: string | null; previous_version: string | null; update_status: string;
  update_requested_at: Date | null; update_started_at: Date | null; update_finished_at: Date | null; update_error: string | null; last_successful_update_at: Date | null; last_successful_update_version: string | null; last_seen_at: Date | null; heartbeat_timeout_seconds: number; created_at: Date; updated_at: Date;
}


interface SupervisorManagedAssignmentRow {
  id: string;
  supervisor_agent_id: string;
  agent_type: "device-agent" | "monitor-agent";
  device_agent_id: string | null;
  monitoring_agent_id: string | null;
  instance: string;
  install_dir: string | null;
  compose_project: string | null;
  compose_service: string;
  desired_version: string | null;
  reported_version: string | null;
  local_state: string | null;
  reconciliation_status: "MANAGED" | "MISSING" | "DISCOVERED" | "ERROR";
  created_at: Date;
  updated_at: Date;
}

function supervisorManagedAssignmentDto(row: SupervisorManagedAssignmentRow) {
  return {
    id: row.id,
    supervisorId: row.supervisor_agent_id,
    agentType: row.agent_type,
    agentId: row.device_agent_id ?? row.monitoring_agent_id,
    instance: row.instance,
    installDir: row.install_dir,
    composeProject: row.compose_project,
    composeService: row.compose_service,
    desiredVersion: row.desired_version,
    reportedVersion: row.reported_version,
    localState: row.local_state,
    reconciliationStatus: row.reconciliation_status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function generateSupervisorToken(): string {
  return `sssa_${randomBytes(32).toString("base64url")}`;
}

function supervisorAgentDto(row: SupervisorAgentRow, connected: boolean) {
  const recent = row.last_seen_at != null && Date.now() - row.last_seen_at.getTime() <= row.heartbeat_timeout_seconds * 1000;
  return {
    id: row.id, name: row.name, enabled: row.enabled, labels: row.labels ?? {}, agentLabels: Array.isArray(row.agent_labels) ? row.agent_labels : [], reportedName: row.reported_name, version: row.version, hostname: row.hostname,
    os: row.os_name, osVersion: row.os_version, architecture: row.architecture, hostNetworks: row.host_networks ?? [], managedAgents: row.managed_agents ?? [],
    configuredVersion: row.configured_version, containerState: row.container_state, selfUpdateSupported: row.self_update_supported ?? false,
    desiredVersion: row.desired_version, previousVersion: row.previous_version, updateStatus: row.update_status ?? "IDLE",
    updateRequestedAt: row.update_requested_at?.toISOString() ?? null, updateStartedAt: row.update_started_at?.toISOString() ?? null, updateFinishedAt: row.update_finished_at?.toISOString() ?? null,
    updateError: row.update_error, lastSuccessfulUpdateAt: row.last_successful_update_at?.toISOString() ?? null, lastSuccessfulUpdateVersion: row.last_successful_update_version, lastSeenAt: row.last_seen_at?.toISOString() ?? null,
    heartbeatTimeoutSeconds: row.heartbeat_timeout_seconds, online: row.enabled && connected && recent,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString()
  };
}

async function authenticateSupervisor(pool: Pool, request: IncomingMessage): Promise<SupervisorAgentRow | null> {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  if (!token.startsWith("sssa_")) return null;
  const result = await pool.query<SupervisorAgentRow>("SELECT * FROM supervisor_agents WHERE token_hash=$1 AND enabled=TRUE", [hashToken(token)]);
  return result.rows[0] ?? null;
}

export async function registerDeviceControlFeature(
  app: FastifyInstance,
  { pool }: DeviceControlFeatureOptions
): Promise<void> {
  const installationEnvironment = supervisorEnvironmentSchema.parse(process.env.SENSORSPHERE_ENVIRONMENT ?? "DEFAULT");
  const sockets = new Map<string, WebSocket>();
  const wss = new WebSocketServer({ noServer: true });
  const supervisorSockets = new Map<string, WebSocket>();
  const supervisorWss = new WebSocketServer({ noServer: true });
  let agentReleaseSnapshot: AgentReleaseSnapshot | null = null;
  let agentReleaseRefresh: Promise<AgentReleaseSnapshot> | null = null;

  const refreshAgentReleaseSnapshot = async (): Promise<AgentReleaseSnapshot> => {
    const entries = await Promise.all(Object.entries(AGENT_RELEASE_REPOSITORIES).map(async ([kind, repository]) => {
      try {
        const latestVersion = await fetchGhcrLatestVersion(repository);
        return [kind, { repository, latestVersion, status: "OK" as const, error: null }] as const;
      } catch (error) {
        app.log.warn({ err: error, repository }, "Unable to refresh GHCR agent version");
        return [kind, { repository, latestVersion: null, status: "ERROR" as const, error: error instanceof Error ? error.message : "Unable to query GHCR" }] as const;
      }
    }));
    agentReleaseSnapshot = {
      checkedAt: new Date().toISOString(),
      cacheTtlSeconds: AGENT_RELEASE_CACHE_TTL_MS / 1000,
      agents: Object.fromEntries(entries) as Record<AgentReleaseKind, AgentReleaseInfo>
    };
    return agentReleaseSnapshot;
  };

  const forceAgentReleaseRefresh = async (): Promise<AgentReleaseSnapshot> => {
    if (!agentReleaseRefresh) {
      agentReleaseRefresh = refreshAgentReleaseSnapshot().finally(() => { agentReleaseRefresh = null; });
    }
    return agentReleaseRefresh;
  };

  const getAgentReleaseSnapshot = async (): Promise<AgentReleaseSnapshot> => {
    const checkedAt = agentReleaseSnapshot ? new Date(agentReleaseSnapshot.checkedAt).getTime() : 0;
    if (agentReleaseSnapshot && Date.now() - checkedAt < AGENT_RELEASE_CACHE_TTL_MS) return agentReleaseSnapshot;
    return forceAgentReleaseRefresh();
  };

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

  type ManagedAgentOperationStatus = "SENT" | "SUCCESS" | "FAILED" | "TIMEOUT";
  interface ManagedAgentOperationRecord {
    id: string;
    agentId: string;
    operation: "LIST" | "DEPLOY" | "UPDATE" | "REMOVE" | "CHECK_TOKEN" | "GET_PROXMOX_CONFIG" | "SET_PROXMOX_CONFIG" | "DELETE_PROXMOX_CONFIG";
    status: ManagedAgentOperationStatus;
    result: unknown;
    error: string | null;
    createdAt: Date;
    expiresAt: Date;
    finishedAt: Date | null;
  }
  const managedAgentOperations = new Map<string, ManagedAgentOperationRecord>();

  interface SupervisorManagedAgentOperationRecord {
    id: string;
    supervisorId: string;
    operation: "LIST" | "DEPLOY" | "UPDATE" | "REMOVE" | "CHECK_TOKEN" | "GET_PROXMOX_CONFIG" | "SET_PROXMOX_CONFIG" | "DELETE_PROXMOX_CONFIG";
    status: ManagedAgentOperationStatus;
    result: unknown;
    error: string | null;
    createdAt: Date;
    expiresAt: Date;
    finishedAt: Date | null;
    deviceAgentId?: string;
    monitoringAgentId?: string;
    assignmentId?: string;
    expectedTokenHash?: string;
    targetVersion?: string;
    agentType?: "device-agent" | "monitor-agent";
    instance?: string;
    progress?: Array<{ step: string; elapsedMs: number; receivedAt: Date; details: Record<string, unknown> }>;
  }
  const supervisorManagedAgentOperations = new Map<string, SupervisorManagedAgentOperationRecord>();

  const loadSupervisorAssignments = async (supervisorId: string): Promise<SupervisorManagedAssignmentRow[]> => {
    const result = await pool.query<SupervisorManagedAssignmentRow>(
      `SELECT * FROM supervisor_managed_agents WHERE supervisor_agent_id=$1 ORDER BY agent_type,instance,id`,
      [supervisorId]
    );
    return result.rows;
  };

  const reconcileSupervisorReportedAgents = async (supervisorId: string, reported: Array<Record<string, unknown>>): Promise<void> => {
    for (const item of reported) {
      const managementId = typeof item.management_id === "string" ? item.management_id : null;
      if (!managementId) continue;
      const version = typeof item.configured_version === "string" ? item.configured_version : null;
      const localState = typeof item.container_state === "string" ? item.container_state : null;
      const installDir = typeof item.install_dir === "string" ? item.install_dir : null;
      const composeProject = typeof item.compose_project === "string" ? item.compose_project : null;
      const installed = item.installed === true;
      await pool.query(`UPDATE supervisor_managed_agents SET
        install_dir=COALESCE($3,install_dir),compose_project=COALESCE($4,compose_project),reported_version=$5,local_state=$6,
        reconciliation_status=CASE WHEN $7 THEN 'MANAGED' ELSE 'MISSING' END,updated_at=NOW()
        WHERE id=$1 AND supervisor_agent_id=$2`,
        [managementId, supervisorId, installDir, composeProject, version, localState, installed]
      );
      const assignment = await pool.query<{ agent_type: "device-agent" | "monitor-agent"; device_agent_id: string | null; monitoring_agent_id: string | null }>(
        `SELECT agent_type,device_agent_id,monitoring_agent_id FROM supervisor_managed_agents WHERE id=$1 AND supervisor_agent_id=$2`,
        [managementId, supervisorId]
      );
      const association = assignment.rows[0];
      const agentId = association?.agent_type === "device-agent" ? association.device_agent_id : association?.monitoring_agent_id;
      if (association && agentId) {
        const table = association.agent_type === "device-agent" ? "device_agents" : "monitoring_agents";
        await pool.query(`UPDATE ${table} SET
          configured_version=COALESCE($2,configured_version),container_state=COALESCE($3,container_state),
          self_update_supported=TRUE,host_networks=COALESCE((SELECT host_networks FROM supervisor_agents WHERE id=$4),'[]'::jsonb),updated_at=NOW()
          WHERE id=$1`, [agentId, version, localState, supervisorId]);
      }
    }
  };

  const upsertSupervisorAssignment = async (supervisorId: string, input: { agentType: "device-agent" | "monitor-agent"; agentId: string; instance: string; installDir?: string; desiredVersion?: string }): Promise<SupervisorManagedAssignmentRow> => {
    const idColumn = input.agentType === "device-agent" ? "device_agent_id" : "monitoring_agent_id";
    const otherColumn = input.agentType === "device-agent" ? "monitoring_agent_id" : "device_agent_id";
    const sourceTable = input.agentType === "device-agent" ? "device_agents" : "monitoring_agents";
    const exists = await pool.query(`SELECT 1 FROM ${sourceTable} WHERE id=$1`, [input.agentId]);
    if (!exists.rows[0]) throw new Error(`${input.agentType === "device-agent" ? "Device" : "Monitoring"} Agent not found`);
    const service = input.agentType === "device-agent" ? "device-agent" : "monitor-agent";
    const result = await pool.query<SupervisorManagedAssignmentRow>(`INSERT INTO supervisor_managed_agents(
      supervisor_agent_id,agent_type,${idColumn},${otherColumn},instance,install_dir,compose_service,desired_version
    ) VALUES($1,$2,$3,NULL,$4,$5,$6,$7)
    ON CONFLICT(supervisor_agent_id,agent_type,instance) DO UPDATE SET
      ${idColumn}=EXCLUDED.${idColumn},${otherColumn}=NULL,install_dir=COALESCE(EXCLUDED.install_dir,supervisor_managed_agents.install_dir),
      compose_service=EXCLUDED.compose_service,desired_version=COALESCE(EXCLUDED.desired_version,supervisor_managed_agents.desired_version),updated_at=NOW()
    RETURNING *`, [supervisorId,input.agentType,input.agentId,input.instance,input.installDir ?? null,service,input.desiredVersion ?? null]);
    return result.rows[0]!;
  };

  const enrichSupervisorManagedAgents = async (supervisorId: string, reported: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>> => {
    type EnrichedAssignmentRow = SupervisorManagedAssignmentRow & { agent_name: string | null };
    const assignments = await pool.query<EnrichedAssignmentRow>(`
      SELECT sma.*, COALESCE(da.name, ma.name) AS agent_name
      FROM supervisor_managed_agents sma
      LEFT JOIN device_agents da ON da.id=sma.device_agent_id
      LEFT JOIN monitoring_agents ma ON ma.id=sma.monitoring_agent_id
      WHERE sma.supervisor_agent_id=$1
      ORDER BY sma.agent_type,sma.instance,sma.id`, [supervisorId]);
    const byId = new Map(assignments.rows.map(row => [row.id, row]));
    const reportedIds = new Set<string>();
    const associationPayload = (row: EnrichedAssignmentRow) => ({
      id: row.id,
      agent_id: row.device_agent_id ?? row.monitoring_agent_id,
      agent_name: row.agent_name,
      agent_type: row.agent_type,
      instance: row.instance,
      install_dir: row.install_dir,
      compose_project: row.compose_project,
      compose_service: row.compose_service,
      desired_version: row.desired_version,
      reported_version: row.reported_version,
      local_state: row.local_state,
      reconciliation_status: row.reconciliation_status,
      updated_at: row.updated_at.toISOString()
    });
    const enriched = reported.map(entry => {
      const managementId = typeof entry.management_id === "string" ? entry.management_id : null;
      if (!managementId) return entry;
      reportedIds.add(managementId);
      const assignment = byId.get(managementId);
      if (!assignment) return entry;
      return { ...entry, agent_name: assignment.agent_name, runtime_reported: true, sensor_sphere_association: associationPayload(assignment) };
    });
    for (const assignment of assignments.rows) {
      if (reportedIds.has(assignment.id)) continue;
      enriched.push({
        agent_type: assignment.agent_type,
        instance: assignment.instance,
        installed: false,
        management_id: assignment.id,
        sensor_sphere_agent_id: assignment.device_agent_id ?? assignment.monitoring_agent_id,
        install_dir: assignment.install_dir,
        configured_version: assignment.reported_version,
        container_state: assignment.local_state ?? "not_reported",
        reconciliation_status: assignment.reconciliation_status,
        agent_name: assignment.agent_name,
        runtime_reported: false,
        sensor_sphere_association: associationPayload(assignment)
      });
    }
    return enriched;
  };

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

  const managedAgentOperationDto = (record: ManagedAgentOperationRecord) => ({
    commandId: record.id,
    agentId: record.agentId,
    operation: record.operation,
    status: record.status,
    result: record.result,
    error: record.error,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    finishedAt: record.finishedAt?.toISOString() ?? null
  });

  const supervisorManagedAgentOperationDto = (record: SupervisorManagedAgentOperationRecord) => ({
    commandId: record.id,
    supervisorId: record.supervisorId,
    operation: record.operation,
    status: record.status,
    result: record.result,
    error: record.error,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    finishedAt: record.finishedAt?.toISOString() ?? null,
    agentType: record.agentType ?? null,
    instance: record.instance ?? "main",
    targetVersion: record.targetVersion ?? null,
    progress: (record.progress ?? []).map(item => ({ step: item.step, elapsedMs: item.elapsedMs, receivedAt: item.receivedAt.toISOString(), details: item.details }))
  });

  const persistSupervisorManagedAgentOperation = async (record: SupervisorManagedAgentOperationRecord): Promise<void> => {
    if (!["DEPLOY", "UPDATE", "REMOVE"].includes(record.operation)) return;
    await pool.query(`INSERT INTO supervisor_managed_agent_operations(
      command_id,supervisor_agent_id,operation,agent_type,instance,device_agent_id,monitoring_agent_id,target_version,status,error,progress,created_at,expires_at,finished_at,updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,NOW())
    ON CONFLICT (command_id) DO UPDATE SET
      status=EXCLUDED.status,error=EXCLUDED.error,progress=EXCLUDED.progress,finished_at=EXCLUDED.finished_at,updated_at=NOW()`, [
      record.id, record.supervisorId, record.operation, record.agentType ?? null, record.instance ?? "main",
      record.deviceAgentId ?? null, record.monitoringAgentId ?? null, record.targetVersion ?? null, record.status, record.error,
      JSON.stringify((record.progress ?? []).map(item => ({ step: item.step, elapsedMs: item.elapsedMs, receivedAt: item.receivedAt.toISOString(), details: item.details }))),
      record.createdAt, record.expiresAt, record.finishedAt
    ]);
  };

  const expireManagedAgentOperations = () => {
    const now = Date.now();
    for (const record of managedAgentOperations.values()) {
      if (record.status === "SENT" && record.expiresAt.getTime() <= now) {
        record.status = "TIMEOUT";
        record.error = "Managed Agent operation timed out";
        record.finishedAt = new Date();
      }
      if (record.finishedAt && now - record.finishedAt.getTime() > 10 * 60 * 1000) managedAgentOperations.delete(record.id);
    }
    for (const record of supervisorManagedAgentOperations.values()) {
      if (record.status === "SENT" && record.expiresAt.getTime() <= now) {
        record.status = "TIMEOUT";
        record.error = "Supervisor managed-agent operation timed out";
        record.finishedAt = new Date();
        app.log.warn({ supervisorId: record.supervisorId, commandId: record.id, operation: record.operation, progressSteps: record.progress?.length ?? 0, lastProgress: record.progress?.at(-1)?.step ?? null }, "Supervisor managed command timed out");
        void persistSupervisorManagedAgentOperation(record).catch(error => app.log.error({ err: error, commandId: record.id }, "Unable to persist timed-out managed-agent operation"));
        if (record.operation === "UPDATE" && record.deviceAgentId) {
          void pool.query(`UPDATE device_agents SET
            update_status='FAILED',update_finished_at=NOW(),update_error=$3,updated_at=NOW()
            WHERE id=$1 AND update_command_id=$2 AND update_status IN ('UPDATE_REQUESTED','UPDATING','VERIFYING','FAILED')`,
            [record.deviceAgentId, record.id, record.error]
          ).catch(error => app.log.error({ err: error, commandId: record.id }, "Unable to persist timed-out Device Agent update"));
        }
        if (record.operation === "UPDATE" && record.monitoringAgentId) {
          void pool.query(`UPDATE monitoring_agents SET
            update_status='FAILED',update_finished_at=NOW(),update_error=$3,updated_at=NOW()
            WHERE id=$1 AND update_status IN ('UPDATE_REQUESTED','REQUESTED','UPDATING','VERIFYING')
              AND desired_version IS NOT DISTINCT FROM $2`,
            [record.monitoringAgentId, record.targetVersion ?? null, record.error]
          ).catch(error => app.log.error({ err: error, commandId: record.id }, "Unable to persist timed-out Monitoring Agent update"));
        }
        if (record.assignmentId) {
          void pool.query(`UPDATE supervisor_managed_agents SET reconciliation_status='ERROR',updated_at=NOW() WHERE id=$1`, [record.assignmentId])
            .catch(error => app.log.error({ err: error, commandId: record.id }, "Unable to mark timed-out managed-agent association"));
        }
      }
      if (record.finishedAt && now - record.finishedAt.getTime() > 10 * 60 * 1000) supervisorManagedAgentOperations.delete(record.id);
    }
  };

  const managedOperationExpiryTimer = setInterval(expireManagedAgentOperations, 15_000);
  managedOperationExpiryTimer.unref();

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
              supervisor_version=$11, supervisor_configured_version=$12, supervisor_container_state=$13,
              supervisor_self_update_supported=$14,
              supervisor_update_status=CASE
                WHEN supervisor_desired_version IS NOT NULL AND $11 = supervisor_desired_version AND supervisor_update_status IN ('UPDATE_REQUESTED','UPDATING','VERIFYING','FAILED') THEN 'UPDATED'
                ELSE COALESCE(NULLIF($15,''), supervisor_update_status)
              END,
              supervisor_desired_version=CASE
                WHEN supervisor_desired_version IS NOT NULL AND $11 = supervisor_desired_version AND supervisor_update_status IN ('UPDATE_REQUESTED','UPDATING','VERIFYING','FAILED') THEN NULL
                ELSE supervisor_desired_version
              END,
              supervisor_update_finished_at=CASE
                WHEN supervisor_desired_version IS NOT NULL AND $11 = supervisor_desired_version AND supervisor_update_status IN ('UPDATE_REQUESTED','UPDATING','VERIFYING','FAILED') THEN NOW()
                ELSE supervisor_update_finished_at
              END,
              supervisor_update_error=CASE
                WHEN supervisor_desired_version IS NOT NULL AND $11 = supervisor_desired_version AND supervisor_update_status IN ('UPDATE_REQUESTED','UPDATING','VERIFYING','FAILED') THEN NULL
                WHEN $16::text IS NOT NULL THEN $16::text
                ELSE supervisor_update_error
              END,
              update_status=CASE
                WHEN desired_version IS NOT NULL AND $3 = desired_version AND update_status IN ('UPDATE_REQUESTED','UPDATING','VERIFYING','FAILED') THEN 'UPDATED'
                ELSE update_status
              END,
              desired_version=CASE
                WHEN desired_version IS NOT NULL AND $3 = desired_version AND update_status IN ('UPDATE_REQUESTED','UPDATING','VERIFYING','FAILED') THEN NULL
                ELSE desired_version
              END,
              update_finished_at=CASE
                WHEN desired_version IS NOT NULL AND $3 = desired_version AND update_status IN ('UPDATE_REQUESTED','UPDATING','VERIFYING','FAILED') THEN NOW()
                ELSE update_finished_at
              END,
              update_error=CASE
                WHEN desired_version IS NOT NULL AND $3 = desired_version AND update_status IN ('UPDATE_REQUESTED','UPDATING','VERIFYING','FAILED') THEN NULL
                ELSE update_error
              END,
              last_successful_update_at=CASE
                WHEN desired_version IS NOT NULL AND $3 = desired_version AND update_status IN ('UPDATE_REQUESTED','UPDATING','VERIFYING','FAILED') THEN NOW()
                ELSE last_successful_update_at
              END,
              last_successful_update_version=CASE
                WHEN desired_version IS NOT NULL AND $3 = desired_version AND update_status IN ('UPDATE_REQUESTED','UPDATING','VERIFYING','FAILED') THEN $3
                ELSE last_successful_update_version
              END,
              last_seen_at=NOW(), updated_at=NOW()
            WHERE id=$1
          `, [agent.id, message.agentName ?? null, message.version ?? null, message.hostname ?? null, JSON.stringify(labels), JSON.stringify(message.capabilities ?? []),
              message.systemInfo?.os ?? null, message.systemInfo?.osVersion ?? null, message.systemInfo?.architecture ?? null, message.supervisor?.available ?? message.agentUpdate?.supported ?? false,
              message.supervisor?.version ?? null, message.supervisor?.configuredVersion ?? null, message.supervisor?.containerState ?? null, message.supervisor?.selfUpdateSupported ?? false,
              message.supervisor?.updateStatus ?? null, message.supervisor?.updateError ?? null]);
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
          const nextStatus = message.status === "ACCEPTED"
            ? "VERIFYING"
            : message.status === "SUCCESS"
              ? "UPDATED"
              : "FAILED";
          await pool.query(`
            UPDATE device_agents SET
              update_status=$3,
              update_started_at=CASE WHEN $3 IN ('VERIFYING','UPDATED') THEN COALESCE(update_started_at,NOW()) ELSE update_started_at END,
              update_finished_at=CASE WHEN $3 IN ('UPDATED','FAILED') THEN NOW() ELSE update_finished_at END,
              update_error=CASE WHEN $3='FAILED' THEN COALESCE($4,'Device Agent update failed') ELSE NULL END,
              desired_version=CASE WHEN $3='UPDATED' THEN NULL ELSE desired_version END,
              previous_version=COALESCE(previous_version,$5),
              last_successful_update_at=CASE WHEN $3='UPDATED' THEN NOW() ELSE last_successful_update_at END,
              last_successful_update_version=CASE WHEN $3='UPDATED' THEN COALESCE($6,version,last_successful_update_version) ELSE last_successful_update_version END,
              updated_at=NOW()
            WHERE id=$1 AND update_command_id=$2
          `, [agent.id, message.commandId, nextStatus, message.error ?? null, message.currentVersion ?? null, message.targetVersion ?? null]);
          return;
        }

        if (message.type === "SUPERVISOR_UPDATE_RESULT") {
          const nextStatus = message.status === "ACCEPTED"
            ? "VERIFYING"
            : message.status === "SUCCESS"
              ? "UPDATED"
              : "FAILED";
          await pool.query(`
            UPDATE device_agents SET
              supervisor_update_status=$3,
              supervisor_update_started_at=CASE WHEN $3 IN ('VERIFYING','UPDATED') THEN COALESCE(supervisor_update_started_at,NOW()) ELSE supervisor_update_started_at END,
              supervisor_update_finished_at=CASE WHEN $3 IN ('UPDATED','FAILED') THEN NOW() ELSE supervisor_update_finished_at END,
              supervisor_update_error=CASE WHEN $3='FAILED' THEN COALESCE($4,'Supervisor Agent update failed') ELSE NULL END,
              supervisor_desired_version=CASE WHEN $3='UPDATED' THEN NULL ELSE supervisor_desired_version END,
              supervisor_previous_version=COALESCE(supervisor_previous_version,$5),
              supervisor_version=CASE WHEN $3='UPDATED' THEN COALESCE($6,supervisor_version) ELSE supervisor_version END,
              supervisor_configured_version=CASE WHEN $3='UPDATED' THEN COALESCE($6,supervisor_configured_version) ELSE supervisor_configured_version END,
              updated_at=NOW()
            WHERE id=$1 AND supervisor_update_command_id=$2
          `, [agent.id, message.commandId, nextStatus, message.error ?? null, message.currentVersion ?? null, message.targetVersion ?? null]);
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

        if (message.type === "MANAGED_AGENT_RESULT") {
          const operation = managedAgentOperations.get(message.commandId);
          if (!operation || operation.agentId !== agent.id) return;
          if (operation.operation !== message.operation) {
            operation.status = "FAILED";
            operation.error = `Managed Agent operation mismatch: expected ${operation.operation}, received ${message.operation}`;
          } else {
            operation.status = message.status;
            operation.result = message.result ?? null;
            operation.error = message.error ?? null;
          }
          operation.finishedAt = new Date();
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

          if (discovery.status === "SUCCESS") {
            const releasedTombstones = await pool.query(`
              DELETE FROM device_control_entity_exclusions e
              USING device_control_states s
              WHERE e.lifecycle = 'HARD_DELETED'
                AND s.device_id = e.device_id
                AND s.agent_id = $1
                AND UPPER(s.provider) = UPPER($2)
                AND e.provider = UPPER($2)
            `, [agent.id, message.provider]);
            if ((releasedTombstones.rowCount ?? 0) > 0) {
              app.log.info({
                agentId: agent.id,
                provider: message.provider,
                released: releasedTombstones.rowCount
              }, "Released hard-deleted entity tombstones after successful discovery");
            }
          }
        }
      })().catch(error => app.log.error({ err: error, agentId: agent.id }, "Device agent WebSocket message failed"));
    });

    socket.on("close", () => {
      if (sockets.get(agent.id) === socket) sockets.delete(agent.id);
    });
  };

  const handleSupervisorConnection = (socket: WebSocket, supervisor: SupervisorAgentRow) => {
    const previous = supervisorSockets.get(supervisor.id);
    if (previous && previous !== socket) previous.close(4001, "Replaced by a newer connection");
    supervisorSockets.set(supervisor.id, socket);
    void pool.query("UPDATE supervisor_agents SET last_seen_at=NOW(),updated_at=NOW() WHERE id=$1", [supervisor.id]);
    socket.on("message", data => {
      void (async () => {
        let raw: unknown;
        try { raw = JSON.parse(data.toString()); } catch { socket.send(JSON.stringify({ type: "ERROR", error: "Invalid JSON" })); return; }
        const parsed = supervisorRemoteMessageSchema.safeParse(raw);
        if (!parsed.success) { socket.send(JSON.stringify({ type: "ERROR", error: parsed.error.issues[0]?.message ?? "Invalid message" })); return; }
        const message = parsed.data;
        if (message.type === "SUPERVISOR_COMMAND_PROGRESS") {
          const operation = supervisorManagedAgentOperations.get(message.commandId);
          if (!operation || operation.supervisorId !== supervisor.id) {
            app.log.warn({ supervisorId: supervisor.id, commandId: message.commandId, operation: message.operation, step: message.step }, "Ignoring Supervisor managed command progress for unknown operation");
            return;
          }
          if (operation.operation !== message.operation) {
            app.log.warn({ supervisorId: supervisor.id, commandId: message.commandId, expectedOperation: operation.operation, receivedOperation: message.operation, step: message.step }, "Ignoring mismatched Supervisor managed command progress");
            return;
          }
          const progress = operation.progress ?? (operation.progress = []);
          progress.push({ step: message.step, elapsedMs: message.elapsedMs, receivedAt: new Date(), details: message.details ?? {} });
          if (progress.length > 100) progress.splice(0, progress.length - 100);
          app.log.info({ supervisorId: supervisor.id, commandId: message.commandId, operation: message.operation, agentType: message.agentType ?? null, instance: message.instance, step: message.step, elapsedMs: message.elapsedMs }, "Supervisor managed command progress");
          await persistSupervisorManagedAgentOperation(operation);
          return;
        }
        if (message.type === "SUPERVISOR_COMMAND_RESULT") {
          if (message.operation !== "UPDATE_SELF") {
            const operation = supervisorManagedAgentOperations.get(message.commandId);
            if (!operation || operation.supervisorId !== supervisor.id) {
              app.log.warn({ supervisorId: supervisor.id, commandId: message.commandId, operation: message.operation, status: message.status }, "Ignoring Supervisor managed command result for unknown operation");
              return;
            }
            app.log.info({ supervisorId: supervisor.id, commandId: message.commandId, operation: message.operation, status: message.status, progressSteps: operation.progress?.length ?? 0 }, "Supervisor managed command result received");
            if (operation.operation !== message.operation) {
              operation.status = "FAILED";
              operation.error = `Supervisor managed-agent operation mismatch: expected ${operation.operation}, received ${message.operation}`;
            } else {
              operation.status = message.status;
              operation.error = message.error ?? null;
              if (message.operation === "CHECK_TOKEN" && message.status === "SUCCESS") {
                const resultObject = message.result && typeof message.result === "object" ? message.result as Record<string, unknown> : {};
                const configuredHash = typeof resultObject.configured_token_hash === "string" ? resultObject.configured_token_hash : null;
                const runtimeHash = typeof resultObject.runtime_token_hash === "string" ? resultObject.runtime_token_hash : null;
                const fallbackHash = typeof resultObject.token_hash === "string" ? resultObject.token_hash : null;
                const expectedHash = operation.expectedTokenHash ?? null;
                const configuredMatches = Boolean(configuredHash && expectedHash && configuredHash === expectedHash);
                const runtimeMatches = Boolean(runtimeHash && expectedHash && runtimeHash === expectedHash);
                const fallbackMatches = Boolean(fallbackHash && expectedHash && fallbackHash === expectedHash);
                const runtimePresent = resultObject.runtime_token_present === true;
                const isSupervisorSelfCheck = operation.assignmentId == null && operation.deviceAgentId == null && operation.monitoringAgentId == null;
                operation.result = {
                  matches: isSupervisorSelfCheck ? (runtimePresent ? runtimeMatches : fallbackMatches) : (runtimePresent ? runtimeMatches : false),
                  configuredMatches,
                  runtimeMatches,
                  runtimePresent,
                  expectedFingerprint: tokenFingerprint(expectedHash),
                  configuredFingerprint: tokenFingerprint(configuredHash),
                  runtimeFingerprint: tokenFingerprint(runtimeHash),
                  deployedFingerprint: tokenFingerprint(runtimeHash ?? fallbackHash),
                  containerState: typeof resultObject.container_state === "string" ? resultObject.container_state : null,
                  configuredSensorSphereUrl: typeof resultObject.configured_sensorsphere_url === "string" ? resultObject.configured_sensorsphere_url : null,
                  runtimeSensorSphereUrl: typeof resultObject.runtime_sensorsphere_url === "string" ? resultObject.runtime_sensorsphere_url : null,
                  agentType: typeof resultObject.agent_type === "string" ? resultObject.agent_type : null,
                  instance: typeof resultObject.instance === "string" ? resultObject.instance : null,
                  installDir: typeof resultObject.install_dir === "string" ? resultObject.install_dir : null
                };
              } else if (message.operation === "DEPLOY" && message.status === "SUCCESS" && operation.expectedTokenHash) {
                const resultObject = message.result && typeof message.result === "object" ? { ...(message.result as Record<string, unknown>) } : {};
                const configuredHash = typeof resultObject.configured_token_hash === "string" ? resultObject.configured_token_hash : null;
                const runtimeHash = typeof resultObject.runtime_token_hash === "string" ? resultObject.runtime_token_hash : null;
                const fallbackHash = typeof resultObject.token_hash === "string" ? resultObject.token_hash : null;
                delete resultObject.token_hash;
                delete resultObject.configured_token_hash;
                delete resultObject.runtime_token_hash;
                resultObject.configuredTokenFingerprint = tokenFingerprint(configuredHash);
                resultObject.runtimeTokenFingerprint = tokenFingerprint(runtimeHash);
                resultObject.tokenFingerprint = tokenFingerprint(runtimeHash ?? fallbackHash);
                if (!configuredHash || configuredHash !== operation.expectedTokenHash || !runtimeHash || runtimeHash !== operation.expectedTokenHash) {
                  operation.status = "FAILED";
                  operation.error = !configuredHash || configuredHash !== operation.expectedTokenHash
                    ? "Supervisor wrote an agent token that does not match the SensorSphere identity"
                    : "Running agent container is not using the SensorSphere token written by the Supervisor";
                  resultObject.expectedTokenFingerprint = tokenFingerprint(operation.expectedTokenHash);
                }
                operation.result = resultObject;
              } else {
                operation.result = message.result ?? null;
              }
            }
            operation.finishedAt = new Date();
            if (operation.assignmentId) {
              const resultObject = message.result && typeof message.result === "object" ? message.result as Record<string, unknown> : {};
              const reportedVersion = typeof resultObject.configured_version === "string" ? resultObject.configured_version : typeof resultObject.target_version === "string" ? resultObject.target_version : null;
              const localState = typeof resultObject.container_state === "string" ? resultObject.container_state : null;
              const installDir = typeof resultObject.install_dir === "string" ? resultObject.install_dir : null;
              await pool.query(`UPDATE supervisor_managed_agents SET
                install_dir=COALESCE($2,install_dir),reported_version=COALESCE($3,reported_version),local_state=COALESCE($4,local_state),
                reconciliation_status=CASE WHEN $5='SUCCESS' AND $6<>'REMOVE' THEN 'MANAGED' WHEN $5='SUCCESS' AND $6='REMOVE' THEN 'MISSING' ELSE 'ERROR' END,
                updated_at=NOW() WHERE id=$1`, [operation.assignmentId,installDir,reportedVersion,localState,operation.status,operation.operation]);
            }
            if (operation.deviceAgentId && operation.operation === "UPDATE") {
              const deviceStatus = operation.status === "SUCCESS" ? "VERIFYING" : "FAILED";
              await pool.query(`UPDATE device_agents SET
                update_status=CASE
                  WHEN $2='VERIFYING' AND (
                    (desired_version IS NOT NULL AND version=desired_version)
                    OR ($4::text IS NOT NULL AND version=$4::text)
                    OR (desired_version IS NULL AND last_successful_update_version IS NOT NULL AND version=last_successful_update_version)
                  ) THEN 'UPDATED'
                  ELSE $2
                END,
                desired_version=CASE
                  WHEN $2='VERIFYING' AND (
                    (desired_version IS NOT NULL AND version=desired_version)
                    OR ($4::text IS NOT NULL AND version=$4::text)
                    OR (desired_version IS NULL AND last_successful_update_version IS NOT NULL AND version=last_successful_update_version)
                  ) THEN NULL
                  ELSE desired_version
                END,
                update_started_at=COALESCE(update_started_at,NOW()),
                update_finished_at=CASE
                  WHEN $2='FAILED' THEN NOW()
                  WHEN $2='VERIFYING' AND (
                    (desired_version IS NOT NULL AND version=desired_version)
                    OR ($4::text IS NOT NULL AND version=$4::text)
                    OR (desired_version IS NULL AND last_successful_update_version IS NOT NULL AND version=last_successful_update_version)
                  ) THEN COALESCE(update_finished_at,NOW())
                  ELSE update_finished_at
                END,
                update_error=CASE
                  WHEN $2='FAILED' THEN COALESCE($3,'Supervisor-managed Device Agent update failed')
                  WHEN $2='VERIFYING' AND (
                    (desired_version IS NOT NULL AND version=desired_version)
                    OR ($4::text IS NOT NULL AND version=$4::text)
                    OR (desired_version IS NULL AND last_successful_update_version IS NOT NULL AND version=last_successful_update_version)
                  ) THEN NULL
                  ELSE update_error
                END,
                last_successful_update_at=CASE
                  WHEN $2='VERIFYING' AND (
                    (desired_version IS NOT NULL AND version=desired_version)
                    OR ($4::text IS NOT NULL AND version=$4::text)
                    OR (desired_version IS NULL AND last_successful_update_version IS NOT NULL AND version=last_successful_update_version)
                  ) THEN COALESCE(last_successful_update_at,NOW())
                  ELSE last_successful_update_at
                END,
                last_successful_update_version=CASE
                  WHEN $2='VERIFYING' AND (
                    (desired_version IS NOT NULL AND version=desired_version)
                    OR ($4::text IS NOT NULL AND version=$4::text)
                    OR (desired_version IS NULL AND last_successful_update_version IS NOT NULL AND version=last_successful_update_version)
                  ) THEN COALESCE(version,$4::text,last_successful_update_version)
                  ELSE last_successful_update_version
                END,
                updated_at=NOW()
                WHERE id=$1`, [operation.deviceAgentId, deviceStatus, operation.error, operation.targetVersion ?? null]);
            }
            if (operation.monitoringAgentId && operation.operation === "UPDATE") {
              const monitoringStatus = operation.status === "SUCCESS" ? "VERIFYING" : "FAILED";
              await pool.query(`UPDATE monitoring_agents SET
                update_status=CASE
                  WHEN $2='VERIFYING' AND desired_version IS NULL AND last_successful_update_version IS NOT NULL AND version=last_successful_update_version THEN 'UPDATED'
                  ELSE $2
                END,
                update_error=CASE WHEN $2='FAILED' THEN COALESCE($3,'Supervisor-managed Monitoring Agent update failed') ELSE NULL END,
                update_finished_at=CASE WHEN $2='FAILED' THEN NOW() ELSE update_finished_at END,
                updated_at=NOW()
                WHERE id=$1`, [operation.monitoringAgentId, monitoringStatus, operation.error]);
            }
            await pool.query("UPDATE supervisor_agents SET last_seen_at=NOW(),updated_at=NOW() WHERE id=$1", [supervisor.id]);
            await persistSupervisorManagedAgentOperation(operation);
            return;
          }
          const nextStatus = message.status === "FAILED" ? "FAILED" : "UPDATING";
          await pool.query(`UPDATE supervisor_agents SET
            update_status=$2,update_error=$3,
            update_started_at=CASE WHEN $2='UPDATING' AND update_started_at IS NULL THEN NOW() ELSE update_started_at END,
            update_finished_at=CASE WHEN $2='FAILED' THEN NOW() ELSE update_finished_at END,
            last_seen_at=NOW(),updated_at=NOW() WHERE id=$1`,
            [supervisor.id,nextStatus,message.status === "FAILED" ? message.error ?? "Supervisor command failed" : null]);
          return;
        }
        if (message.type === "HELLO") {
          const reportedEnvironment = message.environment ?? "DEFAULT";
          if (reportedEnvironment !== installationEnvironment) {
            socket.send(JSON.stringify({ type: "ERROR", error: `Supervisor environment mismatch: expected ${installationEnvironment}, reported ${reportedEnvironment}` }));
            socket.close(4003, "Supervisor environment mismatch");
            return;
          }
          const self = supervisorSelfStatusFields(message.selfStatus);
          await pool.query(`UPDATE supervisor_agents SET
            reported_name=COALESCE($2,reported_name),version=COALESCE($3,version),hostname=COALESCE($4,hostname),
            os_name=COALESCE($5,os_name),os_version=COALESCE($6,os_version),architecture=COALESCE($7,architecture),
            host_networks=$8::jsonb,managed_agents=$9::jsonb,
            configured_version=COALESCE($10,configured_version),
            container_state=COALESCE($11,container_state),self_update_supported=$12,
            update_status=CASE
              WHEN COALESCE($13,'')='FAILED' THEN 'FAILED'
              WHEN COALESCE($13,'')='ROLLED_BACK' THEN 'ROLLED_BACK'
              WHEN COALESCE($13,'')='UPDATED' AND desired_version IS NOT NULL AND COALESCE($3,version)=desired_version THEN 'UPDATED'
              WHEN COALESCE($13,'')='UPDATED' AND desired_version IS NOT NULL AND COALESCE($3,version)<>desired_version THEN 'UPDATING'
              WHEN update_status IN ('REQUESTED','UPDATE_REQUESTED','UPDATING','VERIFYING') AND COALESCE($13,'')='IDLE' THEN update_status
              WHEN COALESCE($13,'') IN ('REQUESTED','UPDATE_REQUESTED','UPDATING','VERIFYING') THEN COALESCE($13,update_status)
              ELSE update_status
            END,
            update_error=CASE WHEN COALESCE($13,'')='FAILED' THEN $14 WHEN COALESCE($13,'') IN ('UPDATED','ROLLED_BACK') THEN NULL ELSE update_error END,
            update_started_at=CASE WHEN COALESCE($13,'') IN ('REQUESTED','UPDATE_REQUESTED','UPDATING','VERIFYING') AND update_started_at IS NULL THEN NOW() ELSE update_started_at END,
            update_finished_at=CASE WHEN COALESCE($13,'') IN ('UPDATED','FAILED','ROLLED_BACK') THEN NOW() ELSE update_finished_at END,
            last_seen_at=NOW(),updated_at=NOW() WHERE id=$1`,
            [supervisor.id,message.supervisorName ?? null,message.version ?? null,message.hostname ?? null,message.systemInfo?.os ?? null,
             message.systemInfo?.osVersion ?? null,message.systemInfo?.architecture ?? null,JSON.stringify(message.hostNetworks ?? []),JSON.stringify(message.managedAgents ?? []),
             self.configuredVersion,self.containerState,message.selfUpdateSupported ?? true,self.updateStatus,self.updateError]);
          if (self.updateStatus === "UPDATED") {
            await pool.query(`UPDATE supervisor_agents SET
              last_successful_update_at=CASE WHEN last_successful_update_version IS DISTINCT FROM version OR last_successful_update_at IS NULL THEN NOW() ELSE last_successful_update_at END,
              last_successful_update_version=version, desired_version=NULL
              WHERE id=$1 AND desired_version IS NOT NULL AND version=desired_version`, [supervisor.id]);
          }
          await reconcileSupervisorReportedAgents(supervisor.id, message.managedAgents ?? []);
          const assignments = await loadSupervisorAssignments(supervisor.id);
          socket.send(JSON.stringify({
            type: "HELLO_ACK",
            supervisorId: supervisor.id,
            serverTime: new Date().toISOString(),
            managedAssignments: assignments.map(supervisorManagedAssignmentDto)
          }));
          return;
        }
        const self = supervisorSelfStatusFields(message.selfStatus);
        await pool.query(`UPDATE supervisor_agents SET host_networks=$2::jsonb,managed_agents=$3::jsonb,
          configured_version=COALESCE($4,configured_version),
          container_state=COALESCE($5,container_state),
          update_status=CASE
            WHEN COALESCE($6,'')='FAILED' THEN 'FAILED'
            WHEN COALESCE($6,'')='ROLLED_BACK' THEN 'ROLLED_BACK'
            WHEN COALESCE($6,'')='UPDATED' AND desired_version IS NOT NULL AND version=desired_version THEN 'UPDATED'
            WHEN COALESCE($6,'')='UPDATED' AND desired_version IS NOT NULL AND version<>desired_version THEN 'UPDATING'
            WHEN update_status IN ('REQUESTED','UPDATE_REQUESTED','UPDATING','VERIFYING') AND COALESCE($6,'')='IDLE' THEN update_status
            WHEN COALESCE($6,'') IN ('REQUESTED','UPDATE_REQUESTED','UPDATING','VERIFYING') THEN COALESCE($6,update_status)
            ELSE update_status
          END,
          update_error=CASE WHEN COALESCE($6,'')='FAILED' THEN $7 WHEN COALESCE($6,'') IN ('UPDATED','ROLLED_BACK') THEN NULL ELSE update_error END,
          update_started_at=CASE WHEN COALESCE($6,'') IN ('REQUESTED','UPDATE_REQUESTED','UPDATING','VERIFYING') AND update_started_at IS NULL THEN NOW() ELSE update_started_at END,
          update_finished_at=CASE WHEN COALESCE($6,'') IN ('UPDATED','FAILED','ROLLED_BACK') THEN NOW() ELSE update_finished_at END,
          last_seen_at=NOW(),updated_at=NOW() WHERE id=$1`,
          [supervisor.id,JSON.stringify(message.hostNetworks ?? []),JSON.stringify(message.managedAgents ?? []),self.configuredVersion,self.containerState,self.updateStatus,self.updateError]);
        if (self.updateStatus === "UPDATED") {
          await pool.query(`UPDATE supervisor_agents SET
            last_successful_update_at=CASE WHEN last_successful_update_version IS DISTINCT FROM version OR last_successful_update_at IS NULL THEN NOW() ELSE last_successful_update_at END,
            last_successful_update_version=version, desired_version=NULL
            WHERE id=$1 AND desired_version IS NOT NULL AND version=desired_version`, [supervisor.id]);
        }
        await reconcileSupervisorReportedAgents(supervisor.id, message.managedAgents ?? []);
        socket.send(JSON.stringify({ type: "HEARTBEAT_ACK", serverTime: new Date().toISOString() }));
      })().catch(error => app.log.error({ err: error, supervisorId: supervisor.id }, "Supervisor Agent WebSocket message failed"));
    });
    socket.on("close", () => { if (supervisorSockets.get(supervisor.id) === socket) supervisorSockets.delete(supervisor.id); });
  };

  app.server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/api/v1/device-control/supervisor/ws") {
      void (async () => {
        const supervisor = await authenticateSupervisor(pool, request);
        if (!supervisor) { socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"); socket.destroy(); return; }
        supervisorWss.handleUpgrade(request, socket, head, ws => handleSupervisorConnection(ws, supervisor));
      })().catch(error => { app.log.error({ err: error }, "Supervisor Agent WebSocket upgrade failed"); socket.destroy(); });
      return;
    }
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
    for (const socket of supervisorSockets.values()) socket.close(1001, "Server shutting down");
    wss.close();
    supervisorWss.close();
  });

  app.get("/api/v1/device-control/environment", async (_request, reply) => {
    return reply.send({ environment: installationEnvironment });
  });

  app.get("/api/v1/device-control/supervisors", async (_request, reply) => {
    const result = await pool.query<SupervisorAgentRow>("SELECT * FROM supervisor_agents ORDER BY LOWER(name),id");
    const payload = await Promise.all(result.rows.map(async row => {
      const dto = supervisorAgentDto(row, supervisorSockets.has(row.id));
      return { ...dto, managedAgents: await enrichSupervisorManagedAgents(row.id, dto.managedAgents) };
    }));
    return reply.send(payload);
  });

  app.post("/api/v1/device-control/supervisors", async (request: FastifyRequest<{ Body: unknown }>, reply) => {
    const parsed = supervisorCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid Supervisor Agent" });
    const token = generateSupervisorToken();
    const result = await pool.query<SupervisorAgentRow>(`INSERT INTO supervisor_agents(name,token_hash,labels,heartbeat_timeout_seconds) VALUES($1,$2,$3::jsonb,$4) RETURNING *`,
      [parsed.data.name,hashToken(token),JSON.stringify(parsed.data.labels ?? {}),parsed.data.heartbeatTimeoutSeconds ?? 60]);
    return reply.code(201).send({ supervisor: supervisorAgentDto(result.rows[0]!, false), token });
  });

  app.patch("/api/v1/device-control/supervisors/:id", async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply) => {
    const parsed = supervisorUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid Supervisor Agent" });
    const input = parsed.data;
    const result = await pool.query<SupervisorAgentRow>(`UPDATE supervisor_agents SET
      name=COALESCE($2,name), enabled=COALESCE($3,enabled), labels=COALESCE($4::jsonb,labels), heartbeat_timeout_seconds=COALESCE($5,heartbeat_timeout_seconds), updated_at=NOW()
      WHERE id=$1 RETURNING *`, [request.params.id,input.name ?? null,input.enabled ?? null,input.labels == null ? null : JSON.stringify(input.labels),input.heartbeatTimeoutSeconds ?? null]);
    if (!result.rows[0]) return reply.code(404).send({ error: "Supervisor Agent not found" });
    if (input.enabled === false) supervisorSockets.get(request.params.id)?.close(4003,"Supervisor disabled");
    return reply.send(supervisorAgentDto(result.rows[0], supervisorSockets.has(request.params.id)));
  });

  app.post("/api/v1/device-control/supervisors/:id/update", async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply) => {
    const parsed = supervisorSelfUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid Supervisor version" });
    const result = await pool.query<SupervisorAgentRow>("SELECT * FROM supervisor_agents WHERE id=$1", [request.params.id]);
    const supervisor = result.rows[0];
    if (!supervisor) return reply.code(404).send({ error: "Supervisor Agent not found" });
    if (!supervisor.enabled) return reply.code(409).send({ error: "Supervisor Agent is disabled" });
    if (!supervisor.self_update_supported) return reply.code(409).send({ error: "Supervisor Agent does not support self-update" });
    const socket = supervisorSockets.get(supervisor.id);
    if (!socket || socket.readyState !== WebSocket.OPEN) return reply.code(409).send({ error: "Supervisor Agent is offline" });
    const commandId = randomUUID();
    // Persist the requested lifecycle before sending the command. A fast Supervisor can
    // otherwise answer UPDATING before this handler writes REQUESTED, causing the UI
    // to momentarily regress to the previous stable/freshness state.
    await pool.query(`UPDATE supervisor_agents SET
      previous_version=version,desired_version=$2,update_status='REQUESTED',update_requested_at=NOW(),update_started_at=NULL,update_finished_at=NULL,update_error=NULL,updated_at=NOW()
      WHERE id=$1`, [supervisor.id,parsed.data.version]);
    socket.send(JSON.stringify({ type: "SUPERVISOR_COMMAND", commandId, operation: "UPDATE_SELF", version: parsed.data.version }));
    return reply.code(202).send({ commandId, status: "REQUESTED", version: parsed.data.version });
  });

  app.post("/api/v1/device-control/supervisors/:id/managed-agents", async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply) => {
    expireManagedAgentOperations();
    const parsed = managedAgentRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid Supervisor managed-agent request" });
    const result = await pool.query<SupervisorAgentRow>("SELECT * FROM supervisor_agents WHERE id=$1", [request.params.id]);
    const supervisor = result.rows[0];
    if (!supervisor) return reply.code(404).send({ error: "Supervisor Agent not found" });
    if (!supervisor.enabled) return reply.code(409).send({ error: "Supervisor Agent is disabled" });
    const socket = supervisorSockets.get(supervisor.id);
    if (!socket || socket.readyState !== WebSocket.OPEN) return reply.code(409).send({ error: "Supervisor Agent is offline" });

    let instance = parsed.data.instance ?? "main";
    let assignment: SupervisorManagedAssignmentRow | null = null;
    if (parsed.data.operation === "UPDATE") {
      if (!parsed.data.agentType || !parsed.data.agentId) return reply.code(400).send({ error: "Managed UPDATE requires agentType and agentId" });
      const idColumn = parsed.data.agentType === "device-agent" ? "device_agent_id" : "monitoring_agent_id";
      const exact = await pool.query<SupervisorManagedAssignmentRow>(
        `SELECT * FROM supervisor_managed_agents WHERE supervisor_agent_id=$1 AND agent_type=$2 AND ${idColumn}=$3 LIMIT 1`,
        [supervisor.id, parsed.data.agentType, parsed.data.agentId]
      );
      assignment = exact.rows[0] ?? null;
      if (!assignment) return reply.code(409).send({ error: `${parsed.data.agentType === "monitor-agent" ? "Monitoring" : "Device"} Agent is not explicitly associated with this Supervisor` });
      if (parsed.data.instance && parsed.data.instance !== assignment.instance) return reply.code(409).send({ error: `Requested instance ${parsed.data.instance} does not match associated instance ${assignment.instance}` });
      instance = assignment.instance;
    } else if (parsed.data.agentType && parsed.data.agentId) {
      try {
        assignment = await upsertSupervisorAssignment(supervisor.id, {
          agentType: parsed.data.agentType,
          agentId: parsed.data.agentId,
          instance,
          installDir: parsed.data.installDir,
          desiredVersion: parsed.data.version
        });
      } catch (error) {
        return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to create Supervisor managed-agent association" });
      }
    }

    if (assignment) {
      const assignments = await loadSupervisorAssignments(supervisor.id);
      socket.send(JSON.stringify({ type: "MANAGED_ASSIGNMENTS", managedAssignments: assignments.map(supervisorManagedAssignmentDto) }));
    }

    const commandId = randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    let expectedTokenHash: string | undefined;
    let deviceAgentId: string | undefined;
    let monitoringAgentId: string | undefined;
    if (parsed.data.agentId && parsed.data.agentType === "device-agent") {
      const tokenRow = await pool.query<{ token_hash: string }>("SELECT token_hash FROM device_agents WHERE id=$1", [parsed.data.agentId]);
      expectedTokenHash = tokenRow.rows[0]?.token_hash;
      deviceAgentId = parsed.data.agentId;
    } else if (parsed.data.agentId && parsed.data.agentType === "monitor-agent") {
      const tokenRow = await pool.query<{ token_hash: string }>("SELECT token_hash FROM monitoring_agents WHERE id=$1", [parsed.data.agentId]);
      expectedTokenHash = tokenRow.rows[0]?.token_hash;
      monitoringAgentId = parsed.data.agentId;
    }
    if (parsed.data.operation === "UPDATE" && monitoringAgentId) {
      await pool.query(`UPDATE monitoring_agents SET
        previous_version=version,desired_version=$2,update_status='UPDATE_REQUESTED',update_error=NULL,
        update_requested_at=NOW(),update_started_at=NOW(),update_finished_at=NULL,updated_at=NOW()
        WHERE id=$1`, [monitoringAgentId, parsed.data.version ?? null]);
    }

    const record: SupervisorManagedAgentOperationRecord = {
      id: commandId, supervisorId: supervisor.id, operation: parsed.data.operation, status: "SENT", result: null, error: null,
      createdAt: new Date(), expiresAt, finishedAt: null, assignmentId: assignment?.id, expectedTokenHash,
      deviceAgentId: deviceAgentId ?? assignment?.device_agent_id ?? undefined, monitoringAgentId: monitoringAgentId ?? assignment?.monitoring_agent_id ?? undefined,
      targetVersion: parsed.data.version, agentType: parsed.data.agentType, instance
    };
    supervisorManagedAgentOperations.set(commandId, record);
    await persistSupervisorManagedAgentOperation(record);
    app.log.info({ supervisorId: supervisor.id, commandId, operation: parsed.data.operation, agentType: parsed.data.agentType ?? null, instance, targetVersion: parsed.data.version ?? null, expiresAt: expiresAt.toISOString() }, "Supervisor managed command queued");
    socket.send(JSON.stringify({
      type: "SUPERVISOR_COMMAND",
      commandId,
      operation: parsed.data.operation,
      agentType: parsed.data.agentType,
      instance,
      version: parsed.data.version,
      environment: parsed.data.environment,
      managementId: assignment?.id,
      agentId: assignment ? (assignment.device_agent_id ?? assignment.monitoring_agent_id) : parsed.data.agentId,
      installDir: parsed.data.installDir ?? assignment?.install_dir ?? undefined,
      unmanagedCleanup: parsed.data.operation === "REMOVE" && parsed.data.installDir != null
    }));
    return reply.code(202).send(supervisorManagedAgentOperationDto(record));
  });

  app.post("/api/v1/device-control/supervisors/:id/check-token", async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    expireManagedAgentOperations();
    const result = await pool.query<SupervisorAgentRow>("SELECT * FROM supervisor_agents WHERE id=$1", [request.params.id]);
    const supervisor = result.rows[0];
    if (!supervisor) return reply.code(404).send({ error: "Supervisor Agent not found" });
    const socket = supervisorSockets.get(supervisor.id);
    if (!socket || socket.readyState !== WebSocket.OPEN) return reply.code(409).send({ error: "Supervisor Agent is offline" });
    const commandId = randomUUID();
    const expiresAt = new Date(Date.now() + 30_000);
    const tokenRow = await pool.query<{ token_hash: string }>("SELECT token_hash FROM supervisor_agents WHERE id=$1", [supervisor.id]);
    const record: SupervisorManagedAgentOperationRecord = {
      id: commandId, supervisorId: supervisor.id, operation: "CHECK_TOKEN", status: "SENT", result: null, error: null,
      createdAt: new Date(), expiresAt, finishedAt: null, expectedTokenHash: tokenRow.rows[0]?.token_hash
    };
    supervisorManagedAgentOperations.set(commandId, record);
    socket.send(JSON.stringify({ type: "SUPERVISOR_COMMAND", commandId, operation: "CHECK_TOKEN" }));
    return reply.code(202).send(supervisorManagedAgentOperationDto(record));
  });

  app.post("/api/v1/device-control/agents/:id/check-token", async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    expireManagedAgentOperations();
    const assignmentResult = await pool.query<SupervisorManagedAssignmentRow>(
      "SELECT * FROM supervisor_managed_agents WHERE device_agent_id=$1 ORDER BY updated_at DESC LIMIT 1", [request.params.id]
    );
    const assignment = assignmentResult.rows[0];
    if (!assignment) return reply.code(409).send({ error: "Device Agent is not explicitly associated with a Supervisor" });
    const socket = supervisorSockets.get(assignment.supervisor_agent_id);
    if (!socket || socket.readyState !== WebSocket.OPEN) return reply.code(409).send({ error: "Associated Supervisor Agent is offline" });
    const tokenRow = await pool.query<{ token_hash: string }>("SELECT token_hash FROM device_agents WHERE id=$1", [request.params.id]);
    if (!tokenRow.rows[0]) return reply.code(404).send({ error: "Device Agent not found" });
    const commandId = randomUUID();
    const expiresAt = new Date(Date.now() + 30_000);
    const record: SupervisorManagedAgentOperationRecord = {
      id: commandId, supervisorId: assignment.supervisor_agent_id, operation: "CHECK_TOKEN", status: "SENT", result: null, error: null,
      createdAt: new Date(), expiresAt, finishedAt: null, assignmentId: assignment.id, expectedTokenHash: tokenRow.rows[0].token_hash,
      deviceAgentId: request.params.id
    };
    supervisorManagedAgentOperations.set(commandId, record);
    socket.send(JSON.stringify({ type: "SUPERVISOR_COMMAND", commandId, operation: "CHECK_TOKEN", agentType: "device-agent", instance: assignment.instance }));
    return reply.code(202).send(supervisorManagedAgentOperationDto(record));
  });

  app.post("/api/v1/device-control/monitoring-agents/:id/check-token", async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    expireManagedAgentOperations();
    const assignmentResult = await pool.query<SupervisorManagedAssignmentRow>(
      "SELECT * FROM supervisor_managed_agents WHERE monitoring_agent_id=$1 ORDER BY updated_at DESC LIMIT 1", [request.params.id]
    );
    const assignment = assignmentResult.rows[0];
    if (!assignment) return reply.code(409).send({ error: "Monitoring Agent is not explicitly associated with a Supervisor" });
    const socket = supervisorSockets.get(assignment.supervisor_agent_id);
    if (!socket || socket.readyState !== WebSocket.OPEN) return reply.code(409).send({ error: "Associated Supervisor Agent is offline" });
    const tokenRow = await pool.query<{ token_hash: string }>("SELECT token_hash FROM monitoring_agents WHERE id=$1", [request.params.id]);
    if (!tokenRow.rows[0]) return reply.code(404).send({ error: "Monitoring Agent not found" });
    const commandId = randomUUID();
    const expiresAt = new Date(Date.now() + 30_000);
    const record: SupervisorManagedAgentOperationRecord = {
      id: commandId, supervisorId: assignment.supervisor_agent_id, operation: "CHECK_TOKEN", status: "SENT", result: null, error: null,
      createdAt: new Date(), expiresAt, finishedAt: null, assignmentId: assignment.id, expectedTokenHash: tokenRow.rows[0].token_hash,
      monitoringAgentId: request.params.id
    };
    supervisorManagedAgentOperations.set(commandId, record);
    socket.send(JSON.stringify({ type: "SUPERVISOR_COMMAND", commandId, operation: "CHECK_TOKEN", agentType: "monitor-agent", instance: assignment.instance }));
    return reply.code(202).send(supervisorManagedAgentOperationDto(record));
  });

  async function startProxmoxConfigOperation(deviceAgentId: string, operation: "GET_PROXMOX_CONFIG" | "SET_PROXMOX_CONFIG" | "DELETE_PROXMOX_CONFIG", config?: unknown) {
    const assignmentResult = await pool.query<SupervisorManagedAssignmentRow>(
      "SELECT * FROM supervisor_managed_agents WHERE device_agent_id=$1 ORDER BY updated_at DESC LIMIT 1", [deviceAgentId]
    );
    const assignment = assignmentResult.rows[0];
    if (!assignment) throw Object.assign(new Error("Device Agent is not explicitly associated with a Supervisor"), { statusCode: 409 });
    const socket = supervisorSockets.get(assignment.supervisor_agent_id);
    if (!socket || socket.readyState !== WebSocket.OPEN) throw Object.assign(new Error("Associated Supervisor Agent is offline"), { statusCode: 409 });
    const commandId = randomUUID();
    const record: SupervisorManagedAgentOperationRecord = {
      id: commandId, supervisorId: assignment.supervisor_agent_id, operation, status: "SENT", result: null, error: null,
      createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000), finishedAt: null, assignmentId: assignment.id, deviceAgentId
    };
    supervisorManagedAgentOperations.set(commandId, record);
    socket.send(JSON.stringify({ type: "SUPERVISOR_COMMAND", commandId, operation, agentType: "device-agent", instance: assignment.instance, ...(config === undefined ? {} : { config }) }));
    return record;
  }

  app.get("/api/v1/device-control/agents/:id/proxmox-config", async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try { return reply.code(202).send(supervisorManagedAgentOperationDto(await startProxmoxConfigOperation(request.params.id, "GET_PROXMOX_CONFIG"))); }
    catch (error) { const e = error as Error & { statusCode?: number }; return reply.code(e.statusCode ?? 500).send({ error: e.message }); }
  });

  app.put("/api/v1/device-control/agents/:id/proxmox-config", async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply) => {
    const parsed = proxmoxConfigSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid Proxmox configuration" });
    try { return reply.code(202).send(supervisorManagedAgentOperationDto(await startProxmoxConfigOperation(request.params.id, "SET_PROXMOX_CONFIG", parsed.data))); }
    catch (error) { const e = error as Error & { statusCode?: number }; return reply.code(e.statusCode ?? 500).send({ error: e.message }); }
  });

  app.delete("/api/v1/device-control/agents/:id/proxmox-config", async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try { return reply.code(202).send(supervisorManagedAgentOperationDto(await startProxmoxConfigOperation(request.params.id, "DELETE_PROXMOX_CONFIG"))); }
    catch (error) { const e = error as Error & { statusCode?: number }; return reply.code(e.statusCode ?? 500).send({ error: e.message }); }
  });

  app.get("/api/v1/device-control/supervisor-managed-agent-operations", async (request: FastifyRequest<{ Querystring: { limit?: string } }>, reply) => {
    const requested = Number.parseInt(request.query.limit ?? "50", 10);
    const limit = Number.isFinite(requested) ? Math.max(1, Math.min(200, requested)) : 50;
    const result = await pool.query(`SELECT
      o.command_id,o.supervisor_agent_id,o.operation,o.agent_type,o.instance,o.target_version,o.status,o.error,o.progress,o.created_at,o.expires_at,o.finished_at,
      s.name AS supervisor_name,COALESCE(d.name,m.name) AS agent_name
      FROM supervisor_managed_agent_operations o
      JOIN supervisor_agents s ON s.id=o.supervisor_agent_id
      LEFT JOIN device_agents d ON d.id=o.device_agent_id
      LEFT JOIN monitoring_agents m ON m.id=o.monitoring_agent_id
      ORDER BY o.created_at DESC LIMIT $1`, [limit]);
    return reply.send(result.rows.map(row => ({
      commandId: row.command_id, supervisorId: row.supervisor_agent_id, supervisorName: row.supervisor_name, operation: row.operation,
      agentType: row.agent_type, instance: row.instance, agentName: row.agent_name, targetVersion: row.target_version, status: row.status, error: row.error,
      progress: Array.isArray(row.progress) ? row.progress : [], createdAt: new Date(row.created_at).toISOString(), expiresAt: new Date(row.expires_at).toISOString(),
      finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null, result: null
    })));
  });

  app.delete("/api/v1/device-control/supervisor-managed-agent-operations", async (_request, reply) => {
    const result = await pool.query("DELETE FROM supervisor_managed_agent_operations WHERE status <> 'SENT'");
    return reply.send({ deleted: result.rowCount ?? 0 });
  });

  app.get("/api/v1/device-control/supervisor-managed-agents/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    expireManagedAgentOperations();
    const record = supervisorManagedAgentOperations.get(request.params.id);
    if (!record) return reply.code(404).send({ error: "Supervisor managed-agent operation not found" });
    return reply.send(supervisorManagedAgentOperationDto(record));
  });

  app.get("/api/v1/device-control/supervisors/:id/managed-agent-assignments", async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const supervisor = await pool.query("SELECT 1 FROM supervisor_agents WHERE id=$1", [request.params.id]);
    if (!supervisor.rows[0]) return reply.code(404).send({ error: "Supervisor Agent not found" });
    const rows = await loadSupervisorAssignments(request.params.id);
    return reply.send(rows.map(supervisorManagedAssignmentDto));
  });

  app.post("/api/v1/device-control/supervisors/:id/managed-agent-assignments", async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply) => {
    const schema = z.object({
      agentType: z.enum(["device-agent", "monitor-agent"]),
      agentId: z.string().uuid(),
      instance: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/).default("main"),
      installDir: z.string().trim().min(1).max(2000).optional(),
      desiredVersion: z.string().trim().max(100).optional()
    }).strict();
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid managed-agent association" });
    const supervisor = await pool.query("SELECT 1 FROM supervisor_agents WHERE id=$1", [request.params.id]);
    if (!supervisor.rows[0]) return reply.code(404).send({ error: "Supervisor Agent not found" });
    try {
      const row = await upsertSupervisorAssignment(request.params.id, parsed.data);
      const socket = supervisorSockets.get(request.params.id);
      if (socket?.readyState === WebSocket.OPEN) {
        const assignments = await loadSupervisorAssignments(request.params.id);
        socket.send(JSON.stringify({ type: "MANAGED_ASSIGNMENTS", managedAssignments: assignments.map(supervisorManagedAssignmentDto) }));
      }
      return reply.code(201).send(supervisorManagedAssignmentDto(row));
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Unable to create managed-agent association" });
    }
  });

  app.delete("/api/v1/device-control/supervisor-managed-agent-assignments/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const result = await pool.query("DELETE FROM supervisor_managed_agents WHERE id=$1 RETURNING supervisor_agent_id", [request.params.id]);
    if (!result.rows[0]) return reply.code(404).send({ error: "Managed-agent association not found" });
    const supervisorId = result.rows[0].supervisor_agent_id as string;
    const socket = supervisorSockets.get(supervisorId);
    if (socket?.readyState === WebSocket.OPEN) {
      const assignments = await loadSupervisorAssignments(supervisorId);
      socket.send(JSON.stringify({ type: "MANAGED_ASSIGNMENTS", managedAssignments: assignments.map(supervisorManagedAssignmentDto) }));
    }
    return reply.code(204).send();
  });

  app.post("/api/v1/device-control/supervisors/:id/regenerate-token", async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const token = generateSupervisorToken();
    const result = await pool.query<SupervisorAgentRow>("UPDATE supervisor_agents SET token_hash=$2,updated_at=NOW() WHERE id=$1 RETURNING *", [request.params.id,hashToken(token)]);
    if (!result.rows[0]) return reply.code(404).send({ error: "Supervisor Agent not found" });
    supervisorSockets.get(request.params.id)?.close(4002,"Token regenerated");
    return reply.send({ supervisor: supervisorAgentDto(result.rows[0], false), token });
  });

  app.delete("/api/v1/device-control/supervisors/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    supervisorSockets.get(request.params.id)?.close(4004,"Supervisor deleted");
    const result = await pool.query("DELETE FROM supervisor_agents WHERE id=$1", [request.params.id]);
    if ((result.rowCount ?? 0) === 0) return reply.code(404).send({ error: "Supervisor Agent not found" });
    return reply.code(204).send();
  });

  app.get("/api/v1/device-control/agent-versions", async (_request, reply) => {
    return reply.send(await getAgentReleaseSnapshot());
  });

  app.post("/api/v1/device-control/agent-versions/refresh", async (_request, reply) => {
    agentReleaseSnapshot = null;
    return reply.send(await forceAgentReleaseRefresh());
  });

  app.get("/api/v1/device-control/slots", async (_request, reply) => {
    const result = await pool.query<DeviceAgentSlotRow>(
      `SELECT s.*, a.name AS agent_name
       FROM device_agent_slots s
       LEFT JOIN device_agents a ON a.id=s.agent_id
       ORDER BY LOWER(s.name), s.id`
    );
    return reply.send(result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      enabled: row.enabled,
      agentId: row.agent_id,
      agentName: row.agent_name ?? null,
      bound: row.agent_id != null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    })));
  });

  app.post("/api/v1/device-control/slots", async (request: FastifyRequest<{ Body: unknown }>, reply) => {
    const input = z.object({
      name: z.string().trim().min(1).max(200),
      description: z.string().trim().max(1000).nullable().optional(),
      enabled: z.boolean().optional(),
      agentId: z.string().uuid().nullable().optional()
    }).strict().parse(request.body);

    try {
      const result = await pool.query<DeviceAgentSlotRow>(
        `INSERT INTO device_agent_slots (name,description,enabled,agent_id)
         VALUES ($1,$2,$3,$4)
         RETURNING *`,
        [input.name, input.description ?? null, input.enabled ?? true, input.agentId ?? null]
      );
      const row = result.rows[0]!;
      return reply.code(201).send({
        id: row.id,
        name: row.name,
        description: row.description,
        enabled: row.enabled,
        agentId: row.agent_id,
        agentName: null,
        bound: row.agent_id != null,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString()
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        return reply.code(409).send({ error: "Slot name or Device Agent is already assigned" });
      }
      throw error;
    }
  });

  app.patch("/api/v1/device-control/slots/:id", async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply) => {
    const input = z.object({
      name: z.string().trim().min(1).max(200).optional(),
      description: z.string().trim().max(1000).nullable().optional(),
      enabled: z.boolean().optional(),
      agentId: z.string().uuid().nullable().optional()
    }).strict().refine(value => Object.keys(value).length > 0).parse(request.body);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<DeviceAgentSlotRow>(
        "SELECT * FROM device_agent_slots WHERE id=$1 FOR UPDATE",
        [request.params.id]
      );
      if (!current.rows[0]) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ error: "Device Agent Slot not found" });
      }

      const nextAgentId = input.agentId !== undefined ? input.agentId : current.rows[0].agent_id;
      if (nextAgentId) {
        await client.query(
          `UPDATE device_agent_slots
           SET agent_id=NULL, updated_at=NOW()
           WHERE agent_id=$1 AND id<>$2`,
          [nextAgentId, request.params.id]
        );
      }

      const result = await client.query<DeviceAgentSlotRow>(
        `UPDATE device_agent_slots
         SET name=$2, description=$3, enabled=$4, agent_id=$5, updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [
          request.params.id,
          input.name ?? current.rows[0].name,
          input.description !== undefined ? input.description : current.rows[0].description,
          input.enabled ?? current.rows[0].enabled,
          nextAgentId
        ]
      );

      await client.query(
        `UPDATE device_registry_devices d
         SET control_agent_id=s.agent_id, updated_at=NOW()
         FROM device_agent_slots s
         WHERE d.control_slot_id=s.id
           AND d.control_agent_id IS DISTINCT FROM s.agent_id`
      );

      await client.query("COMMIT");
      const row = result.rows[0]!;
      return reply.send({
        id: row.id,
        name: row.name,
        description: row.description,
        enabled: row.enabled,
        agentId: row.agent_id,
        agentName: null,
        bound: row.agent_id != null,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString()
      });
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505") {
        return reply.code(409).send({ error: "Slot name is already in use" });
      }
      throw error;
    } finally {
      client.release();
    }
  });

  app.delete("/api/v1/device-control/slots/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const count = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM device_registry_devices WHERE control_slot_id=$1",
      [request.params.id]
    );
    if (Number(count.rows[0]?.count ?? "0") > 0) {
      return reply.code(409).send({ error: "Slot is still assigned to one or more Devices" });
    }
    const result = await pool.query("DELETE FROM device_agent_slots WHERE id=$1", [request.params.id]);
    if (result.rowCount === 0) return reply.code(404).send({ error: "Device Agent Slot not found" });
    return reply.code(204).send();
  });

  app.get("/api/v1/device-control/agents", async (_request, reply) => {
    // Defensive reconciliation: if the Agent already reports the requested version,
    // a transitional lifecycle is complete even if a late Supervisor result or an
    // API restart prevented the normal HELLO transition from being the final write.
    await pool.query(`UPDATE device_agents SET
      update_status='UPDATED',desired_version=NULL,update_command_id=NULL,
      update_finished_at=COALESCE(update_finished_at,NOW()),update_error=NULL,
      last_successful_update_at=COALESCE(last_successful_update_at,NOW()),
      last_successful_update_version=version,updated_at=NOW()
      WHERE desired_version IS NOT NULL AND version=desired_version
        AND update_status IN ('UPDATE_REQUESTED','UPDATING','VERIFYING','FAILED')`);
    const result = await pool.query<AgentRow>(`SELECT a.*,
      sma.id AS managed_association_id,
      sma.supervisor_agent_id AS managed_by_supervisor_id,
      s.name AS managed_by_supervisor_name,
      sma.instance AS managed_instance,
      das.id AS slot_id,
      das.name AS slot_name
      FROM device_agents a
      LEFT JOIN supervisor_managed_agents sma ON sma.device_agent_id=a.id
      LEFT JOIN supervisor_agents s ON s.id=sma.supervisor_agent_id
      LEFT JOIN device_agent_slots das ON das.agent_id=a.id
      ORDER BY LOWER(a.name), a.id`);
    return reply.send(result.rows.map(row => agentDto(row, sockets.has(row.id))));
  });

  app.post("/api/v1/device-control/agents", async (request: FastifyRequest<{ Body: unknown }>, reply) => {
    const parsed = agentCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid device agent" });
    const input = parsed.data;
    const token = generateToken();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<AgentRow>(`
        INSERT INTO device_agents (name, token_hash, labels, heartbeat_timeout_seconds)
        VALUES ($1,$2,$3::jsonb,$4) RETURNING *
      `, [input.name, hashToken(token), JSON.stringify(input.labels ?? {}), input.heartbeatTimeoutSeconds ?? 60]);
      const agent = result.rows[0]!;
      let slot: DeviceAgentSlotRow;

      if (input.slotId) {
        const selected = await client.query<DeviceAgentSlotRow>(
          `UPDATE device_agent_slots
           SET agent_id=$2, updated_at=NOW()
           WHERE id=$1 AND agent_id IS NULL
           RETURNING *`,
          [input.slotId, agent.id]
        );
        if (!selected.rows[0]) {
          const existingSlot = await client.query<DeviceAgentSlotRow>(
            "SELECT * FROM device_agent_slots WHERE id=$1",
            [input.slotId]
          );
          if (!existingSlot.rows[0]) throw Object.assign(new Error("Device Agent Slot not found"), { statusCode: 404 });
          throw Object.assign(new Error("Device Agent Slot is already bound"), { statusCode: 409 });
        }
        slot = selected.rows[0];
      } else if (input.slotName) {
        const rebound = await client.query<DeviceAgentSlotRow>(
          `UPDATE device_agent_slots SET agent_id=$2, updated_at=NOW()
           WHERE name=$1 AND agent_id IS NULL RETURNING *`,
          [input.slotName, agent.id]
        );
        slot = rebound.rows[0] ?? (await client.query<DeviceAgentSlotRow>(
          `INSERT INTO device_agent_slots (name,agent_id) VALUES ($1,$2) RETURNING *`,
          [input.slotName, agent.id]
        )).rows[0]!;
      } else {
        const rebound = await client.query<DeviceAgentSlotRow>(
          `UPDATE device_agent_slots SET agent_id=$2, updated_at=NOW()
           WHERE name=$1 AND agent_id IS NULL RETURNING *`,
          [input.name, agent.id]
        );
        slot = rebound.rows[0] ?? (await client.query<DeviceAgentSlotRow>(
          `INSERT INTO device_agent_slots (name,agent_id) VALUES ($1,$2) RETURNING *`,
          [input.name, agent.id]
        )).rows[0]!;
      }

      await client.query(
        `UPDATE device_registry_devices
         SET control_agent_id=$2, updated_at=NOW()
         WHERE control_slot_id=$1`,
        [slot.id, agent.id]
      );
      await client.query("COMMIT");
      return reply.code(201).send({
        agent: agentDto({ ...agent, slot_id: slot.id, slot_name: slot.name }, false),
        token
      });
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { statusCode?: number }).statusCode) {
        return reply.code((error as { statusCode: number }).statusCode).send({ error: (error as Error).message });
      }
      if ((error as { code?: string }).code === "23505") return reply.code(409).send({ error: `Device Agent '${input.name}' or its Slot already exists` });
      throw error;
    } finally {
      client.release();
    }
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

    // Updating to the version already reported by the Agent is a no-op. Reconcile any
    // stale transitional lifecycle instead of sending an UPDATE that may not recreate
    // the container and therefore may never produce another HELLO.
    if (agent.version === parsed.data.version) {
      const reconciled = await pool.query<AgentRow>(`UPDATE device_agents SET
        desired_version=NULL,update_status='UPDATED',update_command_id=NULL,
        update_finished_at=COALESCE(update_finished_at,NOW()),update_error=NULL,
        last_successful_update_at=COALESCE(last_successful_update_at,NOW()),
        last_successful_update_version=version,updated_at=NOW()
        WHERE id=$1 RETURNING *`, [agent.id]);
      return reply.send(agentDto(reconciled.rows[0]!, true));
    }

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

    const explicitAssignmentResult = await pool.query<SupervisorManagedAssignmentRow>(
      "SELECT * FROM supervisor_managed_agents WHERE device_agent_id=$1 ORDER BY updated_at DESC LIMIT 1", [agent.id]
    );
    const explicitAssignment = explicitAssignmentResult.rows[0];
    if (explicitAssignment) {
      const explicitSupervisorSocket = supervisorSockets.get(explicitAssignment.supervisor_agent_id);
      if (explicitSupervisorSocket?.readyState === WebSocket.OPEN) {
        const operation: SupervisorManagedAgentOperationRecord = {
          id: commandId, supervisorId: explicitAssignment.supervisor_agent_id, operation: "UPDATE", status: "SENT", result: null, error: null,
          createdAt: new Date(), expiresAt, finishedAt: null, deviceAgentId: agent.id, assignmentId: explicitAssignment.id,
          targetVersion: parsed.data.version, agentType: "device-agent", instance: explicitAssignment.instance
        };
        supervisorManagedAgentOperations.set(commandId, operation);
        await persistSupervisorManagedAgentOperation(operation);
        explicitSupervisorSocket.send(JSON.stringify({
          type: "SUPERVISOR_COMMAND",
          commandId,
          operation: "UPDATE",
          agentType: "device-agent",
          instance: explicitAssignment.instance,
          version: parsed.data.version,
          managementId: explicitAssignment.id,
          agentId: agent.id,
          installDir: explicitAssignment.install_dir ?? undefined
        }));
        return reply.code(202).send(agentDto(updated.rows[0]!, true));
      }
    }

    if (agent.supervisor_available) {
      socket.send(JSON.stringify({
        type: "AGENT_UPDATE_REQUEST",
        commandId,
        version: parsed.data.version,
        expiresAt: expiresAt.toISOString()
      }));
      return reply.code(202).send(agentDto(updated.rows[0]!, true));
    }

    const candidates = agent.hostname ? await pool.query<SupervisorAgentRow>(
      "SELECT * FROM supervisor_agents WHERE enabled=TRUE AND LOWER(hostname)=LOWER($1) ORDER BY updated_at DESC",
      [agent.hostname]
    ) : { rows: [] as SupervisorAgentRow[] };
    const autonomousSupervisor = candidates.rows.find(candidate => {
      const supervisorSocket = supervisorSockets.get(candidate.id);
      if (!supervisorSocket || supervisorSocket.readyState !== WebSocket.OPEN) return false;
      return (candidate.managed_agents ?? []).some(entry =>
        entry.agent_type === "device-agent" &&
        (entry.instance ?? "main") === "main" &&
        entry.installed !== false
      );
    });
    if (!autonomousSupervisor) {
      await pool.query("UPDATE device_agents SET update_status='FAILED',update_finished_at=NOW(),update_error='No online autonomous Supervisor manages this Device Agent',updated_at=NOW() WHERE id=$1", [agent.id]);
      return reply.code(409).send({ error: "No online autonomous Supervisor manages this Device Agent" });
    }

    const supervisorSocket = supervisorSockets.get(autonomousSupervisor.id)!;
    const operation: SupervisorManagedAgentOperationRecord = {
      id: commandId, supervisorId: autonomousSupervisor.id, operation: "UPDATE", status: "SENT", result: null, error: null,
      createdAt: new Date(), expiresAt, finishedAt: null, deviceAgentId: agent.id, targetVersion: parsed.data.version,
      agentType: "device-agent", instance: "main"
    };
    supervisorManagedAgentOperations.set(commandId, operation);
    await persistSupervisorManagedAgentOperation(operation);
    supervisorSocket.send(JSON.stringify({
      type: "SUPERVISOR_COMMAND",
      commandId,
      operation: "UPDATE",
      agentType: "device-agent",
      instance: "main",
      version: parsed.data.version
    }));

    return reply.code(202).send(agentDto(updated.rows[0]!, true));
  });

  app.post("/api/v1/device-control/agents/:id/supervisor/update", async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply) => {
    const parsed = supervisorUpdateRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid Supervisor Agent update request" });

    const result = await pool.query<AgentRow>("SELECT * FROM device_agents WHERE id=$1", [request.params.id]);
    const agent = result.rows[0];
    if (!agent) return reply.code(404).send({ error: "Device Agent not found" });
    if (!agent.enabled) return reply.code(409).send({ error: "Device Agent is disabled" });
    const socket = sockets.get(agent.id);
    if (socket?.readyState !== WebSocket.OPEN) return reply.code(409).send({ error: "Device Agent is offline" });
    if (!agent.supervisor_available) return reply.code(409).send({ error: "Supervisor Agent is unavailable" });
    if (!agent.supervisor_self_update_supported) return reply.code(409).send({ error: "Supervisor Agent does not support self-update" });
    if (["UPDATE_REQUESTED", "UPDATING", "VERIFYING"].includes(agent.supervisor_update_status)) {
      return reply.code(409).send({ error: "A Supervisor Agent update is already in progress" });
    }

    const commandId = randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const updated = await pool.query<AgentRow>(`
      UPDATE device_agents SET
        supervisor_previous_version=supervisor_version, supervisor_desired_version=$2, supervisor_update_status='UPDATING', supervisor_update_command_id=$3,
        supervisor_update_requested_at=NOW(), supervisor_update_started_at=NOW(), supervisor_update_finished_at=NULL, supervisor_update_error=NULL, updated_at=NOW()
      WHERE id=$1 RETURNING *
    `, [agent.id, parsed.data.version, commandId]);

    socket.send(JSON.stringify({
      type: "SUPERVISOR_UPDATE_REQUEST",
      commandId,
      version: parsed.data.version,
      expiresAt: expiresAt.toISOString()
    }));

    return reply.code(202).send(agentDto(updated.rows[0]!, true));
  });

  app.post("/api/v1/device-control/agents/:id/managed-agents", async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply) => {
    expireManagedAgentOperations();
    const parsed = managedAgentRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid Managed Agent request" });
    const agentResult = await pool.query<AgentRow>("SELECT * FROM device_agents WHERE id=$1", [request.params.id]);
    const agent = agentResult.rows[0];
    if (!agent) return reply.code(404).send({ error: "Device Agent not found" });
    if (!agent.enabled) return reply.code(409).send({ error: "Device Agent is disabled" });
    if (!agent.supervisor_available) return reply.code(409).send({ error: "Supervisor Agent is unavailable" });
    const socket = sockets.get(agent.id);
    if (socket?.readyState !== WebSocket.OPEN) return reply.code(409).send({ error: "Device Agent is offline" });

    const commandId = randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const record: ManagedAgentOperationRecord = { id: commandId, agentId: agent.id, operation: parsed.data.operation, status: "SENT", result: null, error: null, createdAt: new Date(), expiresAt, finishedAt: null };
    managedAgentOperations.set(commandId, record);
    socket.send(JSON.stringify({
      type: "MANAGED_AGENT_REQUEST",
      commandId,
      operation: parsed.data.operation,
      agentType: parsed.data.agentType,
      instance: parsed.data.instance ?? "main",
      version: parsed.data.version,
      environment: parsed.data.environment,
      expiresAt: expiresAt.toISOString()
    }));
    return reply.code(202).send(managedAgentOperationDto(record));
  });

  app.get("/api/v1/device-control/managed-agents/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    expireManagedAgentOperations();
    const record = managedAgentOperations.get(request.params.id);
    if (!record) return reply.code(404).send({ error: "Managed Agent operation not found" });
    return reply.send(managedAgentOperationDto(record));
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

    const timeoutSeconds = input.timeoutSeconds ?? 8;
    const commandId = randomUUID();
    const record: DiscoveryRecord = {
      id: commandId,
      agentId: agent.id,
      provider: input.provider.toUpperCase(),
      status: "SENT",
      devices: [],
      error: null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + (timeoutSeconds + 20) * 1000),
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

  app.post("/api/v1/device-control/entities/remove", async (request: FastifyRequest<{ Body: unknown }>, reply) => {
    const parsed = entityRemovalSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid entity removal request" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const entity of parsed.data.entities) {
        const removedAt = new Date().toISOString();
        const snapshot = {
          ...(entity.snapshot ?? {}),
          deviceId: entity.deviceId,
          provider: entity.provider,
          entityValue: entity.entityValue,
          removed: true,
          removedAt
        };
        await client.query(`
          INSERT INTO device_control_entity_exclusions (
            device_id, provider, entity_value, entity_snapshot, removed_at, lifecycle, created_at, updated_at
          )
          VALUES ($1, UPPER($2), $3, $4::jsonb, NOW(), 'REMOVED', NOW(), NOW())
          ON CONFLICT (device_id, provider, entity_value)
          DO UPDATE SET
            entity_snapshot = EXCLUDED.entity_snapshot,
            removed_at = NOW(),
            lifecycle = 'REMOVED',
            updated_at = NOW()
        `, [entity.deviceId, entity.provider, entity.entityValue, JSON.stringify(snapshot)]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return reply.send({ removed: parsed.data.entities.length });
  });

  app.post("/api/v1/device-control/entities/delete-all-references", async (request: FastifyRequest<{ Body: unknown }>, reply) => {
    const parsed = entityRemovalSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid entity deletion request" });

    const client = await pool.connect();
    const references = {
      dashboardWidgets: 0,
      deviceIdentities: 0,
      deviceCommands: 0,
      discoveryBaselines: 0,
      exclusions: 0,
      hardDeleteTombstones: 0
    };
    try {
      await client.query("BEGIN");
      for (const entity of parsed.data.entities) {
        const dashboardResult = await client.query(
          `DELETE FROM simple_dashboard_entity_cards
           WHERE device_id = $1 AND entity_value = $2`,
          [entity.deviceId, entity.entityValue]
        );
        references.dashboardWidgets += dashboardResult.rowCount ?? 0;

        const identityResult = await client.query(
          `DELETE FROM device_registry_identities
           WHERE device_id = $1
             AND UPPER(identity_type) = 'ESPHOME_ENTITY'
             AND value = $2`,
          [entity.deviceId, entity.entityValue]
        );
        references.deviceIdentities += identityResult.rowCount ?? 0;

        const commandResult = await client.query(
          `DELETE FROM device_control_commands
           WHERE device_id = $1
             AND parameters->>'entity' = $2`,
          [entity.deviceId, entity.entityValue]
        );
        references.deviceCommands += commandResult.rowCount ?? 0;

        await client.query(`
          UPDATE device_control_states
          SET state = jsonb_set(
                state,
                '{entities}',
                COALESCE((
                  SELECT jsonb_agg(item)
                  FROM jsonb_array_elements(
                    CASE
                      WHEN jsonb_typeof(state->'entities') = 'array' THEN state->'entities'
                      ELSE '[]'::jsonb
                    END
                  ) AS item
                  WHERE COALESCE(item->>'value', item->>'id', '') <> $2
                ), '[]'::jsonb),
                true
              ),
              updated_at = NOW()
          WHERE device_id = $1
            AND UPPER(provider) = UPPER($3)
        `, [entity.deviceId, entity.entityValue, entity.provider]);

        const snapshot = entity.snapshot ?? {};
        const entityType = typeof snapshot.entityType === "string"
          ? snapshot.entityType.trim().toLowerCase()
          : "";
        const candidateValues = [
          entity.entityValue,
          typeof snapshot.entityId === "string" ? snapshot.entityId : "",
          typeof snapshot.entityName === "string" ? snapshot.entityName : ""
        ].map(value => value.trim().toLowerCase()).filter(Boolean);
        const discoveryKeys = new Set(candidateValues.map(value => {
          if (!entityType) return value;
          const prefix = `${entityType}:`;
          return value.startsWith(prefix) ? value : `${prefix}${value}`;
        }));

        if (discoveryKeys.size > 0) {
          const baselineResult = await client.query<{
            signature: string | null;
            count: number | null;
          }>(
            `SELECT discovery_entity_signature AS signature,
                    discovery_entity_count AS count
             FROM device_registry_devices
             WHERE id = $1
             FOR UPDATE`,
            [entity.deviceId]
          );
          const baseline = baselineResult.rows[0];
          if (baseline?.signature !== null && baseline?.signature !== undefined) {
            const currentKeys = baseline.signature
              .split("\n")
              .map(value => value.trim())
              .filter(Boolean);
            const nextKeys = currentKeys.filter(value => !discoveryKeys.has(value.toLowerCase()));
            if (nextKeys.length !== currentKeys.length) {
              const baselineUpdate = await client.query(
                `UPDATE device_registry_devices
                 SET discovery_entity_signature = $2,
                     discovery_entity_count = $3,
                     updated_at = NOW()
                 WHERE id = $1`,
                [entity.deviceId, nextKeys.join("\n"), nextKeys.length]
              );
              references.discoveryBaselines += baselineUpdate.rowCount ?? 0;
            }
          }
        }

        const exclusionResult = await client.query(
          `DELETE FROM device_control_entity_exclusions
           WHERE device_id = $1
             AND provider = UPPER($2)
             AND entity_value = $3
             AND lifecycle = 'REMOVED'`,
          [entity.deviceId, entity.provider, entity.entityValue]
        );
        references.exclusions += exclusionResult.rowCount ?? 0;

        const tombstoneResult = await client.query(
          `INSERT INTO device_control_entity_exclusions (
             device_id, provider, entity_value, entity_snapshot, removed_at, lifecycle, created_at, updated_at
           )
           VALUES ($1, UPPER($2), $3, NULL, NOW(), 'HARD_DELETED', NOW(), NOW())
           ON CONFLICT (device_id, provider, entity_value)
           DO UPDATE SET
             entity_snapshot = NULL,
             removed_at = NOW(),
             lifecycle = 'HARD_DELETED',
             updated_at = NOW()`,
          [entity.deviceId, entity.provider, entity.entityValue]
        );
        references.hardDeleteTombstones += tombstoneResult.rowCount ?? 0;
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return reply.send({ deleted: parsed.data.entities.length, references });
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

    const exclusionResult = await pool.query<{
      deviceId: string;
      provider: string;
      entityValue: string;
      snapshot: Record<string, unknown> | null;
      removedAt: Date;
    }>(`
      SELECT device_id AS "deviceId", provider, entity_value AS "entityValue",
        entity_snapshot AS snapshot, removed_at AS "removedAt"
      FROM device_control_entity_exclusions
      WHERE lifecycle = 'REMOVED'
    `);

    const hardDeletedResult = await pool.query<{
      deviceId: string;
      provider: string;
      entityValue: string;
    }>(`
      SELECT device_id AS "deviceId", provider, entity_value AS "entityValue"
      FROM device_control_entity_exclusions
      WHERE lifecycle = 'HARD_DELETED'
    `);
    const hardDeletedKeys = new Set(hardDeletedResult.rows.map(item =>
      `${item.deviceId}|${item.provider.toUpperCase()}|${item.entityValue}`
    ));
    const exclusionMap = new Map(exclusionResult.rows.map(item => [
      `${item.deviceId}|${item.provider.toUpperCase()}|${item.entityValue}`,
      item
    ]));
    const seenKeys = new Set<string>();

    const liveEntities = result.rows.flatMap(row => {
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
        const key = `${row.deviceId}|${row.provider.toUpperCase()}|${value}`;
        if (hardDeletedKeys.has(key)) return [];
        seenKeys.add(key);
        const exclusion = exclusionMap.get(key);
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
          deviceObservedAt: row.observedAt.toISOString(),
          removed: Boolean(exclusion),
          removedAt: exclusion?.removedAt?.toISOString() ?? null
        }];
      });
    });

    const removedSnapshots = exclusionResult.rows.flatMap(exclusion => {
      const key = `${exclusion.deviceId}|${exclusion.provider.toUpperCase()}|${exclusion.entityValue}`;
      if (seenKeys.has(key)) return [];
      const snapshot = exclusion.snapshot ?? {};
      return [{
        ...snapshot,
        deviceId: exclusion.deviceId,
        provider: exclusion.provider,
        entityValue: exclusion.entityValue,
        entityId: typeof snapshot.entityId === "string" ? snapshot.entityId : exclusion.entityValue,
        entityName: typeof snapshot.entityName === "string" ? snapshot.entityName : exclusion.entityValue,
        entityType: typeof snapshot.entityType === "string" ? snapshot.entityType : "unknown",
        currentValue: snapshot.currentValue ?? null,
        unit: typeof snapshot.unit === "string" ? snapshot.unit : null,
        controllable: snapshot.controllable === true,
        connected: snapshot.connected === true,
        host: typeof snapshot.host === "string" ? snapshot.host : null,
        error: typeof snapshot.error === "string" ? snapshot.error : null,
        agentId: typeof snapshot.agentId === "string" ? snapshot.agentId : "",
        agentName: typeof snapshot.agentName === "string" ? snapshot.agentName : null,
        deviceName: typeof snapshot.deviceName === "string" ? snapshot.deviceName : exclusion.deviceId,
        observedAt: typeof snapshot.observedAt === "string" ? snapshot.observedAt : exclusion.removedAt.toISOString(),
        deviceObservedAt: typeof snapshot.deviceObservedAt === "string" ? snapshot.deviceObservedAt : exclusion.removedAt.toISOString(),
        removed: true,
        removedAt: exclusion.removedAt.toISOString()
      }];
    });

    return reply.send([...liveEntities, ...removedSnapshots]);
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
    const exclusionResult = await pool.query<{ entityValue: string }>(`
      SELECT entity_value AS "entityValue"
      FROM device_control_entity_exclusions
      WHERE device_id=$1 AND provider=UPPER($2)
    `, [row.deviceId, row.provider]);
    const exclusions = new Set(exclusionResult.rows.map(item => item.entityValue));
    const entities = (Array.isArray(state.entities) ? state.entities : []).filter(raw => {
      if (!raw || typeof raw !== "object") return false;
      const entity = raw as Record<string, unknown>;
      const value = typeof entity.value === "string" ? entity.value : typeof entity.id === "string" ? entity.id : null;
      return Boolean(value) && !exclusions.has(value!);
    });
    return reply.send({
      deviceId: row.deviceId,
      agentId: row.agentId,
      provider: row.provider,
      connected: state.connected === true,
      host: typeof state.host === "string" ? state.host : null,
      error: typeof state.error === "string" ? state.error : null,
      entities,
      observedAt: row.observedAt.toISOString()
    });
  });
}
