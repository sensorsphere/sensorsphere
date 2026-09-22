import React from "react";
import { ActionIcon, Badge, Button, Card, Code, Group, Modal, NumberInput, Select, Stack, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AgentVersionFreshnessBadge, getAgentVersionAvailability } from "./AgentVersionAvailability";
import { DeleteActionIcon, EditActionIcon } from "./TableActionIcons";
import { createMonitoringAgent, getDeviceAgents, getMonitoringAgents, regenerateDeviceAgentToken, regenerateMonitoringAgentToken } from "./api";
import { AgentTypeIcon, agentTypeLabel } from "./AgentTypeIcon";
import { SortableTableHeader, compareTableValues, type SortDirection } from "./SortableTableHeader";
import { usePersistentState } from "./preferences/usePersistentState";
import { ResetFiltersAction } from "./ResetFiltersAction";
import { activeFilterStyles } from "./ActiveFilterStyles";
import { FilterClearAction } from "./FilterClearAction";


export interface AutonomousSupervisorAgent {
  id: string; name: string; enabled: boolean; labels: Record<string, string>; agentLabels: string[]; reportedName: string | null; version: string | null; hostname: string | null;
  os: string | null; osVersion: string | null; architecture: string | null; managedAgents: Array<Record<string, unknown>>;
  configuredVersion: string | null; containerState: string | null; selfUpdateSupported: boolean; updateStatus: string; updateError: string | null;
  lastSuccessfulUpdateAt: string | null; lastSuccessfulUpdateVersion: string | null;
  lastSeenAt: string | null; heartbeatTimeoutSeconds: number; online: boolean; createdAt: string; updatedAt: string;
}

