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
