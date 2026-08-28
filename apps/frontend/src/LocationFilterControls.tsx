import React, { useMemo } from "react";
import { ActionIcon, Group, Select, Stack, Text, type SelectProps } from "@mantine/core";
import { LocationIcon, getLocationIconName } from "./LocationIcon";
import type { Location } from "./types";

export const LOCATION_SELECT_WIDTH = 320;

export function matchesLocationFilter(
  objectLocationId: string | null | undefined,
  selectedLocationId: string | null,
  locationScopeIds: Set<string> | null
): boolean {
  if (selectedLocationId === null) return true;
  if (selectedLocationId === "__unassigned__") return !objectLocationId;
  return Boolean(objectLocationId && locationScopeIds?.has(objectLocationId));
}

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

export function sortLocationsHierarchically(locations: Location[]): Location[] {
  const byParent = new Map<string | null, Location[]>();
  const ids = new Set(locations.map(location => location.id));

  for (const location of locations) {
    const parentId = location.parentId && ids.has(location.parentId)
      ? location.parentId
      : null;
    const siblings = byParent.get(parentId) ?? [];
    siblings.push(location);
    byParent.set(parentId, siblings);
  }

  for (const siblings of byParent.values()) {
    siblings.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
  }

  const result: Location[] = [];
  const visited = new Set<string>();
  const visit = (parentId: string | null): void => {
    for (const location of byParent.get(parentId) ?? []) {
      if (visited.has(location.id)) continue;
      visited.add(location.id);
      result.push(location);
      visit(location.id);
    }
  };

  visit(null);
  for (const location of locations) {
    if (!visited.has(location.id)) result.push(location);
  }
  return result;
}

export function locationDepth(locations: Location[], locationId: string): number {
  const byId = new Map(locations.map(location => [location.id, location]));
  let depth = 0;
  let current = byId.get(locationId);
  const visited = new Set<string>();

  while (current?.parentId && !visited.has(current.id)) {
    visited.add(current.id);
    const parent = byId.get(current.parentId);
    if (!parent) break;
    depth += 1;
    current = parent;
  }
  return depth;
}

export function LocationOptionContent({
  location,
  label,
  locations = []
}: {
  location: Location | null | undefined;
  label: string;
  locations?: Location[];
}) {
  if (!location) {
    return (
      <Group gap="xs" wrap="nowrap">
        <LocationIcon name="unassigned" size={16} />
        <Text size="sm">{label}</Text>
      </Group>
    );
  }
  const depth = locationDepth(locations, location.id);
  return (
    <Group gap="xs" wrap="nowrap" style={{ paddingLeft: depth * 18 }}>
      <LocationIcon name={getLocationIconName(location)} size={16} />
      <Text size="sm">{label}</Text>
    </Group>
  );
}

type SharedLocationSelectProps = Omit<
  SelectProps,
  "data" | "leftSection" | "renderOption"
> & {
  locations: Location[];
  includeUnassigned?: boolean;
  unassignedLabel?: string;
};

export function LocationSelect({
  locations,
  includeUnassigned = false,
  unassignedLabel = "Unassigned",
  value,
  w = LOCATION_SELECT_WIDTH,
  ...props
}: SharedLocationSelectProps) {
  const sortedLocations = useMemo(
    () => sortLocationsHierarchically(locations),
    [locations]
  );
  const locationsById = useMemo(
    () => new Map(locations.map(location => [location.id, location])),
    [locations]
  );
  const data = [
    ...(includeUnassigned ? [{ value: "__unassigned__", label: unassignedLabel }] : []),
    ...sortedLocations.map(location => ({ value: location.id, label: location.name }))
  ];
  const selectedLocation = typeof value === "string" && value !== "__unassigned__"
    ? locationsById.get(value)
    : undefined;
  const isUnassigned = value === "__unassigned__";

  return (
    <Select
      {...props}
      w={w}
      value={value}
      data={data}
      leftSection={
        isUnassigned
          ? <LocationIcon name="unassigned" size={16} />
          : selectedLocation
            ? <LocationIcon name={getLocationIconName(selectedLocation)} size={16} />
            : null
      }
      renderOption={({ option }) => (
        <LocationOptionContent
          location={locationsById.get(option.value)}
          label={option.label}
          locations={locations}
        />
      )}
    />
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
  onChange,
  disabled = false
}: {
  active: boolean;
  onChange: (active: boolean) => void;
  disabled?: boolean;
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
      disabled={disabled}
      onClick={() => { if (!disabled) onChange(!active); }}
    >
      <TreeIcon />
    </ActionIcon>
  );
}

export function LocationFilterField({
  locations,
  value,
  onChange,
  includeDescendants,
  onIncludeDescendantsChange,
  placeholder = "All locations",
  includeUnassigned = true,
  styles
}: {
  locations: Location[];
  value: string | null;
  onChange: (value: string | null) => void;
  includeDescendants: boolean;
  onIncludeDescendantsChange: (active: boolean) => void;
  placeholder?: string;
  includeUnassigned?: boolean;
  styles?: SelectProps["styles"];
}) {
  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>Location</Text>
      <Group gap="xs" wrap="nowrap" align="center">
        <LocationSelect
          aria-label="Location"
          clearable
          searchable
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          locations={locations}
          includeUnassigned={includeUnassigned}
          styles={styles}
        />
        <LocationScopeToggle
          active={includeDescendants}
          onChange={onIncludeDescendantsChange}
          disabled={value === "__unassigned__"}
        />
      </Group>
    </Stack>
  );
}
