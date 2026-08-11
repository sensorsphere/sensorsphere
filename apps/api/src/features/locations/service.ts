import type {
  LocationDto
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
}
