import assert from "node:assert/strict";
import test from "node:test";

import {
  canDisableAuthentication,
  shouldEnableUnauthenticatedRoleSwitch
} from "./index.js";

test("allows authentication to be disabled in DEV", () => {
  assert.equal(canDisableAuthentication("DEV"), true);
  assert.equal(canDisableAuthentication(" dev "), true);
});

test("allows authentication to be disabled in TEST* environments", () => {
  for (const environment of ["TEST", "TEST1", "TEST2", "TEST-FOO", "test-lab"]) {
    assert.equal(canDisableAuthentication(environment), true, environment);
  }
});

test("allows authentication to be disabled in TST* environments", () => {
  for (const environment of ["TST", "TST1", "TST-FOO", "tst-lab"]) {
    assert.equal(canDisableAuthentication(environment), true, environment);
  }
});

test("rejects disabling authentication in production-like environments", () => {
  for (const environment of ["DEFAULT", "DIT", "FIT", "PROD", "STAGING", "DEVELOPMENT"]) {
    assert.equal(canDisableAuthentication(environment), false, environment);
  }
});

test("enables the unauthenticated role switch in DEV, TEST* and TST*", () => {
  for (const environment of ["DEV", "TEST", "TEST1", "TEST-LAB", "TST", "TST1", "TST-LAB"]) {
    assert.equal(
      shouldEnableUnauthenticatedRoleSwitch(environment, false, true),
      true,
      environment
    );
  }
});

test("keeps the role switch disabled when authentication is enabled", () => {
  for (const environment of ["DEV", "TEST1", "TST1"]) {
    assert.equal(
      shouldEnableUnauthenticatedRoleSwitch(environment, true, true),
      false,
      environment
    );
  }
});

test("keeps the role switch disabled when its feature flag is off", () => {
  for (const environment of ["DEV", "TEST1", "TST1"]) {
    assert.equal(
      shouldEnableUnauthenticatedRoleSwitch(environment, false, false),
      false,
      environment
    );
  }
});

test("keeps the role switch disabled outside DEV, TEST* and TST*", () => {
  for (const environment of ["DIT", "FIT", "PROD", "DEFAULT"]) {
    assert.equal(
      shouldEnableUnauthenticatedRoleSwitch(environment, false, true),
      false,
      environment
    );
  }
});
