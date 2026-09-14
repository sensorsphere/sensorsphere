import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool, PoolClient } from "pg";
import { isIP } from "node:net";
import { z } from "zod";

export interface DeviceRegistryFeatureOptions {
  pool: Pool;
}

const referenceCodeSchema = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
const deviceClassSchema = referenceCodeSchema;

const linkTypeSchema = z.enum(["sensor", "asset", "gateway"]);

const identitySchema = z.object({
  identityType: z.string().trim().min(1).max(100),
  value: z.string().trim().min(1).max(500),
  source: z.string().trim().max(200).nullable().optional(),
  labelCode: z.string().trim().min(1).max(100).nullable().optional(),
  label: z.string().trim().max(200).nullable().optional(),
  isPrimary: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional()
}).strict();

const linkSchema = z.object({
  targetType: linkTypeSchema,
  targetId: z.string().uuid()
}).strict();

const accessLinkSchema = z.object({
  name: z.string().trim().min(1).max(200),
  linkType: z.string().trim().min(1).max(100).default("CUSTOM"),
  urlTemplate: z.string().trim().min(1).max(2000),
  username: z.string().trim().max(300).nullable().optional(),
  port: z.number().int().min(1).max(65535).nullable().optional(),
  parameters: z.record(z.string(), z.string()).optional(),
  icon: z.string().trim().min(1).max(100).optional(),
  color: z.string().trim().min(1).max(50).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
  publishAsService: z.boolean().optional(),
  publishedServiceName: z.string().trim().max(300).nullable().optional(),
  publishedServiceClass: z.string().trim().max(100).nullable().optional(),
  publishedServiceType: z.string().trim().max(100).nullable().optional(),
  publishedServiceDescription: z.string().trim().max(5000).nullable().optional()
}).strict();

const classReferenceSchema = z.object({
  code: referenceCodeSchema,
  label: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  icon: z.string().trim().min(1).max(100),
  color: z.string().trim().min(1).max(50),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional()
}).strict();

const typeReferenceSchema = z.object({
  code: referenceCodeSchema,
  label: z.string().trim().min(1).max(200),
  deviceClass: deviceClassSchema,
  category: z.string().trim().min(1).max(200),
  icon: z.string().trim().min(1).max(100),
  color: z.string().trim().min(1).max(50),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional()
}).strict();

const technologyReferenceSchema = z.object({
  code: referenceCodeSchema,
  label: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(200),
  icon: z.string().trim().min(1).max(100),
  color: z.string().trim().min(1).max(50),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional()
}).strict();

const deviceCreateSchema = z.object({
  name: z.string().trim().min(1).max(300),
  deviceClass: deviceClassSchema,
  deviceType: referenceCodeSchema,
  technology: z.string().trim().max(200).nullable().optional(),
  macAddress: z.string().trim().max(100).nullable().optional(),
  ipAddress: z.string().trim().max(200).nullable().optional(),
  ieeeAddress: z.string().trim().max(200).nullable().optional(),
  fqdn: z.string().trim().max(500).nullable().optional(),
  technologies: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
  manufacturer: z.string().trim().max(300).nullable().optional(),
  model: z.string().trim().max(300).nullable().optional(),
  firmwareVersion: z.string().trim().max(300).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  parentDeviceId: z.string().uuid().nullable().optional(),
  healthProfileId: z.string().uuid().nullable().optional(),
  controlAgentId: z.string().uuid().nullable().optional(),
  enabled: z.boolean().optional(),
  lastSeenAt: z.string().datetime({ offset: true }).nullable().optional(),
  batteryPercent: z.number().min(0).max(100).nullable().optional(),
  rssi: z.number().nullable().optional(),
  identities: z.array(identitySchema).max(100).optional(),
  links: z.array(linkSchema).max(500).optional(),
  accessLinks: z.array(accessLinkSchema).max(100).optional()
}).strict();

const deviceUpdateSchema = deviceCreateSchema.partial().strict().refine(
  value => Object.keys(value).length > 0,
  "At least one field is required"
);

const healthProfileBaseSchema = z.object({
  name: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5000).nullable().optional(),
  warningAfterSeconds: z.number().int().positive().nullable().optional(),
  offlineAfterSeconds: z.number().int().positive().nullable().optional(),
  batteryWarningPercent: z.number().min(0).max(100).nullable().optional(),
  batteryCriticalPercent: z.number().min(0).max(100).nullable().optional(),
  rssiWarning: z.number().nullable().optional(),
  rssiCritical: z.number().nullable().optional(),
  monitoringPolicy: z.enum(["IGNORE", "ANY_UP", "ALL_UP"]).optional()
}).strict();

type HealthProfileThresholdInput = Partial<z.infer<typeof healthProfileBaseSchema>>;

function validateHealthProfileThresholds(
  value: HealthProfileThresholdInput,
  context: z.RefinementCtx
): void {
  if (
    value.warningAfterSeconds != null &&
    value.offlineAfterSeconds != null &&
    value.warningAfterSeconds >= value.offlineAfterSeconds
  ) {
    context.addIssue({
      code: "custom",
      message: "Warning timeout must be lower than offline timeout",
      path: ["warningAfterSeconds"]
    });
  }
  if (
    value.batteryWarningPercent != null &&
    value.batteryCriticalPercent != null &&
    value.batteryCriticalPercent > value.batteryWarningPercent
  ) {
    context.addIssue({
      code: "custom",
      message: "Critical battery threshold must not exceed warning threshold",
      path: ["batteryCriticalPercent"]
    });
  }
}

const healthProfileCreateSchema = healthProfileBaseSchema.superRefine(
  validateHealthProfileThresholds
);

const healthProfileUpdateSchema = healthProfileBaseSchema
  .partial()
  .strict()
  .refine(
    value => Object.keys(value).length > 0,
    "At least one field is required"
  )
  .superRefine(validateHealthProfileThresholds);

type HealthStatus = "ONLINE" | "WARNING" | "OFFLINE" | "UNKNOWN" | "DISABLED";

