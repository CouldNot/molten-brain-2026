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

The abstract is what Europe PMC serves for every indexed paper (open access or not), and
a short verbatim sentence from it is a citation, like a quoted line of a book. **Open-access
full text** rides along where the record says so (``isOpenAccess: Y`` with a PMC id): the
``fullTextXML`` (JATS) is stored as ``raw/<pmid>.xml`` and flattened after the abstract,
under a ``## Full text`` marker (:func:`full_text_lines`): section headings, body
paragraphs one per line, figure captions, and every table as its caption line then one
``cell | cell | ...`` row per line (the Wikipedia table convention, so a measured Ki can be
quoted as a row), each table between blank lines. The licence comes from the record
(:func:`licence_of`, e.g. ``CC BY-NC``) and is stamped in the page header and on every
source quoting the full text, so it can be credited. Only Europe PMC's own OA copy is read:
never a publisher site. The abstract lines stay first, so a quote gated against an
abstract-only page still gates once the full text is appended. Like every other corpus
tree, ``data_sources/`` is gitignored and author-side: the quote gate is skipped with a
warning on a clone that lacks it.

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

**The cited-paper mode, ``--ki-prose``**, follows a Wikipedia article's own citations to a
measured affinity its prose states but no table or database carries (viloxazine's
"K i = 3,900 nM and 6,400 nM" at 5-HT2B / 5-HT2C, PDSP and GtoPdb having nothing). For
every drug with a binding that has no Ki, it reads the drug's stored EN article
(``data_sources/wikipedia/raw/<slug>.html``, corpus #9), keeps each paragraph that states
an affinity (:func:`states_affinity`: a Ki / Kd and a concentration), stores the abstracts
of the PubMed ids that paragraph cites, and offers every abstract sentence that itself
states an affinity, with **no verdict**, in ``tools/generated_cache/ki_prose_worklist.json``.
The paragraph is the reason the page exists (it rides along as ``context``), never a
source: the Ki is quoted from the paper. One LLM pass answers by index, and
``tools/sourcing/apply_ki_prose.py`` gates and writes (see its docstring)::

    python tools/fetch/fetch_europepmc.py --ki-prose          # --only <drug ids> scopes

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
FULL_TEXT_API = "https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid}/fullTextXML"
# The line that separates the abstract from the appended open-access full text.
FULL_TEXT_MARKER = "## Full text"
ARTICLE_URL = "https://europepmc.org/article/MED/{pmid}"
RAW_DIR = ROOT / "data_sources" / "europepmc" / "raw"
PAGES_DIR = ROOT / "data_sources" / "europepmc" / "pages"

# PMID -> the claim it is stored for. Add a paper only for a claim nothing else on disk
# states, and say which.
PAPERS: dict[str, str] = {
    "7827213": "lithium: brain half-life (7Li MRS) longer than serum half-life "
               "(addon lithium_brain_half_life)",
    # Primate tract-tracing for the monoamine pathways the books never name (check_data
    # family 10, docs/SOURCING_GAPS.md "Innervation coverage"). Species in each line.
    "27028222": "raphe -> globus pallidus, serotonergic (primate review)",
    "6766111": "raphe + locus coeruleus -> internal pallidum (Macaca mulatta, HRP)",
    "6664490": "locus coeruleus -> caudate + putamen (Saimiri sciureus, retrograde)",
    "6315152": "locus coeruleus -> substantia nigra (Saimiri sciureus, retrograde)",
    "2896323": "VTA -> parietal cortex, dopaminergic (Macaca fascicularis, retrograde)",
    "2860583": "claustrum <-> insula connections (primate + human review)",
    # Transmitter / sign of the pathways no book sentence types (docs/SOURCING_GAPS.md
    # section 6). Species in each line; primate/human where one exists.
    "1374872": "frontal cortex -> pons: glutamatergic corticopontine fibres (review)",
    "173563": "frontal cortex -> pons: corticopontine excitation (cat)",
    "9133571": "pons -> cerebellum: excitatory mossy-fibre projection (rat)",
    "2422596": "pons -> cerebellum: glutamate in pontocerebellar fibres (rat)",
    "6147261": "cerebellum -> thalamus: glutamate in cerebellothalamic fibres (cat)",
    "15558250": "cerebellum -> thalamus: excitatory cerebellothalamic path (human)",
    "20421986": "entorhinal (temporal) -> hippocampus: glutamatergic perforant path (rat)",
    "1981215": "hippocampus -> fornix: excitatory hippocamposeptal fibres (rat)",
    "32019": "fornix -> mammillary body: glutamate/aspartate after fornix transection (rat)",
    "34015441": "subiculum (fornix) -> mammillary body: excitatory (mouse)",
    "19535593": "mammillary body -> anterior thalamus: glutamatergic (mouse)",
    "12576145": "mammillothalamic terminals: excitatory inputs (rat)",
    "2808769": "hippocampus -> lateral septum: excitatory fibres (rat)",
    "15740723": "accumbens -> ventral pallidum: GABAergic inhibitory input (rat)",
    "36642737": "lateral septum -> lateral hypothalamus: GABAergic (mouse)",
    "39150998": "lateral septum -> lateral hypothalamus: GABAergic inhibition (mouse)",
    "36653189": "amygdala -> accumbens: excitatory afferents (mouse)",
    "22357796": "frontal commissure: interhemispheric glutamatergic projections (human TMS)",
    "32769158": "sensory cortices: glutamatergic callosal projections (mouse)",
    "27335411": "raphe -> olfactory bulb: serotonergic innervation (mouse)",
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


def licence_of(rec: dict) -> str | None:
    """The record's open-access licence, upper-cased (``"cc by-nc"`` -> ``"CC BY-NC"``).

    None for a paper Europe PMC holds no open-access copy of: only those get a full text.
    """
    if rec.get("isOpenAccess") != "Y" or not rec.get("pmcid"):
        return None
    lic = (rec.get("license") or "").strip()
    return lic.upper() if lic else "unstated"


# JATS elements whose text is not prose: LaTeX math (``tex-math``) and the alternative
# MathML copy would land as markup soup in a paragraph line; a nested table or figure is
# emitted as its own block after the paragraph that holds it.
_SKIP_INLINE = {"tex-math", "math", "alternatives", "table-wrap", "fig", "disp-formula"}


def _xml_text(el, skip=frozenset()) -> str:
    """An element's text, whitespace-collapsed, minus any subtree tagged in ``skip``."""
    parts = [el.text or ""]
    for child in el:
        if _local(child.tag) not in skip:
            parts.append(_xml_text(child, skip))
        parts.append(child.tail or "")
    return " ".join("".join(parts).split())


def _local(tag) -> str:
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def _table_block(tw) -> list[str]:
    """One table: ``Table 3: caption``, then a ``cell | cell`` line per row, then notes."""
    label = tw.find("label")
    caption = tw.find("caption")
    lab = _xml_text(label) if label is not None else ""
    cap = _xml_text(caption, _SKIP_INLINE) if caption is not None else ""
    out = [f"{lab}: {cap}" if lab and cap else lab or cap or "Table"]
    for tr in tw.iter():
        if _local(tr.tag) == "tr":
            cells = [_xml_text(c, _SKIP_INLINE) for c in tr if _local(c.tag) in ("td", "th")]
            if any(cells):
                out.append(" | ".join(cells))
    for foot in tw.iter():
        if _local(foot.tag) == "table-wrap-foot":
            text = _xml_text(foot, _SKIP_INLINE)
            if text:
                out.append(f"Notes: {text}" if not text.lower().startswith("note") else text)
    return out


def _fig_line(fig) -> str:
    label = fig.find("label")
    caption = fig.find("caption")
    text = " ".join(x for x in (_xml_text(label) if label is not None else "",
                                _xml_text(caption, _SKIP_INLINE) if caption is not None else "")
                    if x)
    return text


def full_text_lines(xml_text: str) -> list[str]:
    """The article body of a JATS ``fullTextXML``, flattened for the quote gate.

    One line per section heading (``### title``), paragraph and figure caption, in
    document order; each table is a block between blank lines (see :func:`_table_block`).
    The reference list and front matter are left out: the abstract is already on the page.

    >>> full_text_lines('<article><body><sec><title>Results</title><p>Ki was '
    ...     '<italic>3.9</italic> uM.</p></sec></body></article>')
    ['### Results', 'Ki was 3.9 uM.']
    """
    import xml.etree.ElementTree as ET
    # The DOCTYPE names an external DTD ElementTree never fetches; entities it would
    # declare are not used by Europe PMC's export beyond the XML built-ins.
    root = ET.fromstring(xml_text.encode("utf-8") if isinstance(xml_text, str) else xml_text)
    body = next((e for e in root.iter() if _local(e.tag) == "body"), None)
    out: list[str] = []
    if body is None:
        return out

    def blocks(el):
        tag = _local(el.tag)
        if tag == "table-wrap":
            out.extend([""] + _table_block(el) + [""])
            return
        if tag == "fig":
            line = _fig_line(el)
            if line:
                out.append(line)
            return
        if tag == "title":
            text = _xml_text(el, _SKIP_INLINE)
            if text:
                out.append(f"### {text}")
            return
        if tag == "p":
            text = _xml_text(el, _SKIP_INLINE)
            if text:
                out.append(text)
            for child in el.iter():
                if child is not el and _local(child.tag) in ("table-wrap", "fig"):
                    blocks(child)
            return
        for child in el:
            blocks(child)

    blocks(body)
    # Collapse runs of blank lines (a table right after another) and trim the ends.
    tidy: list[str] = []
    for ln in out:
        if ln or (tidy and tidy[-1]):
            tidy.append(ln)
    while tidy and not tidy[-1]:
        tidy.pop()
    return tidy


def full_text_xml(rec: dict) -> str | None:
    """Europe PMC's open-access JATS full text of one record, or None (not OA / failed)."""
    if not licence_of(rec):
        return None
    return _get(FULL_TEXT_API.format(pmcid=rec["pmcid"]))


def page_text(rec: dict, full_text: list[str] | None = None) -> str:
    """The stored page: a provenance header, the abstract one sentence per line, then the
    open-access full text (when given) under :data:`FULL_TEXT_MARKER`."""
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
    ]
    if full_text:
        head += [f"pmcid: {rec.get('pmcid')}", f"licence: {licence_of(rec)}"]
    head += [f"fetched: {time.strftime('%Y-%m-%d')}", ""]
    lines = head + _SENTENCE.split(abstract)
    if full_text:
        lines += ["", f"{FULL_TEXT_MARKER} (open access, {licence_of(rec)}, "
                      f"{rec.get('pmcid')})", ""] + full_text
    return "\n".join(lines) + "\n"


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


def store(rec: dict, refresh: bool = False, full_text: bool = False) -> bool:
    """Write one record's raw + page (skipped when on disk); False with no abstract.

    ``full_text`` also stores the open-access full text when the record has one (see
    :func:`licence_of`); a page stored abstract-only is then re-written once to add it.
    """
    pmid = rec.get("pmid")
    if not pmid or not rec.get("abstractText"):
        return False
    page = PAGES_DIR / f"{pmid}.md"
    want_full = full_text and licence_of(rec) is not None
    if page.exists() and not refresh and (
            not want_full or FULL_TEXT_MARKER in page.read_text("utf-8")):
        return True
    (RAW_DIR / f"{pmid}.json").write_text(
        json.dumps(rec, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    body = None
    if want_full:
        xml = full_text_xml(rec)
        if xml:
            (RAW_DIR / f"{pmid}.xml").write_text(xml, encoding="utf-8")
            body = full_text_lines(xml) or None
        else:
            print(f"[warn] {pmid}: open access but no full text served", file=sys.stderr)
    page.write_text(page_text(rec, body), encoding="utf-8")
    return True


KI_PROSE_WORKLIST = ROOT / "tools" / "generated_cache" / "ki_prose_worklist.json"
WIKI_RAW = ROOT / "data_sources" / "wikipedia" / "raw"
# A measured affinity named in text: Ki / Kd (the subscript flattens to "K i") or their
# log forms, next to a concentration or a pK value. IC50 / EC50 are not affinities (a
# functional potency), so they never make a sentence a candidate on their own.
_AFFINITY = re.compile(r"\bp?K\s?[iIdD]\b")
_CONC = re.compile(r"\d\s*(?:nM|pM|μM|µM|uM|microM|[nµμ]mol/[lL]|(?:nano|micro|pico)molar)\b"
                   r"|\bpK\s?[iIdD]\b\D{0,12}\d")
_PARAGRAPH = re.compile(r"<p[ >].*?</p>", re.S)
# MediaWiki escapes the note ids ("cite&#95;note-Pinder&#95;1977-2"), so both ends of a
# citation link are unescaped before they are matched.
_REF_ITEM = re.compile(r'<li id="(cite(?:_|&#95;)note-[^"]+)"[^>]*>(.*?)</li>', re.S)
_REF_LINK = re.compile(r'href="#(cite(?:_|&#95;)note-[^"]+)"')
_PUBMED = re.compile(r"pubmed\.ncbi\.nlm\.nih\.gov/(\d+)|ncbi\.nlm\.nih\.gov/pubmed/(\d+)")


def _plain(fragment: str) -> str:
    """An HTML fragment as one line of text."""
    return " ".join(html.unescape(_TAG.sub(" ", fragment)).split())


def states_affinity(text: str) -> bool:
    """Whether a sentence or paragraph states a measured affinity with its value.

    >>> states_affinity("affinity for 5-HT 2B (K i = 3,900 nM)")
    True
    >>> states_affinity("an IC 50 of 40 nM"), states_affinity("a high K i at NET")
    (False, False)
    """
    return bool(_AFFINITY.search(text) and _CONC.search(text))


def cited_affinity_pmids(raw_html: str) -> list[tuple[str, list[str]]]:
    """``(paragraph text, PubMed ids it cites)`` for every article paragraph stating an
    affinity and citing at least one paper Europe PMC can resolve."""
    refs = {html.unescape(rid): [a or b for a, b in _PUBMED.findall(body)]
            for rid, body in _REF_ITEM.findall(raw_html)}
    out = []
    for para in _PARAGRAPH.findall(raw_html):
        text = _plain(para)
        if not states_affinity(text):
            continue
        pmids = sorted({pm for rid in _REF_LINK.findall(para)
                        for pm in refs.get(html.unescape(rid), [])})
        if pmids:
            out.append((text, pmids))
    return out


def affinity_candidates(page: str) -> list[dict]:
    """Every line of a stored page that could carry a measured affinity, no verdict.

    A prose line (an abstract sentence or a full-text paragraph) is offered when it
    states one itself (:func:`states_affinity`). A table row rarely names the constant
    (its column header or caption does), so a full-text table is judged as a whole:
    when its caption, header or notes state an affinity, every row holding a number is
    offered, with the caption and header row riding along as ``table`` so the picker
    can read which column is a Ki. The provenance header is never offered.

    >>> page = "# T\\npmid: 1\\n\\nA sentence.\\nKi = 3 nM at D2.\\n\\n## Full text\\n\\n" \\
    ...        "Table 1: Ki values (nM)\\nTarget | Ki\\n5-HT2B | 3900\\n"
    >>> [(c["line"], c.get("table")) for c in affinity_candidates(page)]
    [('Ki = 3 nM at D2.', None), ('5-HT2B | 3900', 'Table 1: Ki values (nM) || Target | Ki')]

    (A caption stating the values, ``Table 3: ... Ki of 3900 nM``, is offered too.)
    """
    parts = page.split("\n\n", 1)
    body = parts[1] if len(parts) > 1 else ""
    abstract, _, full = body.partition(FULL_TEXT_MARKER)
    out = [{"line": ln} for ln in abstract.splitlines() if ln.strip() and states_affinity(ln)]
    for chunk in full.split("\n\n"):
        lines = [ln for ln in chunk.splitlines() if ln.strip()]
        rows = [ln for ln in lines[1:] if " | " in ln]
        if len(lines) > 1 and rows and all(" | " in ln or ln.startswith("Notes")
                                           for ln in lines[1:]):
            notes = " ".join(ln for ln in lines[1:] if " | " not in ln)
            if states_affinity(lines[0]):
                out.append({"line": lines[0]})      # a caption can state the values
            if _AFFINITY.search(" ".join([lines[0], rows[0], notes])):
                table = f"{lines[0]} || {rows[0]}"
                out += [{"line": r, "table": table} for r in rows[1:]
                        if re.search(r"\d", r)]
            continue
        out += [{"line": ln} for ln in lines
                if not ln.startswith(("## ", "### ")) and states_affinity(ln)]
    return out


def ki_prose(only: set | None, refresh: bool) -> int:
    """The ``--ki-prose`` worklist (see the module docstring)."""
    sys.path.insert(0, str(ROOT / "tools"))
    import drugs_io  # noqa: E402
    import target_aliases as ta  # noqa: E402
    import worklist_io  # noqa: E402
    from fetch_cyp_wikipedia import page_for  # noqa: E402 (drug -> stored article)

    names = ta.target_names()
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    PAGES_DIR.mkdir(parents=True, exist_ok=True)
    drugs, failed = {}, 0
    for d in drugs_io.load_drugs():
        if only is not None and d["id"] not in only:
            continue
        # A Ki this pass wrote itself (apply_ki_prose.py) still counts as missing, so a
        # rebuild keeps offering the candidate the applier re-applies on every run.
        missing = sorted({b["target"] for b in d.get("bindings", [])
                          if (b.get("ki") or {}).get("source", {}).get("corpus", "europepmc")
                          == "europepmc"})
        path = page_for(d) if missing else None
        raw = WIKI_RAW / f"{Path(path).stem}.html" if path else None
        if not raw or not raw.exists():
            continue
        paragraphs = cited_affinity_pmids(raw.read_text("utf-8"))
        cands = []
        for pmid in sorted({pm for _, pms in paragraphs for pm in pms}):
            page = PAGES_DIR / f"{pmid}.md"
            raw_rec = RAW_DIR / f"{pmid}.json"
            # The full text is what a table row lives in: an abstract-only page whose
            # stored record says open access is re-stored once to add it.
            rec = (json.loads(raw_rec.read_text("utf-8"))
                   if raw_rec.exists() and not refresh else None)
            if (not page.exists() or refresh or rec is None or (
                    licence_of(rec) and FULL_TEXT_MARKER not in page.read_text("utf-8"))):
                rec = rec if rec is not None and not refresh else record(pmid)
                if not rec or not store(rec, refresh, full_text=True):
                    failed += rec is None
                    continue
            cands += [{"corpus": "europepmc", "page": pmid, **c}
                      for c in affinity_candidates(page.read_text("utf-8"))]
        if cands:
            drugs[d["id"]] = {"name": d["name"],
                              "missing": {t: names.get(t, t) for t in missing},
                              "context": [text for text, _ in paragraphs],
                              "candidates": cands}
            print(f"{d['id']}: {len(cands)} candidate sentence(s)")
    built = {"drugs": drugs}
    if only is not None and KI_PROSE_WORKLIST.exists():
        built = worklist_io.merge_scoped(json.loads(KI_PROSE_WORKLIST.read_text("utf-8")),
                                         built, "drugs")
    KI_PROSE_WORKLIST.write_text(json.dumps(built, ensure_ascii=False, indent=1) + "\n",
                                 "utf-8")
    print(f"{len(drugs)} drug(s) with candidates -> "
          f"{KI_PROSE_WORKLIST.relative_to(ROOT)}; {failed} failed request(s)")
    return 1 if failed else 0


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
    ap.add_argument("--ki-prose", action="store_true",
                    help="store the papers Wikipedia cites for a Ki its prose states, "
                         "and write the ki_prose worklist")
    args = ap.parse_args()
    if args.binding_search or args.ki_prose:
        only = {d.strip() for d in args.only.split(",")} if args.only else None
        return (binding_search if args.binding_search else ki_prose)(only, args.refresh)
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
        if not rec or not store(rec, refresh=True, full_text=True):
            print(f"[warn] {pmid}: no record / no abstract", file=sys.stderr)
            failed += 1
            continue
        print(f"[ok] {pmid}: {page.relative_to(ROOT)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
