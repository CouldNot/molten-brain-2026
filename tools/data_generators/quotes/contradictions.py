"""Where one corpus **denies** what another states (the ``contradicted`` badge).

Every other doubt this package records is about a quote's *reach*: the sentence is on
the page, but it may not be about this node (see ``uncertainty.py``). This one is about
a quote's *truth*, and it is the only kind the dataset cannot settle: two graded,
quote-gated sources say opposite things, and picking a winner would mean asserting a
judgement neither corpus makes.

The recurring shape, and the reason this file exists at all, is **in vitro vs in vivo**.
A prescriber's manual states an interaction as a bare fact ("Inhibits CYP3A4"); the
pharmacology literature qualifies it ("in vivo, ... do not significantly affect the
activity of ... CYP3A4"). Both sentences are real. The laboratory effect exists and the
bedside effect does not, and a terse bullet has no room to say so. Dropping the row would
hide what the manual prints; keeping it silently would let the reader believe something
the better-evidenced source contradicts. So the row ships, flagged, with the denial
quoted underneath it.

**Hand-curated, unlike the three derived flags in** ``uncertainty.py``. A scan for
"negation sentence naming an isoform this drug modulates" over the stored articles
returns six pairs, of which three are not contradictions at all:

* a caveat scoped to two named substrates ("bupropion does not seem to affect the
  concentrations of CYP2D6 substrates fluoxetine and paroxetine") is a *detail of* the
  inhibition, not a denial of it;
* an exception clause ("interactions are considered unlikely ... **with possible
  exceptions such as** CYP2A6 substrates") actually affirms the interaction while its
  words read as a negation.

At a 50% false-positive rate the derivation would encode its own errors as doubt, which
is worse than the silence it replaces. So each entry below was read in context and
written by hand, and the ordinary quote gate (``check_data.py`` family 5) still confirms
it verbatim on the cited page, exactly like the claim it doubts.

Three tables, one per doubted node kind, each ``key -> denying source``:

* :data:`ENZYME_CONTRADICTIONS` ``(drug_id, enzyme, role)``: the metabolism row itself
  (the isoform touches the drug at all);
* :data:`ENZYME_STRENGTH_CONTRADICTIONS` ``(drug_id, enzyme, role)``: only the row's
  tier sub-claim (``claims.strength``), when the sources agree on the isoform but not on
  how much of the clearing it does;
* :data:`RECEPTOR_CONTRADICTIONS` ``(receptor_id, attribute)``: one of a receptor's
  four classification sub-claims (``classification[attr]``).

``generate_data.py`` raises if a key names no emitted node, so a re-run of a fetcher
cannot silently strip the flag and leave the contradiction unmarked.
"""
from __future__ import annotations

from typing import Any


def _wiki(slug: str, quote: str) -> dict[str, Any]:
    """A denial read off the stored English article (corpus #9), graded like any quote."""
    return {"corpus": "wikipedia_pharm", "page": slug, "quote": quote,
            "provenance": "verified", "llm": "opus"}


def _book(corpus: str, page: int, quote: str) -> dict[str, Any]:
    """A denial read off a book corpus page, judged like any LLM-picked quote."""
    return {"corpus": corpus, "page": page, "quote": quote,
            "provenance": "verified", "llm": "opus"}


ENZYME_CONTRADICTIONS: dict[tuple[str, str, str], dict[str, Any]] = {
    # Stahl's fluoxetine monograph (p.331) prints a bare "Inhibits CYP3A4". Wikipedia
    # cites Sager et al. 2014 (Clin Pharmacol Ther 95:653), whose whole subject is the
    # in vitro -> in vivo correlation for exactly these isoforms: the inhibition is real
    # in the dish and not at the bedside.
    ("fluoxetine", "cyp3a4", "inhibitor"): _wiki(
        "fluoxetine",
        "In vivo, fluoxetine and norfluoxetine do not significantly affect the "
        "activity of CYP1A2 and CYP3A4"),
    # Stahl p.83 states "Induces CYP3A4 (and slightly CYP1A2)" for armodafinil, carrying
    # its own hedge. The article denies the CYP1A2 half outright, and pointedly: the
    # induction is modafinil's, not its R-enantiomer's.
    ("armodafinil", "cyp1a2", "inducer"): _wiki(
        "armodafinil",
        "In contrast to modafinil, however, armodafinil does not induce CYP1A2"),
    # Stahl p.553 already hedges ("Inhibits CYP2C19 (and perhaps CYP2C9)"), so this one
    # is a disagreement the weaker source half-anticipates. Kept flagged rather than
    # dropped: the hedge is Stahl's, the denial is the article's, and neither is ours.
    ("modafinil", "cyp2c9", "inhibitor"): _wiki(
        "modafinil",
        "However, other in-vitro work has shown no significant inhibition of CYP2C9"),
}


# Stahl and the CYP pass agree each isoform clears / is inhibited by the drug; they
# disagree on the tier. The row's isoform claim stays green, only the tier goes orange.
ENZYME_STRENGTH_CONTRADICTIONS: dict[tuple[str, str, str], dict[str, Any]] = {
    # Stahl p.210: "to a lesser extent by CYP2D6". The article's drugbox says the
    # opposite, though its own pharmacokinetics prose names CYP1A2 as primary: the
    # article disagrees with itself, which is exactly why neither side is picked.
    ("clozapine", "cyp2d6", "substrate"): _wiki(
        "clozapine", "Liver , by several CYP isozymes mainly via CYP2D6"),
    ("fluvoxamine", "cyp1a2", "substrate"): _wiki(
        "fluvoxamine",
        "fluvoxamine is metabolized primarily by CYP2D6 and to a minor extent by "
        "CYP1A2"),
    # Stahl p.770 "weakly at low doses"; the article's "moderate" is in vitro, but the
    # sentences after it report a dose-dependent rise of CYP2D6 substrates in humans.
    ("sertraline", "cyp2d6", "inhibitor"): _wiki(
        "sertraline", "Sertraline is a moderate inhibitor of CYP2D6 and CYP2B6 in vitro"),
}


# A receptor classification attribute a corpus states otherwise. The sourcing pass never
# rewrites data to match a source, so these were reported as conflicts and kept.
RECEPTOR_CONTRADICTIONS: dict[tuple[str, str], dict[str, Any]] = {
    # We say postsynaptic; the article gives it a presynaptic autoreceptor role.
    ("5ht5a", "synaptic"): _wiki(
        "5_ht5a_receptor", "It also appears to serve as a presynaptic serotonin autoreceptor"),
    # mGluR6 (we say postsynaptic) was read and left out: the only candidate is a
    # group-level sentence ("groups II and III are mostly located on presynaptic
    # elements") that never names mGluR6 and goes on to say both sites occur.
    # We say modulatory; Gs coupling (adenylyl cyclase up) points excitatory, the same
    # transduction-to-sign reading corpus #12 uses.
    ("a2a", "sign"): _wiki(
        "adenosine_a2a_receptor",
        "The A 2A receptor binds with the G s protein at the intracellular site of the "
        "receptor"),
    # We say modulatory; Stahl Essential reads MT1 as inhibiting SCN neurons.
    ("mt1", "sign"): _book(
        "stahl_essential", 455,
        "MT1-mediated inhibition of neurons in the suprachiasmatic nucleus (SCN)"),
}
