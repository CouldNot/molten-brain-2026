"""Shared I/O for the authored drug dataset (``tools/data/drugs_data.jsonl``).

The dataset is stored as JSONL (one compact JSON object per line) rather than a
single pretty-printed JSON array: line-oriented diffs stay small and every
consumer reads/writes it the same way. Centralized here so the five consumers
(``generate_data.py``, ``fetch_ki.py``, ``apply_nbn_sources.py``,
``apply_category_sources.py``, ``apply_source_quotes.py``) don't hand-roll it.
"""

import json
import re
from pathlib import Path

DRUGS_PATH = Path(__file__).resolve().parent / "data" / "drugs_data.jsonl"


def load_drugs(path=None) -> list[dict]:
    """Read the JSONL dataset, one ``json.loads`` per non-empty line, in order."""
    p = Path(path) if path is not None else DRUGS_PATH
    records = []
    for line in p.read_text(encoding="utf-8").splitlines():
        if line.strip():
            records.append(json.loads(line))
    return records


def save_drugs(records, path=None) -> None:
    """Write the records as JSONL (compact, key order preserved), one per line."""
    p = Path(path) if path is not None else DRUGS_PATH
    lines = [json.dumps(rec, ensure_ascii=False) for rec in records]
    p.write_text("\n".join(lines) + "\n", encoding="utf-8")


def non_modeled_metabolites(drugs: list[dict], key=str.lower) -> list[dict]:
    """Every metabolite that is not itself a modeled drug, deduped by identity.

    Shared by every metabolite pass (Wikipedia ``fetch_metabolite_bindings.py``, GtoPdb
    ``fetch_gtopdb_ki.py``). Mirrors ``js/data.js``: a metabolite links to a modeled drug by explicit
    ``drug_id`` or by its name matching a drug id, and those reuse that drug's
    bindings (nothing to source here). The rest are returned as
    ``{name, parents, key}`` (``key`` = a stable lowercase id for --only / worklist).

    A single metabolite can be produced by more than one modeled drug (e.g. mCPP by
    nefazodone AND trazodone). Its bindings are a property of the molecule, not of the
    parent relationship, so it is sourced ONCE: we key by ``key(name)`` (the caller's
    stable id rule, e.g. the Wikipedia slug) and collect every parent into ``parents``. The applier then writes that one judged
    binding list identically under each parent (check_data guards they stay identical),
    and the tally + viewer dedup the same way -- so a shared metabolite is never
    double-counted or double-listed."""
    drug_ids = {d["id"] for d in drugs}
    by_norm = {}
    for d in drugs:
        by_norm[re.sub(r"[^a-z0-9]+", "", d.get("name", "").lower())] = d["id"]
    by_key: dict[str, dict] = {}
    for d in drugs:
        for m in d.get("metabolites", []):
            name = m["name"]
            linked = m.get("drug_id") or by_norm.get(
                re.sub(r"[^a-z0-9]+", "", name.lower()))
            if linked and linked in drug_ids:
                continue
            mkey = key(name)
            entry = by_key.get(mkey)
            if entry:
                if d["id"] not in entry["parents"]:
                    entry["parents"].append(d["id"])
            else:
                by_key[mkey] = {"name": name, "parents": [d["id"]], "key": mkey}
    return list(by_key.values())
