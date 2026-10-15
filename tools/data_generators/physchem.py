"""Physicochemistry and brain entry: a drug's lipophilicity, polar surface and measured
blood-brain-barrier label.

Read from the committed ``tools/generated_cache/physchem.json`` that
``tools/fetch/fetch_physchem.py`` writes (every value code-read off a stored page,
``extraction: "code"``, no judge). Three node kinds, ONE node per drug each:

* ``drug_lipophilicity``: ``xlogp`` (+ ``xlogp_sources``), PubChem's computed XLogP3,
  the log10 of the octanol/water partition coefficient;
* ``drug_polar_surface``: ``tpsa`` (+ ``tpsa_sources``), PubChem's computed topological
  polar surface area in Å²;
* ``drug_bbb``: ``bbb = {label, logbb?, logbb_max?}`` (+ ``bbb_sources``, one quote per
  B3DB row), B3DB's curated BBB+ / BBB- label and, where a study measured it, logBB
  (log10 of the brain/blood concentration ratio; a range when the rows differ).

The two PubChem values are computed estimates, the B3DB label is curated literature
data: the panel says which is which.

Built with the help of Claude Code.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

CACHE = Path(__file__).resolve().parent.parent / "generated_cache" / "physchem.json"

BBB_LABELS = ("BBB+", "BBB-")


def _load() -> dict[str, Any]:
    return json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}


_DATA = _load()


def _number(v: Any, what: str) -> float:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise ValueError(f"{what}: {v!r} is not a number")
    return v


def drug_physchem(drug_id: str, quote_sources: Callable, data: dict | None = None
                  ) -> dict[str, Any]:
    """The emitted ``xlogp`` / ``tpsa`` / ``bbb`` fields (+ their sources) of one drug.

    ``quote_sources`` is ``provenance._quote_sources`` (passed in, as for tdm.py, so
    this module stays import-light). Validates shapes so a hand edit of the cache fails
    the build instead of shipping a label-less value.
    """
    row = ((data if data is not None else _DATA).get("drugs") or {}).get(drug_id)
    if not row:
        return {}
    out: dict[str, Any] = {}
    for key in ("xlogp", "tpsa"):
        if row.get(key):
            what = f"Drug {drug_id!r} {key}"
            out[key] = _number(row[key]["value"], what)
            out[f"{key}_sources"] = quote_sources(row[key].get("sources"), what)
    b = row.get("bbb")
    if b:
        what = f"Drug {drug_id!r} bbb"
        if b.get("label") not in BBB_LABELS:
            raise ValueError(f"{what}: label {b.get('label')!r} not in {BBB_LABELS}")
        rec: dict[str, Any] = {"label": b["label"]}
        if b.get("logbb") is not None:
            rec["logbb"] = _number(b["logbb"], what)
            if b.get("logbb_max") is not None:
                rec["logbb_max"] = _number(b["logbb_max"], what)
                if rec["logbb_max"] <= rec["logbb"]:
                    raise ValueError(f"{what}: logbb_max must exceed logbb")
        out["bbb"] = rec
        out["bbb_sources"] = quote_sources(b.get("sources"), what)
    return out
