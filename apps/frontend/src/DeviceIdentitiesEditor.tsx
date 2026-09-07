import React from "react";
import { ActionIcon, Badge, Button, Checkbox, Group, Modal, Select, Stack, Table, Text, TextInput, Tooltip } from "@mantine/core";
import type { DeviceIdentity, DeviceIdentityLabelReference, DeviceRegistryDevice } from "./types";
import { DeleteActionIcon, EditActionIcon } from "./TableActionIcons";

const IDENTITY_TYPES = ["MAC", "IP", "FQDN", "IEEE", "HOSTNAME", "SERIAL", "ESPHOME_NODE", "MQTT_CLIENT_ID", "PROXMOX_VMID", "CUSTOM"];

interface IdentityForm { identityType: string; labelCode: string | null; value: string; isPrimary: boolean; sortOrder: number | string; }
const emptyIdentity = (): IdentityForm => ({ identityType: "MAC", labelCode: null, value: "", isPrimary: true, sortOrder: 100 });

export function normalizeMac(value: string): string | null {
  const hex = value.toUpperCase().replace(/[^0-9A-F]/g, "");
  if (hex.length !== 12) return null;
  return hex.match(/.{2}/g)!.join(":");
}

export function normalizeIeee(value: string): string | null {
  const hex = value.toUpperCase().replace(/[^0-9A-F]/g, "");
  if (hex.length !== 16) return null;
  return `0x${hex.toLowerCase()}`;
}

function normalizedForConflict(identityType: string, value: string): string {
  if (identityType === "MAC") return normalizeMac(value) ?? value.trim().toUpperCase();
  if (identityType === "IEEE") return normalizeIeee(value) ?? value.trim().toLowerCase();
  return value.trim().toLowerCase();
}

export function primaryIdentity(identities: DeviceIdentity[], type: string): DeviceIdentity | undefined {
  return identities.find(item => item.identityType === type && item.isPrimary)
    ?? identities.find(item => item.identityType === type);
}

function PingCheckIcon() {
  return <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.5 4.5a10.6 10.6 0 0 0 0 15M19.5 4.5a10.6 10.6 0 0 1 0 15"/></svg>;
}

