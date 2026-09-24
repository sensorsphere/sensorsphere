import { Stack, Text } from "@mantine/core";

export function AgentReportedCell({ reportedName, hostname }: { reportedName: string | null; hostname: string | null }) {
  return <Stack gap={0}><Text size="sm">{reportedName?.trim() || "—"}</Text><Text size="xs" c="dimmed">{hostname?.trim() || "—"}</Text></Stack>;
}

export function AgentSystemCell({ os, osVersion, architecture }: { os: string | null; osVersion: string | null; architecture: string | null }) {
  const system = [os?.trim(), osVersion?.trim()].filter(Boolean).join(" ");
  return <Stack gap={0}><Text size="sm">{system || "—"}</Text><Text size="xs" c="dimmed">{architecture?.trim() || "—"}</Text></Stack>;
}
