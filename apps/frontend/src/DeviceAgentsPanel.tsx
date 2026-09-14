import React from "react";
import { ActionIcon, Badge, Button, Card, Checkbox, Code, Group, Modal, Notification, NumberInput, Select, Stack, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDeviceAgent, deleteDeviceAgent, getDeviceAgents, getDeviceDiscovery, getDiscoveredDeviceAction, regenerateDeviceAgentToken, startDeviceDiscovery, startDiscoveredDeviceAction, updateDeviceAgent } from "./api";
import type { DeviceAgent, DeviceDiscovery, DeviceRegistryDevice, DiscoveredDeviceAction } from "./types";
import { DeleteActionIcon, EditActionIcon } from "./TableActionIcons";



function RadarIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.6" opacity="0.8" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <path d="M12 12L18.5 6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 3v2M21 12h-2M12 21v-2M3 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export interface DiscoveredDeviceImportRequest {
  agent: DeviceAgent;
  provider: string;
  device: Record<string, unknown>;
}

interface DeviceAgentsPanelProps {
  devices?: DeviceRegistryDevice[];
  onImportDiscoveredDevice?: (request: DiscoveredDeviceImportRequest) => void;
  onUpdateDiscoveredDevice?: (request: DiscoveredDeviceImportRequest, device: DeviceRegistryDevice) => Promise<void>;
  onOpenRegisteredDevice?: (device: DeviceRegistryDevice) => void;
}

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

function normalizeMac(value: unknown): string {
  return typeof value === "string" ? value.toUpperCase().replace(/[^0-9A-F]/g, "") : "";
}

