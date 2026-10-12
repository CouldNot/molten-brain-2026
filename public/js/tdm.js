// Pharmacokinetics chips: the drug panel's "label value pill" chips (time to peak,
// half-life, a metabolite's half-life) and the therapeutic drug monitoring ones (the
// therapeutic reference range and laboratory alert level, node kinds
// drug_therapeutic_range / drug_alert_level, from the AGNP consensus guideline, corpus
// #19; mapped in js/data.js). Every number goes through `formatNumber`, so all chips
// read in the same locale ("0,3–3 h" and "0,4–0,8 mmol/L" in French). The wording
// helpers are shared with the node browser so a value reads the same in both places.
//
// Built with the help of Claude Code.

/** A concentration number in the reading language: 1000 -> "1,000" / "1 000",
 *  0.4 -> "0.4" / "0,4". */
export function formatNumber(v, lang) {
  return Number(v).toLocaleString(lang || "en", { maximumFractionDigits: 3 });
}

/**
 * A duration from a `{hours, hours_max?}` node, in the unit its upper bound reads
 * best in: minutes under 1 h, hours under 48 h, else days. Integers plainly, else one
 * decimal (a near-integer snaps to it). e.g. {hours: 0.3, hours_max: 3} ->
 * "0.3–3 h" / "0,3–3 h"; {hours: 0.25} -> "15 min". `t` supplies the unit words.
 */
export function formatDuration(hl, t, lang) {
  if (!hl || typeof hl.hours !== "number") return "";
  const lo = hl.hours;
  const hi = typeof hl.hours_max === "number" ? hl.hours_max : null;
  const ref = hi != null ? hi : lo; // pick the display unit off the upper bound
  let div, unit;
  if (ref < 1) { div = 1 / 60; unit = t("drug.hlMinutes"); }
  else if (ref < 48) { div = 1; unit = t("drug.hlHours"); }
  else { div = 24; unit = t("drug.hlDays"); }
  const fmt = (h) => {
    const v = h / div;
    const r = Math.abs(v - Math.round(v)) < 0.05 ? Math.round(v) : Math.round(v * 10) / 10;
    return formatNumber(r, lang);
  };
  return hi != null && hi !== lo
    ? `${fmt(lo)}–${fmt(hi)} ${unit}`
    : `${fmt(lo)} ${unit}`;
}

/**
 * One "label value pill" chip (`.hl-chip`), the shape every Pharmacokinetics value
 * takes. `h` = the panel's helpers {el, makeProvenancePill, sourcesTip};
 * `tip` titles the label; `cls` adds a class (e.g. "metab-hl"); `bare` drops the pill
 * of an unsourced value instead of showing its grade (a metabolite's T½ borrowed
 * from its own drug row, graded there). Returned unattached,
 * so a caller can append extras (the half-life's non-linear warning) first.
 */
export function valueChip(h, { label, tip, value, provenance, sources, cls, bare }) {
  const c = h.el("span", cls ? `hl-chip ${cls}` : "hl-chip");
  const l = h.el("span", "hl-label", `${label} `);
  if (tip) l.title = tip;
  c.appendChild(l);
  c.appendChild(h.el("span", "hl-val", value));
  if (sources && sources.length)
    c.appendChild(h.makeProvenancePill(provenance, h.sourcesTip(sources)));
  else if (!bare) c.appendChild(h.makeProvenancePill(provenance || null));
  return c;
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
 * verdict on that row, not a molecule fact). `h` = the panel's own helpers
 * {el, makeProvenancePill, sourcesTip, t, lang} (js/main.js).
 */
export function appendTdmChips(host, drug, h) {
  const { t, lang } = h;
  const chip = (node, labelKey, tip, value) => host.appendChild(valueChip(h, {
    label: t(labelKey), tip, value, provenance: node.provenance, sources: node.sources }));
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
