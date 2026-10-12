"""data_generators.unknown: the **UNKNOWN** grade, "we searched and nothing states it".

A red ✕ (NOSOURCE) says *nobody has found a source yet*; it is a to-do. UNKNOWN says
something stronger and narrower: every reachable source this dataset draws on was
searched for this one claim, on a recorded date, and none of them states it. That is
a finding about the literature, not a gap in our work, so it gets its own pill (∅)
and leaves the headline "% sourced" denominator (it is neither backed nor missing).

A node earns UNKNOWN **only through a recorded search log**, never by hand: one entry
in :data:`UNKNOWN_LOG_PATH` (committed), keyed by the claim's citation site
(``tools/sourcing/citation_site.py`` grammar), listing every source searched, the
lookup key or query run against it, how many hits it gave, the date, and who ran it::

    "drug:clozapine/bindings[5ht1d]": {
        "kind": "drug_binding_action",
        "searched": "2026-10-12",
        "by": {"harness": "Claude Code", "model": "opus"},
        "sources": [
            {"corpus": "pdsp_ki", "lookup": "Clozapine / HTR1D", "hits": 0},
            {"corpus": "europepmc", "query": "\\"clozapine\\" AND (...)", "hits": 3,
             "read": ["12345678"]},
            ...]}

A metabolite binding is keyed ``drug:<parent>/metabolites[<Name>]/bindings[<target>]``
and applies to that metabolite under EVERY parent (its bindings are a property of the
molecule, written identically to each parent; see ``provenance._provenance_stats``).

Three rules, each enforced:

* **A real source wins.** :func:`apply_unknown` stamps only a claim that is still
  unsourced (for a binding direction: still ``affinity_only``); a log entry whose claim
  has since gained a source is ignored, so a later find needs no log edit.
* **The search must be complete.** :data:`UNKNOWN_REQUIRED_SOURCES` lists, per node
  kind, the corpora a search has to cover; ``check_data.py`` (family 4) fails a stamp
  missing one. A kind with no entry here cannot be UNKNOWN at all.
* **It expires.** A search older than ``freshness.FRESHNESS_MAX_MONTHS`` fails
  ``check_data.py`` family 13 (the same freshness check, and the same pre-push path),
  because the literature moves: a new paper can answer it.

The emitted stamp is compact (``{"searched", "corpora"}``): the viewer only needs the
tooltip's "Searched X, Y on DATE"; the full queries stay in the committed log.

Built with the help of Claude Code.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
UNKNOWN_LOG_PATH = os.path.join(ROOT, "tools", "generated_cache", "unknown_searches.json")

# Node kind -> the corpora a search must have covered before that kind's node may read
# UNKNOWN. A binding direction is stated (when it is stated at all) in a measured-assay
# table (PDSP, GtoPdb's action column), an encyclopedic article (EN + FR Wikipedia), or a
# primary paper (Europe PMC abstracts).
UNKNOWN_REQUIRED_SOURCES: dict[str, tuple[str, ...]] = {
    "drug_binding_action": ("pdsp_ki", "gtopdb_ki", "wikipedia_pharm", "wikipedia_fr",
                            "europepmc"),
}

_BINDING_SITE = re.compile(
    r"^drug:(?P<drug>[^/]+)/(?:metabolites\[(?P<metab>[^\]]+)\]/)?bindings\[(?P<target>[^\]:]+)\]$")


def fold(name: str) -> str:
    """A metabolite name folded the way the tally dedups it (case + punctuation)."""
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def binding_site(drug_id: str, target: str, metabolite: str | None = None) -> str:
    """A binding's log key, in ``tools/sourcing/citation_site.py``'s grammar (the test
    suite pins the two together). An affinity-only binding has no action to key on."""
    inner = f"metabolites[{metabolite}]/bindings[{target}]" if metabolite else \
        f"bindings[{target}]"
    return f"drug:{drug_id}/{inner}"


def affinity_only_bindings(drugs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Every binding with no direction, as ``{site, drug, ligand, metabolite, target,
    binding}``: a drug's own, then each non-modeled metabolite's, deduplicated by
    folded metabolite name (first parent wins, as in the tally). ``ligand`` is the name
    a search looks up. Works on the authored and the emitted records alike."""
    out, seen = [], set()
    for d in drugs:
        for b in d.get("bindings", []):
            if b.get("affinity_only"):
                out.append({"site": binding_site(d["id"], b["target"]), "drug": d["id"],
                            "ligand": d.get("name") or d["id"], "metabolite": None,
                            "target": b["target"], "binding": b})
    for d in drugs:
        for m in d.get("metabolites", []):
            for b in m.get("bindings") or []:
                key = (fold(m["name"]), b["target"])
                if not b.get("affinity_only") or key in seen:
                    continue
                seen.add(key)
                out.append({"site": binding_site(d["id"], b["target"], m["name"]),
                            "drug": d["id"], "ligand": m["name"], "metabolite": m["name"],
                            "target": b["target"], "binding": b})
    return out


def load_log(path: str = UNKNOWN_LOG_PATH) -> dict[str, Any]:
    """The committed search log, ``{}`` when there is none yet."""
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def stamp(entry: dict[str, Any]) -> dict[str, Any]:
    """The compact emitted form of one log entry: the date + the corpora searched."""
    corpora = []
    for src in entry.get("sources", []):
        if src.get("corpus") and src["corpus"] not in corpora:
            corpora.append(src["corpus"])
    return {"searched": entry["searched"], "corpora": corpora}


def missing_required(kind: str, corpora: list[str]) -> list[str]:
    """The required corpora of ``kind`` a search did not cover (all of them for a kind
    that cannot be UNKNOWN)."""
    need = UNKNOWN_REQUIRED_SOURCES.get(kind)
    if need is None:
        return ["<kind cannot be UNKNOWN>"]
    return [c for c in need if c not in corpora]


def apply_unknown(drugs: list[dict[str, Any]],
                  log: dict[str, Any] | None = None) -> dict[str, int]:
    """Stamp ``unknown`` on every still-unsourced binding direction the log covers.

    Mutates ``drugs`` (the emitted records) in place and returns a small tally. Raises
    on a log key that resolves to no binding at all (a renamed drug or a dropped
    target), so a stale entry can never sit silently in the committed log.
    """
    log = load_log() if log is None else log
    by_drug = {d["id"]: d for d in drugs}
    stats = {"stamped": 0, "superseded": 0}
    for key, entry in sorted(log.items()):
        m = _BINDING_SITE.match(key)
        if not m or entry.get("kind") != "drug_binding_action":
            raise ValueError(f"unknown_searches.json: {key!r} is not a binding-direction "
                             f"site (the only UNKNOWN kind today)")
        drug = by_drug.get(m["drug"])
        if drug is None:
            raise KeyError(f"unknown_searches.json: {key!r} names no drug")
        target = m["target"]
        if m["metab"]:
            want = fold(m["metab"])
            rows = [b for d in drugs for mt in d.get("metabolites", [])
                    if fold(mt.get("name")) == want for b in mt.get("bindings", [])
                    if b["target"] == target]
        else:
            rows = [b for b in drug.get("bindings", []) if b["target"] == target]
        if not rows:
            raise KeyError(f"unknown_searches.json: {key!r} resolves to no binding")
        for b in rows:
            if b.get("affinity_only"):
                b["unknown"] = stamp(entry)
                stats["stamped"] += 1
            else:
                stats["superseded"] += 1  # a real source won since the search
    return stats
