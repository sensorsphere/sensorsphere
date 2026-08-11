import type {
  CreateLocationInput,
  LocationDto,
  LocationTreeDto,
  MoveLocationInput,
  MoveLocationResult,
  UpdateLocationInput
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

  async getLocationById(
    id: string
  ): Promise<LocationDto | null> {

    const location =
      await this.repository.findById(id);

    if (!location) {
      return null;
    }

    return mapLocationToDto(
      location
    );
  }

  async createLocation(
    input: CreateLocationInput
  ): Promise<LocationDto | null> {

    const parentId =
      input.parentId ?? null;

    if (parentId) {
      const parent =
        await this.repository.findById(
          parentId
        );

      if (!parent) {
        return null;
      }
    }

    const location =
      await this.repository.create({
        parent_id: parentId,
        type: input.type,
        name: input.name,
        description:
          input.description ?? null,
        metadata:
          input.metadata ?? {}
      });

    return mapLocationToDto(
      location
    );
  }

  async moveLocation(
    id: string,
    input: MoveLocationInput
  ): Promise<MoveLocationResult> {

    const location =
      await this.repository.findById(id);

    if (!location) {
      return {
        status: "location_not_found"
      };
    }

    if (input.parentId === id) {
      return {
        status: "self_parent"
      };
    }

    if (input.parentId) {
      const parent =
        await this.repository.findById(
          input.parentId
        );

      if (!parent) {
        return {
          status: "parent_not_found"
        };
      }

      const locations =
        await this.repository.findAll();

      const parentById =
        new Map(
          locations.map(
            item => [
              item.id,
              item.parent_id
            ] as const
          )
        );

      let currentId: string | null =
        input.parentId;

      const visited =
        new Set<string>();

      while (currentId) {
        if (currentId === id) {
          return {
            status: "cycle"
          };
        }

        if (visited.has(currentId)) {
          return {
            status: "cycle"
          };
        }

        visited.add(currentId);

        currentId =
          parentById.get(currentId)
          ?? null;
      }
    }

    const updated =
      await this.repository.updateParent(
        id,
        input.parentId
      );

    if (!updated) {
      return {
        status: "location_not_found"
      };
    }

    return {
      status: "ok",
      location:
        mapLocationToDto(
          updated
        )
    };
  }

  async updateLocation(
    id: string,
    input: UpdateLocationInput
  ): Promise<LocationDto | null> {

    const updated =
      await this.repository.updateDetails(
        id,
        input
      );

    if (!updated) {
      return null;
    }

    return mapLocationToDto(
      updated
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
