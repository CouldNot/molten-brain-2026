// Entry point: builds the three.js scene from the dataset and wires the UI.
//
// Responsibilities kept here (vs the focused modules it imports):
//  - scene / camera / renderer / lights / OrbitControls setup
//  - load the data, build region meshes (js/shapes.js) and projection arrows
//    (js/arrows.js)
//  - the "explode" layout math (moving regions radially outward) and the
//    transparency control, plus auto-rotate
//  - the render loop
//
// OrbitControls already gives us the requested touch gestures for free:
// one finger = rotate, two fingers = pinch-zoom + pan.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { loadBrainData } from "./data.js";
import { buildStructureMesh } from "./shapes.js";
import { createSdfPool } from "./sdf-pool.js";
import { geometryFromArrays } from "./sdf.js";
import { loadBakedMeshes } from "./baked-meshes.js";
import { createMeshBudget } from "./sdf-quality.js";
import { createLoadingScreen } from "./loading.js";
import { buildArrows } from "./arrows.js";
import { createLabels } from "./labels.js";
import { createCircuitAnimation } from "./circuit-anim.js";
import { createReceptorMarkers } from "./receptor-markers.js";
import { createDrugAnimation } from "./drug-anim.js";
import { animSettings } from "./anim-settings.js";
import { createTour } from "./tour.js";
import { createChangelog } from "./changelog.js";
import { createNodeBrowser } from "./node-browser.js";
import { KIND_LABELS } from "./kinds.js";
import { createSimulation } from "./simulation.js";
import { loadFlag, saveFlag } from "./prefs.js";
import { createUrlState, LIST_SEP } from "./url-state.js";
import { foldText } from "./search/query.js";
import { formatHalfLife, stripSide } from "./panel/format.js";
import { foldSections } from "./panel/dom.js";
import { buildEffectLegend, buildEnzymeLegend } from "./legend/browse.js";
import { buildTargetLegend } from "./legend/targets.js";
import { buildDrugLegend } from "./legend/drugs.js";
import { buildLegend, createProjectionVisibility } from "./legend/anatomy.js";
import { buildLegendKey } from "./legend/key.js";
import { createPanelTabs } from "./panel/tabs.js";
import { initThree, setRepaint } from "./scene/setup.js";
import { applyExplode, createArrowWidth } from "./scene/explode.js";
import { createSeeInside, isPickableMesh } from "./scene/see-inside.js";
import { createAdaptiveQuality } from "./scene/quality.js";
import { createIntroAnimation } from "./scene/intro.js";
import { createSelection } from "./scene/selection.js";
import { applyViewParams, createCameraFocus } from "./scene/camera.js";
import {
  setModalToggle, wireAboutModal, wireImageLightbox, wireLegendModal, wireModal,
  wireShortcutsHelp, wireSourcingModal,
} from "./about/modals.js";
import { buildAboutSourcing, GRADE_LABELS } from "./about/sourcing.js";
import { createInfoPanel } from "./panel/info.js";
import { wireControls } from "./boot/controls.js";
import { TYPING_SETTLE_MS, wireToolbar } from "./boot/toolbar.js";
import { wireShortcuts } from "./boot/shortcuts.js";

// UI string lookup (js/i18n.js, a classic script that ran before this module).
// `t(key, vars)` returns the current-language UI string; data strings are
// already resolved to the chosen language by js/data.js.
const { t, ofNoun } = window.__I18N__;

// When the dev / WIP banner is shown (DEV=1 container), the brain is presented a
// touch lower and further back so it sits clear below the banner: the resting
// camera is pulled out by this factor and the look-point lifted by this many
// world units (so the brain renders lower in the frame).
const DEV_BANNER_UNZOOM = 1.15;
const DEV_BANNER_DROP = 1.6;

