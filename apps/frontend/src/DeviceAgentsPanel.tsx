import React from "react";
import { ActionIcon, Badge, Button, Card, Checkbox, Code, Group, Modal, NumberInput, Select, Stack, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDeviceAgent, deleteDeviceAgent, getDeviceAgents, getDeviceDiscovery, regenerateDeviceAgentToken, startDeviceDiscovery, updateDeviceAgent } from "./api";
import type { DeviceAgent, DeviceDiscovery } from "./types";
import { DeleteActionIcon, EditActionIcon } from "./TableActionIcons";

interface AgentFormState {
  name: string;
  enabled: boolean;
  labelsText: string;
  heartbeatTimeoutSeconds: number;
}

const emptyForm = (): AgentFormState => ({ name: "", enabled: true, labelsText: "", heartbeatTimeoutSeconds: 60 });

function parseLabels(value: string): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const item of value.split(",").map(part => part.trim()).filter(Boolean)) {
    const separator = item.indexOf("=");
    if (separator > 0) labels[item.slice(0, separator).trim()] = item.slice(separator + 1).trim();
    else labels[item] = "true";
  }
  return labels;
}

function labelsText(agent: DeviceAgent): string {
  return Object.entries(agent.labels ?? {}).map(([key, value]) => value === "true" ? key : `${key}=${value}`).join(", ");
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


function discoveryValue(device: Record<string, unknown>, key: string): string {
  const value = device[key];
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "ON" : "OFF";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

export function DeviceAgentsPanel() {
  const queryClient = useQueryClient();
  const agentsQuery = useQuery({ queryKey: ["device-control", "agents"], queryFn: getDeviceAgents, refetchInterval: 10000 });
  const [opened, setOpened] = React.useState(false);
  const [editing, setEditing] = React.useState<DeviceAgent | null>(null);
  const [form, setForm] = React.useState<AgentFormState>(emptyForm());
  const [deleteTarget, setDeleteTarget] = React.useState<DeviceAgent | null>(null);
  const [tokenInfo, setTokenInfo] = React.useState<{ name: string; token: string } | null>(null);
  const [discoveryAgent, setDiscoveryAgent] = React.useState<DeviceAgent | null>(null);
  const [discoveryProvider, setDiscoveryProvider] = React.useState<string | null>(null);
  const [discoveryId, setDiscoveryId] = React.useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["device-control", "agents"] });
  const save = useMutation({
    mutationFn: async () => editing
      ? updateDeviceAgent(editing.id, { name: form.name.trim(), enabled: form.enabled, labels: parseLabels(form.labelsText), heartbeatTimeoutSeconds: form.heartbeatTimeoutSeconds })
      : createDeviceAgent({ name: form.name.trim(), labels: parseLabels(form.labelsText), heartbeatTimeoutSeconds: form.heartbeatTimeoutSeconds }),
    onSuccess: async result => {
      if (!editing && "token" in result) setTokenInfo({ name: result.agent.name, token: result.token });
      setOpened(false); setEditing(null); setForm(emptyForm()); await refresh();
    }
  });
  const remove = useMutation({ mutationFn: (id: string) => deleteDeviceAgent(id), onSuccess: async () => { setDeleteTarget(null); await refresh(); } });
  const regenerate = useMutation({ mutationFn: (agent: DeviceAgent) => regenerateDeviceAgentToken(agent.id), onSuccess: async result => { setTokenInfo({ name: result.agent.name, token: result.token }); await refresh(); } });
  const discoveryMutation = useMutation({
    mutationFn: ({ agentId, provider }: { agentId: string; provider: string }) => startDeviceDiscovery(agentId, provider),
    onSuccess: result => setDiscoveryId(result.commandId)
  });
  const discoveryQuery = useQuery<DeviceDiscovery>({
    queryKey: ["device-control", "discovery", discoveryId],
    queryFn: () => getDeviceDiscovery(discoveryId!),
    enabled: discoveryId != null,
    refetchInterval: query => query.state.data?.status === "SENT" ? 500 : false
  });

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setOpened(true); };
  const openEdit = (agent: DeviceAgent) => { setEditing(agent); setForm({ name: agent.name, enabled: agent.enabled, labelsText: labelsText(agent), heartbeatTimeoutSeconds: agent.heartbeatTimeoutSeconds }); setOpened(true); };
  const openCopy = (agent: DeviceAgent) => { setEditing(null); setForm({ name: `${agent.name} (copy)`, enabled: true, labelsText: labelsText(agent), heartbeatTimeoutSeconds: agent.heartbeatTimeoutSeconds }); setOpened(true); };
  const openDiscovery = (agent: DeviceAgent) => {
    const providers = agent.capabilities.filter(capability => capability.discovery).map(capability => capability.provider);
    setDiscoveryAgent(agent);
    setDiscoveryProvider(providers[0] ?? null);
    setDiscoveryId(null);
  };
  const closeDiscovery = () => {
    setDiscoveryAgent(null);
    setDiscoveryProvider(null);
    setDiscoveryId(null);
    discoveryMutation.reset();
  };

  const sensorsphereUrl = typeof window === "undefined" ? "" : window.location.origin;
  const agentEnvironment = tokenInfo
    ? `SENSORSPHERE_URL=${sensorsphereUrl}\nSENSORSPHERE_DEVICE_AGENT_TOKEN=${tokenInfo.token}`
    : "";

  return <Stack gap="md">
    <Group justify="space-between"><div><Text fw={600}>Device Agents</Text><Text size="xs" c="dimmed">Outbound WebSocket agents used for discovery and interactive device control.</Text></div><Button onClick={openCreate}>Add Device Agent</Button></Group>
    <Card withBorder padding={0}>
      <div style={{ overflow: "auto", maxHeight: 420 }}><Table striped highlightOnHover stickyHeader style={{ minWidth: 850 }}>
        <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Status</Table.Th><Table.Th>Reported</Table.Th><Table.Th>Version</Table.Th><Table.Th>Capabilities</Table.Th><Table.Th>Labels</Table.Th><Table.Th style={{ width: 144, textAlign: "right" }}>Actions</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>{(agentsQuery.data ?? []).map(agent => <Table.Tr key={agent.id}>
          <Table.Td><Text size="sm" fw={600}>{agent.name}</Text><Text size="xs" c="dimmed">{agent.hostname ?? "—"}</Text></Table.Td>
          <Table.Td><Badge color={agent.online ? "green" : agent.enabled ? "gray" : "red"} variant="light">{agent.online ? "ONLINE" : agent.enabled ? "OFFLINE" : "DISABLED"}</Badge></Table.Td>
          <Table.Td><Text size="sm">{agent.reportedName ?? "—"}</Text></Table.Td>
          <Table.Td><Text size="sm">{agent.version ?? "—"}</Text></Table.Td>
          <Table.Td><Group gap={4}>{agent.capabilities.length ? agent.capabilities.map(item => <Tooltip key={item.provider} label={`${item.actions.join(", ") || "No actions reported"}${item.discovery ? " · discovery" : ""}`}><Badge variant="outline">{item.provider}</Badge></Tooltip>) : <Text size="sm" c="dimmed">—</Text>}</Group></Table.Td>
          <Table.Td><Text size="xs">{[...agent.agentLabels, ...Object.entries(agent.labels).map(([key,value]) => value === "true" ? key : `${key}=${value}`)].join(", ") || "—"}</Text></Table.Td>
          <Table.Td><Group gap={4} wrap="nowrap" justify="flex-end"><EditActionIcon onClick={() => openEdit(agent)} /><Tooltip label="Copy device agent"><ActionIcon size="sm" variant="light" color="green" aria-label="Copy device agent" onClick={() => openCopy(agent)}>⧉</ActionIcon></Tooltip><Tooltip label={agent.online ? "Discover devices" : "Device Agent must be online to discover"}><ActionIcon size="sm" variant="light" color="cyan" aria-label="Discover devices" disabled={!agent.online || !agent.capabilities.some(capability => capability.discovery)} onClick={() => openDiscovery(agent)}>⌖</ActionIcon></Tooltip><Tooltip label="Regenerate agent token"><ActionIcon size="sm" variant="light" color="orange" aria-label="Regenerate agent token" onClick={() => regenerate.mutate(agent)}>↻</ActionIcon></Tooltip><DeleteActionIcon onClick={() => setDeleteTarget(agent)} /></Group></Table.Td>
        </Table.Tr>)}{(agentsQuery.data ?? []).length === 0 && <Table.Tr><Table.Td colSpan={7}><Text ta="center" c="dimmed" py="xl">No Device Agents yet.</Text></Table.Td></Table.Tr>}</Table.Tbody>
      </Table></div>
    </Card>

    <Modal opened={opened} onClose={() => setOpened(false)} title={editing ? "Edit Device Agent" : "Add Device Agent"} centered>
      <Stack><TextInput data-autofocus label="Name" required value={form.name} onChange={event => { const value = event.currentTarget.value; setForm(current => ({ ...current, name: value })); }} />
        <TextInput label="Managed labels" description="Comma separated. key=value or simple labels." value={form.labelsText} onChange={event => { const value = event.currentTarget.value; setForm(current => ({ ...current, labelsText: value })); }} />
        <NumberInput label="Heartbeat timeout (seconds)" min={15} max={3600} value={form.heartbeatTimeoutSeconds} onChange={value => setForm(current => ({ ...current, heartbeatTimeoutSeconds: Number(value) || 60 }))} />
        {editing && <Checkbox label="Enabled" checked={form.enabled} onChange={event => { const checked = event.currentTarget.checked; setForm(current => ({ ...current, enabled: checked })); }} />}
        <Group justify="flex-end"><Button variant="default" onClick={() => setOpened(false)}>Cancel</Button><Button disabled={!form.name.trim()} loading={save.isPending} onClick={() => save.mutate()}>Save</Button></Group>
      </Stack>
    </Modal>

    <Modal opened={!!discoveryAgent} onClose={closeDiscovery} title={`Discover devices${discoveryAgent ? ` — ${discoveryAgent.name}` : ""}`} size="xl" centered>
      <Stack>
        <Group align="flex-end">
          <Select
            label="Provider"
            value={discoveryProvider}
            onChange={setDiscoveryProvider}
            data={(discoveryAgent?.capabilities ?? []).filter(capability => capability.discovery).map(capability => ({ value: capability.provider, label: capability.provider }))}
            style={{ flex: 1 }}
          />
          <Button
            loading={discoveryMutation.isPending || discoveryQuery.data?.status === "SENT"}
            disabled={!discoveryProvider || !discoveryAgent?.online}
            onClick={() => discoveryAgent && discoveryProvider && discoveryMutation.mutate({ agentId: discoveryAgent.id, provider: discoveryProvider })}
          >
            Scan
          </Button>
        </Group>
        {discoveryMutation.isError && <Text c="red" size="sm">{discoveryMutation.error instanceof Error ? discoveryMutation.error.message : "Unable to start discovery"}</Text>}
        {discoveryQuery.data?.error && <Text c="red" size="sm">{discoveryQuery.data.error}</Text>}
        {discoveryQuery.data?.status === "SENT" && <Text size="sm" c="dimmed">Discovery is running on the Device Agent…</Text>}
        {discoveryQuery.data?.status === "SUCCESS" && discoveryQuery.data.devices.length === 0 && <Text size="sm" c="dimmed">No devices found.</Text>}
        {discoveryQuery.data?.devices?.length ? (
          <div style={{ overflow: "auto", maxHeight: 420 }}>
            <Table striped highlightOnHover stickyHeader style={{ minWidth: 760 }}>
              <Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>IP</Table.Th><Table.Th>Model</Table.Th><Table.Th>Power</Table.Th><Table.Th>Brightness</Table.Th><Table.Th>ID</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>{discoveryQuery.data.devices.map((device, index) => <Table.Tr key={`${discoveryValue(device, "id")}-${index}`}>
                <Table.Td>{discoveryValue(device, "name")}</Table.Td>
                <Table.Td><Text ff="monospace" size="sm">{discoveryValue(device, "ip")}</Text></Table.Td>
                <Table.Td>{discoveryValue(device, "model")}</Table.Td>
                <Table.Td>{discoveryValue(device, "power")}</Table.Td>
                <Table.Td>{discoveryValue(device, "brightness")}</Table.Td>
                <Table.Td><Text ff="monospace" size="xs">{discoveryValue(device, "id")}</Text></Table.Td>
              </Table.Tr>)}</Table.Tbody>
            </Table>
          </div>
        ) : null}
        <Group justify="flex-end"><Button variant="default" onClick={closeDiscovery}>Close</Button></Group>
      </Stack>
    </Modal>

    <Modal opened={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Device Agent?" centered>
      <Stack><Text>Delete <strong>{deleteTarget?.name}</strong>? Devices assigned to it will keep their provider but lose the Device Agent association.</Text><Group justify="flex-end"><Button variant="default" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button color="red" loading={remove.isPending} onClick={() => deleteTarget && remove.mutate(deleteTarget.id)}>Delete</Button></Group></Stack>
    </Modal>

    <Modal opened={!!tokenInfo} onClose={() => setTokenInfo(null)} title="Device Agent token" size="lg">
      <Stack>
        <Text size="sm">Copy this token now. SensorSphere stores only its hash and cannot display it again.</Text>
        <TextInput
          label="Token"
          readOnly
          value={tokenInfo?.token ?? ""}
          styles={{ input: { fontFamily: "monospace" } }}
          rightSection={
            <Tooltip label="Copy token">
              <ActionIcon
                color="green"
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
            <Tooltip label="Copy SensorSphere URL and token">
              <ActionIcon
                color="green"
                variant="subtle"
                aria-label="Copy SensorSphere URL and token"
                onClick={() => tokenInfo && void writeClipboardText(agentEnvironment)}
              >
                ⧉
              </ActionIcon>
            </Tooltip>
          </Group>
          <Code block>{agentEnvironment}</Code>
        </Stack>
        <Group justify="flex-end"><Button onClick={() => setTokenInfo(null)}>Close</Button></Group>
      </Stack>
    </Modal>
  </Stack>;
}
