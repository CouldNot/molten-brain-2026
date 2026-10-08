# CLAUDE.md

Guidance for Claude Code (and humans) working in this repository. This file is a
**map**, not a manual: it says what exists, where it lives, and the non-obvious
rules, so you can find the code, not re-read it in prose.

> [!CAUTION]
> **This is a large, wide-ranging codebase: manage your context deliberately.** The
> data model, generator, viewer, sourcing pipeline and deploy stack are each sizeable, so
> you cannot hold it all at once. Read only what a task needs (this map -> the one file ->
> the one symbol), lean on the doc split (`ARCHITECTURE.md`, `tools/README.md`, `docs/*`)
> instead of re-reading prose, and prefer targeted search over whole-file reads.
> **Keep files small and hierarchically organized so no single file balloons and dilutes
> context.** When adding code, anticipate its growth and place it so it stays cohesive:
> split a module *before* it gets unwieldy, reuse existing helpers rather than duplicating
> (see the no-duplication rule under Conventions), and design the seams up front so a later
> costly refactor / dedup pass is not needed. A file that has grown too big to load
> comfortably is itself a bug to fix.

> [!IMPORTANT]
> **Keep this file current AND terse, and do not grow it by default.** Update a
> line here only when a change adds or removes something a reader cannot quickly
> recover from the code itself: a new file, a new user-facing control, a new
> data-contract field, or a non-obvious rule. A pure refactor that keeps the same
> concepts needs no edit here. Prefer editing an existing line to adding one.
> Format contract, to stop it ballooning again:
> - One line per feature/file/control. Name the symbol/file; don't narrate the code.
> - State the *current* behavior only. Never write the history of a decision you
>   reversed ("used to", "the old X", "earlier this was", "no longer"). Just
>   describe what is true now; delete what is not.
> - Give a rationale only when it is non-obvious (a "why" a reader would
>   otherwise get wrong). Skip the obvious why.
> - State each behavior once; cross-reference with "(see X)" instead of repeating.
> - Deeper narrative (diagrams, module graph, boot sequence) lives in
>   [`ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## What this is

A browser-based [three.js](https://threejs.org/) 3D brain visualizer, built with the help
of Claude Code (see [README.md](README.md) for the feature tour): brain regions as
procedural meshes, projection arrows between them, and datasets of neurotransmitter
**receptors**, psychiatric **drugs** (Stahl's Prescriber's Guide), named **circuits**, and
**projection groups** layered on top. Focusing a receptor/drug dims the brain and lights the
regions (glowing "gem" dots) and pathways it touches; a drug adds effect colours
(boost/block/modulate) + a by-mechanism flow overlay. The explode slider blows the assembled
brain radially apart to reveal the deep nuclei.

Region `group` values (`lobe`, `basal_ganglia`, `diencephalon`, `limbic`,
`hindbrain`, `brainstem_nuclei` for the diffuse source nuclei raphe / locus
coeruleus / VTA / tuberomammillary / nucleus basalis) drive the legend headings + ordering via `GROUP_LABELS` in
`tools/generate_data.py` (emitted into `meta.json`, read by the viewer). Adding a
group means adding it there or its structures drop from the legend.

Coordinate convention (arbitrary units, brain centered on origin): `x` left(-)/
right(+), `y` down(-)/up(+), `z` posterior(-)/anterior(+).

## Nodes (the sourceable-datum model)

**A *node* is any sourceable datum**, one atom of brain knowledge attributable to a
source; the dataset is a graph of nodes and a detail panel is a view of one node plus
every node linked to it. The concept, the umbrella-vs-kind distinction, and the coverage
tally are narrated in [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) ("The node model"); this file
keeps only the kind map below and the grading rules under Source provenance. New data is a
node, and **every node must be sourceable** so the coverage tally stays honest.

> [!IMPORTANT]
> "Node" is the umbrella term; the per-kind names (structure, projection, circuit,
> receptor, drug, binding, target, ...) are **node kinds** and keep their names in the data
> files + code (a `structures.jsonl`, a `showReceptor`). Don't rename the collections to
> "node": that erases the distinction the graph needs.

**Node kinds and where each lives** (the emitted collection -> the sourcing-tally kind
in `meta.provenance_stats.by_kind`):
- brain region -> `structures.jsonl` -> `structures`
- projection (pathway) -> `projections.jsonl` -> `projections` (the route only), split from
  the two claims that ride the same arrow: its *transmitter* -> a projection's
  `claims.transmitter` -> `projection_transmitter` (on every pathway) and its *sign*
  (excit./inhib.) -> `claims.sign` -> `projection_sign` (on the glutamate/GABA arrows only:
  "modulatory" is the ABSENCE of a sign claim, not a third value). Each is graded by a closed
  word test over the arrow's own quotes (derived, `quotes/attestation.py`), so a sentence that
  only states the route no longer green-checks what it releases
- functional circuit -> `circuits.jsonl` -> `circuits`
- projection group -> `projection_groups.jsonl` -> `projection_groups`
- receptor classification -> `receptors.jsonl`, split into four independent graded
  sub-claims: neurotransmitter `family` -> `receptors`; mechanism `receptor_class` (GPCR/ionotropic)
  -> `receptor_class`; `sign` (excit./inhib.) -> `receptor_sign`; `synaptic` site (pre/post) ->
  `receptor_synaptic` (a receptor's `classification[attr]` each carry their own grade)
- receptor *expression region* -> a receptor's `location_sources` -> `receptor_locations`
- receptor *expression density profile* -> a receptor's `density` -> `receptor_density` (ONE
  node for the whole profile, not one per region: it is a single measurement ranking the
  receptor's regions against each other, see Expression density)
- non-receptor drug target -> `meta.drug_targets` -> `targets`
- target *tone polarity* (a direction-flipping `vesicular`/`sign`/`synaptic` flag) -> a target's `polarity_provenance` -> `target_polarity`
- target *expression region* -> a target's `location_sources` -> `target_locations`
- target *expression density profile* -> a target's `density` -> `target_density` (same shape)
- drug binding -> a drug's `bindings[]` -> `drug_bindings`
- drug binding direction -> a binding's `action` -> `drug_binding_action` (graded by the
  binding's quote sources only, a Ki attests binding never direction; `affinity_only` =
  NOSOURCE; metabolite bindings counted in this same kind)
- drug NbN label -> a drug's `nbn` -> `drug_nbn`
- drug commercial brand name -> a drug's `brands[]` -> `drug_brands` (each brand a graded
  node; `region` na/eu/fr orders them per locale, never shown; na from Stahl, eu/fr from Wikipedia)
- drug class classification -> a drug's `categories` (+ `category_provenance`) -> `drug_categories`
- drug elimination half-life (T½) -> a drug's `half_life` (+ `half_life_sources`) -> `drug_half_life`
- drug time-to-peak (Tmax) -> a drug's `tmax` (+ `tmax_sources`) -> `drug_tmax` (the other end of the same
  curve as the T½ above, separately sourced and separately missing, so a separate kind)
- drug metabolism role -> a drug's `enzymes[]` (`{enzyme, role, strength?}`) -> `drug_enzymes`
  (one node per (enzyme, role) pair; pharmacokinetics, so it has no anatomy, see Drug metabolism)
- drug metabolism **strength tier** -> that row's `claims.strength` -> `drug_enzyme_strength`
  (only on a row that states a tier; the CYP quote gate checks the isoform is named, never the
  tier, so it is graded by the same word test the pathway claims use, `quotes/attestation.py`)
- enzyme population variability -> an enzyme's `variability` -> `enzyme_variability` (ONE node
  per isoform for the whole profile, not one per population group, for the same reason a density
  profile is one node: a single published aggregation ranking the groups against each other)
- drug active metabolite -> a drug's `metabolites[]` (each `{name, drug_id?, half_life?,
  bindings?, formed_by?, sources}`) -> `drug_metabolites` (a metabolite that is itself a modeled
  drug links via `drug_id` + reuses its bindings/T½)
- metabolite-forming enzyme -> a metabolite's `formed_by[]` (`{enzyme, reaction?, sources}`) ->
  `drug_metabolite_enzyme` (one node per (parent, metabolite, enzyme); the mirror of
  `drug_enzymes`, counted per PARENT since two parents make it by two reactions)
- non-modeled-metabolite receptor binding -> a metabolite's `bindings[]` -> `drug_metabolite_bindings`
  (sourced from the metabolite's own Wikipedia pharmacology, corpus #9; graded like a drug binding,
  a separate kind so the drug Ki coverage is unperturbed; surfaces on the receptor's Interacting drugs)
- panel annotation -> `addons.jsonl` -> `addons` (an **addon node**: the kind whose record
  carries its own insertion point, for a claim no other kind has a home for. `owner_kind` +
  `owner` name the node it annotates, `slot` a `meta.addon_slots` hook, `display`/`tone` how it
  draws; authored in `tools/data_generators/addons.py`, see Addon nodes)
- Wikipedia reference -> any node's `wikipedia` -> `references` (a pointer *at* a node,
  tallied but excluded from the headline; a reference is not itself a knowledge node)

**The node sourcing contract.** Every node carries a provenance **grade** and, ideally, a
**source**. The grades, the single source shape, the sourceless case, and the tally +
headline % maths are all defined once under Source provenance; don't restate them here.

## Architecture

Principles, three-layer data flow, module graph, boot sequence and the per-file detail behind the map below: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

**Mirroring.** A symmetric L/R region is defined once on the right in `generate_data.py` and mirrored. A symmetric pathway is emitted **once** in `projections.jsonl` with `mirror: true`; consumers flip `_R` <-> `_L` on both endpoints (`js/data.js` at load, `check_data.py` before its checks); `symmetric: False` opts out. So each pathway is one node in the tally. Generated files are committed.

**Project layout.** `public/` is the **only** web-exposed dir (Caddy's `/srv` and `tools/serve.py` root there), so `docker/`, `tools/`, `.git`, `.env`, `deploy.sh`, `CLAUDE.local.md` are never reachable. Authoring + dev tooling in `tools/` (fetchers `tools/fetch/`, appliers `tools/sourcing/`, caches `tools/generated_cache/`; reference + data contract in [`tools/README.md`](tools/README.md)), deployment in `docker/`.

> [!NOTE]
> `geometry_refinements/` (own `CLAUDE.md` + `STATUS.md`) is replacing the procedural shapes with an SDF atlas (`sdf` shape type). Check its `STATUS.md` before editing `data/shapes/*` or `shapes.js` geometry.

### File map

Viewer (`public/`):

- `index.html`: page shell (import map, `#controls` panel, `.modal-overlay` popups, `#banners`, `#loading`, PWA wiring). UI-chrome colours are the `--accent*` tokens in `:root`; data/semantic colours live in `meta.json`, never here.
- PWA: `manifest.webmanifest`, `sw.js`, icons. `sw.js` always revalidates online (conditional `If-None-Match`/`If-Modified-Since`, `304` from cache); the Cache-API copy is offline-only, NOT stale-while-revalidate. Bump `CACHE` when the caching logic changes.
- SEO: `<head>` meta + JSON-LD, `robots.txt`, `sitemap.xml`, `og-image.png`. Canonical / `og:url` / `og:image` / JSON-LD URLs are hardcoded to the public domain (4 spots + `sitemap.xml`/`robots.txt`).
- `js/data.js`: `loadBrainData`, fetch + normalize + rehydrate quotes (`rehydrateQuotes`); derived render props and reverse indexes (`drugsByTarget`, `targetsByStructure`, `projectionGroupsByKey`, `addonsBySlot`). No three.js.
- `js/shapes.js`: `buildGeometry` (blob/curve/composite/sdf), Perlin `fractalNoise`, cel-shaded cortex swirl.
- `js/mesh-codec.js` + `js/baked-meshes.js`: load the author-side baked SDF meshes (`tools/bake_meshes.mjs`; see [`docs/BAKED_MESHES.md`](docs/BAKED_MESHES.md)).
- `js/arrows.js`: `ProjectionArrow`, curved tube+cone arrows (`update(fast)`, `setWidthScale`, `writeTube` in-place buffers; see Rendering).
- `js/labels.js`: CSS2D floating region names.
- `js/circuit-schedule.js` / `js/circuit-anim.js`: `scheduleCircuit` (BFS firing order) / `createCircuitAnimation` (beads + wash echo). See Circuit animation.
- `js/receptor-markers.js`: `createReceptorMarkers`, exports `buildGemCloud`. `js/drug-anim.js`: `createDrugAnimation`. `js/surface-wash.js`: `buildWashShell`.
- `js/anim-settings.js`: `animSettings` (`enabled`, `quality`, `speed`), shared by every animated module.
- `js/wiki.js`: `fetchWikiLead(url, lang)`, live Wikipedia lead.
- `js/tour.js`: `createTour`, generic three.js-free coach-mark engine; the app's step list lives in `js/main.js`.
- `js/changelog.js`: `createChangelog`, the "What's new" popup (see Versioning).
- `js/main.js`: scene, controls, `createInfoPanel`, search, legend builders, on-demand render loop.
- `app-config.js`: `window.__APP_CONFIG__`, local-dev fallback; the container serves an env-filled copy from `/gen`.
- `js/node-browser.js`: `createNodeBrowser`, the Data browser tab.
- `js/sim-model.js` / `js/simulation.js` / `js/sim-plots.js`: Simulation (beta) maths / tab / SVG plots.
- `js/url-state.js`: `createUrlState`, URL fragment registry; a view at its default writes nothing (keys in [`docs/RUNNING.md`](docs/RUNNING.md)).
- `js/prefs.js`: `loadFlag` / `saveFlag`, the only `localStorage` touch point for on/off flags.
- Single-purpose: `js/i18n.js`, `js/app-init.js`, `js/dev-banner.js`, `js/error-banner.js`, `js/theme.js`, `js/loading.js`, `version.js`, `js/render-order.js`.
- A control is searchable when it carries `data-search` in `index.html` (see Controls).

Deployment (`docker/`): `docker-compose.yml`, `Dockerfile` (xcaddy + `caddy-ratelimit`), `Caddyfile`, `entrypoint.sh`, `env.example`. Caddy pins the content-type of `.webmanifest`/`.jsonl`, and `encode` uses an explicit content-type list (a new asset type ships uncompressed until added).

Uncommitted, gitignored: `deploy.sh`, `CLAUDE.local.md` (deploy procedure, source-book locations).

## Running

> Moved to [`docs/RUNNING.md`](docs/RUNNING.md) to keep this file terse: serve `public/` over HTTP (`tools/serve.py`); `tools/shot.py` screenshots + the `?params` deep-link view keys.

## Deployment

> Moved to [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) to keep this file terse: the hardened Caddy container (non-root, read-only rootfs, dropped caps); actual deploy procedure in `CLAUDE.local.md`.

## Git hooks

> Moved to [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) to keep this file terse: repo-tracked hooks under `tools/git-hooks/`, activated per-clone; `pre-push` guards `main`, always runs `tools/check_js.py` + offers the data check.

## Data checks

> Moved to [`docs/DATA_CHECKS.md`](docs/DATA_CHECKS.md) to keep this file terse: `tools/check_data.py` (stdlib) over emitted `public/data/`: thirteen families (quote table, duplicates, reachability, TODOs, provenance grades, source quotes, connectivity, Ki coverage, drug flow consistency, changelog, innervation coverage, baked meshes, enzyme variability).

There is a **code** check too, since there is no build step to hold a linter: `tools/check_js.py` (stdlib) walks each `public/**/*.js` scope tree and fails on any identifier reference no enclosing scope binds. That is the crash `node --check` cannot see (the file parses; the browser raises only when that line runs), and it is what a missing destructured parameter looks like. It runs unskippably in `pre-push` and as `tools/tests/test_check_js.py`. It is a lint, not a parser: every ambiguity resolves toward silence, so it under-reports rather than crying wolf (its docstring lists which).

## Internationalization (i18n)

> Moved to [`docs/I18N.md`](docs/I18N.md) to keep this file terse: EN/FR, no build step; UI strings in `js/i18n.js`, data strings authored as `{en,fr}` via `_t()`/`FR` in `generate_data.py` but **emitted English-only** (a serialization-time `externalize` pass collapses each `{en,fr}` to English + deduplicates the French into `public/data/translations.fr.json`, fetched by the viewer only in French). Any new string needs both languages or the build raises.

## Analytics (umami)

> Moved to [`docs/ANALYTICS.md`](docs/ANALYTICS.md) to keep this file terse: optional umami, runtime-injected via `entrypoint.sh` -> `/gen/app-config.js`; generic client-facing names dodge content filters.

## Content-Security-Policy

> Moved to [`docs/CSP.md`](docs/CSP.md) to keep this file terse: Caddy sends CSP + security headers on every response; a new external resource (CDN, font, image host, cross-origin fetch) needs its directive extended in `docker/Caddyfile`.

## Dev / WIP banner

> Moved to [`docs/ANALYTICS.md`](docs/ANALYTICS.md) to keep this file terse: optional amber WIP banner, `DEV`/`STARTED_AT` in `app-config.js`, `js/dev-banner.js`; same runtime-injection plumbing as analytics.

## Error banners

> Moved to [`docs/BANNERS.md`](docs/BANNERS.md) to keep this file terse: failures surface as red dismissible banners (`js/error-banner.js`) so a visitor never opens the console.

## Loading overlay

> Moved to [`docs/BANNERS.md`](docs/BANNERS.md) to keep this file terse: startup `#loading` progress overlay (`js/loading.js`) + its `.loading-tagline` tease. The Sources popup is NOT shown on launch (it opens on demand only).

## Controls

> Moved to [`docs/CONTROLS.md`](docs/CONTROLS.md) to keep this file terse: the one collapsible bottom-left `#controls` panel and everything in it: the Settings pane + accordion sections, the detail-tab strip, the seven `show*()` info-panel views, selection/halo + isolate, structure-name labels, legend sections, keyboard/touch input + search, and camera focus. One data contract worth knowing here: the search box indexes the panel's **own controls** alongside the data, and a control joins that index by carrying **`data-search`** in `index.html` (named by its own visible label, optional attribute value = search aliases), so a new option is searchable with no JS edit; `tools/tests/test_search_controls.py` guards the contract.

## Theme (day / night)

Two palettes, one token block: `index.html`'s `:root` is the dark palette and `:root[data-theme="light"]` redefines **only tokens, never a rule**, so any component that reads the tokens is themed for free. `--ink` is an RGB triplet (`rgba(var(--ink), a)` for every hairline/hover/divider), so flipping the chrome is one token; semantic ink (`--sem-*`, `--tip-*`, `--addon-ink`) is split the same way. A `#fff` sitting on `var(--accent)` is the only literal text colour allowed: `tools/tests/test_theme_tokens.py` fails on any other, and on a token one theme declares and the other does not. `js/theme.js` picks the stored click, else **dark**; light is opt-in via `#toggle-theme` and `prefers-color-scheme` is deliberately **not** read (the query cannot tell "asked for light" from "never chose", so following it would hand the un-art-directed palette to everyone). The WebGL canvas cannot read tokens, so `apply()` hands `--page-bg` to `js/main.js`, which repaints `scene.background`.

Full detail: [`docs/VIEWER.md`](docs/VIEWER.md).

## Rendering

The render loop is **on-demand**: each frame runs cheap checks but renders only when a controller animated, the camera moved, or `invalidate()` fired; idle, the canvas holds its last frame.

> A new per-frame controller's `tick()` must return whether it animated, or it runs but never repaints.

- **Decoration draw order:** every additive decoration clinging to a structure (gem dots, wash shells, halos) is pinned to `DECOR_RENDER_ORDER` (`js/render-order.js`), because three.js sorts the transparent pass by bounding-sphere centre and a sparse dot cloud otherwise sorts before its region past some azimuth and vanishes.
- **Adaptive quality:** `createAdaptiveQuality` steps `animSettings.quality` (pixel ratio first, then dot/bead counts) down on slow animating frames and back up with hysteresis.
- **Spread performance:** during a continuous spread arrows update in `fast` mode (cached end offsets, deferred pick-hull rebuild) and `createArrowRetrim` re-trims precisely once the spread settles. Never reintroduce a per-frame `new TubeGeometry`: `writeTube` (`js/arrows.js`) rewrites the buffers in place.
- **Arrow width:** `createArrowWidth` keeps a constant apparent width under user zoom (explode auto-zoom divided out).

Full detail: [`docs/VIEWER.md`](docs/VIEWER.md).

## Circuit animation

Isolating a circuit plays a traveling pulse of beads along its arrows. Split in two: `js/circuit-schedule.js` (`scheduleCircuit`, BFS firing order, no three.js, testable) and `js/circuit-anim.js` (`createCircuitAnimation`, beads on `arrow.curve` + a sign-keyed wash echo on landing). It stops via an `onIsolate` watcher once the pinned-arrow set is no longer exactly the animating circuit (`circuitAnim.matches`). Full detail: [`docs/VIEWER.md`](docs/VIEWER.md).

## Circuit + projection-group panels

A Circuits row and a Projections row each open a sourced detail tab (`showCircuit` / `showProjectionGroup`, focused via `focusCircuit` / `focusProjectionGroup`). Member pathways are never stored: a circuit's are the projections with both endpoints in its set, a group's those whose `kind`/`sign` matches; groups are indexed by `${mode}:${key}`. Full detail: [`docs/VIEWER.md`](docs/VIEWER.md).

## Receptors & targets

A focusable section listing the merged `data.targets` = every receptor **plus** every non-receptor drug target from `meta.drug_targets`, grouped by neurotransmitter system (`buildTargetLegend`); focusing one shows gem-dot markers on its regions (`js/receptor-markers.js`). Panels: `showReceptor` / `showTarget`.

- Each of a receptor's four classification attributes (family / class / sign / synaptic) is its **own** graded node: a quote upgrades only the attributes listed in `RECEPTOR_CLASSIFICATION_COVERAGE` (or given their own quote in `RECEPTOR_ATTR_QUOTES`), never one it does not substantiate.
- Each expression region is its **own** graded node (`receptor_locations` / `target_locations`, shared `_location_sources` emitter). A target's direction-flipping polarity flag is its own node too (`target_polarity`).
- **Expression density** (Allen AHBA, corpus #8): **one node per profile**, not per region; **confirm-only** (trimmed to regions the owner already claims, never adding one); a gene below `DENSITY_MIN_R` (0.5, donor agreement) publishes **nothing** (an honesty gate, not a caveat). Caveat shipped in the caption: mRNA, not protein, and transcript sits in cell bodies, not terminals.

Full detail (panels, markers, density pipeline): [`docs/VIEWER.md`](docs/VIEWER.md).

## Drugs

A focusable Drugs section showing, per drug, what it does to the brain. Drugs live in `tools/data/drugs_data.jsonl` (one row per drug, read by `_load_drugs`); vocabularies (`DRUG_CATEGORY_LABELS`, `DRUG_ACTIONS`, `DRUG_EFFECT_COLORS`, `DRUG_TARGETS`, ...) are defined once in `generate_data.py` / `tools/data_generators/drugs.py`.

> [!NOTE]
> **The roster's scope is CNS-active, not psychiatric.** A drug belongs here when it acts on a modeled target, whatever specialty prescribes it; the psychiatry-shaped sources left whole CNS families out by accident, surveyed in `docs/SOURCING_GAPS.md`.

- **Sourcing:** Stahl-covered drugs are extracted **strictly from the Stahl dump** (only interactions literally stated, gaps left TODO); `recreational` and any non-Stahl drug get bindings from measured **PDSP Ki**.
- **Effect:** agonist / reuptake-inhibitor / releaser / enzyme-inhibitor / PAM -> **boost**; antagonist / inverse-agonist / NAM / blocker -> **block**; partial-agonist / modulator -> **modulate**.
- **Flow overlay = tone-setter + autoreceptor model:** only *tone-setting* bindings (reuptake/enzyme/vesicle target, presynaptic inhibitory autoreceptor) drive beads along projections (`toneSignOf`, `flowSystems` in `js/data.js`); postsynaptic receptors stay dots. The target-system -> projection-kind map `system_flow_kinds` is data. Caveat: a D2-antagonist antipsychotic reads dopaminergic-**up** (autoreceptor blockade disinhibits release).
- **The four-step sourcing pattern** used by every LLM-assisted drug pass: a fetcher builds a worklist of candidate sentences with **no verdict of its own** -> one LLM pass answers by candidate **index** (never a string) -> the applier gates + is the **sole writer** -> `tools/sourcing/recheck_quotes.py` stamps the judge. A code-extracted table path (`extraction: "code"`) needs no recheck. Passes:
  - T½ + active metabolites (Stahl PK): `fetch/fetch_pharmacokinetics.py` -> `sourcing/apply_pharmacokinetics.py`.
  - Tmax (Wikipedia + Stahl + DailyMed): `fetch/fetch_tmax.py` -> `sourcing/apply_tmax.py`.
  - Non-modeled-metabolite bindings (Wikipedia + PDSP): `fetch/fetch_metabolite_bindings.py` -> `sourcing/apply_metabolite_bindings.py`.
  - Binding directions (Wikipedia prose; table `Action` column via `fetch/fetch_binding_direction_tables.py` + `--tables`, code path): `fetch/fetch_binding_directions.py` -> `sourcing/apply_binding_directions.py`.
  - CYP roles (Stahl + Wikipedia): `fetch/fetch_cyp_worklist.py` -> `sourcing/apply_cyp_sources.py` (see Drug metabolism).
- **Shared metabolite** (desipramine from imipramine + lofepramine): its bindings are written as an **identical** list under each parent, deduped by folded name in the tally + viewer; `check_data` fails if the copies diverge.
- A hand-recorded weak Ki (PDSP drops >= 10 uM) carries `ki.source.curated: true` so `fetch_ki.py --apply` never strips it. GtoPdb (corpus #11) fills Ki/direction where PDSP has no assay (`apply_gtopdb_ki.py`, confirm-only, PDSP-first).
- 5 drugs stay unbound as genuinely non-receptor agents (lithium, disulfiram, l-methylfolate, triiodothyronine, caprylidene).

Full detail (animation, panel, PK + metabolite + binding-direction pipelines, Ki chips): [`docs/DRUGS.md`](docs/DRUGS.md).

## Drug metabolism

Which enzymes clear a drug or have their activity changed by it (`drug_enzymes`: enzyme + role + ordinal strength). **Pharmacokinetics, so it has no anatomy**: nothing here ever lights the 3D scene.

- Rows come from the CYP four-step pass (Stahl wins a pair both corpora state) into committed caches, never authored in `drugs_data.jsonl`; metabolite-forming enzymes are hand-curated in `tools/data_generators/quotes/metabolism.py`.
- **Drug -> drug edges are derived, never stored** (`pkInteractionsOf` in `js/data.js`); every string stays conditional ("could raise"), a flag to check with a prescriber, **never a contraindication**, and a missing row is not a safety claim.
- **Population variability** (corpus #13 PharmFreq) covers only **5 of 18 isoforms**; an absent profile (CYP3A4, CYP1A2) is a gap in the corpus, not a claim that it does not vary.

Full detail (vocabularies, gates, viewer sections, variability bars): [`docs/DRUGS.md`](docs/DRUGS.md).

## Simulation (beta)

Receptor occupancy asked from both ends (forward: what a combination engages; backward: NNLS over the same matrix for which drugs to add). The only place the app **computes** a claim rather than reporting a sourced one.

- It computes an **engagement index, never a percentage occupied** (a real C needs PK the dataset lacks), so potencies **add, with no competition**.
- An `affinity_only` binding is drawn as a hatched grey "binds, effect unknown" band, **not signed**, and stays out of the net.
- Every shortcut is listed once in the `js/sim-model.js` header; the tab's warnings box renders that list.

Full detail (tab layout, plots, URL keys): [`docs/DRUGS.md`](docs/DRUGS.md).

## Addon nodes (panel annotations)

An **addon** is the node kind for a claim with no implied home (a caveat over a section, a flag on one drug), and it **carries its own insertion point** (`owner_kind` + `owner` + `slot`), so adding one is a data edit, never a viewer edit. Authored in `tools/data_generators/addons.py` with closed vocabularies `ADDON_SLOTS` / `ADDON_SECTIONS` / `ADDON_DISPLAYS` / `ADDON_TONES` emitted into meta.

- **A slot exists only if `js/main.js` calls `appendAddons(host, ownerKind, ownerId, slot)` for it**, else its node is silently swallowed; the generator, `check_data.py` and `test_generate.AddonTest` enforce this. Slots today: `drug.top`, `drug.metabolism`, `receptor.top`, `target.top`, `structure.top` (anchors the hemisphere-less base), `section.projections`.
- The `drug.metabolism` slot has a derived fallback (`autoModulation` -> `derivedAutoModulation`, conditional wording, no pill) that fires **only when the slot holds no authored addon**.

Full detail: [`docs/VIEWER.md`](docs/VIEWER.md).

## Images

Molecule images are **vendored** same-origin (`tools/fetch/fetch_molecules.py` -> `public/data/molecules/<id>.svg`, CSP `img-src 'self'`); structure + circuit images are **hot-linked** from Wikimedia (only the url is stored, via `tools/fetch/fetch_structure_images.py`), which needs the `img-src https://upload.wikimedia.org` CSP allowance. Full detail (resolver, gallery, lightbox): [`docs/VIEWER.md`](docs/VIEWER.md).

## Source provenance

Every node's source carries a **grade** (data, rendered as a pill on the row that carries the claim, never a separate "Sources" block). Ladder (`PROVENANCE_LEVELS`): `llm` grey **?** (from memory, unchecked) < `sourced` yellow **~** (given the document, not quote-checked) < `verified` green **✓** (quote programmatically found on the page + a separate LLM judge agreed). No source = red **✕** `NOSOURCE` (not a stored grade). `uncertain` orange **⚠** is a *display* grade taken by a node with non-empty `uncertainty[]` bullets; it buckets as **backed**.

- **One source shape:** quote-level `{corpus, page, quote, provenance}` against a `SOURCE_CORPORA` corpus (emitted as `meta.source_corpora`); `provenance` defaults `llm`. Upgrading a grade is a data edit.
- **No LLM-picked quote ships unjudged by Sonnet or better** (`sonnet`/`opus`, never `haiku`): `check_data.py` family 5 fails on a citation whose pipeline has `extract_llm` and no `judge_llm`. Any extraction pass that writes no `llm` stamp must be followed by `tools/sourcing/recheck_quotes.py`. A quote **code** copied from a table (`extraction: "code"`, or a `machine` corpus) needs no judge.
- Grade, `pipeline` (chain of custody, `QUOTE_PIPELINES`) and verdicts ride the **citation**, not the quote node: one sentence can back two claims by two routes (citation sites, `tools/sourcing/citation_site.py`).
- **Uncertainty flags are derived, never authored per site** (`apply_binding_uncertainty` / `apply_projection_uncertainty`); every bullet is itself a sourced claim from the closed `UNCERTAINTY_REASONS` vocabulary. The exception is `contradicted`, hand-curated in `tools/data_generators/quotes/contradictions.py`.
- **Tally:** a bare `llm` grade buckets as **missing** (no document), like a sourceless node. The live figures live in the README `SOURCING_STATS` block + the Sources popup, never repeated here.
- **Page files are author-side** (`CLAUDE.local.md`), so the quote gate is skipped + warned on a clone, except #13 PharmFreq (tables committed, gated by re-derivation).
- Descriptions are not nodes: drugs/structures/targets fetch the live Wikipedia lead at runtime (shown as a green source link, not a stored grade).

Corpora (`SOURCE_CORPORA`):
- #1 `stahl`: drug bindings, NbN, class, brands (na), T½/metabolites, CYP roles.
- #2 `kandel` / #6 `nieuwenhuys`: pathways + region anatomy.
- #3 `stahl_essential`: receptor/target mechanism classification. #4 `carlat`: drug cross-checks.
- #5 `pdsp_ki`: measured binding Ki (a CSV row id, not a page).
- #7 `gtopdb`: receptor "Found in" regions (with assay species). #8 `allen_ahba`: target + residual receptor regions (PACall, no judge) and expression density.
- #9 `wikipedia_pharm`: fallback Ki, binding directions, metabolite bindings, CYP roles, Tmax. #10 `wikipedia_fr`: eu/fr brands.
- #11 `gtopdb_ki`: Ki/direction where PDSP has no assay. #12 `gtopdb_class`: target type + GPCR sign (mapped from transduction).
- #13 `pharmfreq`: enzyme metabolizer-phenotype variability. #14 `dailymed`: US label Tmax.

Full detail (sourcing model, citation sites, book heading trails, the four uncertainty flags, per-corpus mechanics, the "% sourced" maths): [`docs/PROVENANCE.md`](docs/PROVENANCE.md).

## Changing the data

The step-by-step runbook (per node-kind authoring fields, the regenerate/check/fetch
sequence, and the author-side "refresh external data" recipe) lives in
[`tools/README.md`](tools/README.md). The invariants that outlive any recipe: edit the
source of truth (`generate_data.py`, or `tools/data/drugs_data.jsonl` for drugs), never the
emitted `public/data/`; every new display string needs its `FR`/`{en,fr}` translation or
the build raises; commit the generator change + regenerated artifacts together; keep drug
extraction strictly dump-sourced. The legend rebuilds from the data at runtime.

## Versioning

The version is a single string in `version.js` (`window.__APP_VERSION__`), shown in the
panel header + the loading overlay's title (`js/main.js` fills every `[data-app-version]`
slot, so a new display spot is markup-only) + the WIP banner (which reads the global
directly). Follow [semver](https://semver.org/);
to release, bump `version.js` **and write that version's changelog** (below). It is
intentionally not derived from git (the site deploys as plain files).

> [!IMPORTANT]
> **Every code change ships a version bump: patch at the very least.** A fix, a
> refactor, a doc-only touch to shipped code: bump the patch and write the changelog
> entry for it. The version is what a visitor's browser compares against to decide
> whether to show them anything new, so an unbumped change is invisible to them and
> indistinguishable from the previous build. Reserve minor/major for what semver says.

### Changelog ("What's new")

One file per version: `docs/changelog/<major.minor.patch>/changelog.md`, titled `# <version> (YYYY-MM-DD)`, then `## <Category>` sections (closed `CATEGORIES` in `tools/data_generators/changelog.py`) of `- bullet (sha, sha)` lines, each with a required indented `fr:` line. `generate_data.py` emits them to `public/data/changelog.json`, shown by `js/changelog.js`. `check_data.py` family 9 fails if `version.js` has no changelog directory. Full detail (popup, seen-tracking, sha links): [`docs/VIEWER.md`](docs/VIEWER.md).

## Conventions

- No JS build step or package manager: three.js is vendored same-origin under
  `public/vendor/three` and loaded via an import map in `index.html`. Keep the import-map
  entries pointing at the vendored files; bump the vendored copy as a unit.
- `generate_data.py` is stdlib-only so it runs offline.
- Don't duplicate the anatomy *or its presentation maps*: positions/colors/shape params, the
  `kind -> colour` and `group -> heading` maps live only in `generate_data.py` (the latter
  emitted into `meta.json`, read by the viewer).
- **Structure granularity is demand-driven.** The modeled brain sits at a deliberately
  uneven granularity: fine where the data forces it (the monoamine source nuclei; the
  brainstem cut into midbrain/pons/medulla because the pathways name the pons), coarse where
  nothing yet forces it (each lobe is one piece, the thalamus one nucleus). Cut a region into
  finer sub-structures only when the receptor/projection/drug data distinguishes its sub-parts
  AND can source that distinction, or the LLM-assisted dataset is pushed to invent anatomy it
  cannot source. The frontal-lobe -> prefrontal-cortex split is the next cut this would justify.
