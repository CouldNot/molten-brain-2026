// Search text helpers: accent/case/Greek folding, a control's visible name, and the
// structured `field:value` query parser. Pure string functions (no DOM state), shared by
// the toolbar search, the drug filter and the Data browser.

// Fold a string for accent- + case-insensitive matching: lowercase, then strip
// combining diacritical marks (NFD decomposes e.g. "é" -> "e" + U+0301, "ç" ->
// "c" + U+0327, which we then drop). So the search/filter find "sérotonine" when
// the user types "seroto", and ignore case (see foldText below). Used by the
// toolbar search + the drug filter so both behave the same.
//
// Greek letter -> its spelled-out Latin name, so a folded string matches whether
// the data uses the glyph (the receptor names: "\u03b12A", "\u03bc (MOR)", "\u03c31") or the user
// types the name they CAN reach on a keyboard ("alpha2a", "mu", "sigma1"). Folding
// both sides through this means "beta" finds "\u03b21" and "alpha" finds "\u03b12A".
export const GREEK_NAMES = {
  "\u03b1": "alpha", "\u03b2": "beta", "\u03b3": "gamma", "\u03b4": "delta",
  "\u03b5": "epsilon", "\u03b6": "zeta", "\u03b7": "eta", "\u03b8": "theta",
  "\u03b9": "iota", "\u03ba": "kappa", "\u03bb": "lambda", "\u03bc": "mu",
  "\u03bd": "nu", "\u03be": "xi", "\u03bf": "omicron", "\u03c0": "pi",
  "\u03c1": "rho", "\u03c3": "sigma", "\u03c2": "sigma", "\u03c4": "tau",
  "\u03c5": "upsilon", "\u03c6": "phi", "\u03c7": "chi", "\u03c8": "psi",
  "\u03c9": "omega",
};

/**
 * An element's visible words: its text with every `aria-hidden` subtree dropped. A
 * decorative glyph is marked `aria-hidden` exactly because it is chrome rather than
 * part of what the control is called (a browse header's chevron, an icon), so
 * anything naming a control after its own label reads it through here instead of
 * `textContent`, which would fold the chrome into the name.
 * @param {Node} node
 * @returns {string}
 */
export function visibleText(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  if (node.getAttribute("aria-hidden") === "true") return "";
  let out = "";
  for (const child of node.childNodes) out += visibleText(child);
  return out;
}

/**
 * The words a control is called by: its own `title` (an icon button's title IS its
 * name), else its accessible name, else its visible words, minus a trailing
 * affordance glyph. A translated link string can bake its own "→" in, and that arrow
 * is the link's affordance rather than part of its name, exactly as an `aria-hidden`
 * chevron is. A wrapping `<label>` answers the same question for the checkbox inside
 * it (it carries neither attribute, so it falls through to its words).
 *
 * Read on demand, never cached: a control that names the state a click would GIVE you
 * renames itself on every flip (the theme + panel-only buttons), and the words are
 * filled from js/i18n.js at DOMContentLoaded, so a cached copy would also be a silent
 * bet on having been taken after that.
 * @param {HTMLElement} elm
 * @returns {string}
 */
export function controlName(elm) {
  const raw = elm.getAttribute("title") || elm.getAttribute("aria-label")
    || visibleText(elm);
  return raw.replace(/\s*[→>]\s*$/, "").trim();
}

export function foldText(s) {
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Spell out Greek letters (after lowercasing, so uppercase \u0391 already became \u03b1),
    // then drop hyphens / Unicode dashes so "5ht" finds "5-HT".
    .replace(/[\u0370-\u03ff]/g, (ch) => GREEK_NAMES[ch] || ch)
    .replace(/[-\u2010-\u2015]/g, "");
}

// Structured search filters: a leading `field:value` (value optionally quoted)
// narrows results to a kind of item by one of its fields. The field name is matched
// accent/case-folded so the English + French names both work. Only drug fields for
// now (class / nomenclature); a drug panel's clickable Class / Nomenclature builds
// such a query. The map's values are the canonical field keys the items carry.
export const SEARCH_FIELDS = {
  class: "class", classe: "class",
  nbn: "nbn", nomenclature: "nbn",
};

// Split a raw query into { field, value, rest }: a recognized `field:"value"`
// prefix (else field=null), plus any trailing free text. value + rest come back
// already folded; an unrecognized field is left as plain free text.
export function parseSearchQuery(raw) {
  const m = String(raw).match(/^\s*([\p{L}]+)\s*:\s*(?:"([^"]*)"|(\S*))\s*([\s\S]*)$/u);
  if (m) {
    const field = SEARCH_FIELDS[foldText(m[1])];
    if (field) {
      const value = foldText(m[2] !== undefined ? m[2] : (m[3] || ""));
      return { field, value, rest: foldText((m[4] || "").trim()) };
    }
  }
  return { field: null, value: "", rest: foldText(String(raw).trim()) };
}
