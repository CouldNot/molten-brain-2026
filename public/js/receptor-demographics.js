/**
 * receptor_demographic nodes (BETA): resolve them for the receptor / target panel's
 * "Across age and sex" section.
 *
 * No three.js, no DOM: a pure function, unit-tested by
 * tools/tests/receptor_demographics.test.mjs. Each node is a human PET / SPECT group
 * finding about the receptor, never a statement about one visitor: the panel words it
 * conditionally ("reported to decline with age").
 *
 * Built with the help of Claude Code.
 */

/**
 * Resolve one owner's emitted `demographics` list into display rows, age first.
 * @param {object[]} raw  `[{factor, direction, structure, magnitude?, sources, grade}]`.
 * @param {{factors:Object<string,{label:string}>, glyphs:Object<string,string>}} vocab
 *   meta.demographics, labels localized.
 * @returns {{factor:string, factorLabel:string, direction:string, glyph:string,
 *            structure:(string|null), magnitude:(string|null), textKey:string,
 *            sources:object[], provenance:string}[]}
 */
export function resolveDemographics(raw, vocab) {
  const v = vocab || {};
  const order = Object.keys(v.factors || {});
  return (raw || [])
    .map((n) => ({
      factor: n.factor,
      factorLabel: ((v.factors || {})[n.factor] || {}).label || n.factor,
      direction: n.direction,
      glyph: (v.glyphs || {})[n.direction] || "",
      structure: n.structure || null,
      magnitude: n.magnitude || null,
      // i18n key of the conditional sentence: `no_difference` reads per factor.
      textKey: `demog.${n.factor}.${n.direction}`,
      sources: n.sources || [],
      provenance: n.grade || "llm",
    }))
    .sort((a, b) => order.indexOf(a.factor) - order.indexOf(b.factor));
}
