import React from "react";
import { Badge, Tooltip } from "@mantine/core";

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
