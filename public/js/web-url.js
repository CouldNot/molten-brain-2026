// The one scheme guard for data-derived links.
//
// DOM-free on purpose, so a pure module (changelog.js, unit-tested under node) can
// import it without pulling the panel's window-reading helpers along.

/** Whether `url` is an absolute http(s) link. Every data-derived `href` goes through
 *  this, so a stray `javascript:` or `data:` value in a committed field (or a future
 *  external one) can never become a clickable script. */
export function isWebUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}
