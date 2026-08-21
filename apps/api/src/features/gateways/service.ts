import type {
  CreateGatewayDto,
  GatewayDto,
  UpdateGatewayDto
} from "./dto.js";

import type {
  GatewayRepository
} from "./repository.js";

import {
  mapGatewayToDto
} from "./mapper.js";

export class GatewayService {
  constructor(
    private readonly repository: GatewayRepository
  ) {}

  async listGateways(): Promise<GatewayDto[]> {
    return (await this.repository.findAll())
      .map(mapGatewayToDto);
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

    await this.repository.update(id, input);
    return this.getGateway(id);
  }

  async deleteGateway(
    id: string
  ): Promise<boolean> {
    return this.repository.delete(id);
  }
}
