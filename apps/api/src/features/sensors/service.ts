import type {
  SensorRepository
} from "./repository.js";

import type {
  SensorDto,
  UpdateSensorDto
} from "./dto.js";

import {
  mapSensorToDto
} from "./mapper.js";

export class SensorService {

  constructor(
    private readonly repository:
      SensorRepository
  ) {}

  async listSensors(): Promise<SensorDto[]> {
    const sensors =
      await this.repository.findAll();

    return sensors.map(mapSensorToDto);
  }

  async getSensor(
    id: string
  ): Promise<SensorDto | null> {

    const sensor =
      await this.repository.findById(id);

    return sensor
      ? mapSensorToDto(sensor)
      : null;
  }

  async updateSensor(
    id: string,
    input: UpdateSensorDto
  ): Promise<SensorDto | null> {

    const exists =
      await this.repository.findById(id);

    if (!exists) {
      return null;
    }

    const primaryGatewayId =
      "gatewayId" in input
        ? input.gatewayId ?? null
        : exists.gateway_id;

    const backupGatewayId =
      "backupGatewayId" in input
        ? input.backupGatewayId ?? null
        : exists.backup_gateway_id;

    if (
      primaryGatewayId &&
      backupGatewayId &&
      primaryGatewayId === backupGatewayId
    ) {
      throw new Error("Primary and backup gateway must be different");
    }

    await this.repository.updateMetadata(
      id,
      input
    );

    return this.getSensor(id);
  }
}
