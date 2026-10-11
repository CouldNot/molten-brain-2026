#!/usr/bin/env python
"""Store each drug's French summary of product characteristics as corpus #16 (BDPM).

The French public drug database (ANSM "Base de données publique des médicaments", BDPM,
Licence Ouverte / Etalab) is the French counterpart of DailyMed (corpus #14): every
medicine authorised in France, with its official summary of product characteristics
(RCP). Its section 5.2 "Propriétés pharmacocinétiques" states a time to peak and an
elimination half-life for most drugs, including the European-only ones DailyMed cannot
reach (no US label exists for loprazolam, cyamemazine, tiapride...). Its product table
also names every French commercial brand, which is the third fact read here.

This is a **corpus fetcher**, not a claim pass: it states nothing, it only puts pages on
disk in the shape every other corpus uses, so ``fetch_tmax.py`` / ``fetch_half_life.py``
can offer sentences and ``apply_tmax.py`` / ``apply_half_life.py`` /
``apply_brand_names.py --bdpm`` can gate quotes against them.

What it stores:

* ``data_sources/bdpm/CIS_bdpm.txt`` + ``CIS_COMPO_bdpm.txt`` - the two bulk tables
  (latin-1 TSV): one row per product (CIS code, denomination, form, route, status,
  commercialisation) and one row per active-substance line of a product.
* ``data_sources/bdpm/raw/<CIS>.html`` - the product's RCP page as downloaded.
* ``data_sources/bdpm/pages/<CIS>.md`` - the quote-gate page: a header (denomination,
  CIS, form, route, holder, source URL, fetch date) then the RCP section 5.2 paragraphs,
  one per line. A product cited only for its brand name gets the header alone, written
  from the bulk table (its denomination is the brand quote), with no RCP download.
* ``tools/generated_cache/bdpm_labels.json`` - per drug: the chosen RCP (``cis``,
  denomination, ``why``) and the French brands read off the product table.

The join, drug -> French INN -> products, is the part that can silently go wrong:

* a product counts only when it has exactly ONE active substance (a combination's RCP
  states the combination's kinetics, the same rule as DailyMed);
* a substance line is reduced to its molecule (``CHLORHYDRATE DE FLUOXÉTINE``,
  ``CITALOPRAM (BROMHYDRATE DE)``, ``FLUOXÉTINE BASE`` -> ``FLUOXETINE``) and compared
  **exactly**, accent-folded, against the drug's names (English name, the French
  Wikipedia title the brand pass resolved, ``FR_ALIASES``). Exact, never a prefix or
  substring, so ``ESCITALOPRAM`` can never match citalopram; a stereo-tagged substance
  goes through ``tools/chirality.py`` like every other name-joined corpus;
* homeopathic dilutions ("... POUR PRÉPARATIONS HOMÉOPATHIQUES") are not the drug.

The representative RCP: commercialised, active authorisation, plain oral (not
"LP" / "à libération prolongée" / modified-release / gastro-resistant: a prolonged-release
product states a real Tmax of a different product, the Seroquel XR gotcha), brand-name
product before a generic; up to ``MAX_TRIES`` are downloaded until one's 5.2 states a
peak or a half-life. Only when no plain-oral product exists is a non-modified-release
product of another route tried, and ``why`` says so.

Brands: the denomination's brand part, see :func:`brand_of` (the generic-exclusion rule
lives there).

Usage (from the repo root)::

    python tools/fetch/fetch_bdpm.py                 # drugs lacking a tmax or a half-life
    python tools/fetch/fetch_bdpm.py --all           # every roster drug
    python tools/fetch/fetch_bdpm.py --only loprazolam,tiapride
    python tools/fetch/fetch_bdpm.py --refresh       # re-download tables + RCPs

Network, polite (one request at a time, ``fetch_dailymed.SLEEP`` apart) and resumable.
Stdlib only; author-side (``data_sources/`` is gitignored).

Built with the help of Claude Code.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent           # repo root
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(HERE))

import chirality                                                # noqa: E402
from text_fold import strip_accents                             # noqa: E402
import drugs_io                                                 # noqa: E402
import fetch_dailymed                                           # noqa: E402 (_get)
import fetch_half_life                                          # noqa: E402 (HALF_LIFE_RE)
import fetch_tmax                                               # noqa: E402 (PEAK_RE, durations)

SITE = "https://base-donnees-publique.medicaments.gouv.fr"
TABLE_URL = SITE + "/download/file/{name}"
RCP_URL = SITE + "/medicament/{cis}/extrait"
BASE_DIR = ROOT / "data_sources" / "bdpm"
RAW_DIR = BASE_DIR / "raw"
PAGES_DIR = BASE_DIR / "pages"
PRODUCTS_FILE = "CIS_bdpm.txt"
COMPO_FILE = "CIS_COMPO_bdpm.txt"
CACHE_PATH = ROOT / "tools" / "generated_cache" / "bdpm_labels.json"
BRAND_WORKLIST = ROOT / "tools" / "generated_cache" / "brand_worklist.json"
MAX_TRIES = 4        # RCPs downloaded per drug before giving up on it

# A French INN the folded English name and the FR Wikipedia title both miss. Values are
# folded molecule keys (see ``fold``); only add one after checking the BDPM spelling.
FR_ALIASES: dict[str, tuple[str, ...]] = {
    "amphetamine_d": ("DEXAMFETAMINE",),
    "amphetamine_dl": ("AMFETAMINE",),
    "methylphenidate_d": ("DEXMETHYLPHENIDATE",),
    "methylphenidate_dl": ("METHYLPHENIDATE",),     # the French products are racemic
    "methamphetamine": ("METAMFETAMINE",),
    # Divalproate is valproate's own salt complex (Depakote); valpromide (Depamide) is a
    # different molecule and stays out.
    "valproate": ("VALPROATE", "ACIDE VALPROIQUE", "DIVALPROATE"),
}

# Salt / hydrate / counter-ion words a substance line wraps around its molecule.
SALT_WORDS = {
    "ACETATE", "ANHYDRE", "BASE", "BESILATE", "BITARTRATE", "BROMHYDRATE", "BROMURE",
    "CHLORHYDRATE", "CHLORURE", "CITRATE", "DIHYDRATE", "DICHLORHYDRATE", "EMBONATE",
    "FUMARATE", "GLUCONATE", "HEMIFUMARATE", "HEMIHYDRATE", "HEMISULFATE",
    "HEMITARTRATE", "HYDROGENOTARTRATE", "HYDROGENOFUMARATE", "HYDROGENOSUCCINATE",
    "IODURE", "LACTATE", "MALATE", "MALEATE", "MESILATE", "MESYLATE", "METHANESULFONATE",
    "METHYLSULFATE", "MONOHYDRATE", "NAPADISILATE", "OXALATE", "PAMOATE", "PHOSPHATE",
    "SESQUIHYDRATE", "SUCCINATE", "SULFATE", "TARTRATE", "TOSILATE", "TRIHYDRATE",
    "CARBONATE", "SODIQUE", "POTASSIQUE", "DIPOTASSIQUE", "DISODIQUE", "DIMESILATE",
    "MONOSODIQUE", "CALCIQUE", "DE", "D", "SODIUM", "POTASSIUM",
    "CALCIUM", "MAGNESIUM", "SEL", "SOUS", "FORME",
}

# A product that is not a plain immediate-release form, read off the denomination and
# the form column. Its peak belongs to a different product (see the module docstring).
MODIFIED_RELEASE = re.compile(
    r"\bL\.?\s?P\.?\b|LIB[EÉ]RATION\s+(?:PROLONG|MODIFI|RETARD|CONTR[OÔ]L)|"
    r"GASTRO-?R[EÉ]SISTANT|\bCHRONO\b|\bRETARD\b|\bDEPOT\b|\bDÉPÔT\b|\bLI\b",
    re.IGNORECASE)

# Generic manufacturers' house names: a denomination carrying one is a generic even when
# its first word is not the INN (rare, but a "BIOGARAN" product is never a brand).
GENERIC_LABS = {
    "ACCORD", "ALMUS", "ALTER", "ARROW", "BIOGARAN", "CRISTERS", "EG", "EVOLUGEN",
    "MYLAN", "QUALIMED", "RANBAXY", "RATIOPHARM", "SANDOZ", "TEVA", "VIATRIS",
    "ZENTIVA", "ZYDUS", "SUN", "AUROBINDO", "KRKA", "UPSA CONSEIL", "GNR", "PANPHARMA",
}


# Routes whose product acts where applied, not as the systemic drug.
LOCAL_ROUTES = re.compile(r"cutan[ée]e|ophtalmique|auriculaire|dentaire|gingivale",
                          re.IGNORECASE)


def fold(text: str) -> str:
    """Accent-fold + uppercase + collapse to letters/digits separated by one space."""
    t = strip_accents(text).upper()
    return " ".join(re.sub(r"[^A-Z0-9]+", " ", t).split())


def molecule_key(substance: str) -> tuple[str, str | None]:
    """A substance line reduced to ``(molecule, stereo tag)``.

    >>> molecule_key("CHLORHYDRATE DE FLUOXÉTINE")
    ('FLUOXETINE', None)
    >>> molecule_key("CITALOPRAM (BROMHYDRATE DE)")
    ('CITALOPRAM', None)
    >>> molecule_key("OXALATE D'ESCITALOPRAM")
    ('ESCITALOPRAM', None)
    >>> molecule_key("SODIUM (VALPROATE DE)")
    ('VALPROATE', None)
    >>> molecule_key("ACIDE VALPROÏQUE")
    ('ACIDE VALPROIQUE', None)
    """
    stem, tag = chirality.split_stereo(substance)
    words = [w for w in fold(re.sub(r"\([^)]*\)", " ", stem)).split()
             if w not in SALT_WORDS]
    if not words:      # an inverted line, "SODIUM (VALPROATE DE)": the molecule is inside
        words = [w for w in fold(stem).split() if w not in SALT_WORDS]
    return " ".join(words), tag


def is_homeopathic(substance: str) -> bool:
    return "HOMEOPATH" in fold(substance)


def drug_keys(drug: dict, fr_titles: dict) -> set[str]:
    """Every folded name the drug can appear under in the substance table."""
    names = [drug.get("name") or ""]
    if drug["id"] in fr_titles:
        names.append(fr_titles[drug["id"]])
    # A stereo-qualified name ("Methylphenidate (D)", "Amphetamine (D,L)") is never
    # reduced, or its qualifier would be dropped and the racemate's products joined to
    # the single enantiomer: such drugs join only through ``FR_ALIASES``. Others are
    # reduced the same way a substance line is ("Sodium oxybate" -> OXYBATE) and kept
    # whole too (a name that is all salt words, "lithium", must still match).
    if any("(" in n for n in names):
        keys = set(FR_ALIASES.get(drug["id"], ()))
        return keys | {k + "E" for k in keys if not k.endswith("E")}
    keys = {fold(n) for n in names} | {molecule_key(n)[0] for n in names}
    # The French INN often only adds a final -e (vigabatrin -> VIGABATRINE, pizotifen
    # -> PIZOTIFENE, bupropion -> BUPROPIONE). Still an exact match on the whole key.
    keys |= {k + "E" for k in keys if k and not k.endswith("E")}
    keys.update(FR_ALIASES.get(drug["id"], ()))
    return {k for k in keys if k}


# ---------------------------------------------------------------------------- tables

def read_table(path: Path) -> list[list[str]]:
    """One latin-1 TSV as rows of stripped cells."""
    text = path.read_bytes().decode("latin-1")
    return [[c.strip() for c in line.split("\t")] for line in text.splitlines() if line]


def load_products(rows: list[list[str]]) -> dict[str, dict]:
    """``CIS_bdpm.txt`` rows -> ``{cis: {denomination, form, route, status, marketed, holder}}``."""
    out: dict[str, dict] = {}
    for r in rows:
        if len(r) < 7:
            continue
        out[r[0]] = {"cis": r[0], "denomination": r[1], "form": r[2], "route": r[3],
                     "status": r[4], "marketed": r[6] == "Commercialisée",
                     "holder": r[10].strip() if len(r) > 10 else ""}
    return out


def load_compo(rows: list[list[str]]) -> dict[str, list[dict]]:
    """``CIS_COMPO_bdpm.txt`` rows -> ``{cis: [{name, nature, link}]}``.

    ``nature`` is ``SA`` (substance active) or ``FT`` (fraction thérapeutique, the same
    active restated as its base); ``link`` ties an FT to its SA, so the number of
    distinct links is the number of actives.
    """
    out: dict[str, list[dict]] = {}
    for r in rows:
        if len(r) < 8:
            continue
        out.setdefault(r[0], []).append({"name": r[3], "nature": r[6], "link": r[7]})
    return out


def single_active(lines: list[dict]) -> bool:
    """Whether a product has exactly one active substance (combinations are skipped)."""
    return len({ln["link"] for ln in lines}) == 1


def matches(drug_id: str, keys: set[str], lines: list[dict]) -> bool:
    """Whether a single-active product's substance IS this drug (exact molecule match).

    Only the ``SA`` line is read: a prodrug's ``FT`` line names what it becomes
    (lisdexamfetamine's is DEXAMFETAMINE), which is not the product's drug.
    """
    for ln in lines:
        if ln["nature"] != "SA":
            continue
        if is_homeopathic(ln["name"]):
            return False
        mol, tag = molecule_key(ln["name"])
        if mol in keys and chirality.tag_allowed(tag, drug_id):
            return True
    return False


def products_for(drug: dict, keys: set[str], products: dict, compo: dict) -> list[dict]:
    """Every single-active product whose substance is ``drug``."""
    out = []
    for cis, lines in compo.items():
        if cis in products and single_active(lines) and matches(drug["id"], keys, lines):
            out.append({**products[cis], "substances": [ln["name"] for ln in lines]})
    return out


# ---------------------------------------------------------------------------- brands

def brand_of(product: dict, keys: set[str]) -> str | None:
    """The brand a product's denomination names, or None for a generic.

    The brand part is the denomination's first word ("HAVLANE, comprimé sécable" ->
    ``HAVLANE``, "THERALENE 5 mg, ..." -> ``THERALENE``, "DEPAKINE CHRONO 500 mg" ->
    ``DEPAKINE``): the trailing words are dosage or a product-line suffix, not a second
    brand. Generic-exclusion rule: the product is a generic, and gives no brand, when
    that first word is a word of the drug's INN or of any of the product's substance
    lines (French generics are named "<INN> <LAB>": "LOPRAZOLAM TEVA",
    "ACIDE VALPROÏQUE ARROW", "VALPROATE DE SODIUM MYLAN"), when the INN appears later
    in the brand part (a range name, not a product brand: "GRANIONS DE LITHIUM"), or
    when the denomination carries a generic manufacturer's house name (``GENERIC_LABS``).
    A product for a local route (skin, eye, ear: ``LOCAL_ROUTES``) gives no brand
    either: "LITHIODERM" is a lithium skin gel, not a brand of the drug modeled here.

    >>> brand_of({"denomination": "HAVLANE, comprimé sécable", "substances": ["LOPRAZOLAM"]}, {"LOPRAZOLAM"})
    'HAVLANE'
    >>> brand_of({"denomination": "LOPRAZOLAM TEVA 1 mg, comprimé", "substances": ["LOPRAZOLAM"]}, {"LOPRAZOLAM"})
    """
    if LOCAL_ROUTES.search(product.get("route") or ""):
        return None
    raw = product["denomination"].split(",")[0].strip()
    m = re.match(r"[^\W\d_][\w'’.-]*", raw)
    if not m:
        return None
    word = m.group(0).rstrip(".-")
    head = fold(word)
    if len(head) < 3:
        return None
    inn_words = {w for k in keys for w in k.split()}
    for s in product.get("substances") or []:
        inn_words.update(fold(re.sub(r"\([^)]*\)", " ", s)).split())
    if head in inn_words or set(fold(raw).split()[1:]) & {w for k in keys for w in k.split()}:
        return None
    if set(fold(raw).split()) & GENERIC_LABS:
        return None
    return word


def brands_for(products: list[dict], keys: set[str]) -> list[dict]:
    """Distinct ``{name, quote, cis}`` brands of the marketed products, first CIS wins."""
    out: dict[str, dict] = {}
    for p in sorted(products, key=lambda p: p["cis"]):
        if not p["marketed"] or "active" not in p["status"].lower():
            continue
        quote = brand_of(p, keys)
        if quote and fold(quote) not in out:
            out[fold(quote)] = {"name": display_brand(quote), "quote": quote,
                                "cis": p["cis"]}
    return list(out.values())


def display_brand(quote: str) -> str:
    """The table's upper-case brand in the casing the stored brands use ("Havlane")."""
    return "-".join(part.capitalize() for part in quote.split("-"))


