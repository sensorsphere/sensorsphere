import React from "react";

export type PageKey =
  | "dashboard"
  | "dashboards"
  | "assets"
  | "devices"
  | "services"
  | "history"
  | "alerts"
  | "inventory"
  | "topology"
  | "sensors"
  | "gateways"
  | "metric-routing"
  | "gateway-coverage"
  | "users"
  | "versions"
  | "todos";

const PAGE_COLORS: Record<PageKey, string> = {
  dashboard: "var(--mantine-color-cyan-6)",
  dashboards: "var(--mantine-color-orange-6)",
  assets: "var(--mantine-color-blue-6)",
  devices: "var(--mantine-color-cyan-6)",
  services: "var(--mantine-color-indigo-6)",
  history: "var(--mantine-color-violet-6)",
  alerts: "var(--mantine-color-red-6)",
  inventory: "var(--mantine-color-orange-6)",
  topology: "var(--mantine-color-indigo-6)",
  sensors: "var(--mantine-color-green-6)",
  gateways: "var(--mantine-color-lime-6)",
  "metric-routing": "var(--mantine-color-yellow-6)",
  "gateway-coverage": "var(--mantine-color-teal-6)",
  users: "var(--mantine-color-blue-6)",
  versions: "var(--mantine-color-indigo-6)",
  todos: "var(--mantine-color-pink-6)"
};

export function NavigationIcon({
  page,
  size = 19,
  color
}: {
  page: PageKey;
  size?: number;
  color?: string;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color ?? PAGE_COLORS[page],
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true
  };

  switch (page) {
    case "dashboard":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );

    case "dashboards":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="8" height="7" rx="1" />
          <rect x="13" y="4" width="8" height="7" rx="1" />
          <rect x="3" y="13" width="8" height="7" rx="1" />
          <rect x="13" y="13" width="8" height="7" rx="1" />
          <path d="M5 8h4" />
          <path d="M15 8h4" />
          <path d="M5 17h4" />
          <path d="M15 17h4" />
        </svg>
      );

    case "assets":
      return (
        <svg {...common}>
          <path d="M4 7h16v13H4z" />
          <path d="M8 7V4h8v3" />
          <path d="M9 12h6" />
        </svg>
      );

    case "devices":
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M8 9h8" />
          <path d="M8 13h4" />
          <circle cx="16.5" cy="14" r="1.5" />
        </svg>
      );

    case "services":
      return (
        <svg {...common}>
          <path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.2 8.5 4.5 4.5 0 0 0 7 18Z" />
          <path d="M9 14h6" />
          <path d="M12 11v6" />
        </svg>
      );

    case "history":
      return (
        <svg {...common}>
          <path d="M4 4v16h16" />
          <path d="m6 16 4-5 4 3 5-7" />
          <circle cx="10" cy="11" r="1" />
          <circle cx="14" cy="14" r="1" />
          <circle cx="19" cy="7" r="1" />
        </svg>
      );

    case "alerts":
      return (
        <svg {...common}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
      );

    case "inventory":
      return (
        <svg {...common}>
          <path d="M4 5h16v4H4z" />
          <path d="M5 9v11h14V9" />
          <path d="M9 13h6" />
        </svg>
      );

    case "topology":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="6" height="5" rx="1" />
          <rect x="15" y="4" width="6" height="5" rx="1" />
          <rect x="9" y="15" width="6" height="5" rx="1" />
          <path d="M6 9v3h6v3" />
          <path d="M18 9v3h-6" />
        </svg>
      );

    case "sensors":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="2" />
          <path d="M7.8 7.8a6 6 0 0 0 0 8.4" />
          <path d="M16.2 7.8a6 6 0 0 1 0 8.4" />
          <path d="M4.9 4.9a10 10 0 0 0 0 14.2" />
          <path d="M19.1 4.9a10 10 0 0 1 0 14.2" />
        </svg>
      );

    case "gateways":
      return (
        <svg {...common}>
          <rect x="5" y="7" width="14" height="10" rx="2" />
          <path d="M8 12h.01" />
          <path d="M11 12h.01" />
          <path d="M15 10a4 4 0 0 1 0 4" />
          <path d="M17 8a7 7 0 0 1 0 8" />
        </svg>
      );

    case "metric-routing":
      return (
        <svg {...common}>
          <path d="M4 6h6l2 3h8" />
          <path d="M4 18h6l2-3h8" />
          <circle cx="4" cy="6" r="1" />
          <circle cx="4" cy="18" r="1" />
          <circle cx="20" cy="9" r="1" />
          <circle cx="20" cy="15" r="1" />
        </svg>
      );

    case "gateway-coverage":
      return (
        <svg {...common}>
          <path d="M5 19a10 10 0 0 1 14 0" />
          <path d="M8 16a6 6 0 0 1 8 0" />
          <path d="M11 13a2 2 0 0 1 2 0" />
          <circle cx="12" cy="20" r="1" />
        </svg>
      );

    case "users":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
          <path d="M16 8h5" />
          <path d="M18.5 5.5v5" />
        </svg>
      );

    case "versions":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9h6" />
          <path d="M9 13h4" />
          <path d="M9 17h2" />
        </svg>
      );

    case "todos":
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="m8 8 1.5 1.5L12 7" />
          <path d="M14 9h3" />
          <path d="m8 14 1.5 1.5L12 13" />
          <path d="M14 15h3" />
        </svg>
      );
  }
}