interface DeviceRow {
  id: string;
  name: string;
  device_class: string;
  device_class_label: string;
  device_class_icon: string;
  device_class_color: string;
  device_type: string;
  device_type_label: string;
  device_type_icon: string;
  device_type_color: string;
  technology: string | null;
  mac_address: string | null;
  ip_address: string | null;
  ieee_address: string | null;
  fqdn: string | null;
  technologies: Array<{ code: string; label: string; category: string }>;
  manufacturer: string | null;
  model: string | null;
  firmware_version: string | null;
  description: string | null;
  location_id: string | null;
  location_name: string | null;
  parent_device_id: string | null;
  parent_device_name: string | null;
  health_profile_id: string | null;
  health_profile_name: string | null;
  control_agent_id: string | null;
  control_agent_name: string | null;
  control_provider: string | null;
  enabled: boolean;
  last_seen_at: Date | null;
  battery_percent: number | null;
  rssi: number | null;
  warning_after_seconds: number | null;
  offline_after_seconds: number | null;
  battery_warning_percent: number | null;
  battery_critical_percent: number | null;
  rssi_warning: number | null;
  rssi_critical: number | null;
  monitoring_policy: "IGNORE" | "ANY_UP" | "ALL_UP";
  monitoring_total_checks: number;
  monitoring_up_checks: number;
  monitoring_down_checks: number;
  monitoring_unknown_checks: number;
  created_at: Date;
  updated_at: Date;
}

interface IdentityRow {
  id: string;
  device_id: string;
  identity_type: string;
  value: string;
  source: string | null;
  label_code: string | null;
  label: string | null;
  label_display: string | null;
  is_primary: boolean;
  sort_order: number;
  normalized_value: string | null;
}

interface LinkRow {
  id: string;
  device_id: string;
  target_type: "sensor" | "asset" | "gateway";
  target_id: string;
}

interface AccessLinkRow {
  id: string;
  device_id: string;
  name: string;
  link_type: string;
  url_template: string;
  username: string | null;
  port: number | null;
  parameters: Record<string, string>;
  icon: string;
  color: string;
  enabled: boolean;
  sort_order: number;
  publish_as_service: boolean;
  published_service_name: string | null;
  published_service_class: string | null;
  published_service_type: string | null;
  published_service_description: string | null;
}

function evaluateHealth(row: DeviceRow): { status: HealthStatus; reasons: string[] } {
  if (!row.enabled) return { status: "DISABLED", reasons: ["Device disabled"] };

  const reasons: string[] = [];
  const offlineReasons: string[] = [];
  const ageSeconds = row.last_seen_at
    ? Math.max(0, (Date.now() - row.last_seen_at.getTime()) / 1000)
    : null;

  if (ageSeconds != null && row.offline_after_seconds != null && ageSeconds > row.offline_after_seconds) {
    offlineReasons.push(`Last seen ${Math.round(ageSeconds)} seconds ago`);
  } else if (ageSeconds != null && row.warning_after_seconds != null && ageSeconds > row.warning_after_seconds) {
    reasons.push(`Last seen ${Math.round(ageSeconds)} seconds ago`);
  }

  if (
    row.battery_percent != null &&
    row.battery_critical_percent != null &&
    row.battery_percent <= row.battery_critical_percent
  ) {
    reasons.push(`Battery critical (${row.battery_percent}%)`);
  } else if (
    row.battery_percent != null &&
    row.battery_warning_percent != null &&
    row.battery_percent <= row.battery_warning_percent
  ) {
    reasons.push(`Battery low (${row.battery_percent}%)`);
  }

  if (
    row.rssi != null &&
    row.rssi_critical != null &&
    row.rssi <= row.rssi_critical
  ) {
    reasons.push(`Signal critical (${row.rssi} dBm)`);
  } else if (
    row.rssi != null &&
    row.rssi_warning != null &&
    row.rssi <= row.rssi_warning
  ) {
    reasons.push(`Signal weak (${row.rssi} dBm)`);
  }

  const monitoringEnabled = row.monitoring_policy !== "IGNORE" && row.monitoring_total_checks > 0;
  if (monitoringEnabled) {
    const total = row.monitoring_total_checks;
    const up = row.monitoring_up_checks;
    const down = row.monitoring_down_checks;
    const unknown = row.monitoring_unknown_checks;

    if (row.monitoring_policy === "ANY_UP") {
      if (down === total) {
        offlineReasons.push(`All ${total} PING monitoring checks are DOWN`);
      } else if (up > 0 && up < total) {
        reasons.push(`Monitoring degraded (${up}/${total} PING checks UP)`);
      } else if (up === 0 && unknown > 0) {
        reasons.push(`Monitoring has no confirmed UP check (${unknown} UNKNOWN${down > 0 ? `, ${down} DOWN` : ""})`);
      }
    } else if (row.monitoring_policy === "ALL_UP") {
      if (down > 0) {
        offlineReasons.push(`Monitoring requires all PING checks UP (${down}/${total} DOWN)`);
      } else if (up < total) {
        reasons.push(`Monitoring incomplete (${up}/${total} PING checks UP)`);
      }
    }
  }

  if (offlineReasons.length > 0) return { status: "OFFLINE", reasons: [...offlineReasons, ...reasons] };
  if (reasons.length > 0) return { status: "WARNING", reasons };
  if (monitoringEnabled && row.monitoring_up_checks === row.monitoring_total_checks) {
    return { status: "ONLINE", reasons: [] };
  }
  if (!row.last_seen_at) return { status: "UNKNOWN", reasons: ["No health observation yet"] };
  return { status: "ONLINE", reasons: [] };
}