# ---------------------------------------------------------------------------- RCP

def is_plain_oral(product: dict) -> bool:
    text = f"{product['denomination']} {product['form']}"
    return "orale" in product["route"].lower() and not MODIFIED_RELEASE.search(text)


def rank(products: list[dict], keys: set[str]) -> list[tuple[dict, str]]:
    """Marketed products in the order an RCP is tried, each with the ``why`` it was."""
    marketed = [p for p in products
                if p["marketed"] and "active" in p["status"].lower()]
    plain = [p for p in marketed if is_plain_oral(p)]
    if plain:
        pool, why = plain, "plain oral"
    else:
        # Never a local route (an eye drop's 5.2 is not systemic kinetics) or a patch
        # (a sustained-delivery peak, like a modified-release one).
        pool = [p for p in marketed
                if not MODIFIED_RELEASE.search(f"{p['denomination']} {p['form']}")
                and not LOCAL_ROUTES.search(p["route"])
                and "transdermique" not in p["route"].lower()]
        why = "no plain-oral product; non-modified-release {route}"
    # A brand-name product (the originator's RCP, usually the fullest 5.2) before a
    # generic restating it; then CIS order for determinism.
    pool = sorted(pool, key=lambda p: (brand_of(p, keys) is None, p["cis"]))
    return [(p, why.format(route=p["route"]) + ("" if brand_of(p, keys) is None
                                                  else ", brand-name product"))
            for p in pool]


