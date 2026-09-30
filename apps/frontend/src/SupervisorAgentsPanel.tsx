import React from "react";
import { ActionIcon, Badge, Button, Card, Code, Group, Indicator, Modal, NumberInput, Select, Stack, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AgentVersionFreshnessBadge, getAgentVersionAvailability, UpdateLifecycleAge } from "./AgentVersionAvailability";
import { DeleteActionIcon, EditActionIcon, ReinstallCommandActionIcon } from "./TableActionIcons";
import { createMonitoringAgent, getDeviceAgents, getDeviceAgentSlots, getMonitoringAgents, getMonitoringSlots, regenerateDeviceAgentToken, regenerateMonitoringAgentToken } from "./api";
import type { AgentTechnicalModel, ManagedAgentOperation } from "./types";
import { AgentActionDetails, AgentActionHistory } from "./AgentActionDetails";
import { AgentTypeIcon, agentTypeLabel } from "./AgentTypeIcon";
import { HostNetworkCell, type HostNetworkInterface } from "./HostNetworkCell";
import { AgentReportedCell, AgentSystemCell } from "./AgentTechnicalCells";
import { hasAgentUpdate } from "./AgentBulkUpdate";
import { SortableTableHeader, compareTableValues, type SortDirection } from "./SortableTableHeader";
import { usePersistentState } from "./preferences/usePersistentState";
import { ResetFiltersAction } from "./ResetFiltersAction";
import { activeFilterStyles } from "./ActiveFilterStyles";
import { FilterClearAction } from "./FilterClearAction";


export interface AutonomousSupervisorAgent extends AgentTechnicalModel {
  id: string; name: string; enabled: boolean; labels: Record<string, string>; agentLabels: string[]; hostNetworks: HostNetworkInterface[]; managedAgents: Array<Record<string, unknown>>;
  createdAt: string; updatedAt: string;
}

export async function getAutonomousSupervisors(): Promise<AutonomousSupervisorAgent[]> {
  const response = await fetch("/api/v1/device-control/supervisors");
  if (!response.ok) throw new Error(`Unable to load Supervisor Agents (${response.status})`);
  return response.json();
}

async function getSupervisorManagedOperationHistory(): Promise<ManagedAgentOperation[]> {
  const response = await fetch("/api/v1/device-control/supervisor-managed-agent-operations?limit=50");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Unable to load managed-agent operation history (${response.status})`);
  return payload;
}

async function clearSupervisorManagedOperationHistory(): Promise<void> {
  const response = await fetch("/api/v1/device-control/supervisor-managed-agent-operations", { method: "DELETE" });
  if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error ?? `Unable to clear managed-agent operation history (${response.status})`); }
}

async function getInstallationEnvironment(): Promise<string> {
  const response = await fetch("/api/v1/device-control/environment");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Unable to load SensorSphere environment (${response.status})`);
  return typeof payload.environment === "string" && payload.environment ? payload.environment : "DEFAULT";
}

async function createAutonomousSupervisor(name: string): Promise<{ supervisor: AutonomousSupervisorAgent; token: string }> {
  const response = await fetch("/api/v1/device-control/supervisors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Unable to create Supervisor Agent (${response.status})`);
  return payload;
}

async function updateAutonomousSupervisor(id: string, input: { name?: string; enabled?: boolean; labels?: Record<string, string>; heartbeatTimeoutSeconds?: number }): Promise<AutonomousSupervisorAgent> {
  const response = await fetch(`/api/v1/device-control/supervisors/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Unable to update Supervisor Agent (${response.status})`);
  return payload;
}

async function requestAutonomousSupervisorUpdate(id: string, version: string): Promise<void> {
  const response = await fetch(`/api/v1/device-control/supervisors/${id}/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `Unable to request Supervisor Agent update (${response.status})`);
}

type SupervisorManagedOperation = ManagedAgentOperation & { supervisorId: string };

async function createDeviceAgentIdentity(name: string, slot?: { slotId?: string; slotName?: string }): Promise<{ agent: { id: string }; token: string }> {
  const response = await fetch("/api/v1/device-control/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, ...(slot?.slotId ? { slotId: slot.slotId } : {}), ...(!slot?.slotId && slot?.slotName ? { slotName: slot.slotName } : {}) })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Unable to create Device Agent identity (${response.status})`);
  return payload;
}


async function requestSupervisorManagedOperation(id: string, input: Record<string, unknown>): Promise<SupervisorManagedOperation> {
  const response = await fetch(`/api/v1/device-control/supervisors/${id}/managed-agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Unable to request managed-agent operation (${response.status})`);
  return payload;
}

async function waitSupervisorManagedOperation(commandId: string, onProgress?: (operation: SupervisorManagedOperation) => void): Promise<SupervisorManagedOperation> {
  const deadline = Date.now() + 615_000;
  while (Date.now() < deadline) {
    await new Promise(resolve => window.setTimeout(resolve, 1000));
    const response = await fetch(`/api/v1/device-control/supervisor-managed-agents/${commandId}`);
    const payload = await response.json() as SupervisorManagedOperation;
    if (!response.ok) throw new Error(payload.error ?? `Unable to read managed-agent operation (${response.status})`);
    onProgress?.(payload);
    if (["SUCCESS", "FAILED", "TIMEOUT"].includes(payload.status)) return payload;
  }
  throw new Error("Managed-agent operation timed out");
}

async function checkAutonomousSupervisorToken(id: string): Promise<{ matches: boolean; expectedFingerprint: string | null; deployedFingerprint: string | null }> {
  const response = await fetch(`/api/v1/device-control/supervisors/${id}/check-token`, { method: "POST" });
  const started = await response.json();
  if (!response.ok) throw new Error(started.error ?? `Unable to check Supervisor token (${response.status})`);
  const completed = await waitSupervisorManagedOperation(started.commandId);
  if (completed.status !== "SUCCESS") throw new Error(completed.error ?? "Supervisor token check failed");
  return (completed.result ?? {}) as { matches: boolean; expectedFingerprint: string | null; deployedFingerprint: string | null };
}

function CheckTokenIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l7 3v5c0 4.6-2.9 8.1-7 10-4.1-1.9-7-5.4-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.8"/><path d="m8.5 12 2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

async function regenerateAutonomousSupervisorToken(id: string): Promise<{ supervisor: AutonomousSupervisorAgent; token: string }> {
  const response = await fetch(`/api/v1/device-control/supervisors/${id}/regenerate-token`, { method: "POST" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? `Unable to regenerate Supervisor token (${response.status})`);
  return payload;
}

async function deleteAutonomousSupervisor(id: string): Promise<void> {
  const response = await fetch(`/api/v1/device-control/supervisors/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Unable to delete Supervisor Agent (${response.status})`);
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function CopyIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}

function AgentUpdateIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.5 5.5 6v5.3c0 4.2 2.8 7.7 6.5 9.2 3.7-1.5 6.5-5 6.5-9.2V6L12 3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 15V9m0 0-2.3 2.3M12 9l2.3 2.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SupervisorUpdateIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.5 5.5 6v5.3c0 4.2 2.8 7.7 6.5 9.2 3.7-1.5 6.5-5 6.5-9.2V6L12 3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 15V9m0 0-2.3 2.3M12 9l2.3 2.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DeployAgentIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5" width="10" height="14" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M9 9v6M6 12h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M17 8h3m-1.5-1.5V9.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}


function DeprovisionAgentIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;
}

function ManagedRuntimeIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M7 9h10M7 13h4M14 13h3M7 17h7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;
}

