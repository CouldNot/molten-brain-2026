// Unit tests for public/js/update-check.js: reading version.js and deciding whether a
// tab should reload onto a newer deploy, run by tools/tests/test_js_units.py via `node --test`.
import test from "node:test";
import assert from "node:assert/strict";
import { parseVersion, shouldReload } from "../../public/js/update-check.js";

test("reads the version a version.js body declares", () => {
  assert.equal(parseVersion('// header\nwindow.__APP_VERSION__ = "3.128.0";\n'), "3.128.0");
  assert.equal(parseVersion("<html>not found</html>"), null);
  assert.equal(parseVersion(""), null);
});

test("reloads only for another version, once per version", () => {
  assert.equal(shouldReload("3.90.1", "3.122.0", null), true);
  assert.equal(shouldReload("3.122.0", "3.122.0", null), false);
  assert.equal(shouldReload("3.90.1", "3.122.0", "3.122.0"), false, "no reload loop");
  assert.equal(shouldReload("3.90.1", null, null), false);
});
