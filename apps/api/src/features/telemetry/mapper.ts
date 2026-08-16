import type {
  MeasurementRecord
} from "./repository.js";

import type {
  LatestObservationRecord
} from "./observation-repository.js";

import type {
  LatestObservationDto,
  MeasurementDto,
  ObservationHistoryDto
} from "./dto.js";

import {
  evaluateMetricQuality
} from "./quality.js";

export function mapMeasurementToDto(
  record: MeasurementRecord
): MeasurementDto {

  return {
    sensorUid: record.sensor_uid,
    time: record.time.toISOString(),

    temperature:
      record.temperature,

    humidity:
      record.humidity,

    battery:
      record.battery,

    voltage:
      record.voltage,

    rssi:
      record.rssi
  };
}

export function mapLatestObservationToDto(
  observation: LatestObservationRecord
): LatestObservationDto {

  let value:
    | number
    | string
    | boolean
    | Record<string, unknown>;

  if (observation.value_double !== null) {
    value = observation.value_double;
  } else if (observation.value_text !== null) {
    value = observation.value_text;
  } else if (observation.value_boolean !== null) {
    value = observation.value_boolean;
  } else {
    value = observation.value_json ?? {};
  }

  return {
    assetId: observation.asset_id,
    assetExternalId:
      observation.asset_external_id,
    assetName: observation.asset_name,
    metricId: observation.metric_id,
    metricKey: observation.metric_key,
    displayName: observation.display_name,
    unit: observation.unit,
    valueType: observation.value_type,
    time: observation.time.toISOString(),
    value,
    source: observation.source,
    sourceRef: observation.source_ref,
    quality:
      evaluateMetricQuality(
        value,
        observation.metric_quality_config
      )
  };
}

export function mapObservationHistoryToDto(
  observation: LatestObservationRecord
): ObservationHistoryDto {

  const latest =
    mapLatestObservationToDto(
      observation
    );

  return {
    metricId: latest.metricId,
    metricKey: latest.metricKey,
    displayName: latest.displayName,
    unit: latest.unit,
    valueType: latest.valueType,
    time: latest.time,
    value: latest.value,
    source: latest.source,
    sourceRef: latest.sourceRef,
    quality: latest.quality
  };
}
