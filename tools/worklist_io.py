"""Shared helper for the ``--only`` scoped rebuild of an LLM worklist.

Every worklist under ``tools/generated_cache/`` is answered **by index** into a committed
``*_judged.json``. A scoped (``--only``) rebuild that overwrote the whole file would orphan
every other entry's already-applied picks (it once dropped 5600 lines of candidates), so a
scoped build is **merged** into the existing worklist instead.

:func:`write` is the one way a fetcher saves a worklist: it stamps every candidate's
``qid`` fingerprint first (``pipeline.judged``), so the judge can echo it and the applier
can refuse a pick whose index has since shifted onto another sentence.
"""
from __future__ import annotations

from io_atomic import atomic_write_json
from pipeline.judged import stamp


def merge_scoped(existing: dict, scoped: dict, key: str) -> dict:
    """Merge a scoped build into ``existing``: entries under ``key`` are merged (scoped
    wins per entry), every other top-level field is taken from the fresh ``scoped`` build.

    >>> merge_scoped({"v": 1, "d": {"x": 1, "y": 2}}, {"v": 2, "d": {"y": 3}}, "d")
    {'v': 2, 'd': {'x': 1, 'y': 3}}
    """
    out = {**existing, **{k: v for k, v in scoped.items() if k != key}}
    out[key] = {**existing.get(key, {}), **scoped.get(key, {})}
    return out


def merge_scoped_list(existing: list, scoped: list, key: str) -> list:
    """The list-shaped twin of :func:`merge_scoped`: entries matched on ``entry[key]``,
    a scoped entry replacing its old self in place, a new one appended.

    >>> merge_scoped_list([{"k": "a", "v": 1}, {"k": "b", "v": 2}],
    ...                   [{"k": "b", "v": 3}, {"k": "c", "v": 4}], "k")
    [{'k': 'a', 'v': 1}, {'k': 'b', 'v': 3}, {'k': 'c', 'v': 4}]
    """
    fresh = {e[key]: e for e in scoped}
    out = [fresh.pop(e[key], e) for e in existing]
    return out + list(fresh.values())


def write(path, worklist, indent: int = 1, sort_keys: bool = False) -> None:
    """Stamp ``qid`` on every candidate of ``worklist`` and write it as UTF-8 JSON."""
    atomic_write_json(path, stamp(worklist), indent=indent, sort_keys=sort_keys)
