import React from "react";

import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  Code,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip
} from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createMonitoringAgent,
  createMonitoringCheck,
  deleteMonitoringAgent,
  deleteMonitoringCheck,
  getDeviceRegistryDevices,
  getMonitoringAgents,
  getMonitoringChecks,
  regenerateMonitoringAgentToken,
  updateMonitoringAgent,
  updateMonitoringCheck
} from "./api";
import type {
  CreateMonitoringCheckInput,
  MonitoringAgent,
  MonitoringCheck,
  MonitoringCheckType,
  MonitoringExecutionMode,
  MonitoringTargetMode
} from "./types";
import { EditActionIcon, DeleteActionIcon } from "./TableActionIcons";

const STATUS_COLORS: Record<string, string> = {
  UP: "green",
  DOWN: "red",
  UNKNOWN: "gray"
};

function relativeAge(value: string | null): string {
  if (!value) return "Never";
  const milliseconds = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(milliseconds)) return value;
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}


async function writeClipboardText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through for HTTP/insecure contexts or browsers denying Clipboard API access.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

function overallCheckStatus(check: MonitoringCheck): "UP" | "DOWN" | "UNKNOWN" {
  if (check.states.some(state => state.status === "UP")) return "UP";
  if (check.states.some(state => state.status === "DOWN")) return "DOWN";
  return "UNKNOWN";
}

interface AgentFormState {
  name: string;
  heartbeatTimeoutSeconds: number;
  labelsText: string;
  enabled: boolean;
}

function emptyAgentForm(): AgentFormState {
  return { name: "", heartbeatTimeoutSeconds: 90, labelsText: "", enabled: true };
}

function agentToForm(agent: MonitoringAgent): AgentFormState {
  return {
    name: agent.name,
    heartbeatTimeoutSeconds: agent.heartbeatTimeoutSeconds,
    labelsText: Object.entries(agent.labels).map(([key, value]) => `${key}=${value}`).join("\n"),
    enabled: agent.enabled
  };
}

function parseLabels(value: string): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const line of value.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) throw new Error(`Invalid label "${trimmed}". Expected key=value.`);
    labels[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return labels;
}

interface CheckFormState {
  deviceId: string | null;
  name: string;
  enabled: boolean;
  checkType: MonitoringCheckType;
  targetMode: MonitoringTargetMode;
  targetValue: string;
  port: number | string;
  path: string;
  intervalSeconds: number | string;
  timeoutSeconds: number | string;
  failureThreshold: number | string;
  recoveryThreshold: number | string;
  executionMode: MonitoringExecutionMode;
  agentIds: string[];
}

function emptyCheckForm(): CheckFormState {
  return {
    deviceId: null,
    name: "Ping",
    enabled: true,
    checkType: "PING",
    targetMode: "PRIMARY_IP",
    targetValue: "",
    port: "",
    path: "",
    intervalSeconds: 60,
    timeoutSeconds: 3,
    failureThreshold: 3,
    recoveryThreshold: 2,
    executionMode: "FAILOVER",
    agentIds: []
  };
}

function checkToForm(check: MonitoringCheck): CheckFormState {
  return {
    deviceId: check.deviceId,
    name: check.name,
    enabled: check.enabled,
    checkType: check.checkType,
    targetMode: check.targetMode,
    targetValue: check.targetValue ?? "",
    port: check.port ?? "",
    path: check.path ?? "",
    intervalSeconds: check.intervalSeconds,
    timeoutSeconds: check.timeoutSeconds,
    failureThreshold: check.failureThreshold,
    recoveryThreshold: check.recoveryThreshold,
    executionMode: check.executionMode,
    agentIds: [...check.assignments].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100)).map(item => item.agentId)
  };
}

