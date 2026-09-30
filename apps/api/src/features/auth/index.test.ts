import assert from "node:assert/strict";
import test from "node:test";

import { canDisableAuthentication } from "./index.js";

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
