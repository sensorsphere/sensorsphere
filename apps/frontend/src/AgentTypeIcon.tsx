import React from "react";
import { Tooltip } from "@mantine/core";

export type AgentTypeKind = "device" | "monitoring" | "supervisor";

const meta: Record<AgentTypeKind, { label: string; color: string }> = {
  device: { label: "Device Agent", color: "var(--mantine-color-cyan-6)" },
  monitoring: { label: "Monitoring Agent", color: "var(--mantine-color-violet-6)" },
  supervisor: { label: "Supervisor Agent", color: "var(--mantine-color-teal-6)" }
};

export function AgentTypeIcon({ type, size = 16, tooltip }: { type: AgentTypeKind; size?: number; tooltip?: string }) {
  const m = meta[type];
  const icon = type === "device" ? (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M8 9h8M8 13h5M8 17h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
  ) : type === "monitoring" ? (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 12h4l2-5 4 10 2-5h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l7 3v5c0 4.6-2.9 8.1-7 10-4.1-1.9-7-5.4-7-10V6l7-3z" stroke="currentColor" strokeWidth="1.8"/><path d="M9 12h6M12 9v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
  );
  const wrapped = <span style={{ color: m.color, display: "inline-flex", alignItems: "center" }}>{icon}</span>;
  return tooltip ? <Tooltip label={tooltip}>{wrapped}</Tooltip> : wrapped;
}

export function agentTypeLabel(type: string): string {
  return type === "device-agent" ? "Device Agent" : type === "monitor-agent" ? "Monitoring Agent" : "Supervisor Agent";
}
