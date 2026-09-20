import React from "react";
import { Tooltip } from "@mantine/core";
import { DeviceGlyph } from "./DeviceGlyph";
import type { DeviceRegistryDevice, RealtimeEntityRecord } from "./types";

export type ResolvedIcon = { icon: string; color: string; source: string };

const BRAND: Record<string, ResolvedIcon> = {
  PROXMOX: { icon: "proxmox", color: "orange", source: "Rule: Proxmox" },
  YEELIGHT: { icon: "yeelight", color: "yellow", source: "Rule: Yeelight" },
  ESPHOME: { icon: "esphome", color: "cyan", source: "Rule: ESPHome" },
  RASPBERRY_PI: { icon: "raspberry-pi", color: "red", source: "Rule: Raspberry Pi" },
  HEADSCALE: { icon: "headscale", color: "blue", source: "Rule: Headscale" },
  NANOKVM: { icon: "nanokvm", color: "grape", source: "Rule: NanoKVM" }
};

function proxmoxVariant(kind?: string | null, deviceTypeCode?: string | null): ResolvedIcon {
  const normalizedKind = String(kind ?? "").toUpperCase();
  const normalizedType = String(deviceTypeCode ?? "").toLowerCase();

  if (normalizedKind === "PBS_SERVER" || normalizedType === "backup_server") {
    return { icon: "proxmox-pbs", color: "violet", source: "Rule: Proxmox Backup Server" };
  }
  if (normalizedKind === "PVE_VM" || normalizedType === "virtual_machine") {
    return { icon: "proxmox-vm", color: "indigo", source: "Rule: Proxmox VE virtual machine" };
  }
  if (normalizedKind === "PVE_LXC" || normalizedType === "lxc_container") {
    return { icon: "proxmox-lxc", color: "teal", source: "Rule: Proxmox LXC container" };
  }
  return { icon: "proxmox-node", color: "orange", source: "Rule: Proxmox VE node" };
}

function matchesAny(needle: string, values: string[]) {
  return values.some(value => needle.includes(value));
}

export function resolveDiscoveryIcon(provider: string, device: Record<string, unknown>): ResolvedIcon {
  const normalizedProvider = provider.toUpperCase();
  if (normalizedProvider === "PROXMOX") {
    return proxmoxVariant(String(device.kind ?? ""), null);
  }
  return BRAND[normalizedProvider] ?? { icon: "device", color: "gray", source: "Fallback" };
}

export function resolveDeviceIcon(device: DeviceRegistryDevice): ResolvedIcon {
  if (device.iconOverride) {
    return { icon: device.iconOverride, color: device.deviceTypeInfo.color || "blue", source: "Override" };
  }

  const technologyCodes = new Set(device.technologies.map(technology => technology.code.toUpperCase()));
  const freeText = `${device.manufacturer ?? ""} ${device.model ?? ""} ${device.name ?? ""}`.toUpperCase();

  if (technologyCodes.has("PROXMOX") || freeText.includes("PROXMOX")) {
    return proxmoxVariant(null, device.deviceTypeInfo.code);
  }
  if (technologyCodes.has("HEADSCALE") || freeText.includes("HEADSCALE")) {
    return BRAND.HEADSCALE;
  }
  if (technologyCodes.has("NANOKVM") || matchesAny(freeText, ["NANOKVM", "NANO KVM"])) {
    return BRAND.NANOKVM;
  }
  for (const key of ["YEELIGHT", "ESPHOME"]) {
    if (technologyCodes.has(key) || freeText.includes(key)) {
      return BRAND[key]!;
    }
  }
  if (device.deviceTypeInfo.code === "raspberry_pi" || freeText.includes("RASPBERRY PI")) {
    return BRAND.RASPBERRY_PI;
  }

  return {
    icon: device.deviceTypeInfo.icon || device.deviceClassInfo.icon || "device",
    color: device.deviceTypeInfo.color || device.deviceClassInfo.color || "gray",
    source: `Fallback: ${device.deviceTypeInfo.label}`
  };
}

export function resolveEntityIcon(entity: RealtimeEntityRecord): ResolvedIcon {
  const type = entity.entityType.toLowerCase();
  if (type === "light") return { icon: "bulb", color: "yellow", source: `Entity type: ${entity.entityType}` };
  if (type === "switch") return { icon: "switch-toggle", color: "blue", source: `Entity type: ${entity.entityType}` };
  if (type === "binary_sensor") return { icon: "contact", color: "teal", source: `Entity type: ${entity.entityType}` };
  if (type === "button") return { icon: "button", color: "grape", source: `Entity type: ${entity.entityType}` };
  if (type === "number") return { icon: "activity", color: "indigo", source: `Entity type: ${entity.entityType}` };
  if (type === "select") return { icon: "controller", color: "violet", source: `Entity type: ${entity.entityType}` };
  if (type.includes("sensor")) {
    const unit = (entity.unit ?? "").toLowerCase();
    const name = `${entity.entityName ?? ""} ${entity.entityValue ?? ""}`.toLowerCase();
    if (unit.includes("°") || unit === "c" || unit === "f" || name.includes("temp")) return { icon: "thermometer", color: "orange", source: `Entity type: ${entity.entityType}` };
    if (unit.includes("%") && name.includes("humid")) return { icon: "droplet", color: "cyan", source: `Entity type: ${entity.entityType}` };
    if (name.includes("motion")) return { icon: "motion", color: "teal", source: `Entity type: ${entity.entityType}` };
    return { icon: "sensor", color: "gray", source: `Entity type: ${entity.entityType}` };
  }
  return { icon: "device", color: "gray", source: `Entity type: ${entity.entityType}` };
}

export function resolveProviderIcon(provider: string): ResolvedIcon {
  return BRAND[provider.toUpperCase()] ?? { icon: "device", color: "gray", source: provider };
}

export function ResolvedIconGlyph({ resolved, size = 20 }: { resolved: ResolvedIcon; size?: number }) {
  return <Tooltip label={resolved.source}><span style={{ display: "inline-flex" }}><DeviceGlyph icon={resolved.icon} color={resolved.color} size={size} /></span></Tooltip>;
}
