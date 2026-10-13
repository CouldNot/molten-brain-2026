#!/usr/bin/env python
"""Build the ``receptor_release_modulation`` worklist: candidate sentences per receptor.

The fetch / candidate-extraction half of the usual four-step pipeline (see CLAUDE.md
"Drugs"), and it states **no verdict**: for every receptor it lists, indexed, each
sentence that names the receptor AND carries a release-modulation cue (autoreceptor,
heteroreceptor, presynaptic, somatodendritic, interneuron, disinhibition, release, ...)
AND names at least one transmitter, from the same two corpora as the ``receptor_effect``
pass (Stahl's Essential Psychopharmacology #3 first, then the receptor's own stored English
Wikipedia article #9). Each candidate carries the transmitters it names (``transmitters``),
and the applier refuses a pick whose ``modulates`` the sentence never names.

Everything but the cue table is :mod:`fetch_receptor_effects` (owner aliases, sentence
splitting, article lookup, the ``--only`` / ``--out`` command line), reused, not copied.

Usage (from repo root)::

    python tools/fetch/fetch_release_modulation.py
    python tools/fetch/fetch_release_modulation.py --only h3,5ht2c

Stdlib only, offline; author-side (needs the gitignored ``data_sources/`` trees).

Built with the help of Claude Code.
"""
from __future__ import annotations

import functools
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_receptor_effects as fre  # noqa: E402 (candidates, build, run_cli)
from data_generators.release_modulation import RELEASE_TRANSMITTERS  # noqa: E402

OUT_PATH = ROOT / "tools" / "generated_cache" / "release_modulation_worklist.json"

# A sentence must carry one of these to be about release modulation at all. Recall over
# precision: the pick step discards weak hits, but a sentence never offered is never picked.
MECHANISM = re.compile(
    r"autoreceptor|heteroreceptor|presynap|somatodendritic|interneuron|disinhibit|"
    r"releas|\bburst|axon terminal|nerve terminal|(?:brake|braking)", re.I)

# transmitter id -> the words naming it. Acronyms stay case-sensitive ("NE", "DA"), and a
# receptor name ("5HT2C", "serotonin 1A") does not count as naming serotonin.
TRANSMITTER_CUES: dict[str, re.Pattern[str]] = {k: re.compile(v) for k, v in {
    "dopamine": r"(?i:dopamin)|\bDA\b",
    "serotonin": r"(?i:serotonin)(?![\s-]?\d)|\b5-?HT(?![\s-]?\d)",
    "norepinephrine": r"(?i:norepinephrin|noradrenalin)|\bNE\b",
    "acetylcholine": r"(?i:acetylcholin|cholinergic)|\bACh\b",
    "histamine": r"(?i:histamin)|\bHA\b",
    "glutamate": r"(?i:glutamat)",
    "gaba": r"\bGABA",
}.items()}
assert set(TRANSMITTER_CUES) == set(RELEASE_TRANSMITTERS), "cue table out of sync"

# Family names the prose uses for a subtype we model separately ("α2 heteroreceptors",
# "mGlu2/3 receptors"), on top of fre.FAMILY_ALIASES.
FAMILY_ALIASES: dict[str, list[str]] = {
    **fre.FAMILY_ALIASES,
    "alpha2a": ["α2", "alpha 2"], "alpha2b": ["α2", "alpha 2"], "alpha2c": ["α2", "alpha 2"],
    "mglur2": ["mGlu2", "mGlu2/3", "mGluR2/3"], "mglur3": ["mGlu3", "mGlu2/3", "mGluR2/3"],
}


def transmitter_hits(line: str) -> list[str]:
    """The transmitters ``line`` names, in vocabulary order, or [] without a mechanism cue."""
    if not MECHANISM.search(line):
        return []
    return [t for t, rx in TRANSMITTER_CUES.items() if rx.search(line)]


build = functools.partial(fre.build, hits=transmitter_hits, key="transmitters",
                          owner_kinds=("receptor",), family=FAMILY_ALIASES)


def main() -> int:
    return fre.run_cli(__doc__, OUT_PATH, build)


if __name__ == "__main__":
    raise SystemExit(main())
