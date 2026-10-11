#!/usr/bin/env python
"""Apply judged prodrug claims (node kind ``drug_prodrug``), quote-gated.

Second half of the pass ``tools/fetch/fetch_prodrug_worklist.py`` starts. The LLM
answered, per drug, by candidate **index** into
``tools/generated_cache/prodrug_judged.json``::

    {"<drug id>": {"index": 1, "metabolite": "Psilocin", "drug_id": null}}

Every gate is re-derived here, never trusted from the judged file:

1. the drug is **offered** by a fresh ``fetch_prodrug_worklist.build()``;
2. the index resolves into that drug's candidate list;
3. the quote itself says prodrug / inactive (``fetch_prodrug_worklist.PRODRUG_RE``);
4. the quote names the active metabolite (its name, or its parenthesised synonym);
5. a ``drug_id`` link, when given, is another drug of the dataset;
6. the quote is verbatim on its page (``prose_gate.PageGate``, the checker's normalizer).

A gated drug gets ``prodrug: true`` + ``prodrug_sources``, its active metabolite (added,
sourced by the same quote, when the drug did not list it yet; linked to a modeled drug
via ``drug_id``), and **loses its own bindings**: a prodrug's pharmacology is its
metabolite's (a linked drug's bindings, or the metabolite's own ``bindings[]`` written by
``apply_metabolite_bindings.py``). Every dropped binding is printed so it can be re-sourced
on the metabolite. Sole writer of ``prodrug`` / ``prodrug_sources``; idempotent.

Writes no ``llm`` stamp, so ``tools/sourcing/recheck_quotes.py`` must run afterwards
(``--kinds drug_prodrug``) or ``check_data.py`` family 5 flags the citations.

    python tools/sourcing/apply_prodrug.py --dry-run
    python tools/sourcing/apply_prodrug.py

Built with the help of Claude Code.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "tools" / "fetch"))
sys.path.insert(0, str(ROOT / "tools" / "sourcing"))
import drugs_io  # noqa: E402
from prose_gate import PageGate  # noqa: E402
import fetch_prodrug_worklist as wl  # noqa: E402

JUDGED_PATH = ROOT / "tools" / "generated_cache" / "prodrug_judged.json"
PAGES = {"wikipedia_pharm": ROOT / "data_sources" / "wikipedia" / "pages"}


def _fold(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def names_of(metabolite: str) -> list[str]:
    """The folded names a quote may use for a metabolite: ``"Desmethyldiazepam
    (nordazepam)"`` -> ``["desmethyldiazepam", "nordazepam"]``."""
    parts = [metabolite.split("(")[0]] + re.findall(r"\(([^)]*)\)", metabolite)
    return [f for f in (_fold(p) for p in parts) if f]


def gate(did: str, rec: dict, cands: list[dict], ids: set[str],
         pages: PageGate) -> tuple[dict | None, str]:
    """``(source, "")`` or ``(None, why)`` for one judged drug."""
    idx = rec.get("index")
    if not (isinstance(idx, int) and 0 <= idx < len(cands)):
        return None, f"index {idx!r} out of range"
    cand = cands[idx]
    quote = cand["line"]
    if not wl.PRODRUG_RE.search(quote):
        return None, "the quote does not say prodrug / inactive"
    if not any(n in _fold(quote) for n in names_of(rec.get("metabolite") or "")):
        return None, f"metabolite {rec.get('metabolite')!r} not named by the quote"
    link = rec.get("drug_id")
    if link is not None and (link not in ids or link == did):
        return None, f"drug_id {link!r} is not another drug of the dataset"
    if not pages.on_page(cand["corpus"], cand["page"], quote):
        return None, f"quote not on {cand['corpus']}/{cand['page']}"
    return {"corpus": cand["corpus"], "page": cand["page"], "quote": quote,
            "provenance": "verified"}, ""


def apply(judged: dict, offered: dict, drugs: list[dict],
          pages: PageGate) -> tuple[list[str], list[str], list[str]]:
    """Mutate ``drugs``; return (applied ids, dropped bindings, rejections)."""
    by_id = {d["id"]: d for d in drugs}
    applied, dropped, rejected = [], [], []
    for did, rec in judged.items():
        drug = by_id.get(did)
        if drug is None or did not in offered:
            rejected.append(f"{did}: not offered")
            continue
        src, why = gate(did, rec, offered[did]["candidates"], set(by_id), pages)
        if src is None:
            rejected.append(f"{did}: {why}")
            continue
        drug["prodrug"] = True
        drug["prodrug_sources"] = [src]
        mets = drug.setdefault("metabolites", [])
        want = set(names_of(rec["metabolite"]))
        met = next((m for m in mets if want & set(names_of(m["name"]))), None)
        if met is None:
            met = {"name": rec["metabolite"], "sources": [dict(src)]}
            mets.append(met)
        if rec.get("drug_id"):
            met["drug_id"] = rec["drug_id"]
        for b in drug.get("bindings") or []:
            dropped.append(f"{did}: {b['target']} {b.get('action') or 'affinity-only'}")
        drug["bindings"] = []
        applied.append(did)
    return applied, dropped, rejected


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--judged", type=Path, default=JUDGED_PATH)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if not PAGES["wikipedia_pharm"].is_dir():
        print("[error] data_sources/wikipedia/pages absent: quote gate cannot run.",
              file=sys.stderr)
        return 1
    judged = json.loads(args.judged.read_text("utf-8"))
    drugs = drugs_io.load_drugs()
    applied, dropped, rejected = apply(judged, wl.build()["drugs"], drugs,
                                       PageGate(PAGES))
    tag = "[dry-run] " if args.dry_run else ""
    print(f"{tag}{len(applied)} prodrug(s): {', '.join(applied)}")
    for line in dropped:
        print(f"  dropped own binding  {line}")
    for line in rejected:
        print(f"  [rejected] {line}")
    if not args.dry_run:
        drugs_io.save_drugs(drugs)
        print(f"wrote {drugs_io.DRUGS_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
