"""PROJECTION_SOURCES: the machine-applied pathway sources, loaded from the cache.

``tools/generated_cache/projection_sources.json`` is written only by
``tools/sourcing/apply_projection_sources.py`` (the by-index projection pass over Kandel,
Nieuwenhuys and Stahl Essential, see that script). Each entry is a list of quote-level
``{corpus, page, quote, provenance}`` sources for one right-side pathway, appended to the
pathway's ``sources`` after its :data:`PROJECTION_QUOTES` quote, so the claim and
uncertainty post-passes grade it like any other source. A missing file is fine.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_CACHE = (Path(__file__).resolve().parent.parent.parent / "generated_cache"
          / "projection_sources.json")


def _load() -> dict[tuple[str, str], list[dict[str, Any]]]:
    if not _CACHE.exists():
        return {}
    data = json.loads(_CACHE.read_text(encoding="utf-8"))
    return {tuple(key.split("->", 1)): srcs
            for key, srcs in (data.get("projections") or {}).items()}


PROJECTION_SOURCES: dict[tuple[str, str], list[dict[str, Any]]] = _load()
