#!/usr/bin/env python
"""Store a few primary-literature abstracts as corpus #17 (Europe PMC).

Some claims no textbook, label or encyclopedia article on disk states: lithium's brain
half-life being longer than its serum half-life is measured only in the 7Li magnetic
resonance spectroscopy literature. This corpus holds exactly those papers, one abstract
per page, so such a claim is quote-gated like any other instead of being authored from
memory. It is **not** a literature crawl: the papers are the hand-listed :data:`PAPERS`,
each with the claim it was added for, so the corpus never grows without a reason a
reader can see.

What it stores, per PubMed id:

* ``data_sources/europepmc/raw/<pmid>.json`` - the Europe PMC ``core`` search record as
  downloaded, kept so the page can be re-derived without re-fetching.
* ``data_sources/europepmc/pages/<pmid>.md`` - the quote-gate page: a provenance header
  (title, authors, journal, DOI, source URL, fetch date), then the abstract, one
  sentence per line. ``page`` on a quote is the PMID, which resolves to
  ``https://europepmc.org/article/MED/<pmid>``.

The abstract only, never the full text: it is what Europe PMC serves for every indexed
paper (open access or not), and a short verbatim sentence from it is a citation, like a
quoted line of a book. Like every other corpus tree, ``data_sources/`` is gitignored and
author-side: the quote gate is skipped with a warning on a clone that lacks it.

Usage (from the repo root)::

    python tools/fetch/fetch_europepmc.py                 # every paper in PAPERS
    python tools/fetch/fetch_europepmc.py --only 7827213
    python tools/fetch/fetch_europepmc.py --refresh       # re-download stored records

Network (``www.ebi.ac.uk``), polite and resumable: a paper whose page is on disk is
skipped unless ``--refresh``. Stdlib only.

Built with the help of Claude Code.
"""
import argparse
import html
import json
import re
import sys
import time
import urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent                                       # repo root
sys.path.insert(0, str(HERE))

from fetch_dailymed import _get                                # noqa: E402 (polite GET)

API = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
ARTICLE_URL = "https://europepmc.org/article/MED/{pmid}"
RAW_DIR = ROOT / "data_sources" / "europepmc" / "raw"
PAGES_DIR = ROOT / "data_sources" / "europepmc" / "pages"

# PMID -> the claim it is stored for. Add a paper only for a claim nothing else on disk
# states, and say which.
PAPERS: dict[str, str] = {
    "7827213": "lithium: brain half-life (7Li MRS) longer than serum half-life "
               "(addon lithium_brain_half_life)",
}

_TAG = re.compile(r"<[^>]+>")
# A sentence ends at . ! ? followed by a space and a capital or digit; abbreviations
# like "hr." are rare enough in an abstract that a split line still holds the quote.
_SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9])")


def record(pmid: str) -> dict | None:
    """The Europe PMC ``core`` record of one PubMed id, or None when not found."""
    query = urllib.parse.urlencode({"query": f"EXT_ID:{pmid} AND SRC:MED",
                                    "format": "json", "resultType": "core"})
    text = _get(f"{API}?{query}")
    if not text:
        return None
    hits = json.loads(text).get("resultList", {}).get("result") or []
    return hits[0] if hits else None


def page_text(rec: dict) -> str:
    """The stored page: a provenance header, then the abstract one sentence per line."""
    journal = (rec.get("journalInfo") or {})
    abstract = html.unescape(_TAG.sub(" ", rec.get("abstractText") or ""))
    abstract = " ".join(abstract.split())
    head = [
        f"# {rec.get('title', '').strip()}",
        f"authors: {rec.get('authorString', '').strip()}",
        f"journal: {(journal.get('journal') or {}).get('title')} "
        f"{journal.get('volume')}({journal.get('issue')}):{rec.get('pageInfo')}, "
        f"{rec.get('pubYear')}",
        f"pmid: {rec.get('pmid')}",
        f"doi: {rec.get('doi')}",
        f"source: {ARTICLE_URL.format(pmid=rec.get('pmid'))}",
        f"fetched: {time.strftime('%Y-%m-%d')}",
        "",
    ]
    return "\n".join(head + _SENTENCE.split(abstract)) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="comma-separated PMIDs (default: all of PAPERS)")
    ap.add_argument("--refresh", action="store_true", help="re-download stored records")
    args = ap.parse_args()
    pmids = [p.strip() for p in args.only.split(",")] if args.only else list(PAPERS)
    unknown = [p for p in pmids if p not in PAPERS]
    if unknown:
        print(f"[error] not in PAPERS (add it with its reason first): {unknown}",
              file=sys.stderr)
        return 1
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    PAGES_DIR.mkdir(parents=True, exist_ok=True)
    failed = 0
    for pmid in pmids:
        page = PAGES_DIR / f"{pmid}.md"
        if page.exists() and not args.refresh:
            print(f"[skip] {pmid}: page on disk")
            continue
        rec = record(pmid)
        if not rec or not rec.get("abstractText"):
            print(f"[warn] {pmid}: no record / no abstract", file=sys.stderr)
            failed += 1
            continue
        (RAW_DIR / f"{pmid}.json").write_text(
            json.dumps(rec, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        page.write_text(page_text(rec), encoding="utf-8")
        print(f"[ok] {pmid}: {page.relative_to(ROOT)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
