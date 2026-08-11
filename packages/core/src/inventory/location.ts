export const LOCATION_TYPES = [
  "SITE",
  "BUILDING",
  "FLOOR",
  "ROOM",
  "ZONE",
  "AREA",
  "OTHER",
] as const;

export type LocationType = (typeof LOCATION_TYPES)[number];

export interface Location {
  id: string;
  parentId: string | null;
  type: LocationType;
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface LocationNode extends Location {
  children: LocationNode[];
}