async function main() {
  const { scene, camera, renderer, controls, baseDpr, theme } = initThree();

  // Stamp the version into every [data-app-version] slot (the panel header and the
  // loading overlay's title; single source: window.__APP_VERSION__ from version.js).
  // Done before the data load so it shows even if that fails; a new display spot is
  // then markup-only, no second lookup here.
  if (window.__APP_VERSION__) {
    for (const el of document.querySelectorAll("[data-app-version]")) {
      el.textContent = `v${window.__APP_VERSION__}`;
    }
  }

  // Startup loading overlay (the #loading element, visible by default): a progress
  // bar over the canvas so a slow first load shows feedback. Fetch fills the first
  // ~half of the bar, SDF meshing the rest (see below); done() fades it out.
  const loading = createLoadingScreen();
  loading.setProgress(0.02, t("loading.data"));

  // Sources & provenance popup: wire it + fill its static parts (intro + grade
  // key) now; its coverage tally needs the loaded dataset, so it is filled in
  // below once data arrives. It is NOT shown on launch (a visitor just watches
  // the loading bar + its tagline); it opens on demand from the Sources button,
  // the Legend/About "Sources & provenance" links, and the guided tour.
  const sourcingModal = wireSourcingModal();
  buildAboutSourcing(null);

  let data;
  try {
    data = await loadBrainData("data", (p) => {
      // Fill the sourcing popup's coverage bars as soon as meta lands (before the
      // slow shape/mesh phase), so the tally is ready the instant a visitor opens
      // the popup on demand, not just the intro text.
      if (p.stage === "meta-ready" && p.meta?.provenance_stats) {
        buildAboutSourcing({ provenanceStats: p.meta.provenance_stats });
      }
      if (p.stage === "shapes" && p.total) {
        loading.setProgress(
          0.05 + 0.45 * (p.loaded / p.total),
          t("loading.shapes", { done: p.loaded, total: p.total }),
        );
      }
    });
  } catch (err) {
    console.error(err);
    loading.fail(); // drop the overlay; the error shows as a banner
    window.showErrorBanner?.(t("status.loadError", { msg: err.message }));
    return;
  }

  // Mesh the SDF shapes off the main thread (a small Web Worker pool), so
  // assembling the brain's ~40 SDF meshes at load never freezes the page. The
  // cheap shapes (blob/curve/composite) stay synchronous. The pool falls back to
  // synchronous meshing per-spec if workers are unavailable (see js/sdf-pool.js),
  // so the brain always renders; this is a pure performance path.
  // One job per DISTINCT spec, not per structure: a symmetric structure's two
  // hemispheres share one shape file (js/data.js dedupes the fetch, so the twins
  // hold the very same spec object), and the left is the right's geometry flipped
  // by `mirrorGeometryX`, not a different solid. Meshing both sides re-ran an
  // identical marching-cubes pass for 20 of the 46 structures: 44% of the field
  // samples at load, spent to produce a duplicate. The twin gets a `clone()`
  // below, since `buildStructureMesh` mirrors in place.
  const sdfBySpec = new Map(); // spec object -> the id that carries its geometry
  const sdfItems = [];
  for (const s of data.structures) {
    if (!s.shape || s.shape.type !== "sdf") continue;
    if (sdfBySpec.has(s.shape)) continue;
    sdfBySpec.set(s.shape, s.id);
    sdfItems.push({ id: s.id, spec: s.shape, shapeFile: s.shape_file });
  }

  // Baked geometry first (tools/bake_meshes.mjs): downloading the meshes replaces
  // ~3.8s of worker meshing with a decode of a few tens of ms, and the download is
  // paid once (sw.js then revalidates it to a bodyless 304) where the meshing was
  // paid on every single load. Whatever the bake does not cover falls through to
  // the runtime mesher below, so a tree that was never baked still runs.
  const sdfGeoms = new Map();
  const baked = await loadBakedMeshes("data", ({ loaded, total }) => {
    loading.setProgress(0.5 + 0.4 * (total ? loaded / total : 1),
      t("loading.geometry", { done: loaded, total }));
  });
  const toMesh = [];
  for (const item of sdfItems) {
    const mesh = baked.get(item.shapeFile);
    if (mesh) sdfGeoms.set(item.id, geometryFromArrays(mesh.positions, mesh.indices));
    else toMesh.push(item);
  }

  // Runtime meshing, for whatever the bake did not supply. On a fully baked build
  // this list is empty and neither the worker pool nor the quality budget is ever
  // constructed; it is the fallback path, not the normal one.
  if (toMesh.length) {
    if (toMesh.length !== sdfItems.length) {
      console.info(`baked meshes: ${toMesh.length} of ${sdfItems.length} structure(s) ` +
        "missing from the bake; meshing those in the browser");
    }
    const pool = createSdfPool();
    // Mesh cheapest-first under a wall-time budget: the small nuclei double as a
    // throughput probe, and if the machine turns out to be too slow to finish the
    // heavy lobes at authored resolution, the budget coarsens the ones still
    // queued (see js/sdf-quality.js). Measured, never sniffed from the user agent.
    const budget = createMeshBudget();
    try {
      const meshed = await pool.meshAll(
        budget.order(toMesh),
        ({ id, done, total, frac }) => {
          budget.note(frac); // feed the throughput measurement back to the budget
          // `frac` is cost-weighted and includes the in-flight structures' own
          // progress, so on a slow phone the bar keeps moving through a single
          // heavy mesh; the "(n/total)" counter says how far along the batch is,
          // so a long pause still reads as progress rather than a freeze.
          const name = data.byId.get(id)?.base_name || id;
          loading.setProgress(0.5 + 0.45 * frac, t("loading.meshing", { name, done, total }));
          if (budget.degraded) loading.notice(t("loading.reducedQuality"));
        },
        budget.adjust,
      );
      for (const [id, geom] of meshed) sdfGeoms.set(id, geom);
    } catch (err) {
      console.warn("sdf pool meshing failed; falling back to synchronous", err);
    } finally {
      pool.dispose(); // geometry is built once at load; free the workers after
    }
  }

  // Build region meshes and index them for the arrows. SDF structures get their
  // pre-meshed geometry; everything else is meshed synchronously inside the call.
  const meshes = [];
  const meshById = new Map();
  const geomUsed = new Set();
  for (const structure of data.structures) {
    // Resolve through the spec, so a mirrored twin picks up the geometry meshed
    // under its right-side partner's id. Every consumer after the first gets a
    // clone: `buildStructureMesh` mirrors (and so mutates) what it is handed, and
    // a clone is a memcpy against a million-sample re-mesh.
    let geom = sdfGeoms.get(sdfBySpec.get(structure.shape) ?? structure.id);
    if (geom) {
      if (geomUsed.has(geom)) geom = geom.clone();
      else geomUsed.add(geom);
    }
    const mesh = buildStructureMesh(structure, geom);
    meshes.push(mesh);
    meshById.set(structure.id, mesh);
    scene.add(mesh);
  }

  const arrows = buildArrows(data.projections, meshById);
  for (const arrow of arrows) scene.add(arrow.group);

  // Name labels (hover + show-all) for structures, plus connection labels on the
  // arrows (shown with "show all"). Mounted as an HTML overlay over the canvas.
  const labels = createLabels(meshes, arrows, document.body);
  window.addEventListener("resize", () => labels.resize());

  // Both hemispheres (plus a midline singleton) sharing a mesh's base: a legend
  // row / double-click / search pick isolates this whole pair, and pinning it
  // names both sides. The id base is the structure id minus its _R/_L suffix.
  const isolateGroupFor = (mesh) => {
    const base = stripSide(mesh.userData.structure.id);
    return meshes.filter((m) => stripSide(m.userData.structure.id) === base);
  };

  // Picking helpers, shared by mouse hover, click, and touch tap so the raycast
  // logic isn't duplicated. `setPointer` maps screen coords to NDC and aims the
  // ray once; the pick functions then intersect different object sets.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const canvas = renderer.domElement;
  const setPointer = (clientX, clientY) => {
    pointer.x = (clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  };
  // Nearest *visible* structure intersection under a screen point (the three.js
  // hit record, so callers also get `.distance`), or null. The distance lets the
  // click handler decide whether a structure or an arrow is the front-most thing
  // under the cursor.
  const pickStructureHit = (clientX, clientY) => {
    setPointer(clientX, clientY);
    for (const hit of raycaster.intersectObjects(meshes, false)) {
      if (isPickableMesh(hit.object)) return hit;
    }
    return null;
  };
  // Just the nearest visible structure mesh (hover + double-click only need that).
  const pickAt = (clientX, clientY) => pickStructureHit(clientX, clientY)?.object || null;

  // Connection info panel (populated when an arrow is clicked or a connection is
  // picked in the search). Created here so the click/tap handlers below can use it.
  const tabs = createPanelTabs();
  // The URL fragment <-> UI registry (js/url-state.js). Created before anything that
  // owns a piece of UI state, since each control registers its own {read, write} pair
  // as it is wired; the fragment is assembled + applied at the end of main().
  const urlState = createUrlState();
  // Any strip change (open / close / activate / drag-reorder) is part of what a link
  // reproduces, so mirror the whole strip, not just the active tab.
  tabs.setOnChange(() => urlState.sync());
  const info = createInfoPanel(data, sourcingModal);
  // Open (or re-activate) a detail tab for the thing a select* just rendered +
  // focused; the reopen thunk re-runs that select* so clicking the tab restores
  // the panel + the 3D focus. Kept here (not in createInfoPanel) so the tab's key
  // and how to re-focus the scene live with the select* layer.
  const openDetailTab = (key, title, reopen) => {
    // The single choke point every node focus (drug / receptor / target / structure /
    // connection / circuit / group) passes through, so emit one semantic analytics
    // event here (the `key` is already `<kind>:<id>`) instead of at each call site.
    // No-op unless umami is loaded (see js/app-init.js window.trackEvent).
    window.trackEvent?.("focus", { node: key });
    return tabs.openDetail({ key, title, reopen });
  };

  // Selection + isolation controller: glowing halo on the structure picked by
  // click / double-click / search, plus the legend-driven isolate/dim mode. Owns
  // the structure + arrow opacity so it composes with the transparency slider.
  const selection = createSelection({ meshes, arrows });
  // Pin the selected structure's floating name: while a structure is the active
  // single selection its label stays on regardless of hover, and hovering another
  // region adds its label rather than replacing the pinned one. Driven off the
  // selection highlight so every path that selects a structure (3D click, search,
  // a related-structure panel row) behaves identically, and any non-structure
  // focus (arrow / target / drug) or a clear drops the pin automatically. The
  // whole L/R base pair is pinned (not just the clicked mesh), so both
  // hemispheres show their name for a paired structure.
  selection.onHighlight((mesh) => labels.setPinned(mesh ? isolateGroupFor(mesh) : null));
  // When the last detail tab is closed, nothing is selected any more: clear the
  // 3D focus (halo / isolate / dim / dots) so the scene matches the empty strip.
  // Last tab closed: drop the 3D focus and, since a panel-only focus (enzyme,
  // effect) has no 3D state for selection.clear() to unwind, its row highlight too.
  const panelOnlyFocuses = []; // their reset()s, see createPanelOnlyFocus
  const clearNodeFocus = () => {
    selection.clear();
    for (const reset of panelOnlyFocuses) reset();
  };
  tabs.setOnEmpty(clearNodeFocus);
  // Stepping back to the Settings tab is "put the scene back": the detail tabs stay
  // in the strip as history, but whatever they lit (a drug's animation, a circuit
  // pulse, an isolate) stops, so the controls are never read over a live overlay.
  // Clicking the tab again re-applies its focus (its reopen thunk).
  tabs.setOnSettings(clearNodeFocus);

  // Circuit "traveling pulse" animation: glowing beads sweeping each isolated
  // circuit's arrows from source to target (js/circuit-anim.js). Started from the
  // circuit legend row (in buildLegend) and stopped here the instant the focus
  // stops being exactly that circuit: every focus change fires this onIsolate
  // hook with the live pinned-arrow set, and matches() is true only while that
  // set is still the animating circuit (a clear, a different circuit, a
  // neurotransmitter focus or a legend isolate all flip it false).
  const circuitAnim = createCircuitAnimation({ scene });
  selection.onIsolate((_isolated, focusedArrows) => {
    if (!circuitAnim.matches(focusedArrows)) circuitAnim.stop();
  });

  // Receptor/target expression markers + focus (js/receptor-markers.js). Clicking a
  // row in the merged "Receptors & targets" section dims the brain to just the
  // regions the receptor/target sits in (via setCircuit, no arrow pin, so the
  // pathways fade too and the dots are the only bright thing) and scatters glowing
  // dots over those regions' surfaces; a ubiquitous receptor lights every region.
  // Clicking the active one clears it. The dots are dropped the moment the focus
  // stops being exactly that structure set (a clear, a circuit, a legend isolate,
  // another receptor/target), watched off the selection state like the circuit
  // pulse. The same path serves receptors and non-receptor targets; only the info
  // view differs (showReceptor vs the lighter showTarget).
  const receptorMarkers = createReceptorMarkers({ scene });
  let activeTargetId = null;
  let reflectTargets = () => {};
  const refreshTargetRows = () => reflectTargets(activeTargetId);
  const targetMeshesOf = (tgt) =>
    tgt.structureIds.map((id) => meshById.get(id)).filter(Boolean);
  const focusTarget = (tgt, { frame = false, preview = false } = {}) => {
    const meshSet = targetMeshesOf(tgt);
    selection.setCircuit(meshSet, []);
    receptorMarkers.show(meshSet, tgt.swatchColor);
    if (preview) return; // hover preview: dim + dots only, no panel/tab/spread
    autoSpreadIfDeep(meshSet);
    if (tgt.kind === "receptor") info.showReceptor(tgt.receptor);
    else info.showTarget(tgt);
    // From the search box, frame the regions (the whole brain for a ubiquitous
    // receptor); from the legend row, leave the view where it is.
    if (frame) focus.focusMeshes(meshSet);
    activeTargetId = tgt.id;
    refreshTargetRows();
    openDetailTab(`target:${tgt.id}`, tgt.name, () => focusTarget(tgt));
  };
  const toggleTarget = (tgt) => {
    if (activeTargetId === tgt.id) selection.clear(); // watcher hides dots
    else focusTarget(tgt);
  };
  // Picking a target in the search box always focuses it (and frames it), never
  // toggles it off, the same way a structure/connection search result behaves.
  const selectTarget = (tgt) => focusTarget(tgt, { frame: true });
  selection.onIsolate((isolated) => {
    if (receptorMarkers.active && !receptorMarkers.matches(isolated)) {
      receptorMarkers.hide();
      activeTargetId = null;
      refreshTargetRows();
    }
  });
  reflectTargets = buildTargetLegend(data, toggleTarget);

  // Enzyme focus (the Enzymes section + a drug panel's Metabolism row). Unlike every
  // other focus in this file it touches NOTHING in the 3D scene: a metabolic enzyme
  // is pharmacokinetics with no anatomy, so there is no mesh set to dim, no dots and
  // no arrows to pin. It is a panel + tab only, and the section caption says so, so
  // the still scene reads as intended rather than as a broken click.
  //
  // A panel-only focus (an enzyme, an effect): a panel + tab with no 3D state of its
  // own, which is exactly why it has to drop the PREVIOUS focus by hand: every other
  // focus replaces the scene as it applies itself, so stepping from a drug tab to an
  // enzyme tab would otherwise leave the drug's dots, wash and flow beads running
  // under a panel that no longer mentions that drug (the watcher below hides them off
  // this clear). Folding the whole panel away is not a focus change and deliberately
  // keeps it going. Its legend row stays lit only while it is what is focused: any
  // focus that DOES touch the scene puts it out (the onIsolate mirror; focus() clears
  // first and sets the active id after, so it fires on the way in and leaves the
  // incoming row lit). Returns {focus, reset}; reset is for clearNodeFocus.
  const createPanelOnlyFocus = ({ kind, show, buildLegend }) => {
    let activeId = null;
    let reflect = () => {};
    const focus = (item) => {
      selection.clear();
      show(item);
      activeId = item.id;
      reflect(activeId);
      openDetailTab(`${kind}:${item.id}`, item.label, () => focus(item));
    };
    const reset = () => {
      if (activeId === null) return;
      activeId = null;
      reflect(null);
    };
    const toggle = (item) => {
      if (activeId !== item.id) { focus(item); return; }
      reset();
      tabs.close(`${kind}:${item.id}`);
    };
    selection.onIsolate(reset);
    reflect = buildLegend(toggle);
    panelOnlyFocuses.push(reset);
    return focus;
  };
  const focusEnzyme = createPanelOnlyFocus({ kind: "enzyme",
    show: (enz) => info.showEnzyme(enz), buildLegend: (onPick) => buildEnzymeLegend(data, onPick) });
  info.onEnzyme(focusEnzyme);
  // The Effects section (BETA): the same panel + tab shape.
  const focusEffect = createPanelOnlyFocus({ kind: "effect",
    show: (effect) => info.showEffect(effect),
    buildLegend: (onPick) => buildEffectLegend(data, onPick) });
  info.onEffect(focusEffect);

  // Per-drug animation + focus (js/drug-anim.js), the same shape as the receptor
  // focus above. Clicking a drug row dims the brain to the union of regions its
  // targets sit in and animates each target's regions coloured by the binding's
  // net effect (boost/block/modulate, the dots + wash). On top of that, the drug's
  // transmitter-system pathways (its `flowKinds`, resolved in js/data.js) are
  // pinned opaque and ride flowing beads via the shared circuit pulse, the
  // "by-mechanism flow" overlay: focusing an SSRI lights the serotonergic fan, an
  // SNRI the noradrenergic + serotonergic ones, etc. A drug whose systems have no
  // modeled ascending pathway pins no arrows, so it falls back to dots + wash only
  // (setCircuit with an empty arrow set, exactly as before). Both the dots and the
  // flow are dropped the moment the focus stops being exactly that drug's region
  // set (a clear, a circuit, a receptor, another drug): the dots via the drugAnim
  // watcher below, the flow via the shared circuitAnim watcher (its pinned-arrow
  // set stops matching).
  const drugAnim = createDrugAnimation({ scene });
  let activeDrugId = null;
  let reflectDrugs = () => {};
  const refreshDrugRows = () => reflectDrugs(activeDrugId);
  const drugMeshesOf = (drug) =>
    drug.structureIds.map((id) => meshById.get(id)).filter(Boolean);
  // The arrows carrying this drug's target transmitter systems (its mapped
  // projection kinds), the set the flow overlay rides. Empty when the drug has no
  // mapped system, so the overlay is simply absent for it.
  const flowArrowsOf = (drug) => {
    const kinds = new Set(drug.flowKinds || []);
    return kinds.size ? arrows.filter((a) => kinds.has(a.projection.kind)) : [];
  };
  // The arrows for this drug's *context* systems (postsynaptic-receptor pathways, its
  // `contextKinds` from js/data.js): pinned statically (dimmed, no beads) so a purely
  // postsynaptic agent (an antihistamine blocking H1) still visibly engages its
  // system's fan, without the flow overlay's tone claim.
  const contextArrowsOf = (drug) => {
    const kinds = new Set(drug.contextKinds || []);
    return kinds.size ? arrows.filter((a) => kinds.has(a.projection.kind)) : [];
  };
  // highlightMetabolite / highlightEnzymes: pass-through "why did this open" hints for
  // the panel (see info.showDrug), not focus state.
  const focusDrug = (drug, {
    frame = false, preview = false, highlightMetabolite = null, highlightEnzymes = null,
  } = {}) => {
    const meshSet = drugMeshesOf(drug);
    const flowArrows = flowArrowsOf(drug);
    const ctxArrows = contextArrowsOf(drug);
    selection.setCircuit(meshSet, flowArrows, ctxArrows);
    drugAnim.show(drug, meshById);
    // Per-kind flow direction/weight (js/data.js flowSystems): the pulse rides
    // "up" the fan when the drug raises that system's tone, damped "down" when it
    // lowers it, its intensity scaled by the drug's affinity on that system.
    circuitAnim.play(flowArrows, drug.flowSystems || {}); // no-op for a drug with no mapped pathways
    if (preview) return; // hover preview: dim + dots + flow only, no panel/tab/spread
    autoSpreadIfDeep(meshSet);
    info.showDrug(drug, { highlightMetabolite, highlightEnzymes });
    // From the search box, frame the affected regions; from the list row, leave
    // the view where it is.
    if (frame && meshSet.length) focus.focusMeshes(meshSet);
    activeDrugId = drug.id;
    refreshDrugRows();
    openDetailTab(`drug:${drug.id}`, drug.displayName, () => focusDrug(drug));
  };
  const toggleDrug = (drug) => {
    if (activeDrugId === drug.id) selection.clear(); // watcher hides the animation
    else focusDrug(drug);
  };
  const selectDrug = (drug, opts = {}) => focusDrug(drug, { frame: true, ...opts });
  selection.onIsolate((isolated) => {
    if (drugAnim.active && !drugAnim.matches(isolated)) {
      drugAnim.hide();
      activeDrugId = null;
      refreshDrugRows();
    }
  });
  reflectDrugs = buildDrugLegend(data, toggleDrug);
  // The Drugs section's two list controls. Registered here (once) rather than inside
  // buildDrugLegend, which re-runs on a language switch: the inputs are static markup,
  // so one registration covers every rebuild. Each write drives the input's own event,
  // so the live filter + the persisted metabolite preference behave as if typed/clicked.
  const drugsFilter = document.getElementById("drugs-filter");
  const metabToggle = document.getElementById("drugs-show-metabolites");
  if (drugsFilter) {
    urlState.register("drugq", {
      read: () => drugsFilter.value || null,
      write: (v) => { drugsFilter.value = v; drugsFilter.dispatchEvent(new Event("input")); },
    });
    drugsFilter.addEventListener("input", () => urlState.sync(TYPING_SETTLE_MS));
  }
  if (metabToggle) {
    urlState.register("metab", {
      read: () => (metabToggle.checked ? null : "0"),
      write: (v) => {
        const on = v !== "0";
        if (metabToggle.checked === on) return;
        metabToggle.checked = on;
        metabToggle.dispatchEvent(new Event("change"));
      },
    });
    metabToggle.addEventListener("change", () => urlState.sync());
  }

  // Auto-rotate is on by default (a slow turn on load), but the moment the user
  // reaches in to inspect something it should hold still. Stop it (and untick
  // the box so the UI stays truthful) on any content pick routed through the
  // selection controller: a structure/arrow click-tap-or-search, a legend
  // isolate, or a circuit. Clearing the selection does not re-enable it.
  const autorotateBox = document.getElementById("autorotate");
  const stopAutoRotate = () => {
    if (!controls.autoRotate) return;
    controls.autoRotate = false;
    if (autorotateBox) autorotateBox.checked = false;
  };
  selection.onPick(stopAutoRotate);

  // Arrow picking, two object sets for two purposes:
  //  - `arrowPickables` includes each arrow's fat invisible pick hull
  //    (PICK_RADIUS), so a thin arrow over empty space is still easy to
  //    click/tap; used only as the empty-space fallback below.
  //  - `visibleArrowPickables` is the *visible* geometry only (tube + cone(s),
  //    minus that hull), so the click handler can compare an arrow's real
  //    on-screen depth against a structure's and pick whichever is in front.
  // Arrows hidden in isolated screenshot views (group.visible=false) are ignored.
  const arrowPickables = arrows.flatMap((arrow) => arrow.meshes);
  const visibleArrowPickables = arrows.flatMap((a) => a.meshes.filter((m) => m !== a.pick));
  const firstVisibleArrowHit = (pickables) => {
    for (const hit of raycaster.intersectObjects(pickables, false)) {
      const arrow = hit.object.userData.arrow;
      if (arrow && arrow.group.visible) return { arrow, distance: hit.distance };
    }
    return null;
  };
  // Arrow under a point via the generous pick hull (or null).
  const pickArrowAt = (clientX, clientY) => {
    setPointer(clientX, clientY);
    // The fat pick hulls are rebuilt lazily (deferred during a spread), so make
    // sure any stale ones are current before raycasting them.
    for (const a of arrows) a.ensurePickGeometry();
    return firstVisibleArrowHit(arrowPickables)?.arrow || null;
  };
  // Nearest *visible* arrow part under a point ({arrow, distance}) or null.
  const pickVisibleArrowHit = (clientX, clientY) => {
    setPointer(clientX, clientY);
    return firstVisibleArrowHit(visibleArrowPickables);
  };

  // What a tap/click does: select whatever is *visually* front-most under the
  // point. We compare depths so a click on a region selects the region even when
  // an arrow's fat (invisible) pick hull happens to pass over it; an arrow wins
  // only when its *visible* tube/cone is at least as near the camera as the
  // nearest structure. With nothing solid under the point (empty space) we fall
  // back to the generous arrow hull, so a thin arrow over the background is still
  // easy to hit; a true miss clears the halo, label, and panel. handleSelect owns
  // the label set so callers need no separate fallback.
  // While the guided tour is on screen, a tap on the brain is inert: the tour
  // drives selection itself, and a stray pick would derail it. Dragging to rotate
  // never reaches here (it fails the movement threshold), and wheel/pinch zoom is
  // untouched, so the brain still moves. Checked via the overlay's own visibility
  // so the 3D wiring stays decoupled from the tour module.
  const tourOnScreen = () => {
    const tr = document.getElementById("tour-root");
    return !!(tr && !tr.hidden);
  };
  const handleSelect = (clientX, clientY) => {
    if (tourOnScreen()) return false;
    const structHit = pickStructureHit(clientX, clientY);
    const arrowHit = pickVisibleArrowHit(clientX, clientY);
    let arrow = null;
    if (arrowHit && (!structHit || arrowHit.distance <= structHit.distance)) {
      arrow = arrowHit.arrow; // a visible arrow is at/in front of the structure
    } else if (!structHit) {
      // Nothing visible under the point: let the fat pick hull catch a thin arrow.
      arrow = pickArrowAt(clientX, clientY);
    }
    if (arrow) {
      selectConnection(arrow); // plain click: no camera move
      return true;
    }
    const mesh = structHit ? structHit.object : null;
    if (mesh) {
      // A structure opens its own panel (name, group, connections).
      selectStructure(mesh);
    } else {
      // A true miss on empty space clears the halo + label and deselects to the
      // Settings tab (the opened detail tabs stay in the strip as history).
      selection.select(null);
      labels.setHovered(null);
      tabs.showSettings();
    }
    return true;
  };

  // Hover picking. When a focus is active (a halo'd structure, an isolated set,
  // a circuit, a receptor's regions, ...), a focused region the ray passes
  // through wins even when a non-focused region sits nearer the camera, so the
  // thing you focused always names *itself* on hover rather than whatever happens
  // to occlude it (e.g. an isolated deep nucleus hidden behind the dimmed
  // cortex). With nothing focused this is just the nearest visible structure.
  const pickHover = (clientX, clientY) => {
    setPointer(clientX, clientY);
    const hits = raycaster.intersectObjects(meshes, false);
    const focus = selection.getSelected();
    if (focus && focus.meshes.size) {
      for (const hit of hits) {
        if (hit.object.visible && focus.meshes.has(hit.object)) return hit.object;
      }
    }
    for (const hit of hits) if (hit.object.visible) return hit.object;
    return null;
  };

  // Mouse: hover a region to reveal its name. Mouse-only so that touch-drag
  // rotation doesn't flicker labels (touch uses tap, below).
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    labels.setHovered(pickHover(event.clientX, event.clientY));
  });
  canvas.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse") labels.setHovered(null);
  });

  // Mouse click (a press + release that didn't drag) selects: an arrow opens its
  // info panel, a miss closes it. Thresholds on movement/time so dragging to
  // rotate (OrbitControls) is never mistaken for a click.
  let mouseDown = null;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") {
      mouseDown = { x: event.clientX, y: event.clientY, t: performance.now() };
    }
  });
  canvas.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "mouse" || !mouseDown) return;
    const moved = Math.hypot(event.clientX - mouseDown.x, event.clientY - mouseDown.y);
    const elapsed = performance.now() - mouseDown.t;
    mouseDown = null;
    if (moved < 6 && elapsed < 500) handleSelect(event.clientX, event.clientY);
  });

  // Touch: a tap on a structure reveals its name; a tap on empty space clears
  // it. A tap is a single finger pressed and released with little movement, so
  // it never competes with one-finger rotate or two-finger pan/zoom (those move
  // too far, or involve a second finger, and are ignored here).
  let tapStart = null;
  let touchPointers = 0;
  let gestureMultiTouch = false;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    touchPointers += 1;
    if (touchPointers > 1) {
      // A second finger means this is a pan/zoom gesture, not a tap.
      gestureMultiTouch = true;
      tapStart = null;
      return;
    }
    gestureMultiTouch = false;
    tapStart = { x: event.clientX, y: event.clientY, t: performance.now() };
  });
  canvas.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "touch") return;
    touchPointers = Math.max(0, touchPointers - 1);
    const start = tapStart;
    const wasMultiTouch = gestureMultiTouch;
    if (touchPointers === 0) {
      gestureMultiTouch = false;
      tapStart = null;
    }
    if (wasMultiTouch || !start) return;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    const elapsed = performance.now() - start.t;
    if (moved < 12 && elapsed < 400) {
      // An arrow tap opens its info panel; otherwise the structure under the tap
      // is haloed + named (and a tap on empty space clears everything).
      // handleSelect owns all of that, so there is no separate fallback.
      handleSelect(event.clientX, event.clientY);
    }
  });
  canvas.addEventListener("pointercancel", (event) => {
    if (event.pointerType !== "touch") return;
    touchPointers = Math.max(0, touchPointers - 1);
    if (touchPointers === 0) {
      gestureMultiTouch = false;
      tapStart = null;
    }
  });

  // Double-click to focus: on a structure, isolate it (both hemispheres) exactly
  // like clicking its legend row; on empty space, recenter the whole brain (same
  // as the reset button). The move is a smooth tween advanced in the render loop;
  // grabbing the controls cancels it so a drag always wins.
  const focus = createCameraFocus({
    camera, controls, meshes,
    // The live focused mesh set (a legend/search isolate, a circuit/group pin, a
    // receptor/drug region set, or a single halo), so a spread keeps whatever is
    // focused centered; null when nothing is focused (the pivot-follow stays off).
    getFocusMeshes: () => {
      const sel = selection.getSelected();
      return sel ? [...sel.meshes] : null;
    },
  });
  controls.addEventListener("start", () => focus.cancel());

  // "See inside" mode: hide the near hemisphere so the deep nuclei show through.
  const seeThrough = createSeeInside({ meshes, camera, controls });

  // Every way of picking content (click/tap, double-click, search, a
  // structure-panel connection row) funnels through these two helpers, so the
  // "halo it + label/panel it + maybe frame the camera" sequence lives in one
  // place instead of being copy-pasted at each entry point. `frame` moves the
  // camera (search / double-click); a plain click leaves the view where it is.
  // `isolate` dims the rest of the brain down to the picked thing. The uniform
  // rule across the app: a pick from SEARCH or a DETAIL PANEL row always focuses
  // (frame:true, isolate:true), so structures, connections, targets and drugs all
  // behave the same (target/drug focus is the equivalent setCircuit in focusTarget
  // / focusDrug). Only a plain 3D click stays halo-only (isolate:false), with
  // double-click to isolate.
  const selectStructure = (mesh, { frame = false, isolate = false, preview = false } = {}) => {
    if (frame && !preview) focus.focusStructure(mesh);
    // A search result or a detail-panel jump (e.g. a "Found in" region row) picks a
    // structure the way a legend row does: isolate its hemisphere pair so the rest
    // of the brain dims (setCircuit with no pinned arrows is exactly the dimming a
    // legend-row toggleIsolate produces). A plain 3D click and the legend's own
    // onPickStructure pass isolate:false: the 3D click stays halo-only (double-click
    // isolates), and the legend has already toggled the isolate set itself (kept
    // additive there). The tab's reopen thunk preserves `isolate` so re-activating a
    // search/detail tab restores the dim, not just the halo.
    if (isolate) {
      const group = isolateGroupFor(mesh);
      selection.setCircuit(group, []);
      if (!preview) autoSpreadIfDeep(group); // a deep nucleus: blow the brain apart
    }
    // select() drives selection.onHighlight, which pins this structure's label on
    // (so the name stays put after the pointer leaves, and survives hovering other
    // regions), so no explicit setHovered is needed here.
    selection.select(mesh);
    if (preview) return; // hover preview: apply the scene focus only, no panel/tab
    const structure = mesh.userData.structure;
    info.showStructure(structure);
    openDetailTab(`structure:${structure.id}`, structure.base_name || structure.name,
      () => selectStructure(mesh, { isolate }));
  };
  // A projection has no id field, but a from->to pair is unique per pathway (the
  // hemispheres differ), so it keys the tab. The reopen re-halos the arrow when
  // one was built; a pathway with no drawn arrow just re-renders the panel.
  const connectionKey = (proj) => `connection:${proj.from}->${proj.to}`;
  const selectConnection = (arrow, { frame = false, isolate = false, preview = false, siblings = [] } = {}) => {
    if (frame && !preview) focus.focusConnection(arrow);
    // A search result or a detail-panel connection row puts the pathway "fully in
    // focus" like every other search pick: pin the arrow + its two endpoints opaque
    // and dim the rest of the brain (setCircuit), the same focus a projection-group
    // / circuit row gives. A plain 3D arrow click passes isolate:false and stays
    // halo-only (consistent with the plain structure click). The reopen thunk keeps
    // `isolate` so re-activating the tab restores the dim. `siblings` are the
    // opposite-hemisphere twin arrow(s): a search pick collapses L/R twins into one
    // row and pins both sides, so "corticothalamic" lights both, not just the right.
    if (isolate && arrow.fromMesh && arrow.toMesh) {
      const ends = [arrow.fromMesh, arrow.toMesh];
      const pins = [arrow];
      for (const sib of siblings) {
        if (sib.fromMesh) ends.push(sib.fromMesh);
        if (sib.toMesh) ends.push(sib.toMesh);
        pins.push(sib);
      }
      selection.setCircuit(ends, pins);
      if (!preview) autoSpreadIfDeep(ends);
    }
    selection.selectArrow(arrow); // halo the arrow on top of the focus
    if (preview) return; // hover preview: scene focus only, no panel/tab
    const proj = arrow.projection;
    info.show(proj);
    openDetailTab(connectionKey(proj), proj.label || t("info.connection"),
      () => selectConnection(arrow, { isolate, siblings }));
  };

  // Clicking a connection row inside a structure panel jumps to that pathway
  // (frames + isolates it, halos the arrow, swaps in the connection panel) just
  // like picking the connection in search.
  info.onConnection((proj) => {
    const arrow = arrows.find((a) => a.projection === proj);
    if (arrow) { selectConnection(arrow, { frame: true, isolate: true }); return; }
    info.show(proj); // no arrow built for this pathway: details only
    openDetailTab(connectionKey(proj), proj.label || t("info.connection"),
      () => info.show(proj));
  });

  // Clicking a target (binding) row inside a drug panel focuses that target,
  // framing its regions + lighting its dots + opening its panel, just like
  // picking the target in the "Receptors & targets" legend or in search.
  info.onTarget(selectTarget);

  // Clicking a region in a receptor / target panel's "Found in" list jumps to
  // that structure (frames it + halos it + opens its tab), like a structure
  // search pick. A base resolves to its midline mesh, else its _R then _L
  // hemisphere (the receptor footprint spans both; we centre one).
  info.onStructure((base) => {
    const id = [base, `${base}_R`, `${base}_L`].find((sid) => meshById.has(sid));
    const mesh = id && meshById.get(id);
    if (mesh) selectStructure(mesh, { frame: true, isolate: true });
  });

  // Clicking a drug in a receptor / target panel's "Interacting drugs" list focuses
  // that drug (dim + animation + drug panel + tab), exactly like a Drugs legend row
  // / drug search pick, so you can go from a target to every drug acting on it.
  info.onDrug(selectDrug);

  // Clicking a "Neurotransmitter tone" row in a drug panel focuses that projection
  // group (isolates its arrows + opens its tab), exactly like its Projections legend
  // row, so you can go from a drug to the pathway system it engages.
  info.onProjectionGroup((group) => focusProjectionGroup(group, { frame: true }));

  canvas.addEventListener("dblclick", (event) => {
    if (tourOnScreen()) return; // brain interactions are inert during the tour
    const mesh = pickAt(event.clientX, event.clientY);
    if (mesh) {
      // Same as clicking the structure's legend row: isolate/focus the pair.
      selection.toggleIsolate(isolateGroupFor(mesh));
    } else {
      // Double-click on empty space is a full reset, same as the reset button.
      focus.recenter();
      selection.clear();
    }
  });

  const projVis = createProjectionVisibility(arrows, labels);

  // Arrow colour mode + legend. The legend's focus-greying callback is registered
  // once here; rebuildLegend just swaps which function it delegates to, so the
  // colour toggle (which rebuilds the legend so its Projections rows match the new
  // arrow colours) never stacks onIsolate listeners.
  let signColorMode = false; // false = per-transmitter (default), true = excit/inhib
  let reflectLegend = () => {};
  selection.onIsolate((isolated, focusedArrows) => reflectLegend(isolated, focusedArrows));
  const applyArrowColors = () => {
    for (const a of arrows) {
      a.setColor(signColorMode ? a.projection.signColor : a.projection.color);
    }
  };
  // Circuit + projection-group focus, the same shape as focusDrug/focusTarget: a
  // legend row click (toggle handled in buildLegend off its reflect-derived active
  // state) delegates the *isolate + panel + tab* to these, and the tab's reopen
  // thunk re-runs the same function. A circuit plays the traveling pulse (the
  // circuitAnim watcher stops it on the next focus change); a projection group is
  // a static pinned-arrow focus (no pulse), matching the prior behaviour. Both
  // recompute their meshes/arrows from the data so the reopen thunk is durable.
  const circuitMeshesOf = (circuit) =>
    circuit.structures.map((id) => meshById.get(id)).filter(Boolean);
  const arrowsAmong = (meshSet) =>
    arrows.filter((a) => meshSet.has(a.fromMesh) && meshSet.has(a.toMesh));
  const focusCircuit = (circuit, { frame = false, preview = false } = {}) => {
    const cMeshes = circuitMeshesOf(circuit);
    const cArrows = arrowsAmong(new Set(cMeshes));
    selection.setCircuit(cMeshes, cArrows);
    circuitAnim.play(cArrows);
    if (preview) return; // hover preview: dim + pulse only, no panel/tab/spread
    autoSpreadIfDeep(cMeshes);
    info.showCircuit(circuit);
    if (frame && cMeshes.length) focus.focusMeshes(cMeshes);
    openDetailTab(`circuit:${circuit.id}`, circuit.name, () => focusCircuit(circuit));
  };
  // The (established) arrows this projection group stands for: by sign in sign
  // mode, by kind otherwise (the data record is per kind/sign). Tentative arrows
  // are excluded, matching the established-only legend rows.
  const groupArrowsOf = (group) => arrows.filter((a) =>
    !a.tentative
    && (group.mode === "sign" ? a.projection.sign === group.key
                              : a.projection.kind === group.key));
  const focusProjectionGroup = (group, { frame = false, preview = false } = {}) => {
    const gArrows = groupArrowsOf(group);
    const gMeshes = [...new Set(gArrows.flatMap((a) => [a.fromMesh, a.toMesh]))];
    selection.setCircuit(gMeshes, gArrows); // pin the arrows, no pulse
    if (preview) return; // hover preview: dim only, no panel/tab/spread
    autoSpreadIfDeep(gMeshes);
    info.showProjectionGroup(group);
    if (frame && gMeshes.length) focus.focusMeshes(gMeshes);
    openDetailTab(`group:${group.id}`, group.name, () => focusProjectionGroup(group));
  };

  const rebuildLegend = () => {
    reflectLegend = buildLegend(
      data, meshById, arrows, selection, projVis, circuitAnim, signColorMode,
      // Opening the picked structure's tab (no reframe: keep the legend pick's
      // current camera, just add the detail tab + halo, like the isolate already
      // does in the viewer).
      (mesh) => selectStructure(mesh),
      // Circuit / projection-group row picks: isolate + open the sourced detail
      // panel + tab, exactly like a drug / target row.
      focusCircuit, focusProjectionGroup,
      // The Projections section hosts an addon slot; the hook lives on the info panel.
      info.appendAddons);
    selection.refresh(); // re-grey the fresh rows for the current isolate state
  };
  rebuildLegend();
  // The static colour key (Legend section) is built once: it shows the scene's
  // encodings (gem-dot signs, drug effect colours, dotted = speculative) from the
  // meta maps and doesn't depend on the arrow colour mode.
  buildLegendKey(data);
  // Fill the About panel's "Sources & provenance" block (grade key + the programmatic
  // coverage tally) from the dataset's meta. `nav` lets an expanded kind's example node
  // jump to the real entity: each callback closes the popup first so the focus is
  // visible behind it, then focuses the drug / target / structure / circuit / group.
  // One nav for every node row: the Data browser's rows, and (each wrapped to close
  // the popup first, so the focus is visible behind it) the Sources popup's examples.
  // A projection row isolates the arrow that carries it.
  const nodeNav = {
    drug: (d, opts) => focusDrug(d, { frame: true, ...opts }),
    target: (tg) => focusTarget(tg, { frame: true }),
    structure: (id) => {
      const mesh = meshById.get(id);
      if (mesh) selectStructure(mesh, { frame: true });
    },
    connection: (proj) => {
      const arrow = arrows.find((a) => a.projection === proj);
      if (arrow) selectConnection(arrow, { frame: true, isolate: true });
    },
    circuit: (c) => focusCircuit(c, { frame: true }),
    group: (g) => focusProjectionGroup(g, { frame: true }),
  };
  const sourcingNav = {
    ...Object.fromEntries(Object.entries(nodeNav).map(([k, go]) => [k, (...args) => {
      sourcingModal.close();
      go(...args);
    }])),
    // Not an example node but the whole list: the popup's "Open the Data browser"
    // line. Reads `showNodeBrowser` at call time, since it is only assigned below.
    browser: () => { sourcingModal.close(); showNodeBrowser(); },
  };
  buildAboutSourcing(data.meta, { data, nav: sourcingNav });

  // The Data browser: the same nodes the tally counts, listed one by one. It opens
  // as a **detail tab** rather than expanding in the accordion, because thousands of
  // rows want the whole pane; its DOM is a detached container the browser owns, so
  // the filter text, the selects and the scroll position all survive a tab switch
  // (the panel only hosts it, see info.showNodeBrowser).
  // Its nav is `nodeNav` above (a browser row is already in the open panel, so no
  // popup to close).
  // Its tab key. Unlike every other detail tab this one identifies a *view*, not a
  // node, so it carries no id; the deep-link layer maps it to `#browser=1`.
  const NODES_TAB_KEY = "browser:1";
  // Open (or re-activate) the Data browser tab. Assigned just below; a no-op if the
  // section's markup is missing, so the deep link + the row can call it blind.
  let showNodeBrowser = () => {};
  const nodesToggle = document.getElementById("nodes-toggle");
  if (nodesToggle) {
    const nodesBody = document.createElement("div");
    nodesBody.id = "nodes-body";
    const nodeBrowser = createNodeBrowser({
      body: nodesBody,
      data,
      deps: {
        t,
        formatHalfLife,
        nav: nodeNav,
      },
      ui: {
        pill: info.provenancePill,
        fold: foldText,
        kindLabel: (k) => t(KIND_LABELS[k] || k),
        gradeLabel: (g) => t(GRADE_LABELS[g] || g),
        // The downloadable-file list already lives in the About popup; point at it
        // rather than shipping a second copy of the same links. (Late-bound: the
        // About modal is wired further down in main().)
        openDataFiles: () => aboutModal.openDataFiles(),
      },
    });
    // Lazy: collecting every node walks the whole dataset, so building waits for the
    // first open rather than running at boot; reopening is then just a re-host.
    showNodeBrowser = () => {
      nodeBrowser.open();
      info.showNodeBrowser(nodesBody);
      openDetailTab(NODES_TAB_KEY, t("panel.nodes"), showNodeBrowser);
    };
    // The rows are a wide table and read nothing off the scene, so the browser opens
    // maximized (this visit only, see setNo3d's `persist`).
    nodesToggle.addEventListener("click", () => {
      setNo3d(true, { persist: false });
      showNodeBrowser();
    });
  }

  // Simulation (beta): the same detail-tab shape as the Data browser above (a view,
  // not a node, so its key carries no id and the deep-link layer maps it to
  // `#simulation=1`), and the same detached container, since the picked drugs and the
  // solver's wish list are state a tab switch must not throw away. The drug list
  // itself rides the URL under `sim`, registered further down with the other views.
  const SIM_TAB_KEY = "simulation:1";
  let showSimulation = () => {};
  let simulation = null;
  const simToggle = document.getElementById("simulation-toggle");
  if (simToggle) {
    const simBody = document.createElement("div");
    simBody.id = "simulation-body";
    simulation = createSimulation({
      body: simBody,
      data,
      deps: { t, nav: { drug: (d) => focusDrug(d, { frame: true }) } },
      ui: { fold: foldText },
    });
    simulation.setOnChange(() => urlState.sync(200));
    showSimulation = () => {
      simulation.open();
      info.showSimulation(simBody);
      openDetailTab(SIM_TAB_KEY, t("panel.simulation"), showSimulation);
    };
    // Two plots and a solver want the whole pane, and none of it lights the scene
    // (it is pharmacology, not anatomy), so the tab opens maximized for this visit.
    simToggle.addEventListener("click", () => {
      setNo3d(true, { persist: false });
      showSimulation();
    });
  }

  // Arrow colour-mode switch (Neurotransmitter | Potential): a two-state
  // segmented control in the Controls section. Picking an option recolours the
  // arrows and rebuilds the Projections legend rows to match. The switch lives
  // outside #projections-body, so buildLegend's rebuilds never touch it and these
  // listeners persist for the life of the page.
  const colorModeSwitch = document.getElementById("color-mode");
  const modeButtons = colorModeSwitch.querySelectorAll(".mode-btn");
  const setColorMode = (sign) => {
    if (sign === signColorMode) return;
    signColorMode = sign;
    for (const b of modeButtons) {
      const on = (b.dataset.mode === "sign") === sign;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    }
    applyArrowColors();
    rebuildLegend();
  };
  for (const b of modeButtons) {
    b.addEventListener("click", () => { setColorMode(b.dataset.mode === "sign"); urlState.sync(); });
  }
  // `colors=sign`: which key the arrows are coloured by (transmitter is the default).
  urlState.register("colors", {
    read: () => (signColorMode ? "sign" : null),
    write: (v) => setColorMode(v === "sign"),
    reset: () => setColorMode(false),
  });

  const { autoSpread, autoSpreadIfDeep, arrowRetrim, expandPanel } = wireControls(
    { camera, controls, meshes, arrows, labels, focus, selection, projVis, seeThrough, urlState });
  // Hold arrows a constant apparent width as the camera zooms (advanced by its
  // tick() in the render loop, like arrowRetrim).
  const arrowWidth = createArrowWidth({ arrows, camera, controls, focus });
  const toolbar = wireToolbar({ focus, meshes, arrows, data, selection, tabs, urlState, expandPanel, selectStructure, selectConnection, focusTarget, focusDrug, focusEnzyme, focusEffect, focusCircuit, focusProjectionGroup });
  // A drug panel's clickable Class / Nomenclature opens search with a structured
  // filter (class:"..." / nbn:"...") so you can pivot to the whole class.
  info.onSearch(toolbar.openSearchWithQuery);
  // Clicking a structure illustration / molecule diagram in a panel enlarges it.
  const lightbox = wireImageLightbox();
  info.onImage((src, alt, opts) => lightbox.open(src, alt, opts));
  const shortcutsHelp = wireShortcutsHelp(); // the "?" / keyboard-button popup
  // sourcingModal was created early (wired above, opens on demand); the Legend + About
  // popups link to it via their "Sources & provenance" rows.
  const legendModal = wireLegendModal(sourcingModal); // toolbar legend button / k key
  // "What's new": auto-opens once after an update (below, after the intro settles)
  // and from the About popup's link. Its notes are fetched only when it opens.
  const changelog = createChangelog({
    version: String(window.__APP_VERSION__ || ""),
    sourceUrl: (window.__APP_CONFIG__ || {}).sourceUrl,
    t, pick: window.__I18N__.pick, wireModal,
  });
  const aboutModal = wireAboutModal(sourcingModal, changelog); // the toolbar info-button popup
  wireShortcuts(shortcutsHelp, tabs, selection, lightbox, aboutModal, legendModal, sourcingModal, changelog); // single-key shortcuts (n/s/l/p/k/c/r/m/f/?/Esc) + Tab cycles detail tabs
  projVis.apply(); // established arrows visible, tentative ones start hidden
  // Honor screenshot/deep-link view params (?only=, ?view=, ?explode=, ...).
  applyViewParams({ scene, camera, controls, meshes, arrows, labels, urlState });
  // Scene is built: fill the loading bar. The overlay's dismissal is coupled to
  // the intro launch further below (an interactive load waits for the visitor to
  // click "Start exploring"; an automated view drops it at once), so the brain is
  // revealed just as the assemble intro begins.
  loading.setProgress(1, t("loading.building"));
  console.log(
    `Loaded ${meshes.length} structures and ${arrows.length} projections.`,
  );

  // ---- Guided tour ("See the tutorial") ----------------------------------------------
  // A coach-mark walkthrough (js/tour.js) that shows the main features live: each
  // step's before() drives the real viewer (spread the brain, focus a circuit /
  // receptor / drug, open a section) rather than showing a static picture. It
  // auto-runs ONCE on a first visit (fired from the intro's onSettle below, so it
  // starts only after the assemble settles) and is replayable from the About popup.
  const tourEl = (id) => document.getElementById(id);
  // Expand the controls panel + show the Settings pane (a focus demo swaps the
  // pane out for the Details view, so a later control-spotlight step needs it back).
  const tourExpandPanel = () => {
    const body = tourEl("controls-body");
    if (body && body.hidden) {
      tourEl("controls-toggle")?.setAttribute("aria-expanded", "true");
      body.hidden = false;
    }
    tabs.showSettings();
  };
  // Open the Settings sub-pane (the sliders + toolbar buttons a control spotlight
  // targets); tourCollapseSettings folds it so the browse sections sit up top.
  const tourEnsurePanel = () => {
    tourExpandPanel();
    const cs = tourEl("controls-settings-body");
    if (cs && cs.hidden) tourEl("controls-settings-toggle")?.click();
  };
  const tourCollapseSettings = () => {
    const cs = tourEl("controls-settings-body");
    if (cs && !cs.hidden) tourEl("controls-settings-toggle")?.click();
  };
  const tourOpenSection = (name) => {
    tourEnsurePanel();
    const body = tourEl(`${name}-body`);
    if (body && body.hidden) tourEl(`${name}-toggle`)?.click();
  };
  // Collapse a section so the "tap to open it" interactive step visibly opens it.
  // Runs from a step's before() (which re-fires on Back), so it sets state, not toggles.
  const tourCloseSection = (name) => {
    tourEnsurePanel();
    const body = tourEl(`${name}-body`);
    if (body && !body.hidden) tourEl(`${name}-toggle`)?.click();
  };
  // The browse sections the tour rings as one group (the "Browse the data" step) and
  // collapses beforehand. In on-screen order, which is also the order the caption
  // names them in, so the ring and the sentence read as one list. Enzymes is in it
  // because it sits BETWEEN the others in the panel: the group ring spans them all
  // whether or not it is named, so leaving it out would ring an unnamed section.
  const TOUR_SECTIONS = ["drugs", "receptors", "enzymes", "effects", "structures", "projections"];
  // Collapsing a list is only half of "put it back": a filter the visitor typed
  // survives the fold, so the next step's "tap Olanzapine" can ring a row that the
  // reopened list no longer contains. Cleared through the input's own event, which
  // is what the live filter and the URL both listen to, so this is a typed clear
  // rather than a value assignment the rest of the app never hears about.
  const tourClearFilters = () => {
    for (const id of ["drugs-filter", "search-input"]) {
      const el = tourEl(id);
      if (el && el.value) {
        el.value = "";
        el.dispatchEvent(new Event("input"));
      }
    }
  };
  const tourCollapseSections = () => {
    tourClearFilters();
    for (const name of TOUR_SECTIONS) {
      const b = tourEl(`${name}-body`);
      if (b && !b.hidden) tourEl(`${name}-toggle`)?.click();
    }
  };
  // Clear any focus / isolate / tab / open sourcing modal a previous step left, so
  // each demo starts from a clean scene (idempotent: steps re-run on Back too).
  const tourReset = () => {
    tabs.closeAll();
    selection.clear();
    sourcingModal.close();
    legendModal.close();
  };
  // A FULL reset for the launch of the tour (and its end): everything tourReset does,
  // plus un-spread the brain, recenter the camera, collapse the browse sections, fold
  // the search box, and re-expand the panel. Wired to step 1's before(), so every entry
  // point (auto-start, ?tour=1, the About replay) runs it via go(0) at launch: a
  // derailed UI (a spread brain, an open list, an active animation, a stray search)
  // can never carry into the tour.
  const tourFullReset = () => {
    tourReset();
    // The tour is a tour of a 3D scene, so it always runs (and ends) with the brain
    // on screen, whatever reading mode a step (or the visitor) left behind. Borrowed,
    // never persisted: the visitor's own stored preference is theirs to keep.
    setNo3d(false, { persist: false });
    const sl = tourEl("explode");
    if (sl) { sl.value = "0"; applyExplode(meshes, 0, arrows); }
    const sb = tourEl("search");
    if (sb && !sb.hidden) tourEl("search-toggle")?.click();
    // Force a deterministic launch view: panel expanded, Settings sub-pane open
    // (the sliders visible), the Settings tab focused (tourEnsurePanel), and the
    // browse sections collapsed. So the tour always opens on the same clean state
    // whatever the user left behind.
    tourEnsurePanel();
    tourCollapseSections();
    focus.recenter();
  };

  // The nodes the guided story walks through (resolved once; a missing id just makes
  // its step a caption). The story: Olanzapine (drug) -> its H1 receptor -> a structure
  // (hippocampus) -> a projection system (dopamine), each tapped hands-on.
  const tourOlanzapine = data.drugs.find((d) => d.id === "olanzapine");
  const tourH1 = data.targets.find((x) => x.id === "h1");
  const tourStructMesh = meshById.get("hippocampus_R"); // meshes[0] (R) is the row's pick
  const tourDopGroup = data.projectionGroupsByKey.get("kind:dopaminergic");
  // Direct focus helpers for the structure / projection-group re-open hooks (their
  // legend rows toggle isolate, so re-clicking is not idempotent; focus directly).
  const tourShowStruct = () => selectStructure(tourStructMesh, { frame: true, isolate: true });
  const tourShowDopGroup = () => focusProjectionGroup(tourDopGroup, { frame: true });
  // Re-open a node's detail panel only if it is not already the active tab, so a
  // detail sub-step's before() (which re-runs on Back) never restarts the focus /
  // animation while the user is reading it.
  const tourEnsureTab = (key, node, show) => () => {
    if (node && tabs.activeKey() !== key) show(node);
  };
  // Reset the open details panel to its top. Paired with a tourGateScroll "read this
  // panel" step (24 structure, 28 projection system): if the pane were left scrolled
  // near the bottom (a Back into the step, or a prior deep scroll), the gate's
  // "reached the bottom" test would fire on the user's very first gesture and autoskip
  // the step before they read a word. Forcing scrollTop = 0 here (synchronously, before
  // the gate arms) makes the panel always start at the illustration.
  const tourPanelToTop = () => {
    const pane = document.getElementById("details-pane");
    if (pane) pane.scrollTop = 0;
  };
  // A "read this panel" step's before(): re-open the node's tab if needed, then always
  // start the panel at its top (see tourPanelToTop) so the scroll gate can't autoskip.
  const tourReadPanel = (key, node, show) => () => {
    tourEnsureTab(key, node, show)();
    tourPanelToTop();
  };
  // The olanzapine panel, re-opened only when it is not already the active tab: the
  // drug walk-through (Acts on -> Metabolism -> Drug interactions -> the H1 row) is
  // four sub-steps reading ONE panel, so they share this before().
  const tourDrugPanel = tourEnsureTab("drug:olanzapine", tourOlanzapine, focusDrug);
  // Every detail panel's sections start folded (see foldSections): a step that points
  // INTO one (its rows, or a row in it) runs `ensure` (opens the panel), then opens
  // that section.
  const tourOpenSec = (ensure, sec) => () => {
    ensure();
    const d = document.querySelector(`#details-pane [data-tour-sec="${sec}"]`);
    if (d) d.open = true;
  };
  const tourDrugSec = (sec) => tourOpenSec(tourDrugPanel, sec);
  // The drug panel's collapsed "Drug interactions" <details> (see showDrug). Its step
  // is hands-on (the user opens it), so the step's before() re-collapses it: a Back
  // into the step must leave something to open.
  const tourPkDetails = () =>
    document.querySelector('#details-pane [data-tour-sec="pk"]');
  const tourCollapsePk = () => { const d = tourPkDetails(); if (d) d.open = false; };

  // --- Gesture gates: return a teardown; call signal() when the action happens. See
  // js/tour.js (a gate keeps Next greyed until fired, or auto-advances on gateAdvances).
  const tourGateRotate = (signal) => {
    // OrbitControls "start" fires on a real pointer-down drag, NOT on idle
    // auto-rotate, so a passive spin never trips the gate.
    const on = () => signal();
    controls.addEventListener("start", on);
    return () => controls.removeEventListener("start", on);
  };
  const tourGateSlider = (signal) => {
    // playSequence sets slider.value in JS (no "input" event), so only a real grab fires.
    const el = tourEl("explode");
    if (!el) return () => {};
    const on = () => signal();
    el.addEventListener("input", on);
    return () => el.removeEventListener("input", on);
  };
  // Ungrey (and, with gateAdvances, move on) once a modal closes (its `hidden`
  // attribute flips), watched via a MutationObserver so no blocker is needed over
  // the popup: it stays scrollable + its own close X directly clickable.
  const tourGateModalClosed = (id) => (signal) => {
    const el = tourEl(id);
    if (!el) return () => {};
    const obs = new MutationObserver(() => { if (el.hidden) signal(); });
    obs.observe(el, { attributes: true, attributeFilter: ["hidden"] });
    return () => obs.disconnect();
  };
  const tourGateScroll = (signal) => {
    // Fire once the user has scrolled the details panel "enough": to near the bottom of
    // its scrollable content (or on any scroll gesture if there is almost nothing to
    // scroll, so a short panel can't trap them). Paired with gateAdvances, that moves the
    // tour on by itself rather than merely ungreying Next. A real gesture (wheel / touch /
    // arrow keys) must happen first, so the step's own programmatic scrollTo (which emits
    // "scroll" but no gesture) never trips it.
    const el = document.getElementById("details-pane");
    if (!el) return () => {};
    const NEAR = 24; // px from the bottom that counts as "scrolled enough"
    let userScrolled = false;
    const check = () => {
      if (!userScrolled) return;
      const room = el.scrollHeight - el.clientHeight;
      if (room <= NEAR || el.scrollTop >= room - NEAR) signal();
    };
    const mark = () => { userScrolled = true; check(); };
    el.addEventListener("wheel", mark, { passive: true });
    el.addEventListener("touchmove", mark, { passive: true });
    el.addEventListener("keydown", mark);
    el.addEventListener("scroll", check, { passive: true });
    return () => {
      el.removeEventListener("wheel", mark);
      el.removeEventListener("touchmove", mark);
      el.removeEventListener("keydown", mark);
      el.removeEventListener("scroll", check);
    };
  };
  // Any open detail panel's illustration AND its description text, as one group
  // highlight (the wiki figure carries data-tour-sec="wiki"; the live/baked lead lands
  // in .info-desc paragraphs beside it). Union-highlighted so a "read about it" step
  // frames both, not just the picture. Generic: works for a structure / receptor /
  // projection-group panel alike.
  const tourPanelIntro = () => {
    const pane = document.getElementById("details-pane");
    if (!pane) return [];
    const els = [];
    const fig = pane.querySelector('[data-tour-sec="wiki"]');
    if (fig) els.push(fig);
    pane.querySelectorAll(".info-desc").forEach((p) => els.push(p));
    return els;
  };
  // The active detail tab's close button (the × on the open panel's chip), for the
  // hands-on "close this panel" step; null when no tab is open.
  const tourActiveTabClose = () =>
    document.querySelector(".detail-tab.active .detail-tab-close");
  // The demos are hands-on: the user opens each list and taps the highlighted row
  // themselves (interactive steps in js/tour.js advance on that real tap). The row
  // hooks are `data-tour-id` attributes set in the legend builders; these sample
  // ids must exist in the data (a stale id just leaves the row untargetable).
  // Round a count DOWN to a friendly floor (179 -> 150, 52 -> 50) so the tour's
  // "150+" teasers are always truthful (an undercount), never overstating.
  const tourCount = (n) => { const step = n >= 100 ? 50 : 10; return Math.floor(n / step) * step; };
  const tourSteps = [
    // 1. Welcome (caption). Fully reset the UI here so any entry point starts clean.
    { title: t("tour.welcome.title"), body: t("tour.welcome.body"),
      dim: true, placement: "center", before: tourFullReset },
    // 2. Rotate: dim just the panel (veil), keep the brain draggable; Next ungreys
    //    once the user actually drags it.
    { title: t("tour.rotate.title"), body: t("tour.rotate.body"),
      dim: false, placement: "brain", veil: ["#controls"], gate: tourGateRotate,
      before: tourReset },
    // 3. Separate: sweep the slider off -> max -> middle (replays on Back->Next); Next
    //    ungreys once the user grabs the slider themselves.
    { title: t("tour.separate.title"), body: t("tour.separate.body"),
      target: "#explode", dim: false, spotlightOnly: true, gate: tourGateSlider,
      clickThrough: "#explode",
      before: () => { tourReset(); tourEnsurePanel(); autoSpread.playSequence([0, 1, 0, 0.5]); } },
    // 4-5. The legend, before any data: the scene is already colour-coded, so the key
    //    to it belongs early. Same open/close shape as the Sources pair below.
    { title: t("tour.legendOpen.title"), body: t("tour.legendOpen.body"),
      target: "#legend-toggle", interactive: true, scrollTo: true,
      before: () => { tourReset(); tourEnsurePanel(); } },
    { title: t("tour.legendLook.title"), body: t("tour.legendLook.body"),
      target: "#legend-close", dim: false, spotlightOnly: true,
      clickThrough: "#legend-modal", bubbleDock: "bottom",
      gate: tourGateModalClosed("legend-modal"), gateAdvances: true,
      before: () => legendModal.open() },
    // 6. Sourcing: tap the Sources button (opens the popup, auto-advances).
    { title: t("tour.sourcesOpen.title"), body: t("tour.sourcesOpen.body"),
      target: "#sourcing-toggle", interactive: true, scrollTo: true,
      before: () => { tourReset(); tourEnsurePanel(); } },
    // 7. Sourcing detail: explain the popup, ringing just its close X with NO page
    //    dim (spotlightOnly) so the breakdown it points at stays fully readable. No
    //    blocker (a gate, not interactive), so the popup stays scrollable; clickThrough
    //    keeps its controls (incl. the X) live, and closing it advances (gateAdvances).
    { title: t("tour.sourcesDetail.title"), body: t("tour.sourcesDetail.body"),
      target: "#sourcing-close", dim: false, spotlightOnly: true,
      clickThrough: "#sourcing-modal", bubbleDock: "bottom",
      gate: tourGateModalClosed("sourcing-modal"), gateAdvances: true,
      before: () => sourcingModal.open() },
    // 8-9. The Data browser, straight after "every fact is graded": that popup gives
    //    the tally, this list gives the facts it counted. Opening it borrows the
    //    reading mode (the rows are a wide table), which sets up the two view
    //    toggles below: the visitor has just seen the brain go away, so the button
    //    that brings it back has something to undo.
    { title: t("tour.nodesOpen.title"), body: t("tour.nodesOpen.body"),
      target: "#nodes-toggle", interactive: true, scrollTo: true,
      before: () => {
        tourReset();
        setNo3d(false, { persist: false });
        tourExpandPanel();
        tourCollapseSettings();
        tourCollapseSections();
      } },
    { title: t("tour.nodesLook.title"), body: t("tour.nodesLook.body"),
      target: () => ["#nodes-filter", ".node-filters"],
      dim: false, scrollTo: true, scrollAlign: "top",
      before: () => {
        if (tabs.activeKey() !== NODES_TAB_KEY) showNodeBrowser();
        setNo3d(true, { persist: false });
      } },
    // 10-11. The two view toggles, as a pair of opposites: bring the 3D back (the
    //    browser above hid it), then fold the panel away and leave the brain alone.
    { title: t("tour.show3d.title"), body: t("tour.show3d.body"),
      target: "#toggle-3d", interactive: true,
      before: () => { tourReset(); setNo3d(true, { persist: false }); tourExpandPanel(); } },
    { title: t("tour.collapsePanel.title"), body: t("tour.collapsePanel.body"),
      // stayAfterTap: the fold is the thing to watch, so the step holds while the
      // panel collapses and Next (not the tap) moves on. The ring hugs the
      // "neurarium" title, not the full-row hit button, whose centre sits on the
      // byline's author link; a tap on the title falls through to that button.
      target: "#controls-header .panel-title", tapTarget: "#controls-toggle",
      interactive: true, stayAfterTap: true,
      before: () => {
        tourReset();
        setNo3d(false, { persist: false });
        tourExpandPanel();
      } },
    // 12. Browse: highlight the five sections as a group, each teased with a rounded-
    //    down count ("150+"), always an honest undercount (see tourCount).
    { title: t("tour.browse.title"),
      body: t("tour.browse.body", {
        structures: tourCount(data.structures.length),
        // data.projections is L/R-expanded at load (symmetric twins share one id),
        // so its length double-counts; the node count (what the collapsed browse
        // list shows) is the canonical tally total.
        projections: tourCount(
          data.meta?.provenanceStats?.by_kind?.projections?.total ??
            data.projections.length,
        ),
        receptors: tourCount(data.targets.length),
        drugs: tourCount(data.drugs.length),
      }),
      target: () => TOUR_SECTIONS.map((n) => `#${n}-toggle`),
      scrollTo: true, // the four headings must land in view as a block, not half off it
      before: () => { tourReset(); tourExpandPanel(); tourCollapseSettings(); tourCollapseSections(); } },
    // 13-14. Drugs first: open the list, then tap Olanzapine (opens its panel and plays
    //    the effect animation live on the brain).
    { title: t("tour.openDrugs.title"), body: t("tour.openDrugs.body"),
      target: "#drugs-toggle", interactive: true, scrollTo: true,
      before: () => { tourReset(); tourCloseSection("drugs"); } },
    { title: t("tour.drugTap.title"), body: t("tour.drugTap.body"),
      target: '[data-tour-id="drug:olanzapine"]', interactive: true, scrollTo: true,
      before: () => tourOpenSection("drugs") },
    // 15. The drug's "Direct molecular targets" list (dim:false so the live animation stays visible). The
    //    body flags the drug animations as the least-scientific, still-WIP part.
    { title: t("tour.drugActs.title"), body: t("tour.drugActs.body"),
      target: '[data-tour-sec="bindings"]', dim: false, scrollTo: true, scrollAlign: "top",
      before: tourDrugSec("bindings") },
    // 16-17. Still the same panel, further down: the pharmacokinetic half. The enzymes
    //    that clear it (sourced nodes), then the drug -> drug interactions those roles
    //    imply, collapsed so the user opens it themselves (stayAfterTap keeps the step
    //    up so the list it reveals is readable).
    { title: t("tour.drugMetabolism.title"), body: t("tour.drugMetabolism.body"),
      target: '[data-tour-sec="metabolism"]', dim: false, scrollTo: true,
      scrollAlign: "top", before: tourDrugSec("metabolism") },
    { title: t("tour.drugPk.title"), body: t("tour.drugPk.body"),
      target: () => {
        const d = tourPkDetails();
        return d ? d.querySelector("summary") : null;
      },
      interactive: true, stayAfterTap: true, dim: false, scrollTo: true,
      scrollAlign: "top", // the list it opens unfolds BELOW the summary: leave it room
      before: () => { tourDrugPanel(); tourCollapsePk(); } },
    // 18. Follow one binding, the H1 receptor row, to that receptor's own panel.
    { title: t("tour.drugToReceptor.title"), body: t("tour.drugToReceptor.body"),
      target: '[data-tour-id="ixtarget:h1"]', interactive: true, scrollTo: true,
      before: tourDrugSec("bindings") },
    // 19-20. Walk the receptor (H1) panel: how it is classified, then where it is found.
    { title: t("tour.receptorFacts.title"), body: t("tour.receptorFacts.body"),
      target: '[data-tour-sec="facts"]', dim: false, scrollTo: true,
      before: tourEnsureTab("target:h1", tourH1, focusTarget) },
    { title: t("tour.receptorRegions.title"), body: t("tour.receptorRegions.body"),
      target: '[data-tour-sec="regions"]', dim: false, scrollTo: true,
      before: tourOpenSec(tourEnsureTab("target:h1", tourH1, focusTarget), "regions") },
    // 21. Back out of the receptor panel by hand (tap its close ×).
    { title: t("tour.closePanel.title"), body: t("tour.closePanel.body"),
      target: tourActiveTabClose, interactive: true,
      before: tourEnsureTab("target:h1", tourH1, focusTarget) },
    // 22-23. Structures: open the list, then tap the hippocampus row (isolates it).
    { title: t("tour.openStructures.title"), body: t("tour.openStructures.body"),
      target: "#structures-toggle", interactive: true, scrollTo: true,
      before: () => tourCloseSection("structures") },
    { title: t("tour.structureTap.title"), body: t("tour.structureTap.body"),
      target: '[data-tour-id="structure:hippocampus"]', interactive: true, scrollTo: true,
      before: () => tourOpenSection("structures") },
    // 24. Read the structure panel (illustration + description; scroll to proceed).
    { title: t("tour.structureLook.title"), body: t("tour.structureLook.body"),
      target: tourPanelIntro, dim: false, scrollTo: true, scrollFree: true,
      gate: tourGateScroll, gateAdvances: true,
      before: tourReadPanel("structure:hippocampus_R", tourStructMesh, tourShowStruct) },
    // 25. Back out of the structure panel by hand.
    { title: t("tour.closePanel.title"), body: t("tour.closePanel.body"),
      target: tourActiveTabClose, interactive: true,
      before: tourEnsureTab("structure:hippocampus_R", tourStructMesh, tourShowStruct) },
    // 26-27. Projections: open the list, then tap a projection SYSTEM (Dopamine), NOT a
    //    circuit; it pins that system's pathways and streams the by-mechanism flow.
    { title: t("tour.openProjections.title"), body: t("tour.openProjections.body"),
      target: "#projections-toggle", interactive: true, scrollTo: true,
      before: () => tourCloseSection("projections") },
    { title: t("tour.projectionTap.title"), body: t("tour.projectionTap.body"),
      target: '[data-tour-id="group:kind:dopaminergic"]', interactive: true, scrollTo: true,
      before: () => tourOpenSection("projections") },
    // 28. Read the projection-system panel (member pathways + description).
    { title: t("tour.projectionLook.title"), body: t("tour.projectionLook.body"),
      target: tourPanelIntro, dim: false, scrollTo: true, scrollFree: true,
      gate: tourGateScroll, gateAdvances: true,
      before: tourReadPanel("group:kind_dopaminergic", tourDopGroup, tourShowDopGroup) },
    // 29-30. Get to search by hand: tap Settings (back to the main panel), then the
    //    magnifier (opens the search box). Both auto-advance on the real tap.
    { title: t("tour.backToSettings.title"), body: t("tour.backToSettings.body"),
      target: "#tab-settings", interactive: true,
      before: tourEnsureTab("group:kind_dopaminergic", tourDopGroup, tourShowDopGroup) },
    { title: t("tour.openSearch.title"), body: t("tour.openSearch.body"),
      target: "#search-toggle", interactive: true,
      before: () => tabs.showSettings() },
    // 31. Search demo: the box is open + live (dim:false); clickThrough keeps it
    //    clickable under the guard so they can focus + type a name.
    { title: t("tour.search.title"), body: t("tour.search.body"),
      target: "#search .search-modal", dim: false, clickThrough: "#search",
      before: () => { tourExpandPanel(); toolbar.openSearchWithQuery(""); } },
    // 32. Wrap (spotlight the About button, where the tour can be replayed).
    { title: t("tour.wrap.title"), body: t("tour.wrap.body"),
      target: "#about-toggle", before: () => { tourReset(); tourEnsurePanel(); } },
  ];
  const tour = createTour({
    steps: tourSteps,
    labels: {
      next: t("tour.next"), back: t("tour.back"), done: t("tour.done"),
      skip: t("tour.skip"), aria: t("tour.aria"), scrollHint: t("tour.scrollHint"),
      step: (n, total) => t("tour.step", { n, total }),
    },
    seenKey: "neurarium:tourSeen",
    // Restore a clean default view once the tour ends (completed or skipped).
    onEnd: tourFullReset,
  });
  // `?tour=1` forces the tour on every load, bypassing the once-per-visitor
  // "seen" gate and the eligibility checks (handy for testing / a shared link
  // that always runs it). It still waits for the intro (and won't stack on an
  // open Sources popup) below.
  const tourForced = new URLSearchParams(window.location.search).get("tour") === "1";
  // Auto-start only on a genuinely fresh view: not a screenshot / deep-link mode,
  // and nothing already focused (a hash deep link, or a click during the intro).
  const tourEligible = () => {
    const p = new URLSearchParams(window.location.search);
    return p.get("ui") !== "0" && !p.has("explode")
      && !tabs.activeKey() && !selection.getSelected();
  };
  // Replay from the About popup (close it first so the tour isn't behind it).
  tourEl("about-tour")?.addEventListener("click", () => {
    aboutModal.close();
    tour.start();
  });
  // Auto-start waits for the assemble intro to settle, and declines to stack on an
  // open popup (Sources, or the "What's new" notes that now open at launch): the
  // Sources one no longer opens on launch, but a visitor could open it manually
  // during the intro, so if either is up we defer and the observer retries the moment
  // it closes. (Mid-tour the observer is a no-op: maybeAutoStart/start bail when the
  // tour is already active, so the sourcing open / close steps can't restart it.)
  // Two gates, not one. `sceneSettled` means the launch is over however it ended;
  // `introCompleted` means the assemble reached its natural end, which the tour
  // requires so it never starts over a user's own action.
  let sceneSettled = false;
  let introCompleted = false;
  let tourForcedStarted = false; // one-shot guard for the ?tour=1 forced start
  const tourGateEls = ["sourcing-modal", "changelog-modal"].map(tourEl).filter(Boolean);
  const tourGateOpen = () => tourGateEls.some((el) => !el.hidden);
  const tryAutoTour = () => {
    if (!sceneSettled || tourGateOpen()) return;
    if (tourForced) {
      // Forced: ignore the seen gate + eligibility, but never re-trigger.
      if (!tourForcedStarted) { tourForcedStarted = true; tour.start(); }
    } else if (introCompleted) {
      tour.maybeAutoStart(tourEligible());
    }
  };
  /** The launch is over; `completed` says the assemble reached its natural end. */
  const settleScene = (completed) => {
    sceneSettled = true;
    if (completed) introCompleted = true;
    tryAutoTour();
  };
  for (const el of tourGateEls) {
    new MutationObserver(tryAutoTour)
      .observe(el, { attributes: true, attributeFilter: ["hidden"] });
  }
  /**
   * "What's new" at LAUNCH, not at settle: release notes are about the build, not
   * about the scene, so a returning visitor reads them the moment they click through
   * the overlay rather than several seconds later once the assemble has finished.
   * (It used to ride the tour's settle gate, which is what made it wait, and which
   * also lost it entirely on a load where the intro was cancelled.) Fire-and-forget
   * and one-shot: it decides for itself whether there is anything to show, and the
   * tour gates on its popup above so the two never stack.
   */
  let changelogTried = false;
  const showChangelogOnce = () => {
    if (changelogTried) return;
    changelogTried = true;
    changelog.showIfUnseen();
  };

  // Auto-play the "assemble" intro on a plain load. Grabbing the explode slider
  // cancels it so a manual drag wins. Skipped when ?explode= is pinned (deep
  // links / headless screenshots) so the requested static amount is honored.
  const explodeSlider = document.getElementById("explode");
  const intro = createIntroAnimation(
    { meshes, arrows, slider: explodeSlider, camera, controls, focus,
      // The assemble re-fits the arrows in `fast` mode, so it borrows the same
      // deferred precise re-trim the manual spread uses.
      retrim: arrowRetrim,
      // Once the assemble settles, offer the tour (once per visitor, and not while
      // the Sources popup is open: see tryAutoTour). Fires on a cancel too, with
      // completed=false, which settles the scene without earning the tour.
      onSettle: settleScene });
  explodeSlider.addEventListener("input", () => intro.cancel());
  // The launch (assemble intro, or an instant settle when animations are off) is
  // wrapped so it can fire exactly when the loading overlay is dismissed below.
  const beginScene = () => {
    if (!new URLSearchParams(window.location.search).has("explode")) {
      // Seat the resting pose on the exact framing the reset button produces, so a
      // fresh load already appears centered (not a hardcoded distance that only
      // roughly matched). Done first, so the DEV-banner nudge + intro capture build
      // on the centered pose.
      focus.frameAllNow();
      // When the dev / WIP banner is up (DEV=1 container; same flag dev-banner.js
      // reads), present the brain a little lower + further back so it sits clear
      // below the banner. Done before intro.start() so the captured resting pose
      // (what the intro settles on) already includes it.
      if ((window.__APP_CONFIG__ || {}).dev === "1") {
        camera.position.multiplyScalar(DEV_BANNER_UNZOOM);
        controls.target.y += DEV_BANNER_DROP;
        controls.update();
      }
      // The assemble intro is a decorative animation, so honor the Animations toggle:
      // when off, present the brain already whole (explode 0) instead of playing it in.
      if (animSettings.enabled) {
        intro.start();
      } else {
        applyExplode(meshes, 0, arrows);
        // No assemble intro to finish (so onSettle never fires); settle after a short
        // beat. It counts as completed: there was no animation for the user to cut
        // short, so the tour is as welcome here as after a full assemble.
        setTimeout(() => settleScene(true), 500);
      }
    } else if (tourForced) {
      // ?explode= pinned: the intro block above is skipped, so onSettle never fires.
      // A forced tour still wants to run, so settle the gate condition after a beat.
      setTimeout(() => settleScene(false), 500);
    }
  };
  // Dismiss the loading overlay, coupled to the launch. An automated view (headless
  // ui=0, or an ?explode= deep-link / screenshot) drops it at once so a capture is
  // never trapped behind the overlay; a normal interactive load keeps it up showing
  // the "Start exploring" button (so the tagline + invite can be read) and launches
  // on the click, the assemble intro playing as the overlay fades.
  const introParams = new URLSearchParams(window.location.search);
  if (introParams.get("ui") === "0" || introParams.has("explode")) {
    // An automated view (headless capture, deep-link screenshot) is not a visit, so it
    // launches with no release notes over the shot.
    loading.done();
    beginScene();
  } else {
    loading.waitForStart().then(() => {
      beginScene();
      showChangelogOnce();
    });
  }

  // ---- Deep links: the URL fragment IS the UI state ------------------------------
  // Everything on screen is described by the fragment, through the js/url-state.js
  // registry: which detail tabs are open and in what order, which one is active, the
  // popup showing, the scene sliders + toggles, the panel layout, the open browse
  // section, the search / filter text, and the camera. Each control registers its own
  // {read, write} pair as it is wired (see the urlState.register calls in wireControls
  // / wireToolbar / below); this block adds the ones that need the loaded data, then
  // applies the incoming URL and starts mirroring later changes back into it.
  //
  // Two url-state.js rules keep links short and safe to paste: a view at its default
  // writes nothing, and a key the URL does not carry is left alone, so a link that
  // says nothing about (say) animations never overrides that visitor's own preference.
  const linkFold = (s) => foldText(String(s == null ? "" : s));
  const findByIdOrName = (list, v) => {
    const q = linkFold(v);
    return list.find((o) => linkFold(o.id) === q)
        || list.find((o) => linkFold(o.name) === q);
  };
  // How to reopen one detail tab from the `<id>` half of its `<kind>:<id>` key. A tab
  // key IS the link value, so the URL round-trips the strip verbatim, and each opener
  // re-runs the very select* the UI would, so the 3D focus comes back with the panel.
  // Returns whether it matched. This is also the whole vocabulary the legacy single-
  // focus params resolve through, so each node kind has exactly one resolver.
  const TAB_OPENERS = {
    drug: (v) => { const d = findByIdOrName(data.drugs, v); if (d) focusDrug(d, { frame: true }); return !!d; },
    target: (v) => { const tg = findByIdOrName(data.targets, v); if (tg) focusTarget(tg, { frame: true }); return !!tg; },
    circuit: (v) => { const c = findByIdOrName(data.circuits, v); if (c) focusCircuit(c, { frame: true }); return !!c; },
    group: (v) => { const g = findByIdOrName(data.projectionGroups, v); if (g) focusProjectionGroup(g, { frame: true }); return !!g; },
    enzyme: (v) => { const e = findByIdOrName(data.enzymes || [], v); if (e) focusEnzyme(e); return !!e; },
    effect: (v) => { const e = findByIdOrName(data.effects || [], v); if (e) focusEffect(e); return !!e; },
    structure: (v) => {
      // The exact (sided) id first, so a link round-trips the very mesh the tab named;
      // then the base, which is what a hand-written `#tabs=structure:hippocampus` says.
      const exact = meshes.find((m) => linkFold(m.userData.structure.id) === linkFold(v));
      if (exact) { selectStructure(exact, { frame: true, isolate: true }); return true; }
      const q = linkFold(stripSide(v));
      const group = meshes.filter((m) => {
        const s = m.userData.structure;
        return linkFold(stripSide(s.id)) === q || linkFold(s.base_name) === q || linkFold(s.name) === q;
      });
      if (!group.length) return false;
      const rep = group.find((m) => !/_[LR]$/.test(m.userData.structure.id)) || group[0];
      selectStructure(rep, { frame: true, isolate: true });
      return true;
    },
    connection: (v) => {
      // Same two passes: the exact sided `from->to` a tab key carries, then the
      // side-stripped pair (or the pathway label) a hand-written link uses, which pins
      // both hemispheres the way a search pick does.
      const q = linkFold(v);
      const exact = arrows.find(
        (a) => linkFold(`${a.projection.from}->${a.projection.to}`) === q);
      if (exact) { selectConnection(exact, { frame: true, isolate: true }); return true; }
      const byBase = new Map();
      for (const a of arrows) {
        const p = a.projection;
        const key = `${stripSide(p.from)}->${stripSide(p.to)}`;
        (byBase.get(key) || byBase.set(key, []).get(key)).push(a);
      }
      for (const [key, arr] of byBase) {
        if (linkFold(key) === q || linkFold(arr[0].projection.label) === q) {
          selectConnection(arr[0], { frame: true, isolate: true, siblings: arr.slice(1) });
          return true;
        }
      }
      return false;
    },
    // Not a node: the Data browser, a tab whose content is the whole dataset.
    browser: () => { showNodeBrowser(); return true; },
    // Nor is this one: the Simulation tab, a view over the dataset rather than a
    // node in it. Its own `sim` key carries which drugs are in it.
    simulation: () => { showSimulation(); return true; },
  };
  const openTabKey = (key) => {
    const idx = key.indexOf(":");
    const kind = key.slice(0, idx);
    const open = idx > 0 && Object.hasOwn(TAB_OPENERS, kind) ? TAB_OPENERS[kind] : null;
    return !!open && open(key.slice(idx + 1));
  };

  // `tabs=<kind>:<id>,...`: every open detail tab, in strip order (which the user can
  // drag to change, so the order is state too). Applying opens each in turn, which
  // rebuilds the same strip and leaves the LAST one active; `tab` below corrects that
  // when the active one is not the last.
  urlState.register("tabs", {
    read: () => (tabs.keys().length ? tabs.keys().join(LIST_SEP) : null),
    write: (v) => { for (const key of v.split(LIST_SEP)) if (key) openTabKey(key); },
  });
  // `tab=<index>`: which of them is active. Omitted for the common case (the last one,
  // where opening the list already lands); `s` means the pinned Settings tab is showing
  // with detail tabs still open behind it.
  urlState.register("tab", {
    read: () => {
      const keys = tabs.keys();
      if (!keys.length) return null;
      if (tabs.activeKey() === null) return "s";
      const at = keys.indexOf(tabs.activeKey());
      return at === keys.length - 1 ? null : String(at);
    },
    write: (v) => {
      if (v === "s") { tabs.showSettings(); return; }
      const key = tabs.keys()[Number(v)];
      if (key) tabs.activate(key);
    },
  });
  // `sim=<id>[:<ratio>],...`: the Simulation tab's picked drugs, in list order, each
  // with its relative dose (omitted at the default 1, which is the common case). The
  // rest of the tab (the threshold, the solver's wish list) is a reading aid rather
  // than a view worth reproducing, so it stays out of the link.
  urlState.register("sim", {
    read: () => {
      const picks = simulation ? simulation.getDrugs() : [];
      if (!picks.length) return null;
      return picks.map((p) => (p.ratio === 1 ? p.id : `${p.id}:${p.ratio}`)).join(LIST_SEP);
    },
    write: (v) => {
      if (!simulation) return;
      simulation.setDrugs(v.split(LIST_SEP).filter(Boolean).map((part) => {
        const at = part.indexOf(":");
        return at > 0
          ? { id: part.slice(0, at), ratio: Number(part.slice(at + 1)) }
          : { id: part, ratio: 1 };
      }));
    },
  });

  // The legacy single-focus links (`#focusDrug=vortioxetine`, `#browser=1`) that are
  // already shared around: read-only aliases for one `tabs` entry, applied before it
  // (priority -10) so an explicit `tabs=` wins. They read as null, or the same focus
  // would be written twice; the first sync rewrites such a link to the canonical form.
  const LEGACY_FOCUS = {
    focusDrug: "drug", focusTarget: "target", focusReceptor: "target",
    focusStructure: "structure", focusConnection: "connection",
    focusCircuit: "circuit", focusGroup: "group", browser: "browser",
    simulation: "simulation",
  };
  for (const [param, kind] of Object.entries(LEGACY_FOCUS)) {
    urlState.register(
      param, { read: () => null, write: (v) => TAB_OPENERS[kind](v) }, -10);
  }

  // `popup=<name>`: the .modal-overlay on screen, if any. One key, because only one is
  // ever up (opening one from another, e.g. the Legend's "Sources & provenance" link,
  // closes the first). The image lightbox is deliberately absent: it shows a picture
  // reached from a panel, not a state of the UI.
  const POPUPS = {
    about: aboutModal, legend: legendModal, sources: sourcingModal,
    shortcuts: shortcutsHelp, whatsnew: changelog,
  };
  urlState.register("popup", {
    read: () => Object.keys(POPUPS).find((name) => POPUPS[name].isOpen) || null,
    write: (v) => {
      for (const [name, ctrl] of Object.entries(POPUPS)) {
        if (name !== v && ctrl.isOpen) ctrl.close();
      }
      if (Object.hasOwn(POPUPS, v)) POPUPS[v].open();
    },
  });
  // Every popup goes through wireModal, so one hook keeps the key current.
  setModalToggle(() => urlState.sync());

  // Apply the incoming URL (after the intro exists, so a focused node cancels the
  // assemble intro rather than fighting its explode tween), then keep the address bar
  // mirroring the UI: copying it is just selecting the URL bar, no dedicated button.
  // The sync also normalizes a legacy / hand-written link into the canonical fragment.
  if (urlState.applyHash()) intro.cancel();
  urlState.sync();
  urlState.start();

  // On-demand rendering: a mostly-static brain has no reason to repaint at 60fps,
  // which only burns battery / spins fans / throttles phones. We render a frame
  // only when something actually changed: an animation is running (each tick()
  // below reports whether it is active), the controls moved (OrbitControls.update
  // returns true while damping settles or auto-rotate spins), or `invalidate()`
  // was called. `invalidate` is wired to every user input below as a catch-all so
  // no interaction is ever missed, and the controls' own `change` event covers
  // every camera move (drag / wheel / pinch / programmatic). When truly idle (no
  // input, no animation) the loop calls only the cheap tick/update checks and
  // skips the render + CSS2D passes entirely, holding the last drawn frame.
  let needsRender = true;
  const invalidate = () => { needsRender = true; };
  // Hand the render loop to everything wired before it existed (the theme's scene
  // repaint); see the `repaint` hook in scene/setup.js.
  setRepaint(invalidate);
  controls.addEventListener("change", invalidate);
  window.addEventListener("resize", invalidate);

  // Adaptive rendering (Task): lower the pixel ratio + animation detail when frames
  // drop, raise it back when they recover. Fed once per frame below with whether an
  // animated render actually happened.
  const adaptive = createAdaptiveQuality({ renderer, baseDpr });

  // Toggling the Animations checkbox flips animSettings; react to it here (where the
  // decorative controllers live): repaint once so a static frame draws, and when
  // turning OFF, halt the circuit traveling pulse (its beads persist otherwise; the
  // gem/wash controllers freeze themselves in their own tick()s). Turning back ON
  // resumes motion on the next focus.
  animSettings.subscribe(() => {
    if (!animSettings.enabled) circuitAnim.stop();
    invalidate();
  });
  // Belt-and-suspenders: any user input repaints, so adding a new control never
  // needs to remember to call invalidate. Capture phase + passive so this only
  // observes (it never preventDefaults, leaving the real handlers untouched).
  for (const ev of ["pointerdown", "pointermove", "pointerup", "wheel",
                    "keydown", "input", "change", "click"]) {
    window.addEventListener(ev, invalidate, { capture: true, passive: true });
  }

  // Animation-speed slider (Controls > Settings): a persisted multiplier that every
  // animated module applies (js/anim-settings.js `speed`). Revealed only while an
  // animation is actually on screen (a focused drug / receptor / circuit); its
  // visibility is recomputed each rendered frame below, so it appears the instant one
  // starts and hides the instant the focus clears, with no per-controller bookkeeping.
  // The input is a linear 0..1; map it GEOMETRICALLY onto the [min,max] speed range so
  // the midpoint (0.5) reads as 1x (min*max == 1 by construction, see anim-settings.js).
  const speedRow = document.getElementById("anim-speed-row");
  const speedSlider = document.getElementById("anim-speed");
  const { min: SPD_MIN, max: SPD_MAX } = animSettings.speedRange;
  const sliderToSpeed = (v) => SPD_MIN * Math.pow(SPD_MAX / SPD_MIN, v);
  const speedToSlider = (s) => Math.log(s / SPD_MIN) / Math.log(SPD_MAX / SPD_MIN);
  if (speedSlider) {
    speedSlider.value = String(speedToSlider(animSettings.speed));
    speedSlider.addEventListener("input", () => {
      animSettings.setSpeed(sliderToSpeed(parseFloat(speedSlider.value)));
      invalidate(); // repaint so the new pace takes visible effect at once
    });
    // `speed=<multiplier>`: the multiplier itself (1 = the reference pace), not the
    // slider's linear position, so the link stays meaningful if the mapping changes.
    const writeSpeed = (v) => {
      if (!Number.isFinite(parseFloat(v))) return;
      animSettings.setSpeed(parseFloat(v));
      speedSlider.value = String(speedToSlider(animSettings.speed));
      invalidate();
    };
    // Apply-only, like `anim`: the speed is a persisted personal preference.
    urlState.register("speed", { read: () => null, write: writeSpeed,
      reset: () => writeSpeed("1") });
  }
  const animationShown = () => animSettings.enabled
    && (drugAnim.active || receptorMarkers.active || circuitAnim.active);
  const updateSpeedRow = () => {
    if (!speedRow) return;
    const show = animationShown();
    if (speedRow.hidden === show) speedRow.hidden = !show; // write only on a change
  };
  updateSpeedRow(); // initial: hidden (nothing focused yet)

  // Panel-only ("reading") mode (#toggle-3d in the panel header): the stylesheet
  // hides the canvas + label overlay and lets the expanded panel fill the viewport,
  // for reading the sourced texts without a brain behind them. Persisted, since it
  // is a lasting preference about how the site is used, not a per-visit action.
  // Day/night (#toggle-theme, beside it): a pure viewing preference, so it owns no
  // app state at all. js/theme.js persists the choice and repaints the scene; the
  // button only flips it and re-announces itself, since its label names the theme a
  // click would GIVE you, not the one showing.
  const themeBtn = document.getElementById("toggle-theme");
  if (themeBtn) {
    const labelTheme = () => {
      const next = theme.get() === "dark" ? "light" : "dark";
      const label = t(next === "light" ? "panel.themeLight" : "panel.themeDark");
      themeBtn.setAttribute("title", label);
      themeBtn.setAttribute("aria-label", label);
    };
    labelTheme();
    themeBtn.addEventListener("click", () => { theme.toggle(); labelTheme(); });
  }

  const NO3D_KEY = "neurarium.no3d";
  const toggle3d = document.getElementById("toggle-3d");
  const no3dOn = () => document.body.classList.contains("no-3d");
  // Like the theme button just above, this one's label names the state a click would
  // GIVE you, so it is re-announced on every flip rather than filled once from the
  // markup: `aria-pressed` alone left the tooltip, the accessible name AND the search
  // row (which reads a control's title, see commandRows) offering to hide a 3D model
  // that was already hidden.
  const label3d = () => {
    const label = t(no3dOn() ? "panel.show3d" : "panel.no3d");
    toggle3d?.setAttribute("title", label);
    toggle3d?.setAttribute("aria-label", label);
  };
  label3d();
  // `persist` is what separates the two ways in: the header button states a lasting
  // preference, while a view that merely wants the room (the Data browser) borrows
  // the mode for this visit and must not rewrite what the visitor chose.
  const setNo3d = (on, { persist = true } = {}) => {
    if (on === no3dOn()) return;
    // With no brain behind it a collapsed panel would leave a blank viewport, so
    // entering the reading mode maximizes the panel rather than hiding everything.
    if (on) expandPanel();
    document.body.classList.toggle("no-3d", on);
    toggle3d?.setAttribute("aria-pressed", String(on));
    label3d();
    if (persist) saveFlag(NO3D_KEY, on);
    if (!on) invalidate(); // the scene is back and holds a stale frame; repaint it
    else intro.cancel(); // nothing renders while hidden, so don't resume mid-pose
    urlState.sync(); // whether the brain is shown is part of the shareable link
  };
  toggle3d?.addEventListener("click", () => setNo3d(!no3dOn()));
  // The mirror of setNo3d's expandPanel: entering the reading mode opens the panel so
  // it has something to fill, and folding the panel back down leaves the reading mode
  // for the same reason. A collapsed panel with no brain behind it is a bare black
  // viewport, which is never a state the visitor asked for. This listener is added
  // after wireControls' own (it runs second), so the body's `hidden` already reflects
  // the click; a collapse is therefore read off the DOM rather than re-derived.
  document.getElementById("controls-toggle")?.addEventListener("click", () => {
    if (document.getElementById("controls-body")?.hidden && no3dOn()) setNo3d(false);
  });
  // The persisted preference first, so the link registered below (which may have been
  // parked since the hash was applied) is the one that wins: `#panel=0` must be able to
  // force the brain back on for a visitor whose stored preference is the reading mode.
  if (loadFlag(NO3D_KEY, false)) setNo3d(true);
  // `#panel=1` opens straight into the reading mode, `#panel=0` forces the brain back
  // on; a link that says nothing about it leaves the persisted preference alone.
  urlState.register("panel", {
    read: () => (no3dOn() ? "1" : null),
    write: (v) => setNo3d(v !== "0"),
  });

  // A framing tween (focusing a node, recentering, the explode re-aim) moves the
  // camera over several frames, so the URL's `cam` is only right once it settles:
  // record it on the tween's falling edge rather than per frame.
  let camWasMoving = false;

  renderer.setAnimationLoop(() => {
    // Panel-only mode: the scene (canvas + label overlay) is display:none, so skip
    // the ticks and the render entirely. Animations freeze in place and resume when
    // 3D returns, repainted by setNo3d's invalidate().
    if (no3dOn()) return;
    // Advance the intro + any focus/recenter tween before controls.update()
    // reads the target + camera position for this frame. Each tick() returns
    // whether it animated this frame; controls.update() returns whether the
    // camera moved (damping / auto-rotate). Any true keeps us rendering.
    let active = false;
    if (intro.tick()) active = true;
    if (autoSpread.tick()) active = true;
    if (arrowRetrim.tick()) active = true;
    const camMoving = focus.tick();
    if (camMoving) active = true;
    else if (camWasMoving) urlState.sync(); // tween done: the settled view is the link's
    camWasMoving = camMoving;
    if (circuitAnim.tick()) active = true;
    if (receptorMarkers.tick()) active = true;
    if (drugAnim.tick()) active = true;
    if (controls.update()) active = true;
    // After controls.update() so it reads this frame's settled camera distance.
    if (arrowWidth.tick()) active = true;
    // After controls.update() so the fade reads this frame's camera + target.
    if (seeThrough.tick()) active = true;
    if (active) needsRender = true;
    const rendered = needsRender;
    // Adaptive quality watches the frame time of actually-rendered animated frames
    // and may step the pixel ratio down/up; a level change forces one more repaint.
    if (adaptive.tick(rendered && active)) needsRender = true;
    if (!needsRender) return; // idle: skip the render + label passes this frame
    needsRender = false;
    // Reveal/hide the speed slider from the live animation state. Cheap + guarded to a
    // no-op when unchanged; a stop always triggers one final render here, so it can't
    // stay stuck visible after the focus clears.
    updateSpeedRow();
    renderer.render(scene, camera);
    // CSS2D labels render as a separate DOM pass after the WebGL frame.
    labels.render(scene, camera);
  });
}

main();
