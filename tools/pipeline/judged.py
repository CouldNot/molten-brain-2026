"""Candidate fingerprints: a judged pick names its candidate by index AND by ``qid``.

Every LLM pass answers **by index** into a worklist's ``candidates`` list, and the
applier re-derives that list before resolving the index. An index alone is fragile:
a rebuilt worklist (a now-bound target dropped, a different label copy chosen, a
refreshed page with one more line) shifts the list, and the old index silently lands
on a different sentence. So every candidate carries ``qid``, a fingerprint of its
text, the judge echoes it next to the index, and :func:`resolve` refuses a pick whose
index no longer points at the sentence it was judged on::

    >>> cands = [{"line": "Drug X blocks D2."}, {"line": "Drug X binds H1."}]
    >>> stamp({"candidates": cands}) and cands[1]["qid"]
    '3c12f6de'
    >>> resolve(cands, {"index": 1, "qid": "3c12f6de"})
    ({'line': 'Drug X binds H1.', 'qid': '3c12f6de'}, None)
    >>> resolve(cands, {"index": 0, "qid": "3c12f6de"})[1]
    'qid mismatch: the worklist changed since this pick was judged'

A pick is either a dict carrying the index (under ``key``) plus ``qid``, or, where a
judged file lists bare picks, ``{"index": i, "qid": q}`` objects (see :func:`ref`).

Built with the help of Claude Code.
"""
from __future__ import annotations

import hashlib

TEXT_FIELDS = ("line", "quote")

# Appended to every worklist's judge instructions, so the judge echoes the fingerprint.
ECHO_QID = (" Every pick that names a candidate by `index` also copies that candidate's "
            "`qid` verbatim beside it.")


def text_of(cand) -> str:
    """The sentence a candidate offers: a bare string, else its ``line`` / ``quote``."""
    if isinstance(cand, str):
        return cand
    for field in TEXT_FIELDS:
        if isinstance(cand.get(field), str):
            return cand[field]
    raise KeyError(f"candidate has none of {TEXT_FIELDS}: {sorted(cand)}")


def qid(text: str) -> str:
    """8-hex fingerprint of ``text``, whitespace-insensitive (a reflowed page keeps it)."""
    return hashlib.sha1(" ".join(text.split()).encode("utf-8")).hexdigest()[:8]


def stamp(worklist):
    """Set ``qid`` on every dict candidate under any ``candidates`` key of ``worklist``
    (walked recursively), in place; returns ``worklist`` so a writer can chain it."""
    if isinstance(worklist, dict):
        for k, v in worklist.items():
            if k == "candidates" and isinstance(v, list):
                for c in v:
                    if isinstance(c, dict):
                        c["qid"] = qid(text_of(c))
            stamp(v)
    elif isinstance(worklist, list):
        for v in worklist:
            stamp(v)
    return worklist


def ref(cands: list, index: int) -> dict:
    """The ``{"index", "qid"}`` pick naming ``cands[index]`` (what a judge writes)."""
    return {"index": index, "qid": qid(text_of(cands[index]))}


def resolve(cands: list, pick, key: str = "index"):
    """``(candidate, None)`` when ``pick[key]`` is an in-range int (a bool is not) AND
    ``pick["qid"]`` matches that candidate's text, else ``(None, reason)``."""
    if not isinstance(pick, dict):
        return None, f"pick is not an object with {key!r} and 'qid': {pick!r}"
    index = pick.get(key)
    if isinstance(index, bool) or not isinstance(index, int) or not 0 <= index < len(cands):
        return None, "candidate index out of range"
    if not pick.get("qid"):
        return None, "pick carries no qid"
    cand = cands[index]
    if qid(text_of(cand)) != pick["qid"]:
        return None, "qid mismatch: the worklist changed since this pick was judged"
    return cand, None


def resolve_all(cands: list, picks, key: str = "index"):
    """``(candidates, None)`` for a list of picks, all or nothing, else ``(None, reason)``."""
    out = []
    for p in picks or []:
        cand, why = resolve(cands, p, key)
        if why:
            return None, f"pick {p.get(key) if isinstance(p, dict) else p!r}: {why}"
        out.append(cand)
    return out, None
