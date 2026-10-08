# Architecture

A bird's-eye view of how neurarium is put together, for contributors. It explains
the **shape of the system and the reasoning behind it**; the per-file detail sits in
the last section, File map (detail).

> [!NOTE]
> Four docs, four jobs, no overlap:
> - **[README.md](../README.md)**: what neurarium is, how to run it, the project layout table.
> - **This file**: the architecture, the data flow, the module graph, the boot
>   sequence, the extension points (the "why" and the "shape"), plus the per-file detail CLAUDE.md's file map points to. Otherwise bird's-eye, no
>   field-level detail; when it would name a field or control it points at CLAUDE.md.
> - **[CLAUDE.md](../CLAUDE.md)**: a terse map of the viewer/runtime (one line per module /
>   control / rule), not a manual: it names the symbol so you can find the code.
> - **[tools/README.md](../tools/README.md)**: the authoring how-to (Changing the data), the
>   per-tool reference, and the emitted-data field contract.

This project was built with the help of [Claude Code](https://claude.com/claude-code).

## Guiding principles

1. **Data is separate from rendering, on purpose.** The anatomy (which regions
   exist, where they sit, how they connect) is plain data; the viewer is code that
   draws whatever data it is handed. You can add regions and pathways without
   touching the renderer, and the data could drive a different engine entirely.
2. **No build step.** No bundler, no `node_modules`, no transpile. The browser
   loads hand-written ES modules and vendored three.js via an import map. What is
   in `public/` is exactly what ships. This keeps the attack surface small and the
   project trivially serveable as static files.
3. **Single source of truth.** Each fact lives in exactly one place. The anatomy
   *and its presentation maps* (region colours, the projection-kind palette, the
   group→legend-heading map, the per-structure Wikipedia links) are all defined
   once in the generator (`tools/generate_data.py` + its `tools/data_generators/`
   package); the presentation maps are emitted into the data so the viewer never
   hardcodes a second copy.
4. **Self-describing data.** `meta.json` carries the colour and heading maps, so
   a consumer (this viewer, or a port to another language) needs no out-of-band
   palette to render it correctly.
5. **Fail loud at generation time.** The generator raises on an unmapped
   projection kind, an unknown circuit structure, or a Wikipedia entry for a
   non-existent structure, so bad data never reaches the browser silently.

## The node model

The organizing concept of the whole dataset is the **node**: *a node is any
sourceable datum*, one atom of knowledge about the brain that could, in principle,
be attributed to a source. The dataset is a **graph of nodes**, and a detail panel
is simply a view of one node plus every node linked to it (a receptor node links to
the region nodes that express it and the drug nodes that act on it, and so on).

**Umbrella vs. kind.** "Node" is the umbrella term; each node has a **kind** that
keeps its own name in the data and code (a `structures.jsonl`, a `showReceptor`):
region anatomy, projection, circuit, projection group, receptor + its expression
regions, drug target + its expression regions, drug binding, drug NbN, drug class,
Wikipedia reference. The full kind → collection → tally-key mapping is in CLAUDE.md
("Nodes"); it is not repeated here.

**Every node is sourceable.** Each carries a provenance **grade** (`llm` < `sourced`
< `verified`) and, ideally, a **source**: one quote-level `{corpus, page, quote,
provenance}` pointing at a page of a real corpus (`SOURCE_CORPORA`, e.g. Stahl,
Kandel, the PDSP Ki database). The grade is *data*, and the viewer renders it as a
coloured **pill** on the row/heading that carries the claim: green `✓` verified,
yellow `~` sourced, grey `?` llm, orange `NOSOURCE` when there is no source. A node's
grade is never simply absent from a panel.

**The coverage tally.** `_provenance_stats` (generator) reduces every node to its
single strongest grade and buckets it into **verified** / **sourced** / **missing**,
where *missing* is "no source document at all" (a bare `llm` grade counts as missing:
an LLM asserting something from memory is precisely *no document*). It emits
`meta.provenance_stats`; the About panel and the README headline read it, so the
"% sourced" figure is always a real programmatic count of the shipped data, never
hand-typed. `check_data.py` re-derives the same numbers as a self-consistency gate.
Full mechanics live in CLAUDE.md ("Nodes") + [`PROVENANCE.md`](PROVENANCE.md).

## The three layers

```
   AUTHORING                 ARTIFACTS (committed)              VIEWER (browser)
 ┌───────────────┐         ┌───────────────────────────┐         ┌──────────────────┐
 │ generate_     │  emits  │ public/data/meta.json      │  fetch  │ public/js/*.js   │
 │ data.py       │ ──────► │ structures.jsonl           │ ──────► │ + index.html     │
 │ (stdlib only) │         │ projections / circuits     │         │ (three.js)       │
 │               │         │ shapes/*.json (geometry)   │         │                  │
 └───────────────┘         └───────────────────────────┘         └──────────────────┘
   one definition            plain JSONL + JSON,                renders, no anatomy
   per region/pathway        the data contract                  knowledge of its own
```

The boundary between the middle and right columns is the **data contract**: as
long as the viewer keeps reading the same record shapes, the generator can evolve
freely, and as long as the generator keeps emitting them, the viewer can be
rewritten (or replaced) freely.

### Authoring: `tools/generate_data.py`

Standard-library-only Python. Now a thin orchestrator: it defines the build/emit
logic and imports the data from the `tools/data_generators/` package (`i18n.py`,
`provenance.py`, `drugs.py`, `geometry.py`, `presentation.py`, `connectivity.py`,
and the `quotes/`, `receptors/`, `regions/` subpackages; see tools/README.md for the
per-module purpose). It defines every region once (right-side only for
symmetric pairs; the generator mirrors it to the left), every projection
(bilateral by default, mirrored unless flagged one-sided), every named circuit,
and the registries (`WIKIPEDIA`, `KANDEL_QUOTES`, `PROJECTION_COLORS`, `GROUP_LABELS`).
Running it regenerates `public/data/` (`meta.json` + the `*.jsonl` files +
`shapes/`). The generated files are committed so the static site can fetch them
directly.

### Artifacts: the data contract

The dataset under `public/data/` is split by record type for clarity: the file a
record lives in encodes its type, so there is no `type` field on the lines.
`meta.json` is a single JSON object of presentation maps (colours, labels, the
merged binding-target map) that makes the dataset self-describing; the rest are
JSONL, one node per line, one file per kind: `structures.jsonl`, `projections.jsonl`,
`circuits.jsonl`, `projection_groups.jsonl`, `receptors.jsonl`, `drugs.jsonl` (drugs
authored in `tools/data/drugs_data.jsonl`, not the generator), plus vendored
`molecules/<id>.svg` diagrams. The emitted data is **English-only**: every display
string is serialized as its English text and the French is deduplicated into one side
table, `translations.fr.json`, which the viewer fetches only in French (see
docs/I18N.md). Every claim carries its own quote-level source; there is no node-level
catch-all `sources` block. The exact field list of each file is in tools/README.md
("Data contract"), not duplicated here.

`public/data/shapes/<name>.json` is one geometry payload per distinct *form* (symmetric
pairs share a single right-side file; the left member reflects it). Shape types:
`blob` (a noise-deformed ellipsoid), `curve` (a tube swept along a spline),
`composite` (several sub-shapes merged), and `sdf` (an authored signed-distance
atlas meshed via marching cubes, replacing the procedural forms one structure at a
time; see the `geometry_refinements/` effort in CLAUDE.md).

### Viewer: `public/`

Vanilla ES modules over three.js. `index.html` is the shell; the JS modules build
and drive the scene. See the module graph below.

## Module graph

Solid arrows are ES-module `import`s; `index.html` loads the classic scripts and
the `main.js` entry point.

```
                         index.html
                             │ (script tags, in order)
   ┌─────────────────────────┼───────────────────────────────────┐
   │                         │                                    │
 app-config.js          error-banner.js / dev-banner.js      main.js  (module entry)
 (window.__APP_CONFIG__)  (classic; #banners stack)              │
   │                                                             │ imports
 app-init.js                                                     ▼
 (injects umami)             data.js ──fetch──► data/*.{json,jsonl} + data/shapes/*.json
                              (no three.js; returns normalized {structures,
                               projections, circuits, receptors, drugs, byId, meta})
                                  ▲
                                  │ loadBrainData()
                                  │
   main.js ── imports ──►  shapes.js   (buildStructureMesh: blob/curve/composite/sdf,
                                        cel-shaded cortex swirl, jigsaw clip)
            ── imports ──►  arrows.js   (buildArrows: curved tube+cone per
                                        projection, colour from projection.color)
            ── imports ──►  labels.js   (createLabels: CSS2D floating names)
            ── imports ──►  circuit-anim.js / circuit-schedule.js (traveling pulse
                                        + a wash-of-light echo on each target node)
            ── imports ──►  receptor-markers.js (createReceptorMarkers: glowing
                                        surface dots for a focused receptor;
                                        exports buildGemCloud, reused by drug-anim)
            ── imports ──►  drug-anim.js (createDrugAnimation: effect-coloured
                                        pulsing gem dots + a surface wash per region)
            ── imports ──►  three + OrbitControls (vendored)

   circuit-anim.js, drug-anim.js ── import ──►  surface-wash.js (buildWashShell: the
                                        shared shader "wash of light" over a surface)
```

`data.js`, `shapes.js`, and `arrows.js` have **no dependency on each other**; they
meet only in `main.js`, which orchestrates everything. `data.js` deliberately
knows nothing about three.js (it is pure fetch + normalize), so the data layer
could be reused headless.

## Boot sequence

1. `index.html` parses. The classic scripts run first, in order:
   `app-config.js` (sets `window.__APP_CONFIG__`), `app-init.js` (injects the
   umami tag if configured), `version.js` (sets `window.__APP_VERSION__`), then
   `error-banner.js` and `dev-banner.js` (install the `#banners` machinery before
   anything that might fail).
2. A small inline gate injects the vendored eruda debug console only on `?debug=1`.
3. The import map points `three` / `three/addons/` at the vendored copy.
4. `js/main.js` (module) runs: sets up scene/camera/renderer/lights/OrbitControls,
   then `await loadBrainData()`.
5. `loadBrainData()` fetches the per-type data files (`meta.json` +
   `structures`/`projections`/`circuits`/`receptors`/`drugs.jsonl`) in parallel,
   reads the
   `meta` maps, resolves each projection's `color` from its kind, expands each
   receptor's location bases to concrete structure ids, resolves each drug's
   bindings (target name, net effect colour, the regions each binding lights), and
   fetches every
   referenced shape file in parallel.
6. `main.js` builds the meshes (`buildStructureMesh`), the arrows (`buildArrows`),
   and the labels (`createLabels`), wires the controllers (below), and starts the
   render loop.
7. The intro animation plays: regions start exploded and glide back together into
   the assembled brain (skipped when `?explode=` is pinned, e.g. screenshots).

## Rendering and interaction (inside `main.js`)

`main.js` is the only stateful orchestrator. Beyond scene setup and the render
loop, it owns a few small controllers, each the single source of truth for one
concern:

- **Selection** (`createSelection`): which structures/arrows are haloed or
  isolated, and the resulting per-mesh opacity (so the Transparency slider and the
  isolate-dimming compose into one value). Handles structure halos, arrow halos,
  legend isolate, circuits, and per-neurotransmitter focus.
- **Info panel** (`createInfoPanel`): the main panel's Details tab showing a
  *connection* view (a clicked arrow), a *structure* view (a clicked region: name,
  group, Wikipedia link, and a clickable list of its pathways), a *receptor*
  view (a clicked Receptors legend row: its classification + where it is
  expressed), or a *drug* view (a clicked Drugs legend row: its class, NbN
  nomenclature, the bindings it acts on, and the Stahl source).
- **Receptor markers** (`receptor-markers.js`): glowing surface dots over the
  regions expressing a focused receptor; dropped when the focus changes, watched
  off the selection state like the circuit pulse.
- **Drug animation** (`drug-anim.js`): effect-coloured gem dots (boost/block/
  modulate) pulsing over the regions a focused drug's targets sit in, reusing the
  receptor `buildGemCloud`, with a looping **surface wash** under them in the same
  effect colour; watched off the selection state the same way. On top of this, a
  drug focus also rides **flowing beads** along the projections of its target
  transmitter system(s) (the **by-mechanism flow** overlay): `main.js` resolves the
  drug's `flowKinds` (via the `meta.system_flow_kinds` map), pins those arrows and
  replays the **shared circuit pulse** (`circuit-anim.js`) over them, so the drug
  and circuit animations merge instead of duplicating. A drug with no mapped
  pathway pins nothing and just shows the dots + wash.
- **Surface wash** (`surface-wash.js`): the shared shader "wash of light" that
  spreads a ripple across a structure's surface from an origin point (a thin shell
  reusing the mesh geometry, additive, no added triangles). Drives the circuit node
  echo (seeded at the bead's impact point) and the per-drug region glow.
- **Camera focus** (`createCameraFocus`): smooth tweens for reset / double-click /
  search framing, advanced once per frame and cancelled the moment the user grabs
  the controls.
- **Labels** (`labels.js`): floating CSS2D names, shown on hover or all at once.

Picks (click / tap / double-click / search) are routed through small
`selectStructure` / `selectConnection` helpers so every entry point produces the
same halo + panel + label behaviour without duplication.

## Extending the system

The detailed recipes (with the exact fields and gotchas) are in CLAUDE.md under
"Changing the data"; the short version:

- **A new region or pathway**: edit `PAIRED` / `MIDLINE` / `PROJECTIONS` in
  `generate_data.py`, run `python tools/generate_data.py`, commit the generator
  change and the regenerated artifacts together.
- **A new projection kind / colour**: add it to `PROJECTION_COLORS` (the generator
  raises if a projection uses an unmapped kind); it flows into the data's `meta`
  record and the legend automatically.
- **A new circuit**: append to `CIRCUITS` with base structure ids.
- **A new receptor**: append to `RECEPTORS` (neurotransmitter, class, sign,
  synaptic site, location base ids or `"ALL"`); it shows up in the Receptors
  legend section automatically.
- **A new drug**: add an entry to `tools/data/drugs_data.jsonl` (categories + bindings,
  each binding a `target` + `action` from the drug vocabularies in
  `generate_data.py`); it shows up in the Drugs legend section automatically. Run
  `python tools/fetch/fetch_molecules.py` to also pull its molecular-structure SVG.
- **A Wikipedia link**: add the region's base id + URL to the `WIKIPEDIA` registry.

The legend, colours, and headings are all derived from the data at runtime, so
none of these need a matching change in the viewer.

## Deployment (in brief)

The site is static, so deployment is just "serve `public/`". In production a
hardened Caddy container (non-root, read-only rootfs, dropped capabilities,
resource limits, strict Content-Security-Policy) serves it behind a TLS-
terminating reverse proxy. Runtime config (analytics, the WIP banner) is injected
at container start by rendering `app-config.js` from environment variables, since
the rootfs is read-only and there is no build step. Full details are in CLAUDE.md
under "Deployment", "Analytics", "Content-Security-Policy", and "Dev / WIP banner".

## File map (detail)

The per-file detail behind CLAUDE.md's one-line file map. Section names cited as "see X" are CLAUDE.md sections (or the `docs/*.md` file CLAUDE.md points them to).

**The `tools/` script reference and the emitted-data field contract (`public/data/` `.jsonl` / `meta.json` / `shapes/*.json` fields) live in [`tools/README.md`](../tools/README.md)** (Tool reference + Data contract). The generator layout is under Authoring above (plus the `genes` and `quote_table` modules of `tools/data_generators/`). Each geometry form is one `data/shapes/<name>.json` (`blob`/`curve`/`composite`, L/R pairs share one right-side file via `mirror:true`). The author-side scripts are grouped: external-data fetchers under `tools/fetch/`, provenance appliers under `tools/sourcing/`; their generated caches in `tools/generated_cache/`. Run them from the repo root (`python tools/fetch/<x>.py`).

> [!NOTE]
> An ongoing effort under `geometry_refinements/` (its own `CLAUDE.md` +
> `STATUS.md`, auto-loaded only when working there) is replacing the procedural
> blob/curve/composite shapes with a self-authored SDF atlas, one structure at a time. It
> adds an `sdf` shape type. Before editing `data/shapes/*` or `shapes.js`
> geometry, check its `STATUS.md` so two sessions don't collide.

Viewer (`public/`):

- `index.html`: page shell: loads three.js (vendored import map) and, on `?debug=1`, vendored
  eruda. Holds the `#controls` panel, the popups (`#shortcuts-modal`, `#legend-modal`,
  `#sourcing-modal`, `#about-modal`, `#image-lightbox`, all `.modal-overlay`), the `#banners`
  stack, the startup `#loading` overlay. An author **byline** ("by Olivier Cornelis", linking
  olicorne.org per locale via the shared `common.byline` i18n key) sits both in `#loading`
  (`.loading-byline`) and inline in the panel header, right of the `neurarium` title
  (`.panel-byline` in `#controls-header`, over an invisible full-row `.collapse-hit` button so a
  row click still toggles the panel while the byline link stays clickable). UI-chrome accent = the `--accent*` palette in `:root`;
  data/semantic colours live in `meta.json`, never here. Also wires the PWA: links
  `manifest.webmanifest` + registers `sw.js`.
- PWA (installable + offline): `manifest.webmanifest` (name/icons/`theme_color`), `sw.js`
  (service worker that ALWAYS contacts the server when online, so a visitor never renders
  outdated data or a stale ES module; the Cache-API copy is an offline-only fallback, NOT
  stale-while-revalidate. One strategy for every same-origin asset (data, code, shell):
  **explicit conditional revalidation** (`revalidate()` forwards the cached copy's
  `ETag`/`Last-Modified` as `If-None-Match`/`If-Modified-Since` so an unchanged file returns a
  bodyless `304` served from cache, a changed one a fresh `200`: always fresh, cheap when
  unchanged, no version key to forget; `cache:"no-store"` on the fetch so OUR validator is the
  only one in play, since a plain SW fetch re-downloads the full body). Revalidating code is
  what keeps a stale ES module from running (each file is confirmed current before use) *without*
  re-downloading ~1 MB every load, which is what made a phone reload crawl. Bump `CACHE` when the
  caching logic changes; `activate()` prunes older caches), and
  `favicon.svg` + `icon-192/512.png` +
  `apple-touch-icon.png` (a **placeholder** node-cluster glyph, to be replaced by the designed
  favicon). Caddy pins the content-type of `.webmanifest` and `.jsonl` (Go's mime table lacks
  both, and `nosniff` then stops the browser guessing; `tools/serve.py` mirrors the `.jsonl` one).
- SEO/social: static `<head>` meta (description, Open Graph, Twitter card, JSON-LD
  `WebApplication`) + a `<noscript>` text fallback in `index.html`; `robots.txt` +
  `sitemap.xml` + `og-image.png` (a copy of `docs/images/screenshot.png`) in `public/`.
  All English (a crawler reads the raw HTML before i18n; no prerender step) and the
  canonical / `og:url` / `og:image` / JSON-LD URLs are **hardcoded to the public domain**
  (update all four spots + `sitemap.xml`/`robots.txt` if it ever changes).
- `js/data.js`: fetches `meta.json` + the `.jsonl` (incl. `quotes.jsonl`) + shape files, rehydrates
  each `{quote_id, provenance}` source from the deduplicated `quotes.jsonl` excerpt table
  (`rehydrateQuotes`, mirror of the generator's externalize; see Source provenance); returns a normalized
  `{structures, projections, circuits, projectionGroups, projectionGroupsByKey, receptors,
  targets, drugs, drugsByTarget, addons, addonsBySlot, byId, meta}`. Resolves each node's localized fields + derived
  render props (projection `color`/`sign`, receptor labels + `structureIds`, per-binding
  `targetName`/`actionLabel`/`effect`/`effectColor`/`structureIds`/`flowKind` + the drug's union
  `structureIds`/`flowKinds`/`focusable`/search `keywords`); builds the merged `targets` browse
  list, the `drugsByTarget` + `targetsByStructure` reverse indexes (the latter reads a receptor's
  "Found in" from the region's end, so a structure panel can list what is expressed there carrying
  the very same graded node), and `projectionGroupsByKey` (`${mode}:${key}`).
- `js/shapes.js`: `buildGeometry()` dispatches on type to `buildBlobGeometry`/
  `buildCurveGeometry`/`buildCompositeGeometry`; `mirrorGeometryX` for the left member.
  Self-contained Perlin `fractalNoise` (fBm/ridged/domain-warp). Cortical lobes are cel-shaded
  (`MeshToonMaterial`) domes with a shader-drawn swirl (`injectCortexSwirl`/`CORTEX_SWIRL`, pure
  colour, no relief). `buildBlobGeometry` honours `clip_planes` when `JIGSAW_CLIP.enabled`.
- `js/mesh-codec.js` + `js/baked-meshes.js`: the SDF geometry is meshed author-side
  (`tools/bake_meshes.mjs` -> `public/data/meshes/`) and downloaded rather than rebuilt on every
  load; the runtime mesher stays as a `console.info`-logged fallback for any shape the bake does
  not cover. Format, measurements + the staleness gates: [`docs/BAKED_MESHES.md`](BAKED_MESHES.md).
- `js/arrows.js`: curved tube+cone arrows; colour from `projection.color`, recolourable via
  `setColor`; `tentative` -> dotted. Exposes `arrow.curve`. Each end attaches to the surface point
  *nearest the other end* (`surfaceToward`, a nearest-vertex scan) so the tip lands on real mass
  even for a concave region (the C-shaped caudate). `update(fast)` re-fits; `fast` reuses the
  cached offset + defers the pick-hull rebuild (see Spread performance), `ensurePickGeometry()`
  rebuilds it on demand. `setWidthScale(s)` rebuilds only the shaft/cone width from the cached arc
  (see Arrow width). `setOpacity` clamps to `ARROW_MAX_OPACITY` (0.8), so arrows are always a
  translucent overlay.
- `js/labels.js`: floating name labels (CSS2DRenderer): one hidden label per region, shown on
  hover / show-all / when pinned (`setPinned`). Reads the hemisphere-stripped `base_name` (the
  side is obvious from position).
- `js/circuit-schedule.js`: `scheduleCircuit()` BFS firing order for the circuit
  pulse (no three.js, testable; see Circuit animation).
- `js/circuit-anim.js`: `createCircuitAnimation` renders that schedule as beads
  riding `arrow.curve` + a wash echo on landing (see Circuit animation).
- `js/receptor-markers.js`: `createReceptorMarkers`: gem-dot expression clouds for
  a focused receptor/target. Exports `buildGemCloud` + `GEM_DOT_SIZE` (reused by
  the drug animation). See Receptors & targets.
- `js/drug-anim.js`: `createDrugAnimation`: per-drug effect-coloured gem dots +
  surface wash; `matches`. Flow overlay reuses `circuit-anim.js`. See Drugs.
- `js/surface-wash.js`: shared `buildWashShell` + `washStrength` "wash of light"
  primitive (used by circuit echo + drug glow).
- `js/anim-settings.js`: `animSettings`, the single source of truth for decorative-animation
  state (read by every animated module): `enabled` (the **Animations** toggle) + `quality` (0..1
  adaptive) + `speed` (persisted 0.25..4 speed multiplier, the **Animation speed** slider). See
  Settings & toggles + Rendering (adaptive quality).
- `js/wiki.js`: `fetchWikiLead(url, lang)` runtime fetch of a Wikipedia lead; locale wins via
  langlinks, English fallback; cached; best-effort (failure -> null).
- `js/tour.js`: `createTour({steps, labels, onEnd, seenKey})`, a generic, three.js-free coach-mark
  engine (spotlight ring / caption bubble, viewport-aware placement that never covers the target or
  the 3D scene, resize/scroll reposition, localStorage "seen" gate). The bubble is **drag-repositionable**
  (pointer-drag past a small jitter threshold; a dragged bubble opts out of auto-placement for the step)
  and layered **above any `veil`** so it is never itself dimmed. There is **no Next button** (only
  Back + Skip + Esc): the user advances by acting on the step, so they cannot fast-forward past a
  hands-on demo. A step is passive/caption (a "click to continue" cue in the bubble, and a click on the
  dim backdrop, advance it) or **`interactive`** (the blocker gets a clip-path click-through hole so the
  user's real tap reaches the highlighted control; the cue is hidden and every off-target click + the
  forward keys are inert, so the only way on is the real tap). An interactive step advances on that tap,
  or with **`stayAfterTap`** stays put and steps its spotlight aside so the live demo it fired is
  watchable (the cue then returns to move on). A step's `target` may be one element or an **array** (a group highlight: the ring spans
  their union, e.g. the four browse sections). Steps glide between positions (snap only on the first
  step + during an active scroll). The app-specific step list is built in `js/main.js`. It opens with
  how to *read* the app (Legend, then Sources & provenance, then the **Data browser** those grades
  count, whose reading mode motivates the two view toggles: bring the 3D back, fold the panel away),
  then walks the data; the data demos
  are hands-on and follow the data graph (focus a **drug** (olanzapine), read its pharmacodynamics then
  its pharmacokinetics (**Metabolism**, then open the collapsed **Drug interactions**), follow one of its
  bindings to a **receptor** (H1), then visit a **structure** (hippocampus) and a **projection system**
  (dopamine, a static group, not a circuit); each opened by tapping the highlighted row via its
  `data-tour-id`, each panel section reached via its `data-tour-sec`),
  each step's `before()` setting the scene (spread, open/collapse a section, reset a prior demo).
  Auto-runs once on a first visit (after the intro settles), forced every load with `?tour=1`, and
  replayed from the About popup's "See the tutorial" button (`#about-tour`).
- `js/changelog.js`: `createChangelog()`, the "What's new" popup (`#changelog-modal`). See
  Versioning / Changelog.
- `js/main.js`: scene/camera/renderer/lights/OrbitControls; explode + transparency; the intro,
  auto-rotate, hover/pick raycasting; `createInfoPanel`; search; the legend builders
  (`buildLegend`/`buildLegendKey`/`buildTargetLegend`/`buildEnzymeLegend`/`buildDrugLegend`); the
  on-demand render loop.
- `app-config.js`: `window.__APP_CONFIG__`. This committed copy is the local-dev
  fallback (feature fields empty). In the container `entrypoint.sh` renders an
  env-filled copy into `/gen` and Caddy serves that. Generic name (not
  "analytics-*") so content filters don't 404 it. Carries `ANALYTICS_*`, `DEV`,
  `STARTED_AT`, `sourceUrl`.
- Single-purpose modules, each detailed in its own section below: `js/i18n.js` (I18n),
  `js/app-init.js` (Analytics), `js/dev-banner.js` (Dev banner), `js/error-banner.js` (Error
  banners), `js/theme.js` (Theme), `js/loading.js` `createLoadingScreen()` (Loading overlay), `version.js`
  `window.__APP_VERSION__` (Versioning), `js/render-order.js` `DECOR_RENDER_ORDER`
  (Rendering / decoration draw order).
- `js/node-browser.js`: `collectNodes` + `createNodeBrowser`, the Data browser (`#nodes`): every
  graded knowledge node as one filterable/sortable list, opened as a **detail tab** (deep link
  `#tabs=browser:1`) rather than an accordion section, each row carrying its own backing so its pill
  shows the same source the node's panel pill does (see [`docs/CONTROLS.md`](CONTROLS.md)).
- `js/sim-model.js`: the drug-combination maths (pure, no DOM): `receptorProfile`, `ligandsOf`,
  `pkFlags`, `solveCombination` (NNLS), the `toAxis`/`fromAxis` log axis. Its header lists every
  shortcut it takes; see Simulation (beta). Tested by `tools/tests/sim_model.test.mjs`.
- `js/simulation.js`: `createSimulation`, the Simulation (beta) tab (`#simulation`): the
  assumptions callout, the picked-drug list, the two plots and the profile solver, opened as a
  **detail tab** (deep link `#tabs=simulation:1`) like the Data browser.
- `js/sim-plots.js`: `buildPkPlot` / `buildRxPlot` (+ `formatKi`), the tab's two inline-SVG plots,
  given rows and returning an `<svg>` plus the readers a pointer needs.
- `js/url-state.js`: `createUrlState()`, the `key -> {read, write}` registry that makes the URL
  fragment a complete description of the UI (open tabs + their order, active tab, popup, sliders,
  toggles, panel layout, open section, search + filter text, camera). Each control registers its
  own pair as it is wired; a view at its default writes nothing and a missing key is never written,
  so links stay short and never override a visitor's persisted preference. Keys +
  the older `#focus*` aliases in [`docs/RUNNING.md`](RUNNING.md).
- `js/prefs.js`: `loadFlag(key, dflt)` / `saveFlag(key, on)`, the only place a persisted
  on/off preference touches `localStorage` (panel-only mode, show-metabolites, show-twins;
  storage throws in private mode, so a read falls back to the default and a write is
  best-effort). `anim-settings.js` keeps its own, persisting a number beside its flag.

Deployment (`docker/`): `docker-compose.yml` (hardened Caddy), `Dockerfile`
(two-stage: `xcaddy build`s a custom binary with the `caddy-ratelimit` module,
so `docker compose build` needs network; then strips caddy's
`cap_net_bind_service` so `exec` works under `no-new-privileges`),
`Caddyfile` (serves `/srv` on `:8359`, serves `/gen/app-config.js` for
`/app-config.js`, `Cache-Control: no-cache` on everything (store but always revalidate ->
cheap `304`s, never stale, and never a heuristically-cached module); `encode` compresses by an
**explicit** content-type list, since Caddy's default omits the baked meshes' octet-stream (so a
NEW kind of asset ships uncompressed until its type is added there); a generous per-`{client_ip}` `rate_limit`
flood guard, keyed via the front proxy's `X-Forwarded-For`/`trusted_proxies`;
security headers incl. CSP),
`env.example`, `entrypoint.sh` (stamps `STARTED_AT`, validates `ANALYTICS_URL`,
derives `ANALYTICS_ORIGIN`, renders `/gen/app-config.js`).

Uncommitted, gitignored, environment-specific: `deploy.sh`, `CLAUDE.local.md`
(per-developer setup notes, incl. the deploy procedure and the Stahl source
material location).
