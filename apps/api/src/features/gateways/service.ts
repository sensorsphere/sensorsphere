import type {
  CreateGatewayDto,
  CreateGatewayTypeDto,
  GatewayDto,
  GatewayTypeDto,
  UpdateGatewayDto,
  UpdateGatewayTypeDto
} from "./dto.js";

import type {
  GatewayRepository
} from "./repository.js";

import {
  mapGatewayToDto,
  mapGatewayTypeToDto
} from "./mapper.js";

export class GatewayService {
  constructor(
    private readonly repository: GatewayRepository
  ) {}

  async listGateways(): Promise<GatewayDto[]> {
    return (await this.repository.findAll())
      .map(mapGatewayToDto);
  }

  async listGatewayTypes(): Promise<GatewayTypeDto[]> {
    return (await this.repository.findTypes())
      .map(mapGatewayTypeToDto);
  }


  async createGatewayType(
    input: CreateGatewayTypeDto
  ): Promise<GatewayTypeDto> {
    return mapGatewayTypeToDto(
      await this.repository.createType(input)
    );
  }

  async updateGatewayType(
    id: string,
    input: UpdateGatewayTypeDto
  ): Promise<GatewayTypeDto | null> {
    const updated = await this.repository.updateType(id, input);
    return updated ? mapGatewayTypeToDto(updated) : null;
  }

  async deleteGatewayType(id: string): Promise<"deleted" | "in_use" | "not_found"> {
    if ((await this.repository.countTypeUsage(id)) > 0) return "in_use";
    return (await this.repository.deleteType(id)) ? "deleted" : "not_found";
  }

  async getGateway(
    id: string
  ): Promise<GatewayDto | null> {
    const gateway =
      await this.repository.findById(id);

    return gateway
      ? mapGatewayToDto(gateway)
      : null;
  }

  async createGateway(
    input: CreateGatewayDto
  ): Promise<GatewayDto> {
    if (!(await this.repository.typeExists(input.gatewayTypeId))) {
      throw new Error("gateway_type_not_found");
    }

    return mapGatewayToDto(
      await this.repository.create(input)
    );
  }

  async updateGateway(
    id: string,
    input: UpdateGatewayDto
  ): Promise<GatewayDto | null> {
    const existing =
      await this.repository.findById(id);

    if (!existing) return null;

    if (
      input.gatewayTypeId &&
      !(await this.repository.typeExists(input.gatewayTypeId))
    ) {
      throw new Error("gateway_type_not_found");
    }

    const effectiveInput = { ...input };

    if (effectiveInput.name === existing.name) {
      delete effectiveInput.name;
    }

    if (Object.keys(effectiveInput).length > 0) {
      await this.repository.update(id, effectiveInput);
    }

    return this.getGateway(id);
  }

  async deleteGateway(
    id: string
  ): Promise<boolean> {
    return this.repository.delete(id);
  }
}
