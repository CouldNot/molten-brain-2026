"""Therapeutic drug monitoring facts from the AGNP consensus guideline (corpus #19).

Read from the committed ``tools/generated_cache/agnp_tdm.json`` that
``tools/fetch/fetch_agnp_tdm.py`` writes off the guideline's Table 5 and Table 1 (code
read, ``extraction: "code"``, every quote already found on its page). Two node kinds
and one confirm-only pass:

* ``drug_therapeutic_range``: the plasma/serum concentration range the guideline
  recommends (``{low, high, unit, analyte?, tdm_level?}``), ONE node per drug. The
  level of recommendation to use TDM (1 strongly recommended .. 4 potentially useful)
  rides on it: it is the same row's verdict on how far that range is worth measuring
  against, not a separate fact about the molecule.
* ``drug_alert_level``: the laboratory alert level (``{value, unit, analyte?}``), its
  own node: a different claim (where the lab must call the prescriber) that a drug can
  lack while having a range (THC, tranylcypromine).
* :func:`confirm_enzymes`: Table 1's quote appended to a substrate row another corpus
  already states, never a new row (the guideline's disagreements are listed in
  ``docs/SOURCING_GAPS.md``, not written).

Built with the help of Claude Code.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

CACHE = Path(__file__).resolve().parent.parent / "generated_cache" / "agnp_tdm.json"

# Closed vocabulary: the concentration units Table 5 prints, written as the viewer
# shows them in both languages.
TDM_UNITS = ("ng/mL", "µg/mL", "pg/mL", "mmol/L")
TDM_LEVELS = (1, 2, 3, 4)


def _load() -> dict[str, Any]:
    return json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}


_DATA = _load()


def _value(v: Any, what: str) -> float:
    if not isinstance(v, (int, float)) or isinstance(v, bool) or v <= 0:
        raise ValueError(f"{what}: expected a positive number, got {v!r}")
    return v


def _unit(u: Any, what: str) -> str:
    if u not in TDM_UNITS:
        raise ValueError(f"{what}: unit {u!r} not in TDM_UNITS")
    return u


def drug_tdm(drug_id: str, quote_sources: Callable[..., list]) -> dict[str, Any]:
    """The emitted ``therapeutic_range`` / ``alert_level`` fields (+ their sources)
    for one drug, empty when Table 5 gives it no single readable range.

    ``quote_sources`` is ``provenance._quote_sources``, passed in so this module does
    not import the generator's validators.
    """
    row = (_DATA.get("ranges") or {}).get(drug_id)
    if not row:
        return {}
    what = f"Drug {drug_id!r} therapeutic range"
    rng: dict[str, Any] = {"low": _value(row["low"], what),
                           "high": _value(row["high"], what),
                           "unit": _unit(row["unit"], what)}
    if rng["low"] >= rng["high"]:
        raise ValueError(f"{what}: low must be below high")
    if row.get("analyte"):
        rng["analyte"] = row["analyte"]
    if row.get("tdm_level") is not None:
        if row["tdm_level"] not in TDM_LEVELS:
            raise ValueError(f"{what}: tdm_level {row['tdm_level']!r} not in 1-4")
        rng["tdm_level"] = row["tdm_level"]
    sources = quote_sources(row.get("sources"), what)
    out: dict[str, Any] = {"therapeutic_range": rng,
                           "therapeutic_range_sources": sources}
    alert = row.get("alert")
    if alert:
        wa = f"Drug {drug_id!r} alert level"
        a = {"value": _value(alert["value"], wa), "unit": _unit(alert["unit"], wa)}
        if alert.get("analyte"):
            a["analyte"] = alert["analyte"]
        out["alert_level"] = a
        # The same table row backs both claims: one quote, two citation sites.
        out["alert_level_sources"] = quote_sources(row.get("sources"), wa)
    return out


def confirm_enzymes(merged: dict[str, list[dict]]) -> int:
    """Append Table 1's quote to each substrate row it confirms; returns how many.

    Confirm-only: a (drug, isoform) the guideline names that no other corpus states
    is NOT added (a disagreement to report, see ``docs/SOURCING_GAPS.md``).
    """
    n = 0
    for drug_id, rows in (_DATA.get("enzymes") or {}).items():
        have = {(r["enzyme"], r["role"]): r for r in merged.get(drug_id, [])}
        for row in rows:
            target = have.get((row["enzyme"], row["role"]))
            if target is None:
                continue
            known = {(s.get("corpus"), str(s.get("page")), s.get("quote"))
                     for s in target.get("sources") or []}
            for s in row["sources"]:
                if (s["corpus"], str(s["page"]), s["quote"]) not in known:
                    target["sources"] = list(target.get("sources") or []) + [dict(s)]
                    n += 1
    return n