export function DeviceIdentitiesEditor({
  value,
  onChange,
  devices,
  identityLabels,
  currentDeviceId,
  onViewDevice,
  onManagePingCheck,
  pingCheckExists
}: {
  value: DeviceIdentity[];
  onChange: (value: DeviceIdentity[]) => void;
  devices: DeviceRegistryDevice[];
  identityLabels: DeviceIdentityLabelReference[];
  currentDeviceId?: string;
  onViewDevice?: (device: DeviceRegistryDevice) => void;
  onManagePingCheck?: (identity: DeviceIdentity) => void;
  pingCheckExists?: (identity: DeviceIdentity) => boolean | null;
}) {
  const [opened, setOpened] = React.useState(false);
  const [editIndex, setEditIndex] = React.useState<number | null>(null);
  const [form, setForm] = React.useState<IdentityForm>(emptyIdentity());

  const openCreate = () => { setEditIndex(null); setForm(emptyIdentity()); setOpened(true); };
  const openEdit = (index: number) => {
    const item = value[index]!;
    setEditIndex(index);
    setForm({ identityType: item.identityType, labelCode: item.labelCode ?? null, value: item.value, isPrimary: item.isPrimary ?? false, sortOrder: item.sortOrder ?? 100 });
    setOpened(true);
  };

  const normalized = normalizedForConflict(form.identityType, form.value);
  const formatError = form.identityType === "MAC" && form.value.trim() && !normalizeMac(form.value)
    ? "MAC address must contain exactly 12 hexadecimal digits"
    : form.identityType === "IEEE" && form.value.trim() && !normalizeIeee(form.value)
      ? "IEEE address must contain exactly 16 hexadecimal digits"
      : null;

  const conflict = (form.identityType === "MAC" || form.identityType === "IEEE" || form.identityType === "IP")
    ? devices.find(device => device.id !== currentDeviceId && device.identities.some(identity =>
        identity.identityType === form.identityType && normalizedForConflict(identity.identityType, identity.value) === normalized
      ))
    : undefined;

  const save = () => {
    if (!form.value.trim() || formatError || conflict) return;
    const canonicalValue = form.identityType === "MAC" ? normalizeMac(form.value)! : form.identityType === "IEEE" ? normalizeIeee(form.value)! : form.value.trim();
    const item: DeviceIdentity = {
      identityType: form.identityType.trim().toUpperCase(),
      value: canonicalValue,
      source: "manual",
      labelCode: form.labelCode,
      label: identityLabels.find(label => label.code === form.labelCode)?.label ?? null,
      isPrimary: form.isPrimary,
      sortOrder: typeof form.sortOrder === "number" ? form.sortOrder : 100
    };
    let next = [...value];
    if (item.isPrimary) next = next.map((existing, index) => index === editIndex || existing.identityType !== item.identityType ? existing : { ...existing, isPrimary: false });
    if (editIndex == null) next.push(item); else next[editIndex] = item;
    next.sort((a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100) || a.identityType.localeCompare(b.identityType) || a.value.localeCompare(b.value));
    onChange(next);
    setOpened(false);
  };

  return <Stack gap="xs">
    <Group justify="space-between">
      <div><Text fw={600} size="sm">Identities & addresses</Text><Text size="xs" c="dimmed">A device can have multiple MAC, IP, FQDN, IEEE and custom identities. One identity can be primary for each type.</Text></div>
      <Button size="compact-xs" variant="light" onClick={openCreate}>+ Add identity</Button>
    </Group>
    {value.length > 0 ? <Table withTableBorder>
      <Table.Thead><Table.Tr><Table.Th>Type</Table.Th><Table.Th>Label</Table.Th><Table.Th>Value</Table.Th><Table.Th>Primary</Table.Th><Table.Th>Checks</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead>
      <Table.Tbody>{value.map((item, index) => <Table.Tr key={`${item.identityType}-${item.value}-${index}`}>
        <Table.Td><Badge variant="light">{item.identityType}</Badge></Table.Td>
        <Table.Td>{item.label ?? identityLabels.find(label => label.code === item.labelCode)?.label ?? "—"}</Table.Td>
        <Table.Td><Text ff="monospace" size="sm">{item.value}</Text></Table.Td>
        <Table.Td>{item.isPrimary ? <Badge color="blue" variant="light">PRIMARY</Badge> : "—"}</Table.Td>
        <Table.Td>{currentDeviceId && item.identityType.toUpperCase() === "IP" && onManagePingCheck ? (() => {
          const exists = pingCheckExists?.(item) ?? null;
          const color = exists === null ? "gray" : exists ? "blue" : "green";
          const label = exists === null ? "Manage PING check" : exists ? "Edit PING check" : "Add PING check";
          return <Tooltip label={label}><ActionIcon size="sm" variant="light" color={color} aria-label={label} onClick={() => onManagePingCheck(item)}><PingCheckIcon /></ActionIcon></Tooltip>;
        })() : "—"}</Table.Td><Table.Td><Group gap={4}><EditActionIcon onClick={() => openEdit(index)} /><DeleteActionIcon onClick={() => onChange(value.filter((_, i) => i !== index))} /></Group></Table.Td>
      </Table.Tr>)}</Table.Tbody>
    </Table> : <Text size="sm" c="dimmed">No identity configured.</Text>}

    <Modal opened={opened} onClose={() => setOpened(false)} title={editIndex == null ? "Add identity" : "Edit identity"} size="md">
      <Stack gap="sm">
        <Group grow>
          <Select label="Type" searchable data={IDENTITY_TYPES} value={form.identityType} onChange={v => setForm(f => ({ ...f, identityType: v ?? "CUSTOM" }))} />
          <Select label="Label" searchable clearable placeholder="Select a standard label" data={identityLabels.map(item => ({ value: item.code, label: item.label }))} value={form.labelCode} onChange={v => setForm(f => ({ ...f, labelCode: v }))} />
        </Group>
        <TextInput label="Value" required autoFocus data-autofocus value={form.value} onChange={e => setForm(f => ({ ...f, value: e.currentTarget.value }))} error={formatError ?? undefined} placeholder={form.identityType === "MAC" ? "AA:BB:CC:DD:EE:FF" : form.identityType === "IEEE" ? "0x00158d0001234567" : undefined} />
        {conflict && <Stack gap={2} p="xs" style={{ border: "1px solid var(--mantine-color-orange-6)", borderRadius: 6 }}>
          <Text size="sm" c="orange" fw={600}>{form.identityType} already assigned</Text>
          <Text size="xs">{form.value} is already assigned to <b>{conflict.name}</b> ({conflict.deviceClassInfo.label} / {conflict.deviceTypeInfo.label}).</Text>
          {onViewDevice && <Button size="compact-xs" variant="subtle" onClick={() => { setOpened(false); onViewDevice(conflict); }}>View device</Button>}
        </Stack>}
        <Checkbox label={`Primary ${form.identityType} identity`} checked={form.isPrimary} onChange={e => setForm(f => ({ ...f, isPrimary: e.currentTarget.checked }))} />
        <Group justify="flex-end"><Button variant="default" onClick={() => setOpened(false)}>Cancel</Button><Button disabled={!form.value.trim() || Boolean(formatError) || Boolean(conflict)} onClick={save}>Save</Button></Group>
      </Stack>
    </Modal>
  </Stack>;
}
