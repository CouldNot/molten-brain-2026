"""Read the committed CPIC prescribing-guidance export (corpus #15).

The export lives in `tools/data/cpic/`, committed verbatim: the CPIC recommendation rows
for the gene-drug pairs this roster actually covers. Like PharmFreq (#13) and unlike the
book corpora, it ships with the repo (CPIC content is CC0), so its gate runs on every
clone instead of being skipped-and-warned.

Three consumers, one reader, so the rows cannot drift between them:

* `tools/fetch/fetch_cpic.py` pulls the API and writes both the export and
  `tools/generated_cache/cpic_guidance.json`;
* `data_generators/provenance.py` verifies, at generation time, that the export still
  hashes to what that cache pinned;
* `tools/check_data.py` re-derives every emitted row and quote from the export and
  requires an exact match.

**What one node is.** One per (drug, gene, phenotype): "for a CYP2D6 poor metabolizer
taking nortriptyline, CPIC states X and recommends Y". The implication and the
recommendation are two different sentences, both load-bearing for a reader, so the node
carries **two citations** rather than splitting into two nodes: one claim, two quotes.

**The two-gene problem.** 1140 of CPIC's rows are keyed by two genes at once
(amitriptyline is dosed on CYP2D6 *and* CYP2C19), so a row isolates neither. Only rows
whose other gene is the Normal Metabolizer are kept, and the assumption rides the row as
`assumes`, because "PM on CYP2D6" means nothing clinically until the other route is
pinned down.

**What is deliberately dropped**: CPIC's uncertainty phenotypes (`Likely`/`Possible`
Intermediate, `Indeterminate`, `No Result`) have no population frequency to pair with,
and non-`general` populations (`pediatrics`, `PHT naive`, ...) are a different question
than the one the panel asks.

Stdlib only. Built with the help of Claude Code.
"""
from __future__ import annotations

import json
import os

from .pharmfreq import GENE_ENZYMES, sha256  # noqa: F401  (sha256 re-exported)

# Repo-relative, so it can be handed to `check_data.py` through `meta.source_corpora`
# without ever naming an absolute path.
EXPORT_DIR = "tools/data/cpic"
EXPORT_NAME = "cpic_recommendations.json"

# CPIC's phenotype strings -> our METABOLIZER_PHENOTYPES slugs. Spelled out rather than
# abbreviated on the fly so an upstream rename is a loud failure here instead of a
# silently dropped row. Everything absent from this map is dropped on purpose (see the
# module docstring): there is no frequency to pair an "Indeterminate" with.
PHENOTYPE_SLUGS = {
    "Poor Metabolizer": "PM",
    "Intermediate Metabolizer": "IM",
    "Normal Metabolizer": "NM",
    "Rapid Metabolizer": "RM",
    "Ultrarapid Metabolizer": "UM",
}

# CPIC files some guidelines by patient population, and the choice is not cosmetic:
# atomoxetine's rows exist only as `pediatrics` and `adults`, phenytoin's only as
# `PHT naive` and `PHT use >3mos`, and those two phenytoin lists give different advice.
# So one population is chosen per gene-drug pair, in this order, which is the question
# the panel asks: an adult who is about to start the drug. A pair whose populations are
# all outside this tuple publishes nothing (`fetch_cpic.py` prints it), because
# averaging two kinds of patient into one list would invent a recommendation CPIC never
# wrote. The label travels with the block, so a list that is not `general` says so.
POPULATIONS = ("general", "adults", "PHT naive")

# The populations a reader needs told apart from `general`, as {en, fr} like every other
# display string. Every readable population but the first needs one (checked below), so
# a new entry in POPULATIONS cannot reach the panel as an untranslated CPIC string.
POPULATION_LABELS = {
    "adults": {"en": "adults", "fr": "adultes"},
    "PHT naive": {"en": "patients new to phenytoin",
                  "fr": "patients n'ayant jamais pris de phénytoïne"},
}

assert set(POPULATIONS[1:]) <= set(POPULATION_LABELS), \
    "every readable CPIC population but the default needs an {en, fr} label"

# The phenotype a co-dosed gene has to be in for a row to say anything about the gene
# the row is filed under.
ASSUMED = "Normal Metabolizer"


class ExportError(Exception):
    """The export on disk is not the one this code knows how to read."""


def export_path(root: str) -> str:
    """The committed export, under a repo root."""
    return os.path.join(root, *EXPORT_DIR.split("/"), EXPORT_NAME)


