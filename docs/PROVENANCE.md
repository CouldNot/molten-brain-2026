# Source provenance

How every node is graded and sourced, in full. Split out of `CLAUDE.md` (which keeps a terse summary) to keep that file small; this project is built with the help of Claude Code. Section names referenced below (Nodes, Drugs, Drug metabolism, ...) are sections of `CLAUDE.md`, whose full drug detail lives in [`DRUGS.md`](DRUGS.md).

How every **node** (any sourceable datum, see Nodes) is graded + sourced. Every node's source/reference
carries a **provenance grade** (the dataset is LLM-assisted, not yet human-checked), rendered as a
coloured **pill**; the grade is **data**. Grades (`PROVENANCE_LEVELS`, weakest to strongest):

- **`llm`** (grey **?**): LLM from memory, unchecked, may be a hallucination.
- **`sourced`** (yellow **~**): LLM given the source document, not quote-verified.
- **`verified`** (green **✓**): an LLM extracted a quote, it was *programmatically* confirmed present in
  the source, and a separate LLM agreed it supports the claim. Highest grade; still LLM-driven.
- absence -> a red **✕** pill (`NOSOURCE_GLYPH`, `.src-todo`). Not a stored grade.
- **`uncertain`** (orange **⚠**): not a stored grade either but a **display grade**, taken by a node
  whose `uncertainty` bullets are non-empty (see below). It replaces the green ✓ on the pill and in the
  tally, and buckets as **backed** (the quote really was checked).

