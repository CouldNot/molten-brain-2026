// Drug regulatory history: the first-approval and market-withdrawal rows of a drug's
// facts block (node kinds drug_first_approval / drug_withdrawals, mapped in
// js/data.js). The wording helpers are shared with the node browser so a row reads
// the same in both places.
//
// Built with the help of Claude Code.

/**
 * The row label of a mapped `drug.firstApproval`: "First approved", or "First
 * national approval" when its source only knows one country (Drugs@FDA), so a
 * US-only year is never read as the first approval anywhere.
 */
export function approvalLabel(fa, t) {
  return t(fa.national ? "drug.firstNationalApproval" : "drug.firstApproval");
}

/** "1994, United States (FDA)" from a mapped `drug.firstApproval`, or with `elapsed`
 *  (see yearsAgo) "1994 (32 years ago), United States (FDA)". */
export function formatApproval(fa, elapsed = "") {
  const since = elapsed ? ` (${elapsed})` : "";
  const where = fa.countryLabel ? `, ${fa.countryLabel}` : "";
  const agency = fa.agencyLabel ? ` (${fa.agencyLabel})` : "";
  return `${fa.year}${since}${where}${agency}`;
}

/**
 * "32 years ago" for a year, counted from `now` (a Date, today by default). Kept
 * out of formatApproval and out of the generated data: it ages, so it is computed at
 * view time and only where a reader sees it (the detail panel), never baked in.
 */
export function yearsAgo(year, t, now = new Date()) {
  const n = now.getFullYear() - year;
  if (n <= 0) return t("drug.thisYear");
  return t(n === 1 ? "drug.yearAgo" : "drug.yearsAgo", { n });
}

/** "2004, most markets: liver toxicity" from one mapped `drug.withdrawals[]` row. */
export function formatWithdrawal(w) {
  return `${w.year}, ${w.countryLabel}: ${w.reasonLabel}`;
}

/**
 * Withdrawals sharing a (year, reason) folded into one row each, so sibutramine's
 * nine "2010, <country>: cardiac risk" nodes read as one "2010: cardiac risk,
 * Australia, Canada, ..." line. Each withdrawal stays its own node (its own pill
 * rides right after its country). Groups keep the authored order of their first
 * member; within a group a market scope ("most markets", "worldwide") comes first,
 * then countries alphabetically in the reading language (`lang`, e.g. "fr").
 * @param {object[]} withdrawals  mapped `drug.withdrawals` (`year`, `reason`,
 *   `reasonLabel`, `countryLabel`, `scope`, ...)
 * @param {string} [lang]         collation locale
 * @returns {{year: number, reasonLabel: string, items: object[]}[]}
 */
export function groupWithdrawals(withdrawals, lang) {
  const collator = new Intl.Collator(lang);
  const groups = new Map();
  for (const w of withdrawals || []) {
    const key = `${w.year}|${w.reason}`;
    if (!groups.has(key)) groups.set(key, { year: w.year, reasonLabel: w.reasonLabel, items: [] });
    groups.get(key).items.push(w);
  }
  for (const g of groups.values()) {
    g.items.sort((a, b) => (b.scope ? 1 : 0) - (a.scope ? 1 : 0)
      || collator.compare(a.countryLabel, b.countryLabel));
  }
  return [...groups.values()];
}

/**
 * Append the drug's history rows to its facts block.
 *
 * `addFactRow`, `makeProvenancePill`, `sourcesTip` and `t` are the panel's own helpers
 * (js/main.js), passed in so this module owns only the history wording. A withdrawal
 * row carries the `fact-warning` class (caution ink, see index.html); both kinds carry
 * `fact-history` (no capitalization of the prose value). Withdrawals render one row
 * per (year, reason) group (see groupWithdrawals), each country followed by its pill.
 */
export function appendDrugHistory(facts, drug,
  { addFactRow, makeProvenancePill, sourcesTip, t, lang }) {
  const pill = (node) => (node.sources && node.sources.length
    ? makeProvenancePill(node.provenance, sourcesTip(node.sources))
    : makeProvenancePill(node.provenance || null));
  if (drug.firstApproval) {
    const fa = drug.firstApproval;
    addFactRow(facts, approvalLabel(fa, t), formatApproval(fa, yearsAgo(fa.year, t)),
      null, { pill: pill(fa) });
    facts.lastChild.title = t(drug.firstApproval.national ? "drug.firstNationalApprovalTip"
      : "drug.firstApprovalTip");
    facts.lastChild.classList.add("fact-history");
  }
  for (const g of groupWithdrawals(drug.withdrawals, lang)) {
    addFactRow(facts, t("drug.withdrawn"),
      t("drug.withdrawnGroup", { year: g.year, reason: g.reasonLabel }), null);
    const row = facts.lastChild;
    row.classList.add("fact-history", "fact-warning");
    const value = row.querySelector(".fact-value");
    // One unbreakable "<country> [pill]," chip per withdrawal node, so a wrapped
    // line never strands a pill or a comma away from its country.
    g.items.forEach((w, i) => {
      const place = document.createElement("span");
      place.className = "fact-place";
      place.append(w.countryLabel, pill(w));
      if (i < g.items.length - 1) place.append(",");
      value.appendChild(place);
    });
  }
}
