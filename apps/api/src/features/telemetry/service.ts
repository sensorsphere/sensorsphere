import type {
  TelemetryRepository
} from "./repository.js";

import type {
  ObservationRepository
} from "./observation-repository.js";

import type {
  LatestObservationDto,
  MeasurementDto,
  ObservationAggregateDto,
  ObservationHistoryDto
} from "./dto.js";

import {
  mapLatestObservationToDto,
  mapMeasurementToDto,
  mapObservationHistoryToDto
} from "./mapper.js";

export class TelemetryService {

  constructor(
    private readonly repository:
      TelemetryRepository,
    private readonly observationRepository:
      ObservationRepository
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


  async getLatestObservations(
    assetId?: string
  ): Promise<LatestObservationDto[]> {

    const records =
      await this.observationRepository
        .findLatest(assetId);

    return records.map(
      mapLatestObservationToDto
    );
  }


  async getObservationHistory(
    metricId: string,
    from: Date,
    to: Date
  ): Promise<ObservationHistoryDto[]> {

    const records =
      await this.observationRepository
        .findHistory({
          metricId,
          from,
          to
        });

    return records.map(
      mapObservationHistoryToDto
    );
  }


  async getObservationAggregates(
    metricId: string,
    from: Date,
    to: Date,
    bucket: string
  ): Promise<ObservationAggregateDto[]> {

    const records =
      await this.observationRepository
        .aggregate({
          metricId,
          from,
          to,
          bucket
        });

    return records.map(
      record => ({
        bucketStart:
          record.bucket_start.toISOString(),
        min:
          record.min_value,
        max:
          record.max_value,
        avg:
          record.avg_value,
        count:
          Number(record.sample_count)
      })
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