async function listDeviceRows(pool: Pool): Promise<DeviceRow[]> {
  const result = await pool.query<DeviceRow>(`
    SELECT
      d.id,
      d.name,
      d.device_class,
      dc.label AS device_class_label,
      dc.icon AS device_class_icon,
      dc.color AS device_class_color,
      d.device_type,
      dtref.label AS device_type_label,
      dtref.icon AS device_type_icon,
      dtref.color AS device_type_color,
      d.technology,
      d.mac_address,
      host(d.ip_address) AS ip_address,
      d.ieee_address,
      d.fqdn,
      COALESCE(tech.technologies, '[]'::jsonb) AS technologies,
      d.manufacturer,
      d.model,
      d.firmware_version,
      d.description,
      d.location_id,
      l.name AS location_name,
      d.parent_device_id,
      parent.name AS parent_device_name,
      d.health_profile_id,
      hp.name AS health_profile_name,
      d.control_agent_id,
      da.name AS control_agent_name,
      d.control_provider,
      d.enabled,
      d.last_seen_at,
      d.battery_percent,
      d.rssi,
      hp.warning_after_seconds,
      hp.offline_after_seconds,
      hp.battery_warning_percent,
      hp.battery_critical_percent,
      hp.rssi_warning,
      hp.rssi_critical,
      COALESCE(hp.monitoring_policy, 'IGNORE') AS monitoring_policy,
      COALESCE(mh.total_checks, 0)::int AS monitoring_total_checks,
      COALESCE(mh.up_checks, 0)::int AS monitoring_up_checks,
      COALESCE(mh.down_checks, 0)::int AS monitoring_down_checks,
      COALESCE(mh.unknown_checks, 0)::int AS monitoring_unknown_checks,
      d.created_at,
      d.updated_at
    FROM device_registry_devices d
    JOIN device_classes dc ON dc.code = d.device_class
    JOIN device_types dtref ON dtref.code = d.device_type
    LEFT JOIN locations l ON l.id = d.location_id
    LEFT JOIN device_registry_devices parent ON parent.id = d.parent_device_id
    LEFT JOIN device_health_profiles hp ON hp.id = d.health_profile_id
    LEFT JOIN device_agents da ON da.id = d.control_agent_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object('code', t.code, 'label', t.label, 'category', t.category, 'icon', t.icon, 'color', t.color, 'enabled', t.enabled, 'sortOrder', t.sort_order)
        ORDER BY t.sort_order, LOWER(t.label), t.code
      ) AS technologies
      FROM device_registry_device_technologies dt
      JOIN device_technologies t ON t.code = dt.technology_code
      WHERE dt.device_id = d.id
    ) tech ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) AS total_checks,
        COUNT(*) FILTER (WHERE latest.status = 'UP') AS up_checks,
        COUNT(*) FILTER (WHERE latest.status = 'DOWN') AS down_checks,
        COUNT(*) FILTER (WHERE latest.status IS NULL OR latest.status = 'UNKNOWN') AS unknown_checks
      FROM monitoring_checks c
      LEFT JOIN LATERAL (
        SELECT s.status
        FROM monitoring_check_states s
        JOIN monitoring_check_agents ca ON ca.check_id = s.check_id AND ca.agent_id = s.agent_id AND ca.enabled = TRUE
        JOIN monitoring_agents a ON a.id = s.agent_id AND a.enabled = TRUE
        WHERE s.check_id = c.id
        ORDER BY s.last_check_at DESC NULLS LAST, s.updated_at DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE c.device_id = d.id
        AND c.enabled = TRUE
        AND c.check_type = 'PING'
    ) mh ON TRUE
    ORDER BY LOWER(d.name), d.id
  `);
  return result.rows;
}

async function getDeviceRow(pool: Pool, id: string): Promise<DeviceRow | null> {
  const rows = await listDeviceRows(pool);
  return rows.find(row => row.id === id) ?? null;
}

