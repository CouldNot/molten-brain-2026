// Drug regulatory history: the first-approval and market-withdrawal rows of a drug's
// facts block (node kinds drug_first_approval / drug_withdrawals, mapped in
// js/data.js). The wording helpers are shared with the node browser so a row reads
// the same in both places.
//
// Built with the help of Claude Code.

/** "1994, United States (FDA)" from a mapped `drug.firstApproval`. */
export function formatApproval(fa) {
  const where = fa.countryLabel ? `, ${fa.countryLabel}` : "";
  const agency = fa.agencyLabel ? ` (${fa.agencyLabel})` : "";
  return `${fa.year}${where}${agency}`;
}

/** "2004, most markets: liver toxicity" from one mapped `drug.withdrawals[]` row. */
export function formatWithdrawal(w) {
  return `${w.year}, ${w.countryLabel}: ${w.reasonLabel}`;
}

/**
 * Append the drug's history rows to its facts block.
 *
 * `addFactRow`, `makeProvenancePill`, `sourcesTip` and `t` are the panel's own helpers
 * (js/main.js), passed in so this module owns only the history wording. A withdrawal
 * row carries the `fact-warning` class (caution ink, see index.html); both kinds carry
 * `fact-history` (no capitalization of the prose value).
 */
export function appendDrugHistory(facts, drug, { addFactRow, makeProvenancePill, sourcesTip, t }) {
  const pill = (node) => (node.sources && node.sources.length
    ? makeProvenancePill(node.provenance, sourcesTip(node.sources))
    : makeProvenancePill(node.provenance || null));
  if (drug.firstApproval) {
    addFactRow(facts, t("drug.firstApproval"), formatApproval(drug.firstApproval), null, {
      pill: pill(drug.firstApproval),
    });
    facts.lastChild.title = t("drug.firstApprovalTip");
    facts.lastChild.classList.add("fact-history");
  }
  for (const w of drug.withdrawals || []) {
    addFactRow(facts, t("drug.withdrawn"), formatWithdrawal(w), null, { pill: pill(w) });
    facts.lastChild.classList.add("fact-history", "fact-warning");
  }
}
