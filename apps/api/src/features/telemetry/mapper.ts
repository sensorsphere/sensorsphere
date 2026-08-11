import type {
  MeasurementRecord
} from "./repository.js";

import type {
  MeasurementDto
} from "./dto.js";

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