def section_52(page_html: str) -> list[str]:
    """The RCP section 5.2 as text lines, one paragraph per line ([] when absent)."""
    m = re.search(r"id=['\"]5\.2\.[^'\"]*['\"]", page_html)
    if not m:
        m = re.search(r"name=['\"]RcpPropPharmacocinetiques['\"]", page_html)
    if not m:
        return []
    start = page_html.find("</p>", m.end())
    end_m = re.search(r"class=\"?AmmAnnexeTitre[12]\"?", page_html[start:])
    if end_m:
        stop = page_html.rfind("<", start, start + end_m.start())   # the heading's <p
        body = page_html[start:stop if stop > start else start + end_m.start()]
    else:
        body = page_html[start:]
    body = re.sub(r"</(p|li|td|tr|div|h\d)>|<br\s*/?>", "\n", body, flags=re.I)
    out = []
    for line in re.sub(r"<[^>]+>", "", body).splitlines():
        line = " ".join(html.unescape(line).replace("\xa0", " ").split()).lstrip("·•▪- ")
        if len(line) > 1:
            out.append(line)
    return out


def states_pk(lines: list[str]) -> bool:
    """Whether any line names a peak or a half-life AND carries a duration."""
    return any((fetch_tmax.PEAK_RE.search(ln) or fetch_half_life.HALF_LIFE_RE.search(ln))
               and fetch_tmax.durations_in_fr(ln) for ln in lines)


