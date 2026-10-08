# CPIC prescribing-guidance export (corpus #15)

What a metabolizer phenotype *means* for one prescription, pulled from the
[CPIC](https://cpicpgx.org/) API on 2026-10-08. The third layer over corpus #13 (how
common each clearance speed is, per population group) and the drug enzyme nodes (which
isoform clears the drug): neither of those says what either implies for a patient, and
this is the only corpus here that does.

**Verbatim only.** `cpic_recommendations.json` holds CPIC's own strings exactly as the
API returned them. Nothing between here and the panel rewrites, trims or joins a
sentence: a row's two citations quote its `implication` and its `recommendation` as they
stand, which is the whole reason the export is committed rather than re-fetched.

Format: one JSON object, `fetched` / `api` / `licence` / `guidelines` / `rows`. 104 rows
over 18 drugs, 4 genes (CYP2D6, CYP2C19, CYP2C9, CYP2B6) and 6 guidelines; 51 level A
rows and 53 level B; 55 of them carry an `assumes` block, because CPIC files tricyclic
and SRI dosing on two genes at once and a row filed under one only speaks with the other
pinned to normal.

What the fetcher leaves out, all of it printed on every run so no gap passes as covered:
genes with no metabolizer-frequency profile here (HLA-A / HLA-B with carbamazepine,
oxcarbazepine and phenytoin; SCN1A; the urea-cycle genes with valproate), CPIC's
uncertainty phenotypes (`Likely`/`Possible` Intermediate, `Indeterminate`, `No Result`),
populations this panel cannot read (`pediatrics`), pairs CPIC has levelled but written no
guideline for yet (aripiprazole, brivaracetam, pitolisant, risperidone), and
ondansetron, whose guideline files its rows under tropisetron.

Like corpus #13 and unlike the book corpora this file is freely redistributable and
small, so it is committed rather than kept author-side: that is what lets
`check_data.py` gate the quotes on any clone with no skipped-and-warned path.
`tools/generated_cache/cpic_guidance.json` pins its sha256, and family 12 re-derives
every emitted row, quote and assumption from it (see `tools/data_generators/cpic.py`).
Refreshing therefore means re-running `python tools/fetch/fetch_cpic.py`, or generation
fails loudly.

## Citation

CPIC curated content is released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), which asks for
attribution rather than requiring it:

- Primary source: [www.clinpgx.org](https://www.clinpgx.org/), accessed 2026-10-08.
- Each row names its guideline and carries that guideline's PubMed citations; the
  guideline page is `https://www.clinpgx.org/guideline/<the row's page id>`.
- CPIC guideline content is subject to update, which is what the `fetched` date and the
  per-row `version` are for: refer to cpicpgx.org for the current text.
