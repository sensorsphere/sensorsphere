import React from "react";

export type PageKey =
  | "dashboard"
  | "assets"
  | "history"
  | "alerts"
  | "inventory"
  | "sensors"
  | "gateway-coverage";

const PAGE_COLORS: Record<PageKey, string> = {
  dashboard: "var(--mantine-color-cyan-6)",
  assets: "var(--mantine-color-blue-6)",
  history: "var(--mantine-color-violet-6)",
  alerts: "var(--mantine-color-red-6)",
  inventory: "var(--mantine-color-orange-6)",
  sensors: "var(--mantine-color-green-6)",
  "gateway-coverage": "var(--mantine-color-teal-6)"
};

export function NavigationIcon({
  page,
  size = 19
}: {
  page: PageKey;
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: PAGE_COLORS[page],
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

    case "assets":
      return (
        <svg {...common}>
          <path d="M4 7h16v13H4z" />
          <path d="M8 7V4h8v3" />
          <path d="M9 12h6" />
        </svg>
      );

    case "history":
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
          <path d="M12 7v5l3 2" />
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

    case "gateway-coverage":
      return (
        <svg {...common}>
          <path d="M5 19a10 10 0 0 1 14 0" />
          <path d="M8 16a6 6 0 0 1 8 0" />
          <path d="M11 13a2 2 0 0 1 2 0" />
          <circle cx="12" cy="20" r="1" />
        </svg>
      );
  }
}
