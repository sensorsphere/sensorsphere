import React from "react";
import { Tabs } from "@mantine/core";
import type { DeviceRegistryDevice } from "./types";
import { DeviceAgentsPanel, type DiscoveredDeviceImportRequest } from "./DeviceAgentsPanel";
import { MonitoringPanel } from "./MonitoringPanel";
import { SupervisorAgentsPanel } from "./SupervisorAgentsPanel";
import { usePersistentState } from "./preferences/usePersistentState";

interface AgentsPanelProps {
  devices: DeviceRegistryDevice[];
  onImportDiscoveredDevice: (request: DiscoveredDeviceImportRequest) => void;
  onUpdateDiscoveredDevice: (request: DiscoveredDeviceImportRequest, device: DeviceRegistryDevice) => Promise<void>;
  onOpenRegisteredDevice: (device: DeviceRegistryDevice) => void;
}

export function AgentsPanel({ devices, onImportDiscoveredDevice, onUpdateDiscoveredDevice, onOpenRegisteredDevice }: AgentsPanelProps) {
  const [tab, setTab] = usePersistentState<"device" | "monitoring" | "supervisor">("device-registry.agents.tab", "device");

  return (
    <Tabs value={tab} onChange={value => value && setTab(value as "device" | "monitoring" | "supervisor")} keepMounted={false}>
      <Tabs.List mb="sm">
        <Tabs.Tab value="device">Device Agents</Tabs.Tab>
        <Tabs.Tab value="monitoring">Monitoring Agents</Tabs.Tab>
        <Tabs.Tab value="supervisor">Supervisor Agents</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="device">
        <DeviceAgentsPanel
          devices={devices}
          onImportDiscoveredDevice={onImportDiscoveredDevice}
          onUpdateDiscoveredDevice={onUpdateDiscoveredDevice}
          onOpenRegisteredDevice={onOpenRegisteredDevice}
        />
      </Tabs.Panel>
      <Tabs.Panel value="monitoring">
        <MonitoringPanel view="agents" />
      </Tabs.Panel>
      <Tabs.Panel value="supervisor">
        <SupervisorAgentsPanel />
      </Tabs.Panel>
    </Tabs>
  );
}
