#!/usr/bin/env python
"""Build the ``receptor_effect`` worklist: candidate sentences per (owner, effect).

Fetch / candidate-extraction half of the usual four-step pipeline (see CLAUDE.md
"Drugs"), and it states **no verdict**: per receptor / non-receptor target it lists,
indexed, every sentence that names the owner AND hits an effect keyword
(:data:`EFFECT_KEYWORDS`), from

* Stahl's Essential Psychopharmacology (corpus #3 ``stahl_essential``, primary);
* the owner's own stored English Wikipedia article (corpus #9 ``wikipedia_pharm``,
  fallback; only articles already under ``data_sources/wikipedia/pages/``).

Each candidate carries the effect ids its keywords hit, so the LLM pass (answering by
index into ``tools/generated_cache/receptor_effects_judged.json``) and the applier
(``tools/sourcing/apply_receptor_effects.py``) can both check an effect was actually
offered for the sentence. Sentence splitting, owner aliases and the article lookup are
reused from ``fetch_classification_worklist`` (same corpora, same gotchas).

Usage (from the repo root)::

    python tools/fetch/fetch_receptor_effects.py
    python tools/fetch/fetch_receptor_effects.py --only h1,5ht2a

Stdlib only, offline; author-side (needs the gitignored ``data_sources/`` trees).

Built with the help of Claude Code.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(HERE))
import fetch_classification_worklist as cls  # noqa: E402 (sentences, stahl_sentences, aliases)
import fetch_cyp_wikipedia as cypwiki  # noqa: E402 (slug_of)
import target_aliases  # noqa: E402
from data_generators.receptor_effects import RECEPTOR_EFFECTS  # noqa: E402
from worklist_io import merge_scoped  # noqa: E402

OUT_PATH = ROOT / "tools" / "generated_cache" / "receptor_effects_worklist.json"

# effect -> the words a sentence must carry to be offered for it. Recall over precision:
# the LLM pass discards a weak hit, a sentence never offered can never be picked.
EFFECT_KEYWORDS: dict[str, re.Pattern[str]] = {k: re.compile(v, re.I) for k, v in {
    "sedation": r"sedat|somnolen|drows|sleepiness",
    "weight_gain": r"weight gain|gain weight|weight-gain|obesity",
    "appetite_increase": r"appetite|hyperphag|food intake|hunger",
    "orthostatic_hypotension": r"orthostatic|postural hypotension|hypotension",
    "dizziness": r"dizzi",
    "hallucinations": r"hallucinat|psychotomimetic|psychedelic",
    "prolactin_elevation": r"prolactin|galactorrh|amenorrh",
    "extrapyramidal_symptoms": r"extrapyramidal|\bEPS\b|parkinsonism|\bDIP\b|dystoni",
    "tardive_dyskinesia": r"tardive",
    "akathisia": r"akathisia",
    "anticholinergic_cognitive": (r"memory (?:impair|problem|disturb|loss|deficit)|"
                                  r"cognitive (?:impair|dysfunction|side effect|blunting|deficit)|"
                                  r"confusion|delirium"),
    "dry_mouth": r"dry mouth|xerostomia",
    "constipation": r"constipat",
    "blurred_vision": r"blurred vision|blurr",
    "urinary_retention": r"urinary retention",
    "nausea": r"nausea|vomit|emesis",
    "sexual_dysfunction": r"sexual",
    "insomnia": r"insomnia",
    "anxiety": r"\banxiety|agitation|jitter",
    "euphoria": r"euphori|abuse|addict|reinforc",
    "dysphoria": r"dysphori",
    "respiratory_depression": r"respiratory depression|respiration",
    "seizures": r"seizure|convuls",
    "psychosis": r"psychosis|psychotic",
    "cardiovascular": r"tachycardia|heart rate|blood pressure|hypertension",
    "cardiac_valvulopathy": r"valvulopath|valvular|heart valve|fibros",
    "antiemetic": r"anti-?emetic|nausea|vomit|emesis",
    "anticonvulsant": r"anticonvuls|anti-?epilep|antiseizure|epilep|seizure",
    "anxiolytic": r"anxiolytic|anti-?anxiety|anxiety",
    "antidepressant": r"antidepress|depressi",
    "antipsychotic": r"antipsychotic|schizophreni|psychosis|psychotic",
    "antiparkinsonian": r"parkinson",
    "analgesia": r"analges|antinocicept|\bpain",
    "antimigraine": r"migraine|triptan|cluster headache",
    "appetite_decrease": r"satiety|anorec|anorexi|appetite|weight loss|food intake|obesity",
    "pro_cognitive": r"cognit|memory|learning|attention",
    "sleep_promotion": r"sleep|hypnotic|insomnia",
    "circadian_shift": r"circadian|phase.shift|jet lag|sleep-wake",
    "wakefulness": r"wakeful|arousal|alertness|narcolep|vigilance|awake",
    "hypothermia": r"hypotherm|body temperature|thermoreg",
    "bradycardia": r"bradycard|heart rate|chronotrop",
    "bronchodilation": r"bronchodilat|bronch|asthma|airway",
    "gastric_acid_reduction": r"gastric acid|acid secretion|peptic|ulcer|heartburn|reflux",
    "vasoconstriction": r"vasoconstrict",
}.items()}
assert set(EFFECT_KEYWORDS) == set(RECEPTOR_EFFECTS), "keyword table out of sync"

# Family names prose uses for a subtype we model separately: Stahl writes "α1 antagonism",
# never "α1A". A quote about the α1 family is offered for each α1 subtype (each IS an α1
# receptor); the alias pattern keeps "α1" from matching "α1A". Local on purpose, like
# ``fetch_classification_worklist.PROSE_ALIASES``.
FAMILY_ALIASES: dict[str, list[str]] = {
    "alpha1a": ["α1"], "alpha1b": ["α1"], "alpha1d": ["α1"],
}
# Owners whose only aliases are a bare transmitter name ("glutamate"): every sentence
# about the transmitter would be offered as one about the receptor group.
SKIP_OWNERS = {"glutamate"}


def effect_hits(line: str) -> list[str]:
    """The effect ids whose keywords ``line`` carries, in vocabulary order."""
    return [e for e, rx in EFFECT_KEYWORDS.items() if rx.search(line)]


def owners() -> dict[str, dict]:
    """``{id: {kind, name, wikipedia}}`` for every receptor and non-receptor target."""
    out: dict[str, dict] = {}
    for line in (ROOT / "public/data/receptors.jsonl").read_text("utf-8").splitlines():
        if line.strip():
            r = json.loads(line)
            out[r["id"]] = {"kind": "receptor", "name": r["name"],
                            "wikipedia": r.get("wikipedia", "")}
    meta = json.loads((ROOT / "public/data/meta.json").read_text("utf-8"))
    for tid, t in meta["drug_targets"].items():
        if isinstance(t, dict) and tid not in out:
            out[tid] = {"kind": "target", "name": t["name"],
                        "wikipedia": t.get("wikipedia", "")}
    return out


def candidates(oid: str, owner: dict, stahl: list[tuple[int, str]],
               aliases: dict[str, list[str]], hits=None, key: str = "effects",
               family: dict[str, list[str]] | None = None) -> list[dict]:
    """Indexed candidate sentences for one owner: Stahl Essential first, then its article.
    ``hits(line)`` returns the cue ids a sentence carries (stored under ``key``)."""
    hits = hits or effect_hits
    out: list[dict] = []
    names = ((aliases.get(oid) or []) + cls.PROSE_ALIASES.get(oid, [])
             + (FAMILY_ALIASES if family is None else family).get(oid, []))
    rx = target_aliases.alias_regex(names) if names else None
    for page, line in stahl:
        if rx and rx.search(target_aliases.fold(line)):
            hit = hits(line)
            if hit:
                out.append({"corpus": "stahl_essential", "page": page, "line": line,
                            key: hit})
    slug = cypwiki.slug_of(owner["wikipedia"]) if owner["wikipedia"] else ""
    slug = cls.PAGE_ALIASES.get(slug, slug)
    path = cls.WIKI_PAGES / f"{slug}.md"
    if slug and path.exists():
        for line in cls.sentences(path.read_text("utf-8", errors="replace")):
            hit = hits(line)
            if hit:
                out.append({"corpus": "wikipedia_pharm", "page": slug, "line": line,
                            key: hit})
    seen: set[tuple] = set()
    return [c for c in out if not ((c["corpus"], c["line"]) in seen
                                   or seen.add((c["corpus"], c["line"])))]


def build(only: set[str] | None = None, hits=None, key: str = "effects",
          owner_kinds: tuple[str, ...] = ("receptor", "target"),
          family: dict[str, list[str]] | None = None) -> dict:
    """``{"owners": {id: {kind, name, wikipedia, candidates}}}`` for every owner whose
    kind is in ``owner_kinds`` and that has at least one candidate. ``hits`` / ``key``
    pick the cue table (default: the clinical-effect keywords, stored under
    ``effects``); ``fetch_release_modulation`` reuses this with its own cues."""
    stahl = cls.stahl_sentences()
    aliases = target_aliases.aliases_by_target()
    work = {}
    for oid, owner in owners().items():
        if (only and oid not in only) or oid in SKIP_OWNERS or owner["kind"] not in owner_kinds:
            continue
        cands = candidates(oid, owner, stahl, aliases, hits or effect_hits, key, family)
        if cands:
            work[oid] = {**owner, "candidates": cands}
    return {"owners": work}


def run_cli(doc: str, out_path: Path, builder=build) -> int:
    """The shared ``--only`` / ``--out`` command line: build, merge a scoped run into the
    existing worklist, write it."""
    ap = argparse.ArgumentParser(description=doc,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="comma-separated receptor/target ids to scope the scan to")
    ap.add_argument("--out", type=Path, default=out_path, help="worklist output path")
    args = ap.parse_args()
    only = {d.strip() for d in args.only.split(",") if d.strip()} if args.only else None
    wl = builder(only)
    if only and args.out.exists():
        wl = merge_scoped(json.loads(args.out.read_text("utf-8")), wl, "owners")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(wl, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    n = sum(len(v["candidates"]) for v in wl["owners"].values())
    print(f"[ok] wrote {args.out}: {len(wl['owners'])} owners, {n} candidates")
    return 0


def main() -> int:
    return run_cli(__doc__, OUT_PATH)


if __name__ == "__main__":
    raise SystemExit(main())
