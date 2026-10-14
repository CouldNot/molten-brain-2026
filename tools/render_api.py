"""Render the emitted dataset as one Markdown page per node, served under ``/api/``.

The text twin of the viewer's detail panels, for LLM agents and anything that cannot run
WebGL: ``/api/index.md`` lists every page, ``/api/drug/sertraline.md`` holds that drug's
stored fields, each claim tagged with its grade + quote id and the verbatim quotes listed once
at the end of the page.

**Stored fields only.** What the viewer derives in the browser (possible effects, release
changes, neurotransmitter tone, drug-drug interactions, the simulation) is not here, so
nothing duplicates the JS that computes it. The rendering is generic (a record's keys in
order, nested values as bullets), so a new data field shows up with no edit here.

Built into the Docker image (``docker/Dockerfile``, ``api`` stage), never committed:
``python tools/render_api.py --out <dir>``. Stdlib only.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent / "data_generators"))
import llms_txt  # noqa: E402 (SITE_URL + the version, defined once there)

PUBLIC = Path(__file__).resolve().parent.parent / "public"
COLLECTIONS = ("structures", "projections", "circuits", "projection_groups",
               "receptors", "drugs", "metabolites", "addons")

# Presentation-only fields: geometry and colours mean nothing as text.
SKIP = {"id", "name", "color", "position", "shape_file", "shape", "focusable", "mirror",
        "structure_image", "structure_image_gallery"}
# The viewer's `#tabs=<kind>:<id>` opener for each page kind, where one exists.
TAB_KIND = {"drug": "drug", "receptor": "target", "target": "target", "structure": "structure",
            "circuit": "circuit", "group": "group"}
KIND_TITLES = {"drug": "Drugs", "metabolite": "Active metabolites", "receptor": "Receptors",
               "target": "Other drug targets", "structure": "Brain regions",
               "projection": "Pathways", "circuit": "Circuits", "group": "Projection groups"}


def load(data_dir: Path) -> dict[str, Any]:
    """Every emitted collection, the meta object and the quote table, keyed by name."""
    data: dict[str, Any] = {
        name: [json.loads(line) for line in
               (data_dir / f"{name}.jsonl").read_text(encoding="utf-8").splitlines() if line]
        for name in COLLECTIONS}
    data["meta"] = json.loads((data_dir / "meta.json").read_text(encoding="utf-8"))
    data["quotes"] = {q["id"]: q for q in (json.loads(line) for line in
                      (data_dir / "quotes.jsonl").read_text(encoding="utf-8").splitlines() if line)}
    return data


def projection_id(p: dict[str, Any]) -> str:
    return f"{p['from']}--{p['to']}"


class Renderer:
    def __init__(self, data: dict[str, Any]):
        self.quotes = data["quotes"]
        self.corpora = data["meta"]["source_corpora"]
        targets = {tid: {"id": tid, **t} for tid, t in data["meta"]["drug_targets"].items()
                   if not t.get("receptor")}
        # kind -> id -> record: the pages, and the link targets.
        self.pages: dict[str, dict[str, dict[str, Any]]] = {
            "drug": {r["id"]: r for r in data["drugs"]},
            "metabolite": {r["id"]: r for r in data["metabolites"]},
            "receptor": {r["id"]: r for r in data["receptors"]},
            "target": targets,
            "structure": {r["id"]: r for r in data["structures"]},
            "projection": {projection_id(r): r for r in data["projections"]},
            "circuit": {r["id"]: r for r in data["circuits"]},
            "group": {r["id"]: r for r in data["projection_groups"]},
        }
        # A receptor/target region list names the hemisphere-less base ("frontal"), the
        # structures list the emitted right-hand id ("frontal_R").
        self.base_to_structure = {}
        for sid in self.pages["structure"]:
            self.base_to_structure.setdefault(sid.removesuffix("_R").removesuffix("_L"), sid)
        self.addons: dict[tuple[str, str], list[dict[str, Any]]] = {}
        for a in data["addons"]:
            self.addons.setdefault((a["owner_kind"], a["owner"]), []).append(a)

    # -- links ---------------------------------------------------------------------------
    def link(self, kind: str, ident: str, label: str | None = None) -> str:
        if kind == "structure" and ident not in self.pages["structure"]:
            ident = self.base_to_structure.get(ident, ident)
            base = self.pages["structure"].get(ident, {}).get("base_name")
            label = label or base
        if kind == "target" and ident in self.pages["receptor"]:
            kind = "receptor"
        record = self.pages.get(kind, {}).get(ident)
        if record is None:
            return label or ident
        return f"[{label or record.get('name') or record.get('label') or ident}](../{kind}/{ident}.md)"

    def linked(self, key: str, value: Any, parent: str) -> str | None:
        """``value`` as a link when ``key`` names another node, else None."""
        if not isinstance(value, str):
            return None
        if key in ("target",):
            return self.link("target", value)
        if key in ("from", "to", "structure") or parent in ("structures", "regions", "locations",
                                                            "location_sources", "profile"):
            return self.link("structure", value)
        if key == "drug_id" or (key == "owner" and parent == "drug"):
            return self.link("drug", value)
        if key == "id" and parent == "metabolites":
            return self.link("metabolite", value)
        return None

    # -- sources -------------------------------------------------------------------------
    @staticmethod
    def is_ref(v: Any) -> bool:
        return isinstance(v, dict) and ("quote_id" in v or ("corpus" in v and "provenance" in v))

    def source(self, ref: dict[str, Any]) -> str:
        grade = ref.get("provenance", "llm")
        q = self.quotes.get(ref.get("quote_id") or "")
        corpus = (q or ref).get("corpus")
        where = self.corpora.get(corpus, {}).get("ref", corpus or "unknown source")
        if q:
            self.cited.setdefault(q["id"], q)
            return f"[{grade} {q['id']}]"
        extra = "; ".join(f"{k}: {v}" for k, v in ref.items()
                          if k not in ("corpus", "provenance", "quote_id", "pipeline") and v is not None)
        return f"[{grade}] {where}" + (f" ({extra})" if extra else "")

    # -- values --------------------------------------------------------------------------
    def scalar(self, key: str, v: Any, parent: str) -> str:
        if isinstance(v, list):
            return ", ".join(self.linked(key, x, key) or str(x) for x in v)
        return self.linked(key, v, parent) or str(v)

    @staticmethod
    def is_scalar(v: Any) -> bool:
        return not isinstance(v, (dict, list)) or (
            isinstance(v, list) and all(not isinstance(x, (dict, list)) for x in v))

    def value(self, key: str, v: Any, depth: int, parent: str = "") -> list[str]:
        """Bullet lines for ``v`` (the value under ``key``), indented to ``depth``."""
        pad = "  " * depth
        if self.is_ref(v):
            return [f"{pad}- source: {self.source(v)}"]
        if isinstance(v, list) and v and all(self.is_ref(x) for x in v):
            return [f"{pad}- {self.source(x)}" for x in v]
        if isinstance(v, dict):
            out = []
            for k, x in v.items():
                if self.is_ref(x):
                    out.append(f"{pad}- {k}: {self.source(x)}")
                elif self.is_scalar(x):
                    out.append(f"{pad}- {self.linked(k, k, key) or k}: {self.scalar(k, x, key)}")
                else:
                    out.append(f"{pad}- {self.linked(k, k, key) or k}:")
                    out += self.value(k, x, depth + 1, key)
            return out
        if isinstance(v, list):
            out = []
            for item in v:
                if not isinstance(item, dict):
                    out.append(f"{pad}- {self.scalar(key, item, key)}")
                    continue
                head = "; ".join(f"{k}: {self.scalar(k, x, key)}" for k, x in item.items()
                                 if self.is_scalar(x))
                out.append(f"{pad}- {head or '(item)'}")
                for k, x in item.items():
                    if not self.is_scalar(x):
                        out.append(f"{pad}  - {k}:")
                        out += self.value(k, x, depth + 2, key)
            return out
        return [f"{pad}- {self.scalar(key, v, parent)}"]

    # -- pages ---------------------------------------------------------------------------
    def sources_section(self) -> list[str]:
        """The quotes this page cited, once each, in first-cited order."""
        if not self.cited:
            return []
        lines = ["", "## Sources", ""]
        for qid, q in self.cited.items():
            where = self.corpora.get(q.get("corpus"), {}).get("ref", q.get("corpus"))
            page = f", {q['page']}" if q.get("page") not in (None, "") else ""
            lines.append(f"- `{qid}` ({where}{page}): \"{q['quote']}\"")
        return lines

    def page(self, kind: str, ident: str, rec: dict[str, Any]) -> str:
        self.cited: dict[str, dict[str, Any]] = {}
        title = rec.get("name") or rec.get("label") or ident
        lines = [f"# {title}", "", f"Kind: {kind}. Id: `{ident}`."]
        if kind in TAB_KIND:
            lines.append(f"Open in the viewer: {llms_txt.SITE_URL}/#tabs={TAB_KIND[kind]}:{ident}")
        if rec.get("mirror"):
            lines.append("Paired: stated once for the right hemisphere, the left twin is implied.")
        lines.append("Each claim lists its sources as [grade quote_id]; the verbatim quotes are under "
                     "Sources at the end (also in /data/quotes.jsonl by id). A source without a quote "
                     "id (a database row) is spelled out inline. Index: [all pages](../index.md).")
        facts = [(k, v) for k, v in rec.items() if k not in SKIP and self.is_scalar(v)]
        if facts:
            lines += ["", "## Facts", ""]
            lines += [f"- {k}: {self.scalar(k, v, kind)}" for k, v in facts]
        for k, v in rec.items():
            if k in SKIP or self.is_scalar(v):
                continue
            lines += ["", f"## {k.replace('_', ' ')}", ""] + self.value(k, v, 0, kind)
        for a in self.addons.get((kind, ident), []):
            lines += ["", f"## Note ({a.get('tone', 'info')})", ""]
            lines += self.value("note", {k: v for k, v in a.items()
                                         if k not in ("id", "owner_kind", "owner")}, 0)
        lines += self.sources_section()
        return "\n".join(lines) + "\n"

    def index(self, version: str) -> str:
        lines = [f"# Neurarium API (version {version})", "",
                 "One Markdown page per node of the dataset: stored fields only, each claim tagged "
                 "[grade quote_id], the verbatim quotes listed under Sources at the end of each page. What the viewer computes in the browser "
                 "(possible effects, release changes, neurotransmitter tone, drug interactions, "
                 f"simulation) is not included. Overview and raw data: {llms_txt.SITE_URL}/llms.txt"]
        for kind, records in self.pages.items():
            lines += ["", f"## {KIND_TITLES[kind]} ({len(records)})", ""]
            for ident, rec in sorted(records.items(),
                                     key=lambda kv: str(kv[1].get("name") or kv[1].get("label") or kv[0]).lower()):
                name = rec.get("name") or rec.get("label") or ident
                lines.append(f"- [{name}]({kind}/{ident}.md)")
        return "\n".join(lines) + "\n"


def render(data_dir: Path, out: Path, version: str) -> int:
    """Write every page under ``out`` (cleared first); returns the page count."""
    r = Renderer(load(data_dir))
    if out.exists():
        shutil.rmtree(out)
    n = 0
    for kind, records in r.pages.items():
        (out / kind).mkdir(parents=True)
        for ident, rec in records.items():
            (out / kind / f"{ident}.md").write_text(r.page(kind, ident, rec), encoding="utf-8")
            n += 1
    (out / "index.md").write_text(r.index(version), encoding="utf-8")
    return n


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--public", type=Path, default=PUBLIC,
                        help="Site root holding data/ and version.js (default: ../public).")
    parser.add_argument("--out", type=Path, required=True,
                        help="Directory to write the pages into (cleared first). Never under public/.")
    args = parser.parse_args()
    n = render(args.public / "data", args.out, llms_txt.app_version(args.public))
    print(f"wrote {n} pages + index.md to {args.out}")


if __name__ == "__main__":
    main()
