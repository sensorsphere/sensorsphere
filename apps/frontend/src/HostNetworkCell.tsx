import React from "react";
import { ActionIcon, Code, Group, Stack, Text, Tooltip } from "@mantine/core";

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

function CopyIcon({ size = 13 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="9" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth="1.8"/></svg>;
}

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return <Group gap={5} wrap="nowrap">
    <Text size="xs" c="gray.3" style={{ minWidth: 52 }}>{label}:</Text>
    <Code c="gray.0" bg="dark.6">{value}</Code>
    <Tooltip label={copied ? "Copied" : `Copy ${label}`}><ActionIcon size="xs" variant="subtle" color="green" aria-label={`Copy ${label}`} onClick={copy}><CopyIcon /></ActionIcon></Tooltip>
  </Group>;
}

export function HostNetworkCell({ networks }: { networks: HostNetworkInterface[] | null | undefined }) {
  const items = networks ?? [];
  const addresses = items.flatMap(item => item.addresses.map(address => ({ ...address, interface: item.interface, mac: item.mac })));
  const primary = addresses.find(item => item.family === "IPv4") ?? addresses[0];
  const mac = items.find(item => item.mac)?.mac ?? null;
  if (!primary && !mac) return <Text size="sm" c="dimmed">—</Text>;
  const detail = <Stack gap={8} p={3}>{items.map(item => <Stack key={item.interface} gap={3}>
    <Text size="xs" fw={700} c="gray.0">{item.interface}</Text>
    {item.mac && <CopyValue label="MAC" value={item.mac} />}
    {item.addresses.map(address => <React.Fragment key={`${item.interface}-${address.cidr}`}>
      <CopyValue label={address.family} value={address.cidr} />
      {address.network && <CopyValue label="Network" value={address.network} />}
    </React.Fragment>)}
  </Stack>)}</Stack>;
  return <Tooltip multiline maw={520} label={detail} styles={{ tooltip: { background: "var(--mantine-color-dark-8)", color: "var(--mantine-color-gray-0)", border: "1px solid var(--mantine-color-dark-4)", boxShadow: "var(--mantine-shadow-md)" } }}>
    <div style={{ cursor: "help" }}>
      <Text size="sm">{primary?.cidr ?? "—"}{addresses.length > 1 ? ` +${addresses.length - 1}` : ""}</Text>
      {mac && <Text size="xs" c="dimmed">{mac}</Text>}
    </div>
  </Tooltip>;
}
