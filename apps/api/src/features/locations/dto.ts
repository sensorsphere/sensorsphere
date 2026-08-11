export interface LocationDto {
  id: string;
  parentId: string | null;
  type: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LocationTreeDto
extends LocationDto {
  children: LocationTreeDto[];
}

export interface CreateLocationInput {
  parentId?: string | null;
  type:
    | "SITE"
    | "BUILDING"
    | "FLOOR"
    | "ROOM"
    | "ZONE"
    | "AREA"
    | "OTHER";
  name: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
}

export interface MoveLocationInput {
  parentId: string | null;
}

export type MoveLocationResult =
  | {
      status: "ok";
      location: LocationDto;
    }
  | {
      status:
        | "location_not_found"
        | "parent_not_found"
        | "self_parent"
        | "cycle";
    };

export interface UpdateLocationInput {
  type?:
    | "SITE"
    | "BUILDING"
    | "FLOOR"
    | "ROOM"
    | "ZONE"
    | "AREA"
    | "OTHER";
  name?: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
}