export async function getAutonomousSupervisors(): Promise<AutonomousSupervisorAgent[]> {
  const response = await fetch("/api/v1/device-control/supervisors");
  if (!response.ok) throw new Error(`Unable to load Supervisor Agents (${response.status})`);
  return response.json();
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

interface SupervisorManagedOperation {
  commandId: string;
  supervisorId: string;
  operation: "LIST" | "DEPLOY" | "UPDATE" | "REMOVE" | "CHECK_TOKEN";
  status: "SENT" | "SUCCESS" | "FAILED" | "TIMEOUT";
  result: unknown;
  error: string | null;
}

async function createDeviceAgentIdentity(name: string): Promise<{ agent: { id: string }; token: string }> {
  const response = await fetch("/api/v1/device-control/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
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

async function waitSupervisorManagedOperation(commandId: string): Promise<SupervisorManagedOperation> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await new Promise(resolve => window.setTimeout(resolve, 1000));
    const response = await fetch(`/api/v1/device-control/supervisor-managed-agents/${commandId}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? `Unable to read managed-agent operation (${response.status})`);
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

function explicitlyManaged(agent: AutonomousSupervisorAgent, agentType: "device-agent" | "monitor-agent", instance = "main"): boolean {
  const entry = reportedManagedEntry(agent, agentType, instance);
  return Boolean(entry && typeof entry.management_id === "string" && entry.management_id);
}

function discoveredUnmanaged(agent: AutonomousSupervisorAgent, agentType: "device-agent" | "monitor-agent", instance = "main"): boolean {
  const entry = reportedManagedEntry(agent, agentType, instance);
  return Boolean(entry && !(typeof entry.management_id === "string" && entry.management_id));
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
  const monitoringAgentsQuery = useQuery({ queryKey: ["monitoring", "agents"], queryFn: getMonitoringAgents, refetchInterval: 15000 });
  const versionsQuery = useQuery({ queryKey: ["agent-version-availability"], queryFn: getAgentVersionAvailability, refetchInterval: 300000 });
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
  const [deployTarget, setDeployTarget] = React.useState<AutonomousSupervisorAgent | null>(null);
  const [deployAgentType, setDeployAgentType] = React.useState<"device-agent" | "monitor-agent">("device-agent");
  const [deployAgentName, setDeployAgentName] = React.useState("");
  const [deployVersion, setDeployVersion] = React.useState("");
  const [deployStatus, setDeployStatus] = React.useState<"IDLE" | "CREATING" | "DEPLOYING" | "SUCCESS" | "FAILED">("IDLE");
  const [deployError, setDeployError] = React.useState<string | null>(null);
  const [deprovisionTarget, setDeprovisionTarget] = React.useState<{ supervisor: AutonomousSupervisorAgent; agentType: "device-agent" | "monitor-agent"; instance: string; name: string } | null>(null);

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
  const checkTokenMutation = useMutation({
    mutationFn: (agent: AutonomousSupervisorAgent) => checkAutonomousSupervisorToken(agent.id),
    onSuccess: (result, agent) => setTokenCheckResult({ name: agent.name, ...result })
  });
  const deleteMutation = useMutation({
    mutationFn: (agent: AutonomousSupervisorAgent) => deleteAutonomousSupervisor(agent.id),
    onSuccess: async () => { setDeleteTarget(null); await queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"] }); }
  });

  const deployDeviceAgentMutation = useMutation({
    mutationFn: async ({ supervisor, name, version }: { supervisor: AutonomousSupervisorAgent; name: string; version: string }) => {
      setDeployStatus("CREATING");
      setDeployError(null);
      if (discoveredUnmanaged(supervisor, "device-agent")) {
        setDeployStatus("DEPLOYING");
        const cleanup = await requestSupervisorManagedOperation(supervisor.id, { operation: "REMOVE", agentType: "device-agent", instance: "main" });
        const cleaned = await waitSupervisorManagedOperation(cleanup.commandId);
        if (cleaned.status !== "SUCCESS") throw new Error(cleaned.error ?? "Unable to remove the unmanaged local Device Agent installation");
        setDeployStatus("CREATING");
      }
      const existing = (deviceAgentsQuery.data ?? []).find(agent => agent.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (existing?.managedBySupervisorId && existing.managedBySupervisorId !== supervisor.id) throw new Error(`Device Agent '${name}' is already managed by another Supervisor`);
      const identity = existing ? await regenerateDeviceAgentToken(existing.id) : await createDeviceAgentIdentity(name);
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
        const completed = await waitSupervisorManagedOperation(operation.commandId);
        if (completed.status !== "SUCCESS") throw new Error(completed.error ?? `Device Agent deployment ${completed.status.toLowerCase()}`);
        return completed;
      } catch (error) {
        // Keep the SensorSphere identity after a failed remote deployment so token
        // diagnostics/regeneration and an explicit retry remain possible.
        throw error;
      }
    },
    onSuccess: async () => { setDeployStatus("SUCCESS"); await Promise.all([queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"] }), queryClient.invalidateQueries({ queryKey: ["device-control", "agents"] })]); },
    onError: error => { setDeployStatus("FAILED"); setDeployError(error instanceof Error ? error.message : "Unable to deploy Device Agent"); }
  });

  const deployMonitoringAgentMutation = useMutation({
    mutationFn: async ({ supervisor, name, version }: { supervisor: AutonomousSupervisorAgent; name: string; version: string }) => {
      setDeployStatus("CREATING");
      setDeployError(null);
      if (discoveredUnmanaged(supervisor, "monitor-agent")) {
        setDeployStatus("DEPLOYING");
        const cleanup = await requestSupervisorManagedOperation(supervisor.id, { operation: "REMOVE", agentType: "monitor-agent", instance: "main" });
        const cleaned = await waitSupervisorManagedOperation(cleanup.commandId);
        if (cleaned.status !== "SUCCESS") throw new Error(cleaned.error ?? "Unable to remove the unmanaged local Monitoring Agent installation");
        setDeployStatus("CREATING");
      }
      const existing = (monitoringAgentsQuery.data ?? []).find(agent => agent.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (existing?.managedBySupervisorId && existing.managedBySupervisorId !== supervisor.id) throw new Error(`Monitoring Agent '${name}' is already managed by another Supervisor`);
      const identity = existing ? await regenerateMonitoringAgentToken(existing.id) : await createMonitoringAgent({ name });
      try {
        setDeployStatus("DEPLOYING");
        const operation = await requestSupervisorManagedOperation(supervisor.id, {
          operation: "DEPLOY",
          agentType: "monitor-agent",
          agentId: identity.agent.id,
          instance: "main",
          version,
          environment: {
            SENSORSPHERE_URL: window.location.origin,
            SENSORSPHERE_AGENT_TOKEN: identity.token,
            AGENT_NAME: name
          }
        });
        const completed = await waitSupervisorManagedOperation(operation.commandId);
        if (completed.status !== "SUCCESS") throw new Error(completed.error ?? `Monitoring Agent deployment ${completed.status.toLowerCase()}`);
        return completed;
      } catch (error) {
        // Keep the Monitoring Agent identity for diagnostics and retry.
        throw error;
      }
    },
    onSuccess: async () => { setDeployStatus("SUCCESS"); await Promise.all([queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"] }), queryClient.invalidateQueries({ queryKey: ["monitoring", "agents"] })]); },
    onError: error => { setDeployStatus("FAILED"); setDeployError(error instanceof Error ? error.message : "Unable to deploy Monitoring Agent"); }
  });

  const deprovisionMutation = useMutation({
    mutationFn: async (target: { supervisor: AutonomousSupervisorAgent; agentType: "device-agent" | "monitor-agent"; instance: string }) => {
      const started = await requestSupervisorManagedOperation(target.supervisor.id, { operation: "REMOVE", agentType: target.agentType, instance: target.instance });
      const completed = await waitSupervisorManagedOperation(started.commandId);
      if (completed.status !== "SUCCESS") throw new Error(completed.error ?? `Unable to deprovision ${agentTypeLabel(target.agentType)}`);
      return completed;
    },
    onSuccess: async () => { setDeprovisionTarget(null); await Promise.all([queryClient.invalidateQueries({ queryKey: ["device-control", "supervisors"] }), queryClient.invalidateQueries({ queryKey: ["device-control", "agents"] }), queryClient.invalidateQueries({ queryKey: ["monitoring", "agents"] })]); }
  });

  const autonomousUpdateMutation = useMutation({
    mutationFn: ({ id, version, closeOnSuccess = false }: { id: string; version: string; closeOnSuccess?: boolean }) => requestAutonomousSupervisorUpdate(id, version).then(() => ({ id, version, closeOnSuccess })),
    onMutate: ({ id, version }) => {
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
  const supervisorInstallCommand = createdToken && tokenSupervisorName ? ` SENSORSPHERE_URL=${window.location.origin} \
SENSORSPHERE_AGENT_TOKEN='${createdToken}' \
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
    <Card withBorder className="monitoring-table-card">
      <Group justify="space-between" mb="sm"><div><Text fw={600}>Supervisor Agents</Text><Text size="xs" c="dimmed">Direct outbound Supervisor → SensorSphere connections.</Text></div><Button size="xs" onClick={() => { setCreateOpened(true); setCreatedToken(null); setTokenSupervisorName(""); setCopiedField(null); setCreateName(""); }}>Add Supervisor Agent</Button></Group>
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
          <Table.Thead><Table.Tr><SortableTableHeader active={agentSortKey === "name"} direction={agentSortDirection} onClick={() => toggleAgentSort("name")}>Name</SortableTableHeader><SortableTableHeader active={agentSortKey === "status"} direction={agentSortDirection} onClick={() => toggleAgentSort("status")}>Status</SortableTableHeader><SortableTableHeader active={agentSortKey === "reported"} direction={agentSortDirection} onClick={() => toggleAgentSort("reported")}>Reported</SortableTableHeader><SortableTableHeader active={agentSortKey === "version"} direction={agentSortDirection} onClick={() => toggleAgentSort("version")}>Version</SortableTableHeader><SortableTableHeader active={agentSortKey === "system"} direction={agentSortDirection} onClick={() => toggleAgentSort("system")}>System</SortableTableHeader><SortableTableHeader active={agentSortKey === "lastSeen"} direction={agentSortDirection} onClick={() => toggleAgentSort("lastSeen")}>Last Seen</SortableTableHeader><SortableTableHeader active={agentSortKey === "managed"} direction={agentSortDirection} onClick={() => toggleAgentSort("managed")}>Managed agents</SortableTableHeader><SortableTableHeader active={agentSortKey === "labels"} direction={agentSortDirection} onClick={() => toggleAgentSort("labels")}>Labels</SortableTableHeader><SortableTableHeader active={agentSortKey === "agentLabels"} direction={agentSortDirection} onClick={() => toggleAgentSort("agentLabels")}>Agent Labels</SortableTableHeader><Table.Th style={{ width: 170, textAlign: "right" }}>Actions</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>{filteredAutonomous.map(agent => {
            const lifecycle = updateLifecycle(agent);
            return <Table.Tr key={agent.id}>
              <Table.Td><Text fw={600} size="sm">{agent.name}</Text></Table.Td>
              <Table.Td><Badge size="sm" variant="light" color={!agent.enabled ? "red" : agent.online ? "green" : "gray"}>{!agent.enabled ? "DISABLED" : agent.online ? "ONLINE" : "OFFLINE"}</Badge></Table.Td>
              <Table.Td><Text size="sm">{agent.reportedName ?? "—"}{agent.hostname ? ` [${agent.hostname}]` : ""}</Text></Table.Td>
              <Table.Td><Text size="sm">{agent.version ?? "—"}</Text>{["REQUESTED", "UPDATE_REQUESTED", "UPDATING", "VERIFYING"].includes(agent.updateStatus) ? <><Tooltip label={agent.updateError ?? `Supervisor update lifecycle: ${lifecycle.label}`}><Badge size="xs" variant="light" color={lifecycle.color}>{lifecycle.label}</Badge></Tooltip>{agent.configuredVersion && <Text size="xs" c="dimmed">Target {agent.configuredVersion}</Text>}</> : <><AgentVersionFreshnessBadge installedVersion={agent.version} release={versionsQuery.data?.agents?.supervisorAgent} />{agent.updateStatus === "FAILED" && <Tooltip label={agent.updateError ?? "Supervisor update failed"}><Badge size="xs" variant="light" color="red">FAILED</Badge></Tooltip>}{agent.lastSuccessfulUpdateAt && <Text size="xs" c="dimmed" title={agent.lastSuccessfulUpdateAt}>Updated {relativeAge(agent.lastSuccessfulUpdateAt)}</Text>}</>}</Table.Td>
              <Table.Td><Text size="sm">{agent.os ?? "—"}{agent.osVersion ? ` ${agent.osVersion}` : ""}</Text><Text size="xs" c="dimmed">{agent.architecture ?? "—"}</Text></Table.Td>
              <Table.Td title={agent.lastSeenAt ?? undefined}><Text size="sm">{relativeAge(agent.lastSeenAt)}</Text></Table.Td>
              <Table.Td>{agent.managedAgents.filter(entry => entry.installed !== false).length > 0 ? <Group gap={6} wrap="nowrap">{agent.managedAgents.filter(entry => entry.installed !== false).map(managedAgentIcon)}</Group> : <Text size="xs" c="dimmed">—</Text>}</Table.Td>
              <Table.Td>{Object.keys(agent.labels).length > 0 ? <Group gap={4} wrap="wrap">{Object.entries(agent.labels).map(([key,value]) => <Badge key={key} size="xs" variant="light">{key}={value}</Badge>)}</Group> : <Text size="xs" c="dimmed">—</Text>}</Table.Td>
              <Table.Td>{agent.agentLabels.length > 0 ? <Group gap={4} wrap="wrap">{agent.agentLabels.map(label => <Badge key={label} size="xs" variant="light" color="cyan">{label}</Badge>)}</Group> : <Text size="xs" c="dimmed">—</Text>}</Table.Td>
              <Table.Td><Group gap={4} wrap="nowrap" justify="flex-end">{explicitlyManaged(agent, "device-agent") ? <Tooltip label="Deprovision Device Agent"><ActionIcon size="sm" variant="light" color="red" aria-label="Deprovision Device Agent" disabled={!agent.online} onClick={() => { const entry = reportedManagedEntry(agent, "device-agent")!; setDeprovisionTarget({ supervisor: agent, agentType: "device-agent", instance: typeof entry.instance === "string" ? entry.instance : "main", name: typeof entry.agent_name === "string" ? entry.agent_name : agent.name }); }}><DeprovisionAgentIcon /></ActionIcon></Tooltip> : <Tooltip label={!agent.online ? "Supervisor Agent must be online" : discoveredUnmanaged(agent, "device-agent") ? "Replace unmanaged local Device Agent installation" : "Deploy Device Agent"}><ActionIcon size="sm" variant="light" color="cyan" aria-label="Deploy Device Agent" disabled={!agent.online} onClick={() => { setDeployTarget(agent); setDeployAgentType("device-agent"); setDeployAgentName(agent.name); setDeployVersion(latestDeviceAgentVersion !== "latest" ? latestDeviceAgentVersion : ""); setDeployStatus("IDLE"); setDeployError(null); deployDeviceAgentMutation.reset(); }}><DeployAgentIcon /></ActionIcon></Tooltip>}{explicitlyManaged(agent, "monitor-agent") ? <Tooltip label="Deprovision Monitoring Agent"><ActionIcon size="sm" variant="light" color="red" aria-label="Deprovision Monitoring Agent" disabled={!agent.online} onClick={() => { const entry = reportedManagedEntry(agent, "monitor-agent")!; setDeprovisionTarget({ supervisor: agent, agentType: "monitor-agent", instance: typeof entry.instance === "string" ? entry.instance : "main", name: typeof entry.agent_name === "string" ? entry.agent_name : `${agent.name}-monitor` }); }}><DeprovisionAgentIcon /></ActionIcon></Tooltip> : <Tooltip label={!agent.online ? "Supervisor Agent must be online" : discoveredUnmanaged(agent, "monitor-agent") ? "Replace unmanaged local Monitoring Agent installation" : "Deploy Monitoring Agent"}><ActionIcon size="sm" variant="light" color="violet" aria-label="Deploy Monitoring Agent" disabled={!agent.online} onClick={() => { setDeployTarget(agent); setDeployAgentType("monitor-agent"); setDeployAgentName(`${agent.name}-monitor`); setDeployVersion(latestMonitoringAgentVersion !== "latest" ? latestMonitoringAgentVersion : ""); setDeployStatus("IDLE"); setDeployError(null); deployMonitoringAgentMutation.reset(); }}><DeployAgentIcon /></ActionIcon></Tooltip>}<Tooltip label={agent.selfUpdateSupported ? "Update Supervisor Agent" : "Supervisor self-update unavailable"}><ActionIcon size="sm" variant="light" color="teal" aria-label="Update Supervisor Agent" disabled={!agent.online || !agent.selfUpdateSupported || ["REQUESTED", "UPDATE_REQUESTED", "UPDATING", "VERIFYING"].includes(agent.updateStatus)} onClick={() => { setAutonomousUpdateTarget(agent); setUpdateVersion(latestSupervisorVersion !== "latest" ? latestSupervisorVersion : agent.version ?? ""); autonomousUpdateMutation.reset(); }}><SupervisorUpdateIcon /></ActionIcon></Tooltip><EditActionIcon onClick={() => { setEditTarget(agent); setEditName(agent.name); setEditEnabled(agent.enabled); setEditHeartbeatTimeout(agent.heartbeatTimeoutSeconds); setEditLabelsText(labelsText(agent.labels)); editMutation.reset(); }} /><Tooltip label="Copy supervisor agent"><ActionIcon size="sm" variant="light" color="green" aria-label="Copy supervisor agent" onClick={() => copyMutation.mutate(agent)}>⧉</ActionIcon></Tooltip><Tooltip label="Check configured token"><ActionIcon size="sm" variant="light" color="teal" aria-label="Check configured token" onClick={() => checkTokenMutation.mutate(agent)}><CheckTokenIcon /></ActionIcon></Tooltip><Tooltip label="Regenerate agent token"><ActionIcon size="sm" variant="light" color="orange" aria-label="Regenerate agent token" onClick={() => regenerateMutation.mutate(agent)}>↻</ActionIcon></Tooltip><DeleteActionIcon onClick={() => setDeleteTarget(agent)} /></Group></Table.Td>
            </Table.Tr>;
          })}{filteredAutonomous.length === 0 && <Table.Tr><Table.Td colSpan={10}><Text ta="center" c="dimmed" py="xl">No Supervisor Agents registered yet.</Text></Table.Td></Table.Tr>}</Table.Tbody>
        </Table>
      </div>
    </Card>

    <Modal opened={deprovisionTarget != null} onClose={() => !deprovisionMutation.isPending && setDeprovisionTarget(null)} title={`Deprovision ${deprovisionTarget ? agentTypeLabel(deprovisionTarget.agentType) : "Agent"}`} centered>
      <Stack><Text size="sm">Remove the local installation of <strong>{deprovisionTarget?.name}</strong> from Supervisor Agent <strong>{deprovisionTarget?.supervisor.name}</strong>? The SensorSphere agent identity is kept and can be deployed again later.</Text>{deprovisionMutation.isError && <Text size="sm" c="red">{deprovisionMutation.error instanceof Error ? deprovisionMutation.error.message : "Unable to deprovision agent"}</Text>}<Group justify="flex-end"><Button variant="default" disabled={deprovisionMutation.isPending} onClick={() => setDeprovisionTarget(null)}>Cancel</Button><Button color="red" loading={deprovisionMutation.isPending} onClick={() => deprovisionTarget && deprovisionMutation.mutate(deprovisionTarget)}>Deprovision</Button></Group></Stack>
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
          <TextInput label="Name" placeholder="homefcs-iot-ap" value={createName} onChange={event => setCreateName(event.currentTarget.value)} autoFocus />
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

    <Modal opened={deployTarget != null} onClose={() => { if (!deployDeviceAgentMutation.isPending && !deployMonitoringAgentMutation.isPending) { setDeployTarget(null); setDeployStatus("IDLE"); setDeployError(null); } }} title={deployAgentType === "device-agent" ? "Deploy Device Agent" : "Deploy Monitoring Agent"} centered>
      <Stack>
        <Text size="sm">Deploy a {deployAgentType === "device-agent" ? "Device" : "Monitoring"} Agent directly through Supervisor Agent <strong>{deployTarget?.name}</strong>.</Text>{deployTarget && discoveredUnmanaged(deployTarget, deployAgentType) && <Text size="sm" c="orange">An unmanaged local installation already exists for this slot. It will be stopped and archived before the new managed agent is deployed.</Text>}
        <TextInput label={deployAgentType === "device-agent" ? "Device Agent name" : "Monitoring Agent name"} value={deployAgentName} onChange={event => setDeployAgentName(event.currentTarget.value)} disabled={deployDeviceAgentMutation.isPending || deployMonitoringAgentMutation.isPending || deployStatus === "SUCCESS"} />
        <TextInput label="Version" value={deployVersion} placeholder={deployAgentType === "device-agent" ? latestDeviceAgentVersion : latestMonitoringAgentVersion} onChange={event => setDeployVersion(event.currentTarget.value)} disabled={deployDeviceAgentMutation.isPending || deployMonitoringAgentMutation.isPending || deployStatus === "SUCCESS"} />
        <Card withBorder p="sm"><Group justify="space-between"><Text size="xs" c="dimmed">Status</Text><Badge size="sm" variant="light" color={deployStatus === "SUCCESS" ? "green" : deployStatus === "FAILED" ? "red" : deployStatus === "IDLE" ? "gray" : "blue"}>{deployStatus}</Badge></Group></Card>
        {deployError && <Text size="sm" c="red">{deployError}</Text>}
        <Group justify="flex-end"><Button variant="default" disabled={deployDeviceAgentMutation.isPending || deployMonitoringAgentMutation.isPending} onClick={() => { setDeployTarget(null); setDeployStatus("IDLE"); setDeployError(null); }}>{deployStatus === "SUCCESS" ? "Close" : "Cancel"}</Button>{deployStatus !== "SUCCESS" && <Button color={deployAgentType === "device-agent" ? "cyan" : "blue"} loading={deployDeviceAgentMutation.isPending || deployMonitoringAgentMutation.isPending} disabled={!deployAgentName.trim() || !/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/.test(deployVersion.trim())} onClick={() => deployTarget && (deployAgentType === "device-agent" ? deployDeviceAgentMutation : deployMonitoringAgentMutation).mutate({ supervisor: deployTarget, name: deployAgentName.trim(), version: deployVersion.trim() })}>Deploy</Button>}</Group>
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
