import React from "react";
import { Card, SimpleGrid, Stack, Tabs, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { DeviceRegistryDevice } from "./types";
import { DeviceAgentsPanel, type DiscoveredDeviceImportRequest } from "./DeviceAgentsPanel";
import { MonitoringPanel } from "./MonitoringPanel";
import { SupervisorAgentsPanel } from "./SupervisorAgentsPanel";
import { usePersistentState } from "./preferences/usePersistentState";
import { getDeviceAgents, getMonitoringAgents } from "./api";

interface AgentsPanelProps {
  devices: DeviceRegistryDevice[];
  onImportDiscoveredDevice: (request: DiscoveredDeviceImportRequest) => void;
  onUpdateDiscoveredDevice: (request: DiscoveredDeviceImportRequest, device: DeviceRegistryDevice) => Promise<void>;
  onOpenRegisteredDevice: (device: DeviceRegistryDevice) => void;
}

export function AgentsPanel({ devices, onImportDiscoveredDevice, onUpdateDiscoveredDevice, onOpenRegisteredDevice }: AgentsPanelProps) {
  const [tab, setTab] = usePersistentState<"device" | "monitoring" | "supervisor">("device-registry.agents.tab", "device");
  const deviceAgentsQuery = useQuery({ queryKey: ["device-control", "agents"], queryFn: getDeviceAgents, refetchInterval: 10000 });
  const monitoringAgentsQuery = useQuery({ queryKey: ["monitoring", "agents"], queryFn: getMonitoringAgents, refetchInterval: 15000 });
  const deviceAgents = deviceAgentsQuery.data ?? [];
  const monitoringAgents = monitoringAgentsQuery.data ?? [];
  const supervisors = React.useMemo(() => {
    const byHost = new Map<string, (typeof deviceAgents)[number]>();
    for (const agent of deviceAgents) {
      const key = (agent.hostname ?? agent.name).trim().toLowerCase();
      const current = byHost.get(key);
      if (!current || (!current.online && agent.online) || (!current.supervisorAvailable && agent.supervisorAvailable)) byHost.set(key, agent);
    }
    return [...byHost.values()];
  }, [deviceAgents]);

  const stats = [
    ["Device Agents", deviceAgents.length, deviceAgents.filter(agent => agent.online && agent.enabled).length, "blue"],
    ["Monitoring Agents", monitoringAgents.length, monitoringAgents.filter(agent => agent.online && agent.enabled).length, "violet"],
    ["Supervisor Agents", supervisors.length, supervisors.filter(agent => agent.online && agent.supervisorAvailable).length, "teal"]
  ] as const;

  return (
    <Stack gap="sm" className="agents-workspace">
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        {stats.map(([label, total, online, color]) => (
          <Card key={label} withBorder p="sm" style={{ borderLeft: `4px solid var(--mantine-color-${color}-6)` }}>
            <Text size="xs" c="dimmed">{label}</Text>
            <Text fw={700} size="xl" c={color}>{online}<Text component="span" size="sm" c="dimmed" fw={400}> online / {total} total</Text></Text>
          </Card>
        ))}
      </SimpleGrid>
      <Tabs value={tab} onChange={value => value && setTab(value as "device" | "monitoring" | "supervisor")} keepMounted={false} className="agents-workspace-tabs">
      <Tabs.List mb="sm">
        <Tabs.Tab value="device">Device Agents</Tabs.Tab>
        <Tabs.Tab value="monitoring">Monitoring Agents</Tabs.Tab>
        <Tabs.Tab value="supervisor">Supervisor Agents</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="device" className="agents-workspace-scroll-panel">
        <DeviceAgentsPanel
          devices={devices}
          onImportDiscoveredDevice={onImportDiscoveredDevice}
          onUpdateDiscoveredDevice={onUpdateDiscoveredDevice}
          onOpenRegisteredDevice={onOpenRegisteredDevice}
        />
      </Tabs.Panel>
      <Tabs.Panel value="monitoring" className="agents-workspace-monitoring-panel">
        <MonitoringPanel view="agents" />
      </Tabs.Panel>
      <Tabs.Panel value="supervisor" className="agents-workspace-scroll-panel">
        <SupervisorAgentsPanel />
      </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
