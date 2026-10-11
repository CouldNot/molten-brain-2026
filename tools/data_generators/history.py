"""Drug regulatory history vocabularies: first approval + market withdrawals.

Two node kinds hang off a drug here (see ``docs/DRUGS.md`` "Regulatory history"):

* ``drug_first_approval``: ONE node per drug, ``first_approval = {year, country?,
  agency?}``, the earliest approval or introduction for medical use its source states.
* ``drug_withdrawals``: ONE node per withdrawal, ``withdrawals[] = {year, country,
  reason}``. A drug never withdrawn carries no node at all (absence is not a claim).

Every value is drawn from a closed vocabulary below, and each entry carries the
pattern its quote must contain (``attests``), so the applier
(``tools/sourcing/apply_drug_history.py``) can refuse a pick whose sentence does not
itself name the country / agency / reason being published: the LLM chooses which line,
code checks the line says it. The same keyword patterns drive the fetcher
(``tools/fetch/fetch_drug_history.py``), so "offered" and "accepted" cannot drift.

Labels are authored bilingually inline (like ``DRUG_CATEGORY_LABELS``) and emitted into
meta as ``drug_history_countries`` / ``drug_history_agencies`` /
``drug_withdrawal_reasons``.

Built with the help of Claude Code.
"""

from __future__ import annotations

import re

# A sentence is about approval when it says the drug was approved, licensed,
# authorized, introduced or marketed. "patented" alone is deliberately absent: a
# patent is not a marketing approval.
APPROVAL_RE = re.compile(
    r"\b(approv\w*|licen[cs]\w*|authori[sz]\w*|introduc\w*|marketed|launched|"
    r"came (?:on|onto) the market|"
    r"autoris\w*|commercialis\w*|mis(?:e|es)? sur le march\w*|introdui\w*|"
    r"approuv\w*|lanc\w*)", re.IGNORECASE)

# A sentence is about a withdrawal when it says the drug left the market.
WITHDRAWAL_RE = re.compile(
    r"\b(withdr[ae]w\w*|removed from (?:the )?market\w*|pulled from|banned|"
    r"discontinu\w*|suspend\w*|revoked|"
    r"retir\w*|interdit\w*|suspendu\w*|suspension)", re.IGNORECASE)

YEAR_RE = re.compile(r"\b(1[89]\d\d|20\d\d)\b")

# Country (or market) id -> {en, fr, attests}. ``attests`` must match the quote for the
# id to be published. ``worldwide`` / ``most_markets`` are the two non-country scopes
# articles use ("withdrawn worldwide", "withdrawn from most markets").
COUNTRIES: dict[str, dict[str, str]] = {
    "us": {"en": "United States", "fr": "États-Unis",
           "attests": r"\bUnited States\b|\bU\.?S\.?A?\b|\bFDA\b|[ÉE]tats-Unis|américain|\bAmerica"},
    "uk": {"en": "United Kingdom", "fr": "Royaume-Uni",
           "attests": r"United Kingdom|\bUK\b|\bU\.K\.|Britain|British|England|Royaume-Uni|britannique"},
    "fr": {"en": "France", "fr": "France", "attests": r"\bFrance\b|\bFrench\b|français|\bANSM\b"},
    "de": {"en": "Germany", "fr": "Allemagne", "attests": r"German|Allemagne|allemand"},
    "ch": {"en": "Switzerland", "fr": "Suisse", "attests": r"Switzerland|Swiss|Suisse"},
    "it": {"en": "Italy", "fr": "Italie", "attests": r"Ital"},
    "es": {"en": "Spain", "fr": "Espagne", "attests": r"Spain|Spanish|Espagne"},
    "be": {"en": "Belgium", "fr": "Belgique", "attests": r"Belgi"},
    "nl": {"en": "Netherlands", "fr": "Pays-Bas", "attests": r"Netherlands|Dutch|Pays-Bas"},
    "se": {"en": "Sweden", "fr": "Suède", "attests": r"Swed|Suède"},
    "dk": {"en": "Denmark", "fr": "Danemark", "attests": r"Denmark|Danish|Danemark"},
    "at": {"en": "Austria", "fr": "Autriche", "attests": r"Austria|Autriche"},
    "eu": {"en": "European Union", "fr": "Union européenne",
           "attests": r"\bEurope|\bEU\b|\bEMA\b|europ[ée]en"},
    "ca": {"en": "Canada", "fr": "Canada", "attests": r"Canad"},
    "au": {"en": "Australia", "fr": "Australie", "attests": r"Australi"},
    "nz": {"en": "New Zealand", "fr": "Nouvelle-Zélande",
           "attests": r"New Zealand|Nouvelle-Z[ée]lande"},
    "jp": {"en": "Japan", "fr": "Japon", "attests": r"Japan|Japon"},
    "cn": {"en": "China", "fr": "Chine", "attests": r"China|Chinese|Chine"},
    "ru": {"en": "Russia", "fr": "Russie", "attests": r"Russia|Soviet|Russie|soviétique"},
    "in": {"en": "India", "fr": "Inde", "attests": r"\bIndia|\bInde\b"},
    "worldwide": {"en": "worldwide", "fr": "dans le monde entier",
                  "attests": r"worldwide|world-wide|globally|monde entier|mondial"},
    "most_markets": {"en": "most markets", "fr": "la plupart des marchés",
                     "attests": r"most (?:markets|countries)|many countries|"
                                r"la plupart des (?:pays|marchés)|nombreux pays"},
}

