import React from "react";
import { ActionIcon, Badge, Button, Card, Group, Select, SimpleGrid, Stack, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDeviceAgents, getDeviceDiscoveries, startDeviceDiscovery } from "./api";
import type { DeviceAgent, DeviceDiscovery, DeviceRegistryDevice } from "./types";
import type { DiscoveredDeviceImportRequest } from "./DeviceAgentsPanel";
import { EditActionIcon } from "./TableActionIcons";
import { ResetFiltersAction } from "./ResetFiltersAction";
import { activeFilterStyles } from "./ActiveFilterStyles";

const DISCOVERY_PROVIDERS = ["YEELIGHT", "ESPHOME"] as const;
type DiscoveryProvider = typeof DISCOVERY_PROVIDERS[number];

interface DeviceDiscoveryPanelProps {
  devices: DeviceRegistryDevice[];
  onImportDiscoveredDevice: (request: DiscoveredDeviceImportRequest) => void;
  onUpdateDiscoveredDevice: (request: DiscoveredDeviceImportRequest, device: DeviceRegistryDevice) => Promise<void>;
  onOpenRegisteredDevice: (device: DeviceRegistryDevice) => void;
}

function normalizeMac(value: unknown): string {
  return typeof value === "string" ? value.toUpperCase().replace(/[^0-9A-F]/g, "") : "";
}

