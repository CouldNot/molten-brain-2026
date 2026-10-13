#!/usr/bin/env python
"""Gate the ``receptor_effect`` picks and write ``tools/generated_cache/receptor_effects.json``.

Third step of the four-step pipeline (see ``tools/fetch/fetch_receptor_effects.py`` for the
first): an LLM read ``receptor_effects_worklist.json`` and answered by candidate index into
``receptor_effects_judged.json``::

    {"owners": {"h1": [{"effect": "sedation", "mode": "antagonism", "picks": [3]}]}}

This applier is the **sole writer** of the cache and rebuilds it from the judged file on
every run (so dropping a pick there, e.g. after a judge reject, drops its node here).
A node lands only when every gate passes, all or nothing per node:

1. the owner is in the worklist AND is still a current receptor / target;
2. ``effect`` / ``mode`` are in the closed vocabularies
   (``data_generators.receptor_effects``), and ``inhibition`` sits on a non-receptor
   target only (a receptor is agonised or antagonised, not inhibited);
3. every picked candidate was offered for that effect (its keyword hit), so a pick
   cannot attach a sentence to an effect it never mentions;
4. every picked sentence is still verbatim on its stored page (``prose_gate.PageGate``).

It writes no ``llm`` stamp, so ``tools/sourcing/recheck_quotes.py`` (``--kinds
receptor_effect``) must judge the new citations afterwards, or ``check_data.py`` family 5
fails them as extracted-but-unjudged.

Usage (from the repo root)::

    python tools/sourcing/apply_receptor_effects.py --dry-run
    python tools/sourcing/apply_receptor_effects.py

Built with the help of Claude Code.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent.parent
REPO = TOOLS.parent
sys.path.insert(0, str(TOOLS))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from data_generators.receptor_effects import (  # noqa: E402
    CACHE, RECEPTOR_EFFECT_MODES, RECEPTOR_EFFECTS)
from prose_gate import PageGate, add_source  # noqa: E402
from apply_classification_sources import PROSE_PAGES  # noqa: E402 (same two corpora)

WORKLIST = TOOLS / "generated_cache" / "receptor_effects_worklist.json"
JUDGED = TOOLS / "generated_cache" / "receptor_effects_judged.json"


def current_kinds() -> dict[str, str]:
    """``{owner id: "receptor" | "target"}`` for what the dataset models today."""
    out = {}
    for line in (REPO / "public/data/receptors.jsonl").read_text("utf-8").splitlines():
        if line.strip():
            out[json.loads(line)["id"]] = "receptor"
    meta = json.loads((REPO / "public/data/meta.json").read_text("utf-8"))
    for tid, t in meta["drug_targets"].items():
        if isinstance(t, dict):
            out.setdefault(tid, "target")
    return out


def apply(worklist: dict, judged: dict, kinds: dict[str, str],
          pages: dict = PROSE_PAGES) -> tuple[dict, list[str]]:
    """``(cache, misses)``: the rebuilt ``{owner: {"mode:effect": [source]}}`` cache."""
    owners = worklist.get("owners", {})
    gate = PageGate(pages)
    out: dict[str, dict[str, list]] = {}
    misses: list[str] = []
    for oid, nodes in sorted((judged.get("owners") or {}).items()):
        own = owners.get(oid)
        if own is None or oid not in kinds:
            misses.append(f"{oid}: not in the worklist / not a current receptor or target")
            continue
        cands = own.get("candidates", [])
        for node in nodes or []:
            mode, effect, picks = node.get("mode"), node.get("effect"), node.get("picks")
            what = f"{oid}/{mode}:{effect}"
            if mode not in RECEPTOR_EFFECT_MODES or effect not in RECEPTOR_EFFECTS:
                misses.append(f"{what}: mode or effect outside the closed vocabulary")
                continue
            if mode == "inhibition" and kinds[oid] == "receptor":
                misses.append(f"{what}: 'inhibition' is a non-receptor target's mode")
                continue
            if not picks:
                misses.append(f"{what}: no picks")
                continue
            off = [i for i in picks if isinstance(i, int) and 0 <= i < len(cands)
                   and effect not in cands[i].get("effects", [])]
            if off:
                misses.append(f"{what}: candidate(s) {off} were not offered for {effect!r}")
                continue
            srcs = gate.sources(cands, picks, what, misses)
            if not srcs:
                continue
            bucket = out.setdefault(oid, {}).setdefault(f"{mode}:{effect}", [])
            for s in srcs:
                add_source(bucket, s)
    return out, misses


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="report, write nothing")
    args = ap.parse_args()
    cache, misses = apply(json.loads(WORKLIST.read_text("utf-8")),
                          json.loads(JUDGED.read_text("utf-8")), current_kinds())
    for m in misses:
        print(f"  [miss] {m}", file=sys.stderr)
    n = sum(len(v) for v in cache.values())
    print(f"{n} receptor_effect node(s) over {len(cache)} owner(s), {len(misses)} miss(es)")
    if args.dry_run:
        print("(dry run: not written)")
        return 0
    CACHE.write_text(json.dumps(cache, indent=1, sort_keys=True, ensure_ascii=False) + "\n",
                     encoding="utf-8")
    print(f"wrote {CACHE.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