function mapDevice(row: DeviceRow, identities: IdentityRow[], links: LinkRow[], accessLinks: AccessLinkRow[]) {
  const health = evaluateHealth(row);
  return {
    id: row.id,
    name: row.name,
    deviceClass: row.device_class,
    deviceClassInfo: { code: row.device_class, label: row.device_class_label, icon: row.device_class_icon, color: row.device_class_color },
    deviceType: row.device_type,
    deviceTypeInfo: { code: row.device_type, label: row.device_type_label, icon: row.device_type_icon, color: row.device_type_color },
    technology: row.technology,
    macAddress: row.mac_address,
    ipAddress: row.ip_address,
    ieeeAddress: row.ieee_address,
    fqdn: row.fqdn,
    technologies: row.technologies,
    manufacturer: row.manufacturer,
    model: row.model,
    firmwareVersion: row.firmware_version,
    description: row.description,
    location: row.location_id ? { id: row.location_id, name: row.location_name ?? row.location_id } : null,
    parentDevice: row.parent_device_id ? { id: row.parent_device_id, name: row.parent_device_name ?? row.parent_device_id } : null,
    healthProfile: row.health_profile_id ? { id: row.health_profile_id, name: row.health_profile_name ?? row.health_profile_id } : null,
    controlAgentId: row.control_agent_id,
    controlAgent: row.control_agent_id ? { id: row.control_agent_id, name: row.control_agent_name ?? row.control_agent_id } : null,
    controlProvider: row.control_provider,
    enabled: row.enabled,
    lastSeenAt: row.last_seen_at?.toISOString() ?? null,
    batteryPercent: row.battery_percent,
    rssi: row.rssi,
    health,
    identities: identities.filter(item => item.device_id === row.id).map(item => ({
      id: item.id,
      identityType: item.identity_type,
      value: item.value,
      source: item.source,
      labelCode: item.label_code,
      label: item.label_display ?? item.label,
      isPrimary: item.is_primary,
      sortOrder: item.sort_order
    })),
    links: links.filter(item => item.device_id === row.id).map(item => ({
      id: item.id,
      targetType: item.target_type,
      targetId: item.target_id
    })),
    accessLinks: accessLinks.filter(item => item.device_id === row.id).map(item => ({
      id: item.id,
      name: item.name,
      linkType: item.link_type,
      urlTemplate: item.url_template,
      username: item.username,
      port: item.port,
      parameters: item.parameters ?? {},
      icon: item.icon,
      color: item.color,
      enabled: item.enabled,
      sortOrder: item.sort_order,
      publishAsService: item.publish_as_service,
      publishedServiceName: item.published_service_name,
      publishedServiceClass: item.published_service_class,
      publishedServiceType: item.published_service_type,
      publishedServiceDescription: item.published_service_description
    })),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}


function canonicalIdentityType(value: string): string {
  const type = value.trim().toUpperCase();
  if (["MAC_ADDRESS", "MAC_WIFI", "MAC_ETHERNET"].includes(type)) return "MAC";
  if (type === "IP_ADDRESS") return "IP";
  if (["IEEE_ADDRESS", "ZIGBEE_IEEE"].includes(type)) return "IEEE";
  if (type === "HOSTNAME") return "FQDN";
  return type;
}

class DeviceIdentityValidationError extends Error {}


function controlProviderFromTechnologies(technologies: string[]): string | null {
  const normalized = technologies.map(value => value.toLowerCase());
  if (normalized.includes("yeelight")) return "YEELIGHT";
  if (normalized.includes("esphome")) return "ESPHOME";
  return null;
}

function normalizeIdentityValue(identityType: string, value: string): { value: string; normalized: string } {
  const type = canonicalIdentityType(identityType);
  const trimmed = value.trim();
  if (type === "MAC") {
    const hex = trimmed.toUpperCase().replace(/[^0-9A-F]/g, "");
    if (hex.length !== 12) throw new DeviceIdentityValidationError("MAC address must contain exactly 12 hexadecimal digits");
    const canonical = hex.match(/.{2}/g)!.join(":");
    return { value: canonical, normalized: hex };
  }
  if (type === "IEEE") {
    const hex = trimmed.toUpperCase().replace(/[^0-9A-F]/g, "");
    if (hex.length !== 16) throw new DeviceIdentityValidationError("IEEE address must contain exactly 16 hexadecimal digits");
    return { value: `0x${hex.toLowerCase()}`, normalized: hex };
  }
  if (type === "IP") {
    if (!isIP(trimmed)) throw new DeviceIdentityValidationError("IP identity must be a valid IPv4 or IPv6 address");
    return { value: trimmed, normalized: trimmed.toLowerCase() };
  }
  if (type === "YEELIGHT_ID") {
    const hex = trimmed.toUpperCase().replace(/^0X/, "").replace(/[^0-9A-F]/g, "");
    if (hex.length !== 16) throw new DeviceIdentityValidationError("Yeelight ID must contain exactly 16 hexadecimal digits");
    return { value: `0x${hex.toLowerCase()}`, normalized: hex };
  }
  if (type === "FQDN") return { value: trimmed, normalized: trimmed.toLowerCase() };
  return { value: trimmed, normalized: trimmed };
}

class DeviceIdentityConflictError extends Error {
  constructor(
    readonly identityType: string,
    readonly value: string,
    readonly device: { id: string; name: string }
  ) {
    super(`${identityType} ${value} is already assigned to ${device.name}`);
  }
}

async function prepareIdentities(
  client: PoolClient,
  deviceId: string,
  identities: z.infer<typeof identitySchema>[]
) {
  const prepared = identities.map((identity, index) => {
    const identityType = canonicalIdentityType(identity.identityType);
    const normalized = normalizeIdentityValue(identityType, identity.value);
    return {
      ...identity, identityType, value: normalized.value, normalizedValue: normalized.normalized,
      labelCode: identity.labelCode ?? null, label: identity.label ?? null,
      isPrimary: identity.isPrimary ?? false, sortOrder: identity.sortOrder ?? (index + 1) * 10
    };
  });

  for (const type of new Set(prepared.map(item => item.identityType))) {
    const sameType = prepared.filter(item => item.identityType === type);
    if (sameType.length > 0 && !sameType.some(item => item.isPrimary)) sameType[0]!.isPrimary = true;
    let primarySeen = false;
    for (const item of sameType) {
      if (!item.isPrimary) continue;
      if (primarySeen) item.isPrimary = false;
      primarySeen = true;
    }
  }

  for (const identity of prepared.filter(item => ["MAC", "IEEE", "IP", "YEELIGHT_ID"].includes(item.identityType))) {
    const conflict = await client.query<{ id: string; name: string }>(`
      SELECT d.id, d.name
      FROM device_registry_identities i
      JOIN device_registry_devices d ON d.id = i.device_id
      WHERE i.identity_type = $1 AND i.normalized_value = $2 AND i.device_id <> $3
      LIMIT 1
    `, [identity.identityType, identity.normalizedValue, deviceId]);
    if (conflict.rows[0]) throw new DeviceIdentityConflictError(identity.identityType, identity.value, conflict.rows[0]);
  }
  return prepared;
}

async function syncIdentitySummaries(client: PoolClient, deviceId: string): Promise<void> {
  const result = await client.query<{ identity_type: string; value: string }>(`
    SELECT DISTINCT ON (identity_type) identity_type, value
    FROM device_registry_identities
    WHERE device_id = $1 AND identity_type IN ('MAC', 'IP', 'IEEE', 'FQDN')
    ORDER BY identity_type, is_primary DESC, sort_order, created_at, id
  `, [deviceId]);
  const values = new Map(result.rows.map(row => [row.identity_type, row.value]));
  await client.query(`
    UPDATE device_registry_devices SET
      mac_address = $2,
      ip_address = $3::inet,
      ieee_address = $4,
      fqdn = $5,
      updated_at = NOW()
    WHERE id = $1
  `, [deviceId, values.get("MAC") ?? null, values.get("IP") ?? null, values.get("IEEE") ?? null, values.get("FQDN") ?? null]);
}

async function replaceChildren(
  client: PoolClient,
  deviceId: string,
  identities: z.infer<typeof identitySchema>[] | undefined,
  links: z.infer<typeof linkSchema>[] | undefined,
  technologies?: string[],
  accessLinks?: z.infer<typeof accessLinkSchema>[]
): Promise<void> {
  if (identities !== undefined) {
    const prepared = await prepareIdentities(client, deviceId, identities);
    await client.query("DELETE FROM device_registry_identities WHERE device_id = $1", [deviceId]);
    for (const identity of prepared) {
      await client.query(`
        INSERT INTO device_registry_identities (
          device_id, identity_type, value, normalized_value, source, label_code, label, is_primary, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [deviceId, identity.identityType, identity.value, identity.normalizedValue, identity.source ?? null, identity.labelCode, identity.label, identity.isPrimary, identity.sortOrder]);
    }
    await syncIdentitySummaries(client, deviceId);
  }
  if (technologies !== undefined) {
    await client.query("DELETE FROM device_registry_device_technologies WHERE device_id = $1", [deviceId]);
    for (const technologyCode of [...new Set(technologies)]) {
      await client.query(`
        INSERT INTO device_registry_device_technologies (device_id, technology_code)
        VALUES ($1, $2)
      `, [deviceId, technologyCode]);
    }
  }
  if (accessLinks !== undefined) {
    await client.query("DELETE FROM device_access_links WHERE device_id = $1", [deviceId]);
    for (const accessLink of accessLinks) {
      await client.query(`
        INSERT INTO device_access_links (
          device_id, name, link_type, url_template, username, port, parameters, icon, color, enabled, sort_order, publish_as_service, published_service_name, published_service_class, published_service_type, published_service_description
        ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      `, [
        deviceId, accessLink.name, accessLink.linkType, accessLink.urlTemplate,
        accessLink.username ?? null, accessLink.port ?? null, JSON.stringify(accessLink.parameters ?? {}),
        accessLink.icon ?? "link", accessLink.color ?? "blue", accessLink.enabled ?? true, accessLink.sortOrder ?? 100,
        accessLink.publishAsService ?? false, accessLink.publishedServiceName ?? null, accessLink.publishedServiceClass ?? null,
        accessLink.publishedServiceType ?? null, accessLink.publishedServiceDescription ?? null
      ]);
    }
  }
  if (links !== undefined) {
    await client.query("DELETE FROM device_registry_links WHERE device_id = $1", [deviceId]);
    for (const link of links) {
      await client.query(`
        INSERT INTO device_registry_links (device_id, target_type, target_id)
        VALUES ($1, $2, $3)
      `, [deviceId, link.targetType, link.targetId]);
    }
  }
}

async function sendDevice(pool: Pool, id: string, reply: FastifyReply) {
  const row = await getDeviceRow(pool, id);
  if (!row) return reply.code(404).send({ error: "Device not found" });
  const [identityResult, linkResult, accessLinkResult] = await Promise.all([
    pool.query<IdentityRow>(`
      SELECT i.id, i.device_id, i.identity_type, i.value, i.source, i.label_code, i.label,
        COALESCE(il.label, i.label) AS label_display, i.is_primary, i.sort_order, i.normalized_value
      FROM device_registry_identities i
      LEFT JOIN device_identity_labels il ON il.code = i.label_code
      WHERE i.device_id = $1
      ORDER BY i.identity_type, i.is_primary DESC, i.sort_order, i.value
    `, [id]),
    pool.query<LinkRow>("SELECT id, device_id, target_type, target_id FROM device_registry_links WHERE device_id = $1 ORDER BY target_type, target_id", [id]),
    pool.query<AccessLinkRow>("SELECT id, device_id, name, link_type, url_template, username, port, parameters, icon, color, enabled, sort_order, publish_as_service, published_service_name, published_service_class, published_service_type, published_service_description FROM device_access_links WHERE device_id = $1 ORDER BY sort_order, LOWER(name), id", [id])
  ]);
  return reply.send(mapDevice(row, identityResult.rows, linkResult.rows, accessLinkResult.rows));
}

export async function registerDeviceRegistryFeature(
  app: FastifyInstance,
  options: DeviceRegistryFeatureOptions
): Promise<void> {
  const { pool } = options;

  app.get("/api/v1/device-registry/reference/device-classes", async (_request, reply) => {
    const result = await pool.query(`
      SELECT code, label, description, icon, color, enabled, sort_order AS "sortOrder"
      FROM device_classes
      WHERE enabled = TRUE
      ORDER BY sort_order, LOWER(label), code
    `);
    return reply.send(result.rows);
  });

  app.get("/api/v1/device-registry/reference/device-types", async (_request, reply) => {
    const result = await pool.query(`
      SELECT code, label, device_class AS "deviceClass", category, icon, color, enabled, sort_order AS "sortOrder"
      FROM device_types
      WHERE enabled = TRUE
      ORDER BY sort_order, LOWER(label), code
    `);
    return reply.send(result.rows);
  });

  app.get("/api/v1/device-registry/reference/technologies", async (_request, reply) => {
    const result = await pool.query(`
      SELECT code, label, category, icon, color, enabled, sort_order AS "sortOrder"
      FROM device_technologies
      WHERE enabled = TRUE
      ORDER BY sort_order, LOWER(label), code
    `);
    return reply.send(result.rows);
  });

  app.get("/api/v1/device-registry/reference/identity-labels", async (_request, reply) => {
    const result = await pool.query(`
      SELECT code, label, description, enabled, sort_order AS "sortOrder"
      FROM device_identity_labels
      WHERE enabled = TRUE
      ORDER BY sort_order, LOWER(label), code
    `);
    return reply.send(result.rows);
  });

  app.get("/api/v1/device-registry/taxonomy/classes", async (_request, reply) => {
    const result = await pool.query(`
      SELECT code, label, description, icon, color, enabled, sort_order AS "sortOrder"
      FROM device_classes ORDER BY sort_order, LOWER(label), code
    `);
    return reply.send(result.rows);
  });

  app.post("/api/v1/device-registry/taxonomy/classes", async (
    request: FastifyRequest<{ Body: unknown }>, reply
  ) => {
    const parsed = classReferenceSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid class" });
    const value = parsed.data;
    try {
      const result = await pool.query(`
        INSERT INTO device_classes (code, label, description, icon, color, enabled, sort_order)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING code, label, description, icon, color, enabled, sort_order AS "sortOrder"
      `, [value.code, value.label, value.description ?? null, value.icon, value.color, value.enabled ?? true, value.sortOrder ?? 100]);
      return reply.code(201).send(result.rows[0]);
    } catch (error: any) {
      if (error?.code === "23505") return reply.code(409).send({ error: "Class code already exists" });
      throw error;
    }
  });

  app.patch("/api/v1/device-registry/taxonomy/classes/:code", async (
    request: FastifyRequest<{ Params: { code: string }; Body: unknown }>, reply
  ) => {
    const schema = classReferenceSchema.omit({ code: true }).partial().refine(value => Object.keys(value).length > 0, "At least one field is required");
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid class" });
    const value = parsed.data;
    const result = await pool.query(`
      UPDATE device_classes SET
        label = COALESCE($2, label),
        description = CASE WHEN $3 THEN $4 ELSE description END,
        icon = COALESCE($5, icon), color = COALESCE($6, color),
        enabled = COALESCE($7, enabled), sort_order = COALESCE($8, sort_order), updated_at = NOW()
      WHERE code = $1
      RETURNING code, label, description, icon, color, enabled, sort_order AS "sortOrder"
    `, [request.params.code, value.label ?? null, Object.prototype.hasOwnProperty.call(value, "description"), value.description ?? null, value.icon ?? null, value.color ?? null, value.enabled ?? null, value.sortOrder ?? null]);
    if (!result.rows[0]) return reply.code(404).send({ error: "Class not found" });
    return reply.send(result.rows[0]);
  });

  app.delete("/api/v1/device-registry/taxonomy/classes/:code", async (
    request: FastifyRequest<{ Params: { code: string } }>, reply
  ) => {
    try {
      const result = await pool.query("DELETE FROM device_classes WHERE code = $1", [request.params.code]);
      if ((result.rowCount ?? 0) === 0) return reply.code(404).send({ error: "Class not found" });
      return reply.code(204).send();
    } catch (error: any) {
      if (error?.code === "23503") return reply.code(409).send({ error: "Class is in use. Disable it instead of deleting it." });
      throw error;
    }
  });

  app.get("/api/v1/device-registry/taxonomy/types", async (_request, reply) => {
    const result = await pool.query(`
      SELECT code, label, device_class AS "deviceClass", category, icon, color, enabled, sort_order AS "sortOrder"
      FROM device_types ORDER BY sort_order, LOWER(label), code
    `);
    return reply.send(result.rows);
  });

  app.post("/api/v1/device-registry/taxonomy/types", async (
    request: FastifyRequest<{ Body: unknown }>, reply
  ) => {
    const parsed = typeReferenceSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid type" });
    const value = parsed.data;
    try {
      const result = await pool.query(`
        INSERT INTO device_types (code, label, device_class, category, icon, color, enabled, sort_order)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING code, label, device_class AS "deviceClass", category, icon, color, enabled, sort_order AS "sortOrder"
      `, [value.code, value.label, value.deviceClass, value.category, value.icon, value.color, value.enabled ?? true, value.sortOrder ?? 100]);
      return reply.code(201).send(result.rows[0]);
    } catch (error: any) {
      if (error?.code === "23505") return reply.code(409).send({ error: "Type code already exists" });
      if (error?.code === "23503") return reply.code(400).send({ error: "Unknown device class" });
      throw error;
    }
  });

  app.patch("/api/v1/device-registry/taxonomy/types/:code", async (
    request: FastifyRequest<{ Params: { code: string }; Body: unknown }>, reply
  ) => {
    const schema = typeReferenceSchema.omit({ code: true }).partial().refine(value => Object.keys(value).length > 0, "At least one field is required");
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid type" });
    const value = parsed.data;
    const result = await pool.query(`
      UPDATE device_types SET
        label = COALESCE($2, label), device_class = COALESCE($3, device_class), category = COALESCE($4, category),
        icon = COALESCE($5, icon), color = COALESCE($6, color), enabled = COALESCE($7, enabled),
        sort_order = COALESCE($8, sort_order), updated_at = NOW()
      WHERE code = $1
      RETURNING code, label, device_class AS "deviceClass", category, icon, color, enabled, sort_order AS "sortOrder"
    `, [request.params.code, value.label ?? null, value.deviceClass ?? null, value.category ?? null, value.icon ?? null, value.color ?? null, value.enabled ?? null, value.sortOrder ?? null]);
    if (!result.rows[0]) return reply.code(404).send({ error: "Type not found" });
    return reply.send(result.rows[0]);
  });

  app.delete("/api/v1/device-registry/taxonomy/types/:code", async (
    request: FastifyRequest<{ Params: { code: string } }>, reply
  ) => {
    try {
      const result = await pool.query("DELETE FROM device_types WHERE code = $1", [request.params.code]);
      if ((result.rowCount ?? 0) === 0) return reply.code(404).send({ error: "Type not found" });
      return reply.code(204).send();
    } catch (error: any) {
      if (error?.code === "23503") return reply.code(409).send({ error: "Type is in use. Disable it instead of deleting it." });
      throw error;
    }
  });

  app.get("/api/v1/device-registry/taxonomy/technologies", async (_request, reply) => {
    const result = await pool.query(`
      SELECT code, label, category, icon, color, enabled, sort_order AS "sortOrder"
      FROM device_technologies ORDER BY sort_order, LOWER(label), code
    `);
    return reply.send(result.rows);
  });

  app.post("/api/v1/device-registry/taxonomy/technologies", async (
    request: FastifyRequest<{ Body: unknown }>, reply
  ) => {
    const parsed = technologyReferenceSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid technology" });
    const value = parsed.data;
    try {
      const result = await pool.query(`
        INSERT INTO device_technologies (code, label, category, icon, color, enabled, sort_order)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING code, label, category, icon, color, enabled, sort_order AS "sortOrder"
      `, [value.code, value.label, value.category, value.icon, value.color, value.enabled ?? true, value.sortOrder ?? 100]);
      return reply.code(201).send(result.rows[0]);
    } catch (error: any) {
      if (error?.code === "23505") return reply.code(409).send({ error: "Technology code already exists" });
      throw error;
    }
  });

  app.patch("/api/v1/device-registry/taxonomy/technologies/:code", async (
    request: FastifyRequest<{ Params: { code: string }; Body: unknown }>, reply
  ) => {
    const schema = technologyReferenceSchema.omit({ code: true }).partial().refine(value => Object.keys(value).length > 0, "At least one field is required");
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid technology" });
    const value = parsed.data;
    const result = await pool.query(`
      UPDATE device_technologies SET label = COALESCE($2, label), category = COALESCE($3, category),
        icon = COALESCE($4, icon), color = COALESCE($5, color), enabled = COALESCE($6, enabled),
        sort_order = COALESCE($7, sort_order), updated_at = NOW()
      WHERE code = $1
      RETURNING code, label, category, icon, color, enabled, sort_order AS "sortOrder"
    `, [request.params.code, value.label ?? null, value.category ?? null, value.icon ?? null, value.color ?? null, value.enabled ?? null, value.sortOrder ?? null]);
    if (!result.rows[0]) return reply.code(404).send({ error: "Technology not found" });
    return reply.send(result.rows[0]);
  });

  app.delete("/api/v1/device-registry/taxonomy/technologies/:code", async (
    request: FastifyRequest<{ Params: { code: string } }>, reply
  ) => {
    try {
      const result = await pool.query("DELETE FROM device_technologies WHERE code = $1", [request.params.code]);
      if ((result.rowCount ?? 0) === 0) return reply.code(404).send({ error: "Technology not found" });
      return reply.code(204).send();
    } catch (error: any) {
      if (error?.code === "23503") return reply.code(409).send({ error: "Technology is in use. Disable it instead of deleting it." });
      throw error;
    }
  });

  app.get("/api/v1/device-registry/devices", async (_request, reply) => {
    const rows = await listDeviceRows(pool);
    const [identityResult, linkResult, accessLinkResult] = await Promise.all([
      pool.query<IdentityRow>(`
        SELECT i.id, i.device_id, i.identity_type, i.value, i.source, i.label_code, i.label,
          COALESCE(il.label, i.label) AS label_display, i.is_primary, i.sort_order, i.normalized_value
        FROM device_registry_identities i
        LEFT JOIN device_identity_labels il ON il.code = i.label_code
        ORDER BY i.device_id, i.identity_type, i.is_primary DESC, i.sort_order, i.value
      `),
      pool.query<LinkRow>("SELECT id, device_id, target_type, target_id FROM device_registry_links ORDER BY target_type, target_id"),
      pool.query<AccessLinkRow>("SELECT id, device_id, name, link_type, url_template, username, port, parameters, icon, color, enabled, sort_order, publish_as_service, published_service_name, published_service_class, published_service_type, published_service_description FROM device_access_links ORDER BY device_id, sort_order, LOWER(name), id")
    ]);
    return reply.send(rows.map(row => mapDevice(row, identityResult.rows, linkResult.rows, accessLinkResult.rows)));
  });

  app.get("/api/v1/device-registry/devices/:id", async (
    request: FastifyRequest<{ Params: { id: string } }>, reply
  ) => sendDevice(pool, request.params.id, reply));

  app.post("/api/v1/device-registry/devices", async (
    request: FastifyRequest<{ Body: unknown }>, reply
  ) => {
    const parsed = deviceCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid device" });
    const input = parsed.data;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ id: string }>(`
        INSERT INTO device_registry_devices (
          name, device_class, device_type, technology, mac_address, ip_address, ieee_address, fqdn, manufacturer, model,
          firmware_version, description, location_id, parent_device_id,
          health_profile_id, control_agent_id, control_provider, enabled, last_seen_at, battery_percent, rssi
        ) VALUES ($1,$2,$3,$4,$5,$6::inet,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        RETURNING id
      `, [
        input.name, input.deviceClass, input.deviceType, input.technology ?? null,
        input.macAddress ?? null, input.ipAddress ?? null, input.ieeeAddress ?? null, input.fqdn ?? null,
        input.manufacturer ?? null, input.model ?? null, input.firmwareVersion ?? null,
        input.description ?? null, input.locationId ?? null, input.parentDeviceId ?? null,
        input.healthProfileId ?? null, input.controlAgentId ?? null,
        controlProviderFromTechnologies(input.technologies ?? (input.technology ? [input.technology] : [])),
        input.enabled ?? true, input.lastSeenAt ?? null, input.batteryPercent ?? null, input.rssi ?? null
      ]);
      const id = result.rows[0]!.id;
      await replaceChildren(client, id, input.identities ?? [], input.links ?? [], input.technologies ?? (input.technology ? [input.technology] : []), input.accessLinks ?? []);
      await client.query("COMMIT");
      return sendDevice(pool, id, reply.code(201));
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof DeviceIdentityValidationError) {
        return reply.code(400).send({ code: "DEVICE_IDENTITY_INVALID", error: error.message });
      }
      if (error instanceof DeviceIdentityConflictError) {
        return reply.code(409).send({
          code: "DEVICE_IDENTITY_CONFLICT",
          error: error.message,
          identityType: error.identityType,
          value: error.value,
          device: error.device
        });
      }
      throw error;
    } finally {
      client.release();
    }
  });

  app.patch("/api/v1/device-registry/devices/:id", async (
    request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply
  ) => {
    const parsed = deviceUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid device" });
    const input = parsed.data;
    const existing = await getDeviceRow(pool, request.params.id);
    if (!existing) return reply.code(404).send({ error: "Device not found" });
    if (input.parentDeviceId === request.params.id) return reply.code(400).send({ error: "A device cannot be its own parent" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        UPDATE device_registry_devices SET
          name = COALESCE($2, name),
          device_class = COALESCE($3, device_class),
          device_type = COALESCE($4, device_type),
          technology = CASE WHEN $5 THEN $6 ELSE technology END,
          mac_address = CASE WHEN $7 THEN $8 ELSE mac_address END,
          ip_address = CASE WHEN $9 THEN $10::inet ELSE ip_address END,
          ieee_address = CASE WHEN $11 THEN $12 ELSE ieee_address END,
          fqdn = CASE WHEN $13 THEN $14 ELSE fqdn END,
          manufacturer = CASE WHEN $15 THEN $16 ELSE manufacturer END,
          model = CASE WHEN $17 THEN $18 ELSE model END,
          firmware_version = CASE WHEN $19 THEN $20 ELSE firmware_version END,
          description = CASE WHEN $21 THEN $22 ELSE description END,
          location_id = CASE WHEN $23 THEN $24::uuid ELSE location_id END,
          parent_device_id = CASE WHEN $25 THEN $26::uuid ELSE parent_device_id END,
          health_profile_id = CASE WHEN $27 THEN $28::uuid ELSE health_profile_id END,
          control_agent_id = CASE WHEN $29 THEN $30::uuid ELSE control_agent_id END,
          control_provider = CASE WHEN $31 THEN $32 ELSE control_provider END,
          enabled = COALESCE($33, enabled),
          last_seen_at = CASE WHEN $34 THEN $35::timestamptz ELSE last_seen_at END,
          battery_percent = CASE WHEN $36 THEN $37::double precision ELSE battery_percent END,
          rssi = CASE WHEN $38 THEN $39::double precision ELSE rssi END,
          updated_at = NOW()
        WHERE id = $1
      `, [
        request.params.id,
        input.name ?? null,
        input.deviceClass ?? null,
        input.deviceType ?? null,
        Object.prototype.hasOwnProperty.call(input, "technology"), input.technology ?? null,
        Object.prototype.hasOwnProperty.call(input, "macAddress"), input.macAddress ?? null,
        Object.prototype.hasOwnProperty.call(input, "ipAddress"), input.ipAddress ?? null,
        Object.prototype.hasOwnProperty.call(input, "ieeeAddress"), input.ieeeAddress ?? null,
        Object.prototype.hasOwnProperty.call(input, "fqdn"), input.fqdn ?? null,
        Object.prototype.hasOwnProperty.call(input, "manufacturer"), input.manufacturer ?? null,
        Object.prototype.hasOwnProperty.call(input, "model"), input.model ?? null,
        Object.prototype.hasOwnProperty.call(input, "firmwareVersion"), input.firmwareVersion ?? null,
        Object.prototype.hasOwnProperty.call(input, "description"), input.description ?? null,
        Object.prototype.hasOwnProperty.call(input, "locationId"), input.locationId ?? null,
        Object.prototype.hasOwnProperty.call(input, "parentDeviceId"), input.parentDeviceId ?? null,
        Object.prototype.hasOwnProperty.call(input, "healthProfileId"), input.healthProfileId ?? null,
        Object.prototype.hasOwnProperty.call(input, "controlAgentId"), input.controlAgentId ?? null,
        Object.prototype.hasOwnProperty.call(input, "technologies"),
        input.technologies ? controlProviderFromTechnologies(input.technologies) : null,
        input.enabled ?? null,
        Object.prototype.hasOwnProperty.call(input, "lastSeenAt"), input.lastSeenAt ?? null,
        Object.prototype.hasOwnProperty.call(input, "batteryPercent"), input.batteryPercent ?? null,
        Object.prototype.hasOwnProperty.call(input, "rssi"), input.rssi ?? null
      ]);
      await replaceChildren(client, request.params.id, input.identities, input.links, input.technologies, input.accessLinks);
      await client.query("COMMIT");
      return sendDevice(pool, request.params.id, reply);
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof DeviceIdentityValidationError) {
        return reply.code(400).send({ code: "DEVICE_IDENTITY_INVALID", error: error.message });
      }
      if (error instanceof DeviceIdentityConflictError) {
        return reply.code(409).send({
          code: "DEVICE_IDENTITY_CONFLICT",
          error: error.message,
          identityType: error.identityType,
          value: error.value,
          device: error.device
        });
      }
      throw error;
    } finally {
      client.release();
    }
  });

  app.delete("/api/v1/device-registry/devices/:id", async (
    request: FastifyRequest<{ Params: { id: string } }>, reply
  ) => {
    const result = await pool.query("DELETE FROM device_registry_devices WHERE id = $1", [request.params.id]);
    if ((result.rowCount ?? 0) === 0) return reply.code(404).send({ error: "Device not found" });
    return reply.code(204).send();
  });

  app.get("/api/v1/device-registry/health-profiles", async (_request, reply) => {
    const result = await pool.query(`
      SELECT
        id, name, description,
        warning_after_seconds AS "warningAfterSeconds",
        offline_after_seconds AS "offlineAfterSeconds",
        battery_warning_percent AS "batteryWarningPercent",
        battery_critical_percent AS "batteryCriticalPercent",
        rssi_warning AS "rssiWarning",
        rssi_critical AS "rssiCritical",
        monitoring_policy AS "monitoringPolicy",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM device_health_profiles
      ORDER BY LOWER(name), id
    `);
    return reply.send(result.rows);
  });

  app.post("/api/v1/device-registry/health-profiles", async (
    request: FastifyRequest<{ Body: unknown }>, reply
  ) => {
    const parsed = healthProfileCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid health profile" });
    const input = parsed.data;
    const result = await pool.query(`
      INSERT INTO device_health_profiles (
        name, description, warning_after_seconds, offline_after_seconds,
        battery_warning_percent, battery_critical_percent, rssi_warning, rssi_critical, monitoring_policy
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING
        id, name, description,
        warning_after_seconds AS "warningAfterSeconds",
        offline_after_seconds AS "offlineAfterSeconds",
        battery_warning_percent AS "batteryWarningPercent",
        battery_critical_percent AS "batteryCriticalPercent",
        rssi_warning AS "rssiWarning",
        rssi_critical AS "rssiCritical",
        monitoring_policy AS "monitoringPolicy",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `, [
      input.name, input.description ?? null, input.warningAfterSeconds ?? null,
      input.offlineAfterSeconds ?? null, input.batteryWarningPercent ?? null,
      input.batteryCriticalPercent ?? null, input.rssiWarning ?? null, input.rssiCritical ?? null, input.monitoringPolicy ?? "IGNORE"
    ]);
    return reply.code(201).send(result.rows[0]);
  });

  app.patch("/api/v1/device-registry/health-profiles/:id", async (
    request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply
  ) => {
    const parsed = healthProfileUpdateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid health profile" });
    const input = parsed.data;
    const result = await pool.query(`
      UPDATE device_health_profiles SET
        name = COALESCE($2, name),
        description = CASE WHEN $3 THEN $4 ELSE description END,
        warning_after_seconds = CASE WHEN $5 THEN $6::integer ELSE warning_after_seconds END,
        offline_after_seconds = CASE WHEN $7 THEN $8::integer ELSE offline_after_seconds END,
        battery_warning_percent = CASE WHEN $9 THEN $10::double precision ELSE battery_warning_percent END,
        battery_critical_percent = CASE WHEN $11 THEN $12::double precision ELSE battery_critical_percent END,
        rssi_warning = CASE WHEN $13 THEN $14::double precision ELSE rssi_warning END,
        rssi_critical = CASE WHEN $15 THEN $16::double precision ELSE rssi_critical END,
        monitoring_policy = COALESCE($17, monitoring_policy),
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id, name, description,
        warning_after_seconds AS "warningAfterSeconds",
        offline_after_seconds AS "offlineAfterSeconds",
        battery_warning_percent AS "batteryWarningPercent",
        battery_critical_percent AS "batteryCriticalPercent",
        rssi_warning AS "rssiWarning",
        rssi_critical AS "rssiCritical",
        monitoring_policy AS "monitoringPolicy",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `, [
      request.params.id,
      input.name ?? null,
      Object.prototype.hasOwnProperty.call(input, "description"), input.description ?? null,
      Object.prototype.hasOwnProperty.call(input, "warningAfterSeconds"), input.warningAfterSeconds ?? null,
      Object.prototype.hasOwnProperty.call(input, "offlineAfterSeconds"), input.offlineAfterSeconds ?? null,
      Object.prototype.hasOwnProperty.call(input, "batteryWarningPercent"), input.batteryWarningPercent ?? null,
      Object.prototype.hasOwnProperty.call(input, "batteryCriticalPercent"), input.batteryCriticalPercent ?? null,
      Object.prototype.hasOwnProperty.call(input, "rssiWarning"), input.rssiWarning ?? null,
      Object.prototype.hasOwnProperty.call(input, "rssiCritical"), input.rssiCritical ?? null,
      input.monitoringPolicy ?? null
    ]);
    if (!result.rows[0]) return reply.code(404).send({ error: "Health profile not found" });
    return reply.send(result.rows[0]);
  });

  app.delete("/api/v1/device-registry/health-profiles/:id", async (
    request: FastifyRequest<{ Params: { id: string } }>, reply
  ) => {
    const result = await pool.query("DELETE FROM device_health_profiles WHERE id = $1", [request.params.id]);
    if ((result.rowCount ?? 0) === 0) return reply.code(404).send({ error: "Health profile not found" });
    return reply.code(204).send();
  });
}
