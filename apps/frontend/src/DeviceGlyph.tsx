import React from "react";

const MANTINE_COLORS = new Set(["dark", "gray", "red", "pink", "grape", "violet", "indigo", "blue", "cyan", "teal", "green", "lime", "yellow", "orange"]);

export function deviceColor(color: string): string {
  return MANTINE_COLORS.has(color) ? `var(--mantine-color-${color}-6)` : color || "currentColor";
}

export const DEVICE_ICON_OPTIONS = [
  "device", "network", "router", "switch", "wifi", "shield", "server", "server-stack",
  "virtual", "container", "storage", "gateway", "antenna", "sensor", "thermometer", "droplet",
  "motion", "contact", "button", "plug", "switch-toggle", "bulb", "thermostat", "camera",
  "display", "controller", "battery", "printer", "ethernet", "bluetooth", "chip", "message",
  "activity", "terminal", "globe", "globe-lock", "infrastructure", "link"
].map(value => ({ value, label: value }));

export function DeviceGlyph({ icon, color = "gray", size = 18 }: { icon: string; color?: string; size?: number }) {
  const common = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: deviceColor(color), strokeWidth: 2, strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const, "aria-hidden": true
  };

  switch (icon) {
    case "router":
      return <svg {...common}><rect x="3" y="8" width="18" height="9" rx="2"/><path d="M7 12h.01M11 12h.01M15 12h2M7 8V5M17 8V5"/></svg>;
    case "switch":
    case "switch-toggle":
      return <svg {...common}><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h2M7 14h2M13 10h4M13 14h4"/></svg>;
    case "wifi":
      return <svg {...common}><path d="M5 9a11 11 0 0 1 14 0M8 12a7 7 0 0 1 8 0M11 15a2 2 0 0 1 2 0"/><circle cx="12" cy="19" r="1"/></svg>;
    case "server":
    case "server-stack":
      return <svg {...common}><rect x="4" y="4" width="16" height="6" rx="1"/><rect x="4" y="14" width="16" height="6" rx="1"/><path d="M8 7h.01M8 17h.01M12 7h5M12 17h5"/></svg>;
    case "virtual":
      return <svg {...common}><rect x="3" y="4" width="14" height="12" rx="2"/><rect x="7" y="8" width="14" height="12" rx="2"/></svg>;
    case "container":
      return <svg {...common}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></svg>;
    case "storage":
      return <svg {...common}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>;
    case "gateway":
      return <svg {...common}><rect x="4" y="7" width="16" height="10" rx="2"/><path d="M8 12h.01M12 12h.01M16 9v6"/></svg>;
    case "antenna":
    case "bluetooth":
      return <svg {...common}><circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/></svg>;
    case "thermometer":
      return <svg {...common}><path d="M10 14.8V5a2 2 0 1 1 4 0v9.8a4 4 0 1 1-4 0"/><path d="M12 9v7"/></svg>;
    case "droplet":
      return <svg {...common}><path d="M12 3s6 6.2 6 11a6 6 0 1 1-12 0c0-4.8 6-11 6-11"/></svg>;
    case "plug":
      return <svg {...common}><path d="M8 3v6M16 3v6M6 9h12v2a6 6 0 0 1-6 6v4M9 21h6"/></svg>;
    case "bulb":
      return <svg {...common}><path d="M9 18h6M10 22h4M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 4H9c0-2 0-3-1-4"/></svg>;
    case "camera":
      return <svg {...common}><rect x="3" y="6" width="18" height="13" rx="2"/><circle cx="12" cy="12.5" r="3"/><path d="m8 6 1.5-2h5L16 6"/></svg>;
    case "shield":
      return <svg {...common}><path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6z"/></svg>;
    case "battery":
      return <svg {...common}><rect x="3" y="7" width="17" height="10" rx="2"/><path d="M20 10h2v4h-2M7 12h7"/></svg>;
    case "printer":
      return <svg {...common}><path d="M7 8V3h10v5M7 17H4V9h16v8h-3M7 14h10v7H7z"/></svg>;
    case "terminal":
      return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M12 15h5"/></svg>;
    case "globe":
    case "globe-lock":
      return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>;
    case "network":
    case "infrastructure":
      return <svg {...common}><rect x="3" y="3" width="6" height="5" rx="1"/><rect x="15" y="3" width="6" height="5" rx="1"/><rect x="9" y="16" width="6" height="5" rx="1"/><path d="M6 8v4h12V8M12 12v4"/></svg>;
    case "activity":
      return <svg {...common}><path d="M3 12h4l2-6 4 12 2-6h6"/></svg>;
    case "message":
      return <svg {...common}><path d="M4 5h16v12H8l-4 4z"/></svg>;
    case "display":
      return <svg {...common}><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>;
    case "link":
      return <svg {...common}><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></svg>;
    default:
      return <svg {...common}><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h5"/></svg>;
  }
}
