#!/usr/bin/env python
"""Apply the by-index projection picks into ``tools/generated_cache/projection_sources.json``.

The writer half of the projection pass: ``tools/fetch/fetch_projection_worklist.py`` lists
indexed candidate sentences (Kandel #2, Nieuwenhuys #6, Stahl Essential #3) per pathway
with an open claim, an LLM answers by index into ``projection_judged.json``
(``{"from->to": {"transmitter"|"sign"|"route": [idx, ...]}}``), and this gates and writes.
``generate_data.py`` appends the written sources to the pathway's own ``sources``, where
``attestation.apply_projection_claims`` grades the transmitter / sign claims off them and
``uncertainty.apply_projection_uncertainty`` re-derives ``blanket_claim``.

**Confirm-only.** A pick lands only when:

* the pathway is still in the worklist and still emitted;
* its transmitter and sign still equal the values the worklist recorded (a source never
  changes a stored value; a disagreement is for a human);
* the attribute was listed in the worklist's ``need``;
* the picked candidate was offered *for that attribute* (its ``attrs``), and a
  transmitter / sign pick still carries the stored value's word
  (``attestation.pattern_for``), so the claim it is meant to close really moves;
* the quote is re-found verbatim on its page (``prose_gate.PageGate``, i.e.
  ``check_data.normalize_for_match``).

Idempotent (dedup by quote). It writes no ``llm`` stamp, so
``tools/sourcing/recheck_quotes.py`` must judge the new citations afterwards.

Run from the repo root, then regenerate + check::

    python tools/sourcing/apply_projection_sources.py --dry-run
    python tools/sourcing/apply_projection_sources.py
    python tools/generate_data.py && python tools/check_data.py

Built with the help of Claude Code.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "tools"))
from prose_gate import PageGate, add_source  # noqa: E402
from data_generators.quotes.attestation import pattern_for  # noqa: E402
from data_generators.presentation import KIND_TO_SIGN  # noqa: E402

CACHE = ROOT / "tools" / "generated_cache"
WORKLIST = CACHE / "projection_worklist.json"
JUDGED = CACHE / "projection_judged.json"
OUT = CACHE / "projection_sources.json"
BOOKS = ROOT / "data_sources" / "books"
PAGES = {
    "kandel": BOOKS / "eric_kandel" / "pages",
    "nieuwenhuys": BOOKS / "nieuwenhuys_atlas" / "pages",
    "stahl_essential": BOOKS / "stahl_essential_pharmacology" / "pages",
}
ATTRS = ("transmitter", "sign", "route")


def current_projections() -> dict[str, dict]:
    """``{"from->to": {"transmitter", "sign"}}`` as emitted now."""
    out = {}
    for line in (ROOT / "public" / "data" / "projections.jsonl").read_text("utf-8").splitlines():
        if line.strip():
            p = json.loads(line)
            out[f"{p['from']}->{p['to']}"] = {
                "transmitter": p.get("neurotransmitter"),
                "sign": KIND_TO_SIGN.get(p.get("kind")) if (p.get("claims") or {}).get("sign")
                else None,
            }
    return out


def apply(worklist: dict, judged: dict, current: dict, out: dict,
          pages: dict = PAGES) -> tuple[int, list[str]]:
    """Gate ``judged`` picks and merge them into ``out`` (``{"from->to": [source]}``).

    Returns ``(applied, misses)``; a miss writes nothing for that attribute.
    """
    work = worklist.get("projections", {})
    gate = PageGate(pages)
    applied, misses = 0, []
    for key, attrs in sorted(judged.items()):
        own, now = work.get(key), current.get(key)
        if own is None or now is None:
            misses.append(f"{key}: not in the worklist / not a current projection")
            continue
        if (now["transmitter"], now["sign"]) != (own.get("transmitter"), own.get("sign")):
            misses.append(f"{key}: value changed since the worklist "
                          f"({own.get('transmitter')}/{own.get('sign')} -> "
                          f"{now['transmitter']}/{now['sign']})")
            continue
        cands = own.get("candidates", [])
        for attr, picks in sorted(attrs.items()):
            if not picks:
                continue
            if attr not in ATTRS or attr not in own.get("need", []):
                misses.append(f"{key}/{attr}: not an open claim in the worklist")
                continue
            pat = (pattern_for(attr, own[attr]) if attr != "route" else None)
            bad = [i for i in picks if isinstance(i, int) and 0 <= i < len(cands) and (
                attr not in cands[i].get("attrs", [])
                or (pat is not None and not pat.search(cands[i]["line"])))]
            if bad:
                misses.append(f"{key}/{attr}: candidate(s) {bad} not offered for {attr}")
                continue
            srcs = gate.sources(cands, picks, f"{key}/{attr}", misses)
            if srcs:
                bucket = out.setdefault(key, [])
                applied += sum(add_source(bucket, s) for s in srcs)
    return applied, misses


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true",
                    help="report what would be written, change nothing")
    args = ap.parse_args()
    worklist = json.loads(WORKLIST.read_text("utf-8"))
    judged = json.loads(JUDGED.read_text("utf-8"))
    data = json.loads(OUT.read_text("utf-8")) if OUT.exists() else {}
    out = data.setdefault("projections", {})
    applied, misses = apply(worklist, judged, current_projections(), out)
    for m in misses:
        print(f"[miss] {m}")
    print(f"[ok] applied {applied} source(s) over {len(out)} projection(s), "
          f"{len(misses)} miss(es){' (dry run)' if args.dry_run else ''}")
    if not args.dry_run:
        data["projections"] = dict(sorted(out.items()))
        OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
