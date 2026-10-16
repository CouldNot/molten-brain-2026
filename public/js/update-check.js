// Reload onto the latest deploy when the page on screen is an older build.
//
// The service worker already asks the server first on every load (sw.js), so a stale
// build only reaches the screen two ways: the browser restores a tab it kept in memory
// (bfcache, a phone's frozen tab, an installed PWA brought back to the front) without
// loading anything, or the network was not up yet at launch (a phone waking) and sw.js
// fell back to its offline copy. Both are caught here: on load, when the tab becomes
// visible again, and when the connection comes back, fetch version.js past every cache
// and reload if it names another version. Offline the fetch fails and the cached build
// keeps running, which is the intended fallback.
//
// A reload keeps the view, since the view lives in the URL (js/url-state.js). One
// sessionStorage key remembers the version a reload was attempted for, so a server
// that keeps answering a version this tab cannot load never loops.
//
// Made with the help of Claude Code.

const TRIED_KEY = "neurarium-update-tried";
const MIN_INTERVAL_MS = 30_000;

/** The version string a version.js body declares, or null. */
export function parseVersion(text) {
  const m = /__APP_VERSION__\s*=\s*["']([^"']+)["']/.exec(text || "");
  return m ? m[1] : null;
}

/** Whether a tab running `local` should reload for `remote`, given the version it last
 * reloaded for (`tried`, null when none). */
export function shouldReload(local, remote, tried) {
  return Boolean(local && remote && remote !== local && remote !== tried);
}

function start() {
  const local = window.__APP_VERSION__;
  let last = 0;
  async function check() {
    const now = Date.now();
    if (!local || now - last < MIN_INTERVAL_MS) return;
    last = now;
    let remote;
    try {
      const res = await fetch("version.js", { cache: "no-store" });
      if (!res.ok) return;
      remote = parseVersion(await res.text());
    } catch {
      return; // offline: keep the cached build
    }
    let tried = null;
    try { tried = sessionStorage.getItem(TRIED_KEY); } catch { /* storage blocked */ }
    if (!shouldReload(local, remote, tried)) return;
    try { sessionStorage.setItem(TRIED_KEY, remote); } catch { /* storage blocked */ }
    location.reload();
  }
  check();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
  window.addEventListener("pageshow", (e) => { if (e.persisted) { last = 0; check(); } });
  window.addEventListener("online", () => { last = 0; check(); });
}

if (typeof window !== "undefined" && typeof document !== "undefined") start();
