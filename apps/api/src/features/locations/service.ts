import type {
  LocationDto,
  LocationTreeDto
} from "./dto.js";

import type {
  LocationRepository
} from "./repository.js";

import {
  mapLocationToDto
} from "./mapper.js";

export class LocationService {

  constructor(
    private readonly repository:
      LocationRepository
  ) {}

  async listLocations():
  Promise<LocationDto[]> {

    const locations =
      await this.repository.findAll();

    return locations.map(
      location =>
        mapLocationToDto(
          location
        )
    );
  }

  async listLocationTree():
  Promise<LocationTreeDto[]> {

    const locations =
      await this.repository.findAll();

    const nodes =
      new Map<string, LocationTreeDto>();

    for (const location of locations) {
      const dto =
        mapLocationToDto(
          location
        );

      nodes.set(
        dto.id,
        {
          ...dto,
          children: []
        }
      );
    }

    const roots: LocationTreeDto[] = [];

    for (const location of locations) {
      const node =
        nodes.get(location.id);

      if (!node) {
        continue;
      }

      if (!location.parent_id) {
        roots.push(node);
        continue;
      }

      const parent =
        nodes.get(location.parent_id);

      if (!parent) {
        roots.push(node);
        continue;
      }

      parent.children.push(node);
    }

    return roots;
  }
}
