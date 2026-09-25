import { describe, expect, it } from "vitest";

import {
  REQUIRED_API_CONTRACT_VERSION,
  getApiCompatibilityError
} from "./compatibility";

describe("getApiCompatibilityError", () => {
  it("accepts the required API contract", () => {
    expect(
      getApiCompatibilityError({
        apiVersion: "1.44.0",
        contractVersion: REQUIRED_API_CONTRACT_VERSION,
        databaseMigrationLevel: 72
      })
    ).toBeNull();
  });

  it("rejects an incompatible API contract with a clear message", () => {
    const message =
      getApiCompatibilityError({
        apiVersion: "2.0.0",
        contractVersion: REQUIRED_API_CONTRACT_VERSION + 1,
        databaseMigrationLevel: 72
      });

    expect(message).toContain("not compatible");
    expect(message).toContain(
      `requires API contract ${REQUIRED_API_CONTRACT_VERSION}`
    );
  });
});
