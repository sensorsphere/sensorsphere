import type {
  Location,
  LocationType,
} from "./location";

export interface LocationRepository {

  findAll(): Promise<Location[]>;

  findById(
    id: string,
  ): Promise<Location | null>;

  findRoots(): Promise<Location[]>;

  findChildren(
    parentId: string,
  ): Promise<Location[]>;

  findByType(
    type: LocationType,
  ): Promise<Location[]>;

}