function normalizeYeelightId(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function discoveredDeviceKey(device: Record<string, unknown>): string {
  return normalizeMac(device.mac)
    || normalizeYeelightId(device.id)
    || (typeof device.hostname === "string" ? device.hostname.trim().toLowerCase() : "")
    || (typeof device.ip === "string" ? device.ip.trim() : "");
}

function ipv4SortValue(value: unknown): number[] | null {
  if (typeof value !== "string") return null;
  const parts = value.trim().split(".");
  if (parts.length !== 4) return null;
  const numbers = parts.map(part => Number(part));
  if (numbers.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return numbers;
}


function discoveryNeedsRegistryUpdate(
  discovered: Record<string, unknown>,
  registered: DeviceRegistryDevice,
  agent: DeviceAgent | null,
  provider: string | null
): boolean {
  const providerName = provider?.toUpperCase() ?? "";
  const ip = typeof discovered.ip === "string" ? discovered.ip.trim() : "";
  const mac = normalizeMac(discovered.mac);
  const hostname = typeof discovered.hostname === "string" ? discovered.hostname.trim().toLowerCase() : "";
  const model = typeof discovered.model === "string" ? discovered.model.trim() : "";
  const firmwareVersion = typeof discovered.firmwareVersion === "string" ? discovered.firmwareVersion.trim() : "";

  const hasIdentity = (type: string, predicate: (value: string) => boolean) =>
    registered.identities.some(identity => identity.identityType.toUpperCase() === type && predicate(identity.value));

  if (providerName === "YEELIGHT") {
    const yeelightId = normalizeYeelightId(discovered.id);
    if (yeelightId && !hasIdentity("YEELIGHT_ID", value => normalizeYeelightId(value) === yeelightId)) return true;
    if ((registered.manufacturer ?? "").trim().toLowerCase() !== "yeelight") return true;
  } else if (providerName === "ESPHOME") {
    if (hostname && !registered.identities.some(identity =>
      ["FQDN", "HOSTNAME"].includes(identity.identityType.toUpperCase())
      && identity.value.trim().toLowerCase() === hostname
    )) return true;
    if ((registered.manufacturer ?? "").trim().toLowerCase() !== "esphome") return true;
  }

  if (mac && !hasIdentity("MAC", value => normalizeMac(value) === mac)) return true;
  if (ip && !hasIdentity("IP", value => value.trim() === ip)) return true;
  if (model && (registered.model ?? "").trim() !== model) return true;
  if (firmwareVersion && (registered.firmwareVersion ?? "").trim() !== firmwareVersion) return true;
  if (agent && registered.controlAgent?.id !== agent.id) return true;
  if (provider && registered.controlProvider?.toUpperCase() !== providerName) return true;
  if (provider && !registered.technologies.some(item => item.code.toLowerCase() === provider.toLowerCase())) return true;
  return false;
}

function compareDiscoveryIp(left: Record<string, unknown>, right: Record<string, unknown>): number {
  const leftIp = ipv4SortValue(left.ip);
  const rightIp = ipv4SortValue(right.ip);
  if (leftIp && rightIp) {
    for (let index = 0; index < 4; index += 1) {
      const difference = leftIp[index]! - rightIp[index]!;
      if (difference !== 0) return difference;
    }
    return 0;
  }
  return discoveryValue(left, "ip").localeCompare(discoveryValue(right, "ip"), undefined, { numeric: true });
}

export function DeviceAgentsPanel({ devices = [], onImportDiscoveredDevice, onUpdateDiscoveredDevice, onOpenRegisteredDevice }: DeviceAgentsPanelProps = {}) {
  const [copyNotice, setCopyNotice] = React.useState<string | null>(null);

  const showCopyNotice = React.useCallback((message: string) => {
    setCopyNotice(message);
    window.setTimeout(() => setCopyNotice(current => current === message ? null : current), 2200);
  }, []);
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
  const [setNameTarget, setSetNameTarget] = React.useState<Record<string, unknown> | null>(null);
  const [setNameValue, setSetNameValue] = React.useState("");
  const [discoveredActionId, setDiscoveredActionId] = React.useState<string | null>(null);
  const [powerActionTarget, setPowerActionTarget] = React.useState<Record<string, unknown> | null>(null);
  const [powerAction, setPowerAction] = React.useState<"POWER_ON" | "POWER_OFF" | null>(null);
  const [discoveredDevices, setDiscoveredDevices] = React.useState<Array<Record<string, unknown>>>([]);

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
  React.useEffect(() => {
    if (discoveryQuery.data?.status !== "SUCCESS") return;
    setDiscoveredDevices([...discoveryQuery.data.devices].sort(compareDiscoveryIp));
  }, [discoveryQuery.data?.status, discoveryQuery.data?.devices]);

  const setNameMutation = useMutation({
    mutationFn: async () => {
      if (!discoveryAgent || !discoveryProvider || !setNameTarget) throw new Error("Discovery context is no longer available");
      return startDiscoveredDeviceAction(
        discoveryAgent.id,
        discoveryProvider,
        "SET_NAME",
        setNameTarget,
        { name: setNameValue.trim() }
      );
    },
    onSuccess: result => setDiscoveredActionId(result.commandId)
  });
  const powerMutation = useMutation({
    mutationFn: async ({ device, action }: { device: Record<string, unknown>; action: "POWER_ON" | "POWER_OFF" }) => {
      if (!discoveryAgent || !discoveryProvider) throw new Error("Discovery context is no longer available");
      setPowerActionTarget(device);
      setPowerAction(action);
      return startDiscoveredDeviceAction(discoveryAgent.id, discoveryProvider, action, device);
    },
    onSuccess: result => setDiscoveredActionId(result.commandId)
  });
  const updateRegisteredMutation = useMutation({
    mutationFn: async ({ request, registered }: { request: DiscoveredDeviceImportRequest; registered: DeviceRegistryDevice }) => {
      if (!onUpdateDiscoveredDevice) throw new Error("Update callback is not available");
      await onUpdateDiscoveredDevice(request, registered);
    }
  });
  const discoveredActionQuery = useQuery<DiscoveredDeviceAction>({
    queryKey: ["device-control", "discovered-action", discoveredActionId],
    queryFn: () => getDiscoveredDeviceAction(discoveredActionId!),
    enabled: discoveredActionId != null,
    refetchInterval: query => query.state.data?.status === "SENT" ? 300 : false
  });

  React.useEffect(() => {
    const completedAction = discoveredActionQuery.data;
    if (completedAction?.status !== "SUCCESS") return;

    const targetKey = discoveredDeviceKey(completedAction.target);
    const result = completedAction.result ?? {};
    setDiscoveredDevices(current => current
      .map(device => discoveredDeviceKey(device) === targetKey ? { ...device, ...result } : device)
      .sort(compareDiscoveryIp));

    setSetNameTarget(null);
    setSetNameValue("");
    setPowerActionTarget(null);
    setPowerAction(null);
    setDiscoveredActionId(null);
    setNameMutation.reset();
    powerMutation.reset();
  }, [discoveredActionQuery.data?.status, discoveredActionQuery.data?.commandId]);

  const openCreate = () => { setEditing(null); setForm(emptyForm()); setOpened(true); };
  const openEdit = (agent: DeviceAgent) => { setEditing(agent); setForm({ name: agent.name, enabled: agent.enabled, labelsText: labelsText(agent), heartbeatTimeoutSeconds: agent.heartbeatTimeoutSeconds }); setOpened(true); };
  const openCopy = (agent: DeviceAgent) => { setEditing(null); setForm({ name: `${agent.name} (copy)`, enabled: true, labelsText: labelsText(agent), heartbeatTimeoutSeconds: agent.heartbeatTimeoutSeconds }); setOpened(true); };
  const openDiscovery = (agent: DeviceAgent) => {
    const providers = agent.capabilities.filter(capability => capability.discovery).map(capability => capability.provider);
    setDiscoveryAgent(agent);
    setDiscoveryProvider(providers[0] ?? null);
    setDiscoveryId(null);
    setDiscoveredDevices([]);
  };
  const closeDiscovery = () => {
    setDiscoveryAgent(null);
    setDiscoveryProvider(null);
    setDiscoveryId(null);
    setSetNameTarget(null);
    setSetNameValue("");
    setDiscoveredActionId(null);
    setPowerActionTarget(null);
    setPowerAction(null);
    setDiscoveredDevices([]);
    discoveryMutation.reset();
    setNameMutation.reset();
    powerMutation.reset();
  };

  const sensorsphereUrl = typeof window === "undefined" ? "" : window.location.origin;
  const agentEnvironment = tokenInfo
    ? `SENSORSPHERE_URL=${sensorsphereUrl}\nSENSORSPHERE_DEVICE_AGENT_TOKEN=${tokenInfo.token}`
    : "";


  const registeredDeviceFor = (device: Record<string, unknown>): DeviceRegistryDevice | null => {
    const provider = discoveryProvider?.toUpperCase();
    const mac = normalizeMac(device.mac);
    const yeelightId = normalizeYeelightId(device.id);
    const hostname = typeof device.hostname === "string" ? device.hostname.trim().toLowerCase() : "";

    return devices.find(existing => {
      const macMatch = mac && existing.identities.some(identity =>
        identity.identityType.toUpperCase() === "MAC"
        && normalizeMac(identity.value) === mac
      );
      if (provider === "ESPHOME") {
        const hostnameMatch = hostname && existing.identities.some(identity =>
          ["FQDN", "HOSTNAME"].includes(identity.identityType.toUpperCase())
          && identity.value.trim().toLowerCase() === hostname
        );
        return Boolean(macMatch || hostnameMatch);
      }
      const idMatch = yeelightId && (
        existing.identities.some(identity =>
          identity.identityType.toUpperCase() === "YEELIGHT_ID"
          && normalizeYeelightId(identity.value) === yeelightId
        )
        || (existing.description ?? "").toLowerCase().includes(yeelightId)
      );
      return Boolean(idMatch || macMatch);
    }) ?? null;
  };

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
          <Table.Td><Group gap={10} wrap="nowrap" justify="flex-end"><Tooltip label={agent.online ? "Discover devices" : "Device Agent must be online to discover"}><ActionIcon size="sm" variant="light" color="cyan" aria-label="Discover devices" disabled={!agent.online || !agent.capabilities.some(capability => capability.discovery)} onClick={() => openDiscovery(agent)}><RadarIcon size={16} /></ActionIcon></Tooltip><Group gap={4} wrap="nowrap"><EditActionIcon onClick={() => openEdit(agent)} /><Tooltip label="Copy device agent"><ActionIcon size="sm" variant="light" color="green" aria-label="Copy device agent" onClick={() => openCopy(agent)}>⧉</ActionIcon></Tooltip><Tooltip label="Regenerate agent token"><ActionIcon size="sm" variant="light" color="orange" aria-label="Regenerate agent token" onClick={() => regenerate.mutate(agent)}>↻</ActionIcon></Tooltip><DeleteActionIcon onClick={() => setDeleteTarget(agent)} /></Group></Group></Table.Td>
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

    <Modal opened={!!discoveryAgent} onClose={closeDiscovery} title={`Discover devices${discoveryAgent ? ` — ${discoveryAgent.name}` : ""}`} size={1035} centered>
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
        {updateRegisteredMutation.isError && <Text c="red" size="sm">{updateRegisteredMutation.error instanceof Error ? updateRegisteredMutation.error.message : "Unable to update registered device"}</Text>}
        {discoveryQuery.data?.status === "SENT" && <Text size="sm" c="dimmed">Discovery is running on the Device Agent…</Text>}
        {discoveryQuery.data?.status === "SUCCESS" && discoveredDevices.length === 0 && <Text size="sm" c="dimmed">No devices found.</Text>}
        {discoveredDevices.length ? (
          <div style={{ overflow: "auto", maxHeight: 420 }}>
            <Table striped highlightOnHover stickyHeader style={{ minWidth: 760 }}>
              <Table.Thead><Table.Tr><Table.Th>Actions</Table.Th><Table.Th>Registry</Table.Th><Table.Th>Name</Table.Th><Table.Th>IP</Table.Th><Table.Th>Model</Table.Th><Table.Th>Power</Table.Th><Table.Th>Brightness</Table.Th><Table.Th>Entities</Table.Th><Table.Th>ID</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>{discoveredDevices.map((device, index) => {
                const registeredDevice = registeredDeviceFor(device);
                const isYeelight = discoveryProvider?.toUpperCase() === "YEELIGHT";
                const isEspHome = discoveryProvider?.toUpperCase() === "ESPHOME";
                const power = device.power === true;
                const needsUpdate = registeredDevice ? discoveryNeedsRegistryUpdate(device, registeredDevice, discoveryAgent, discoveryProvider) : false;
                const updatingThisDevice = updateRegisteredMutation.isPending && updateRegisteredMutation.variables?.registered.id === registeredDevice?.id;
                const actionBusy = discoveredActionQuery.data?.status === "SENT" || setNameMutation.isPending || powerMutation.isPending || updatingThisDevice;
                return <Table.Tr key={`${discoveryValue(device, "id")}-${index}`}>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <Tooltip label="Set name">
                      <ActionIcon
                        size="sm"
                        variant="light"
                        color="blue"
                        aria-label="Set name"
                        disabled={!isYeelight || discoveryValue(device, "ip") === "—" || actionBusy}
                        onClick={() => {
                          setSetNameTarget(device);
                          const currentName = discoveryValue(device, "name");
                          setSetNameValue(currentName === "—" ? "" : currentName);
                          setDiscoveredActionId(null);
                          setNameMutation.reset();
                        }}
                      >
                        ✎
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label={power ? "Turn off to identify device" : "Turn on to identify device"}>
                      <ActionIcon
                        size="sm"
                        variant="light"
                        color={power ? "orange" : "green"}
                        aria-label={power ? "Turn off" : "Turn on"}
                        loading={discoveredDeviceKey(powerActionTarget ?? {}) === discoveredDeviceKey(device) && powerMutation.isPending}
                        disabled={!isYeelight || discoveryValue(device, "ip") === "—" || actionBusy}
                        onClick={() => powerMutation.mutate({ device, action: power ? "POWER_OFF" : "POWER_ON" })}
                      >
                        ⏻
                      </ActionIcon>
                    </Tooltip>
                    {registeredDevice ? (
                      <>
                        {needsUpdate && (
                          <Tooltip label="Update registered device from discovery">
                            <ActionIcon
                              size="sm"
                              variant="light"
                              color="cyan"
                              aria-label="Update registered device"
                              loading={updatingThisDevice}
                              disabled={!onUpdateDiscoveredDevice || !discoveryAgent || !discoveryProvider}
                              onClick={() => discoveryAgent && discoveryProvider && updateRegisteredMutation.mutate({
                                request: { agent: discoveryAgent, provider: discoveryProvider, device },
                                registered: registeredDevice
                              })}
                            >
                              ↻
                            </ActionIcon>
                          </Tooltip>
                        )}
                        <EditActionIcon onClick={() => onOpenRegisteredDevice?.(registeredDevice)} />
                      </>
                    ) : (
                      <Tooltip label="Add to Device Registry">
                        <ActionIcon
                          size="sm"
                          variant="light"
                          color="cyan"
                          aria-label="Add to Device Registry"
                          disabled={!onImportDiscoveredDevice}
                          onClick={() => discoveryAgent && discoveryProvider && onImportDiscoveredDevice?.({ agent: discoveryAgent, provider: discoveryProvider, device })}
                        >
                          ＋
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>{registeredDevice ? <Badge size="sm" variant="light" color={needsUpdate ? "orange" : "green"}>{needsUpdate ? "Needs update" : "Registered"}</Badge> : <Badge size="sm" variant="light" color="gray">New</Badge>}</Table.Td>
                <Table.Td>{discoveryValue(device, "name")}</Table.Td>
                <Table.Td><Text ff="monospace" size="sm">{discoveryValue(device, "ip")}</Text></Table.Td>
                <Table.Td>{discoveryValue(device, "model")}</Table.Td>
                <Table.Td>{discoveryValue(device, "power")}</Table.Td>
                <Table.Td>{discoveryValue(device, "brightness")}</Table.Td>
                <Table.Td><Text size="xs">{isEspHome ? discoveryValue(device, "entities") : "—"}</Text></Table.Td>
                <Table.Td><Text ff="monospace" size="xs">{discoveryValue(device, "id")}</Text></Table.Td>
              </Table.Tr>;
              })}</Table.Tbody>
            </Table>
          </div>
        ) : null}
        <Group justify="flex-end"><Button variant="default" onClick={closeDiscovery}>Close</Button></Group>
      </Stack>
    </Modal>

    <Modal
      opened={!!setNameTarget}
      onClose={() => { setSetNameTarget(null); setDiscoveredActionId(null); setNameMutation.reset(); }}
      title="Set Yeelight name"
      centered
    >
      <Stack>
        <Text size="sm" c="dimmed">{discoveryValue(setNameTarget ?? {}, "ip")}</Text>
        <TextInput
          data-autofocus
          label="Name"
          required
          maxLength={64}
          value={setNameValue}
          onChange={event => setSetNameValue(event.currentTarget.value)}
        />
        {setNameMutation.isError && <Text c="red" size="sm">{setNameMutation.error instanceof Error ? setNameMutation.error.message : "Unable to set name"}</Text>}
        {discoveredActionQuery.data?.status === "FAILED" && <Text c="red" size="sm">{discoveredActionQuery.data.error ?? "Unable to set name"}</Text>}
        {discoveredActionQuery.data?.status === "TIMEOUT" && <Text c="red" size="sm">Set name timed out.</Text>}
        <Group justify="flex-end">
          <Button variant="default" onClick={() => { setSetNameTarget(null); setDiscoveredActionId(null); setNameMutation.reset(); }}>Cancel</Button>
          <Button
            loading={setNameMutation.isPending || discoveredActionQuery.data?.status === "SENT"}
            disabled={!setNameValue.trim() || setNameValue.trim().length > 64}
            onClick={() => setNameMutation.mutate()}
          >
            Set name
          </Button>
        </Group>
      </Stack>
    </Modal>

    <Modal opened={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Device Agent?" centered>
      <Stack><Text>Delete <strong>{deleteTarget?.name}</strong>? Devices assigned to it will keep their provider but lose the Device Agent association.</Text><Group justify="flex-end"><Button variant="default" onClick={() => setDeleteTarget(null)}>Cancel</Button><Button color="red" loading={remove.isPending} onClick={() => deleteTarget && remove.mutate(deleteTarget.id)}>Delete</Button></Group></Stack>
    </Modal>

    {copyNotice && (
      <Notification color="green" title="Copied" onClose={() => setCopyNotice(null)} style={{ position: "fixed", right: 20, bottom: 20, zIndex: 10000, width: 320 }}>
        {copyNotice}
      </Notification>
    )}

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
                onClick={() => { if (!tokenInfo) return; void writeClipboardText(tokenInfo.token).then(() => showCopyNotice("Token copied to clipboard")); }}
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
                onClick={() => { if (!tokenInfo) return; void writeClipboardText(agentEnvironment).then(() => showCopyNotice("Agent environment copied to clipboard")); }}
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
