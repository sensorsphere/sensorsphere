import React from "react";
import { Tooltip } from "@mantine/core";
import { DeviceGlyph } from "./DeviceGlyph";
import type { DeviceRegistryDevice, RealtimeEntityRecord } from "./types";

export type ResolvedIcon = { icon: string; color: string; source: string };
const BRAND: Record<string, ResolvedIcon> = {
  PROXMOX: { icon: "proxmox", color: "orange", source: "Rule: Proxmox" },
  YEELIGHT: { icon: "yeelight", color: "yellow", source: "Rule: Yeelight" },
  ESPHOME: { icon: "esphome", color: "cyan", source: "Rule: ESPHome" },
  RASPBERRY_PI: { icon: "raspberry-pi", color: "red", source: "Rule: Raspberry Pi" }
};
export function resolveDiscoveryIcon(provider: string, device: Record<string, unknown>): ResolvedIcon {
  const p=provider.toUpperCase();
  const brand=BRAND[p];
  if (brand) {
    const kind=String(device.kind??"").toUpperCase();
    const detail=kind==="PVE_VM"?" VM":kind==="PVE_LXC"?" LXC":kind==="PBS_SERVER"?" PBS":"";
    return {...brand,source:`${brand.source}${detail}`};
  }
  return {icon:"device",color:"gray",source:"Fallback"};
}
export function resolveDeviceIcon(device: DeviceRegistryDevice): ResolvedIcon {
  if (device.iconOverride) return {icon:device.iconOverride,color:device.deviceTypeInfo.color||"blue",source:"Override"};
  const tech=new Set(device.technologies.map(t=>t.code.toUpperCase()));
  for (const key of ["PROXMOX","YEELIGHT","ESPHOME"]) if (tech.has(key)) return BRAND[key]!;
  const manufacturer=(device.manufacturer??"").toUpperCase();
  for (const key of ["PROXMOX","YEELIGHT","ESPHOME"]) if (manufacturer.includes(key)) return BRAND[key]!;
  const raspberryText=`${device.manufacturer??""} ${device.model??""} ${device.name??""}`.toUpperCase();
  if (device.deviceTypeInfo.code === "raspberry_pi" || raspberryText.includes("RASPBERRY PI")) return BRAND.RASPBERRY_PI;
  return {icon:device.deviceTypeInfo.icon||device.deviceClassInfo.icon||"device",color:device.deviceTypeInfo.color||device.deviceClassInfo.color||"gray",source:`Fallback: ${device.deviceTypeInfo.label}`};
}
export function resolveEntityIcon(entity: RealtimeEntityRecord): ResolvedIcon {
  const t=entity.entityType.toLowerCase();
  const icon=t==="light"?"bulb":t==="switch"?"switch-toggle":t==="binary_sensor"?"contact":t.includes("sensor")?"sensor":t==="number"?"activity":t==="select"?"controller":"device";
  const brand=BRAND[entity.provider.toUpperCase()];
  return {icon,color:brand?.color??"gray",source:`${entity.entityType} · ${brand?.source??entity.provider}`};
}
export function resolveProviderIcon(provider: string): ResolvedIcon {
  return BRAND[provider.toUpperCase()] ?? { icon: "device", color: "gray", source: provider };
}

export function ResolvedIconGlyph({ resolved, size=20 }: { resolved: ResolvedIcon; size?: number }) {
  return <Tooltip label={resolved.source}><span style={{display:"inline-flex"}}><DeviceGlyph icon={resolved.icon} color={resolved.color} size={size}/></span></Tooltip>;
}