function numeric(value: number | string, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function checkPayload(form: CheckFormState): CreateMonitoringCheckInput {
  if (!form.deviceId) throw new Error("Device is required");
  if (form.agentIds.length === 0) throw new Error("At least one monitoring agent is required");
  return {
    deviceId: form.deviceId,
    name: form.name.trim(),
    enabled: form.enabled,
    checkType: form.checkType,
    targetMode: form.targetMode,
    targetValue: form.targetMode === "CUSTOM" ? form.targetValue.trim() || null : null,
    port: form.checkType === "PING" ? null : numeric(form.port, form.checkType === "HTTPS" ? 443 : form.checkType === "HTTP" ? 80 : 22),
    path: form.checkType === "HTTP" || form.checkType === "HTTPS" ? (form.path.trim() || "/") : null,
    intervalSeconds: numeric(form.intervalSeconds, 60),
    timeoutSeconds: numeric(form.timeoutSeconds, 3),
    failureThreshold: numeric(form.failureThreshold, 3),
    recoveryThreshold: numeric(form.recoveryThreshold, 2),
    executionMode: form.executionMode,
    assignments: form.agentIds.map((agentId, index) => ({ agentId, priority: (index + 1) * 10, enabled: true }))
  };
}

export function MonitoringPanel() {
  const queryClient = useQueryClient();
  const agentsQuery = useQuery({ queryKey: ["monitoring", "agents"], queryFn: getMonitoringAgents, refetchInterval: 15000 });
  const checksQuery = useQuery({ queryKey: ["monitoring", "checks"], queryFn: getMonitoringChecks, refetchInterval: 15000 });
  const devicesQuery = useQuery({ queryKey: ["device-registry", "devices"], queryFn: getDeviceRegistryDevices });

  const [agentModalOpen, setAgentModalOpen] = React.useState(false);
  const [editingAgent, setEditingAgent] = React.useState<MonitoringAgent | null>(null);
  const [agentForm, setAgentForm] = React.useState<AgentFormState>(emptyAgentForm());
  const [agentDeleteTarget, setAgentDeleteTarget] = React.useState<MonitoringAgent | null>(null);
  const [tokenInfo, setTokenInfo] = React.useState<{ agentName: string; token: string } | null>(null);

  const [checkModalOpen, setCheckModalOpen] = React.useState(false);
  const [editingCheck, setEditingCheck] = React.useState<MonitoringCheck | null>(null);
  const [checkForm, setCheckForm] = React.useState<CheckFormState>(emptyCheckForm());
  const [checkDeleteTarget, setCheckDeleteTarget] = React.useState<MonitoringCheck | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["monitoring", "agents"] }),
      queryClient.invalidateQueries({ queryKey: ["monitoring", "checks"] })
    ]);
  };

  const saveAgent = useMutation({
    mutationFn: async () => {
      const labels = parseLabels(agentForm.labelsText);
      if (editingAgent) {
        return { agent: await updateMonitoringAgent(editingAgent.id, {
          name: agentForm.name.trim(),
          enabled: agentForm.enabled,
          labels,
          heartbeatTimeoutSeconds: agentForm.heartbeatTimeoutSeconds
        }), token: null as string | null };
      }
      const created = await createMonitoringAgent({
        name: agentForm.name.trim(), labels, heartbeatTimeoutSeconds: agentForm.heartbeatTimeoutSeconds
      });
      return { agent: created.agent, token: created.token };
    },
    onSuccess: async result => {
      setAgentModalOpen(false);
      setEditingAgent(null);
      setError(null);
      if (result.token) setTokenInfo({ agentName: result.agent.name, token: result.token });
      await refresh();
    },
    onError: cause => setError(cause instanceof Error ? cause.message : "Unable to save monitoring agent")
  });

  const removeAgent = useMutation({
    mutationFn: deleteMonitoringAgent,
    onSuccess: async () => { setAgentDeleteTarget(null); await refresh(); },
    onError: cause => setError(cause instanceof Error ? cause.message : "Unable to delete monitoring agent")
  });

  const regenerateToken = useMutation({
    mutationFn: regenerateMonitoringAgentToken,
    onSuccess: result => setTokenInfo({ agentName: result.agent.name, token: result.token }),
    onError: cause => setError(cause instanceof Error ? cause.message : "Unable to regenerate token")
  });

  const saveCheck = useMutation({
    mutationFn: async () => editingCheck
      ? updateMonitoringCheck(editingCheck.id, checkPayload(checkForm))
      : createMonitoringCheck(checkPayload(checkForm)),
    onSuccess: async () => {
      setCheckModalOpen(false);
      setEditingCheck(null);
      setError(null);
      await refresh();
    },
    onError: cause => setError(cause instanceof Error ? cause.message : "Unable to save monitoring check")
  });

  const removeCheck = useMutation({
    mutationFn: deleteMonitoringCheck,
    onSuccess: async () => { setCheckDeleteTarget(null); await refresh(); },
    onError: cause => setError(cause instanceof Error ? cause.message : "Unable to delete monitoring check")
  });

  const agents = agentsQuery.data ?? [];
  const checks = checksQuery.data ?? [];
  const onlineAgents = agents.filter(item => item.online).length;
  const statuses = checks.map(overallCheckStatus);
  const upChecks = statuses.filter(item => item === "UP").length;
  const downChecks = statuses.filter(item => item === "DOWN").length;
  const unknownChecks = statuses.filter(item => item === "UNKNOWN").length;

  const openCreateAgent = () => {
    setEditingAgent(null); setAgentForm(emptyAgentForm()); setError(null); setAgentModalOpen(true);
  };
  const openEditAgent = (agent: MonitoringAgent) => {
    setEditingAgent(agent); setAgentForm(agentToForm(agent)); setError(null); setAgentModalOpen(true);
  };
  const openCreateCheck = () => {
    setEditingCheck(null); setCheckForm(emptyCheckForm()); setError(null); setCheckModalOpen(true);
  };
  const openEditCheck = (check: MonitoringCheck) => {
    setEditingCheck(check); setCheckForm(checkToForm(check)); setError(null); setCheckModalOpen(true);
  };

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
        {[
          ["Agents", agents.length, "blue"],
          ["Agents online", onlineAgents, "green"],
          ["Checks", checks.length, "violet"],
          ["Up", upChecks, "green"],
          ["Down", downChecks, "red"],
          ["Unknown", unknownChecks, "gray"]
        ].map(([label, value, color]) => (
          <Card key={String(label)} withBorder p="sm" style={{ borderLeft: `4px solid var(--mantine-color-${String(color)}-6)` }}>
            <Text size="xs" c="dimmed">{label}</Text>
            <Text fw={700} size="xl" c={String(color)}>{value}</Text>
          </Card>
        ))}
      </SimpleGrid>

      {error && <Text c="red" size="sm">{error}</Text>}

      <Card withBorder>
        <Group justify="space-between" mb="sm">
          <div><Title order={4}>Monitoring agents</Title><Text size="xs" c="dimmed">Independent pull agents authenticate with a SensorSphere-generated token.</Text></div>
          <Button size="xs" onClick={openCreateAgent}>+ Add agent</Button>
        </Group>
        <Table striped highlightOnHover>
          <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Status</Table.Th><Table.Th>Host</Table.Th><Table.Th>Version</Table.Th><Table.Th>Last seen</Table.Th><Table.Th>Labels</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {agents.map(agent => (
              <Table.Tr key={agent.id}>
                <Table.Td><Text fw={600} size="sm">{agent.name}</Text></Table.Td>
                <Table.Td><Badge size="sm" color={!agent.enabled ? "gray" : agent.online ? "green" : "red"}>{!agent.enabled ? "DISABLED" : agent.online ? "ONLINE" : "OFFLINE"}</Badge></Table.Td>
                <Table.Td><Text size="sm">{agent.hostname ?? "—"}</Text><Text size="xs" c="dimmed">{agent.lastIp ?? ""}</Text></Table.Td>
                <Table.Td>{agent.version ?? "—"}</Table.Td>
                <Table.Td>{relativeAge(agent.lastSeenAt)}</Table.Td>
                <Table.Td><Text size="xs">{Object.entries(agent.labels).map(([k, v]) => `${k}=${v}`).join(", ") || "—"}</Text></Table.Td>
                <Table.Td><Group gap={4} wrap="nowrap">
                  <EditActionIcon onClick={() => openEditAgent(agent)} />
                  <Tooltip label="Regenerate agent token"><ActionIcon size="sm" variant="light" color="orange" onClick={() => regenerateToken.mutate(agent.id)}>↻</ActionIcon></Tooltip>
                  <DeleteActionIcon onClick={() => setAgentDeleteTarget(agent)} />
                </Group></Table.Td>
              </Table.Tr>
            ))}
            {agents.length === 0 && <Table.Tr><Table.Td colSpan={7}><Text ta="center" c="dimmed" py="xl">No monitoring agents. Create an agent before assigning checks.</Text></Table.Td></Table.Tr>}
          </Table.Tbody>
        </Table>
      </Card>

      <Card withBorder>
        <Group justify="space-between" mb="sm">
          <div><Title order={4}>Device checks</Title><Text size="xs" c="dimmed">PING is the first executable check. TCP/HTTP/HTTPS are already represented by the generic contract for future agents.</Text></div>
          <Button size="xs" onClick={openCreateCheck} disabled={agents.length === 0}>+ Add check</Button>
        </Group>
        <Table striped highlightOnHover>
          <Table.Thead><Table.Tr><Table.Th>Device</Table.Th><Table.Th>Check</Table.Th><Table.Th>Target</Table.Th><Table.Th>Agents</Table.Th><Table.Th>Mode</Table.Th><Table.Th>Status</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {checks.map(check => {
              const status = overallCheckStatus(check);
              const target = check.targetMode === "CUSTOM" ? check.targetValue : check.targetMode.replaceAll("_", " ");
              return <Table.Tr key={check.id}>
                <Table.Td><Text fw={600} size="sm">{check.deviceName}</Text></Table.Td>
                <Table.Td><Text size="sm">{check.name}</Text><Text size="xs" c="dimmed">{check.checkType} · {check.intervalSeconds}s</Text></Table.Td>
                <Table.Td><Code>{target ?? "—"}{check.port ? `:${check.port}` : ""}</Code></Table.Td>
                <Table.Td><Text size="xs">{check.assignments.map(item => item.agentName ?? item.agentId).join(" → ")}</Text></Table.Td>
                <Table.Td><Badge size="sm" variant="light">{check.executionMode}</Badge></Table.Td>
                <Table.Td><Badge size="sm" color={STATUS_COLORS[status]}>{status}</Badge></Table.Td>
                <Table.Td><Group gap={4}><EditActionIcon onClick={() => openEditCheck(check)} /><DeleteActionIcon onClick={() => setCheckDeleteTarget(check)} /></Group></Table.Td>
              </Table.Tr>;
            })}
            {checks.length === 0 && <Table.Tr><Table.Td colSpan={7}><Text ta="center" c="dimmed" py="xl">No monitoring checks yet.</Text></Table.Td></Table.Tr>}
          </Table.Tbody>
        </Table>
      </Card>

      <Modal opened={agentModalOpen} onClose={() => setAgentModalOpen(false)} title={editingAgent ? "Edit monitoring agent" : "Add monitoring agent"}>
        <Stack>
          <TextInput label="Name" required autoFocus value={agentForm.name} onChange={event => { const value = event.currentTarget.value; setAgentForm(current => ({ ...current, name: value })); }} />
          <NumberInput label="Heartbeat timeout (seconds)" min={15} max={3600} value={agentForm.heartbeatTimeoutSeconds} onChange={value => setAgentForm(current => ({ ...current, heartbeatTimeoutSeconds: Number(value) || 90 }))} />
          <Textarea label="Labels" description="One key=value entry per line." placeholder={'site=home\nnetwork=lan'} minRows={3} value={agentForm.labelsText} onChange={event => { const value = event.currentTarget.value; setAgentForm(current => ({ ...current, labelsText: value })); }} />
          {editingAgent && <Checkbox label="Enabled" checked={agentForm.enabled} onChange={event => { const checked = event.currentTarget.checked; setAgentForm(current => ({ ...current, enabled: checked })); }} />}
          <Group justify="flex-end"><Button variant="light" color="gray" onClick={() => setAgentModalOpen(false)}>Cancel</Button><Button loading={saveAgent.isPending} onClick={() => saveAgent.mutate()}>Save</Button></Group>
        </Stack>
      </Modal>

      <Modal opened={tokenInfo !== null} onClose={() => setTokenInfo(null)} title="Monitoring agent token" size="lg">
        <Stack>
          <Text size="sm">Copy this token now. SensorSphere stores only its hash and cannot display it again.</Text>
          <TextInput
            label="Token"
            readOnly
            value={tokenInfo?.token ?? ""}
            rightSection={
              <Tooltip label="Copy token">
                <ActionIcon
                  variant="subtle"
                  aria-label="Copy token"
                  onClick={() => tokenInfo && void writeClipboardText(tokenInfo.token)}
                >
                  ⧉
                </ActionIcon>
              </Tooltip>
            }
          />
          <Stack gap={4}>
            <Group justify="space-between" align="center">
              <Text size="sm" fw={500}>Agent environment variables</Text>
              <Tooltip label="Copy all environment variables">
                <ActionIcon
                  variant="subtle"
                  aria-label="Copy all environment variables"
                  onClick={() => tokenInfo && void writeClipboardText(`SENSORSPHERE_URL=https://<sensorsphere-host>\nSENSORSPHERE_AGENT_ID=${tokenInfo.agentName}\nSENSORSPHERE_AGENT_TOKEN=${tokenInfo.token}`)}
                >
                  ⧉
                </ActionIcon>
              </Tooltip>
            </Group>
            <Code block>{`SENSORSPHERE_URL=https://<sensorsphere-host>\nSENSORSPHERE_AGENT_ID=${tokenInfo?.agentName ?? "agent"}\nSENSORSPHERE_AGENT_TOKEN=${tokenInfo?.token ?? ""}`}</Code>
          </Stack>
          <Group justify="flex-end"><Button onClick={() => setTokenInfo(null)}>Close</Button></Group>
        </Stack>
      </Modal>

      <Modal opened={checkModalOpen} onClose={() => setCheckModalOpen(false)} title={editingCheck ? "Edit monitoring check" : "Add monitoring check"} size="lg">
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Select label="Device" required searchable data={(devicesQuery.data ?? []).map(device => ({ value: device.id, label: device.name })).sort((a, b) => a.label.localeCompare(b.label))} value={checkForm.deviceId} onChange={value => setCheckForm(current => ({ ...current, deviceId: value }))} />
            <TextInput label="Check name" required value={checkForm.name} onChange={event => { const value = event.currentTarget.value; setCheckForm(current => ({ ...current, name: value })); }} />
            <Select label="Check type" required data={["PING", "TCP", "HTTP", "HTTPS"]} value={checkForm.checkType} onChange={value => value && setCheckForm(current => ({ ...current, checkType: value as MonitoringCheckType, port: value === "PING" ? "" : current.port }))} allowDeselect={false} />
            <Select label="Target" required data={[{ value: "PRIMARY_IP", label: "Primary IP" }, { value: "PRIMARY_FQDN", label: "Primary FQDN/hostname" }, { value: "PRIMARY_ADDRESS", label: "Primary IP or FQDN" }, { value: "CUSTOM", label: "Custom" }]} value={checkForm.targetMode} onChange={value => value && setCheckForm(current => ({ ...current, targetMode: value as MonitoringTargetMode }))} allowDeselect={false} />
            {checkForm.targetMode === "CUSTOM" && <TextInput label="Custom target" required value={checkForm.targetValue} onChange={event => { const value = event.currentTarget.value; setCheckForm(current => ({ ...current, targetValue: value })); }} />}
            {checkForm.checkType !== "PING" && <NumberInput label="Port" min={1} max={65535} value={checkForm.port} onChange={value => setCheckForm(current => ({ ...current, port: value }))} />}
            {(checkForm.checkType === "HTTP" || checkForm.checkType === "HTTPS") && <TextInput label="Path" placeholder="/health" value={checkForm.path} onChange={event => { const value = event.currentTarget.value; setCheckForm(current => ({ ...current, path: value })); }} />}
            <NumberInput label="Interval (seconds)" min={5} value={checkForm.intervalSeconds} onChange={value => setCheckForm(current => ({ ...current, intervalSeconds: value }))} />
            <NumberInput label="Timeout (seconds)" min={1} value={checkForm.timeoutSeconds} onChange={value => setCheckForm(current => ({ ...current, timeoutSeconds: value }))} />
            <NumberInput label="Failures before DOWN" min={1} value={checkForm.failureThreshold} onChange={value => setCheckForm(current => ({ ...current, failureThreshold: value }))} />
            <NumberInput label="Successes before recovery" min={1} value={checkForm.recoveryThreshold} onChange={value => setCheckForm(current => ({ ...current, recoveryThreshold: value }))} />
            <Select label="Execution mode" required data={[{ value: "FAILOVER", label: "Failover (first healthy agent)" }, { value: "ALL", label: "All assigned agents" }]} value={checkForm.executionMode} onChange={value => value && setCheckForm(current => ({ ...current, executionMode: value as MonitoringExecutionMode }))} allowDeselect={false} />
          </SimpleGrid>
          <MultiSelect label="Monitoring agents" description={checkForm.executionMode === "FAILOVER" ? "Selection order defines failover priority." : "All selected agents execute this check."} required searchable data={agents.filter(agent => agent.enabled).map(agent => ({ value: agent.id, label: agent.name })).sort((a, b) => a.label.localeCompare(b.label))} value={checkForm.agentIds} onChange={value => setCheckForm(current => ({ ...current, agentIds: value }))} />
          <Checkbox label="Enabled" checked={checkForm.enabled} onChange={event => { const checked = event.currentTarget.checked; setCheckForm(current => ({ ...current, enabled: checked })); }} />
          <Group justify="flex-end"><Button variant="light" color="gray" onClick={() => setCheckModalOpen(false)}>Cancel</Button><Button loading={saveCheck.isPending} onClick={() => saveCheck.mutate()}>Save</Button></Group>
        </Stack>
      </Modal>

      <Modal opened={agentDeleteTarget !== null} onClose={() => setAgentDeleteTarget(null)} title="Delete monitoring agent" centered>
        <Stack><Text>Delete monitoring agent <b>{agentDeleteTarget?.name}</b>? Its check assignments and current results will also be removed.</Text><Group justify="flex-end"><Button variant="light" color="gray" onClick={() => setAgentDeleteTarget(null)}>Cancel</Button><Button color="red" variant="light" loading={removeAgent.isPending} onClick={() => agentDeleteTarget && removeAgent.mutate(agentDeleteTarget.id)}>Delete</Button></Group></Stack>
      </Modal>

      <Modal opened={checkDeleteTarget !== null} onClose={() => setCheckDeleteTarget(null)} title="Delete monitoring check" centered>
        <Stack><Text>Delete monitoring check <b>{checkDeleteTarget?.name}</b> for <b>{checkDeleteTarget?.deviceName}</b>?</Text><Group justify="flex-end"><Button variant="light" color="gray" onClick={() => setCheckDeleteTarget(null)}>Cancel</Button><Button color="red" variant="light" loading={removeCheck.isPending} onClick={() => checkDeleteTarget && removeCheck.mutate(checkDeleteTarget.id)}>Delete</Button></Group></Stack>
      </Modal>
    </Stack>
  );
}
