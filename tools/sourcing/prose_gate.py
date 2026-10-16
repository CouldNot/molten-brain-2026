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
from pipeline.judged import resolve, resolve_all  # noqa: E402


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
        """The ``{corpus, page, quote, provenance}`` sources for ``picks`` (``{index, qid}``
        refs, see ``pipeline.judged``), else None.

        All or nothing: one unresolvable pick or one quote missing from its page drops every
        pick for ``what`` (and records why in ``misses``), so a half-checked set never lands.
        """
        picked, why = resolve_all(cands, picks)
        if why:
            misses.append(f"{what}: {why}")
            return None
        out = []
        for c in picked:
            if not self.on_page(c["corpus"], c["page"], c["line"]):
                misses.append(f"{what}: quote not on {c['corpus']}/{c['page']}: "
                              f"{c['line'][:80]!r}")
                return None
            src = {"corpus": c["corpus"], "page": c["page"], "quote": c["line"],
                   "provenance": "verified"}
            if c.get("species"):  # a corpus recording its assay species (GtoPdb #23)
                src["species"] = c["species"]
            out.append(src)
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


def apply_picks(worklist: dict, judged: dict, owners_ok, check, pages: dict,
                ) -> tuple[dict[str, dict[str, list]], list[str]]:
    """The shared loop of an owner-keyed by-index applier: ``(cache, misses)``.

    ``judged["owners"][oid]`` is a list of node dicts, each with ``picks``. A node lands
    under ``cache[oid][key]`` only when the owner is in the worklist AND ``owners_ok``,
    ``check(oid, node, cands)`` returns ``(key, None)`` (else ``(None, reason)``: a
    vocabulary or "cue not offered" refusal), it has picks, and every pick passes the
    page gate. All or nothing per node; the cache is rebuilt from scratch on every run.
    """
    owners = worklist.get("owners", {})
    gate = PageGate(pages)
    out: dict[str, dict[str, list]] = {}
    misses: list[str] = []
    for oid, nodes in sorted((judged.get("owners") or {}).items()):
        own = owners.get(oid)
        if own is None or oid not in owners_ok:
            misses.append(f"{oid}: not in the worklist / not a current owner")
            continue
        cands = own.get("candidates", [])
        for node in nodes or []:
            key, why = check(oid, node, cands)
            what = f"{oid}/{key or node}"
            if why:
                misses.append(f"{what}: {why}")
                continue
            if not node.get("picks"):
                misses.append(f"{what}: no picks")
                continue
            srcs = gate.sources(cands, node["picks"], what, misses)
            if not srcs:
                continue
            bucket = out.setdefault(oid, {}).setdefault(key, [])
            for s in srcs:
                add_source(bucket, s)
    return out, misses


def not_offered(cands: list[dict], picks, field: str, value: str) -> list[int]:
    """The indices of the resolvable picks whose candidate was never offered ``value``
    under ``field``."""
    out = []
    for p in picks or []:
        cand, _ = resolve(cands, p)
        if cand is not None and value not in cand.get(field, []):
            out.append(p["index"])
    return out


def run_applier(doc: str, worklist_path: Path, judged_path: Path, cache_path: Path,
                apply, label: str) -> int:
    """The shared ``--dry-run`` command line of an owner-keyed applier: run ``apply(worklist,
    judged)``, print the misses, write the cache sorted (unless dry run)."""
    import argparse
    import json
    ap = argparse.ArgumentParser(description=doc,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="report, write nothing")
    args = ap.parse_args()
    cache, misses = apply(json.loads(worklist_path.read_text("utf-8")),
                          json.loads(judged_path.read_text("utf-8")))
    for m in misses:
        print(f"  [miss] {m}", file=sys.stderr)
    n = sum(len(v) for v in cache.values())
    print(f"{n} {label} node(s) over {len(cache)} owner(s), {len(misses)} miss(es)")
    if args.dry_run:
        print("(dry run: not written)")
        return 0
    cache_path.write_text(json.dumps(cache, indent=1, sort_keys=True, ensure_ascii=False) + "\n",
                          encoding="utf-8")
    print(f"wrote {cache_path}")
    return 0
