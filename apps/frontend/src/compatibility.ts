export const REQUIRED_API_CONTRACT_VERSION = 1;

export interface ApiCompatibilityInfo {
  apiVersion: string;
  contractVersion: number;
  databaseMigrationLevel: number | null;
}

export function getApiCompatibilityError(
  info: ApiCompatibilityInfo
): string | null {
  if (info.contractVersion !== REQUIRED_API_CONTRACT_VERSION) {
    return [
      "This frontend is not compatible with the running SensorSphere API.",
      `Frontend requires API contract ${REQUIRED_API_CONTRACT_VERSION},`,
      `but API ${info.apiVersion} exposes contract ${info.contractVersion}.`,
      "Deploy a validated SensorSphere Stack Release."
    ].join(" ");
  }

  return null;
}