def read_export(path: str) -> dict:
    """The export as written by `fetch_cpic.py`, shape-checked."""
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except FileNotFoundError:
        raise ExportError(f"{path}: not found (re-run tools/fetch/fetch_cpic.py)")
    except json.JSONDecodeError as exc:
        raise ExportError(f"{path}: not readable JSON ({exc})")
    for key in ("fetched", "guidelines", "rows"):
        if key not in data:
            raise ExportError(f"{path}: no {key!r} block (re-run tools/fetch/fetch_cpic.py)")
    for row in data["rows"]:
        for key in ("drug", "gene", "phenotype", "implication", "recommendation",
                    "classification", "guideline", "population"):
            if key not in row:
                raise ExportError(f"{path}: a row has no {key!r}")
        if row["phenotype"] not in PHENOTYPE_SLUGS.values():
            raise ExportError(f"{path}: unknown phenotype {row['phenotype']!r} "
                              f"(extend PHENOTYPE_SLUGS)")
        if row["gene"] not in GENE_ENZYMES:
            raise ExportError(f"{path}: {row['gene']!r} has no metabolizer-frequency "
                              f"profile (see pharmfreq.GENE_ENZYMES)")
        if row["population"] not in POPULATIONS:
            raise ExportError(f"{path}: population {row['population']!r} is not one "
                              f"this panel reads (see POPULATIONS)")
    return data


def sources_for(row: dict, guideline: dict) -> list[dict]:
    """The two citations one row carries: what the phenotype does, then what to do.

    Both are CPIC's own sentences, copied by code out of the pinned export, so both are
    `extraction: "code"` on a `machine` corpus and neither needs a judge. `page` is the
    guideline's ClinPGx id, which resolves to a public page.
    """
    return [{"corpus": "cpic", "page": guideline["clinpgxid"], "quote": quote,
             "provenance": "verified", "extraction": "code"}
            for quote in (row["implication"], row["recommendation"]) if quote]


def enzyme_claims_for(guidance: dict[str, list[dict]]) -> dict[str, list[dict]]:
    """``drug id -> the enzyme rows CPIC's own wording substantiates``.

    CPIC levels a pair because the gene's activity moves the drug's exposure, but a
    *level* is a verdict, not a sentence: using it as a source would be us asserting
    "this enzyme clears this drug" and citing a table key for it. So only one CPIC
    phrasing is read, the stock faster-metabolizer line "Consider alternative drug not
    metabolized by CYP2C19; If clomipramine is warranted, ...", and only when it names
    both the gene and the drug. That sentence *states* the route, so it can be quoted
    for it; a pair CPIC never phrases that way adds nothing here.

    Fires on 5 pairs today, 4 of which already have the row from a book or a Wikipedia
    article (:func:`generate_data._load_drug_enzymes` keeps the earlier source, so this
    is a filler, never an override). The fifth is clomipramine's CYP2C19, which Stahl
    attributes to CYP1A2 and the English article does not mention at all: without this
    the panel would carry CPIC's CYP2C19 guidance over a drug whose enzyme list has no
    CYP2C19 in it.
    """
    out: dict[str, list[dict]] = {}
    for drug in sorted(guidance):
        for block in guidance[drug]:
            phrase = f"not metabolized by {block['gene']}"
            for row in block["rows"]:
                rec = row.get("recommendation") or ""
                if phrase not in rec or drug not in rec.lower():
                    continue
                quote = next((s for s in row["sources"] if s["quote"] == rec), None)
                if quote is None:  # pragma: no cover - sources_for emits both
                    continue
                out.setdefault(drug, []).append({
                    "enzyme": block["enzyme"], "role": "substrate",
                    "sources": [dict(quote)],
                })
                break  # one claim per gene: the rows repeat the same sentence
    return out


def guidance_for(data: dict) -> dict[str, list[dict]]:
    """``drug id -> one block per gene``, in the order the panel renders them.

    Genes are ordered by how many rows they carry (the gene CPIC says most about first),
    then alphabetically; rows inside a gene follow `PHENOTYPE_SLUGS`, which runs slowest
    to fastest, the same axis the frequency table uses.
    """
    order = list(PHENOTYPE_SLUGS.values())
    byfile: dict[str, dict[str, dict]] = {}
    for row in data["rows"]:
        guideline = data["guidelines"][str(row["guideline"])]
        block = byfile.setdefault(row["drug"], {}).setdefault(row["gene"], {
            "gene": row["gene"],
            "enzyme": GENE_ENZYMES[row["gene"]],
            "level": row["level"],
            **({"population": POPULATION_LABELS[row["population"]]}
               if row["population"] != POPULATIONS[0] else {}),
            "guideline": {"name": guideline["name"], "url": guideline["url"],
                          "id": guideline["clinpgxid"]},
            "rows": [],
        })
        block["rows"].append({
            "phenotype": row["phenotype"],
            "implication": row["implication"],
            "recommendation": row["recommendation"],
            "classification": row["classification"],
            **({"assumes": row["assumes"]} if row.get("assumes") else {}),
            "sources": sources_for(row, guideline),
        })
    out: dict[str, list[dict]] = {}
    for drug in sorted(byfile):
        blocks = sorted(byfile[drug].values(),
                        key=lambda b: (-len(b["rows"]), b["gene"]))
        for block in blocks:
            block["rows"].sort(key=lambda r: order.index(r["phenotype"]))
        out[drug] = blocks
    return out
