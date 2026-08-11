import type {
  SensorRepository
} from "./repository.js";

import type {
  SensorDto
} from "./dto.js";

import {
  mapSensorToDto
} from "./mapper.js";

export class SensorService {

  constructor(
    private readonly repository:
      SensorRepository
  ) {}

  async listSensors():
  Promise<SensorDto[]> {

    const sensors =
      await this.repository.findAll();

    return sensors.map(
      mapSensorToDto
    );
  }
}