def page_text(product: dict, lines: list[str]) -> str:
    """The stored page: provenance header, then the 5.2 lines (none for a brand page)."""
    head = [f"# {product['denomination']}", f"cis: {product['cis']}",
            f"form: {product['form']}", f"route: {product['route']}",
            f"holder: {product['holder']}", f"source: {RCP_URL.format(cis=product['cis'])}",
            f"fetched: {time.strftime('%Y-%m-%d')}", ""]
    return "\n".join(head + lines) + "\n"


def write_page(product: dict, lines: list[str]) -> None:
    PAGES_DIR.mkdir(parents=True, exist_ok=True)
    (PAGES_DIR / f"{product['cis']}.md").write_text(page_text(product, lines),
                                                    encoding="utf-8")


def fetch_rcp(drug: dict, ranked: list[tuple[dict, str]], *, refresh: bool,
              entry: dict) -> str:
    """Store one drug's representative RCP into ``entry``; returns a one-word outcome."""
    if not ranked:
        return "no-ir-product"            # only modified-release forms are marketed
    tried = 0
    for product, why in ranked:
        raw_path = RAW_DIR / f"{product['cis']}.html"
        if refresh or not raw_path.exists():
            if tried >= MAX_TRIES:
                break
            body = fetch_dailymed._get(RCP_URL.format(cis=product["cis"]))
            tried += 1
            if not body:
                continue
            raw_path.parent.mkdir(parents=True, exist_ok=True)
            raw_path.write_text(body, encoding="utf-8")
        else:
            body = raw_path.read_text(encoding="utf-8", errors="replace")
        lines = section_52(body)
        if not lines or not states_pk(lines):
            continue
        write_page(product, lines)
        entry["cis"] = product["cis"]
        entry["denomination"] = product["denomination"]
        entry["why"] = why
        return "stored"
    return "no-pk"


