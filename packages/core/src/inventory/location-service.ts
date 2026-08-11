import type {
  Location,
  LocationNode,
} from "./location";

import type {
  LocationRepository,
} from "./location-repository";

export class LocationService {

  constructor(
    private readonly repository: LocationRepository,
  ) {}

  async findAll(): Promise<Location[]> {
    return this.repository.findAll();
  }

  async findById(
    id: string,
  ): Promise<Location | null> {
    return this.repository.findById(id);
  }

  async findRoots(): Promise<Location[]> {
    return this.repository.findRoots();
  }

  async findChildren(
    parentId: string,
  ): Promise<Location[]> {
    return this.repository.findChildren(parentId);
  }

  async buildTree(): Promise<LocationNode[]> {

    const locations =
      await this.repository.findAll();

    const nodes =
      new Map<string, LocationNode>();

    for (const location of locations) {
      nodes.set(
        location.id,
        {
          ...location,
          children: [],
        },
      );
    }

    const roots: LocationNode[] = [];

    for (const location of locations) {

      const node =
        nodes.get(location.id);

      if (!node) {
        continue;
      }

      if (!location.parentId) {
        roots.push(node);
        continue;
      }

      const parent =
        nodes.get(location.parentId);

      if (!parent) {
        // An inconsistent parent reference should not
        // make the complete location tree unusable.
        roots.push(node);
        continue;
      }

      parent.children.push(node);
    }

    return roots;
  }

}
