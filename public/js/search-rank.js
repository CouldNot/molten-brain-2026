// Relevance rank of one search row against a query, all three already folded by
// main.js foldText (lowercase, accents + dashes gone). Lower ranks sort first;
// null means no match. Pure, no DOM, so tools/tests/search_rank.test.mjs covers it.
//
//   0  the label starts with the query          "hipp"  -> "hippocampus"
//   1  the query is a whole word of the keywords "mph"   -> methylphenidate's aliases
//      or starts a word of the label            "nac"   -> "neuronal ... nachr"
//   2  the label contains it mid-word           "mph"   -> "amphetamine"
//   3  the keywords contain it mid-word         "accu"  -> a drug listing "accumbens"
//
// Rank 1 exists for acronyms: "LC" typed for the locus coeruleus would otherwise
// lose to every label that merely contains "lc" (acetylcholine), since an alias
// lives in the keywords, which used to rank below any label hit.

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * @param {string} label    folded row label
 * @param {string} keywords folded row keywords ("" when none)
 * @param {string} rest     folded query, non-empty
 * @returns {number|null}
 */
export function rankMatch(label, keywords, rest) {
  if (label.startsWith(rest)) return 0;
  const q = escape(rest);
  if (new RegExp(`(^|[^a-z0-9])${q}([^a-z0-9]|$)`).test(keywords)
      || new RegExp(`[^a-z0-9]${q}`).test(label)) return 1;
  if (label.includes(rest)) return 2;
  if (keywords.includes(rest)) return 3;
  return null;
}
