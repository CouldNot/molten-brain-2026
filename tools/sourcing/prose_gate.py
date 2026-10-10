"""The quote gate shared by the by-index prose appliers.

A worklist lists indexed candidate sentences ``{corpus, page, line}``; an LLM answers by
index; the applier turns each picked index back into a source. This is that last step,
written once: it re-finds the candidate's sentence on its stored page with
``check_data.normalize_for_match`` (so "accepted here" means "passes check_data"), and a
pick that is out of range or no longer on its page writes nothing.

Used by ``apply_classification_sources.py --prose``, ``apply_projection_sources.py`` and
``apply_cyp_sources.py``.

Built with the help of Claude Code.
"""
from __future__ import annotations

import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(TOOLS))
from check_data import normalize_for_match  # noqa: E402  (reuse the gate's normalizer)


class PageGate:
    """Re-finds picked candidates on their stored pages, caching each page's text.

    ``pages`` maps a corpus to its page directory (page file = ``<page>.md``).
    """

    def __init__(self, pages: dict[str, Path]):
        self.pages = pages
        self._text: dict[tuple, str | None] = {}

    def text(self, corpus: str, page) -> str | None:
        """The stored page, normalized, or None when the corpus has no such page file."""
        key = (corpus, str(page))
        if key not in self._text:
            path = self.pages.get(corpus)
            path = Path(path) / f"{page}.md" if path else None
            self._text[key] = (normalize_for_match(path.read_text("utf-8", errors="replace"))
                               if path and path.exists() else None)
        return self._text[key]

    def on_page(self, corpus: str, page, line: str) -> bool:
        body = self.text(corpus, page)
        return bool(body) and normalize_for_match(line) in body

    def sources(self, cands: list[dict], picks, what: str,
                misses: list[str]) -> list[dict] | None:
        """The ``{corpus, page, quote, provenance}`` sources for ``picks``, else None.

        All or nothing: one bad index or one quote missing from its page drops every pick
        for ``what`` (and records why in ``misses``), so a half-checked set never lands.
        """
        out = []
        for i in picks or []:
            if not isinstance(i, int) or not 0 <= i < len(cands):
                misses.append(f"{what}: index {i!r} out of range")
                return None
            c = cands[i]
            if not self.on_page(c["corpus"], c["page"], c["line"]):
                misses.append(f"{what}: quote not on {c['corpus']}/{c['page']}: "
                              f"{c['line'][:80]!r}")
                return None
            out.append({"corpus": c["corpus"], "page": c["page"], "quote": c["line"],
                        "provenance": "verified"})
        return out


def add_source(bucket: list, src: dict, key=None) -> bool:
    """Append ``src`` unless a source with the same quote is already there (idempotence).

    ``key`` maps a quote before comparing (e.g. ``normalize_for_match``, so two spellings
    of one sentence count as one source); the default compares quotes verbatim.
    """
    key = key or (lambda q: q)
    if any(key(s.get("quote") or "") == key(src["quote"]) for s in bucket):
        return False
    bucket.append(src)
    return True
