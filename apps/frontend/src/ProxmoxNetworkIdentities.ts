import type { DeviceIdentity } from "./types";

interface ProxmoxNetworkInterfaceLike {
  name?: unknown;
  ip?: unknown;
  mac?: unknown;
  comment?: unknown;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function roleForInterface(name: string, comment: string): { code: string; label: string } {
  const hint = `${name} ${comment}`.toUpperCase();
  if (/\b(ADMIN|MGMT|MANAGEMENT)\b/.test(hint)) return { code: "MANAGEMENT", label: "Management" };
  if (/\b(CEPH|STORAGE)\b/.test(hint)) return { code: "STORAGE", label: "Storage" };
  if (/\bWAN\b/.test(hint)) return { code: "WAN", label: "WAN" };
  if (/\bUPLINK\b/.test(hint)) return { code: "UPLINK", label: "Uplink" };
  if (/\bVPN\b/.test(hint)) return { code: "VPN", label: "VPN" };
  return { code: "LAN", label: "LAN" };
}

export function proxmoxNodeNetworkIdentities(device: Record<string, unknown>): DeviceIdentity[] {
  if (!Array.isArray(device.networkInterfaces)) return [];

  const primaryIp = text(device.ip);
  const rows = device.networkInterfaces
    .filter((item): item is ProxmoxNetworkInterfaceLike => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map(item => ({
      name: text(item.name),
      ip: text(item.ip),
      mac: text(item.mac),
      comment: text(item.comment)
    }))
    .filter(item => item.name && item.ip);

  if (!rows.length) return [];

  const primaryIpIndex = Math.max(0, rows.findIndex(item => item.ip === primaryIp));
  const identities: DeviceIdentity[] = [];

  rows.forEach((item, index) => {
    const role = roleForInterface(item.name, item.comment);
    identities.push({
      identityType: "IP",
      value: item.ip,
      source: "discovery",
      labelCode: role.code,
      label: role.label,
      isPrimary: index === primaryIpIndex,
      sortOrder: index
    });
  });

  const seenMacs = new Set<string>();
  const macRows = rows.filter(item => {
    if (!item.mac) return false;
    const normalized = item.mac.toUpperCase().replace(/[^0-9A-F]/g, "");
    if (!normalized || seenMacs.has(normalized)) return false;
    seenMacs.add(normalized);
    return true;
  });
  const primaryMacRow = rows[primaryIpIndex]?.mac
    ? rows[primaryIpIndex]!.mac
    : macRows[0]?.mac ?? "";

  macRows.forEach((item, index) => {
    const role = roleForInterface(item.name, item.comment);
    identities.push({
      identityType: "MAC",
      value: item.mac,
      source: "discovery",
      labelCode: role.code,
      label: role.label,
      isPrimary: item.mac === primaryMacRow,
      sortOrder: 10 + index
    });
  });

  return identities;
}
