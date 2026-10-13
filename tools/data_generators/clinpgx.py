"""Read the committed ClinPGx clinical-annotation export (corpus #20).

The export lives in ``tools/data/clinpgx/``, committed: ClinPGx's (the former PharmGKB)
clinical annotations for the genes of this dataset's receptors and targets
(``genes.GENE_OWNERS``), at the evidence levels kept below. Like CPIC (#15) it ships with
the repo, pinned by sha256, so its gate runs on every clone instead of being
skipped-and-warned. Unlike CPIC its licence is **CC BY-SA 4.0**: the export carries the
licence text beside it, and the corpus citation names ClinPGx as the source.

Three consumers, one reader, so the nodes cannot drift between them:

* ``tools/fetch/fetch_clinpgx.py`` downloads the bulk zip and writes the export plus
  the pin ``tools/generated_cache/clinpgx_variants.json``;
* ``tools/generate_data.py`` emits :func:`variant_nodes` onto each owner, after the pin
  is cashed in (:func:`load_pins`);
* ``tools/check_data.py`` re-derives every emitted node and quote from the export and
  requires an exact match.

**What one node is** (kind ``receptor_variant``): one clinical annotation, "variant X of
this receptor's gene may be associated with phenotype Y under drug Z, at evidence level
L". Its citations are ClinPGx's own per-genotype sentences ("Patients with the AA
genotype may have ..."), one per genotype, copied verbatim by code: ``extraction:
"code"`` on a ``machine`` corpus, no judge. The node is a statement about the gene in
the literature, never about a visitor, and every sentence already says "may".

**What is deliberately dropped:** level 4 (case reports, non-significant or in-vitro
evidence). Levels 1A-3 are kept although almost every row here is level 3 (a single
study, or several without clear agreement): the level rides each node as a chip, so a
reader sees how thin the evidence is instead of not seeing the claim at all.

Stdlib only. Built with the help of Claude Code.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from .genes import GENE_OWNERS
from .pharmfreq import sha256  # noqa: F401  (re-exported for the fetcher)

# Repo-relative, so it can be handed to `check_data.py` through `meta.source_corpora`
# without ever naming an absolute path.
EXPORT_DIR = "tools/data/clinpgx"
EXPORT_NAME = "clinical_annotations.json"
PIN_CACHE = Path(__file__).resolve().parent.parent / "generated_cache" / "clinpgx_variants.json"

# The bulk download (the API answers with a redirect to the file's current home).
DOWNLOAD_URL = "https://api.clinpgx.org/v1/download/file/data/clinicalAnnotations.zip"
ANNOTATION_URL = "https://www.clinpgx.org/clinicalAnnotation/{id}"

# ClinPGx levels of evidence kept, strongest first, with what each means (ClinPGx's
# clinical-annotation scoring). Level 4 is dropped (see the module docstring).
VARIANT_LEVELS: dict[str, dict[str, Any]] = {
    "1A": {"strength": {"en": "high", "fr": "élevé"},
           "label": {"en": "in a prescribing guideline (CPIC or a medical society) "
                           "or implemented in a major health system",
                     "fr": "dans une recommandation de prescription (CPIC ou société "
                           "savante) ou appliqué dans un grand système de santé"}},
    "1B": {"strength": {"en": "high", "fr": "élevé"},
           "label": {"en": "replicated association with a strong effect",
                     "fr": "association répliquée avec un effet net"}},
    "2A": {"strength": {"en": "moderate", "fr": "modéré"},
           "label": {"en": "replicated association, in a well-known pharmacogene",
                     "fr": "association répliquée, dans un pharmacogène bien connu"}},
    "2B": {"strength": {"en": "moderate", "fr": "modéré"},
           "label": {"en": "replicated association",
                     "fr": "association répliquée"}},
    "3": {"strength": {"en": "low", "fr": "faible"},
          "label": {"en": "a single study, or several that do not clearly agree",
                    "fr": "une seule étude, ou plusieurs qui ne concordent pas nettement"}},
}

# ClinPGx's "Phenotype Category" values -> our slug + label. Spelled out so an upstream
# rename is a loud failure here instead of a silently relabelled row.
VARIANT_CATEGORIES: dict[str, dict[str, Any]] = {
    "Efficacy": {"slug": "efficacy", "label": {"en": "efficacy", "fr": "efficacité"}},
    "Toxicity": {"slug": "toxicity", "label": {"en": "toxicity", "fr": "toxicité"}},
    "Dosage": {"slug": "dosage", "label": {"en": "dosage", "fr": "posologie"}},
    "Metabolism/PK": {"slug": "pk", "label": {"en": "pharmacokinetics",
                                              "fr": "pharmacocinétique"}},
    "PD": {"slug": "pd", "label": {"en": "pharmacodynamics", "fr": "pharmacodynamie"}},
    "Other": {"slug": "other", "label": {"en": "other", "fr": "autre"}},
}

# ClinPGx's "Specialty Population" values a node may carry (empty = general).
POPULATIONS: dict[str, dict[str, str]] = {
    "Pediatric": {"en": "children", "fr": "enfants"},
}

_ROW_KEYS = ("id", "variant", "genes", "level", "categories", "drugs", "drug_ids",
             "phenotypes", "population", "pmids", "genotypes")


class ExportError(Exception):
    """The export on disk is not the one this code knows how to read."""


def export_path(root: str) -> str:
    """The committed export, under a repo root."""
    return os.path.join(root, *EXPORT_DIR.split("/"), EXPORT_NAME)


def owners_of(genes: list[str]) -> list[tuple[str, str]]:
    """The modeled owners an annotation's gene list lands on, in gene order, deduped.

    ``ANKK1;DRD2`` (Taq1A sits between the two) lands on the D2 receptor only, since
    ANKK1 is no modeled gene.
    """
    out: list[tuple[str, str]] = []
    for g in genes:
        owner = GENE_OWNERS.get(g)
        if owner and owner not in out:
            out.append(owner)
    return out


def read_export(path: str) -> dict:
    """The export as written by ``fetch_clinpgx.py``, shape-checked."""
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except FileNotFoundError:
        raise ExportError(f"{path}: not found (re-run tools/fetch/fetch_clinpgx.py)")
    except json.JSONDecodeError as exc:
        raise ExportError(f"{path}: not readable JSON ({exc})")
    for key in ("fetched", "created", "licence", "rows"):
        if key not in data:
            raise ExportError(f"{path}: no {key!r} block (re-run tools/fetch/fetch_clinpgx.py)")
    for row in data["rows"]:
        for key in _ROW_KEYS:
            if key not in row:
                raise ExportError(f"{path}: row {row.get('id')!r} has no {key!r}")
        if row["level"] not in VARIANT_LEVELS:
            raise ExportError(f"{path}: row {row['id']}: level {row['level']!r} is not "
                              f"one kept (see VARIANT_LEVELS)")
        for cat in row["categories"]:
            if cat not in VARIANT_CATEGORIES:
                raise ExportError(f"{path}: row {row['id']}: unknown category {cat!r} "
                                  f"(extend VARIANT_CATEGORIES)")
        if row["population"] and row["population"] not in POPULATIONS:
            raise ExportError(f"{path}: row {row['id']}: unknown population "
                              f"{row['population']!r} (extend POPULATIONS)")
        if not owners_of(row["genes"]):
            raise ExportError(f"{path}: row {row['id']}: no modeled gene in {row['genes']}")
    return data


def sources_for(row: dict) -> list[dict]:
    """One citation per genotype sentence, in the export's genotype order.

    ClinPGx's own words, copied by code out of the pinned export, so each is
    ``extraction: "code"`` on a ``machine`` corpus and needs no judge. ``page`` is the
    clinical annotation id, which resolves to a public page (:data:`ANNOTATION_URL`).
    """
    return [{"corpus": "clinpgx", "page": row["id"], "quote": g["text"],
             "provenance": "verified", "extraction": "code"}
            for g in row["genotypes"] if g.get("text")]


def node_for(row: dict) -> dict[str, Any]:
    """One ``receptor_variant`` node, pre-``_quote_sources`` (raw citations).

    The export's ``drug_ids`` runs parallel to its upstream ``drugs`` names (``None``
    where no roster drug answers to the name). ``drugs`` holds our ids; ``drug_names``
    keeps the unmatched upstream names (a class such as "opioids"), so the panel can
    still say them.
    """
    ids: list[str] = []
    for i in row["drug_ids"]:
        if i and i not in ids:
            ids.append(i)
    node: dict[str, Any] = {
        "annotation": row["id"],
        "variant": row["variant"],
        "genes": list(row["genes"]),
        "level": row["level"],
        "categories": [VARIANT_CATEGORIES[c]["slug"] for c in row["categories"]],
        "drugs": ids,
        "phenotypes": list(row["phenotypes"]),
        "pmids": row["pmids"],
        "genotypes": [g["genotype"] for g in row["genotypes"] if g.get("text")],
        "url": ANNOTATION_URL.format(id=row["id"]),
        "sources": sources_for(row),
    }
    unmatched = [n for n, i in zip(row["drugs"], row["drug_ids"]) if not i]
    if unmatched:
        node["drug_names"] = unmatched
    if row["population"]:
        node["population"] = row["population"]
    return node


def variant_nodes(data: dict) -> dict[tuple[str, str], list[dict[str, Any]]]:
    """``(owner_kind, owner_id) -> [node]``, strongest level first, then variant, id."""
    order = list(VARIANT_LEVELS)
    out: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for row in data["rows"]:
        node = node_for(row)
        for owner in owners_of(row["genes"]):
            out.setdefault(owner, []).append(node)
    for nodes in out.values():
        nodes.sort(key=lambda n: (order.index(n["level"]), n["variant"], n["annotation"]))
    return out


_NODES: dict[tuple[str, str], list[dict[str, Any]]] | None = None


def owner_variants(owner_kind: str, owner_id: str, quote_sources) -> list[dict[str, Any]]:
    """The ``variants`` list one receptor record / non-receptor target carries.

    ``quote_sources`` is the generator's ``_quote_sources`` (handed in: provenance
    imports this module, so it cannot import back). Every citation is a ``verified``
    code copy, so every node is ``verified``. Empty when the corpus is not pinned.
    """
    global _NODES
    if _NODES is None:
        root = PIN_CACHE.parent.parent.parent
        _NODES = variant_nodes(read_export(export_path(str(root)))) if load_pins() else {}
    out = []
    for node in _NODES.get((owner_kind, owner_id), []):
        what = f"{owner_kind} {owner_id!r} variant {node['annotation']}"
        out.append({**node, "sources": quote_sources(node["sources"], what),
                    "grade": "verified"})
    return out


def load_pins(root: Path | None = None) -> dict[str, str]:
    """``{file name: sha256}`` from the pin cache, each checked against the export.

    Same bargain as the CPIC merge: the export is committed, so the pin is cashed in
    at generation time and a drifted annotation is a build failure rather than a
    sentence nobody can trace. Empty when the cache is absent (no corpus then).
    """
    if not PIN_CACHE.exists():
        return {}
    pins = json.loads(PIN_CACHE.read_text(encoding="utf-8")).get("export_sha256") or {}
    root = root or PIN_CACHE.parent.parent.parent
    for name, want in sorted(pins.items()):
        path = root / Path(EXPORT_DIR) / name
        if not path.exists():
            raise ValueError(f"clinpgx_variants.json pins {name}, which is not in "
                             f"{EXPORT_DIR}: re-run tools/fetch/fetch_clinpgx.py")
        got = sha256(str(path))
        if got != want:
            raise ValueError(f"{EXPORT_DIR}/{name} has changed since it was pinned "
                             f"({got[:12]} != {want[:12]}): re-run "
                             f"tools/fetch/fetch_clinpgx.py")
    return dict(pins)


def meta_vocab() -> dict[str, Any]:
    """The closed vocabularies, emitted into ``meta.variants`` (labels stay bilingual:
    the serialization-time ``externalize`` pass collapses them like every other)."""
    return {"variants": {
        "levels": {k: {"strength": dict(v["strength"]), "label": dict(v["label"])}
                   for k, v in VARIANT_LEVELS.items()},
        "categories": {v["slug"]: dict(v["label"]) for v in VARIANT_CATEGORIES.values()},
        "populations": {k: dict(v) for k, v in POPULATIONS.items()},
    }}
