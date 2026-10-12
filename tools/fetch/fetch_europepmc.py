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

**The one search mode, ``--binding-search``**, is the Europe PMC leg of the UNKNOWN search
(``tools/data_generators/unknown.py``): for every binding with no known direction it runs
one query (:func:`direction_query`: the ligand and the target, both required in the
abstract, plus a direction word), stores the top :data:`SEARCH_TOP` abstracts as pages
exactly like a hand-listed paper, and records the query, Europe PMC's hit count and the
PMIDs read in ``tools/generated_cache/europepmc_binding_search.json``. That ledger is the
reason each search-found page exists (the search key it answered), and it is what the
search log cites. Resumable: a binding already in the ledger is skipped unless
``--refresh``; ``--only <drug ids>`` scopes it::

    python tools/fetch/fetch_europepmc.py --binding-search

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

SEARCH_LEDGER = ROOT / "tools" / "generated_cache" / "europepmc_binding_search.json"
# Abstracts read per binding: enough to catch the paper that characterises the pair,
# few enough that a 700-binding search stays a few thousand short pages.
SEARCH_TOP = 5
DIRECTION_WORDS = ("agonist", "antagonist", '"inverse agonist"', "inhibitor", "blocker",
                   "modulator", "releaser")

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


def target_terms(target: str, aliases: dict, genes: dict) -> list[str]:
    """The ASCII names a target goes by in an abstract: our aliases plus its genes."""
    terms = [a for a in aliases.get(target, []) if a.isascii()] + sorted(genes.get(target, []))
    out = []
    for term in terms:
        if term.lower() not in {o.lower() for o in out}:
            out.append(term)
    return out


def direction_query(ligand: str, terms: list[str]) -> str:
    """The Europe PMC query for one (ligand, target): both named in the abstract, plus
    one direction word anywhere."""
    names = " OR ".join(f'ABSTRACT:"{t}"' for t in terms)
    return (f'ABSTRACT:"{ligand}" AND ({names}) AND ({" OR ".join(DIRECTION_WORDS)}) '
            f"AND SRC:MED AND HAS_ABSTRACT:y")


def search(query: str, size: int = SEARCH_TOP) -> tuple[int, list[dict]] | None:
    """Europe PMC's hit count + its top ``size`` core records, or None on an HTTP error."""
    params = urllib.parse.urlencode({"query": query, "format": "json",
                                     "resultType": "core", "pageSize": size})
    text = _get(f"{API}?{params}")
    if not text:
        return None
    body = json.loads(text)
    return body.get("hitCount", 0), body.get("resultList", {}).get("result") or []


def store(rec: dict, refresh: bool = False) -> bool:
    """Write one record's raw + page (skipped when on disk); False with no abstract."""
    pmid = rec.get("pmid")
    if not pmid or not rec.get("abstractText"):
        return False
    page = PAGES_DIR / f"{pmid}.md"
    if page.exists() and not refresh:
        return True
    (RAW_DIR / f"{pmid}.json").write_text(
        json.dumps(rec, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    page.write_text(page_text(rec), encoding="utf-8")
    return True


def binding_search(only: set | None, refresh: bool) -> int:
    """The UNKNOWN search's Europe PMC leg (see the module docstring)."""
    sys.path.insert(0, str(ROOT / "tools"))
    import drugs_io                                         # noqa: E402
    import target_aliases as ta                             # noqa: E402
    from data_generators import unknown                     # noqa: E402
    from fetch_gtopdb_ki import owner_genes                 # noqa: E402 (gene map)
    aliases = ta.aliases_by_target()
    genes: dict[str, set] = {}
    for gene, owners in owner_genes(set(aliases)).items():
        for owner in owners:
            genes.setdefault(owner, set()).add(gene)
    ledger = json.loads(SEARCH_LEDGER.read_text("utf-8")) if SEARCH_LEDGER.exists() else {}
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    PAGES_DIR.mkdir(parents=True, exist_ok=True)
    rows = [r for r in unknown.affinity_only_bindings(drugs_io.load_drugs())
            if only is None or r["drug"] in only]
    failed = 0
    for i, row in enumerate(rows, 1):
        if row["site"] in ledger and not refresh:
            continue
        query = direction_query(row["ligand"], target_terms(row["target"], aliases, genes))
        got = search(query)
        if got is None:
            failed += 1
            continue
        hits, recs = got
        pmids = [r["pmid"] for r in recs if store(r, refresh)]
        ledger[row["site"]] = {"query": query, "hits": hits, "read": pmids,
                               "searched": time.strftime("%Y-%m-%d")}
        print(f"[{i}/{len(rows)}] {row['site']}: {hits} hit(s), read {len(pmids)}")
        if i % 25 == 0:
            SEARCH_LEDGER.write_text(json.dumps(ledger, indent=1, sort_keys=True) + "\n",
                                     "utf-8")
    SEARCH_LEDGER.write_text(json.dumps(ledger, indent=1, sort_keys=True) + "\n", "utf-8")
    print(f"ledger: {len(ledger)} binding(s); {failed} failed request(s)")
    return 1 if failed else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="comma-separated PMIDs (default: all of PAPERS); "
                                   "drug ids with --binding-search")
    ap.add_argument("--refresh", action="store_true", help="re-download stored records")
    ap.add_argument("--binding-search", action="store_true",
                    help="search every direction-less binding (the UNKNOWN search)")
    args = ap.parse_args()
    if args.binding_search:
        only = {d.strip() for d in args.only.split(",")} if args.only else None
        return binding_search(only, args.refresh)
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
