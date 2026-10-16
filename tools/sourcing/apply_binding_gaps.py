#!/usr/bin/env python
"""Gate the judged binding gaps and write each survivor as a NEW binding on ``drugs_data.jsonl``.

The apply half of the binding-gap pass (see docs/DRUGS.md "Drugs" -> "Binding gaps"):
``tools/fetch/fetch_binding_gaps.py`` offers (sentence, target) candidates for targets a
drug does not yet bind, from its stored English Wikipedia article (corpus #9
``wikipedia_pharm``); one LLM pass decides every candidate by index into
``tools/generated_cache/binding_gaps_judged.json``::

    {"caffeine": [{"index": 0, "target": "glycine", "pick": true, "action": "antagonist"},
                  {"index": 1, "target": "ache", "pick": false, "reason": "..."}]}

Unlike the direction pass this one **adds** a binding, so its gates are stricter, each
counted and reported rather than silently dropped:

1. the drug is one the worklist offered and the dataset holds;
2. the index resolves to one of its candidates and the row's ``target`` is that
   candidate's (a judge pairing a sentence with another target is a rejection);
3. the action is a live ``DRUG_ACTIONS`` key (a direction-less "binds" has no row: a
   binding without an action needs a Ki to show anything);
4. the drug can carry bindings of its own (not a combo, not a prodrug);
5. the target is **not already covered** (``binding_gaps.bound_targets``, coarse
   relatives included): the pass fills a gap, never revises a binding;
6. the quote names the target under the shared matcher (``tools/target_aliases.py``);
7. the clause naming it is not negated or hedged (``binding_gaps.negated``);
8. it names no stereo relative and carries no stereo tag (``binding_gaps.stereo_mixed``);
9. the quote is verbatim on ``data_sources/wikipedia/pages/<slug>.md``;
10. **Stahl drugs are reported, not written**: CLAUDE.md keeps their bindings strictly
    dump-sourced, so a gap Wikipedia states for one is listed for a human to weigh.

Every candidate must carry a decision: an index the judged file skips is reported as
**unjudged**, so a partial pass can never read as a complete one.

A survivor becomes ``{target, action, sources: [{corpus, page, quote, provenance:
"verified"}]}``. No ``llm`` stamp is written: the sentence was model-picked, so
``tools/sourcing/recheck_quotes.py`` must judge it next (``check_data.py`` family 5 flags
it until then). Idempotent: a binding already citing that exact quote is skipped.

Usage (from the repo root), then recheck, regenerate, check::

    python tools/sourcing/apply_binding_gaps.py --dry-run --verbose
    python tools/sourcing/apply_binding_gaps.py

Stdlib only; author-side (refuses without the corpus #9 page tree).

Built with the help of Claude Code.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(REPO, "tools"))

import binding_gaps as bg  # noqa: E402  (the predicates the fetcher offered with)
import drugs_io  # noqa: E402
import target_aliases as ta  # noqa: E402
from apply_binding_directions import CORPUS, PAGES, _Gate, page_text  # noqa: E402
from check_data import normalize_for_match  # noqa: E402
from data_generators.drugs import DRUG_ACTIONS  # noqa: E402

CACHE = os.path.join(REPO, "tools", "generated_cache")
WORKLIST = os.path.join(CACHE, "binding_gaps_worklist.json")
JUDGED = os.path.join(CACHE, "binding_gaps_judged.json")


class _GapGate(_Gate):
    """The direction pass's tally / rejection log / page cache, with an ``add`` write."""

    def __init__(self, read_page) -> None:
        super().__init__(read_page)
        self.stahl: list[str] = []

    def add(self, drug: dict, roster: list[dict], cand: dict, action: str, slug: str,
            label: str) -> bool:
        target, quote = cand["target"], cand["line"]
        aliases = ta.aliases_by_target().get(target, [])
        if any(src.get("corpus") == CORPUS and src.get("quote") == quote
               for b in drug.get("bindings", []) if b.get("target") == target
               for src in b.get("sources", [])):
            self.stats["skipped: already applied"] += 1
            return False
        checks = (
            (action in DRUG_ACTIONS, "unknown action"),
            (bg.offerable(drug), "combo or prodrug carries no own binding"),
            (target not in bg.bound_targets(drug), "target already bound"),
            (ta.mentions(quote, aliases), "quote does not name the target"),
            (not bg.negated(quote, aliases), "negated or hedged clause"),
            (not bg.stereo_mixed(quote, bg.stereo_siblings(drug, roster)),
             "names a stereo relative"),
        )
        for ok, why in checks:
            if not ok:
                self.reject(why, f"{label}: {quote[:80]}")
                return False
        if slug not in self.pages:
            self.pages[slug] = self.read_page(slug)
        if self.pages[slug] is None:
            self.reject("no stored page for the citation", f"{label} ({slug})")
            return False
        if normalize_for_match(quote) not in self.pages[slug]:
            self.reject("quote not verbatim on the cited page", f"{label}: {quote[:80]}")
            return False
        if bg.is_stahl(drug):
            self.stats["reported: Stahl drug (not written)"] += 1
            self.stahl.append(f"{label}: {quote}")
            return False
        drug.setdefault("bindings", []).append({
            "target": target, "action": action,
            "sources": [{"corpus": CORPUS, "page": slug, "quote": quote,
                         "provenance": "verified"}]})
        self.stats[f"node: {action}"] += 1
        return True