Every node's grade rides its own row/heading (`makeProvenancePill(level)`), never a separate bottom
"Sources" block (a source only ever grades one node); a node with no source shows `NOSOURCE`, never a
blank. The pill's tooltip shows the concrete source (the verbatim quote + citation) then a small "Click
for details" cue (`makeDetailsCue`) that opens the Sources & provenance popup: that popup is the single
place explaining what each grade means, so the verbose per-grade paragraph is not inlined into every
pill (it stays only as the pill's `aria-label`, `info.prov*`). The popup's tally is
**progressive-disclosure** (`buildAboutSourcing`): one global bar over all knowledge nodes by default,
clickable to reveal the per-node-kind bars, each of which is in turn clickable to reveal its grade counts
+ one clickable **example node** (`buildKindExample`: a representative datum rendered as a knowledge
triplet, its notion in quotation marks, that navigates to the real drug/receptor/structure/circuit/group).
The grade key lists only `NOSOURCE` / `llm` / `uncertain` / `verified` (the `~sourced` and
live-Wikipedia rows were dropped: no knowledge node is ever graded `sourced`). How the tally buckets
these grades (and why `llm` counts as unbacked): see The "% sourced" figure.

**The sourcing model.** A verified quote node may carry an optional `llm` (`haiku`/`sonnet`/`opus`,
`SOURCING_LLMS`) naming the model that extracted+judged it, so a reader can weigh a quote by that
model's capability; it is quote-node metadata (not part of the id hash), absent = unknown. Any new
sourcing/recheck pass must stamp it (a non-LLM deterministic source like Allen's PACall omits it).
A batch recheck (`tools/sourcing/recheck_quotes.py`, run as a Sonnet workflow) writes a central
`generated_cache/quote_llm.json` (`{quote_id: llm}`) that `quote_table` applies uniformly (an override
wins over a source-level `llm`); quotes it could not confirm land in `quote_recheck_flagged.json` for
review, not stamped.

**A verdict is about a claim, not a sentence (the citation site).** A quote id is a content hash, so
one sentence reaching two claims is one id, and the excerpt table stays deduplicated for it. What that
costs is the ability to say the useful thing, *this backs the binding and not the class*, so a
**citation site** (`tools/sourcing/citation_site.py`) names one place a quote is cited from
(`drug:clozapine/bindings[5ht2a:antagonist]`, `receptor:5ht1a/locations[amygdala]`).
`recheck_quotes.py` prefixes each reconstructed claim with it and `demote_quotes.py --sites` demotes
only the citations named, so the quote's other claims keep their source and the quote keeps its stamp.
It rides the citation for the same reason the grade and the `pipeline` do. A site names a **node**, not
a slot, so where one owner carries two nodes the key carries the distinction (a binding by target AND
action: amisulpride antagonises D2 and partially agonises it; an enzyme row by isoform AND role).

**The converse: a claim several quotes back TOGETHER is not asking each of them for the whole claim.**
A compound value earns its green check only when every part is attested (5-HT1B's `synaptic="both"` is
one presynaptic quote plus one postsynaptic one, a two-category class is one sentence per category), so
a judge shown one quote beside the whole claim rejects the citation that carries its share. Every claim
line therefore states how many citations share it, and asks the judge to weigh this one on its share. A claim the dataset
**already** doubts arrives with its `uncertainty` bullets spelled out in that same line, in the reader's
own words (scraped from `js/i18n.js`, so there is one copy): a judge not shown the flag re-derives the
doubt for itself and hands it back as a rejection, which would demote a citation over something the
dataset was already honest about.

**The rule: no LLM-picked quote ships unjudged by Sonnet or better.** A sentence a model *chose* out of
prose is the one that can be chosen wrongly (right page, wrong claim), so it is not backed until a
second model, which never saw the first one's reasoning, has agreed it supports the claim, and that
second model is `sonnet` or `opus`, never `haiku`. `check_data.py` family 5 fails on any citation whose
pipeline has an `extract_llm` step and no `judge_llm` step, so a new extraction pass cannot ship its
quotes and leave the judging for later. A quote **code** copied out of a table has no such failure mode
and needs no judge. A stamp names the **strongest** model that has confirmed a quote, so a second,
weaker read can only corroborate it; a weaker model *doubting* one is a disagreement, parked in
`quote_recheck_disputed.json` until the stamping model is re-asked (see `recheck_quotes.py`).

**How a quote got here (the chain of custody).** The grade says how well a claim is backed; the
**pipeline** says by what mechanism, which is a different question with a different failure mode. Every
citation carries a `pipeline` key resolved by `quote_pipeline()` from three facts it never has to
restate: whether the corpus is a **`machine`** store (PDSP #5, GtoPdb #7/#11/#12, Allen #8: no prose to
read, so every quote from it is a copied record line), whether the writing pass stamped
`extraction: "code"` on the source (the only authored bit, because who found the sentence is the only
unrecoverable one: Stahl's *Brands* and *Neuroscience-based Nomenclature* greps do), and whether the
quote carries an `llm` stamp (a judge ran). `QUOTE_PIPELINES` maps each key to its ordered steps,
emitted whole as `meta.quote_pipelines` and rendered at the bottom of every source tooltip as
`raw data -> deterministic extraction -> ... -> neurarium`; the step names are `quotechain.<step>` i18n
keys, so a new pipeline is one entry plus its translations and never a viewer edit. It rides the
**citation**, not the quote node, for the same reason the grade does: one sentence can honestly reach
two claims by two routes (Stahl's Class line is model-picked for the drug's class and code-grepped as
the NbN fallback).

**Where the grade lives.** One source shape, quote-level `{corpus, page, quote, provenance}` against a
`SOURCE_CORPORA` corpus; `provenance` defaults `DEFAULT_PROVENANCE` (`"llm"`), a sourceless node is
`NOSOURCE`. Each `wikipedia` reference emits a sibling `wikipedia_provenance` (`WIKIPEDIA_PROVENANCE`
registry); a **present** link defaults `"sourced"` (`WIKIPEDIA_DEFAULT_PROVENANCE`), not `llm` (a real
reference the viewer live-fetches). `_provenance` validates every grade; upgrading a source is a data edit.

**Where a quote sits (the book heading).** A quote node from a **book** corpus may carry a derived
`heading`: a **trail** of headings, outermost first (`["Clozapine", "Side effects", "How Drug Causes
Side Effects"]`, capped to its 3 deepest levels), rendered as a breadcrumb above the passage in the
source tooltip and handed to the LLM judge in `recheck_quotes.py`'s batches. A flat list, not named
levels, because the books do not share a shape (a Stahl monograph, a Kandel part/chapter/section, a
Nieuwenhuys chapter), so the viewer only joins it. It is **context, not a claim** (not a node, not
graded, not tallied), and it is what makes a quote judgeable rather than merely checkable: the same
sentence under *How the Drug Works* is Stahl attributing a mechanism to that drug, under *How Drug
Causes Side Effects* it is a subject-less rule (the distinction the `uncertain` badge rests on).
Derived by `tools/fetch/fetch_quote_headers.py` into the committed
`generated_cache/quote_headers.json` and applied by id in `quote_table` (like `quote_llm.json`).
Two resolvers: the four outline-bearing books (Kandel, Stahl Essential, Carlat, Nieuwenhuys) take
the ancestor chain of their `INDEX.md` entry covering the page; **Stahl** has no usable outline, so
its trail is read off the page text (monograph title from `INDEX.md`, then positional subsection,
then **section = a subsection -> section majority vote over all 158 monographs**, since the
extraction drops ~30 section headings and the nearest surviving one then leaks in from the previous
section or drug). A corpus is a "book" exactly when its page tree has an `INDEX.md`, which is what
excludes the flat stores (GtoPdb, Allen, Wikipedia) where a chapter has no meaning. An unresolved
level is **omitted**, never guessed. `check_data.py` family 5 checks the shape, then re-derives the
checkable half offline (a Stahl trail must open with the monograph containing the cited page),
which catches a stale or hand-edited cache.

**Doubting a `verified` claim (the `uncertain` badge).** `verified` says the sentence is on the page; it
never said the sentence is *about this node*. A node whose quote does not attribute the claim carries an
`uncertainty[]` array (drug bindings + projections, `tools/data_generators/quotes/uncertainty.py`), which
takes over its pill: orange ⚠, tooltip = "Here are LLM-written reasons to be uncertain about this claim:"
then one bullet per reason, then the node's own source as usual. **Every bullet is itself a badged,
sourced claim**: a `kind` from the closed `UNCERTAINTY_REASONS` vocabulary (emitted as
`meta.uncertainty_reasons`) + slot `args`, and either a real quote-gated source (the kind declares whether
it reuses the owner's own quote or its Ki) or `absence: true`, which renders the red ✕ and reads "the
corpus does not say this". No prose is stored: the sentence comes from an `uncertain.<kind>` i18n key, so
a new kind means a new string in **both** catalogues. Forgetting a source raises at generation
(`_uncertainty_bullet`) and errors in `check_data.py` family 5, which also gates each bullet quote
verbatim and stands its subject-less-quote guard down for a binding that declares uncertainty (the two
answer the same problem). **The three flags about a quote's REACH are derived, never authored per
site**: `apply_binding_uncertainty` / `apply_projection_uncertainty` compute both the flags and the
bullets from the emitted data, so a data edit cannot leave a stale flag behind and a new drug or arrow
is covered the day it lands. Four flags today, and a node hit by any is uncertain:
- **the subject-less side-effect rule** (89 bindings): the quote's heading trail ends in Stahl's *How Drug
  Causes Side Effects* and the sentence does not attribute the action to the drug (`_attributes_to_drug`:
  it neither names it, nor uses a pronoun subject, nor elides the subject in Stahl's telegraphic style).
  This is what the heading trails were resolved for.
- **the family-level claim** (`family_claim`, +22): one source sentence covers several of the drug's
  bindings on subtypes of one family (same id stem) and names none of them individually, so the split into
  subtypes is ours, not the book's ("Blockade of alpha adrenergic 1 receptors" -> alpha1A/B/D). Bearable
  when a measured Ki pins the subtype down, so it only flags a subtype **with no Ki**.
- **the blanket pathway claim** (`blanket_claim`, 33 projections): the projection twin of the above. An
  anatomy book states a diffuse system by its sweep ("project to virtually every part of the neuraxis"),
  so one sentence sources several arrows out of one nucleus while naming none of their targets: which
  regions the sweep is drawn to is our reading. Same `>= 2 siblings, none named` construction, over
  regions; a target the sentence *does* name (raphe -> thalamus) keeps its green check.
- **the contradicted claim** (`contradicted`, 3 `drug_enzymes` rows): the odd one out, and the only
  flag about a quote's *truth* rather than its reach. Two quote-gated corpora say opposite things
  (Stahl's bare "Inhibits CYP3A4" vs the article's "in vivo ... do not significantly affect ...
  CYP3A4", the recurring in-vitro-vs-in-vivo split), so both ship and the row carries the denial in
  its tooltip: picking a winner would assert a judgement neither corpus makes. Its bullet is the only
  one citing an OUTSIDE source (`source: "given"`), and it is **hand-curated** in
  `tools/data_generators/quotes/contradictions.py`, because the same scan derived returns 50% false
  positives (a caveat scoped to two named substrates, an exception clause reading as a negation), and
  a flag that encodes its own errors as doubt is worse than the silence it replaces.
  `apply_enzyme_uncertainty` raises when an entry names no emitted row, so a fetcher re-run cannot
  drop the doubted claim and leave the contradiction marking nothing.
The first three run as a post-pass (not `_binding_record` / `_projection_records`) because the bullets look across
siblings: `class_wide` counts the drugs the same sentence is printed on, `family_claim` the subtypes one
sentence covers, `blanket_claim` the arrows.

**Per-claim sources + the verify gate.** The nodes carrying such a source: a
binding's `sources[]`, a drug's `nbn_sources[]`, a projection/circuit/group quote (`KANDEL_QUOTES`), a
receptor/target location/classification, region anatomy. `corpus` keys the source-agnostic
`SOURCE_CORPORA` registry (`{ref, citation, url, pages_dir|tsv_dir}`, emitted as `meta.source_corpora`; the
full citation is resolved from there, not denormalized onto the ~429 bindings). `_quote_sources` /
`_binding_sources` validate corpus + grade (a `verified` source needs page + quote). `verified` is
earned by a two-step (LLM extract + LLM judge supports), then `check_data.py`'s source-quote check
confirms the quote is really on the page (the backstop against a hallucination). **Page files are
author-side (see `CLAUDE.local.md`), so the quote gate is skipped + warned on a clone that lacks them**
(true for every corpus below except #13, whose tables are committed). A binding with no quote source falls back to its **Ki** (verified), else
`NOSOURCE`. The **NbN** is simpler: `apply_nbn_sources.py` greps Stahl's verbatim
"Neuroscience-based Nomenclature: <value>" line and confirms the dataset `nbn` is a substring (stronger
than a judge for this fixed field); a newer drug with no NbN line falls back to Stahl's **Class** line
under the same gate, marked `nbn_nonstandard`. **Brands** are gated the same way:
`apply_brand_sources.py` reads each drug's Stahl "Brands?" dump list and confirms each brand appears
verbatim on the drug's page range (region `na`, `verified`); a brand not found verbatim is dropped, not
guessed. The eu/fr brands come from Wikipedia (corpus #10 `wikipedia_fr`), region-tagged only for ordering.

The corpora (`SOURCE_CORPORA`), each quote-gated author-side as above unless noted:
- **#1 Stahl / #2 Kandel / #3 Stahl Essential / #4 Carlat / #6 Nieuwenhuys** are `pages_dir` book
  corpora (`page` = a page number): drug bindings/NbN/class (Stahl), pathways + region anatomy (Kandel,
  Nieuwenhuys), receptor/target mechanism (Stahl Essential); see `CLAUDE.local.md` for the trees.
- **#5 PDSP Ki** (`pdsp_ki`) has a `csv` path, not `pages_dir` (measured Ki values, not paged text). A
  binding's `ki.source` cites a **Ki id** (a CSV row) instead of a page; `check_data.py` confirms the
  row exists with that value. A verified Ki backs `_binding_grade`. Refresh `fetch_ki.py --apply`.
- **#7 GtoPdb** (`gtopdb`, `page` = a GtoPdb targetId) is the source for **receptor** "Found in"
  regions. A confirm-only LLM judge maps a cached quote (by index) to each existing region (never
  adds/drops one); `apply_location_sources.py` writes the `verified` source into
  `tools/generated_cache/location_sources.json`. Each quote carries the assay **`species`** (Human/Rat/Mouse/Monkey,
  validated in `_quote_sources`); a non-human-only region shows an amber "· <species>" tag.
- **#8 Allen AHBA** (`allen_ahba`, `page` = an HGNC gene) is the complement covering **non-receptor
  targets** + the receptors/regions GtoPdb misses. `fetch_allen.py` turns the microarray **PACall**
  boolean across human donors into a deterministic present/absent (**no judge**);
  `apply_location_sources.py --corpus allen` writes the `verified`, `species: Human` source. The panel's
  species tag prefers Human (`locationEntry`), so an Allen confirmation clears the amber tag. **Caveat:**
  microarray = mRNA in cell bodies, so a transporter confirms at its source nucleus (SERT->raphe,
  NET->LC) and its terminal-region claims honestly stay `llm`.
- **#9 Wikipedia pharm** (`wikipedia_pharm`, `page` = the article slug) backs a binding **Ki** where PDSP
  (#5) has none (a *fallback*, never overriding a measured assay). `fetch_wikipedia_pharmacology.py` stores
  the whole English article author-side (pinned to a revision id) and mines its pharmacodynamics binding
  table; a Ki source's `quote` is the verbatim table row, gated exactly like a book page. A tertiary
  source citing the primary literature: the grade attests quote-presence, the corpus label conveys tier.
  It also backs **`drug_categories`** for drugs Stahl has no monograph for: the infobox "Drug class" row or
  a lead sentence, offered by `fetch_category_worklist.py`, picked by index, gated by
  `apply_category_sources.py --wikipedia`, then judged by `recheck_quotes.py` (#10 FR leads are the fallback).
  And, from the receptor's / target's **own** article (alongside Stahl Essential #3 prose), the classification
  residue GtoPdb #12 cannot reach: `receptor_synaptic` (a `both` needs one quote per site), an ion channel's
  `receptor_sign`, sigma-1's `receptor_class`, and `targets` type. Offered by `fetch_classification_worklist.py`,
  picked by index, gated by `apply_classification_sources.py --prose`, then judged by `recheck_quotes.py`.
- **#10 Wikipedia FR** (`wikipedia_fr`, `page` = the FR article slug) is the source for a drug's
  **European / French** commercial brands (`eu`/`fr` region; na comes from Stahl). The FR infobox holds
  only chemistry, so the trade names live in prose; `fetch_brand_names.py` resolves each drug's FR article
  (via the EN article's langlinks), stores it author-side under `data_sources/wikipedia/pages_fr/`, and
  emits a candidate-sentence worklist; an LLM extracts each drug's ordered trade names, and
  `apply_brand_names.py` quote-gates every name verbatim on the FR page (the hallucination backstop),
  writing the first as `fr` and the rest as `eu`. A brand source's `quote` is the brand name.
- **#11 GtoPdb ligand interactions** (`gtopdb_ki`, `page` = the GtoPdb ligand slug) is GtoPdb's
  *other* half (#7 is its tissue API) and complements PDSP (#5) where a radioligand panel
  structurally cannot reach: **targets PDSP does not assay** (the GABA-A benzodiazepine site,
  MAO-A/B, acetylcholinesterase, orexin, melatonin, SV2A, Nav) and the **direction** of an
  `affinity_only` binding. One versioned bulk CSV (`DATA/interactions.csv`), so
  `fetch_gtopdb_ki.py` is deterministic (no judge): it joins on **gene symbol** (case-folded, a
  rodent row reads `Scn2a`), flattens each matched compound's rows into
  `data_sources/gtopdb/pages_ki/<slug>.md`, and a proposal's `quote` is one verbatim row line, so
  the normal quote gate applies unchanged. `apply_gtopdb_ki.py` merges **confirm-only** (never
  adds a target) and **PDSP-first** (a Ki only where there is none; a stated direction always
  wins), reporting rather than resolving a disagreement. Only a pKi/pKd becomes a `ki`: a
  functional potency (pIC50/pEC50) rides along as the direction's citation. Contents CC BY-SA 4.0,
  database ODbL.
- **#12 GtoPdb target classification** (`gtopdb_class`, `page` = the GtoPdb targetId) is GtoPdb's
  third slice, backing the *mechanism* nodes: a target's `type` (gpcr/lgic/vgic/enzyme) is a
  receptor's `receptor_class` and a non-receptor target's `type`, read directly; a GPCR's `sign`
  is **mapped** from its transduction table (`transducers` + `effectors`) under the narrow table
  in `apply_classification_sources.py` (Gi/Go -> inhibitory, Gs / Gq/G11 -> excitatory; anything
  mixed or unmapped writes nothing), since GtoPdb states the transduction and never a sign. No
  judge: `fetch_gtopdb_class.py` flattens both fields into `data_sources/gtopdb/pages_class/
  <targetId>.md` and the applier is **confirm-only** (writes only where GtoPdb agrees with the
  value we already state, reporting a disagreement instead of rewriting the data). The sources
  **add to** a book quote rather than replacing it, so an attribute both cover shows two
  citations. GtoPdb has **no pre/post-synaptic field**, so `synaptic` is out of its reach.
- **#13 PharmFreq** (`pharmfreq`, `page` = the HGNC gene) is the one corpus whose raw tables are
  **committed** (`tools/data/pharmfreq/`), so it declares `tsv_dir` and no `pages_dir` and its quote
  is gated by re-derivation rather than by a page lookup: see Drug metabolism, Population variability.
- **#14 DailyMed** (`dailymed`, `page` = a label **set id**) is the US prescribing label (NLM Structured
  Product Labels), and the only **primary regulatory** source here. It exists for the time-to-peak node
  (`drug_tmax`): a label's section 12.3 states a Tmax for essentially every oral drug marketed in the US,
  where the stored prose corpora state it for a third of the roster. `fetch_dailymed.py` picks ONE label
  per drug (plain-oral forms preferred, since a modified-release product states a real Tmax for a
  different product) and stores that label's pharmacokinetics sections as the author-side page, so the
  normal verbatim-quote gate applies unchanged. A set id resolves to a public page
  (`dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=<page>`). Its limit is jurisdictional: a drug never
  marketed in the US has no SPL at all. Content is a US government work under no copyright restriction.
- **#15 CPIC** (`cpic`, `page` = the guideline's ClinPGx id, e.g. `PA166251445`) is the prescribing
  guidance a metabolizer phenotype implies, the only corpus here that says what a *clearance speed means
  for a prescription* rather than stating a fact about a molecule or a brain. It backs one node kind,
  `drug_pgx`, one node per (drug, gene, phenotype), and that node carries **two** citations rather than
  splitting in two: CPIC's `implications` sentence and the `drugrecommendation` that follows from it are
  one claim read in one go, and the recommendation is unreadable without the implication. Committed like
  #13 (`tools/data/cpic/cpic_recommendations.json`, `tsv_dir`, no `pages_dir`), gated by re-derivation,
  `machine` + `extraction: "code"` so no judge is owed. Three limits are structural: CPIC files tricyclic
  and SRI dosing on **two** genes at once, so a row kept under one gene records `assumes` the other is a
  normal metabolizer (55 of 104 rows); its uncertainty phenotypes (`Likely`/`Possible` Intermediate,
  `Indeterminate`, `No Result`) are dropped, having no frequency to pair with; and a gene with no
  metabolizer-frequency profile here (HLA-A, HLA-B, SCN1A, the urea-cycle genes) is out of scope, since
  the readout exists to put a base rate on a row. It also backs a few `drug_enzymes` rows, but only
  where CPIC's own sentence names the gene and the drug together ("Consider alternative drug not
  metabolized by CYP2C19; If clomipramine is warranted, ..."): the *level* of a pair is a verdict
  rather than a sentence, so it is never quoted as one. CC0 1.0, attribution requested (see
  `tools/data/cpic/README.md`).

**Descriptions** are not a node kind (not tallied). Drugs, structures and non-receptor targets carry
**no baked description**: their panel fetches the **current Wikipedia lead** (CC BY-SA) at runtime via
`liveWikiDescription` over `js/wiki.js` `fetchWikiLead(url, lang)` (locale lead, English fallback), so
the dataset ships no copyrighted prose (a panel whose live lead fails shows none). Receptors + projection
groups carry a short **authored** `description` as the offline fallback, overridden best-effort by the
live lead. Needs the `connect-src https://*.wikipedia.org` CSP allowance.

**The live-Wikipedia source link (green, viewer-only).** A live-fetched lead shows its provenance as the
**Wikipedia link itself**, relocated (by `liveWikiDescription`) to the end of the description in place of a
grade pill and styled as a green pill-link (`.wiki-src`, reusing `.src-prov-wikipedia`): a live fetch is a
verbatim programmatic read that cannot drift, so it earns the green tier, and the link (not a cryptic ✓)
makes plain the text is *from* Wikipedia and clicks through to it. `appendWiki` stashes the reference link
as `wrap._refLink`; on a successful fetch it moves up and the emptied reference row is dropped (any lookup
links stay). It is a **presentation**, **not** a stored grade and **not** tallied; the green ✓
`PROVENANCE_PILLS.wikipedia` pill (`info.provWikipedia`) remains only as a fallback if the link can't be
moved. Asymmetry: a **baked** Wikipedia snapshot stays yellow `sourced` (a stored copy *can* drift); only
the **live** read earns the green link. When the live fetch fails, the baked description keeps its stored
pill and the reference link stays in its own row; a missing link shows `NOSOURCE`.

**The "% sourced" figure.** `_provenance_stats` reduces every node + reference to its strongest grade and
buckets it into **verified** (quote-checked) / **uncertain** (quote-checked, but its `uncertainty[]`
bullets say the quote does not attribute the claim) / **sourced** (from a document) / **missing** (no
document). A bare `llm` grade *is* missing (an LLM asserting from memory has no document), so it buckets
with a sourceless node (the viewer still shows them differently, grey `?` vs orange `NOSOURCE`).
`uncertain` counts as **backed** (a real document exists), so flagging a claim leaves `pct_backed`
untouched and only moves the node out of the green count. It tallies per
node kind (drug bindings, NbN, drug class, projections, circuits, projection groups, receptor/target
classifications, receptor/target expression regions, region anatomy, wikipedia references), plus a
headline `pct_backed` over the **knowledge nodes** (references excluded, a reference points *at* a node).
The `references` kind stays in `by_kind` but the viewer does **not** render it as a coverage bar (a
reference is not a knowledge node, and every present link defaults to `sourced`, so the bar was uniformly
yellow noise); it is emitted as `meta.provenance_stats` (key `nodes`). Each expression region is its own node, individually
upgradeable. **The live per-kind figures live in the README `SOURCING_STATS` block (auto-written by
`update_readme_stats.py`, CI runs it `--check`) and the Sources & provenance popup; they are not repeated
here, to avoid drift.** `check_data.py` re-confirms the tally is self-consistent (coverage columns M/S/S+V).
Separately, `meta.provenance_stats.ki_coverage` tracks **measured-affinity (PDSP Ki) coverage** (bindings
with a Ki, drugs with none; combos excluded): NOT a grade (a quote-only binding is still sourced), but the
honest complement surfacing where a measured affinity was never looked up. Rendered in the sourcing popup +
README block, warned per-drug by `check_data.py` family 7.
