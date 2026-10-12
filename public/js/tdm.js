// Therapeutic drug monitoring chips: a drug's therapeutic reference range and
// laboratory alert level (node kinds drug_therapeutic_range / drug_alert_level, from
// the AGNP consensus guideline, corpus #19; mapped in js/data.js). The wording helpers
// are shared with the node browser so a value reads the same in both places.
//
// Built with the help of Claude Code.

/** A concentration number in the reading language: 1000 -> "1,000" / "1 000",
 *  0.4 -> "0.4" / "0,4". */
export function formatNumber(v, lang) {
  return Number(v).toLocaleString(lang || "en", { maximumFractionDigits: 3 });
}

const analyteSuffix = (x) => (x.analyte ? ` (${x.analyte})` : "");

/** "350–600 ng/mL", plus "(nortriptyline)" when the range is of another analyte. */
export function formatRange(r, lang) {
  return `${formatNumber(r.low, lang)}–${formatNumber(r.high, lang)} ${r.unit}`
    + analyteSuffix(r);
}

/** "1,000 ng/mL" from a mapped `drug.alertLevel`. */
export function formatAlert(a, lang) {
  return `${formatNumber(a.value, lang)} ${a.unit}` + analyteSuffix(a);
}

/**
 * Append the range + alert chips to the Pharmacokinetics block `host`. The TDM
 * recommendation level rides in the range chip's tooltip (it is the guideline's
 * verdict on that row, not a molecule fact). `el`, `makeProvenancePill`,
 * `sourcesTip` and `t` are the panel's own helpers (js/main.js).
 */
export function appendTdmChips(host, drug, { el, makeProvenancePill, sourcesTip, t, lang }) {
  const chip = (node, labelKey, tip, value) => {
    const c = el("span", "hl-chip");
    const label = el("span", "hl-label", `${t(labelKey)} `);
    label.title = tip;
    c.appendChild(label);
    c.appendChild(el("span", "hl-val", value));
    c.appendChild(node.sources && node.sources.length
      ? makeProvenancePill(node.provenance, sourcesTip(node.sources))
      : makeProvenancePill(node.provenance || null));
    host.appendChild(c);
  };
  const r = drug.therapeuticRange;
  if (r) {
    const level = r.tdmLevel ? ` ${t("drug.tdmLevel", { level: r.tdmLevel,
      label: t(`drug.tdmLevel${r.tdmLevel}`) })}` : "";
    chip(r, "drug.therapeuticRange", t("drug.therapeuticRangeTip") + level,
      formatRange(r, lang));
  }
  const a = drug.alertLevel;
  if (a) chip(a, "drug.alertLevel", t("drug.alertLevelTip"), formatAlert(a, lang));
}
