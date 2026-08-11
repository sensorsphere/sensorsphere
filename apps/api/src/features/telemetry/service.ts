import type {
  TelemetryRepository
} from "./repository.js";

import type {
  MeasurementDto
} from "./dto.js";

import {
  mapMeasurementToDto
} from "./mapper.js";

export class TelemetryService {

  constructor(
    private readonly repository:
      TelemetryRepository
  ) {}

  async getLatest():
  Promise<MeasurementDto[]> {

    const records =
      await this.repository
        .findLatest();

    return records.map(
      mapMeasurementToDto
    );
  }

  async getHistory(
    sensorUid: string,
    from: Date,
    to: Date
  ): Promise<MeasurementDto[]> {

    const records =
      await this.repository
        .findHistory({
          sensorUid,
          from,
          to
        });

    return records.map(
      mapMeasurementToDto
    );
  }
}
