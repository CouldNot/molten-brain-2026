"""data_generators.quote_table: serialization-time quote externalization.

Every sourceable node embeds its provenance **source** inline. A quote-bearing
source is an object like ``{"corpus", "page", "quote", "provenance"}`` (location
sources also carry ``"species"``). The same verbatim quote is frequently cited by
many nodes (e.g. one Stahl side-effect line backs all four alpha-1 subtype
bindings), so embedding the text inline duplicates it.

This pass mirrors the i18n :func:`externalize` pass: at SERIALIZATION time every
quote-bearing source is collapsed to a reference ``{"quote_id", "provenance"}``
and the immutable excerpt ``{"id", "corpus", "page", "quote", "species"?}`` is
collected once into :data:`QUOTES`, written out as ``public/data/quotes.jsonl``.
The viewer + ``check_data.py`` rehydrate it back in memory, so nothing downstream
sees the dehydrated shape.

The id is a **deterministic content hash** of the excerpt identity
(corpus + page + quote + species), so identical excerpts dedupe to one entry and
the id never churns across regenerations (the emitted data is committed and we
want minimal diffs). ``provenance`` is a per-*claim* grade, not part of the quote,
so it stays on the referencing node. Made with the help of Claude Code.
"""
import hashlib
import json
import os
from typing import Any

from . import freshness
from .provenance import SOURCING_LLMS, quote_extraction, quote_pipeline

# Accumulated quote nodes: quote_id -> {"id", "corpus", "page", "quote", "species"?, "llm"?}.
QUOTES: dict[str, dict[str, Any]] = {}

# Central judge stamps ``{quote_id: {citation site: llm}}``, written by
# tools/sourcing/recheck_quotes.py (a model confirmed the quote is present AND supports the
# claim made at that site). Keyed by SITE, not by quote: one sentence can back several
# claims, and a verdict on one says nothing about a claim added later that reuses the
# sentence (sibutramine's "has these metabolites" line once silently vouched for new
# binding claims). :func:`finalize_citations` reads the stamp for each citation's own site
# (see tools/sourcing/claim_walk.py); a site never judged stays unjudged, and
# check_data.py family 5 fails on it. Loaded once (best-effort: absent = {}).
_LLM_OVERRIDES: dict[str, dict[str, str]] = {}


def _cache(name: str) -> Any:
    """One committed generated_cache/<name>.json, or ``None`` when absent."""
    path = os.path.join(os.path.dirname(__file__), "..", "generated_cache", name)
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (FileNotFoundError, ValueError):
        return None


def _load_llm_overrides() -> dict[str, dict[str, str]]:
    data = _cache("quote_llm.json") or {}
    flat = [qid for qid, v in data.items() if not isinstance(v, dict)]
    if flat:
        # A bare quote-level stamp is exactly the inheritance bug: refuse it loudly.
        raise ValueError(f"quote_llm.json: {len(flat)} stamp(s) not keyed by citation "
                         f"site, e.g. {flat[:3]}")
    return data


_LLM_OVERRIDES = _load_llm_overrides()


def strongest_llm(*llms: str | None) -> str | None:
    """The strongest model among ``llms`` (``SOURCING_LLMS`` order), or ``None``."""
    known = [m for m in llms if m in SOURCING_LLMS]
    return max(known, key=SOURCING_LLMS.index) if known else None

# Central quote_id -> heading trail (a list of headings, outermost first): where in
# its book a quote sits, derived by tools/fetch/fetch_quote_headers.py from the
# author-side page trees. Applied by id like the llm overrides above (one
# derivation, never authored per site), because the same passage always sits under
# the same heading. It is **context, not a claim**: it tells a reader (and an LLM
# judge) that a sentence comes from "How Drug Causes Side Effects" rather than "How
# the Drug Works", which is exactly the distinction the uncertainty badges rest on.
# A flat list, not named levels, because the books do not share a shape (a Stahl
# monograph, a Kandel part/chapter/section, a Nieuwenhuys chapter).
_HEADERS: dict[str, list[str]] = {
    qid: [str(part) for part in trail]
    for qid, trail in ((_cache("quote_headers.json") or {}).get("quotes")
                       or {}).items() if isinstance(trail, list) and trail
}

# The excerpt-identity fields (hash input + what the quote node carries). ``provenance``
# is deliberately excluded: it grades the claim, not the quote (see module docstring).
_IDENTITY_FIELDS = ("corpus", "page", "quote", "species")

# Non-identity metadata carried onto the quote node but excluded from the id hash: ``llm``
# names the model that sourced the quote (see provenance.SOURCING_LLMS). Kept off the hash
# so re-attributing a quote's sourcing model doesn't churn its id (the excerpt identity is
# the text, not who found it); a genuine llm disagreement on one excerpt is a hard error below.
_METADATA_FIELDS = ("llm",)


def reset_quotes() -> None:
    """Clear the accumulated quote table (call once per generation)."""
    QUOTES.clear()


def _is_quote_source(obj: object) -> bool:
    """True for a source object carrying a verbatim ``quote`` string.

    Ki sources (``{corpus, ki_id, value_nm, ...}``) and bare wikipedia provenance
    (``{provenance}``) have no ``quote`` field, so they pass through untouched.
    """
    return isinstance(obj, dict) and isinstance(obj.get("quote"), str)


