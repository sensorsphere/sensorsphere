import React from "react";
import { ActionIcon, Group, Text } from "@mantine/core";
import { LocationIcon, getLocationIconName } from "./LocationIcon";
import type { Location } from "./types";

export function locationIdsForScope(
  locations: Location[],
  locationId: string | null,
  includeDescendants: boolean
): Set<string> | null {
  if (!locationId || locationId === "__unassigned__") return null;
  const result = new Set<string>([locationId]);
  if (!includeDescendants) return result;

  let changed = true;
  while (changed) {
    changed = false;
    for (const location of locations) {
      if (location.parentId && result.has(location.parentId) && !result.has(location.id)) {
        result.add(location.id);
        changed = true;
      }
    }
  }
  return result;
}

export function LocationOptionContent({
  location,
  label
}: {
  location: Location | null | undefined;
  label: string;
}) {
  return (
    <Group gap="xs" wrap="nowrap">
      <LocationIcon name={getLocationIconName(location)} size={16} />
      <Text size="sm">{label}</Text>
    </Group>
  );
}

function TreeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v4" />
      <path d="M6 8h12" />
      <path d="M6 8v4" />
      <path d="M12 8v4" />
      <path d="M18 8v4" />
      <rect x="3.5" y="12" width="5" height="5" rx="1" />
      <rect x="9.5" y="12" width="5" height="5" rx="1" />
      <rect x="15.5" y="12" width="5" height="5" rx="1" />
    </svg>
  );
}

export function LocationScopeToggle({
  active,
  onChange
}: {
  active: boolean;
  onChange: (active: boolean) => void;
}) {
  const title = active ? "Include sublocations" : "Direct location only";
  return (
    <ActionIcon
      variant="light"
      color={active ? "blue" : "gray"}
      size="lg"
      aria-label={title}
      title={title}
      aria-pressed={active}
      onClick={() => onChange(!active)}
    >
      <TreeIcon />
    </ActionIcon>
  );
}
