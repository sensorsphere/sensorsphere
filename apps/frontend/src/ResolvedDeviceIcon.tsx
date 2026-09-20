import React from "react";
import { Tooltip } from "@mantine/core";
import { DeviceGlyph } from "./DeviceGlyph";
import type { DeviceRegistryDevice, RealtimeEntityRecord } from "./types";

export type ResolvedIcon = { icon: string; color: string; source: string };
const BRAND: Record<string, ResolvedIcon> = {
  PROXMOX: { icon: "proxmox", color: "orange", source: "Rule: Proxmox" },
  YEELIGHT: { icon: "yeelight", color: "yellow", source: "Rule: Yeelight" },
  ESPHOME: { icon: "esphome", color: "cyan", source: "Rule: ESPHome" }
};
export function resolveDiscoveryIcon(provider: string, device: Record<string, unknown>): ResolvedIcon {
  const p=provider.toUpperCase(); const kind=String(device.kind??"").toUpperCase();
  if (p==="PROXMOX" && kind==="PVE_VM") return {icon:"virtual",color:"orange",source:"Rule: Proxmox VM"};
  if (p==="PROXMOX" && kind==="PVE_LXC") return {icon:"container",color:"orange",source:"Rule: Proxmox LXC"};
  if (p==="PROXMOX" && kind==="PBS_SERVER") return {icon:"storage",color:"orange",source:"Rule: Proxmox Backup Server"};
  return BRAND[p] ?? {icon:"device",color:"gray",source:"Fallback"};
}
export function resolveDeviceIcon(device: DeviceRegistryDevice): ResolvedIcon {
  if (device.iconOverride) return {icon:device.iconOverride,color:device.deviceTypeInfo.color||"blue",source:"Override"};
  const tech=new Set(device.technologies.map(t=>t.code.toUpperCase()));
  for (const key of ["PROXMOX","YEELIGHT","ESPHOME"]) if (tech.has(key)) return BRAND[key]!;
  const manufacturer=(device.manufacturer??"").toUpperCase();
  for (const key of ["PROXMOX","YEELIGHT","ESPHOME"]) if (manufacturer.includes(key)) return BRAND[key]!;
  return {icon:device.deviceTypeInfo.icon||device.deviceClassInfo.icon||"device",color:device.deviceTypeInfo.color||device.deviceClassInfo.color||"gray",source:`Fallback: ${device.deviceTypeInfo.label}`};
}
export function resolveEntityIcon(entity: RealtimeEntityRecord): ResolvedIcon {
  const t=entity.entityType.toLowerCase();
  const icon=t==="light"?"bulb":t==="switch"?"switch-toggle":t==="binary_sensor"?"contact":t.includes("sensor")?"sensor":t==="number"?"activity":t==="select"?"controller":"device";
  const brand=BRAND[entity.provider.toUpperCase()];
  return {icon,color:brand?.color??"gray",source:`${entity.entityType} · ${brand?.source??entity.provider}`};
}
export function ResolvedIconGlyph({ resolved, size=20 }: { resolved: ResolvedIcon; size?: number }) {
  return <Tooltip label={resolved.source}><span style={{display:"inline-flex"}}><DeviceGlyph icon={resolved.icon} color={resolved.color} size={size}/></span></Tooltip>;
}
