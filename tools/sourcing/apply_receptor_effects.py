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

import json
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent.parent
REPO = TOOLS.parent
sys.path.insert(0, str(TOOLS))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from data_generators.receptor_effects import (  # noqa: E402
    CACHE, RECEPTOR_EFFECT_MODES, RECEPTOR_EFFECTS)
from prose_gate import apply_picks, not_offered, run_applier  # noqa: E402
from apply_classification_sources import PROSE_PAGES as _PROSE  # noqa: E402
from data_generators.provenance import corpus_page_path  # noqa: E402

# The two prose corpora plus GtoPdb's function pages (corpus #23).
PROSE_PAGES = {**_PROSE, "gtopdb_function": corpus_page_path("gtopdb_function", 0).parent}

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
    def check(oid, node, cands):
        mode, effect = node.get("mode"), node.get("effect")
        key = f"{mode}:{effect}"
        if mode not in RECEPTOR_EFFECT_MODES or effect not in RECEPTOR_EFFECTS:
            return key, "mode or effect outside the closed vocabulary"
        if mode == "inhibition" and kinds[oid] == "receptor":
            return key, "'inhibition' is a non-receptor target's mode"
        off = not_offered(cands, node.get("picks"), "effects", effect)
        if off:
            return key, f"candidate(s) {off} were not offered for {effect!r}"
        return key, None
    return apply_picks(worklist, judged, kinds, check, pages)


def main() -> int:
    return run_applier(__doc__, WORKLIST, JUDGED, CACHE,
                       lambda w, j: apply(w, j, current_kinds()), "receptor_effect")


if __name__ == "__main__":
    raise SystemExit(main())
