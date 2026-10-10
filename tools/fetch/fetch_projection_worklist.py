#!/usr/bin/env python
"""Build the projection worklist: candidate sentences for a pathway's still-open claims.

A projection is three graded claims (route, transmitter, and for glutamate/GABA its sign;
see ``data_generators.quotes.attestation``) plus a derived ``blanket_claim`` flag when its
only route quote sweeps several targets without naming this one. The claims are graded off
the pathway's own ``sources``, so closing one means citing a sentence that states it.

This is the candidate half of the four-step pipeline and states **no verdict**. Per
projection with work left it lists, indexed, every sentence (or two-sentence window) of
Kandel (corpus #2), the Nieuwenhuys atlas (#6) and Stahl Essential (#3) that names **both**
endpoints and could close something:

* ``transmitter``: the window carries the stored transmitter's word
  (``attestation.pattern_for``);
* ``sign``: it carries the stored sign's word;
* ``route``: the pathway is ``blanket_claim``-flagged (the window must name the target the
  way ``uncertainty._names_region`` reads it, the test that clears the flag) or has no
  source at all.

An LLM answers by index into ``projection_judged.json`` (confirm-only: it points at the
sentence asserting the stored value, never changes it), and
``tools/sourcing/apply_projection_sources.py`` gates and writes.

Usage (from the repo root)::

    python tools/fetch/fetch_projection_worklist.py
    python tools/fetch/fetch_projection_worklist.py --only "raphe->parietal_R"

Stdlib only, offline; author-side (needs the gitignored ``data_sources/`` book trees).

Built with the help of Claude Code.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent   # repo root
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(HERE))
from fetch_classification_worklist import sentences  # noqa: E402 (one sentence splitter)
from data_generators.quotes.attestation import pattern_for  # noqa: E402
from data_generators.quotes.uncertainty import (  # noqa: E402
    _base_id, _names_region, _region_designations)
from data_generators.presentation import KIND_TO_SIGN  # noqa: E402

OUT_PATH = ROOT / "tools" / "generated_cache" / "projection_worklist.json"
DATA = ROOT / "public" / "data"
BOOKS = ROOT / "data_sources" / "books"
CORPUS_PAGES = {
    "kandel": BOOKS / "eric_kandel" / "pages",
    "nieuwenhuys": BOOKS / "nieuwenhuys_atlas" / "pages",
    "stahl_essential": BOOKS / "stahl_essential_pharmacology" / "pages",
}
MAX_CANDIDATES = 60   # per projection, best-first; the judge reads every one
# A bibliography entry ("Smith J (1983) Title. J Comp Neurol 12:3-4") or a figure key
# ("1 Caudate nucleus 2 Putamen ...") names regions without the book asserting anything.
NOT_PROSE = re.compile(r"\((?:19|20)\d\d[a-z]?\)|\b\d+:\d+[-–]\d+")
FIGURE_KEY = re.compile(r"(?:^|\s)\d{1,2} [A-Z][a-z]")

# Spellings the books use that the generator's region designations do not catch
# ("ceruleus" is Kandel's, "septum" the noun of "septal"). Recall only: a hit here offers a
# sentence, it does not clear a flag (that stays the generator's own test).
FETCH_ALIASES: dict[str, tuple[str, ...]] = {
    "frontal": ("prefrontal", "motor cortex", "premotor", "orbitofrontal"),
    "septal_nuclei": ("septum", "septo"),
    "nucleus_basalis": ("basal forebrain", "nucleus basalis"),
    "locus_coeruleus": ("ceruleus", "noradrenergic neurons", "noradrenergic cell"),
    "raphe": ("serotonergic neurons", "serotonergic cell"),
    "tuberomammillary": ("histaminergic neurons", "histaminergic cell"),
    "pons": ("pontine",),
    "temporal": ("entorhinal",),
    "olfactory_bulb": ("olfactory",),
    "occipital": ("visual cortex", "striate"),
    "parietal": ("somatosensory cortex",),
    "cerebellum": ("cerebellar",),
    "hippocampus": ("dentate", "subiculum"),
}

# Coarser names, accepted for the ``transmitter`` / ``sign`` attributes only: "glutamatergic
# fibres from the cerebral cortex" to "the striatum" states a cortical lobe's striatal
# transmitter at the breadth the book writes it in. Never for ``route``: a sentence naming
# only "the cortex" cannot clear a blanket flag and does not place an arrow.
_CORTEX = ("cerebral cortex", "neocortex", "cortical", "cortico", "cortex")
COARSE_ALIASES: dict[str, tuple[str, ...]] = {
    **{lobe: _CORTEX for lobe in ("frontal", "parietal", "temporal", "occipital",
                                  "cingulate", "insula")},
    "caudate": ("striatum", "striatal", "striato"),
    "putamen": ("striatum", "striatal", "striato"),
}


def needs(p: dict) -> list[str]:
    """What still needs a source: ``transmitter`` / ``sign`` (graded llm) and ``route``."""
    claims = p.get("claims") or {}
    out = [c for c in ("transmitter", "sign") if (claims.get(c) or {}).get("grade") == "llm"]
    if p.get("uncertainty") or not p.get("sources"):
        out.append("route")
    return out


def projections() -> dict[str, dict]:
    """``{"from->to": {from, to, transmitter, sign, need, flag}}`` for projections with work."""
    out = {}
    for line in (DATA / "projections.jsonl").read_text("utf-8").splitlines():
        if not line.strip():
            continue
        p = json.loads(line)
        need = needs(p)
        if need:
            out[f"{p['from']}->{p['to']}"] = {
                "from": p["from"], "to": p["to"],
                "transmitter": p.get("neurotransmitter"),
                "sign": KIND_TO_SIGN.get(p.get("kind")) if (p.get("claims") or {}).get("sign")
                else None,
                "need": need,
                "flag": [u.get("kind") for u in p.get("uncertainty") or []],
                "label": p.get("label", ""),
            }
    return out


def designations() -> dict[str, set[str]]:
    """``base -> designations``, built exactly as ``apply_projection_uncertainty`` does."""
    out = {}
    for line in (DATA / "structures.jsonl").read_text("utf-8").splitlines():
        if line.strip():
            s = json.loads(line)
            base = _base_id(s["id"])
            out[base] = _region_designations(base, s.get("base_name") or s.get("name"))
    return out


def book_windows() -> list[tuple[str, int, str]]:
    """Every sentence and every adjacent two-sentence window, per corpus page."""
    out = []
    for corpus, d in CORPUS_PAGES.items():
        if not d.exists():
            continue
        for path in sorted(d.glob("*.md"), key=lambda q: int(q.stem)):
            sents = sentences(path.read_text("utf-8", errors="replace"))
            for i, s in enumerate(sents):
                out.append((corpus, int(path.stem), s))
                if i + 1 < len(sents):
                    out.append((corpus, int(path.stem), f"{s} {sents[i + 1]}"))
    return out


def names(text: str, base: str, des: dict[str, set[str]], coarse: bool = False) -> bool:
    low = text.lower()
    aliases = FETCH_ALIASES.get(base, ()) + (COARSE_ALIASES.get(base, ()) if coarse else ())
    return _names_region(text, des.get(base, set())) or any(a in low for a in aliases)


def candidates(proj: dict, windows: list, des: dict[str, set[str]]) -> list[dict]:
    src, dst = _base_id(proj["from"]), _base_id(proj["to"])
    tx = pattern_for("transmitter", proj["transmitter"]) if "transmitter" in proj["need"] else None
    sg = pattern_for("sign", proj["sign"]) if "sign" in proj["need"] and proj["sign"] else None
    route = "route" in proj["need"]
    flagged = bool(proj["flag"])
    commissure = src == dst
    out = []
    for corpus, page, text in windows:
        if NOT_PROSE.search(text) or len(FIGURE_KEY.findall(text)) >= 3:
            continue
        dst_exact = names(text, dst, des)
        if not (dst_exact or names(text, dst, des, coarse=True)):
            continue
        if commissure:
            if not re.search(r"commissur|callos|contralateral|interhemispher", text, re.I):
                continue
            src_exact = True
        else:
            src_exact = names(text, src, des)
            if not (src_exact or names(text, src, des, coarse=True)):
                continue
        # At most one endpoint may be named only coarsely: "cortical ... cortex" is every
        # cortico-cortical arrow at once, so it states none of them.
        if not (dst_exact or src_exact):
            continue
        exact = dst_exact and src_exact
        attrs = []
        if tx and tx.search(text):
            attrs.append("transmitter")
        if sg and sg.search(text):
            attrs.append("sign")
        if route and exact and (not flagged or _names_region(text, des.get(dst, set()))):
            attrs.append("route")
        if attrs:
            out.append({"corpus": corpus, "page": page, "line": text, "attrs": attrs})
    # A single sentence beats the window that contains it; more attributes first.
    out.sort(key=lambda c: (-len(c["attrs"]), len(c["line"])))
    seen, kept = set(), []
    for c in out:
        if c["line"] not in seen:
            seen.add(c["line"])
            kept.append(c)
    return kept[:MAX_CANDIDATES]


def build(only: set[str] | None = None) -> dict:
    des = designations()
    windows = book_windows()
    work = {}
    for key, proj in projections().items():
        if only and key not in only:
            continue
        work[key] = {**proj, "candidates": candidates(proj, windows, des)}
    return {"projections": work}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help='comma-separated "from->to" keys to scope the scan to')
    ap.add_argument("--out", type=Path, default=OUT_PATH, help="worklist output path")
    args = ap.parse_args()
    only = {k.strip() for k in args.only.split(",") if k.strip()} if args.only else None
    wl = build(only)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(wl, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    n = sum(len(v["candidates"]) for v in wl["projections"].values())
    empty = [k for k, v in wl["projections"].items() if not v["candidates"]]
    print(f"[ok] wrote {args.out}: {len(wl['projections'])} projections, {n} candidates, "
          f"{len(empty)} with none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