def apply(worklist: list[dict], judged: dict, drugs: list[dict], read_page) -> _GapGate:
    """Run every gate over a judged file, adding the survivors to ``drugs`` in place.

    Pure apart from ``read_page`` (``slug -> normalized page text or None``), so the
    gates are testable without the gitignored corpus.
    """
    by_drug = {d["id"]: d for d in drugs}
    gate = _GapGate(read_page)
    for rec in worklist:
        rows = judged.get(rec["drug"], [])
        seen = {r.get("index") for r in rows}
        for i in range(len(rec["candidates"])):
            if i not in seen:
                gate.reject("unjudged candidate", f"{rec['drug']} index={i}")
    by_work = {rec["drug"]: rec for rec in worklist}
    for drug_id in sorted(k for k in judged if not k.startswith("_")):
        rec, drug = by_work.get(drug_id), by_drug.get(drug_id)
        if rec is None or drug is None:
            gate.reject("drug not in the worklist", drug_id)
            continue
        cands = rec["candidates"]
        for row in judged[drug_id]:
            index = row.get("index")
            label = f"{drug_id} {row.get('target')}/{row.get('action')} index={index}"
            if not row.get("pick"):
                gate.stats["judged: rejected"] += 1
                continue
            if isinstance(index, bool) or not isinstance(index, int) \
                    or not 0 <= index < len(cands):
                gate.reject("candidate index out of range", label)
                continue
            if row.get("target") != cands[index]["target"]:
                gate.reject("target is not the candidate's", label)
                continue
            gate.add(drug, drugs, cands[index], row.get("action"), rec["slug"], label)
    return gate


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="report without writing")
    ap.add_argument("--verbose", action="store_true", help="list rejected + Stahl rows")
    args = ap.parse_args()
    if not os.path.isdir(PAGES):
        print(f"missing the author-side corpus tree ({PAGES}); see CLAUDE.local.md",
              file=sys.stderr)
        return 1
    with open(WORKLIST, encoding="utf-8") as f:
        worklist = json.load(f)
    with open(JUDGED, encoding="utf-8") as f:
        judged = json.load(f)
    drugs = drugs_io.load_drugs()
    gate = apply(worklist, judged, drugs, page_text)

    written = sum(n for key, n in gate.stats.items() if key.startswith("node: "))
    print(f"{written} new binding(s) written")
    for key, n in sorted(gate.stats.items()):
        print(f"  {key:<48} {n}")
    if args.verbose:
        for title, lines in (("rejected rows", gate.rejected),
                             ("Stahl-drug gaps (reported, not written)", gate.stahl)):
            if lines:
                print(f"\n{title}:")
                for line in lines:
                    print(f"  {line}")
    if args.dry_run:
        print("\n--dry-run: nothing written")
        return 0
    drugs_io.save_drugs(drugs)
    print(f"\nwrote {drugs_io.DRUGS_PATH.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