def quote_id(source: dict[str, Any]) -> str:
    """Deterministic ``q_<12 hex>`` id from the excerpt identity fields."""
    identity = json.dumps(
        {k: source.get(k) for k in _IDENTITY_FIELDS},
        sort_keys=True,
        ensure_ascii=False,
    )
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:12]
    return f"q_{digest}"


def heading_of(source: dict[str, Any]) -> list[str]:
    """The derived heading trail for a quote-bearing source, or ``[]``.

    The one way to ask "where in its book does this source sit?" **before**
    serialization, so a generator pass (see ``quotes/uncertainty.py``, which reads a
    Stahl subsection to decide whether a sentence attributes its claim) shares this
    module's id hash instead of recomputing it.
    """
    if not _is_quote_source(source):
        return []
    return _HEADERS.get(quote_id(source), [])


def externalize_quotes(obj):
    """Recursively replace every quote-bearing source with a ``{quote_id, ...}`` ref.

    Registers the excerpt into :data:`QUOTES` (a content-hash collision on two
    genuinely different excerpts is a hard error). The reference keeps
    ``provenance`` (the per-claim grade) and any unexpected sibling keys; recurses
    through plain dicts and lists; other values pass through.
    """
    if _is_quote_source(obj):
        qid = quote_id(obj)
        entry = {"id": qid}
        for k in _IDENTITY_FIELDS + _METADATA_FIELDS:
            if k in obj:
                entry[k] = obj[k]
        # The quote node names the strongest model that judged it at ANY site (a
        # reader's hint, uniform by id -> no collision); each citation's own pipeline
        # reads its own site's stamp (finalize_citations).
        if qid in _LLM_OVERRIDES:
            entry["llm"] = strongest_llm(*_LLM_OVERRIDES[qid].values())
        if qid in _HEADERS:
            entry["heading"] = _HEADERS[qid]
        # The page's download date (editable corpora only): a property of the page, so
        # it rides the quote node, like the heading, and stays out of the id hash.
        fetched = freshness.stamp(obj)
        if fetched:
            entry["fetched"] = fetched
        existing = QUOTES.get(qid)
        if existing is not None and existing != entry:
            raise ValueError(
                f"quote id collision: {qid} maps to both {existing!r} and {entry!r}"
            )
        QUOTES[qid] = entry
        # The chain of custody, on the REFERENCE rather than the quote node, for the
        # same reason ``provenance`` is: it grades the citation, not the excerpt. One
        # sentence can honestly reach two claims by two routes (Stahl's Class line is
        # proposed by a model for the drug's class node and grepped by code as the NbN
        # fallback), so pinning one chain to the shared excerpt would make one of them
        # a lie. Derived here, where both halves are known: how it was found, and the
        # ``llm`` stamp above, which the central override may just have decided.
        ref: dict[str, Any] = {
            "quote_id": qid,
            "pipeline": quote_pipeline(
                obj.get("corpus"),
                quote_extraction(obj.get("corpus"), obj.get("extraction")),
                obj.get("llm")),
            # Transient: finalize_citations re-derives the pipeline once it knows the
            # citation's site, then drops these. Never emitted.
            "_extraction": quote_extraction(obj.get("corpus"), obj.get("extraction")),
            "_corpus": obj.get("corpus"),
            "_llm": obj.get("llm"),
        }
        for k, v in obj.items():
            if k == "extraction":
                continue  # consumed above, into `pipeline`
            if k not in _IDENTITY_FIELDS and k not in _METADATA_FIELDS:
                ref[k] = externalize_quotes(v)
        return ref
    if isinstance(obj, dict):
        out = {k: externalize_quotes(v) for k, v in obj.items()}
        # A quote-less source of an editable corpus (a PDSP Ki row) gets its download
        # date inline, since it has no quote node to carry it.
        fetched = freshness.stamp(obj)
        if fetched:
            out["fetched"] = fetched
        return out
    if isinstance(obj, list):
        return [externalize_quotes(v) for v in obj]
    return obj


def finalize_citations(obj, sites: dict[int, str]):
    """Re-derive every citation's ``pipeline`` from the judge stamp at its own site.

    ``sites`` maps ``id(ref)`` -> citation site, as the claim walk placed each ref
    (tools/sourcing/claim_walk.py); a ref the walk did not place reads the site
    ``"*"``, the generic claim a judge is shown for it. The judge is the stronger of
    the source's own ``llm`` (stamped by the pass that wrote THAT source) and the
    central stamp for this (quote, site); a site no judge ever saw reads unjudged.
    Mutates in place and strips the transient keys :func:`externalize_quotes` left.
    """
    if isinstance(obj, dict):
        if "_extraction" in obj:
            site = sites.get(id(obj), "*")
            judge = strongest_llm(obj.pop("_llm"),
                                  _LLM_OVERRIDES.get(obj["quote_id"], {}).get(site))
            obj["pipeline"] = quote_pipeline(obj.pop("_corpus"), obj.pop("_extraction"),
                                             judge)
        for v in obj.values():
            finalize_citations(v, sites)
    elif isinstance(obj, list):
        for v in obj:
            finalize_citations(v, sites)


def quote_lines() -> list[str]:
    """The accumulated quote table as JSON lines, sorted by id for stable diffs."""
    return [
        json.dumps(QUOTES[qid], ensure_ascii=False)
        for qid in sorted(QUOTES)
    ]
