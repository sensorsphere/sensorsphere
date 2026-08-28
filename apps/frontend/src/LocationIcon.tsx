import type {
  ReactNode
} from "react";

import type {
  Location
} from "./types";

export type LocationIconName =
  | "home"
  | "building"
  | "floor"
  | "room"
  | "bedroom"
  | "bathroom"
  | "kitchen"
  | "office"
  | "garage"
  | "dining-room"
  | "living-room"
  | "dressing"
  | "laundry"
  | "terrace"
  | "shower-room"
  | "hallway"
  | "shed"
  | "tests"
  | "garden"
  | "warehouse"
  | "lab"
  | "server"
  | "site"
  | "zone"
  | "pin";

export const LOCATION_ICON_OPTIONS:
Array<{
  value: LocationIconName;
  label: string;
}> = [
  { value: "home", label: "Home" },
  { value: "building", label: "Building" },
  { value: "floor", label: "Floor" },
  { value: "room", label: "Room" },
  { value: "bedroom", label: "Bedroom" },
  { value: "bathroom", label: "Bathroom" },
  { value: "kitchen", label: "Kitchen" },
  { value: "office", label: "Office" },
  { value: "garage", label: "Garage" },
  { value: "dining-room", label: "Dining room" },
  { value: "living-room", label: "Living room" },
  { value: "dressing", label: "Dressing" },
  { value: "laundry", label: "Laundry" },
  { value: "terrace", label: "Terrace" },
  { value: "shower-room", label: "Shower room" },
  { value: "hallway", label: "Hallway" },
  { value: "shed", label: "Shed" },
  { value: "tests", label: "Tests" },
  { value: "garden", label: "Garden" },
  { value: "warehouse", label: "Warehouse" },
  { value: "lab", label: "Laboratory" },
  { value: "server", label: "Server room" },
  { value: "site", label: "Site" },
  { value: "zone", label: "Zone" },
  { value: "pin", label: "Map pin" }
];

const ICON_NAMES =
  new Set<LocationIconName>(
    LOCATION_ICON_OPTIONS.map(
      option => option.value
    )
  );

export function getLocationIconName(
  location: Location | null | undefined
): LocationIconName | null {

  const value =
    location?.metadata?.icon;

  if (
    typeof value === "string" &&
    ICON_NAMES.has(value as LocationIconName)
  ) {
    return value as LocationIconName;
  }

  switch (location?.type?.toUpperCase()) {
    case "SITE": return "site";
    case "BUILDING": return "building";
    case "FLOOR": return "floor";
    case "ROOM": return "room";
    case "ZONE": return "zone";
    case "AREA": return "pin";
    case "OTHER": return "pin";
    default: return null;
  }
}

function paths(
  name: LocationIconName
): ReactNode {

  switch (name) {
    case "home":
      return <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/></>;
    case "building":
      return <><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2m2 0h2M9 11h2m2 0h2M9 15h2m2 0h2M10 21v-3h4v3"/></>;
    case "floor":
      return <><path d="M4 18h16M6 14h12M8 10h8M10 6h4"/></>;
    case "room":
      return <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 20V8h7v12M13 14h.01"/></>;
    case "bedroom":
      return <><path d="M4 18v-7m16 7v-5a3 3 0 0 0-3-3H9a5 5 0 0 0-5 5v3M4 15h16M7 10V7h4a3 3 0 0 1 3 3"/></>;
    case "bathroom":
      return <><path d="M5 11h15v2a6 6 0 0 1-6 6h-3a6 6 0 0 1-6-6v-2ZM7 11V7a3 3 0 0 1 6 0"/><path d="M7 19v2m11-2v2"/></>;
    case "kitchen":
      return <><path d="M6 3v7m3-7v7M6 7h3M7.5 10v11M15 3v18M15 3c3 2 4 5 4 8h-4"/></>;
    case "office":
      return <><rect x="4" y="7" width="16" height="12" rx="2"/><path d="M9 7V5h6v2M4 12h16M10 12v2h4v-2"/></>;
    case "garage":
      return <><path d="M3 10 6 5h12l3 5v10H3V10Z"/><path d="M6 20v-7h12v7M8 16h8"/></>;
    case "dining-room":
      return <><circle cx="8" cy="7" r="3"/><path d="M8 10v11M5 21h6M15 4v7M18 4v7M15 8h3M16.5 11v10"/></>;
    case "living-room":
      return <><path d="M5 12V9a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3"/><path d="M4 12a2 2 0 0 0-2 2v4h20v-4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v1H6v-1a2 2 0 0 0-2-2Z"/><path d="M5 18v2m14-2v2"/></>;
    case "dressing":
      return <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M12 3v18M9 12h.01M15 12h.01"/></>;
    case "laundry":
      return <><rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8 7h.01M11 7h5"/></>;
    case "terrace":
      return (
        <>
          <path d="M3 12h18" />
          <path d="M5 12v8" />
          <path d="M19 12v8" />
          <path d="M7 16h10" />
          <path d="M8 12 12 5l4 7" />
        </>
      );

    case "shower-room":
      return (
        <>
          <path d="M6 6a4 4 0 0 1 8 0" />
          <path d="M14 6h4" />
          <path d="M18 6v3" />
          <path d="M12 11v1" />
          <path d="M15 11v1" />
          <path d="M18 11v1" />
          <path d="M12 15v1" />
          <path d="M15 15v1" />
          <path d="M18 15v1" />
        </>
      );

    case "hallway":
      return (
        <>
          <path d="M5 3h14v18H5Z" />
          <path d="M9 3v18" />
          <path d="M15 3v18" />
          <path d="M9 12h6" />
        </>
      );

    case "shed":
      return (
        <>
          <path d="M3 10 12 4l9 6" />
          <path d="M5 9v11h14V9" />
          <path d="M9 20v-7h6v7" />
          <path d="M7 11h10" />
        </>
      );

    case "tests":
      return (
        <>
          <path d="M9 3h6" />
          <path d="M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" />
          <path d="M8 16h8" />
          <path d="M10 13h4" />
        </>
      );

    case "garden":
      return <><path d="M12 21v-9M12 13C7 13 5 10 5 6c5 0 7 2 7 7ZM12 16c5 0 7-3 7-7-5 0-7 2-7 7Z"/></>;
    case "warehouse":
      return <><path d="M3 9 12 4l9 5v11H3V9Z"/><path d="M7 20v-7h10v7M7 16h10"/></>;
    case "lab":
      return <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 15h8"/></>;
    case "server":
      return <><rect x="4" y="4" width="16" height="6" rx="1"/><rect x="4" y="14" width="16" height="6" rx="1"/><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6"/></>;
    case "site":
      return <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></>;
    case "zone":
      return <><path d="M4 7h16v10H4z"/><path d="M8 7V4m8 3V4M8 20v-3m8 3v-3"/></>;
    case "pin":
      return <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>;
  }
}

export function LocationIcon({
  name,
  size = 21,
  title
}: {
  name: LocationIconName | null | undefined;
  size?: number;
  title?: string;
}) {

  if (!name) {
    return null;
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      style={{
        flexShrink: 0,
        color:
          "var(--mantine-primary-color-filled)"
      }}
    >
      {title && <title>{title}</title>}
      {paths(name)}
    </svg>
  );
}
