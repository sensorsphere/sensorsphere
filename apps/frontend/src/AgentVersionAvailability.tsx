import React from "react";
import { Badge, Text, Tooltip } from "@mantine/core";

export type AgentReleaseKind = "deviceAgent" | "monitorAgent" | "supervisorAgent";

export interface AgentReleaseInfo {
  repository: string;
  latestVersion: string | null;
  status: "OK" | "ERROR";
  error: string | null;
}

export interface AgentVersionAvailability {
  checkedAt: string;
  cacheTtlSeconds: number;
  agents: Record<AgentReleaseKind, AgentReleaseInfo>;
}

export async function getAgentVersionAvailability(): Promise<AgentVersionAvailability> {
  const response = await fetch("/api/v1/device-control/agent-versions");
  if (!response.ok) throw new Error(`Unable to load agent versions (${response.status})`);
  return response.json() as Promise<AgentVersionAvailability>;
}

export async function refreshAgentVersionAvailability(): Promise<AgentVersionAvailability> {
  const response = await fetch("/api/v1/device-control/agent-versions/refresh", { method: "POST" });
  if (!response.ok) throw new Error(`Unable to refresh agent versions (${response.status})`);
  return response.json() as Promise<AgentVersionAvailability>;
}

function compactAge(value: string | null | undefined): string {
  if (!value) return "";
  const milliseconds = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return value;
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function UpdateLifecycleAge({ status, timestamp, label }: { status: string; timestamp: string | null | undefined; label?: string }) {
  if (!timestamp) return null;
  const ageMs = Date.now() - new Date(timestamp).getTime();
  const stalled = Number.isFinite(ageMs) && ageMs >= 5 * 60 * 1000;
  const slow = Number.isFinite(ageMs) && ageMs >= 2 * 60 * 1000;
  const text = `${label ?? status.toLowerCase()} ${compactAge(timestamp)}`;
  const node = <Text size="xs" c={stalled ? "red" : slow ? "orange" : "dimmed"} title={timestamp}>{text}</Text>;
  return stalled ? <Tooltip label={`${status} has been active for more than 5 minutes and may be stalled`}>{node}</Tooltip> : node;
}

function parseSemver(value: string | null | undefined): [number, number, number] | null {
  const match = value?.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function compareSemver(left: string | null | undefined, right: string | null | undefined): number | null {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return 0;
}

export function AgentVersionFreshnessBadge({ installedVersion, release }: { installedVersion: string | null | undefined; release: AgentReleaseInfo | undefined }) {
  if (!release || release.status !== "OK" || !release.latestVersion) {
    return <Tooltip label={release?.error ?? "Latest GHCR version is not available"}><Badge size="xs" variant="light" color="gray">UNKNOWN</Badge></Tooltip>;
  }
  const comparison = compareSemver(installedVersion, release.latestVersion);
  if (comparison == null) {
    return <Tooltip label={`Latest available: ${release.latestVersion}`}><Badge size="xs" variant="light" color="gray">UNKNOWN</Badge></Tooltip>;
  }
  if (comparison < 0) {
    return <Tooltip label={`Installed ${installedVersion ?? "unknown"}; latest available ${release.latestVersion}`}><Badge size="xs" variant="light" color="orange">UPDATE AVAILABLE {release.latestVersion}</Badge></Tooltip>;
  }
  return <Tooltip label={`Latest available: ${release.latestVersion}`}><Badge size="xs" variant="light" color="green">UP TO DATE</Badge></Tooltip>;
}
