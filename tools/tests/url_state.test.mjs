// Unit tests for public/js/url-state.js, run by tools/tests/test_js_units.py.
import test from "node:test";
import assert from "node:assert/strict";

// The registry touches only `window.location` + `history`; a stub is enough.
globalThis.window = { location: { hash: "", pathname: "/", search: "" }, addEventListener() {} };
globalThis.history = { replaceState(_s, _t, url) { window.location.hash = url.startsWith("#") ? url : ""; } };
const { createUrlState } = await import("../../public/js/url-state.js");

test("resetAll puts every resettable view back to its default and skips the rest", async () => {
  const state = createUrlState();
  const control = { rotate: false, names: true, cam: "1,2,3" };
  state.register("rotate", {
    read: () => (control.rotate ? null : "0"),
    write: (v) => { control.rotate = v !== "0"; },
    reset: () => { control.rotate = true; },
  });
  state.register("names", {
    read: () => (control.names ? "1" : null),
    write: (v) => { control.names = v !== "0"; },
    reset: () => { control.names = false; },
  });
  state.register("cam", { read: () => control.cam, write: (v) => { control.cam = v; } });
  state.resetAll();
  assert.deepEqual(control, { rotate: true, names: false, cam: "1,2,3" });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(window.location.hash, "#cam=1,2,3");
});
