// Unit tests for public/js/web-url.js, run by tools/tests/test_js_units.py.
import test from "node:test";
import assert from "node:assert/strict";
import { isWebUrl } from "../../public/js/web-url.js";

test("only absolute http(s) links pass", () => {
  assert.equal(isWebUrl("https://www.clinpgx.org/clinicalAnnotation/1"), true);
  assert.equal(isWebUrl("HTTP://example.org"), true);
  // Regression: the ClinPGx variant link was set as an href with no scheme check.
  assert.equal(isWebUrl("javascript:alert(1)"), false);
  assert.equal(isWebUrl("data:text/html,x"), false);
  assert.equal(isWebUrl("//example.org"), false);
  assert.equal(isWebUrl(undefined), false);
  assert.equal(isWebUrl(42), false);
});