function managedAssociation(entry: Record<string, unknown>): Record<string, unknown> | null {
  const value = entry.sensor_sphere_association;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function managedString(entry: Record<string, unknown> | null, key: string): string | null {
  if (!entry) return null;
  const value = entry[key];
  return typeof value === "string" && value ? value : null;
}

function nextMonitoringInstance(agent: AutonomousSupervisorAgent): string {
  const used = new Set(agent.managedAgents.filter(entry => entry.agent_type === "monitor-agent" && entry.installed !== false && typeof entry.management_id === "string" && entry.management_id).map(entry => typeof entry.instance === "string" ? entry.instance : "main"));
  if (!used.has("main")) return "main";
  for (let index = 1; index < 1000; index += 1) {
    const candidate = `i${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return `i${Date.now()}`;
}

function defaultMonitoringAgentName(supervisor: AutonomousSupervisorAgent, instance: string): string {
  return instance === "main" ? `${supervisor.name}-monitor` : `${supervisor.name}-${instance}`;
}

function reconciliationColor(value: string | null): string {
  if (value === "MANAGED") return "green";
  if (value === "ERROR") return "red";
  if (value === "MISSING") return "orange";
  if (value === "DISCOVERED") return "blue";
  if (value === "DRIFT") return "yellow";
  if (value === "UNTRACKED") return "grape";
  return "gray";
}

function managedRuntimeDiagnostic(entry: Record<string, unknown>): {
  status: "MANAGED" | "DRIFT" | "MISSING" | "DISCOVERED" | "UNTRACKED" | "ERROR";
  reasons: string[];
} {
  const association = managedAssociation(entry);
  const managementId = typeof entry.management_id === "string" && entry.management_id ? entry.management_id : null;
  const runtimeReported = entry.runtime_reported !== false;
  const installed = entry.installed !== false;
  const runtimeVersion = typeof entry.configured_version === "string" ? entry.configured_version : null;
  const runtimeInstallDir = typeof entry.install_dir === "string" ? entry.install_dir : null;
  const runtimeComposeProject = typeof entry.compose_project === "string" ? entry.compose_project : null;
  const containerState = typeof entry.container_state === "string" ? entry.container_state : null;
  const supervisorReconciliation = typeof entry.reconciliation_status === "string" ? entry.reconciliation_status : null;
  const desiredVersion = managedString(association, "desired_version");
  const expectedInstallDir = managedString(association, "install_dir");
  const expectedComposeProject = managedString(association, "compose_project");
  const sensorSphereReconciliation = managedString(association, "reconciliation_status");

  if (supervisorReconciliation === "ERROR" || sensorSphereReconciliation === "ERROR") {
    return { status: "ERROR", reasons: ["SensorSphere or Supervisor reports a reconciliation error"] };
  }

  if (!managementId) {
    return { status: "DISCOVERED", reasons: ["Runtime is present but has no SensorSphere management_id"] };
  }

  if (!association) {
    return { status: "UNTRACKED", reasons: ["Runtime reports a management_id that has no SensorSphere association"] };
  }

  if (!runtimeReported || !installed) {
    return { status: "MISSING", reasons: [!runtimeReported ? "SensorSphere association exists but Supervisor does not report the runtime" : "Supervisor reports the runtime as not installed"] };
  }

  const reasons: string[] = [];
  if (desiredVersion && runtimeVersion && desiredVersion !== runtimeVersion) {
    reasons.push(`Version drift: desired ${desiredVersion}, runtime ${runtimeVersion}`);
  }
  if (expectedInstallDir && runtimeInstallDir && expectedInstallDir !== runtimeInstallDir) {
    reasons.push(`Path drift: expected ${expectedInstallDir}, runtime ${runtimeInstallDir}`);
  }
  if (expectedComposeProject && runtimeComposeProject && expectedComposeProject !== runtimeComposeProject) {
    reasons.push(`Compose project drift: expected ${expectedComposeProject}, runtime ${runtimeComposeProject}`);
  }
  if (containerState && containerState !== "running") {
    reasons.push(`Container state is ${containerState}`);
  }

  return reasons.length > 0 ? { status: "DRIFT", reasons } : { status: "MANAGED", reasons: [] };
}

function relativeAge(value: string | null): string {
  if (!value) return "Never";
  const milliseconds = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(milliseconds)) return value;
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) return "less than 1 minute";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

function reportedManagedEntry(agent: AutonomousSupervisorAgent, agentType: "device-agent" | "monitor-agent", instance = "main") {
  return agent.managedAgents.find(entry => entry.agent_type === agentType && entry.instance === instance && entry.installed !== false);
}

function missingManagedEntry(agent: AutonomousSupervisorAgent, agentType: "device-agent" | "monitor-agent", instance?: string) {
  return agent.managedAgents.find(entry => entry.agent_type === agentType && entry.installed === false && (instance == null || entry.instance === instance));
}

function explicitlyManaged(agent: AutonomousSupervisorAgent, agentType: "device-agent" | "monitor-agent", instance = "main"): boolean {
  const entry = reportedManagedEntry(agent, agentType, instance);
  return Boolean(entry && typeof entry.management_id === "string" && entry.management_id);
}

function discoveredUnmanagedEntry(agent: AutonomousSupervisorAgent, agentType: "device-agent" | "monitor-agent", instance = "main") {
  const entry = reportedManagedEntry(agent, agentType, instance);
  return entry && !(typeof entry.management_id === "string" && entry.management_id) ? entry : null;
}

function discoveredUnmanaged(agent: AutonomousSupervisorAgent, agentType: "device-agent" | "monitor-agent", instance = "main"): boolean {
  return discoveredUnmanagedEntry(agent, agentType, instance) != null;
}


function parseManagedLabels(value: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const raw of value.split(/[,\n]/)) {
    const item = raw.trim();
    if (!item) continue;
    const index = item.indexOf("=");
    if (index < 1) result[item] = "";
    else result[item.slice(0, index).trim()] = item.slice(index + 1).trim();
  }
  return result;
}

function labelsText(labels: Record<string, string>): string {
  return Object.entries(labels).map(([key, value]) => value ? `${key}=${value}` : key).join(", ");
}
type SupervisorSortKey = "name" | "status" | "reported" | "version" | "system" | "lastSeen" | "managed" | "labels" | "agentLabels";

export function SupervisorAgentsPanel() {
  const queryClient = useQueryClient();
  const autonomousQuery = useQuery({ queryKey: ["device-control", "supervisors"], queryFn: getAutonomousSupervisors, refetchInterval: 10000 });
  const deviceAgentsQuery = useQuery({ queryKey: ["device-control", "agents"], queryFn: getDeviceAgents, refetchInterval: 10000 });
  const deviceAgentSlotsQuery = useQuery({ queryKey: ["device-control", "slots"], queryFn: getDeviceAgentSlots, refetchInterval: 10000 });
  const monitoringAgentsQuery = useQuery({ queryKey: ["monitoring", "agents"], queryFn: getMonitoringAgents, refetchInterval: 15000 });
  const monitoringSlotsQuery = useQuery({ queryKey: ["monitoring", "slots"], queryFn: getMonitoringSlots, refetchInterval: 15000 });
  const versionsQuery = useQuery({ queryKey: ["agent-version-availability"], queryFn: getAgentVersionAvailability, refetchInterval: 300000 });
  const installationEnvironmentQuery = useQuery({ queryKey: ["device-control", "environment"], queryFn: getInstallationEnvironment, staleTime: 300000 });
  const actionHistoryQuery = useQuery({ queryKey: ["device-control", "managed-operation-history"], queryFn: getSupervisorManagedOperationHistory, refetchInterval: query => (query.state.data ?? []).some(item => item.status === "SENT") ? 1000 : 10000 });
  const [createOpened, setCreateOpened] = React.useState(false);
  const [createName, setCreateName] = React.useState("");
  const [createdToken, setCreatedToken] = React.useState<string | null>(null);
  const [tokenCheckResult, setTokenCheckResult] = React.useState<{ name: string; matches: boolean; expectedFingerprint: string | null; deployedFingerprint: string | null } | null>(null);
  const [tokenTitle, setTokenTitle] = React.useState("Supervisor Agent token");
  const [tokenSupervisorName, setTokenSupervisorName] = React.useState("");
  const [copiedField, setCopiedField] = React.useState<"token" | "command" | null>(null);
  const [editTarget, setEditTarget] = React.useState<AutonomousSupervisorAgent | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editEnabled, setEditEnabled] = React.useState(true);
  const [editHeartbeatTimeout, setEditHeartbeatTimeout] = React.useState(60);
  const [editLabelsText, setEditLabelsText] = React.useState("");
  const [agentNameFilter, setAgentNameFilter] = usePersistentState("device-control.supervisors.filter.name", "");
  const [agentStatusFilter, setAgentStatusFilter] = usePersistentState<string | null>("device-control.supervisors.filter.status", null);
  const [agentReportedFilter, setAgentReportedFilter] = usePersistentState("device-control.supervisors.filter.reported", "");
  const [agentLabelsFilter, setAgentLabelsFilter] = usePersistentState("device-control.supervisors.filter.labels", "");
  const [agentSortKey, setAgentSortKey] = usePersistentState<SupervisorSortKey>("device-control.supervisors.sort.key", "name");
  const [agentSortDirection, setAgentSortDirection] = usePersistentState<SortDirection>("device-control.supervisors.sort.direction", "asc");
  const [deleteTarget, setDeleteTarget] = React.useState<AutonomousSupervisorAgent | null>(null);
  const [autonomousUpdateTarget, setAutonomousUpdateTarget] = React.useState<AutonomousSupervisorAgent | null>(null);
  const [updateVersion, setUpdateVersion] = React.useState("");
  const [bulkUpdateOpen, setBulkUpdateOpen] = React.useState(false);
  const [deployTarget, setDeployTarget] = React.useState<AutonomousSupervisorAgent | null>(null);
  const [deployAgentType, setDeployAgentType] = React.useState<"device-agent" | "monitor-agent">("device-agent");
  const [deployAgentName, setDeployAgentName] = React.useState("");
  const [deployInstance, setDeployInstance] = React.useState("main");
  const [deploySlotMode, setDeploySlotMode] = React.useState<"existing" | "new">("new");
  const [deployDeviceSlotMode, setDeployDeviceSlotMode] = React.useState<"existing" | "new">("new");
  const [deployDeviceSlotId, setDeployDeviceSlotId] = React.useState<string | null>(null);
  const [deployDeviceSlotName, setDeployDeviceSlotName] = React.useState("");
  const [deploySlotId, setDeploySlotId] = React.useState<string | null>(null);
  const [deploySlotName, setDeploySlotName] = React.useState("");
  const [deployVersion, setDeployVersion] = React.useState("");
  const [deployStatus, setDeployStatus] = React.useState<"IDLE" | "CREATING" | "DEPLOYING" | "SUCCESS" | "FAILED">("IDLE");
  const [deployError, setDeployError] = React.useState<string | null>(null);
  const [managedRuntimeTarget, setManagedRuntimeTarget] = React.useState<AutonomousSupervisorAgent | null>(null);
  const [managedRuntimeFilter, setManagedRuntimeFilter] = React.useState<string | null>(null);
  const [deprovisionTarget, setDeprovisionTarget] = React.useState<{ supervisor: AutonomousSupervisorAgent; agentType: "device-agent" | "monitor-agent"; instance: string; name: string } | null>(null);
  const [cleanupRuntimeTarget, setCleanupRuntimeTarget] = React.useState<{ supervisor: AutonomousSupervisorAgent; agentType: "device-agent" | "monitor-agent"; instance: string; name: string; installDir: string } | null>(null);
  const [dialogActionDetails, setDialogActionDetails] = React.useState<{ label: string; operation: SupervisorManagedOperation } | null>(null);

  const trackOperation = (label: string, operation: SupervisorManagedOperation, showInDialog = true) => {
    if (showInDialog) setDialogActionDetails({ label, operation });
    void queryClient.invalidateQueries({ queryKey: ["device-control", "managed-operation-history"], refetchType: "active" });
  };

  const clearActionHistoryMutation = useMutation({
    mutationFn: clearSupervisorManagedOperationHistory,
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["device-control", "managed-operation-history"] }); }
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => createAutonomousSupervisor(name),
    onSuccess: async result => { setTokenTitle("New Supervisor Agent token"); setCreatedToken(result.token); setTokenSupervisorName(result.supervisor.name); setCopiedField(null); await queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"] }); }
  });
  const editMutation = useMutation({
    mutationFn: () => editTarget ? updateAutonomousSupervisor(editTarget.id, { name: editName.trim(), enabled: editEnabled, labels: parseManagedLabels(editLabelsText), heartbeatTimeoutSeconds: editHeartbeatTimeout }) : Promise.reject(new Error("No Supervisor Agent selected")),
    onSuccess: async () => { setEditTarget(null); await queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"] }); }
  });
  const copyMutation = useMutation({
    mutationFn: (agent: AutonomousSupervisorAgent) => createAutonomousSupervisor(`${agent.name} (copy)`),
    onSuccess: async result => { setTokenTitle("Copied Supervisor Agent token"); setCreatedToken(result.token); setTokenSupervisorName(result.supervisor.name); setCopiedField(null); await queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"] }); }
  });
  const regenerateMutation = useMutation({
    mutationFn: (agent: AutonomousSupervisorAgent) => regenerateAutonomousSupervisorToken(agent.id),
    onSuccess: async result => { setTokenTitle("Regenerated Supervisor Agent token"); setCreatedToken(result.token); setTokenSupervisorName(result.supervisor.name); setCopiedField(null); await queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"] }); }
  });
  const reinstallMutation = useMutation({
    mutationFn: (agent: AutonomousSupervisorAgent) => regenerateAutonomousSupervisorToken(agent.id),
    onSuccess: async result => { setTokenTitle("Supervisor Agent reinstall command"); setCreatedToken(result.token); setTokenSupervisorName(result.supervisor.name); setCopiedField(null); await queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"] }); }
  });
  const checkTokenMutation = useMutation({
    mutationFn: (agent: AutonomousSupervisorAgent) => checkAutonomousSupervisorToken(agent.id),
    onSuccess: (result, agent) => setTokenCheckResult({ name: agent.name, ...result })
  });
  const deleteMutation = useMutation({
    mutationFn: (agent: AutonomousSupervisorAgent) => deleteAutonomousSupervisor(agent.id),
    onSuccess: async () => { setDeleteTarget(null); await queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"] }); }
  });

  const deployDeviceAgentMutation = useMutation({
    mutationFn: async ({ supervisor, name, version, slotId, slotName, closeAfterStart = false }: { supervisor: AutonomousSupervisorAgent; name: string; version: string; slotId?: string; slotName?: string; closeAfterStart?: boolean }) => {
      setDeployStatus("CREATING");
      setDeployError(null);
      setDialogActionDetails(null);
      const unmanagedDevice = discoveredUnmanagedEntry(supervisor, "device-agent");
      if (unmanagedDevice) {
        setDeployStatus("DEPLOYING");
        const cleanupInstallDir = typeof unmanagedDevice.install_dir === "string" ? unmanagedDevice.install_dir : undefined;
        const cleanup = await requestSupervisorManagedOperation(supervisor.id, {
          operation: "REMOVE",
          agentType: "device-agent",
          instance: "main",
          ...(cleanupInstallDir ? { installDir: cleanupInstallDir } : {})
        });
        trackOperation("Cleanup Device Agent / main", cleanup);
        const cleaned = await waitSupervisorManagedOperation(cleanup.commandId, operation => trackOperation("Cleanup Device Agent / main", operation));
        if (cleaned.status !== "SUCCESS" && !/is not installed$/i.test(cleaned.error ?? "")) throw new Error(cleaned.error ?? "Unable to remove the unmanaged local Device Agent installation");
        setDeployStatus("CREATING");
      }
      const existing = (deviceAgentsQuery.data ?? []).find(agent => agent.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (existing?.managedBySupervisorId && existing.managedBySupervisorId !== supervisor.id) throw new Error(`Device Agent '${name}' is already managed by another Supervisor`);
      const identity = existing
        ? await regenerateDeviceAgentToken(existing.id)
        : await createDeviceAgentIdentity(name, { slotId, slotName });
      try {
        setDeployStatus("DEPLOYING");
        const operation = await requestSupervisorManagedOperation(supervisor.id, {
          operation: "DEPLOY",
          agentType: "device-agent",
          agentId: identity.agent.id,
          instance: "main",
          version,
          environment: {
            SENSORSPHERE_URL: window.location.origin,
            SENSORSPHERE_DEVICE_AGENT_TOKEN: identity.token,
            AGENT_NAME: name
          }
        });
        if (closeAfterStart) { setDeployTarget(null); setDeployStatus("IDLE"); setDialogActionDetails(null); }
        trackOperation("Install Device Agent / main", operation, !closeAfterStart);
        const completed = await waitSupervisorManagedOperation(operation.commandId, current => trackOperation("Install Device Agent / main", current, !closeAfterStart));
        if (completed.status !== "SUCCESS") throw new Error(completed.error ?? `Device Agent deployment ${completed.status.toLowerCase()}`);
        return completed;
      } catch (error) {
        // Keep the SensorSphere identity after a failed remote deployment so token
        // diagnostics/regeneration and an explicit retry remain possible.
        throw error;
      }
    },
    onSuccess: (_result, variables) => { if (!variables.closeAfterStart) setDeployStatus("SUCCESS"); void queryClient.invalidateQueries({ queryKey: ["device-control", "managed-operation-history"] }); void Promise.all([queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"], refetchType: "active" }), queryClient.invalidateQueries({ queryKey: ["device-control", "agents"], refetchType: "active" }), queryClient.invalidateQueries({ queryKey: ["device-control", "slots"], refetchType: "active" })]); },
    onError: (error, variables) => { if (!variables.closeAfterStart) { setDeployStatus("FAILED"); setDeployError(error instanceof Error ? error.message : "Unable to deploy Device Agent"); } void queryClient.invalidateQueries({ queryKey: ["device-control", "managed-operation-history"] }); }
  });

  const deployMonitoringAgentMutation = useMutation({
    mutationFn: async ({ supervisor, name, instance, version, slotId, slotName, closeAfterStart = false }: { supervisor: AutonomousSupervisorAgent; name: string; instance: string; version: string; slotId?: string; slotName?: string; closeAfterStart?: boolean }) => {
      setDeployStatus("CREATING");
      setDeployError(null);
      setDialogActionDetails(null);
      const normalizedInstance = instance.trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(normalizedInstance)) throw new Error("Instance must start with a letter or number and contain only letters, numbers, dot, underscore or dash");
      const occupied = supervisor.managedAgents.find(entry => entry.agent_type === "monitor-agent" && entry.instance === normalizedInstance && entry.installed !== false && typeof entry.management_id === "string" && entry.management_id);
      if (occupied) throw new Error(`Monitoring Agent instance '${normalizedInstance}' is already managed by this Supervisor`);
      const unmanagedMonitoring = discoveredUnmanagedEntry(supervisor, "monitor-agent", normalizedInstance);
      if (unmanagedMonitoring) {
        setDeployStatus("DEPLOYING");
        const cleanupInstallDir = typeof unmanagedMonitoring.install_dir === "string" ? unmanagedMonitoring.install_dir : undefined;
        const cleanup = await requestSupervisorManagedOperation(supervisor.id, {
          operation: "REMOVE",
          agentType: "monitor-agent",
          instance: normalizedInstance,
          ...(cleanupInstallDir ? { installDir: cleanupInstallDir } : {})
        });
        trackOperation(`Cleanup Monitoring Agent / ${normalizedInstance}`, cleanup);
        const cleaned = await waitSupervisorManagedOperation(cleanup.commandId, operation => trackOperation(`Cleanup Monitoring Agent / ${normalizedInstance}`, operation));
        if (cleaned.status !== "SUCCESS") throw new Error(cleaned.error ?? "Unable to remove the unmanaged local Monitoring Agent installation");
        setDeployStatus("CREATING");
      }
      const existing = (monitoringAgentsQuery.data ?? []).find(agent => agent.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (existing?.managedBySupervisorId && existing.managedBySupervisorId !== supervisor.id) throw new Error(`Monitoring Agent '${name}' is already managed by another Supervisor`);
      if (existing?.managedBySupervisorId === supervisor.id && existing.managedInstance && existing.managedInstance !== normalizedInstance) throw new Error(`Monitoring Agent '${name}' is already associated with instance '${existing.managedInstance}'`);
      const identity = existing
        ? await regenerateMonitoringAgentToken(existing.id)
        : await createMonitoringAgent({
            name,
            ...(slotId ? { slotId } : {}),
            ...(!slotId && slotName ? { slotName } : {})
          });
      try {
        setDeployStatus("DEPLOYING");
        const operation = await requestSupervisorManagedOperation(supervisor.id, {
          operation: "DEPLOY",
          agentType: "monitor-agent",
          agentId: identity.agent.id,
          instance: normalizedInstance,
          version,
          environment: {
            SENSORSPHERE_URL: window.location.origin,
            SENSORSPHERE_AGENT_TOKEN: identity.token,
            AGENT_NAME: name
          }
        });
        if (closeAfterStart) { setDeployTarget(null); setDeployStatus("IDLE"); setDialogActionDetails(null); }
        trackOperation(`Install Monitoring Agent / ${normalizedInstance}`, operation, !closeAfterStart);
        const completed = await waitSupervisorManagedOperation(operation.commandId, current => trackOperation(`Install Monitoring Agent / ${normalizedInstance}`, current, !closeAfterStart));
        if (completed.status !== "SUCCESS") throw new Error(completed.error ?? `Monitoring Agent deployment ${completed.status.toLowerCase()}`);
        return completed;
      } catch (error) {
        // Keep the Monitoring Agent identity for diagnostics and retry.
        throw error;
      }
    },
    onSuccess: (_result, variables) => { if (!variables.closeAfterStart) setDeployStatus("SUCCESS"); void queryClient.invalidateQueries({ queryKey: ["device-control", "managed-operation-history"] }); void Promise.all([queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"], refetchType: "active" }), queryClient.invalidateQueries({ queryKey: ["monitoring", "agents"], refetchType: "active" }), queryClient.invalidateQueries({ queryKey: ["monitoring", "slots"], refetchType: "active" })]); },
    onError: (error, variables) => { if (!variables.closeAfterStart) { setDeployStatus("FAILED"); setDeployError(error instanceof Error ? error.message : "Unable to deploy Monitoring Agent"); } void queryClient.invalidateQueries({ queryKey: ["device-control", "managed-operation-history"] }); }
  });

  const deprovisionMutation = useMutation({
    mutationFn: async (target: { supervisor: AutonomousSupervisorAgent; agentType: "device-agent" | "monitor-agent"; instance: string }) => {
      setDialogActionDetails(null);
      const started = await requestSupervisorManagedOperation(target.supervisor.id, { operation: "REMOVE", agentType: target.agentType, instance: target.instance });
      const label = `Deprovision ${agentTypeLabel(target.agentType)} / ${target.instance}`;
      trackOperation(label, started);
      const completed = await waitSupervisorManagedOperation(started.commandId, operation => trackOperation(label, operation));
      if (completed.status !== "SUCCESS") throw new Error(completed.error ?? `Unable to deprovision ${agentTypeLabel(target.agentType)}`);
      return completed;
    },
    onSuccess: (_result, target) => {
      setDeprovisionTarget(null);
      queryClient.setQueryData<AutonomousSupervisorAgent[]>(["device-control", "supervisors"], current => current?.map(supervisor => supervisor.id !== target.supervisor.id ? supervisor : {
        ...supervisor,
        managedAgents: supervisor.managedAgents.map(entry => entry.agent_type === target.agentType && entry.instance === target.instance ? { ...entry, installed: false, container_state: "not_installed", reconciliation_status: "MISSING", configured_version: null, running_image: null, container_id: null } : entry)
      }));
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["device-control", "agents"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["monitoring", "agents"], refetchType: "active" })
      ]);
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"], refetchType: "active" });
    }
  });

  const managedRuntimeUpdateMutation = useMutation({
    mutationFn: async (target: { supervisor: AutonomousSupervisorAgent; agentType: "device-agent" | "monitor-agent"; agentId: string; instance: string; version: string; name: string }) => {
      setDialogActionDetails(null);
      const started = await requestSupervisorManagedOperation(target.supervisor.id, {
        operation: "UPDATE",
        agentType: target.agentType,
        agentId: target.agentId,
        instance: target.instance,
        version: target.version
      });
      const label = `Reconcile version ${agentTypeLabel(target.agentType)} / ${target.instance}`;
      trackOperation(label, started);
      const completed = await waitSupervisorManagedOperation(started.commandId, operation => trackOperation(label, operation));
      if (completed.status !== "SUCCESS") throw new Error(completed.error ?? `Unable to update ${target.name}`);
      return completed;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["device-control", "agents"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["monitoring", "agents"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["device-control", "managed-operation-history"], refetchType: "active" })
      ]);
    }
  });

  const cleanupRuntimeMutation = useMutation({
    mutationFn: async (target: { supervisor: AutonomousSupervisorAgent; agentType: "device-agent" | "monitor-agent"; instance: string; name: string; installDir: string }) => {
      setDialogActionDetails(null);
      const started = await requestSupervisorManagedOperation(target.supervisor.id, {
        operation: "REMOVE",
        agentType: target.agentType,
        instance: target.instance,
        installDir: target.installDir
      });
      const label = `Cleanup untracked ${agentTypeLabel(target.agentType)} / ${target.instance}`;
      trackOperation(label, started);
      const completed = await waitSupervisorManagedOperation(started.commandId, operation => trackOperation(label, operation));
      if (completed.status !== "SUCCESS" && !/is not installed$/i.test(completed.error ?? "")) throw new Error(completed.error ?? `Unable to cleanup ${target.name}`);
      return completed;
    },
    onSuccess: async () => {
      setCleanupRuntimeTarget(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["device-control", "managed-operation-history"], refetchType: "active" })
      ]);
    }
  });

  const bulkSupervisorUpdateMutation = useMutation({
    mutationFn: async (agents: AutonomousSupervisorAgent[]) => {
      for (const agent of agents) await requestAutonomousSupervisorUpdate(agent.id, latestSupervisorVersion);
    },
    onSuccess: async () => { setBulkUpdateOpen(false); await queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"] }); }
  });

  const autonomousUpdateMutation = useMutation({
    mutationFn: ({ id, version, closeOnSuccess = false }: { id: string; version: string; closeOnSuccess?: boolean }) => requestAutonomousSupervisorUpdate(id, version).then(() => ({ id, version, closeOnSuccess })),
    onMutate: async ({ id, version }) => {
      await queryClient.cancelQueries({ queryKey: ["device-control", "supervisors"] });
      queryClient.setQueryData<AutonomousSupervisorAgent[]>(["device-control", "supervisors"], current => current?.map(agent => agent.id === id ? { ...agent, configuredVersion: version, updateStatus: "REQUESTED", updateError: null } : agent));
    },
    onSuccess: async result => {
      if (result.closeOnSuccess) { setAutonomousUpdateTarget(null); setUpdateVersion(""); }
      await queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"] });
    },
    onError: async () => { await queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"] }); }
  });

  const autonomous = autonomousQuery.data ?? [];
  const trackedAutonomousUpdateTarget = autonomousUpdateTarget
    ? autonomous.find(agent => agent.id === autonomousUpdateTarget.id) ?? autonomousUpdateTarget
    : null;
  const trackedManagedRuntimeTarget = managedRuntimeTarget
    ? autonomous.find(agent => agent.id === managedRuntimeTarget.id) ?? managedRuntimeTarget
    : null;
  const managedRuntimeRows = trackedManagedRuntimeTarget?.managedAgents.map(entry => ({ entry, diagnostic: managedRuntimeDiagnostic(entry) })) ?? [];
  const managedRuntimeCounts = managedRuntimeRows.reduce<Record<string, number>>((counts, row) => {
    counts[row.diagnostic.status] = (counts[row.diagnostic.status] ?? 0) + 1;
    return counts;
  }, {});
  const managedRuntimeIssues = managedRuntimeRows.filter(row => row.diagnostic.status !== "MANAGED");
  const filteredManagedRuntimeRows = managedRuntimeFilter
    ? managedRuntimeRows.filter(row => row.diagnostic.status === managedRuntimeFilter)
    : managedRuntimeRows;

  React.useEffect(() => {
    if (!autonomousUpdateTarget || !autonomousUpdateMutation.isSuccess) return;
    const timer = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"] });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [autonomousUpdateTarget, autonomousUpdateMutation.isSuccess, queryClient]);

  const latestSupervisorVersion = versionsQuery.data?.agents?.supervisorAgent?.latestVersion ?? "latest";
  const latestMonitoringAgentVersion = versionsQuery.data?.agents?.monitorAgent?.latestVersion ?? "latest";
  const latestDeviceAgentVersion = versionsQuery.data?.agents?.deviceAgent?.latestVersion ?? "latest";
  const monitoringSlots = monitoringSlotsQuery.data ?? [];
  const deviceAgentSlots = deviceAgentSlotsQuery.data ?? [];
  const deployExistingMonitoringAgent = deployAgentType === "monitor-agent"
    ? (monitoringAgentsQuery.data ?? []).find(agent => agent.name.trim().toLowerCase() === deployAgentName.trim().toLowerCase()) ?? null
    : null;
  const deployPreservedSlot = deployExistingMonitoringAgent?.slotId
    ? monitoringSlots.find(slot => slot.id === deployExistingMonitoringAgent.slotId) ?? null
    : null;
  const unboundMonitoringSlots = monitoringSlots.filter(slot => !slot.bound);
  const deployExistingDeviceAgent = deployAgentType === "device-agent"
    ? (deviceAgentsQuery.data ?? []).find(agent => agent.name.trim().toLowerCase() === deployAgentName.trim().toLowerCase()) ?? null
    : null;
  const deployPreservedDeviceSlot = deployExistingDeviceAgent?.slotId
    ? deviceAgentSlots.find(slot => slot.id === deployExistingDeviceAgent.slotId) ?? null
    : null;
  const unboundDeviceAgentSlots = deviceAgentSlots.filter(slot => !slot.bound);
  const deviceSlotSelectionValid = Boolean(
    deployPreservedDeviceSlot ||
    (deployDeviceSlotMode === "existing" ? deployDeviceSlotId : deployDeviceSlotName.trim())
  );
  const deviceSlotInput = deployPreservedDeviceSlot
    ? {}
    : deployDeviceSlotMode === "existing" && deployDeviceSlotId
      ? { slotId: deployDeviceSlotId }
      : deployDeviceSlotMode === "new" && deployDeviceSlotName.trim()
        ? { slotName: deployDeviceSlotName.trim() }
        : {};
  const monitoringSlotSelectionValid = Boolean(
    deployPreservedSlot ||
    (deploySlotMode === "existing" ? deploySlotId : deploySlotName.trim())
  );
  const monitoringSlotInput = deployPreservedSlot
    ? {}
    : deploySlotMode === "existing" && deploySlotId
      ? { slotId: deploySlotId }
      : deploySlotMode === "new" && deploySlotName.trim()
        ? { slotName: deploySlotName.trim() }
        : {};
  const bulkSupervisorCandidates = autonomous.filter(agent => agent.online && agent.selfUpdateSupported && !["REQUESTED", "UPDATE_REQUESTED", "UPDATING", "VERIFYING"].includes(agent.updateStatus) && latestSupervisorVersion !== "latest" && hasAgentUpdate(agent.version, latestSupervisorVersion));
  const supervisorInstallCommand = createdToken && tokenSupervisorName ? ` SENSORSPHERE_URL=${window.location.origin} \
SENSORSPHERE_AGENT_TOKEN='${createdToken}' \
SENSORSPHERE_ENVIRONMENT='${installationEnvironmentQuery.data ?? "DEFAULT"}' \
SUPERVISOR_NAME="$(hostname)" \
VERSION=${latestSupervisorVersion} \
bash -c "$(curl -fsSL https://raw.githubusercontent.com/sensorsphere/sensorsphere-supervisor-agent/master/scripts/install.sh)"` : "";
  const managedAgentIcon = (entry: Record<string, unknown>, index: number) => {
    const type = typeof entry.agent_type === "string" ? entry.agent_type : "agent";
    const instance = typeof entry.instance === "string" ? entry.instance : "main";
    const name = typeof entry.agent_name === "string" ? entry.agent_name : instance;
    const version = typeof entry.configured_version === "string" ? entry.configured_version : "—";
    const state = typeof entry.container_state === "string" ? entry.container_state : "unknown";
    const iconType = type === "device-agent" ? "device" : "monitoring";
    return <AgentTypeIcon key={`${type}-${instance}-${index}`} type={iconType} size={17} tooltip={`${name} · ${agentTypeLabel(type)} · ${version} · ${state}`} />;
  };
  const updateLifecycle = (agent: AutonomousSupervisorAgent) => {
    if (agent.updateStatus === "FAILED") return { label: "FAILED", color: "red" };
    if (["REQUESTED", "UPDATE_REQUESTED", "UPDATING", "VERIFYING"].includes(agent.updateStatus)) return { label: agent.updateStatus, color: "blue" };
    if (!agent.selfUpdateSupported) return { label: "NO SELF-UPDATE", color: "gray" };
    return { label: "READY", color: "teal" };
  };


  const copyAndMark = async (kind: "token" | "command", value: string) => {
    await copyText(value);
    setCopiedField(kind);
    window.setTimeout(() => setCopiedField(current => current === kind ? null : current), 1500);
  };

  const toggleAgentSort = (key: SupervisorSortKey) => {
    if (agentSortKey === key) setAgentSortDirection(current => current === "asc" ? "desc" : "asc");
    else { setAgentSortKey(key); setAgentSortDirection("asc"); }
  };
  const filteredAutonomous = autonomous.filter(agent => {
    const status = !agent.enabled ? "DISABLED" : agent.online ? "ONLINE" : "OFFLINE";
    const reported = `${agent.reportedName ?? ""} ${agent.hostname ?? ""}`.toLowerCase();
    const labels = `${Object.entries(agent.labels).map(([key,value]) => `${key}=${value}`).join(" ")} ${agent.agentLabels.join(" ")}`.toLowerCase();
    return (!agentNameFilter.trim() || agent.name.toLowerCase().includes(agentNameFilter.trim().toLowerCase()))
      && (!agentStatusFilter || status === agentStatusFilter)
      && (!agentReportedFilter.trim() || reported.includes(agentReportedFilter.trim().toLowerCase()))
      && (!agentLabelsFilter.trim() || labels.includes(agentLabelsFilter.trim().toLowerCase()));
  }).sort((left, right) => {
    const status = (agent: AutonomousSupervisorAgent) => !agent.enabled ? "DISABLED" : agent.online ? "ONLINE" : "OFFLINE";
    const value = (agent: AutonomousSupervisorAgent) => agentSortKey === "name" ? agent.name
      : agentSortKey === "status" ? status(agent)
      : agentSortKey === "reported" ? `${agent.reportedName ?? ""} ${agent.hostname ?? ""}`
      : agentSortKey === "version" ? agent.version
      : agentSortKey === "system" ? `${agent.os ?? ""} ${agent.osVersion ?? ""} ${agent.architecture ?? ""}`
      : agentSortKey === "lastSeen" ? agent.lastSeenAt
      : agentSortKey === "managed" ? agent.managedAgents.length
      : agentSortKey === "labels" ? Object.entries(agent.labels).map(([key,value]) => `${key}=${value}`).join(",")
      : agent.agentLabels.join(",");
    return compareTableValues(value(left), value(right), agentSortDirection);
  });
  const agentFiltersActive = Boolean(agentNameFilter || agentStatusFilter || agentReportedFilter || agentLabelsFilter);

  return <Stack gap="md" className="agent-admin-panel">
    <AgentActionHistory operations={actionHistoryQuery.data ?? []} onClear={() => clearActionHistoryMutation.mutate()} clearing={clearActionHistoryMutation.isPending} />
    <Card withBorder className="monitoring-table-card">
      <Group justify="space-between" mb="sm"><div><Text fw={600}>Supervisor Agents</Text><Text size="xs" c="dimmed">Direct outbound Supervisor → SensorSphere connections. Environment is defined once for this SensorSphere installation.</Text></div><Group gap="xs"><Button size="xs" variant="light" color="teal" disabled={bulkSupervisorCandidates.length === 0} onClick={() => setBulkUpdateOpen(true)}>Update All ({bulkSupervisorCandidates.length})</Button><Button size="xs" disabled={!installationEnvironmentQuery.data} onClick={() => { setCreateOpened(true); setCreatedToken(null); setTokenSupervisorName(""); setCopiedField(null); setCreateName(""); }}>Add Supervisor Agent</Button></Group></Group>
      <Group gap="xs" mb="sm" wrap="wrap">
        <ResetFiltersAction active={agentFiltersActive} onReset={() => { setAgentNameFilter(""); setAgentStatusFilter(null); setAgentReportedFilter(""); setAgentLabelsFilter(""); }} />
        <TextInput size="xs" placeholder="Filter name" value={agentNameFilter} onChange={event => setAgentNameFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(agentNameFilter.trim()))} rightSection={<FilterClearAction active={Boolean(agentNameFilter.trim())} onClear={() => setAgentNameFilter("")} />} w={180} />
        <Select size="xs" clearable placeholder="Status" data={["ONLINE","OFFLINE","DISABLED"]} value={agentStatusFilter} onChange={setAgentStatusFilter} styles={activeFilterStyles(Boolean(agentStatusFilter))} w={140} />
        <TextInput size="xs" placeholder="Reported / host" value={agentReportedFilter} onChange={event => setAgentReportedFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(agentReportedFilter.trim()))} rightSection={<FilterClearAction active={Boolean(agentReportedFilter.trim())} onClear={() => setAgentReportedFilter("")} />} w={180} />
        <TextInput size="xs" placeholder="Labels" value={agentLabelsFilter} onChange={event => setAgentLabelsFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(agentLabelsFilter.trim()))} rightSection={<FilterClearAction active={Boolean(agentLabelsFilter.trim())} onClear={() => setAgentLabelsFilter("")} />} w={200} />
        <Text size="xs" c="dimmed">{filteredAutonomous.length}/{autonomous.length}</Text>
      </Group>
      <div className="monitoring-table-scroll">
        <Table striped highlightOnHover stickyHeader style={{ minWidth: "max-content" }}>
          <Table.Thead><Table.Tr><SortableTableHeader active={agentSortKey === "name"} direction={agentSortDirection} onClick={() => toggleAgentSort("name")}>Name</SortableTableHeader><SortableTableHeader active={agentSortKey === "status"} direction={agentSortDirection} onClick={() => toggleAgentSort("status")}>Status</SortableTableHeader><SortableTableHeader active={agentSortKey === "reported"} direction={agentSortDirection} onClick={() => toggleAgentSort("reported")}>Reported</SortableTableHeader><SortableTableHeader active={agentSortKey === "version"} direction={agentSortDirection} onClick={() => toggleAgentSort("version")}>Version</SortableTableHeader><SortableTableHeader active={agentSortKey === "system"} direction={agentSortDirection} onClick={() => toggleAgentSort("system")}>System</SortableTableHeader><Table.Th>Host Network</Table.Th><SortableTableHeader active={agentSortKey === "lastSeen"} direction={agentSortDirection} onClick={() => toggleAgentSort("lastSeen")}>Last Seen</SortableTableHeader><SortableTableHeader active={agentSortKey === "managed"} direction={agentSortDirection} onClick={() => toggleAgentSort("managed")}>Managed agents</SortableTableHeader><SortableTableHeader active={agentSortKey === "agentLabels"} direction={agentSortDirection} onClick={() => toggleAgentSort("agentLabels")}>Agent Labels</SortableTableHeader><Table.Th style={{ width: 170, textAlign: "right" }}>Actions</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>{filteredAutonomous.map(agent => {
            const lifecycle = updateLifecycle(agent);
            const runtimeIssueCounts = agent.managedAgents.reduce<Record<string, number>>((counts, entry) => {
              const status = managedRuntimeDiagnostic(entry).status;
              if (["DRIFT", "MISSING", "DISCOVERED", "UNTRACKED", "ERROR"].includes(status)) {
                counts[status] = (counts[status] ?? 0) + 1;
              }
              return counts;
            }, {});
            const runtimeIssueTotal = Object.values(runtimeIssueCounts).reduce((total, count) => total + count, 0);
            const runtimeIssueDetails = ["DRIFT", "MISSING", "DISCOVERED", "UNTRACKED", "ERROR"]
              .filter(status => (runtimeIssueCounts[status] ?? 0) > 0)
              .map(status => `${runtimeIssueCounts[status]} ${status}`)
              .join(", ");
            return <Table.Tr key={agent.id}>
              <Table.Td><Text fw={600} size="sm">{agent.name}</Text></Table.Td>
              <Table.Td><Badge size="sm" variant="light" color={!agent.enabled ? "red" : agent.online ? "green" : "gray"}>{!agent.enabled ? "DISABLED" : agent.online ? "ONLINE" : "OFFLINE"}</Badge></Table.Td>
              <Table.Td><AgentReportedCell reportedName={agent.reportedName} hostname={agent.hostname} /></Table.Td>
              <Table.Td><Text size="sm">{agent.version ?? "—"}</Text>{["REQUESTED", "UPDATE_REQUESTED", "UPDATING", "VERIFYING"].includes(agent.updateStatus) ? <><Tooltip label={agent.updateError ?? `Supervisor update lifecycle: ${lifecycle.label}`}><Badge size="xs" variant="light" color={lifecycle.color}>{lifecycle.label}</Badge></Tooltip><UpdateLifecycleAge status={agent.updateStatus} timestamp={agent.updateStartedAt ?? agent.updateRequestedAt} />{agent.desiredVersion && <Text size="xs" c="dimmed">Target {agent.desiredVersion}</Text>}</> : <>{agent.updateStatus !== "FAILED" && <AgentVersionFreshnessBadge installedVersion={agent.version} release={versionsQuery.data?.agents?.supervisorAgent} />}{agent.updateStatus === "FAILED" && <Tooltip label={agent.updateError ?? "Supervisor update failed"}><Badge size="xs" variant="light" color="red">FAILED</Badge></Tooltip>}{agent.lastSuccessfulUpdateAt && <Text size="xs" c="dimmed" title={agent.lastSuccessfulUpdateAt}>Updated {relativeAge(agent.lastSuccessfulUpdateAt)}</Text>}</>}</Table.Td>
              <Table.Td><AgentSystemCell os={agent.os} osVersion={agent.osVersion} architecture={agent.architecture} /></Table.Td><Table.Td><HostNetworkCell networks={agent.hostNetworks} /></Table.Td>
              <Table.Td title={agent.lastSeenAt ?? undefined}><Text size="sm">{relativeAge(agent.lastSeenAt)}</Text></Table.Td>
              <Table.Td>{agent.managedAgents.length > 0 ? <Group gap={6} wrap="nowrap">{agent.managedAgents.filter(entry => entry.installed !== false).map(managedAgentIcon)}<Tooltip label={runtimeIssueTotal > 0 ? `Managed Runtime Inspector · ${runtimeIssueTotal} issue${runtimeIssueTotal === 1 ? "" : "s"} (${runtimeIssueDetails})` : "Managed Runtime Inspector · no issues"}><Indicator disabled={runtimeIssueTotal === 0} label={runtimeIssueTotal} size={16} color={(runtimeIssueCounts.ERROR ?? 0) > 0 ? "red" : "orange"} offset={2}><ActionIcon size="sm" variant="subtle" color={runtimeIssueTotal > 0 ? "orange" : "blue"} aria-label={runtimeIssueTotal > 0 ? `Managed Runtime Inspector, ${runtimeIssueTotal} issues` : "Managed Runtime Inspector"} onClick={() => { setManagedRuntimeFilter(null); setManagedRuntimeTarget(agent); }}><ManagedRuntimeIcon /></ActionIcon></Indicator></Tooltip></Group> : <Text size="xs" c="dimmed">—</Text>}</Table.Td>

              <Table.Td>{agent.agentLabels.length > 0 ? <Group gap={4} wrap="wrap">{agent.agentLabels.map(label => <Badge key={label} size="xs" variant="light" color="cyan">{label}</Badge>)}</Group> : <Text size="xs" c="dimmed">—</Text>}</Table.Td>
              <Table.Td><Group gap={4} wrap="nowrap" justify="flex-end">{explicitlyManaged(agent, "device-agent") ? <Tooltip label="Deprovision Device Agent"><ActionIcon size="sm" variant="light" color="red" aria-label="Deprovision Device Agent" disabled={!agent.online} onClick={() => { const entry = reportedManagedEntry(agent, "device-agent")!; setDeprovisionTarget({ supervisor: agent, agentType: "device-agent", instance: typeof entry.instance === "string" ? entry.instance : "main", name: typeof entry.agent_name === "string" ? entry.agent_name : agent.name }); }}><DeprovisionAgentIcon /></ActionIcon></Tooltip> : <Tooltip label={!agent.online ? "Supervisor Agent must be online" : discoveredUnmanaged(agent, "device-agent") ? "Replace unmanaged local Device Agent installation" : "Deploy Device Agent"}><ActionIcon size="sm" variant="light" color="cyan" aria-label="Deploy Device Agent" disabled={!agent.online} onClick={() => { setDeployTarget(agent); setDeployAgentType("device-agent"); setDeployInstance("main"); setDeployAgentName(agent.name); setDeployDeviceSlotMode("new"); setDeployDeviceSlotId(null); setDeployDeviceSlotName(agent.name); setDeployVersion(latestDeviceAgentVersion !== "latest" ? latestDeviceAgentVersion : ""); setDeployStatus("IDLE"); setDeployError(null); setDialogActionDetails(null); deployDeviceAgentMutation.reset(); }}><DeployAgentIcon /></ActionIcon></Tooltip>}{explicitlyManaged(agent, "monitor-agent") && <Tooltip label="Deprovision Monitoring Agent main"><ActionIcon size="sm" variant="light" color="red" aria-label="Deprovision Monitoring Agent main" disabled={!agent.online} onClick={() => { const entry = reportedManagedEntry(agent, "monitor-agent")!; setDeprovisionTarget({ supervisor: agent, agentType: "monitor-agent", instance: typeof entry.instance === "string" ? entry.instance : "main", name: typeof entry.agent_name === "string" ? entry.agent_name : `${agent.name}-monitor` }); }}><DeprovisionAgentIcon /></ActionIcon></Tooltip>}{(() => { const missing = missingManagedEntry(agent, "monitor-agent"); const missingInstance = missing && typeof missing.instance === "string" ? missing.instance : null; const instance = missingInstance ?? nextMonitoringInstance(agent); const missingName = missing && typeof missing.agent_name === "string" ? missing.agent_name : null; const label = !agent.online ? "Supervisor Agent must be online" : missingInstance ? `Reinstall missing Monitoring Agent ${missingInstance}` : "Deploy new Monitoring Agent instance"; return <Tooltip label={label}><ActionIcon size="sm" variant="light" color={missingInstance ? "orange" : "violet"} aria-label={missingInstance ? `Reinstall Monitoring Agent ${missingInstance}` : "Deploy new Monitoring Agent instance"} disabled={!agent.online} onClick={() => { setDeployTarget(agent); setDeployAgentType("monitor-agent"); setDeployInstance(instance); setDeployAgentName(missingName ?? defaultMonitoringAgentName(agent, instance)); setDeploySlotMode("new"); setDeploySlotId(null); setDeploySlotName(missingName ?? defaultMonitoringAgentName(agent, instance)); setDeployVersion(latestMonitoringAgentVersion !== "latest" ? latestMonitoringAgentVersion : ""); setDeployStatus("IDLE"); setDeployError(null); setDialogActionDetails(null); deployMonitoringAgentMutation.reset(); }}><DeployAgentIcon /></ActionIcon></Tooltip>; })()}<Tooltip label={agent.selfUpdateSupported ? "Update Supervisor Agent" : "Supervisor self-update unavailable"}><ActionIcon size="sm" variant="light" color="teal" aria-label="Update Supervisor Agent" disabled={!agent.online || !agent.selfUpdateSupported || ["REQUESTED", "UPDATE_REQUESTED", "UPDATING", "VERIFYING"].includes(agent.updateStatus)} onClick={() => { setAutonomousUpdateTarget(agent); setUpdateVersion(latestSupervisorVersion !== "latest" ? latestSupervisorVersion : agent.version ?? ""); autonomousUpdateMutation.reset(); }}><SupervisorUpdateIcon /></ActionIcon></Tooltip><EditActionIcon onClick={() => { setEditTarget(agent); setEditName(agent.name); setEditEnabled(agent.enabled); setEditHeartbeatTimeout(agent.heartbeatTimeoutSeconds); setEditLabelsText(labelsText(agent.labels)); editMutation.reset(); }} /><Tooltip label="Copy supervisor agent"><ActionIcon size="sm" variant="light" color="green" aria-label="Copy supervisor agent" onClick={() => copyMutation.mutate(agent)}>⧉</ActionIcon></Tooltip><Tooltip label="Check configured token"><ActionIcon size="sm" variant="light" color="teal" aria-label="Check configured token" onClick={() => checkTokenMutation.mutate(agent)}><CheckTokenIcon /></ActionIcon></Tooltip><Tooltip label="Regenerate agent token"><ActionIcon size="sm" variant="light" color="orange" aria-label="Regenerate agent token" onClick={() => regenerateMutation.mutate(agent)}>↻</ActionIcon></Tooltip><ReinstallCommandActionIcon onClick={() => reinstallMutation.mutate(agent)} loading={reinstallMutation.isPending && reinstallMutation.variables?.id === agent.id} /><DeleteActionIcon onClick={() => setDeleteTarget(agent)} /></Group></Table.Td>
            </Table.Tr>;
          })}{filteredAutonomous.length === 0 && <Table.Tr><Table.Td colSpan={11}><Text ta="center" c="dimmed" py="xl">No Supervisor Agents registered yet.</Text></Table.Td></Table.Tr>}</Table.Tbody>
        </Table>
      </div>
    </Card>

    <Modal opened={bulkUpdateOpen} onClose={() => !bulkSupervisorUpdateMutation.isPending && setBulkUpdateOpen(false)} title="Update all Supervisor Agents" centered>
      <Stack><Text size="sm">Update {bulkSupervisorCandidates.length} Supervisor Agent{bulkSupervisorCandidates.length === 1 ? "" : "s"} to <strong>{latestSupervisorVersion}</strong>?</Text>{bulkSupervisorCandidates.map(agent => <Text size="sm" key={agent.id}>{agent.name}: {agent.version ?? "—"} → {latestSupervisorVersion}</Text>)}{bulkSupervisorUpdateMutation.isError && <Text size="sm" c="red">{bulkSupervisorUpdateMutation.error instanceof Error ? bulkSupervisorUpdateMutation.error.message : "Unable to update all Supervisor Agents"}</Text>}<Group justify="flex-end"><Button variant="default" disabled={bulkSupervisorUpdateMutation.isPending} onClick={() => setBulkUpdateOpen(false)}>Cancel</Button><Button loading={bulkSupervisorUpdateMutation.isPending} disabled={bulkSupervisorCandidates.length === 0} onClick={() => bulkSupervisorUpdateMutation.mutate(bulkSupervisorCandidates)}>Update All</Button></Group></Stack>
    </Modal>

    <Modal
      opened={managedRuntimeTarget != null}
      onClose={() => { setManagedRuntimeTarget(null); setManagedRuntimeFilter(null); }}
      title={`Managed Runtime Inspector${trackedManagedRuntimeTarget ? ` · ${trackedManagedRuntimeTarget.name}` : ""}`}
      size="min(96vw, 1248px)"
      centered
      styles={{ content: { height: "90vh" }, body: { height: "calc(90vh - 60px)", overflow: "hidden" } }}
    >
      <Stack h="100%" gap="sm">
        <Group justify="space-between">
          <div>
            <Text size="sm">SensorSphere associations compared with the runtime state reported by the Supervisor.</Text>
            <Group gap="xs" mt={4}>
              <Badge size="xs" variant="light" color={trackedManagedRuntimeTarget?.online ? "green" : "gray"}>{trackedManagedRuntimeTarget?.online ? "SUPERVISOR ONLINE" : "SUPERVISOR OFFLINE"}</Badge>
              <Text size="xs" c="dimmed">version {trackedManagedRuntimeTarget?.version ?? "—"}</Text>
              <Text size="xs" c="dimmed">heartbeat {relativeAge(trackedManagedRuntimeTarget?.lastSeenAt ?? null)}</Text>
            </Group>
          </div>
          <Button size="xs" variant="light" onClick={() => void queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"] })}>Refresh</Button>
        </Group>
        {trackedManagedRuntimeTarget && trackedManagedRuntimeTarget.managedAgents.length > 0 && (
          <Group gap="sm" align="stretch">
            {([
              ["MANAGED", "green"],
              ["DRIFT", "yellow"],
              ["MISSING", "orange"],
              ["DISCOVERED", "blue"],
              ["UNTRACKED", "grape"],
              ["ERROR", "red"]
            ] as const).map(([status, color]) => {
              const active = managedRuntimeFilter === status;
              return <Card key={status} withBorder p="xs" miw={110} role="button" tabIndex={0} style={{ cursor: "pointer", outline: active ? "2px solid var(--mantine-color-blue-5)" : undefined }} onClick={() => setManagedRuntimeFilter(current => current === status ? null : status)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setManagedRuntimeFilter(current => current === status ? null : status); } }}>
                <Text size="xs" c="dimmed">{status}</Text>
                <Text fw={700} size="lg" c={color}>{managedRuntimeCounts[status] ?? 0}</Text>
              </Card>;
            })}
            <Card withBorder p="xs" miw={110} role="button" tabIndex={0} style={{ cursor: "pointer", outline: managedRuntimeFilter == null ? "2px solid var(--mantine-color-blue-5)" : undefined }} onClick={() => setManagedRuntimeFilter(null)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setManagedRuntimeFilter(null); } }}>
              <Text size="xs" c="dimmed">ALL</Text>
              <Text fw={700} size="lg">{managedRuntimeRows.length}</Text>
            </Card>
          </Group>
        )}
        {trackedManagedRuntimeTarget && managedRuntimeIssues.length > 0 && (
          <Card withBorder p="sm" style={{ flexShrink: 0, maxHeight: 155, overflow: "auto" }}>
            <Text fw={600} size="sm" mb={6}>Issues detected</Text>
            <Stack gap={6}>
              {managedRuntimeIssues.map(({ entry, diagnostic }, index) => {
                const association = managedAssociation(entry);
                const type = typeof entry.agent_type === "string" ? entry.agent_type : managedString(association, "agent_type") ?? "agent";
                const instance = typeof entry.instance === "string" ? entry.instance : managedString(association, "instance") ?? "main";
                const name = typeof entry.agent_name === "string" ? entry.agent_name : managedString(association, "agent_name") ?? trackedManagedRuntimeTarget.name;
                return <div key={`${diagnostic.status}-${name}-${instance}-${index}`}>
                  <Group gap={6} wrap="nowrap"><Badge size="xs" variant="light" color={reconciliationColor(diagnostic.status)}>{diagnostic.status}</Badge><Text size="sm" fw={600}>{name} / {agentTypeLabel(type)} / {instance}</Text></Group>
                  {diagnostic.reasons.map((reason, reasonIndex) => <Text key={reasonIndex} size="xs" c={diagnostic.status === "ERROR" ? "red" : "dimmed"} ml={4}>{reason}</Text>)}
                </div>;
              })}
            </Stack>
          </Card>
        )}
        {trackedManagedRuntimeTarget && trackedManagedRuntimeTarget.managedAgents.length > 0 ? <div className="monitoring-table-scroll" style={{ flex: 1, minHeight: 220, overflow: "auto" }}><Table striped withTableBorder withColumnBorders>
          <Table.Thead><Table.Tr><Table.Th>Agent</Table.Th><Table.Th>Logical assignment</Table.Th><Table.Th>Instance</Table.Th><Table.Th>SensorSphere association</Table.Th><Table.Th>Runtime reported</Table.Th><Table.Th>Path / Compose</Table.Th><Table.Th>Version</Table.Th><Table.Th>Container</Table.Th><Table.Th>Reconciliation</Table.Th><Table.Th>Action</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>{filteredManagedRuntimeRows.map(({ entry }, index) => {
            const association = managedAssociation(entry);
            const type = typeof entry.agent_type === "string" ? entry.agent_type : managedString(association, "agent_type") ?? "agent";
            const instance = typeof entry.instance === "string" ? entry.instance : managedString(association, "instance") ?? "main";
            const name = typeof entry.agent_name === "string" ? entry.agent_name : managedString(association, "agent_name") ?? "—";
            const managementId = typeof entry.management_id === "string" ? entry.management_id : managedString(association, "id");
            const agentId = typeof entry.sensor_sphere_agent_id === "string" ? entry.sensor_sphere_agent_id : managedString(association, "agent_id");
            const runtimeInstallDir = typeof entry.install_dir === "string" ? entry.install_dir : null;
            const expectedInstallDir = managedString(association, "install_dir");
            const runtimeComposeProject = typeof entry.compose_project === "string" ? entry.compose_project : null;
            const expectedComposeProject = managedString(association, "compose_project");
            const composeService = managedString(association, "compose_service");
            const runtimeVersion = typeof entry.configured_version === "string" ? entry.configured_version : null;
            const desiredVersion = managedString(association, "desired_version");
            const reportedVersion = managedString(association, "reported_version");
            const containerState = typeof entry.container_state === "string" ? entry.container_state : "not_reported";
            const reconciliation = managedString(association, "reconciliation_status") ?? (typeof entry.reconciliation_status === "string" ? entry.reconciliation_status : "UNKNOWN");
            const runtimeReported = entry.runtime_reported !== false;
            const diagnostic = managedRuntimeDiagnostic(entry);
            const monitoringIdentity = type === "monitor-agent" && agentId
              ? (monitoringAgentsQuery.data ?? []).find(agent => agent.id === agentId) ?? null
              : null;
            const deviceIdentity = type === "device-agent" && agentId
              ? (deviceAgentsQuery.data ?? []).find(agent => agent.id === agentId) ?? null
              : null;
            return <Table.Tr key={managementId ?? `${type}-${instance}-${index}`}>
              <Table.Td><Group gap={6} wrap="nowrap"><AgentTypeIcon type={type === "device-agent" ? "device" : "monitoring"} size={16} /><div><Text size="sm" fw={600}>{name}</Text><Text size="xs" c="dimmed">{agentTypeLabel(type)}</Text></div></Group></Table.Td>
              <Table.Td>{type === "monitor-agent" ? (monitoringIdentity?.slotName ? <Badge size="xs" variant="light" color="violet">{monitoringIdentity.slotName}</Badge> : <Badge size="xs" variant="light" color="orange">UNBOUND</Badge>) : type === "device-agent" ? (deviceIdentity?.slotName ? <Badge size="xs" variant="light" color="violet">{deviceIdentity.slotName}</Badge> : <Badge size="xs" variant="light" color="orange">UNBOUND</Badge>) : <Text size="xs" c="dimmed">—</Text>}</Table.Td>
              <Table.Td><Code>{instance}</Code></Table.Td>
              <Table.Td><Stack gap={2}><Group gap={4}><Text size="xs" c="dimmed">management_id</Text>{managementId && <ActionIcon size="xs" variant="subtle" aria-label="Copy management id" onClick={() => void copyText(managementId)}><CopyIcon size={12} /></ActionIcon>}</Group><Code style={{ maxWidth: 210, overflow: "hidden", textOverflow: "ellipsis" }}>{managementId ?? "—"}</Code><Text size="xs" c="dimmed">agent {agentId ?? "—"}</Text></Stack></Table.Td>
              <Table.Td><Badge size="xs" variant="light" color={runtimeReported ? "green" : "orange"}>{runtimeReported ? "REPORTED" : "NOT REPORTED"}</Badge></Table.Td>
              <Table.Td>
                <Stack gap={4}>
                  <div>
                    <Text size="xs" c="dimmed">Expected</Text>
                    <Group gap={4} wrap="nowrap">
                      <Text size="xs" style={{ maxWidth: 280, wordBreak: "break-all" }}>{expectedInstallDir ?? "—"}</Text>
                      {expectedInstallDir && <ActionIcon size="xs" variant="subtle" aria-label="Copy expected install directory" onClick={() => void copyText(expectedInstallDir)}><CopyIcon size={12} /></ActionIcon>}
                    </Group>
                    <Text size="xs" c="dimmed">{expectedComposeProject ?? "—"} / {composeService ?? "—"}</Text>
                  </div>
                  <div>
                    <Text size="xs" c="dimmed">Runtime</Text>
                    <Group gap={4} wrap="nowrap">
                      <Text size="xs" style={{ maxWidth: 280, wordBreak: "break-all" }}>{runtimeInstallDir ?? "—"}</Text>
                      {runtimeInstallDir && <ActionIcon size="xs" variant="subtle" aria-label="Copy runtime install directory" onClick={() => void copyText(runtimeInstallDir)}><CopyIcon size={12} /></ActionIcon>}
                    </Group>
                    <Text size="xs" c="dimmed">{runtimeComposeProject ?? "—"}</Text>
                  </div>
                </Stack>
              </Table.Td>
              <Table.Td>
                <Stack gap={2}>
                  <Text size="xs" c="dimmed">desired <Text span fw={600} c="inherit">{desiredVersion ?? "—"}</Text></Text>
                  <Text size="xs" c="dimmed">reported <Text span fw={600} c="inherit">{reportedVersion ?? "—"}</Text></Text>
                  <Text size="xs" c="dimmed">runtime <Text span fw={600} c="inherit">{runtimeVersion ?? "—"}</Text></Text>
                </Stack>
              </Table.Td>
              <Table.Td><Badge size="xs" variant="light" color={containerState === "running" ? "green" : containerState === "not_reported" ? "gray" : "orange"}>{containerState}</Badge></Table.Td>
              <Table.Td>
                <Stack gap={4}>
                  <Badge size="xs" variant="light" color={reconciliationColor(diagnostic.status)}>{diagnostic.status}</Badge>
                  {diagnostic.reasons.map((reason, reasonIndex) => <Text key={reasonIndex} size="xs" c={diagnostic.status === "ERROR" ? "red" : "dimmed"}>{reason}</Text>)}
                  <Group gap={4} wrap="nowrap"><Text size="xs" c="dimmed">SensorSphere</Text><Badge size="xs" variant="light" color={reconciliationColor(reconciliation)}>{reconciliation}</Badge></Group>
                  <Group gap={4} wrap="nowrap"><Text size="xs" c="dimmed">Supervisor</Text><Badge size="xs" variant="light" color={reconciliationColor(typeof entry.reconciliation_status === "string" ? entry.reconciliation_status : null)}>{typeof entry.reconciliation_status === "string" ? entry.reconciliation_status : "—"}</Badge></Group>
                </Stack>
              </Table.Td>
              <Table.Td>
                <Group gap={4} wrap="nowrap">
                  {diagnostic.status === "DRIFT" && desiredVersion && runtimeVersion && desiredVersion !== runtimeVersion && agentId && (type === "device-agent" || type === "monitor-agent") && <Tooltip label={`Update runtime to desired version ${desiredVersion}`}><ActionIcon size="sm" variant="light" color="teal" aria-label={`Update ${name} to ${desiredVersion}`} loading={managedRuntimeUpdateMutation.isPending} disabled={!trackedManagedRuntimeTarget.online || managedRuntimeUpdateMutation.isPending} onClick={() => managedRuntimeUpdateMutation.mutate({ supervisor: trackedManagedRuntimeTarget, agentType: type, agentId, instance, version: desiredVersion, name })}><AgentUpdateIcon /></ActionIcon></Tooltip>}
                  {diagnostic.status === "MISSING" && (type === "device-agent" || type === "monitor-agent") && <Tooltip label={`Reinstall missing ${agentTypeLabel(type)}`}><ActionIcon size="sm" variant="light" color="orange" aria-label={`Reinstall ${agentTypeLabel(type)} ${instance}`} disabled={!trackedManagedRuntimeTarget.online} onClick={() => { setManagedRuntimeTarget(null); setDeployTarget(trackedManagedRuntimeTarget); setDeployAgentType(type); setDeployInstance(instance); setDeployAgentName(name === "—" ? (type === "monitor-agent" ? defaultMonitoringAgentName(trackedManagedRuntimeTarget, instance) : trackedManagedRuntimeTarget.name) : name); if (type === "monitor-agent") { setDeploySlotMode("new"); setDeploySlotId(null); setDeploySlotName(name === "—" ? defaultMonitoringAgentName(trackedManagedRuntimeTarget, instance) : name); } else { setDeployDeviceSlotMode("new"); setDeployDeviceSlotId(null); setDeployDeviceSlotName(name === "—" ? trackedManagedRuntimeTarget.name : name); } setDeployVersion((type === "monitor-agent" ? latestMonitoringAgentVersion : latestDeviceAgentVersion) !== "latest" ? (type === "monitor-agent" ? latestMonitoringAgentVersion : latestDeviceAgentVersion) : (desiredVersion ?? reportedVersion ?? runtimeVersion ?? "")); setDeployStatus("IDLE"); setDeployError(null); setDialogActionDetails(null); type === "monitor-agent" ? deployMonitoringAgentMutation.reset() : deployDeviceAgentMutation.reset(); }}><DeployAgentIcon /></ActionIcon></Tooltip>}
                  {diagnostic.status === "UNTRACKED" && runtimeInstallDir && (type === "device-agent" || type === "monitor-agent") && <Tooltip label="Cleanup untracked runtime"><ActionIcon size="sm" variant="light" color="red" aria-label={`Cleanup untracked ${name}`} disabled={!trackedManagedRuntimeTarget.online} onClick={() => setCleanupRuntimeTarget({ supervisor: trackedManagedRuntimeTarget, agentType: type, instance, name, installDir: runtimeInstallDir })}><DeprovisionAgentIcon /></ActionIcon></Tooltip>}
                  {diagnostic.status === "DRIFT" && managementId && <Tooltip label="Deprovision runtime before reinstalling to repair path, Compose or container drift"><ActionIcon size="sm" variant="light" color="red" aria-label={`Deprovision ${name}`} disabled={!trackedManagedRuntimeTarget.online} onClick={() => { setManagedRuntimeTarget(null); setDeprovisionTarget({ supervisor: trackedManagedRuntimeTarget, agentType: type === "device-agent" ? "device-agent" : "monitor-agent", instance, name }); }}><DeprovisionAgentIcon /></ActionIcon></Tooltip>}
                  {!["DRIFT", "MISSING", "UNTRACKED"].includes(diagnostic.status) && managementId && <Tooltip label={`Deprovision ${name}`}><ActionIcon size="sm" variant="light" color="red" aria-label={`Deprovision ${name}`} disabled={!trackedManagedRuntimeTarget.online} onClick={() => { setManagedRuntimeTarget(null); setDeprovisionTarget({ supervisor: trackedManagedRuntimeTarget, agentType: type === "device-agent" ? "device-agent" : "monitor-agent", instance, name }); }}><DeprovisionAgentIcon /></ActionIcon></Tooltip>}
                  {diagnostic.status === "ERROR" && <Text size="xs" c="dimmed">Refresh / inspect</Text>}
                  {diagnostic.status === "DISCOVERED" && <Text size="xs" c="dimmed">Deploy to adopt</Text>}
                </Group>
              </Table.Td>
            </Table.Tr>;
          })}{filteredManagedRuntimeRows.length === 0 && <Table.Tr><Table.Td colSpan={10}><Text ta="center" c="dimmed" py="xl">No runtime matches the selected status.</Text></Table.Td></Table.Tr>}</Table.Tbody>
        </Table></div> : <Text size="sm" c="dimmed">No managed-agent association or runtime report is available for this Supervisor.</Text>}
        <Group justify="flex-end" style={{ flexShrink: 0 }}><Button variant="default" onClick={() => { setManagedRuntimeTarget(null); setManagedRuntimeFilter(null); }}>Close</Button></Group>
      </Stack>
    </Modal>

    <Modal opened={deprovisionTarget != null} onClose={() => !deprovisionMutation.isPending && setDeprovisionTarget(null)} title={`Deprovision ${deprovisionTarget ? agentTypeLabel(deprovisionTarget.agentType) : "Agent"}`} centered>
      <Stack><Text size="sm">Remove the local installation of <strong>{deprovisionTarget?.name}</strong> from Supervisor Agent <strong>{deprovisionTarget?.supervisor.name}</strong>? The SensorSphere agent identity is kept and can be deployed again later.</Text>{dialogActionDetails && deprovisionMutation.isPending && <AgentActionDetails label={dialogActionDetails.label} operation={dialogActionDetails.operation} />}{deprovisionMutation.isError && <Text size="sm" c="red">{deprovisionMutation.error instanceof Error ? deprovisionMutation.error.message : "Unable to deprovision agent"}</Text>}<Group justify="flex-end"><Button variant="default" disabled={deprovisionMutation.isPending} onClick={() => setDeprovisionTarget(null)}>Cancel</Button><Button color="red" loading={deprovisionMutation.isPending} onClick={() => deprovisionTarget && deprovisionMutation.mutate(deprovisionTarget)}>Deprovision</Button></Group></Stack>
    </Modal>

    <Modal opened={cleanupRuntimeTarget != null} onClose={() => !cleanupRuntimeMutation.isPending && setCleanupRuntimeTarget(null)} title="Cleanup untracked runtime" centered>
      <Stack>
        <Text size="sm">Remove the untracked local runtime <strong>{cleanupRuntimeTarget?.name}</strong> from Supervisor Agent <strong>{cleanupRuntimeTarget?.supervisor.name}</strong>?</Text>
        <Text size="xs" c="dimmed">Only the runtime at this exact install directory will be removed:</Text>
        <Code>{cleanupRuntimeTarget?.installDir ?? "—"}</Code>
        <Text size="xs" c="orange">This runtime has no SensorSphere association. The cleanup does not delete any SensorSphere Agent identity.</Text>
        {dialogActionDetails && cleanupRuntimeMutation.isPending && <AgentActionDetails label={dialogActionDetails.label} operation={dialogActionDetails.operation} />}
        {cleanupRuntimeMutation.isError && <Text size="sm" c="red">{cleanupRuntimeMutation.error instanceof Error ? cleanupRuntimeMutation.error.message : "Unable to cleanup runtime"}</Text>}
        <Group justify="flex-end"><Button variant="default" disabled={cleanupRuntimeMutation.isPending} onClick={() => setCleanupRuntimeTarget(null)}>Cancel</Button><Button color="red" loading={cleanupRuntimeMutation.isPending} onClick={() => cleanupRuntimeTarget && cleanupRuntimeMutation.mutate(cleanupRuntimeTarget)}>Cleanup runtime</Button></Group>
      </Stack>
    </Modal>

    <Modal opened={editTarget != null} onClose={() => setEditTarget(null)} title="Edit Supervisor Agent" centered>
      <Stack><TextInput label="Name" value={editName} onChange={event => setEditName(event.currentTarget.value)} /><TextInput label="Labels" description="Comma separated. key=value or simple labels." value={editLabelsText} onChange={event => setEditLabelsText(event.currentTarget.value)} /><Select label="Enabled" value={editEnabled ? "yes" : "no"} onChange={value => setEditEnabled(value !== "no")} data={[{ value: "yes", label: "Enabled" }, { value: "no", label: "Disabled" }]} /><NumberInput label="Heartbeat timeout (seconds)" min={15} max={3600} value={editHeartbeatTimeout} onChange={value => setEditHeartbeatTimeout(Number(value) || 60)} />{editMutation.isError && <Text c="red" size="sm">{editMutation.error instanceof Error ? editMutation.error.message : "Unable to update Supervisor Agent"}</Text>}<Group justify="flex-end"><Button variant="default" onClick={() => setEditTarget(null)}>Cancel</Button><Button loading={editMutation.isPending} disabled={!editName.trim()} onClick={() => editMutation.mutate()}>Save</Button></Group></Stack>
    </Modal>

    <Modal opened={deleteTarget != null} onClose={() => setDeleteTarget(null)} title="Delete Supervisor Agent" centered>
      <Stack><Text size="sm">Delete Supervisor Agent <strong>{deleteTarget?.name}</strong>? The running host will lose its SensorSphere identity until configured with another token.</Text>{deleteMutation.isError && <Text c="red" size="sm">{deleteMutation.error instanceof Error ? deleteMutation.error.message : "Unable to delete Supervisor Agent"}</Text>}<Group justify="flex-end"><Button variant="default" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button color="red" loading={deleteMutation.isPending} onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}>Delete</Button></Group></Stack>
    </Modal>

    <Modal opened={tokenCheckResult != null} onClose={() => setTokenCheckResult(null)} title="Check Supervisor Agent token" centered>
      <Stack>
        <Text size="sm"><strong>{tokenCheckResult?.name}</strong></Text>
        <Badge color={tokenCheckResult?.matches ? "green" : "red"} variant="light">{tokenCheckResult?.matches ? "TOKEN MATCH" : "TOKEN MISMATCH"}</Badge>
        <Text size="sm">SensorSphere fingerprint: <Code>{tokenCheckResult?.expectedFingerprint ?? "—"}</Code></Text>
        <Text size="sm">Running Supervisor fingerprint: <Code>{tokenCheckResult?.deployedFingerprint ?? "—"}</Code></Text>
        <Group justify="flex-end"><Button onClick={() => setTokenCheckResult(null)}>Close</Button></Group>
      </Stack>
    </Modal>

    <Modal opened={createdToken != null && !createOpened} onClose={() => { setCreatedToken(null); setTokenSupervisorName(""); setCopiedField(null); }} title={tokenTitle} size="lg" centered>
      <Stack>
        <Text size="sm">Token shown once. Copy the token alone for an existing installation, or copy the complete reinstall command.</Text>
        <div>
          <Text size="xs" fw={600} mb={4}>Token</Text>
          <Group gap="xs" align="flex-start" wrap="nowrap"><Code block style={{ flex: 1 }}>{createdToken}</Code><Tooltip label={copiedField === "token" ? "Copied" : "Copy token"}><ActionIcon aria-label="Copy Supervisor Agent token" variant="light" color="blue" onClick={() => createdToken && void copyAndMark("token", createdToken)}><CopyIcon /></ActionIcon></Tooltip></Group>
        </div>
        <div>
          <Text size="xs" fw={600} mb={4}>Complete install / reinstall command</Text>
          <Group gap="xs" align="flex-start" wrap="nowrap"><Code block style={{ flex: 1, whiteSpace: "pre-wrap" }}>{supervisorInstallCommand}</Code><Tooltip label={copiedField === "command" ? "Copied" : "Copy command"}><ActionIcon aria-label="Copy Supervisor Agent install command" variant="light" color="green" onClick={() => void copyAndMark("command", supervisorInstallCommand)}><CopyIcon /></ActionIcon></Tooltip></Group>
          <Text size="xs" c="dimmed" mt={4}>The leading space is intentional so shells configured with HISTCONTROL=ignorespace do not save the command containing the token in history.</Text>
        </div>
        <Group justify="flex-end"><Button onClick={() => { setCreatedToken(null); setTokenSupervisorName(""); setCopiedField(null); }}>Close</Button></Group>
      </Stack>
    </Modal>

    <Modal opened={createOpened} onClose={() => { setCreateOpened(false); setCreatedToken(null); createMutation.reset(); }} title="Add autonomous Supervisor Agent" centered>
      <Stack>
        {!createdToken ? <>
          <Text size="sm" c="dimmed">Create a Supervisor identity and one-time token. Configure the token on the target host together with SENSORSPHERE_URL.</Text>
          <TextInput label="Name" placeholder="ss-agent" value={createName} onChange={event => setCreateName(event.currentTarget.value)} autoFocus />
          {createMutation.isError && <Text c="red" size="sm">{createMutation.error instanceof Error ? createMutation.error.message : "Unable to create Supervisor Agent"}</Text>}
          <Group justify="flex-end"><Button variant="default" onClick={() => setCreateOpened(false)}>Cancel</Button><Button loading={createMutation.isPending} disabled={!createName.trim()} onClick={() => createMutation.mutate(createName.trim())}>Create</Button></Group>
        </> : <>
          <Text size="sm">The Supervisor identity is ready. Copy this complete command and paste it on the target host.</Text>
          <Group gap="xs" align="flex-start" wrap="nowrap"><Code block style={{ flex: 1, whiteSpace: "pre-wrap" }}>{supervisorInstallCommand}</Code><Tooltip label={copiedField === "command" ? "Copied" : "Copy command"}><ActionIcon aria-label="Copy Supervisor Agent install command" variant="light" color="green" onClick={() => void copyAndMark("command", supervisorInstallCommand)}><CopyIcon /></ActionIcon></Tooltip></Group>
          <Text size="xs" c="dimmed">The command starts with a space intentionally so shells configured with HISTCONTROL=ignorespace do not retain the token in history. Latest Supervisor version: {latestSupervisorVersion}.</Text>
          <Group justify="flex-end"><Button onClick={() => { setCreateOpened(false); setCreatedToken(null); setTokenSupervisorName(""); setCopiedField(null); }}>Close</Button></Group>
        </>}
      </Stack>
    </Modal>

    <Modal opened={deployTarget != null} onClose={() => { if (!deployDeviceAgentMutation.isPending && !deployMonitoringAgentMutation.isPending) { setDeployTarget(null); setDeployStatus("IDLE"); setDeployError(null); } }} title={deployAgentType === "device-agent" ? "Deploy Device Agent" : deployTarget && missingManagedEntry(deployTarget, "monitor-agent", deployInstance) ? "Reinstall Monitoring Agent" : "Deploy Monitoring Agent"} centered>
      <Stack>
        <Text size="sm">{deployAgentType === "monitor-agent" && deployTarget && missingManagedEntry(deployTarget, "monitor-agent", deployInstance) ? "Reinstall the missing Monitoring Agent runtime" : `Deploy a ${deployAgentType === "device-agent" ? "Device" : "Monitoring"} Agent`} directly through Supervisor Agent <strong>{deployTarget?.name}</strong>.</Text>{deployTarget && discoveredUnmanaged(deployTarget, deployAgentType, deployInstance) && <Text size="sm" c="orange">An unmanaged local installation already exists for this instance. It will be stopped and archived before the new managed agent is deployed.</Text>}
        {deployAgentType === "monitor-agent" && deployTarget && missingManagedEntry(deployTarget, "monitor-agent", deployInstance) && <Text size="sm" c="orange">The SensorSphere association is preserved, but the Supervisor reports this runtime as not installed. Reinstall will reuse the existing agent identity and regenerate its token.</Text>}
        {deployAgentType === "monitor-agent" && <TextInput label="Instance" description="Unique Supervisor-local instance, for example main, i1 or i2." value={deployInstance} onChange={event => { const next = event.currentTarget.value; const previousDefault = deployTarget ? defaultMonitoringAgentName(deployTarget, deployInstance) : ""; setDeployInstance(next); if (deployTarget && (!deployAgentName.trim() || deployAgentName === previousDefault)) setDeployAgentName(defaultMonitoringAgentName(deployTarget, next.trim() || "main")); }} disabled={deployMonitoringAgentMutation.isPending || deployStatus === "SUCCESS"} />}
        <TextInput label={deployAgentType === "device-agent" ? "Device Agent name" : "Monitoring Agent name"} value={deployAgentName} onChange={event => { const value = event.currentTarget.value; setDeployAgentName(value); if (deployAgentType === "monitor-agent" && deploySlotMode === "new" && (!deploySlotName.trim() || deploySlotName === deployAgentName)) setDeploySlotName(value); if (deployAgentType === "device-agent" && deployDeviceSlotMode === "new" && (!deployDeviceSlotName.trim() || deployDeviceSlotName === deployAgentName)) setDeployDeviceSlotName(value); }} disabled={deployDeviceAgentMutation.isPending || deployMonitoringAgentMutation.isPending || deployStatus === "SUCCESS"} />
        {deployAgentType === "device-agent" && (
          deployPreservedDeviceSlot ? (
            <Card withBorder p="sm">
              <Group justify="space-between">
                <div>
                  <Text size="xs" c="dimmed">Device Agent identity</Text>
                  <Text fw={600}>{deployPreservedDeviceSlot.name}</Text>
                </div>
                <Badge color="violet" variant="light">Preserved</Badge>
              </Group>
              <Text size="xs" c="dimmed" mt={4}>Deploy/reinstall reuses the existing persistent Device Agent identity for this Device Agent.</Text>
            </Card>
          ) : (
            <Stack gap="xs">
              <Select
                label="Device Agent assignment"
                value={deployDeviceSlotMode}
                allowDeselect={false}
                data={[
                  { value: "new", label: "Create new Device Agent identity" },
                  { value: "existing", label: "Use existing unbound Device Agent identity" }
                ]}
                onChange={value => {
                  if (value === "new" || value === "existing") {
                    setDeployDeviceSlotMode(value);
                    if (value === "new") {
                      setDeployDeviceSlotId(null);
                      if (!deployDeviceSlotName.trim()) setDeployDeviceSlotName(deployAgentName);
                    }
                  }
                }}
                disabled={deployDeviceAgentMutation.isPending || deployStatus === "SUCCESS"}
              />
              {deployDeviceSlotMode === "existing" ? (
                <Select
                  label="Device Agent identity"
                  description="Unbound Device Agent identities keep Device assignments while the physical agent is absent."
                  searchable
                  placeholder="Select an unbound Device Agent identity"
                  data={unboundDeviceAgentSlots.map(slot => ({
                    value: slot.id,
                    label: slot.name + " · UNBOUND"
                  }))}
                  value={deployDeviceSlotId}
                  onChange={setDeployDeviceSlotId}
                  disabled={deployDeviceAgentMutation.isPending || deployStatus === "SUCCESS"}
                />
              ) : (
                <TextInput
                  label="New Device Agent identity name"
                  value={deployDeviceSlotName}
                  onChange={event => setDeployDeviceSlotName(event.currentTarget.value)}
                  disabled={deployDeviceAgentMutation.isPending || deployStatus === "SUCCESS"}
                />
              )}
            </Stack>
          )
        )}
        {deployAgentType === "monitor-agent" && (
          deployPreservedSlot ? (
            <Card withBorder p="sm">
              <Group justify="space-between">
                <div>
                  <Text size="xs" c="dimmed">Monitoring Slot</Text>
                  <Text fw={600}>{deployPreservedSlot.name}</Text>
                </div>
                <Badge color="violet" variant="light">Preserved</Badge>
              </Group>
              <Text size="xs" c="dimmed" mt={4}>Reinstall/deploy reuses the existing persistent Monitoring Slot for this Monitoring Agent.</Text>
            </Card>
          ) : (
            <Stack gap="xs">
              <Select
                label="Slot assignment"
                value={deploySlotMode}
                allowDeselect={false}
                data={[
                  { value: "new", label: "Create new Slot" },
                  { value: "existing", label: "Use existing unbound Slot" }
                ]}
                onChange={value => {
                  if (value === "new" || value === "existing") {
                    setDeploySlotMode(value);
                    if (value === "new") {
                      setDeploySlotId(null);
                      if (!deploySlotName.trim()) setDeploySlotName(deployAgentName);
                    }
                  }
                }}
                disabled={deployMonitoringAgentMutation.isPending || deployStatus === "SUCCESS"}
              />
              {deploySlotMode === "existing" ? (
                <Select
                  label="Monitoring Slot"
                  description="Unbound Slots are listed first because they preserve existing Device Check assignments."
                  searchable
                  placeholder="Select an unbound Slot"
                  data={unboundMonitoringSlots.map(slot => ({
                    value: slot.id,
                    label: slot.name + " · UNBOUND"
                  }))}
                  value={deploySlotId}
                  onChange={setDeploySlotId}
                  disabled={deployMonitoringAgentMutation.isPending || deployStatus === "SUCCESS"}
                />
              ) : (
                <TextInput
                  label="New Slot name"
                  value={deploySlotName}
                  onChange={event => setDeploySlotName(event.currentTarget.value)}
                  disabled={deployMonitoringAgentMutation.isPending || deployStatus === "SUCCESS"}
                />
              )}
            </Stack>
          )
        )}
        <TextInput label="Version" value={deployVersion} placeholder={deployAgentType === "device-agent" ? latestDeviceAgentVersion : latestMonitoringAgentVersion} onChange={event => setDeployVersion(event.currentTarget.value)} disabled={deployDeviceAgentMutation.isPending || deployMonitoringAgentMutation.isPending || deployStatus === "SUCCESS"} />
        <Card withBorder p="sm"><Group justify="space-between"><Text size="xs" c="dimmed">Status</Text><Badge size="sm" variant="light" color={deployStatus === "SUCCESS" ? "green" : deployStatus === "FAILED" ? "red" : deployStatus === "IDLE" ? "gray" : "blue"}>{deployStatus}</Badge></Group></Card>
        {dialogActionDetails && <AgentActionDetails label={dialogActionDetails.label} operation={dialogActionDetails.operation} />}
        {deployError && <Text size="sm" c="red">{deployError}</Text>}
        <Group justify="flex-end"><Button variant="default" disabled={deployDeviceAgentMutation.isPending || deployMonitoringAgentMutation.isPending} onClick={() => { setDeployTarget(null); setDeployStatus("IDLE"); setDeployError(null); setDialogActionDetails(null); }}>{deployStatus === "SUCCESS" ? "Close" : "Cancel"}</Button>{deployStatus !== "SUCCESS" && <><Button variant="light" color={deployAgentType === "device-agent" ? "cyan" : "blue"} disabled={deployDeviceAgentMutation.isPending || deployMonitoringAgentMutation.isPending || !deployAgentName.trim() || (deployAgentType === "device-agent" && !deviceSlotSelectionValid) || (deployAgentType === "monitor-agent" && (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(deployInstance.trim()) || !monitoringSlotSelectionValid)) || !/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/.test(deployVersion.trim())} onClick={() => { if (!deployTarget) return; const common = { supervisor: deployTarget, name: deployAgentName.trim(), version: deployVersion.trim(), closeAfterStart: true }; if (deployAgentType === "device-agent") deployDeviceAgentMutation.mutate({ ...common, ...deviceSlotInput }); else deployMonitoringAgentMutation.mutate({ ...common, instance: deployInstance.trim(), ...monitoringSlotInput }); }}>Deploy and Close</Button><Button color={deployAgentType === "device-agent" ? "cyan" : "blue"} loading={deployDeviceAgentMutation.isPending || deployMonitoringAgentMutation.isPending} disabled={!deployAgentName.trim() || (deployAgentType === "device-agent" && !deviceSlotSelectionValid) || (deployAgentType === "monitor-agent" && (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(deployInstance.trim()) || !monitoringSlotSelectionValid)) || !/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/.test(deployVersion.trim())} onClick={() => { if (!deployTarget) return; if (deployAgentType === "device-agent") deployDeviceAgentMutation.mutate({ supervisor: deployTarget, name: deployAgentName.trim(), version: deployVersion.trim(), ...deviceSlotInput }); else deployMonitoringAgentMutation.mutate({ supervisor: deployTarget, name: deployAgentName.trim(), instance: deployInstance.trim(), version: deployVersion.trim(), ...monitoringSlotInput }); }}>{deployAgentType === "monitor-agent" && deployTarget && missingManagedEntry(deployTarget, "monitor-agent", deployInstance) ? "Reinstall" : "Deploy"}</Button></>}</Group>
      </Stack>
    </Modal>

    <Modal opened={autonomousUpdateTarget != null} onClose={() => { setAutonomousUpdateTarget(null); setUpdateVersion(""); autonomousUpdateMutation.reset(); }} title="Update Supervisor Agent" centered>
      <Stack>
        <Text size="sm">Update Supervisor Agent <strong>{trackedAutonomousUpdateTarget?.name}</strong>.</Text>
        <TextInput label="Target version" placeholder={latestSupervisorVersion} value={updateVersion} onChange={event => setUpdateVersion(event.currentTarget.value)} disabled={autonomousUpdateMutation.isSuccess} autoFocus />
        {trackedAutonomousUpdateTarget && <Card withBorder p="sm">
          <Stack gap={6}>
            <Group justify="space-between"><Text size="xs" c="dimmed">Current version</Text><Text size="sm" fw={600}>{trackedAutonomousUpdateTarget.version ?? "—"}</Text></Group>
            <Group justify="space-between"><Text size="xs" c="dimmed">Target version</Text><Text size="sm" fw={600}>{updateVersion || "—"}</Text></Group>
            <Group justify="space-between"><Text size="xs" c="dimmed">Status</Text><Badge size="sm" variant="light" color={updateLifecycle(trackedAutonomousUpdateTarget).color}>{autonomousUpdateMutation.isPending ? "REQUESTING" : updateLifecycle(trackedAutonomousUpdateTarget).label}</Badge></Group>
            <Group justify="space-between"><Text size="xs" c="dimmed">Last seen</Text><Text size="sm" title={trackedAutonomousUpdateTarget.lastSeenAt ?? undefined}>{relativeAge(trackedAutonomousUpdateTarget.lastSeenAt)}</Text></Group>
            {trackedAutonomousUpdateTarget.updateError && <Text size="sm" c="red">{trackedAutonomousUpdateTarget.updateError}</Text>}
          </Stack>
        </Card>}
        {autonomousUpdateMutation.isError && <Text c="red" size="sm">{autonomousUpdateMutation.error instanceof Error ? autonomousUpdateMutation.error.message : "Unable to request Supervisor Agent update"}</Text>}
        <Group justify="flex-end"><Button variant="default" onClick={() => { setAutonomousUpdateTarget(null); setUpdateVersion(""); autonomousUpdateMutation.reset(); }}>Close</Button><Button color="teal" variant="light" loading={autonomousUpdateMutation.isPending} disabled={!/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/.test(updateVersion.trim()) || autonomousUpdateMutation.isPending} onClick={() => autonomousUpdateTarget && autonomousUpdateMutation.mutate({ id: autonomousUpdateTarget.id, version: updateVersion.trim(), closeOnSuccess: true })}>Update and Close</Button><Button color="teal" loading={autonomousUpdateMutation.isPending} disabled={!/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/.test(updateVersion.trim()) || autonomousUpdateMutation.isPending} onClick={() => autonomousUpdateTarget && autonomousUpdateMutation.mutate({ id: autonomousUpdateTarget.id, version: updateVersion.trim(), closeOnSuccess: false })}>Update</Button></Group>
      </Stack>
    </Modal>
  </Stack>;
}
