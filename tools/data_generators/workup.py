"""Pre-prescription workup: the tests the French label (RCP) asks for around a drug.

Node kind ``drug_workup`` (BETA): ONE node per (drug, test, timing), read off the RCP
sections 4.2 / 4.3 / 4.4 (corpus #24 ``bdpm_rcp``): an ECG before haloperidol, renal
and thyroid function before lithium, a blood count throughout clozapine. ``timing``
is ``before`` (the "bilan pre-therapeutique", before the first dose) or ``during``
(monitoring while the drug is taken), and is only ``during`` when the label says so.

Every value is drawn from a closed vocabulary below whose entries carry the pattern
the quote must contain (``attests``, like ``history.COUNTRIES``), so the applier
(``tools/sourcing/apply_workup.py``) refuses a pick whose sentence does not itself
name the test. A timing's pattern is matched against the quote OR the RCP sub-heading
it sits under, since a label often lists its tests as bullets under a heading such as
"Examens a pratiquer avant le traitement :"; the applier re-reads that heading off the
page rather than trusting the judged file. The fetcher (``tools/fetch/fetch_workup.py``)
offers lines on the same patterns, so "offered" and "accepted" cannot drift.

Labels are authored bilingually inline (like ``DRUG_CATEGORY_LABELS``) and emitted
into meta ``workup_tests`` / ``workup_timings``. Data lives in the committed
``tools/generated_cache/workup.json`` (applier-written, never hand-edited).

Built with the help of Claude Code.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Callable

CACHE = Path(__file__).resolve().parent.parent / "generated_cache" / "workup.json"

# Test id -> {en, fr, attests}. Order is display order (cardiac, blood, organs, then
# the rest). ``attests`` is matched case-insensitively against the French quote.
TESTS: dict[str, dict[str, str]] = {
    "ecg": {"en": "ECG (QT interval)", "fr": "ECG (intervalle QT)",
            "attests": r"\bECG\b|[ée]lectrocardiogra|intervalle QT|\bQTc?\b"},
    "echocardiography": {"en": "echocardiography", "fr": "échocardiographie",
                         "attests": r"[ée]chocardiogra|[ée]cho-cardiogra"},
    "blood_pressure": {"en": "blood pressure", "fr": "pression artérielle",
                       "attests": r"pression art[ée]rielle|tension art[ée]rielle"},
    "heart_rate": {"en": "heart rate", "fr": "fréquence cardiaque",
                   "attests": r"fr[ée]quence cardiaque|\bpouls\b"},
    "blood_count": {"en": "blood count", "fr": "numération formule sanguine",
                    "attests": r"\bNFS\b|num[ée]ration|formule sanguine|h[ée]mogramme|"
                               r"leucocyt|polynucl[ée]aires|neutrophil|globules blancs|"
                               r"plaquett|h[ée]matolog"},
    "electrolytes": {"en": "electrolytes (sodium, potassium, calcium)",
                     "fr": "ionogramme (sodium, potassium, calcium)",
                     "attests": r"ionogramme|kali[ée]mie|natr[ée]mie|calc[ée]mie|"
                                r"magn[ée]s[ée]mie|[ée]lectrolyt|hypokali|hyponatr|"
                                r"hypomagn|hypocalc"},
    "renal_function": {"en": "kidney function", "fr": "fonction rénale",
                       "attests": r"cr[ée]atinin|cr[ée]atin[ée]mie|clairance|"
                                  r"fonctions? (?:h[ée]patiques? et )?r[ée]nales?|"
                                  r"prot[ée]inurie|\bur[ée]e\b|filtration glom[ée]rulaire"},
    "liver_function": {"en": "liver tests", "fr": "bilan hépatique",
                       "attests": r"(?:bilan|fonction|tests?|enzymes?|param[eè]tres|"
                                  r"examens?|marqueurs|surveillance|exploration)s? "
                                  r"(?:biologiques? )?h[ée]patiques?|transaminase|\bALAT\b|"
                                  r"\bASAT\b|\bALT\b|\bAST\b|bilirubin|gamma-?GT"},
    "thyroid_function": {"en": "thyroid function", "fr": "fonction thyroïdienne",
                         "attests": r"\bTSH\b|thyro[iï]d|\bT4\b"},
    "glycaemia": {"en": "blood glucose", "fr": "glycémie",
                  "attests": r"glyc[ée]mi|glucose|HbA1c|h[ée]moglobine glyqu"},
    "lipids": {"en": "blood lipids", "fr": "bilan lipidique",
               "attests": r"lipid|cholest[ée]rol|triglyc[ée]rid"},
    "weight": {"en": "weight", "fr": "poids",
               "attests": r"\bpoids\b|\bIMC\b|masse corporelle|tour de taille"},
    "prolactin": {"en": "prolactin", "fr": "prolactine", "attests": r"prolactin"},
    "drug_level": {"en": "blood level of the drug", "fr": "dosage sanguin du médicament",
                   "attests": r"lithi[ée]mie|concentrations? (?:plasmatique|s[ée]rique|"
                              r"sanguine)|taux (?:plasmatique|s[ée]rique|sanguin)|"
                              r"dosages? (?:plasmatique|s[ée]rique|sanguin)"},
    "ammonia": {"en": "blood ammonia", "fr": "ammoniémie", "attests": r"ammoni[ée]mie"},
    "coagulation": {"en": "clotting tests", "fr": "bilan de coagulation",
                    "attests": r"coagulation|fibrinog[eè]ne|temps de saignement|\bTP\b|"
                               r"\bINR\b"},
    "pregnancy_test": {"en": "pregnancy test", "fr": "test de grossesse",
                       "attests": r"test de grossesse|grossesse|enceinte|\bHCG\b"},
    "hla_genotype": {"en": "HLA genotype", "fr": "génotype HLA",
                     "attests": r"\bHLA-?[AB]\b|HLA-?[AB]\*"},
    "eeg": {"en": "EEG", "fr": "EEG", "attests": r"\bEEG\b|[ée]lectroenc[ée]phalogra"},
    "eye_exam": {"en": "eye examination", "fr": "examen ophtalmologique",
                 "attests": r"ophtalmolog|fond d.[œo]e?il|champ visuel|acuit[ée] visuelle|"
                            r"p[ée]rim[ée]tr"},
}

# Timing id -> {en, fr, attests}. ``attests`` is matched against the quote OR the
# sub-heading it sits under (see module docstring).
TIMINGS: dict[str, dict[str, str]] = {
    "before": {"en": "before starting", "fr": "avant de commencer",
               "attests": r"\bavant\b|pr[ée]alable|pr[ée]-?th[ée]rapeutique|"
                          r"instaur|initiation|mise en route|mise sous traitement|"
                          r"d[ée]but(?:er)? (?:du|le|de ce|d.un) traitement|"
                          r"\bbaseline\b|initial"},
    "during": {"en": "during treatment", "fr": "pendant le traitement",
               "attests": r"au cours d|pendant|surveill|contr[ôo]l|r[ée]guli[eè]r|"
                          r"p[ée]riodique|tous les|toutes les|chaque|suivi|"
                          r"hebdomadaire|mensuel|annuel|ensuite|puis"},
}


def attests(vocab: dict[str, dict[str, str]], key: str, *texts: str) -> bool:
    """Whether any of ``texts`` names vocabulary entry ``key`` (an unknown key never)."""
    entry = vocab.get(key)
    if entry is None:
        return False
    return any(re.search(entry["attests"], t or "", re.IGNORECASE) for t in texts)


def tests_named(text: str) -> list[str]:
    """Every test id ``text`` names, in :data:`TESTS` order."""
    return [k for k in TESTS if attests(TESTS, k, text)]


def labels(vocab: dict[str, dict[str, str]]) -> dict[str, dict[str, str]]:
    """The ``{id: {en, fr}}`` label map emitted into meta (patterns stay author-side)."""
    return {k: {"en": v["en"], "fr": v["fr"]} for k, v in vocab.items()}


def _load() -> dict[str, Any]:
    return json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}


_DATA = _load()


def _fold(text: str) -> str:
    """Case, whitespace and apostrophe folding, for the condition-span check."""
    return " ".join(text.replace("\u2019", "'").casefold().split())


def drug_workup(drug_id: str, quote_sources: Callable, data: dict | None = None
                ) -> dict[str, Any]:
    """The emitted ``workup`` field of one drug: ``[{test, timing, conditions?,
    sources}]`` in vocabulary order, or ``{}``. ``conditions`` (a conditional row:
    the label asks for the check only in some patients) holds verbatim French spans
    of the row's own quotes, each checked to be one. ``quote_sources`` is ``provenance._quote_sources``
    (passed in, as for physchem.py). Validates against the vocabularies so a hand edit
    of the cache fails the build instead of shipping an unlabelled row."""
    rows = ((data if data is not None else _DATA).get("drugs") or {}).get(drug_id) or []
    out, seen = [], set()
    for r in rows:
        what = f"Drug {drug_id!r} workup {r.get('test')!r}/{r.get('timing')!r}"
        if r.get("test") not in TESTS:
            raise KeyError(f"{what}: test not in workup.TESTS")
        if r.get("timing") not in TIMINGS:
            raise KeyError(f"{what}: timing not in workup.TIMINGS")
        key = (r["test"], r["timing"])
        if key in seen:
            raise ValueError(f"{what}: duplicate (test, timing) node")
        seen.add(key)
        if not r.get("sources"):
            raise ValueError(f"{what}: no source")
        row = {"test": r["test"], "timing": r["timing"]}
        for cond in r.get("conditions") or []:
            if not any(_fold(cond) in _fold(s.get("quote") or "") for s in r["sources"]):
                raise ValueError(f"{what}: condition {cond!r} is not a span of its quotes")
        if r.get("conditions"):
            row["conditions"] = list(r["conditions"])
        row["sources"] = quote_sources(r["sources"], what)
        out.append(row)
    order = {k: i for i, k in enumerate(TESTS)}
    tord = {k: i for i, k in enumerate(TIMINGS)}
    out.sort(key=lambda r: (tord[r["timing"]], order[r["test"]]))
    return {"workup": out} if out else {}
