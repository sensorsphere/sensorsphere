import React from "react";
import { Badge, Code, Group, Stack, Text } from "@mantine/core";
import type { ManagedAgentOperation, ManagedAgentOperationProgress } from "./types";

function duration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${String(remainder).padStart(2, "0")}s`;
}

function stepLabel(step: string): string {
  const labels: Record<string, string> = {
    start: "Operation started",
    install_dir_ready: "Install directory prepared",
    compose_download_start: "Downloading Compose definition",
    compose_download_complete: "Compose definition downloaded",
    environment_written: "Environment written",
    compose_config_start: "Validating Compose configuration",
    compose_config_complete: "Compose configuration validated",
    docker_pull_start: "Pulling container image",
    docker_pull_complete: "Container image pulled",
    docker_up_start: "Starting container",
    docker_up_complete: "Container started",
    docker_down_start: "Stopping container",
    docker_down_complete: "Container stopped",
    rollback_start: "Rollback started",
    rollback_archived: "Failed deployment archived",
    rollback_failed: "Rollback failed",
    success: "Supervisor operation completed",
    failed: "Supervisor operation failed"
  };
  return labels[step] ?? step.replaceAll("_", " ");
}

function statusColor(status: ManagedAgentOperation["status"]): string {
  if (status === "SUCCESS") return "green";
  if (status === "FAILED" || status === "TIMEOUT") return "red";
  return "blue";
}

function currentElapsed(operation: ManagedAgentOperation, now: number): number {
  const created = Date.parse(operation.createdAt);
  const finished = operation.finishedAt ? Date.parse(operation.finishedAt) : NaN;
  if (Number.isFinite(finished) && Number.isFinite(created)) return Math.max(0, finished - created);
  return Number.isFinite(created) ? Math.max(0, now - created) : 0;
}

function stepDuration(progress: ManagedAgentOperationProgress[], index: number, totalElapsed: number): number {
  const current = progress[index]?.elapsedMs ?? 0;
  const next = progress[index + 1]?.elapsedMs;
  return Math.max(0, (typeof next === "number" ? next : totalElapsed) - current);
}

export function AgentActionDetails({ label, operation }: { label: string; operation: ManagedAgentOperation | null }) {
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    if (!operation || operation.status !== "SENT") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [operation?.commandId, operation?.status]);

  if (!operation) return null;
  const progress = operation.progress ?? [];
  const totalElapsed = currentElapsed(operation, now);

  return (
    <details key={operation.commandId} style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 6, padding: "6px 10px" }}>
      <summary style={{ cursor: "pointer", userSelect: "none" }}>
        <Group component="span" gap={8} wrap="nowrap">
          <Text component="span" size="sm" fw={600}>Actions details</Text>
          <Text component="span" size="xs" c="dimmed">{label}</Text>
          <Badge component="span" size="xs" variant="light" color={statusColor(operation.status)}>{operation.status}</Badge>
          <Text component="span" size="xs" c="dimmed">{duration(totalElapsed)}</Text>
        </Group>
      </summary>
      <Stack gap={4} mt="xs">
        <Group gap={6}><Text size="xs" c="dimmed">Command</Text><Code>{operation.commandId}</Code></Group>
        {progress.length === 0 && <Text size="xs" c="dimmed">Waiting for Supervisor progress… {duration(totalElapsed)}</Text>}
        {progress.map((item, index) => (
          <Group key={`${item.step}-${item.elapsedMs}-${index}`} justify="space-between" gap="sm" wrap="nowrap">
            <Text size="xs">{stepLabel(item.step)}</Text>
            <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>{duration(stepDuration(progress, index, totalElapsed))} · +{duration(item.elapsedMs)}</Text>
          </Group>
        ))}
        {operation.error && <Text size="xs" c="red">{operation.error}</Text>}
      </Stack>
    </details>
  );
}
