"""Render the emitted dataset as one Markdown page per node, served under ``/api/``.

The text twin of the viewer's detail panels, for LLM agents and anything that cannot run
WebGL: ``/api/`` lists every page, ``/api/drug/sertraline`` holds that drug's
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
from urllib.parse import quote

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
# What JS encodeURIComponent leaves unescaped, so a page URL matches the viewer's byte for byte.
URI_SAFE = "-_.!~*'()"
API = "/api"  # absolute links, so a page reads the same served at any address (the 404)
NOT_FOUND = ("**No page at this address.** Page paths are `/api/<kind>/<id>` with a singular "
             "kind and the record id (lowercase, underscores, e.g. `/api/drug/sertraline`, "
             "`/api/drug/amphetamine_dl`, `/api/structure/putamen_R`); a pathway id is "
             "`<from>--<to>`. Every valid page is listed below with its id.")
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
        return f"[{label or record.get('name') or record.get('label') or ident}]({API}/{kind}/{ident})"

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
        extra = "; ".join(f"{k}: {v}" for k, v in ref.items()
                          if k not in ("corpus", "provenance", "quote_id", "pipeline") and v is not None)
        if q:
            self.cited.setdefault(q["id"], q)
            return f"[{grade} {q['id']}]" + (f" ({extra})" if extra else "")
        # A bare database row links where the viewer's Ki tooltip does: its own
        # reference URL, else the corpus's generic one.
        url = self.page_link(corpus, ref.get("page"))
        if url and "http" not in extra:
            extra = f"{extra}; {url}" if extra else url
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
    def page_link(self, corpus: str | None, page: Any) -> str | None:
        """The link for one cited page, as the viewer's tooltip resolves it: the corpus's
        stored ``page_urls[page]``, else its ``{page}`` template, else its landing ``url``."""
        c = self.corpora.get(corpus, {})
        if page is not None:
            if c.get("page_urls", {}).get(str(page)):
                return c["page_urls"][str(page)]
            if c.get("page_url"):
                return c["page_url"].replace("{page}", quote(str(page), safe=URI_SAFE))
        return c.get("url")

    def sources_section(self) -> list[str]:
        """The quotes this page cited, once each, in first-cited order."""
        if not self.cited:
            return []
        lines = ["", "## Sources", ""]
        for qid, q in self.cited.items():
            where = self.corpora.get(q.get("corpus"), {}).get("ref", q.get("corpus"))
            has_page = q.get("page") not in (None, "")
            page = f", {q['page']}" if has_page else ""
            # The page's public URL, the link the viewer's tooltip shows (see page_link).
            link = self.page_link(q.get("corpus"), q['page'] if has_page else None)
            link = f" {link}" if link else ""
            lines.append(f"- `{qid}` ({where}{page}){link}: \"{q['quote']}\"")
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
                     f"id (a database row) is spelled out inline. Index: [all pages]({API}/).")
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

    def listing(self, kind: str) -> list[str]:
        """One kind's pages, by name, as a Markdown section."""
        records = self.pages[kind]
        lines = ["", f"## [{KIND_TITLES[kind]}]({API}/{kind}/) ({len(records)})", ""]
        for ident, rec in sorted(records.items(),
                                 key=lambda kv: str(kv[1].get("name") or kv[1].get("label") or kv[0]).lower()):
            name = rec.get("name") or rec.get("label") or ident
            lines.append(f"- [{name}]({API}/{kind}/{ident}) `{ident}`")
        return lines

    def index(self, version: str, kinds: list[str] | None = None, lead: str = "") -> str:
        """The page list (every kind, or just ``kinds``), under ``lead`` when given."""
        lines = [f"# Neurarium API (version {version})", ""]
        if lead:
            lines += [lead, ""]
        lines.append("One Markdown page per node of the dataset: stored fields only, each claim tagged "
                     "[grade quote_id], the verbatim quotes listed under Sources at the end of each "
                     "page. The human version (the 3D viewer) shows slightly more: what it computes in "
                     "the browser from these facts (possible effects, release changes, "
                     "neurotransmitter tone, drug interactions, simulation) is not included. "
                     f"Every page: [{API}/]({API}/). Overview and raw data: {llms_txt.SITE_URL}/llms.txt")
        for kind in kinds or self.pages:
            lines += self.listing(kind)
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
        (out / kind / "index.md").write_text(r.index(version, [kind]), encoding="utf-8")
    (out / "index.md").write_text(r.index(version), encoding="utf-8")
    # Served (status 404) for any /api address with no page, so a mistyped or guessed
    # id still leads somewhere: the full list, ids shown, is the way out.
    (out / "not_found.md").write_text(r.index(version, lead=NOT_FOUND), encoding="utf-8")
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