# Regulatory agency id -> label (an acronym, the same in both languages) + attestation.
AGENCIES: dict[str, dict[str, str]] = {
    "fda": {"en": "FDA", "fr": "FDA", "attests": r"\bFDA\b|Food and Drug Administration"},
    "ema": {"en": "EMA", "fr": "EMA", "attests": r"\bEMA\b|European Medicines Agency"},
    "mhra": {"en": "MHRA", "fr": "MHRA",
             "attests": r"\bMHRA\b|Medicines and Healthcare products Regulatory Agency"},
    "ansm": {"en": "ANSM", "fr": "ANSM", "attests": r"\bANSM\b|\bAfssaps\b"},
    "health_canada": {"en": "Health Canada", "fr": "Santé Canada",
                      "attests": r"Health Canada|Santé Canada"},
    "tga": {"en": "TGA", "fr": "TGA", "attests": r"\bTGA\b|Therapeutic Goods Administration"},
}

# Withdrawal reason id -> {en, fr, attests}. ``unstated`` has no pattern: it is the
# honest value when the sentence says "withdrawn" and gives no why.
WITHDRAWAL_REASONS: dict[str, dict[str, str]] = {
    "liver": {"en": "liver toxicity", "fr": "toxicité hépatique",
              "attests": r"liver|hepat|hépat|\bfoie\b"},
    "cardiac": {"en": "cardiac risk", "fr": "risque cardiaque",
                "attests": r"heart|cardi|\bQT|arrhythm|valv|torsade|arythm"},
    "blood": {"en": "blood disorders", "fr": "troubles sanguins",
              "attests": r"agranulocyt|aplastic|blood|ha?ematolog|hémato|sanguin"},
    "neurological": {"en": "neurological harm", "fr": "atteinte neurologique",
                     "attests": r"Guillain|neurolog|neuropath"},
    "psychiatric": {"en": "psychiatric side effects", "fr": "effets psychiatriques",
                    "attests": r"suicid|depress|psychiatr|dépress"},
    "abuse": {"en": "misuse and dependence", "fr": "mésusage et dépendance",
              "attests": r"abuse|misuse|addict|dependen|recreational|diversion|"
                         r"abus|mésusage|toxicoman|dépendance|récréati"},
    "safety": {"en": "safety concerns", "fr": "problèmes de sécurité",
               "attests": r"safety|adverse|side effect|toxic|death|fatal|risk|"
                          r"sécurité|indésirable|décès|risque"},
    "efficacy": {"en": "lack of efficacy", "fr": "manque d'efficacité",
                 "attests": r"efficacy|ineffective|efficacité"},
    "commercial": {"en": "commercial reasons", "fr": "raisons commerciales",
                   "attests": r"commercial|sales|economic|business|commerciale"},
    "unstated": {"en": "reason not stated", "fr": "raison non précisée", "attests": ""},
}


def attests(vocab: dict[str, dict[str, str]], key: str, quote: str) -> bool:
    """Whether ``quote`` names vocabulary entry ``key`` (an empty pattern always does)."""
    entry = vocab.get(key)
    if entry is None:
        return False
    pat = entry.get("attests", "")
    return not pat or re.search(pat, quote, re.IGNORECASE) is not None


def labels(vocab: dict[str, dict[str, str]]) -> dict[str, dict[str, str]]:
    """The ``{id: {en, fr}}`` label map emitted into meta (patterns stay author-side)."""
    return {k: {"en": v["en"], "fr": v["fr"]} for k, v in vocab.items()}
