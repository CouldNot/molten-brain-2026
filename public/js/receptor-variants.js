/**
 * receptor_variant nodes (ClinPGx clinical annotations, corpus #20): resolve them for
 * the receptor / target panel's "Genetic variants" section and the drug panel's
 * derived list.
 *
 * No three.js, no DOM: pure functions, unit-tested by
 * tools/tests/receptor_variants.test.mjs. Each node is an association a study
 * reported for a variant of this gene, never a statement about one visitor: the panel
 * words it conditionally ("may be associated") and carries one caveat.
 *
 * Built with the help of Claude Code.
 */

/**
 * Resolve one owner's emitted `variants` list into display rows (emitted order kept:
 * strongest level first, then variant).
 * @param {object[]} raw `[{annotation, variant, level, categories, drugs, drug_names?,
 *   phenotypes, population?, pmids, genotypes, url, sources, grade}]`.
 * @param {{levels:Object<string,{strength:string,label:string}>,
 *   categories:Object<string,string>, populations:Object<string,string>}} vocab
 *   meta.variants, labels localized.
 * @param {(id:string)=>(string|null)} drugName our drug id -> its display name.
 * @returns {object[]}
 */
export function resolveVariants(raw, vocab, drugName) {
  const v = vocab || {};
  const name = drugName || (() => null);
  return (raw || []).map((n) => {
    const level = (v.levels || {})[n.level] || {};
    return {
      annotation: n.annotation,
      variant: n.variant,
      level: n.level,
      strength: level.strength || "",
      levelLabel: level.label || "",
      categories: (n.categories || []).map((c) => (v.categories || {})[c] || c),
      // Our drugs first (linkable), then the upstream names no roster drug answers to.
      drugs: (n.drugs || []).map((id) => ({ id, name: name(id) || id })),
      drugNames: n.drug_names || [],
      phenotypes: n.phenotypes || [],
      population: n.population ? ((v.populations || {})[n.population] || n.population) : null,
      pmids: n.pmids || 0,
      url: n.url || null,
      sources: n.sources || [],
      provenance: n.grade || "llm",
    };
  });
}

/**
 * Group resolved rows by variant, groups in first-appearance order (so the group
 * holding the strongest level leads), rows kept in order inside each group.
 * @param {object[]} rows from resolveVariants.
 * @returns {{variant:string, rows:object[]}[]}
 */
export function groupByVariant(rows) {
  const groups = new Map();
  for (const r of rows || []) {
    if (!groups.has(r.variant)) groups.set(r.variant, []);
    groups.get(r.variant).push(r);
  }
  return [...groups].map(([variant, list]) => ({ variant, rows: list }));
}

/**
 * Every annotation that names one drug, across every target: the drug panel's derived
 * list. Only annotations that name the drug itself (never a class such as "opioids").
 * @param {string} drugId
 * @param {{id:string, name:string, variantInfo?:object[]}[]} targets data.targets.
 * @returns {{target:object, row:object}[]}
 */
export function variantsForDrug(drugId, targets) {
  const out = [];
  const seen = new Set();
  for (const target of targets || []) {
    for (const row of target.variantInfo || []) {
      // A receptor-linked target shares its receptor's rows: count each once.
      const key = `${target.id}|${row.annotation}`;
      if (seen.has(key) || !row.drugs.some((d) => d.id === drugId)) continue;
      seen.add(key);
      out.push({ target, row });
    }
  }
  return out;
}
