import React from "react";
import { Code, Stack, Text, Tooltip } from "@mantine/core";

export interface HostNetworkAddress {
  family: "IPv4" | "IPv6";
  address: string;
  prefixLength: number;
  cidr: string;
  network: string | null;
}

export interface HostNetworkInterface {
  interface: string;
  mac: string | null;
  addresses: HostNetworkAddress[];
}

export function HostNetworkCell({ networks }: { networks: HostNetworkInterface[] | null | undefined }) {
  const items = networks ?? [];
  const addresses = items.flatMap(item => item.addresses.map(address => ({ ...address, interface: item.interface, mac: item.mac })));
  const primary = addresses.find(item => item.family === "IPv4") ?? addresses[0];
  const mac = items.find(item => item.mac)?.mac ?? null;
  if (!primary && !mac) return <Text size="sm" c="dimmed">—</Text>;
  return <Tooltip multiline maw={460} label={<Stack gap={5}>{items.map(item => <div key={item.interface}><Text size="xs" fw={700}>{item.interface}</Text>{item.mac && <Text size="xs">MAC: <Code>{item.mac}</Code></Text>}{item.addresses.map(address => <Text size="xs" key={`${item.interface}-${address.cidr}`}>{address.family}: <Code>{address.cidr}</Code>{address.network ? ` · network ${address.network}` : ""}</Text>)}</div>)}</Stack>}>
    <div style={{ cursor: "help" }}>
      <Text size="sm">{primary?.cidr ?? "—"}{addresses.length > 1 ? ` +${addresses.length - 1}` : ""}</Text>
      {mac && <Text size="xs" c="dimmed">{mac}</Text>}
    </div>
  </Tooltip>;
}
