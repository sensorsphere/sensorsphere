import type {
  Logger
} from "pino";

import type {
  MeasurementRepository
} from "./domain/measurement-repository.js";

import {
  SensorCache
} from "./cache.js";

export function startScheduler(
  cache: SensorCache,
  repository: MeasurementRepository,
  logger: Logger
): void {

  const flush =
    async (): Promise<void> => {

      const timestamp =
      new Date();

    timestamp.setSeconds(
      0,
      0
    );

    const snapshots =
      cache.createDirtySnapshots(
        timestamp
      );

    if (
      snapshots.length === 0
    ) {
      return;
    }

    try {

      await repository
        .saveSnapshotBatch(
          snapshots
        );

      for (
        const snapshot
        of snapshots
      ) {

        cache.markClean(
          snapshot.sensorUid
        );
      }

      logger.info(
        {
          count:
            snapshots.length,

          timestamp
        },
        "Sensor snapshots persisted"
      );

    } catch (error) {

      logger.error(
        { error },
        "Sensor snapshot persistence failed"
      );
    }
    };

  const now =
    new Date();

  const delay =
    60_000 -
    (
      now.getSeconds() *
      1000 +
      now.getMilliseconds()
    );

  setTimeout(
    () => {

      void flush();

      setInterval(
        () => void flush(),
        60_000
      );

    },
    delay
  );
}