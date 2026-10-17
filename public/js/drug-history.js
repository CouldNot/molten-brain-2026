// Drug regulatory history: the originator, first-approval, market-withdrawal and
// current-holder rows of a drug's facts block (node kinds drug_originator /
// drug_originator_country / drug_first_approval / drug_withdrawals / drug_holders,
// mapped in js/data.js). The wording helpers are shared with the node browser so a row
// reads the same in both places.
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

/** "CHEPLAPHARM (United States)" from one mapped `drug.holders[]` row (several
 *  names when the market's brand-name products have different holders). */
export function formatHolder(h) {
  return `${h.names.join(", ")} (${h.marketLabel})`;
}

/** "Lundbeck", or "Rhône-Poulenc (now Sanofi)" when a source names its current name,
 *  from a mapped `drug.originator`. */
export function formatOriginator(o, t) {
  return o.now ? t("drug.originatorNow", { name: o.name, now: o.now }) : o.name;
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
 * Append one row whose value is a list of `<text> [pill]` chips, each chip one node
 * (an unbreakable span, so a wrapped line never strands a pill or a comma away from
 * its text). `value` is a leading plain text ("" for none).
 */
function appendChipRow(facts, label, value, items, text, pill, addFactRow) {
  const frag = document.createDocumentFragment();
  items.forEach((x, i) => {
    const place = document.createElement("span");
    place.className = "fact-place";
    place.append(text(x), pill(x));
    if (i < items.length - 1) place.append(",");
    frag.appendChild(place);
  });
  addFactRow(facts, label, value, null, { pill: frag });
  facts.lastChild.classList.add("fact-history");
  return facts.lastChild;
}

/**
 * Append the drug's history rows to its facts block.
 *
 * `addFactRow`, `nodePill` and `t` are the panel's own helpers
 * (js/main.js), passed in so this module owns only the history wording. A withdrawal
 * row carries the `fact-warning` class (caution ink, see css/panel.css); every row carries
 * `fact-history` (no capitalization of the prose value). Order: originator (+ its
 * country), first approval, withdrawals (one row per (year, reason) group, see
 * groupWithdrawals), current holders (one chip per market).
 */
export function appendDrugHistory(facts, drug,
  { addFactRow, nodePill, t, lang }) {
  if (drug.originator) {
    const o = drug.originator;
    const items = [{ text: formatOriginator(o, t), node: o }];
    if (o.country) items.push({ text: o.country.label, node: o.country });
    appendChipRow(facts, t("drug.originator"), "", items, (x) => x.text,
      (x) => nodePill(x.node), addFactRow).title = t("drug.originatorTip");
  }
  if (drug.firstApproval) {
    const fa = drug.firstApproval;
    addFactRow(facts, approvalLabel(fa, t), formatApproval(fa, yearsAgo(fa.year, t)),
      null, { pill: nodePill(fa) });
    facts.lastChild.title = t(drug.firstApproval.national ? "drug.firstNationalApprovalTip"
      : "drug.firstApprovalTip");
    facts.lastChild.classList.add("fact-history");
  }
  for (const g of groupWithdrawals(drug.withdrawals, lang)) {
    appendChipRow(facts, t("drug.withdrawn"),
      t("drug.withdrawnGroup", { year: g.year, reason: g.reasonLabel }), g.items,
      (w) => w.countryLabel, nodePill, addFactRow).classList.add("fact-warning");
  }
  if ((drug.holders || []).length) {
    appendChipRow(facts, t("drug.holders"), "", drug.holders, formatHolder, nodePill,
      addFactRow).title = t("drug.holdersTip");
  }
}