function normalizeYeelightId(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function textValue(device: Record<string, unknown>, key: string): string {
  const value = device[key];
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "ON" : "OFF";
  return String(value);
}

function registeredDeviceFor(provider: string, discovered: Record<string, unknown>, devices: DeviceRegistryDevice[]): DeviceRegistryDevice | null {
  const normalizedProvider = provider.toUpperCase();
  const mac = normalizeMac(discovered.mac);
  const yeelightId = normalizeYeelightId(discovered.id);
  const hostname = typeof discovered.hostname === "string" ? discovered.hostname.trim().toLowerCase() : "";

  return devices.find(existing => {
    const macMatch = Boolean(mac) && existing.identities.some(identity =>
      identity.identityType.toUpperCase() === "MAC" && normalizeMac(identity.value) === mac
    );
    if (normalizedProvider === "ESPHOME") {
      const hostnameMatch = Boolean(hostname) && existing.identities.some(identity =>
        ["FQDN", "HOSTNAME"].includes(identity.identityType.toUpperCase())
        && identity.value.trim().toLowerCase() === hostname
      );
      return Boolean(macMatch || hostnameMatch);
    }
    const idMatch = Boolean(yeelightId) && existing.identities.some(identity =>
      identity.identityType.toUpperCase() === "YEELIGHT_ID"
      && normalizeYeelightId(identity.value) === yeelightId
    );
    return Boolean(idMatch || macMatch);
  }) ?? null;
}

function discoveryNeedsRegistryUpdate(
  provider: string,
  discovered: Record<string, unknown>,
  registered: DeviceRegistryDevice,
  agent: DeviceAgent | null
): boolean {
  const providerName = provider.toUpperCase();
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
  if (registered.controlProvider?.toUpperCase() !== providerName) return true;
  if (!registered.technologies.some(item => item.code.toUpperCase() === providerName)) return true;
  return false;
}

function providerColor(provider: string): string {
  return provider.toUpperCase() === "YEELIGHT" ? "yellow" : "green";
}

export function DeviceDiscoveryPanel({ devices, onImportDiscoveredDevice, onUpdateDiscoveredDevice, onOpenRegisteredDevice }: DeviceDiscoveryPanelProps) {
  const queryClient = useQueryClient();
  const [providerFilter, setProviderFilter] = React.useState<string | null>(null);
  const [agentFilter, setAgentFilter] = React.useState<string | null>(null);
  const [textFilter, setTextFilter] = React.useState("");
  const [updateKey, setUpdateKey] = React.useState<string | null>(null);

  const agentsQuery = useQuery({ queryKey: ["device-agents"], queryFn: getDeviceAgents, refetchInterval: 5000 });
  const discoveriesQuery = useQuery({
    queryKey: ["device-discoveries"],
    queryFn: getDeviceDiscoveries,
    refetchInterval: query => (query.state.data?.some(item => item.status === "SENT") ? 1000 : 5000)
  });

  const scanMutation = useMutation({
    mutationFn: async (provider: DiscoveryProvider | "ALL") => {
      const agents = agentsQuery.data ?? [];
      const providers = provider === "ALL" ? [...DISCOVERY_PROVIDERS] : [provider];
      const requests: Promise<unknown>[] = [];
      for (const agent of agents) {
        if (!agent.online || !agent.enabled) continue;
        for (const currentProvider of providers) {
          const capability = agent.capabilities.find(item => item.provider.toUpperCase() === currentProvider && item.discovery);
          if (capability) requests.push(startDeviceDiscovery(agent.id, currentProvider));
        }
      }
      if (!requests.length) throw new Error(`No online Device Agent can discover ${provider === "ALL" ? "Yeelight or ESPHome devices" : provider}`);
      const settled = await Promise.allSettled(requests);
      const failed = settled.filter(item => item.status === "rejected");
      if (failed.length === settled.length) throw new Error("Unable to start discovery on the available Device Agents");
      return settled;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["device-discoveries"] })
  });

  const updateMutation = useMutation({
    mutationFn: async ({ request, registered, key }: { request: DiscoveredDeviceImportRequest; registered: DeviceRegistryDevice; key: string }) => {
      setUpdateKey(key);
      await onUpdateDiscoveredDevice(request, registered);
    },
    onSettled: () => setUpdateKey(null)
  });

  const agents = agentsQuery.data ?? [];
  const agentById = new Map(agents.map(agent => [agent.id, agent]));
  const discoveries = discoveriesQuery.data ?? [];
  const rows = discoveries
    .filter(discovery => discovery.status === "SUCCESS" && DISCOVERY_PROVIDERS.includes(discovery.provider.toUpperCase() as DiscoveryProvider))
    .flatMap(discovery => discovery.devices.map((device, index) => ({ discovery, device, index, agent: agentById.get(discovery.agentId) ?? null })))
    .filter(row => !providerFilter || row.discovery.provider.toUpperCase() === providerFilter)
    .filter(row => !agentFilter || row.discovery.agentId === agentFilter)
    .filter(row => {
      const needle = textFilter.trim().toLowerCase();
      if (!needle) return true;
      return ["name", "hostname", "ip", "mac", "model", "id"].some(key => textValue(row.device, key).toLowerCase().includes(needle));
    });

  const latestByKey = new Map<string, typeof rows[number]>();
  for (const row of rows) {
    const key = `${row.discovery.provider.toUpperCase()}|${normalizeMac(row.device.mac) || normalizeYeelightId(row.device.id) || textValue(row.device, "hostname") || textValue(row.device, "ip")}|${row.discovery.agentId}`;
    if (!latestByKey.has(key)) latestByKey.set(key, row);
  }
  const visibleRows = [...latestByKey.values()];
  const newCount = visibleRows.filter(row => !registeredDeviceFor(row.discovery.provider, row.device, devices)).length;
  const registeredCount = visibleRows.length - newCount;
  const runningCount = discoveries.filter(item => item.status === "SENT").length;
  const failedDiscoveries = discoveries.filter(item => item.status === "FAILED" || item.status === "TIMEOUT").slice(0, 3);

  const discoveryAgents = agents.filter(agent => agent.capabilities.some(capability => capability.discovery && DISCOVERY_PROVIDERS.includes(capability.provider.toUpperCase() as DiscoveryProvider)));
  const activeFilters = Boolean(providerFilter || agentFilter || textFilter.trim());

  return <Stack gap="sm" className="device-registry-discovery-panel">
    <Group justify="space-between" align="flex-end" wrap="wrap">
      <div>
        <Text fw={600}>Device discovery</Text>
        <Text size="xs" c="dimmed">Consolidated Yeelight and ESPHome discovery reported by Device Agents. Results are kept by the API for one hour.</Text>
      </div>
      <Group gap="xs">
        <Button size="compact-sm" variant="light" color="yellow" loading={scanMutation.isPending} onClick={() => scanMutation.mutate("YEELIGHT")}>Scan Yeelight</Button>
        <Button size="compact-sm" variant="light" color="green" loading={scanMutation.isPending} onClick={() => scanMutation.mutate("ESPHOME")}>Scan ESPHome</Button>
        <Button size="compact-sm" loading={scanMutation.isPending} onClick={() => scanMutation.mutate("ALL")}>Scan all</Button>
      </Group>
    </Group>

    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
      <Card withBorder padding="md" style={{ borderLeft: "4px solid var(--mantine-color-blue-6)" }}><Text size="xs" c="dimmed">Discovered</Text><Text fw={700} size="xl">{visibleRows.length}</Text></Card>
      <Card withBorder padding="md" style={{ borderLeft: "4px solid var(--mantine-color-gray-6)" }}><Text size="xs" c="dimmed">New</Text><Text fw={700} size="xl">{newCount}</Text></Card>
      <Card withBorder padding="md" style={{ borderLeft: "4px solid var(--mantine-color-green-6)" }}><Text size="xs" c="dimmed">Registered</Text><Text fw={700} size="xl">{registeredCount}</Text></Card>
      <Card withBorder padding="md" style={{ borderLeft: "4px solid var(--mantine-color-cyan-6)" }}><Text size="xs" c="dimmed">Scans running</Text><Text fw={700} size="xl">{runningCount}</Text></Card>
    </SimpleGrid>

    {scanMutation.isError && <Text size="sm" c="red">{scanMutation.error instanceof Error ? scanMutation.error.message : "Unable to start discovery"}</Text>}
    {failedDiscoveries.map(item => <Text key={item.commandId} size="xs" c="red">{item.provider} discovery on {agentById.get(item.agentId)?.name ?? item.agentId}: {item.error ?? item.status}</Text>)}

    <Group gap="sm" wrap="nowrap">
      <ResetFiltersAction active={activeFilters} onReset={() => { setProviderFilter(null); setAgentFilter(null); setTextFilter(""); }} />
      <TextInput size="xs" placeholder="Name / IP / MAC / ID" value={textFilter} onChange={event => setTextFilter(event.currentTarget.value)} styles={activeFilterStyles(Boolean(textFilter.trim()))} style={{ flex: 1 }} />
      <Select size="xs" placeholder="All providers" clearable value={providerFilter} onChange={setProviderFilter} styles={activeFilterStyles(Boolean(providerFilter))} data={DISCOVERY_PROVIDERS.map(provider => ({ value: provider, label: provider === "ESPHOME" ? "ESPHome" : "Yeelight" }))} w={150} />
      <Select size="xs" placeholder="All agents" clearable searchable value={agentFilter} onChange={setAgentFilter} styles={activeFilterStyles(Boolean(agentFilter))} data={discoveryAgents.map(agent => ({ value: agent.id, label: agent.name }))} w={200} />
      <Text size="xs" c="dimmed">{visibleRows.length}</Text>
    </Group>

    <Card withBorder padding={0}>
      <div style={{ overflow: "auto", maxHeight: "calc(100vh - 430px)" }}>
        <Table striped highlightOnHover stickyHeader style={{ minWidth: 980 }}>
          <Table.Thead><Table.Tr>
            <Table.Th>Provider</Table.Th><Table.Th>Agent</Table.Th><Table.Th>Registry</Table.Th><Table.Th>Name</Table.Th><Table.Th>IP</Table.Th><Table.Th>MAC / ID</Table.Th><Table.Th>Model</Table.Th><Table.Th>Details</Table.Th><Table.Th style={{ width: 140, textAlign: "right" }}>Actions</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {visibleRows.map(row => {
              const provider = row.discovery.provider.toUpperCase();
              const registered = registeredDeviceFor(provider, row.device, devices);
              const needsUpdate = registered ? discoveryNeedsRegistryUpdate(provider, row.device, registered, row.agent) : false;
              const request: DiscoveredDeviceImportRequest = { agent: row.agent!, provider, device: row.device };
              const rowKey = `${row.discovery.commandId}:${row.index}`;
              const details = provider === "ESPHOME"
                ? `${Array.isArray(row.device.entities) ? row.device.entities.length : 0} entities`
                : `Power ${textValue(row.device, "power")} · ${textValue(row.device, "brightness")}%`;
              return <Table.Tr key={rowKey}>
                <Table.Td><Badge variant="light" color={providerColor(provider)}>{provider === "ESPHOME" ? "ESPHome" : "Yeelight"}</Badge></Table.Td>
                <Table.Td><Text size="sm">{row.agent?.name ?? row.discovery.agentId}</Text></Table.Td>
                <Table.Td>{registered ? <Badge size="sm" variant="light" color={needsUpdate ? "orange" : "green"}>{needsUpdate ? "Needs update" : "Registered"}</Badge> : <Badge size="sm" variant="light" color="gray">New</Badge>}</Table.Td>
                <Table.Td><Text size="sm" fw={600}>{textValue(row.device, "name") !== "—" ? textValue(row.device, "name") : textValue(row.device, "hostname")}</Text></Table.Td>
                <Table.Td><Text ff="monospace" size="sm">{textValue(row.device, "ip")}</Text></Table.Td>
                <Table.Td><Text ff="monospace" size="xs">{provider === "YEELIGHT" ? textValue(row.device, "id") : textValue(row.device, "mac")}</Text></Table.Td>
                <Table.Td><Text size="sm">{textValue(row.device, "model")}</Text></Table.Td>
                <Table.Td><Text size="xs" c="dimmed">{details}</Text></Table.Td>
                <Table.Td><Group gap={4} wrap="nowrap" justify="flex-end">
                  {!registered && row.agent && <Tooltip label="Import into Device Registry"><ActionIcon size="sm" variant="light" color="green" onClick={() => onImportDiscoveredDevice(request)}>+</ActionIcon></Tooltip>}
                  {registered && needsUpdate && row.agent && <Tooltip label="Update registered device from discovery"><ActionIcon size="sm" variant="light" color="orange" loading={updateKey === rowKey} onClick={() => updateMutation.mutate({ request, registered, key: rowKey })}>↻</ActionIcon></Tooltip>}
                  {registered && <EditActionIcon onClick={() => onOpenRegisteredDevice(registered)} />}
                </Group></Table.Td>
              </Table.Tr>;
            })}
            {!visibleRows.length && <Table.Tr><Table.Td colSpan={9}><Text c="dimmed" ta="center" py="xl">No Yeelight or ESPHome discovery result yet. Run a scan to populate this view.</Text></Table.Td></Table.Tr>}
          </Table.Tbody>
        </Table>
      </div>
    </Card>
  </Stack>;
}
