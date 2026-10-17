"""Shared helpers for the generators that read a committed ``tools/generated_cache/`` file
or a closed vocabulary, written once instead of once per generator.

* :func:`load`: a cache's parsed JSON, memoized per name. ``required=False`` turns a missing
  file into ``{}`` (a pass not built yet), the default raises.
* :func:`labels`: a vocabulary's ``{id: {en, fr}}`` label map, emitted into meta (the
  author-side ``attests`` patterns stay out).
* :func:`attests`: whether a text names a vocabulary entry, under its ``attests`` regex.

Example::

    >>> VOCAB = {"ecg": {"en": "ECG", "fr": "ECG", "attests": r"\\bECG\\b"},
    ...          "unstated": {"en": "not stated", "fr": "non précisé", "attests": ""}}
    >>> attests(VOCAB, "ecg", "Un ECG avant"), attests(VOCAB, "ecg", "rien")
    (True, False)
    >>> attests(VOCAB, "unstated", "anything"), attests(VOCAB, "missing", "ECG")
    (True, False)
    >>> labels(VOCAB)["ecg"]
    {'en': 'ECG', 'fr': 'ECG'}

Stdlib only. Built with the help of Claude Code.
"""
from __future__ import annotations

import functools
import json
import re
from pathlib import Path
from typing import Any

CACHE_DIR = Path(__file__).resolve().parent.parent / "generated_cache"


@functools.lru_cache(maxsize=None)
def load(name: str, required: bool = True) -> Any:
    """The parsed ``generated_cache/<name>`` (memoized: callers must not mutate it).

    A missing file raises ``FileNotFoundError`` unless ``required`` is False, when it reads
    as ``{}`` (the pass that writes it has not run yet on this clone)."""
    path = CACHE_DIR / name
    if not required and not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def labels(vocab: dict[str, dict[str, str]]) -> dict[str, dict[str, str]]:
    """The ``{id: {en, fr}}`` label map emitted into meta (patterns stay author-side)."""
    return {k: {"en": v["en"], "fr": v["fr"]} for k, v in vocab.items()}


def attests(vocab: dict[str, dict[str, str]], key: str, *texts: str | None) -> bool:
    """Whether any of ``texts`` names vocabulary entry ``key`` (case-insensitive regex).

    An unknown key never does; an entry whose pattern is empty always does (a value no
    quote has to spell out, such as a withdrawal whose reason is ``unstated``)."""
    entry = vocab.get(key)
    if entry is None:
        return False
    pat = entry.get("attests", "")
    return not pat or any(re.search(pat, t or "", re.IGNORECASE) for t in texts)
