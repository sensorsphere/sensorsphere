import type {
  LocationDto
} from "./dto.js";

import type {
  LocationRecord
} from "./repository.js";

export function mapLocationToDto(
  location: LocationRecord
): LocationDto {

  return {
    id: location.id,
    parentId: location.parent_id,
    type: location.type,
    name: location.name,
    description: location.description,
    metadata: location.metadata,
    createdAt: location.created_at.toISOString(),
    updatedAt: location.updated_at.toISOString()
  };
}
