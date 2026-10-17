/**
 * Persisted preferences, the one place that talks to localStorage.
 *
 * Several controls are lasting choices about how the site is used rather than
 * per-visit actions (panel-only mode, "show active metabolites", the node browser's
 * mirrored twins), and each was growing its own load/save pair around the same
 * try/catch. Storage throws in private mode and on a browser set to block site data,
 * so every read falls back to the caller's default and every write is best-effort:
 * the control still works, it just forgets.
 *
 * Flags are stored as the literal "on" / "off" so a stored preference stays legible
 * in devtools; anything else (a theme name, a speed, a seen-version mark) goes through
 * the string pair, and its caller validates what it reads back.
 *
 * The classic scripts that run before any module (`js/i18n.js` for the language) and
 * `js/update-check.js`'s per-tab sessionStorage stamp keep their own guarded access:
 * the first cannot import, the second is not a lasting preference.
 *
 * Built with the help of Claude Code.
 */

/**
 * Read a stored flag.
 *
 * @param {string} key localStorage key ("neurarium.<name>")
 * @param {boolean} [dflt=true] value for a key that was never written, or when
 *   storage is unavailable
 * @returns {boolean}
 */
export function loadFlag(key, dflt = true) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "on") return true;
    if (raw === "off") return false;
  } catch {
    /* private mode / storage disabled: fall through to the default. */
  }
  return dflt;
}

/**
 * Store a flag, best-effort.
 *
 * @param {string} key localStorage key ("neurarium.<name>")
 * @param {boolean} on
 */
export function saveFlag(key, on) {
  try {
    localStorage.setItem(key, on ? "on" : "off");
  } catch {
    /* private mode / storage disabled: the choice just won't survive a reload. */
  }
}

/**
 * Read a stored string.
 *
 * @param {string} key localStorage key ("neurarium.<name>")
 * @param {?string} [dflt=null] value for a key never written, or when storage is
 *   unavailable
 * @returns {?string}
 */
export function loadString(key, dflt = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? dflt : raw;
  } catch {
    /* private mode / storage disabled: fall through to the default. */
    return dflt;
  }
}

/**
 * Store a string, best-effort.
 *
 * @param {string} key localStorage key ("neurarium.<name>")
 * @param {string} value
 */
export function saveString(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* private mode / storage disabled: the choice just won't survive a reload. */
  }
}