def download_tables(refresh: bool) -> None:
    for name in (PRODUCTS_FILE, COMPO_FILE):
        path = BASE_DIR / name
        if refresh or not path.exists():
            body = fetch_dailymed._get(TABLE_URL.format(name=name), binary=True)
            if body is None:
                raise SystemExit(f"[error] could not download {name}")
            BASE_DIR.mkdir(parents=True, exist_ok=True)
            path.write_bytes(body)


def fr_titles() -> dict[str, str]:
    """drug id -> the French Wikipedia title the brand pass (corpus #10) resolved."""
    if not BRAND_WORKLIST.exists():
        return {}
    wl = json.loads(BRAND_WORKLIST.read_text(encoding="utf-8"))
    return {did: v["fr_title"] for did, v in wl.items() if v.get("fr_title")}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="comma-separated drug ids to scope the run to")
    ap.add_argument("--all", action="store_true",
                    help="fetch an RCP for every roster drug, not only those lacking "
                         "a tmax or a half-life")
    ap.add_argument("--refresh", action="store_true",
                    help="re-download the tables and every RCP")
    args = ap.parse_args()
    only = {d.strip() for d in args.only.split(",") if d.strip()} if args.only else None

    download_tables(args.refresh)
    products = load_products(read_table(BASE_DIR / PRODUCTS_FILE))
    compo = load_compo(read_table(BASE_DIR / COMPO_FILE))
    titles = fr_titles()
    cache = (json.loads(CACHE_PATH.read_text(encoding="utf-8"))
             if CACHE_PATH.exists() else {})

    counts: dict[str, int] = {}
    drugs = [d for d in drugs_io.load_drugs() if not only or d["id"] in only]
    for i, drug in enumerate(drugs, 1):
        did = drug["id"]
        if "+" in (drug.get("name") or ""):
            outcome = "combo"                # a combination's RCP is not this drug's
            cache.pop(did, None)
        else:
            keys = drug_keys(drug, titles)
            found = products_for(drug, keys, products, compo)
            entry = cache.get(did, {}) if not args.refresh else {}
            entry["brands"] = brands_for(found, keys)
            for b in entry["brands"]:
                if not (PAGES_DIR / f"{b['cis']}.md").exists():
                    write_page(products[b["cis"]], [])
            wants = args.all or only or not drug.get("tmax") or not drug.get("half_life")
            cached = entry.get("cis") and (PAGES_DIR / f"{entry['cis']}.md").exists()
            if not found:
                outcome = "no-product"
            elif cached and not args.refresh:
                outcome = "cached"
            elif wants:
                outcome = fetch_rcp(drug, rank(found, keys), refresh=args.refresh,
                                    entry=entry)
            else:
                outcome = "brands-only"
            if found:
                cache[did] = entry
            else:
                cache.pop(did, None)
        counts[outcome] = counts.get(outcome, 0) + 1
        print(f"[{i}/{len(drugs)}] {did}: {outcome}")
        if outcome == "stored":
            CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=1,
                                             sort_keys=True) + "\n", encoding="utf-8")
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=1, sort_keys=True)
                          + "\n", encoding="utf-8")
    print("[ok] " + ", ".join(f"{k}={v}" for k, v in sorted(counts.items()))
          + f" -> {CACHE_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
