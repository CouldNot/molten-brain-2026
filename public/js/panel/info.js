// The detail panel: createInfoPanel builds the shared panel kit (pills, sections,
// reference links, addon slots) and returns the show*() views, each in panel/views/.

import { attachTip, closeOpenTip } from "./tooltip.js";
import { clipLead, fetchWikiLead } from "../wiki.js";
import { deriveReleaseChanges, transmitterVars } from "../release-modulation.js";
import { flashRow, foldSections } from "./dom.js";
import { formatConditions, groupWorkup } from "../workup.js";
import { groupByVariant, variantsForDrug } from "../receptor-variants.js";
import { groupTargetsBySystem } from "../legend/targets.js";
import { showEffect } from "./views/effect.js";
import { showCircuit } from "./views/circuit.js";
import { showProjectionGroup } from "./views/projection-group.js";
import { show } from "./views/connection.js";
import { showStructure } from "./views/structure.js";
import { showReceptor } from "./views/receptor.js";
import { showTarget } from "./views/target.js";
import { showEnzyme } from "./views/enzyme.js";
import { showDrug } from "./views/drug.js";
import { makePills } from "./pills.js";
import { makeAddons } from "./addons.js";
import { makeBindings } from "./bindings.js";

const { ofNoun, t } = window.__I18N__;

/**
 * Build the detail panel renderer. The panel is a **node view**: each show*()
 * method renders one node (a connection / structure / receptor / target / drug /
 * circuit / projection group) plus the nodes linked to it (a receptor's "Found in"
 * regions + interacting drugs, a drug's target bindings, a structure's pathways,
 * ...), each linked node clickable to navigate to it. See the Nodes section of
 * CLAUDE.md. It is pure rendering: opening the matching tab + applying the 3D focus
 * is the caller's job (the select* layer in main(), which calls openDetailTab), so
 * this is reused unchanged whether a node is first picked or re-shown via its tab.
 * @param {import("../data.js").BrainData} data
 */
export function createInfoPanel(data, sourcingModal) {
  const body = document.getElementById("info-body");
  // The pane, not #info-body, is the scrolling box (see the overflow rules in
  // index.html); every show*() rebuilds the body inside it.
  const pane = document.getElementById("details-pane");
  // Start every view at the top. Replacing the body's children leaves the pane's
  // scrollTop wherever the *previous* (possibly much taller) panel was, so a click
  // deep in a long panel would open the next one already scrolled into its middle,
  // with no visible reason. One helper instead of a line per show*(), so a new view
  // cannot forget it.
  const clearBody = (view = "") => {
    // A pinned tooltip lives in <body>, not in the panel, so it would outlive the
    // row it explains (its reposition only notices on the next scroll).
    closeOpenTip();
    body.innerHTML = "";
    body.dataset.view = view;
    if (pane) pane.scrollTop = 0;
  };
  // The sections a reader unfolded, remembered per kind of view (drug, receptor, ...)
  // and re-opened on every later panel of that kind, so switching drug -> drug keeps
  // Pharmacokinetics open for a side-by-side read instead of folding it back up.
  // Kept current by the toggle listener below, which also sees a flashRow jump.
  const openByView = new Map(); // view -> Set of section keys
  const sectionKey = (det) => det.dataset.tourSec
    || (det.querySelector(":scope > summary")?.textContent || "").replace(/[\d()]/g, "").trim();
  body.addEventListener("toggle", (e) => {
    const det = e.target;
    if (det.parentElement !== body || !det.classList.contains("panel-sec")) return;
    const view = body.dataset.view;
    if (!openByView.has(view)) openByView.set(view, new Set());
    const open = openByView.get(view);
    if (det.open) open.add(sectionKey(det)); else open.delete(sectionKey(det));
  }, true); // capture: toggle does not bubble
  // foldSections, then unfold what the reader had open on this kind of view.
  const foldBody = () => {
    foldSections(body);
    const open = openByView.get(body.dataset.view);
    if (!open) return;
    for (const det of body.querySelectorAll(":scope > details.panel-sec"))
      if (open.has(sectionKey(det))) det.open = true;
  };
  const nameOf = (id) => data.byId.get(id)?.name || id;
  // Hemisphere-stripped name ("Frontal lobe", not "Right frontal lobe"): used by
  // every pathway list so left/right twins collapse to one row (see pathwayList).
  const baseNameOf = (id) => data.byId.get(id)?.base_name || nameOf(id);

  // The pick handlers below are set by the caller (on*() at the bottom). Each is a
  // stable function forwarding to whatever handler is registered at call time, so a
  // view can capture it before the caller has wired anything.
  const pickHandlers = {};
  const delegate = (key) => (...args) => pickHandlers[key]?.(...args);
  // Set by the caller (onConnection): what to do when a connection row in a
  // structure panel is clicked. The panel only knows projections, so the caller
  // maps the projection to its arrow and does the framing/halo/connection-panel.
  const onConnectionPick = delegate("onConnectionPick");
  // Set by the caller (onTarget): what to do when a binding row in a drug panel is
  // clicked. The panel hands back the resolved target entry; the caller focuses it
  // exactly like its "Receptors & targets" legend row.
  const onTargetPick = delegate("onTargetPick");
  // Set by the caller (onStructure): what to do when a region row in a receptor /
  // target panel's "Found in" list is clicked. The panel hands back the structure
  // *base* id; the caller resolves it to a mesh and jumps to that structure.
  const onStructurePick = delegate("onStructurePick");
  // Set by the caller (onDrug): what to do when a drug row in a receptor / target
  // panel's "Interacting drugs" list is clicked. The panel hands back the drug
  // record; the caller focuses it exactly like its Drugs legend row / search pick.
  const onDrugPick = delegate("onDrugPick");
  const onEnzymePick = delegate("onEnzymePick");
  // Set by the caller (onEffect): open an effect's panel (the Effects section, BETA),
  // from a receptor panel's Effects row or a drug panel's derived "could cause" row.
  const onEffectPick = delegate("onEffectPick");
  // Set by the caller (onProjectionGroup): what to do when a projection-group row in
  // a drug panel's "Neurotransmitter tone" list is clicked. The panel hands back the
  // group record; the caller focuses it exactly like its Projections legend row.
  const onProjectionGroupPick = delegate("onProjectionGroupPick");
  // Set by the caller (onSearch): run a search query. A drug panel's clickable
  // Class / Nomenclature values hand back a `field:"value"` query string; the caller
  // opens the search box pre-filled with it (see wireToolbar.openSearchWithQuery).
  const onSearchPick = delegate("onSearchPick");
  // Set by the caller (onImage): pop a panel illustration up large. The panel hands
  // back (src, alt, {invert}); the caller shows it in the image lightbox.
  const onImagePick = delegate("onImagePick");
  // Resolve a drug binding's `target` key to its merged-list entry, so a binding
  // row can focus that target (a receptor entry shares its id; a non-receptor one
  // its drug_targets key). Only focusable entries become clickable.
  const targetById = new Map(data.targets.map((tg) => [tg.id, tg]));
  const drugById = new Map((data.drugs || []).map((d) => [d.id, d]));
  const enzymeById = new Map((data.enzymes || []).map((e) => [e.id, e]));
  const effectById = new Map((data.effects || []).map((e) => [e.id, e]));

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // True when a structure *base* id maps to a modeled structure (the base itself
  // for a midline form, or its _R / _L hemispheres), i.e. it is reachable in the
  // atlas and so can be jumped to. tools/check_data.py enforces that every
  // receptor / target location resolves, so an unresolved base should not occur in
  // shipped data; the panel still degrades to plain (non-clickable) text if one does.
  // Resolve a structure *base* id to its modeled record: the base itself (a midline
  // form), else its _R / _L hemisphere, else null. The one place the hemisphere-suffix
  // fallback lives, so baseResolves and groupOfBase can't drift.
  const resolveBase = (base) =>
    data.byId.get(base) || data.byId.get(`${base}_R`)
      || data.byId.get(`${base}_L`) || null;
  const baseResolves = (base) => !!resolveBase(base);

  // The anatomical group (lobe / basal_ganglia / ...) a structure *base* belongs to,
  // or null if it doesn't resolve. Lets the "Found in" list group its regions the
  // same way the Structures legend does.
  const groupOfBase = (base) => resolveBase(base)?.group ?? null;

  // One "Found in" region row: the name (clickable -> jump when the base resolves)
  // plus, when `meta` is given, its own per-region provenance pill (since "found in
  // region B" is graded per region, separate from the mechanism/type pill above).
  const locationRow = (name, base, meta, density) => {
    const li = el("li");
    li.appendChild(el("span", "loc-name", name));
    // A non-human expression claim (the source was checked in rat/mouse/monkey,
    // not human) is flagged with a small amber tag, the same convention as the Ki
    // chip; a human (or unsourced) row shows none. The full assay species is also
    // in the provenance pill's tooltip below.
    if (meta && meta.nonHuman) {
      const tag = el("span", "loc-species",
        t("receptor.speciesTag", { species: speciesLabel(meta.species) }));
      tag.title = t("receptor.speciesTip", { species: speciesLabel(meta.species) });
      li.appendChild(tag);
    }
    if (base && baseResolves(base)) {
      li.classList.add("clickable");
      li.addEventListener("click", () => onStructurePick(base));
    }
    if (meta) li.appendChild(locationPill(meta));
    // How much sits here, when the owner carries a measured profile: a bar scaled
    // against its own strongest region (see densityEntry) plus the signed z, since a
    // bar alone would read as an absolute quantity it is not. Last in the row so the
    // bars line up in a column at the panel edge and the pill keeps its spot by the name.
    // Ternary, not `density && ...`: that yields null (not undefined) for an owner with
    // no profile, which the `!== undefined` guard would wave through into z.toFixed().
    const z = density ? density.profile[base] : undefined;
    if (z !== undefined) {
      const signed = `${z > 0 ? "+" : ""}${z.toFixed(2)}`;
      const wrap = el("span", "loc-density");
      wrap.title = t("receptor.densityValueTip", { z: signed });
      const bar = el("span", "loc-density-bar");
      bar.style.setProperty("--fill", `${Math.round(density.rel[base] * 100)}%`);
      wrap.appendChild(bar);
      wrap.appendChild(el("span", "loc-density-z", signed));
      li.appendChild(wrap);
    }
    return li;
  };

  // The "Found in" region list shared by showReceptor / showTarget: parallel arrays
  // of display names + their base ids (+ optional per-region provenance `info`).
  // Rows are grouped under anatomical-group headings in the SAME order as the
  // Structures legend (data.meta.groupLabels key order), so the list reads like that
  // panel and the extra vertical spacing keeps the provenance pills from crowding.
  // Bases that don't resolve to a group fall into a trailing "other" bucket (with a
  // heading only when there are also real groups; an all-unresolved list stays flat).
  const locationList = (names, bases, info, density) => {
    const buckets = new Map(); // group key (or null) -> [{name, base, meta}]
    names.forEach((name, i) => {
      const base = bases && bases[i];
      const g = base ? groupOfBase(base) : null;
      if (!buckets.has(g)) buckets.set(g, []);
      buckets.get(g).push({ name, base, meta: info && info[i] });
    });
    const order = [...Object.keys(data.meta.groupLabels), null]
      .filter((g) => buckets.has(g));
    const container = el("div", "loc-groups");
    // The profile is ONE claim over the whole list, so its caption + grade pill sit
    // above the rows rather than repeating on each: what varies per row is the value,
    // what is graded once is the measurement. The caption also carries how well the
    // donors agreed, so a reader can weigh the bars instead of trusting them blind.
    if (density) {
      const cap = el("p", "loc-density-caption", t("receptor.density"));
      cap.title = t("receptor.densityTip");
      const r = `${density.reliability > 0 ? "+" : ""}${density.reliability.toFixed(2)}`;
      const agree = el("span", "loc-density-agree",
        t("receptor.densityAgreement", { r }));
      agree.title = t("receptor.densityAgreementTip", {
        donors: density.donors,
        min: (data.meta.densityMinReliability ?? 0).toFixed(2),
      });
      cap.appendChild(agree);
      cap.appendChild(nodePill(density));
      container.appendChild(cap);
    }
    for (const g of order) {
      if (g !== null) {
        container.appendChild(el("h4", "loc-group-label", data.meta.groupLabels[g]));
      } else if (order.length > 1) {
        container.appendChild(el("h4", "loc-group-label", t("receptor.foundOther")));
      }
      const ul = el("ul");
      for (const { name, base, meta } of buckets.get(g)) {
        ul.appendChild(locationRow(name, base, meta, density));
      }
      container.appendChild(ul);
    }
    return container;
  };

  // receptor_effect (BETA) section heading: the label plus the same quiet "beta"
  // qualifier the Simulation section wears (.beta-tag, i18n sim.beta).
  const betaHeading = (key, vars) => {
    const h = el("h3", null, t(key, vars));
    h.appendChild(el("span", "beta-tag", t("sim.beta")));
    return h;
  };

  // The shell every list section of a panel shares (effects, release modulation,
  // demographics, variants, workup): a tour-anchored block, its heading (with the
  // quiet "beta" tag unless `beta: false`), its caption, then either one list (`ul`)
  // or, `grouped`, one sub-heading + list per `group(label)` call (a label string, or
  // a ready heading node). `close()` appends the not-medical-advice style caveat
  // (`caveatKey`) after the content and mounts the section on the panel.
  const betaSection = (tourSec, headingKey, hintKey,
    { vars, grouped = false, caveatKey = null, beta = true, cls = "info-effects" } = {}) => {
    const sec = el("div", `info-locations ${cls}`);
    sec.dataset.tourSec = tourSec;
    sec.appendChild(beta ? betaHeading(headingKey, vars) : el("h3", null, t(headingKey, vars)));
    sec.appendChild(el("p", "legend-caption", t(hintKey)));
    const ul = grouped ? null : sec.appendChild(el("ul"));
    const group = (label, headCls = "loc-group-label") => {
      sec.appendChild(typeof label === "string" ? el("h4", headCls, label) : label);
      return sec.appendChild(el("ul"));
    };
    const close = () => {
      if (caveatKey) sec.appendChild(el("p", "var-caveat", t(caveatKey)));
      body.appendChild(sec);
    };
    return { sec, ul, group, close };
  };
  // One derived "via" chip on a drug panel: the binding (jumps to its target) plus
  // the pill of the receptor-level node it was joined with.
  const viaChip = (binding, node) => {
    const tgt = targetById.get(binding.target);
    const chip = el("button", "eff-chip",
      `${binding.targetName} (${binding.actionLabel || binding.action})`);
    chip.type = "button";
    if (tgt && tgt.focusable) chip.addEventListener("click", () => onTargetPick(tgt));
    else chip.disabled = true;
    const wrap = el("span", "eff-via-item");
    wrap.append(chip, nodePill(node));
    return wrap;
  };
  // One derived drug-panel row: its conditional sentence (or a ready head node, the
  // effect panel's drug name), then one via chip each.
  const derivedRow = (text, via) => {
    const li = el("li", "eff-row");
    li.appendChild(typeof text === "string" ? el("span", "loc-name", text) : text);
    const box = el("span", "eff-via");
    for (const { binding, node } of via) box.appendChild(viaChip(binding, node));
    li.appendChild(box);
    return li;
  };

  // A row head that opens a panel: the effect panel from a receptor / drug panel's
  // effect row, a drug from the effect panel's drug list. A plain `.loc-name` when
  // `onClick` is null (an effect absent from the index cannot happen, but stays inert).
  const linkName = (text, onClick) => {
    const span = el("span", "loc-name", text);
    if (onClick) {
      span.classList.add("eff-link");
      span.addEventListener("click", onClick);
    }
    return span;
  };
  const effectLink = (effectId, text) => {
    const effect = effectById.get(effectId);
    return linkName(text, effect ? () => onEffectPick(effect) : null);
  };

  // A receptor / target panel's "Effects" section (BETA): one row per receptor_effect
  // node, "<effect> · <mode>" with that node's own pill. An owner with no effect but a
  // recorded search (`unknown`, {searched, corpora}) gets one row with the blue UNKNOWN
  // pill naming that search; with neither, nothing.
  const appendEffects = (rows, unknown) => {
    if ((!rows || !rows.length) && !unknown) return;
    const { ul, close } = betaSection("effects", "effects.heading", "effects.hint");
    if (!rows || !rows.length) {
      const li = el("li");
      li.appendChild(el("span", "loc-name", t("effects.unknown")));
      li.appendChild(sourceBackedPill("unknown", { unknown }));
      ul.appendChild(li);
    }
    for (const e of rows || []) {
      const li = el("li");
      li.appendChild(effectLink(e.effect, e.label));
      li.appendChild(el("span", "eff-mode", e.modeLabel));
      li.appendChild(nodePill(e));
      ul.appendChild(li);
    }
    close();
  };

  // The drug panel's derived "Possible effects via its bindings" (BETA): the drug's
  // directional bindings joined with the receptor_effect nodes of their targets, read
  // from the build-time effect index (data.possibleEffectsByDrug, see
  // tools/data_generators/effect_index.py). Never stored, and worded conditionally: it
  // says what acting on these receptors can cause, never that this drug does.
  // Folded with the rest of the drug panel by its final foldSections.
  const appendPossibleEffects = (drug) => {
    const effects = data.possibleEffectsByDrug.get(drug.id) || [];
    if (!effects.length) return;
    const { ul, close } = betaSection("effects", "effects.drugHeading", "effects.drugHint");
    for (const e of effects) {
      ul.appendChild(derivedRow(effectLink(e.effect, t("effects.couldCause", { effect: e.label })),
        e.via));
    }
    close();
  };

  // " in <structure>" for a release-modulation line, or "" when the node names none.
  const inStructure = (base) => (base
    ? t("relmod.inStructure", { structure: resolveBase(base)?.base_name
        || resolveBase(base)?.name || base })
    : "");

  // A receptor panel's "Downstream" section (BETA): one row per
  // receptor_release_modulation node, "activating it decreases dopamine release"
  // + "heteroreceptor on GABA interneurons in VTA" with that node's own pill.
  const appendDownstream = (rows) => {
    if (!rows || !rows.length) return;
    const { ul, close } = betaSection("downstream", "relmod.heading", "relmod.hint");
    for (const n of rows) {
      const li = el("li", "eff-row");
      li.appendChild(el("span", "loc-name", t(`relmod.activation.${n.effect}`,
        transmitterVars(n.transmitterLabel, ofNoun))));
      li.appendChild(nodePill(n));
      li.appendChild(el("span", "eff-mode eff-site", t("relmod.site",
        { kind: n.kindLabel, cell: n.cellLabel, where: inStructure(n.structure) })));
      ul.appendChild(li);
    }
    close();
  };

  // A receptor / target panel's "Across age and sex" section (BETA): one row per
  // receptor_demographic node, a direction chip ("↓ Age") then the conditional
  // sentence ("reported to decline with age in Caudate nucleus") with that node's own
  // pill, and the paper's own magnitude wording under it when it states one.
  const appendDemographics = (rows) => {
    if (!rows || !rows.length) return;
    const { ul, close } = betaSection("demographics", "demog.heading", "demog.hint");
    for (const n of rows) {
      const li = el("li", "eff-row");
      li.appendChild(el("span", "demog-chip", `${n.glyph} ${n.factorLabel}`));
      li.appendChild(el("span", "loc-name", t(n.textKey, { where: inStructure(n.structure) })));
      li.appendChild(nodePill(n));
      if (n.magnitude) {
        li.appendChild(el("span", "eff-mode eff-site", t("demog.magnitude", { magnitude: n.magnitude })));
      }
      ul.appendChild(li);
    }
    close();
  };

  // One receptor_variant row: the evidence-level chip (its meaning on hover), the
  // conditional sentence, the node's pill (ClinPGx's per-genotype sentences on hover),
  // then a muted line with the phenotypes, the population and the ClinPGx link.
  // `prefix` names the variant when the row is not already under its heading.
  const variantRow = (row, prefix) => {
    const li = el("li", "var-row");
    li.appendChild(attachTip(el("span", "var-level",
      t("variant.level", { level: row.level, strength: row.strength })), row.levelLabel));
    const drugs = [...row.drugs.map((d) => d.name), ...row.drugNames].join(", ");
    const category = row.categories.join(", ");
    const text = drugs ? t("variant.assoc", { category, drugs })
      : t("variant.assocNoDrug", { category });
    li.appendChild(el("span", "loc-name",
      prefix ? t("variant.withVariant", { variant: prefix, text }) : text));
    li.appendChild(nodePill(row));
    const meta = el("span", "var-meta",
      [row.phenotypes.join(", "),
       row.population ? t("variant.population", { population: row.population }) : ""]
        .filter(Boolean).join(" · "));
    if (row.url) {
      const a = el("a", null, t("variant.link"));
      a.href = row.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.title = t("variant.linkTitle");
      if (meta.textContent) meta.appendChild(document.createTextNode(" · "));
      meta.appendChild(a);
    }
    li.appendChild(meta);
    return li;
  };

  // A receptor / target panel's "Genetic variants" section (ClinPGx #20): the gene's
  // annotated variants, one sub-heading per variant, strongest level first, folded,
  // with the not-medical-advice caveat once at the end.
  const appendVariants = (rows) => {
    if (!rows || !rows.length) return;
    const { group, close } = betaSection("variants", "variant.heading", "variant.hint",
      { beta: false, cls: "info-variants", grouped: true, caveatKey: "variant.caveat" });
    for (const g of groupByVariant(rows)) {
      const ul = group(g.variant, "var-name");
      for (const row of g.rows) ul.appendChild(variantRow(row));
    }
    close();
  };

  // The drug panel's "Gene variants annotated for this drug": every receptor_variant
  // node naming this drug, grouped under the target whose gene carries it (the
  // heading jumps to that target). Folded with the rest of the drug panel.
  const appendDrugVariants = (drug) => {
    const hits = variantsForDrug(drug.id, data.targets);
    if (!hits.length) return;
    const { group, close } = betaSection("variants", "variant.drugHeading", "variant.drugHint",
      { beta: false, cls: "info-variants", grouped: true, caveatKey: "variant.caveat" });
    const byTarget = new Map();
    for (const { target, row } of hits) {
      if (!byTarget.has(target)) byTarget.set(target, []);
      byTarget.get(target).push(row);
    }
    for (const [target, rows] of byTarget) {
      const head = el("h4", "var-name");
      const chip = el("button", "var-target", target.name);
      chip.type = "button";
      if (target.focusable) chip.addEventListener("click", () => onTargetPick(target));
      else chip.disabled = true;
      head.appendChild(chip);
      const ul = group(head);
      for (const row of rows) ul.appendChild(variantRow(row, row.variant));
    }
    close();
  };

  // The drug panel's derived "Possible release changes" (BETA): its directional
  // bindings joined with the release-modulation nodes of their receptors
  // (js/release-modulation.js), an antagonist flipping the effect of activation and
  // affinity_only contributing nothing. Computed, never stored, worded conditionally.
  const appendReleaseChanges = (drug) => {
    const changes = deriveReleaseChanges(
      drug.bindings, (tid) => data.modulationByTarget.get(tid) || [], data.meta.effectModes);
    if (!changes.length) return;
    const { ul, close } = betaSection("downstream", "relmod.drugHeading", "relmod.drugHint");
    for (const c of changes) {
      ul.appendChild(derivedRow(t(`relmod.could.${c.direction}`,
        { ...transmitterVars(c.transmitterLabel, ofNoun), where: inStructure(c.structure) }), c.via));
    }
    close();
  };

  // A drug panel's "Checks before and during treatment" section (BETA): one row per
  // drug_workup node, grouped by timing, each with its own pill (the RCP sentence on
  // hover). Neutral wording ("the French label asks for"), plus the not-medical-advice
  // caveat, since a label's checklist is a regulatory text, not a care plan.
  const appendWorkup = (drug) => {
    if (!drug.workup || !drug.workup.length) return;
    const { group, close } = betaSection("workup", "drug.workup", "drug.workupHint",
      { grouped: true, caveatKey: "drug.workupCaveat" });
    for (const g of groupWorkup(drug.workup)) {
      const list = group(t(`drug.workup.${g.timing}`));
      for (const n of g.rows) {
        const li = el("li", "eff-row");
        li.appendChild(el("span", "loc-name", n.testLabel));
        const cond = formatConditions(n, t("drug.workupOnlyIf"));
        if (cond) li.appendChild(el("span", "workup-cond", cond));
        li.appendChild(nodePill(n));
        list.appendChild(li);
      }
    }
    close();
  };

  // One route endpoint (a structure id) for the connection panel's route line: its
  // name, made clickable to jump to (and isolate) that structure when the id
  // resolves to a modeled mesh, exactly like a "Found in" region row. A non-
  // resolving id degrades to plain text.
  const endpointEl = (id) => {
    const name = nameOf(id);
    if (id && baseResolves(id)) {
      const b = el("button", "conn-endpoint", name);
      b.type = "button";
      b.addEventListener("click", () => onStructurePick(id));
      return b;
    }
    return el("span", null, name);
  };

  // Shared label / value row for the classification "facts" block (receptor,
  // target and drug views), optionally led by a coloured swatch so a row's colour
  // matches the dots + legend. Empty values are skipped.
  const addFactRow = (facts, label, value, color, opts = {}) => {
    const links = opts.links && opts.links.filter((lk) => lk && lk.text);
    // Render if there is a value, clickable links, or just a trailing pill (a
    // "Source: [pill]" row carries only the grade pill, no text value).
    if (!value && !(links && links.length) && !opts.pill) return;
    const r = el("div", "info-fact");
    r.appendChild(el("span", "fact-label", label));
    const v = el("span", "fact-value");
    if (color) {
      const sw = el("span", "swatch line");
      sw.style.background = color;
      v.appendChild(sw);
    }
    if (links && links.length) {
      // Clickable parts (a drug's Class / Nomenclature) that each run a search,
      // joined by ", " inside one inline wrapper so the commas flow naturally
      // (the row itself is a flex container).
      const wrap = el("span", "fact-links");
      links.forEach((lk, i) => {
        if (i) wrap.appendChild(document.createTextNode(", "));
        const btn = el("button", "fact-link", lk.text);
        btn.type = "button";
        btn.addEventListener("click", () => onSearchPick(lk.query));
        wrap.appendChild(btn);
      });
      v.appendChild(wrap);
    } else {
      v.appendChild(document.createTextNode(value));
    }
    // Optional trailing provenance pill (e.g. the NbN's quote source), so a
    // sourced fact carries the same grade pill as a binding row.
    if (opts.pill) v.appendChild(opts.pill);
    // Optional muted trailing note (e.g. flagging a non-standard nomenclature).
    if (opts.note) v.appendChild(el("span", "fact-note", opts.note));
    r.appendChild(v);
    facts.appendChild(r);
  };

  // Shared by the structure / receptor / drug / target views: an external reference
  // link, rendered only for an http(s) url so a stray field can never inject markup.
  // A present link carries no provenance pill: the description just above it already
  // shows a "sourced" grade for the same Wikipedia source, so a second pill grading
  // the link only repeated it. A missing reference still renders the label + the
  // red NOSOURCE pill, so the gap stays visible like a source.
  const appendWiki = (url) => {
    const ok = typeof url === "string" && /^https?:\/\//i.test(url);
    const wrap = el("div", "info-wiki");
    if (ok) {
      const a = el("a", null, t("info.wikipedia"));
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      wrap.appendChild(a);
      // Stash the reference link so a successful live-lead fetch can relocate it
      // up into the description as that text's source marker (see
      // liveWikiDescription), in place of a grade pill: for a live verbatim read
      // the link both names the source and reaches it, so a checkmark beside a
      // link to the very same source is redundant.
      wrap._refLink = a;
    } else {
      wrap.appendChild(el("span", null, t("info.reference")));
      wrap.appendChild(makeProvenancePill(null)); // no reference -> NOSOURCE pill
    }
    body.appendChild(wrap);
    return wrap; // returned so it can anchor a live Wikipedia description below it
  };

  // Append an external "look this up" link (a search-by-name convenience that lands
  // on a results page, e.g. EMA / FDA / Drugs.com for a drug, PDSP for a receptor)
  // onto a reference row's wiki wrap, after a `·` separator. Not a source for any
  // specific claim, so it carries no provenance pill; only linked (navigated to),
  // never fetched, so the CSP is unaffected.
  const appendLookupLink = (wrap, labelKey, href, titleKey) => {
    wrap.appendChild(el("span", "ref-sep", "·"));
    const a = el("a", null, t(labelKey));
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = t(titleKey);
    wrap.appendChild(a);
    return a;
  };
  // The PDSP Ki database has no URL-addressable per-target search, so every
  // receptor/target links to the same browse page (a "go look it up" convenience).
  const PDSP_KIDB_URL = "https://pdspdb.unc.edu/kidb2/kidb/web/kis-results/index";
  // PharmFreq is a Shiny app whose tools are in-page tabs, so it has no per-gene URL
  // either: the link is the same "go look it up" browse convenience as PDSP's, and it
  // is worth having because the Metabolizer status tool covers genes we do not model.
  const PHARMFREQ_URL = "https://pharmfreq.com/";
  // UniProt + Guide to Pharmacology (GtoPdb) name searches for a receptor: land on
  // each site's results page for the receptor's name. UniProt is filtered to human
  // (model_organism 9606). Convenience search links (navigated to, never fetched),
  // so no CSP change + no provenance pill.
  const uniprotSearchUrl = (name) =>
    `https://www.uniprot.org/uniprotkb?query=${encodeURIComponent(name)}&facets=model_organism%3A9606`;
  // ClinPGx (the former PharmGKB) name search: pharmacogenomics for a drug (which
  // gene variants change its response), for its pharmacokinetic pathways
  // (`type: "Pathway"`), and for a metabolizing enzyme. Same convenience-search
  // shape as the others (navigated to, never fetched).
  const clinpgxSearchUrl = (name, type = "") =>
    "https://www.clinpgx.org/search?query=" + encodeURIComponent(name)
    + (type ? "&type=" + encodeURIComponent(type) : "");
  const gtopdbSearchUrl = (name) =>
    "https://www.guidetopharmacology.org/GRAC/DatabaseSearchForward?searchString="
    + encodeURIComponent(name)
    + "&searchCategories=all&species=none&type=all&comments=includeComments&order=rank";

  // Live Wikipedia description, shared by every panel carrying a `wikipedia` link
  // (drug / receptor / structure / target). Best-effort: it fetches the current
  // lead for the viewer's locale (js/wiki.js, English fallback) and shows it as one
  // or more "sourced" info-desc paragraphs. `paragraph` is a baked description <p>
  // to swap
  // in place (drug/receptor); when there is none a fresh <p> is inserted relative to
  // `anchor` (the wiki link wrap) only once the live text arrives, so a structure /
  // target with no baked description gains one only on success. `before` puts that
  // fresh paragraph *above* the anchor (so the live description reads above the link
  // it backs, matching the baked-description panels); default is below. A failed /
  // blocked / absent fetch is a no-op, so the panel is unchanged offline. When the
  // live lead arrives it always rewrites the paragraph (text + green Wikipedia pill),
  // replacing any baked fallback: a live fetch is a programmatic verbatim read of the
  // article, so it grades higher than the baked snapshot it supersedes.
  const liveWikiDescription = (url, {
    paragraph = null, anchor = null, before = false, linkWrap = null,
  } = {}) => {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return;
    fetchWikiLead(url, window.__I18N__.lang).then((live) => {
      if (!live || !live.text) return;
      let p = paragraph;
      if (p) {
        if (!p.isConnected) return; // panel re-rendered to something else
      } else {
        if (!anchor || !anchor.isConnected) return; // panel gone / replaced
        p = el("p", "info-desc");
        anchor[before ? "before" : "after"](p);
      }
      // The live lead is the full intro (several newline-separated paragraphs).
      // Collapsed (the default) only the first paragraph shows, clipped to ~300
      // characters (clipLead); a "Read more" toggle expands the whole intro in
      // place and "Show less" folds it back. The source marker always trails
      // the last visible paragraph, so it all reads as one sourced block.
      const paras = live.text.split(/\n+/).map((s) => s.trim()).filter(Boolean);
      const full = paras.length ? paras : [live.text];
      const preview = clipLead(full[0]);
      // Provenance for a live verbatim read is the Wikipedia link itself, shown
      // here in place of a green ✓ pill: a checkmark beside a link to the very
      // same source added nothing (its tooltip only pointed back at the link),
      // whereas the link makes plain the text is *from* Wikipedia and clicks
      // through to it. Relocate the reference-row link up here (reusing the node,
      // so there is no duplicate) and style it as the green source pill, then
      // tidy the row it left: drop a now-leading "·" separator, and the whole row
      // if only the reference lived there (lookup links, if any, stay).
      const refLink = linkWrap && linkWrap._refLink;
      let marker;
      if (refLink && refLink.isConnected) {
        refLink.classList.add("src-pill", "src-prov-wikipedia", "wiki-src");
        marker = refLink;
        refLink.remove(); // detach first, so the row's new first child is inspected
        const lead = linkWrap.firstElementChild;
        if (lead && lead.classList.contains("ref-sep")) lead.remove();
        if (!linkWrap.querySelector("a")) linkWrap.remove();
      } else {
        marker = makeProvenancePill("wikipedia"); // fallback marker
      }
      const toggle = (full.length > 1 || preview !== full[0])
        ? el("button", "wiki-more") : null;
      let extras = [];
      const render = (expanded) => {
        for (const x of extras) x.remove();
        extras = [];
        p.textContent = expanded ? full[0] : preview; // detaches toggle + marker
        let last = p;
        if (expanded) {
          for (const text of full.slice(1)) {
            const extra = el("p", "info-desc", text);
            last.after(extra);
            extras.push(extra);
            last = extra;
          }
        }
        if (toggle) {
          toggle.textContent = t(expanded ? "wiki.readLess" : "wiki.readMore");
          toggle.setAttribute("aria-expanded", String(expanded));
          last.append(" ", toggle);
        }
        last.append(" ", marker);
      };
      if (toggle) {
        toggle.type = "button";
        toggle.addEventListener("click", () => {
          render(toggle.getAttribute("aria-expanded") !== "true");
        });
      }
      render(false);
    });
  };

  // The canonical "intro" block shared by EVERY node panel (structure / receptor
  // / target / drug): the baked description paragraph (when the node has one) with
  // its provenance pill, then the Wikipedia reference link *below* the text it
  // backs, then the live-lead refresh. Centralizing it guarantees the same
  // element order and the same sourcing treatment on every panel, instead of each
  // show*() re-composing the two and drifting (which is how the link came to sit
  // above the description on some panels and below it on the drug one). `description`
  // is the baked text (omit for a structure/target, which carry none); a present
  // wiki link with no baked description still gains the live lead *above* it.
  const appendReference = ({
    url, description = "", descriptionProvenance = "",
    descriptionExtra = "",
  } = {}) => {
    let paragraph = null;
    if (description) {
      paragraph = el("p", "info-desc", description);
      if (descriptionProvenance) {
        paragraph.appendChild(document.createTextNode(" "));
        paragraph.appendChild(
          makeProvenancePill(descriptionProvenance, descriptionExtra));
      }
      body.appendChild(paragraph);
    }
    // Link goes after the description so the reference sits below the text it backs.
    const wiki = appendWiki(url);
    liveWikiDescription(url, paragraph
      ? { paragraph, linkWrap: wiki }
      : { anchor: wiki, before: true, linkWrap: wiki });
    return { paragraph, wiki };
  };

  // Wikipedia illustration block (hero + lazy "show more" gallery), shared by the
  // structure and circuit panels: both hot-link a Wikimedia hero (resolved by
  // tools/fetch_structure_images.py) plus an optional gallery of further gif/svg.
  // Multi-MB, so hot-linked not vendored (CSP img-src allows upload.wikimedia.org),
  // with a spinner while loading and a silent figure-removal on failure. Colour art,
  // so never inverted. `altName` names the subject for the alt text; the gallery is
  // built lazily on first expand so the extra images never load unless asked. No-op
  // when there is no hero, so a panel can call it unconditionally.
  const appendWikiImages = (heroUrl, gallery, altName, tourSec = "") => {
    if (!heroUrl) return;
    const figure = (src) => {
      const fig = el("figure", "structure-image loading");
      fig.appendChild(el("div", "img-spinner"));
      const img = document.createElement("img");
      img.alt = t("structure.imageAlt", { name: altName });
      img.loading = "lazy";
      img.decoding = "async";
      img.title = t("image.zoomHint");
      img.dataset.optional = "1"; // self-handled failure: no global error banner
      img.addEventListener("load", () => fig.classList.remove("loading"));
      img.addEventListener("error", () => fig.remove());
      img.addEventListener("click", () =>
        onImagePick(img.currentSrc || img.src, img.alt, { invert: false }));
      img.src = src;
      fig.appendChild(img);
      return fig;
    };
    const hero = figure(heroUrl);
    if (tourSec) hero.dataset.tourSec = tourSec; // guided-tour section anchor
    body.appendChild(hero);
    const gal = gallery || [];
    if (!gal.length) return;
    const wrap = el("div", "structure-gallery");
    wrap.hidden = true;
    const toggle = el("button", "btn gallery-toggle");
    toggle.type = "button";
    let built = false;
    const sync = () => {
      toggle.textContent = wrap.hidden
        ? t("structure.galleryShow", { n: gal.length })
        : t("structure.galleryHide");
    };
    toggle.addEventListener("click", () => {
      if (!built) {
        for (const url of gal) wrap.appendChild(figure(url));
        built = true;
      }
      wrap.hidden = !wrap.hidden;
      sync();
    });
    sync();
    body.appendChild(toggle);
    body.appendChild(wrap);
  };

  // Group a {drug, binding}[] by primary drug category and append the category
  // sub-headings + rows into `container`. Shared by the group/target's own
  // "Interacting drugs" list and the per-subtype dropdowns below it, so the sort +
  // row shape can never drift between the two. Sort: within a class, strongest-
  // affinity drug first (by this target's binding Ki, Infinity when unmeasured; equal
  // Ki tie-broken by name); classes ordered by the class's hardest binding (its min
  // Ki), classes with no measured Ki keeping the meta / Drugs-legend order among
  // themselves. Matches the drug panel's "Direct molecular targets" order and the target legend.
  /**
   * One row of a metabolism list, shared by the drug panel's Metabolism section and
   * the enzyme panel's drug list so both render the same claim identically (the
   * no-duplication rule: the two views are the same node seen from either end).
   *
   * `label` is whichever end the *other* panel is not: the enzyme's name on a drug
   * panel, the drug's name on an enzyme panel. Both callers group the rows under a
   * role heading, so the role itself is not repeated on the row.
   * @param {object} row       the normalized enzyme row (js/data.js)
   * @param {string} label     the row's headline text
   * @param {(() => void)|null} onClick  jump target, or null for an inert row
   */
  const enzymeRow = (row, label, onClick) => {
    const li = el("li");
    const text = el("span", "bind-text");
    const line = el("span", "bind-name");
    line.appendChild(el("span", "bind-target", label));
    // Each pill sits right after the words it grades and names them in its tooltip.
    // The rows are grouped under a role heading (both callers), so the name's own pill
    // grades the (enzyme, role) claim; how MUCH of the clearing this isoform does is a
    // second node (the CYP quote gate checks the isoform is named, never the tier; see
    // quotes/attestation.py), so it carries its own pill after the strength word.
    // Both go through the shared node pill, so the quote and any "another corpus
    // denies this" lead (quotes/contradictions.py) still show.
    line.appendChild(sourceBackedPill(row.provenance || null, row,
      t("enzyme.gradesRole", { role: row.roleLabel })));
    if (row.strengthLabel) {
      const strength = (row.claims || {}).strength;
      line.append(
        el("span", "bind-action", `· ${row.strengthLabel}`),
        sourceBackedPill((strength && strength.grade) || "llm", strength,
          t("enzyme.gradesStrength", { strength: row.strengthLabel })));
    }
    text.appendChild(line);
    li.appendChild(text);
    if (onClick) {
      li.classList.add("clickable");
      li.addEventListener("click", onClick);
    }
    return li;
  };

  // Which population group the pharmacogenomic rows are read under. Deliberately NOT
  // persisted, unlike every other lasting choice (js/prefs.js): nobody's browser needs
  // to keep a record of which ancestry group they looked up. It outlives one panel so
  // comparing two drugs does not mean re-picking, and resets on reload.
  let pgxGroup = null;

  /**
   * The CPIC guidance section of a drug panel (corpus #15), or null when it has none.
   *
   * The one section here that states a clinical action, so it is built to be read as
   * what it is: CPIC's own two sentences per row, quoted verbatim with their pill, the
   * guideline linked, the recommendation's strength named, and the caveat about base
   * rates versus individuals sitting with the rows rather than hidden in a tooltip.
   *
   * Two datasets meet in each row. The guidance comes from CPIC; the "how common is
   * that" figure beside it comes from the enzyme's own frequency profile (corpus #13),
   * which is why the group picker lists the groups that profile actually covers.
   *
   * @param {object} drug the normalized drug record (js/data.js)
   * @returns {HTMLElement|null}
   */
  const pgxSection = (drug) => {
    const blocks = drug.pgx || [];
    if (!blocks.length) return null;
    const wrap = el("div", "info-bindings info-pgx");
    wrap.dataset.tourSec = "pgx";
    wrap.appendChild(el("h3", null, t("drug.pgx")));
    wrap.appendChild(el("p", "legend-caption", t("drug.pgxHint")));

    // One picker for the whole section: every block's profile covers the same groups,
    // and two selects on one panel would read as two different questions.
    const groups = blocks[0].groups || [];
    const pick = el("div", "pgx-pick");
    const label = el("label", null, `${t("drug.pgxGroup")} `);
    const select = el("select", "pgx-group");
    const none = el("option", null, t("drug.pgxNoGroup"));
    none.value = "";
    select.appendChild(none);
    for (const g of groups) {
      const opt = el("option", null, g.label);
      opt.value = g.key;
      if (g.key === pgxGroup) opt.selected = true;
      select.appendChild(opt);
    }
    label.appendChild(select);
    pick.appendChild(label);
    wrap.appendChild(pick);

    const freqCells = [];
    const paint = () => {
      for (const { cell, row } of freqCells) {
        const hit = pgxGroup ? row.freqByGroup.get(pgxGroup) : null;
        cell.textContent = !pgxGroup ? ""
          : hit ? t("drug.pgxFreq", { pct: `${(hit.freq * 100).toFixed(1)}%` })
            : t("drug.pgxNoFreq");
        cell.classList.toggle("pgx-freq-none", Boolean(pgxGroup && !hit));
      }
    };
    select.addEventListener("change", () => {
      pgxGroup = select.value || null;
      paint();
    });

    for (const block of blocks) {
      const head = el("h4", "drug-cat", block.label);
      head.appendChild(attachTip(el("span", "pgx-level",
        t("drug.pgxLevel", { level: block.level })), t("drug.pgxLevelTitle")));
      wrap.appendChild(head);
      // A guideline CPIC writes for one kind of patient only (atomoxetine's rows are
      // adults, phenytoin's are people new to the drug) says so on the block, because
      // the rows below are that population's, not everyone's.
      if (block.population) {
        wrap.appendChild(el("p", "pgx-population",
          t("drug.pgxPopulation", { population: block.population })));
      }
      const guide = el("div", "info-wiki");
      guide.appendChild(el("span", null, block.guideline.name));
      appendLookupLink(guide, "drug.pgxGuideline", block.guideline.url,
        "drug.pgxGuideline");
      wrap.appendChild(guide);
      const ul = el("ul", "pgx-rows");
      for (const row of block.rows) {
        const li = el("li");
        const headline = el("div", "pgx-headline");
        // The same slow -> fast colour ramp the enzyme panel's bars use, as a swatch
        // rather than a fill: a tinted chip would need a literal text colour, which
        // only `--accent` is allowed (tools/tests/test_theme_tokens.py).
        const pheno = el("span", "pgx-pheno");
        pheno.appendChild(el("span",
          `var-swatch var-${row.phenotype.toLowerCase()}`));
        pheno.appendChild(el("span", null, row.label));
        headline.appendChild(attachTip(pheno, row.note));
        const freq = el("span", "pgx-freq");
        freqCells.push({ cell: freq, row });
        headline.appendChild(freq);
        // One node, two quotes (the implication, then the recommendation), so one pill
        // whose tooltip carries both: see tools/data_generators/cpic.py.
        headline.appendChild(nodePill(row));
        li.appendChild(headline);
        li.appendChild(el("p", "pgx-implication", row.implication));
        li.appendChild(el("p", "pgx-recommendation", row.recommendation));
        const foot = el("div", "pgx-foot");
        foot.appendChild(el("span", "pgx-class", row.classification));
        // CPIC doses the tricyclics and the SRIs on two genes at once, so a row filed
        // under one of them only holds with the other at normal activity. Shown, never
        // implied: a reader who misses it would read a joint claim as a single-gene one.
        if (row.assumes) {
          foot.appendChild(el("span", "pgx-assumes",
            t("drug.pgxAssumes", { genes: Object.keys(row.assumes).join(", ") })));
        }
        li.appendChild(foot);
        ul.appendChild(li);
      }
      wrap.appendChild(ul);
    }
    paint();
    wrap.appendChild(el("p", "var-caveat", t("drug.pgxCaveat")));
    return wrap;
  };

  // One clickable <li> for a pathway that is a member of some grouping (a
  // A bold, colour-filled direction arrow (short shaft + a wide pointy head) for a
  // connection row: far more legible than the old thin colour bar + tiny glyph,
  // and it carries the pathway colour itself. `dir` is "out" (this structure
  // projects to the other endpoint), "in" (receives from it), or "both"
  // (reciprocal / commissural). Drawn as inline SVG so the head is genuinely wide
  // and it stays crisp at any size (a Unicode arrowhead's shape varies by font).
  const SVG_NS = "http://www.w3.org/2000/svg";
  const DIR_TIP = { out: "info.dirOut", in: "info.dirIn", both: "info.dirBoth",
    up: "info.toneUp", down: "info.toneDown" };
  // The localized "what this arrow's colour means" line for a pathway: the kind
  // label (the colour IS the projection kind, meta.projectionColors[kind]) plus the
  // neurotransmitter, matching the connection panel's type line. Empty for a pathway
  // with no kind. Shared so the arrow tooltip and that line can't drift.
  const colourMeaningOf = (proj) => {
    const kindLabel = (data.meta.kindLabels && data.meta.kindLabels[proj.kind])
      || proj.kind || "";
    return [kindLabel, proj.neurotransmitter].filter(Boolean).join(" · ");
  };
  const directionArrow = (color, dir, colourMeaning = "") => {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "conn-arrow");
    svg.setAttribute("viewBox", "0 0 26 16");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d",
      dir === "in"
        ? "M24,6 L12,6 L12,2 L2,8 L12,14 L12,10 L24,10 Z"
        : dir === "both"
        ? "M2,8 L9,2 L9,6 L17,6 L17,2 L24,8 L17,14 L17,10 L9,10 L9,14 Z"
        // Tone rows (up = raises, down = lowers): vertical, centred in the 26-wide box.
        : dir === "up"
        ? "M11,15 L11,8 L7,8 L13,1 L19,8 L15,8 L15,15 Z"
        : dir === "down"
        ? "M11,1 L11,8 L7,8 L13,15 L19,8 L15,8 L15,1 Z"
        : "M2,6 L14,6 L14,2 L24,8 L14,14 L14,10 L2,10 Z"); // "out" (default)
    path.setAttribute("fill", color || "#fff");
    svg.appendChild(path);
    // Tap-to-explain: a tap shows what the arrow means (its direction AND, when
    // known, its colour = the pathway kind), and stops the tap bubbling to the
    // clickable row it sits over, so on a phone tapping the arrow no longer navigates
    // into the pathway/region (per the request); hover shows it on desktop too.
    let tip = t(DIR_TIP[dir] || DIR_TIP.out);
    if (colourMeaning) tip += `\n${t("info.arrowColour", { label: colourMeaning })}`;
    return withTip(svg, tip);
  };

  // One pathway row, shared by every "connections" list (a structure's
  // connections, a circuit's loop, a projection group): the bold direction arrow
  // in the pathway colour, the label text, the pathway's summary source pill, and
  // a click that jumps to the connection via onConnectionPick. `dir` is passed by
  // the caller (showStructure rows are relative to the structure; circuit / group
  // rows show the full route, so they pass "both" for a reciprocal pathway else
  // "out", matching their "from -> to" label text).
  const pathwayRow = (proj, dir, labelText) => {
    const li = el("li");
    li.title = proj.label || "";
    li.appendChild(directionArrow(proj.color, dir, colourMeaningOf(proj)));
    li.appendChild(el("span", "conn-label", labelText));
    // Always show the grade pill; an unsourced pathway shows NOSOURCE, never a blank
    // (a node's provenance is never simply absent from the panel). A pathway the book
    // states only as one blanket sweep wears the orange "uncertain" badge instead of a
    // green check, its reasons leading the tooltip: same rule the binding pill follows.
    li.appendChild(nodePill(proj));
    li.addEventListener("click", () => onConnectionPick(proj));
    return li;
  };

  // Build a <ul> of pathway rows with left/right twins collapsed. `rowOf(proj)`
  // returns `{dir, label}` (the direction glyph + the row text, both using
  // hemisphere-stripped base names): mirrored twins then share direction + label,
  // so keying on `dir|label|pathway` keeps the first and drops its L/R duplicate.
  // Shared by the structure panel and the circuit/group member lists so a midline
  // source (the raphe) that projects to both hemispheres lists each target once.
  // Returns the list element + the surviving row count (for the "(N)" heading).
  const pathwayList = (projs, rowOf) => {
    const seen = new Set();
    const ul = el("ul");
    let count = 0;
    for (const proj of projs) {
      const { dir, label } = rowOf(proj);
      const key = `${dir}|${label}|${proj.label || proj.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ul.appendChild(pathwayRow(proj, dir, label));
      count++;
    }
    return { ul, count };
  };

  // A titled "member pathways" list (the circuit + projection-group panels): one
  // pathwayRow per projection, each showing its full from -> to route (twins
  // collapsed via pathwayList).
  const appendPathwayList = (titleText, projs, tourSec = "") => {
    if (!projs.length) return;
    const { ul, count } = pathwayList(projs, (proj) => {
      const glyph = proj.bidirectional ? "↔" : "→";
      return {
        dir: proj.bidirectional ? "both" : "out",
        label: `${baseNameOf(proj.from)} ${glyph} ${baseNameOf(proj.to)}`,
      };
    });
    const wrap = el("div", "info-connections");
    if (tourSec) wrap.dataset.tourSec = tourSec; // guided-tour section anchor
    wrap.appendChild(el("h3", null, `${titleText} (${count})`));
    wrap.appendChild(ul);
    body.appendChild(wrap);
  };

  // A node's identity line: its "what is this" group heading carrying the node's own
  // source grade pill. Shared by the structure / circuit / group panels, which each
  // state one identity claim (a receptor/target/drug instead pills each fact row). The
  // grade rides this line, never a "Sources" block below the member lists (which would
  // read as grading the members). `always` shows a NOSOURCE pill even when ungraded,
  // for nodes whose badge is required (circuit / group are llm-only today); a structure
  // omits the pill when its anatomy grade is absent.
  const appendSourcedHeading = (labelText, provenance, sources, always = false) => {
    const groupEl = el("div", "info-group", labelText);
    if (always || provenance) {
      groupEl.appendChild(document.createTextNode(" "));
      groupEl.appendChild(nodePill({ provenance, sources }));
    }
    body.appendChild(groupEl);
  };

  // "Receptors found here": the reverse of a receptor's "Found in" list, read off
  // data.targetsByStructure. The expression claim belongs to the (target, region)
  // pair, so each row carries THAT region's own graded node, the same pill (and the
  // same amber non-human species tag) the receptor panel shows for this structure:
  // one node, two ends, never two gradings. Grouped by neurotransmitter system in the
  // Receptors & targets section's own order, biggest system in THIS region first.
  // Capped per system, since a cortical lobe carries a hundred of them and a global
  // cap would swallow whole systems (same reasoning as the drug-interactions groups).
  const EXPRESSED_CAP = 8;
  const appendExpressedTargets = (base) => {
    const entries = (data.targetsByStructure || new Map()).get(base) || [];
    if (!entries.length) return;
    // One row per target: a target cannot be expressed twice in one region, but the
    // index is built per (target, region) so guard anyway rather than double-list.
    const byId = new Map(entries.map((e) => [e.target.id, e]));
    const families = data.meta.receptorFamilyLabels || {};
    const wrap = el("div", "info-bindings info-interactors");
    wrap.dataset.tourSec = "expressed"; // guided-tour section anchor
    wrap.appendChild(el("h3", null, `${t("structure.expressed")} (${byId.size})`));
    wrap.appendChild(el("p", "info-caption", t("structure.expressedCaption")));
    const groups = groupTargetsBySystem([...byId.values()].map((e) => e.target),
      () => 1);
    for (const [key, list] of groups) {
      wrap.appendChild(el("div", "drug-cat",
        key === "_other" ? t("targets.otherSystem") : (families[key] || key)));
      const ul = el("ul", "pk-group-body");
      const rowOf = (tgt) => {
        const entry = byId.get(tgt.id);
        const meta = entry.info;
        const li = el("li");
        const dot = el("span", "swatch");
        dot.style.background = tgt.swatchColor;
        li.appendChild(dot);
        li.appendChild(el("span", "bind-target", tgt.name));
        if (tgt.kind !== "receptor" && tgt.typeLabel) {
          li.appendChild(el("span", "legend-tag", tgt.typeLabel));
        }
        // "everywhere": this one is a ubiquitous receptor, listed here because it is
        // listed everywhere, which is a weaker statement than a named region.
        if (entry.ubiquitous) {
          li.appendChild(el("span", "legend-tag", t("structure.expressedEverywhere")));
        }
        if (meta && meta.nonHuman) {
          const tag = el("span", "loc-species",
            t("receptor.speciesTag", { species: speciesLabel(meta.species) }));
          tag.title = t("receptor.speciesTip", { species: speciesLabel(meta.species) });
          li.appendChild(tag);
        }
        if (meta) li.appendChild(locationPill(meta));
        if (tgt.focusable) {
          li.classList.add("clickable");
          li.addEventListener("click", () => onTargetPick(tgt));
        }
        return li;
      };
      for (const tgt of list.slice(0, EXPRESSED_CAP)) ul.appendChild(rowOf(tgt));
      wrap.appendChild(ul);
      const rest = list.slice(EXPRESSED_CAP);
      if (rest.length) {
        const more = el("button", "pk-more", t("info.more", { n: rest.length }));
        more.addEventListener("click", () => {
          for (const tgt of rest) ul.appendChild(rowOf(tgt));
          more.remove();
        });
        wrap.appendChild(more);
      }
    }
    body.appendChild(wrap);
  };

  // The panel kit: what the views in panel/views/ take from this closure (each
  // view is `showX(P, ...)`).
  const P = {
    addFactRow, appendDemographics, appendDownstream, appendDrugVariants,
    appendEffects, appendExpressedTargets, appendLookupLink, appendPathwayList,
    appendPossibleEffects, appendReference, appendReleaseChanges, appendSourcedHeading,
    appendVariants, appendWikiImages, appendWorkup, baseNameOf, betaSection, body,
    clearBody, clinpgxSearchUrl, colourMeaningOf, data, derivedRow, directionArrow,
    drugById, el, endpointEl, enzymeById, enzymeRow, foldBody, gtopdbSearchUrl,
    linkName, locationList, onDrugPick, onEnzymePick, onImagePick,
    onProjectionGroupPick, onTargetPick, pathwayList, PDSP_KIDB_URL, pgxSection,
    PHARMFREQ_URL, sourcingModal, targetById, uniprotSearchUrl,
  };
  Object.assign(P, makePills(P));
  Object.assign(P, makeAddons(P));
  Object.assign(P, makeBindings(P));
  // Factory-made helpers this closure still calls.
  const {
    appendAddons, bindingActionPill, kiCorpusRefNode, locationPill, makeProvenancePill,
    nodePill, sourceBackedPill, speciesLabel, withTip,
  } = P;
  return {
    show: (...args) => show(P, ...args),

    showStructure: (...args) => showStructure(P, ...args),

    showReceptor: (...args) => showReceptor(P, ...args),

    showTarget: (...args) => showTarget(P, ...args),

    showEnzyme: (...args) => showEnzyme(P, ...args),

    showEffect: (...args) => showEffect(P, ...args),

    /**
     * Populate the panel for a *drug* (clicking a drug legend/list row or a drug
     * search result): its name, primary category, a Wikipedia link, a one-line
     * description, its class(es) + nomenclature, then the "Direct molecular targets" list of
     * molecular targets (each binding's effect swatch + target name + action,
     * with a note / "speculative" marker when present, and a source pill: its own
     * quote-level source or the drug-level Stahl citation as a fallback).
     */
    // Both opts are "why did this panel open" hints: the clicked row's counterpart is
    // scrolled to + briefly flashed here, so a jump lands on its reason rather than at
    // the top of an unfamiliar panel (see flashRow).
    // opts.highlightMetabolite: a metabolite name, in the "Active metabolites" section.
    //   Used when arriving from a receptor's Interacting-drugs row for a non-modeled
    //   metabolite (which deep-links to its parent, having no standalone view).
    // opts.highlightEnzymes: enzyme ids, in the "Metabolism" section. Used when arriving
    //   from another drug's Interactions row, which names the isoform they share.
    showDrug: (...args) => showDrug(P, ...args),

    showCircuit: (...args) => showCircuit(P, ...args),

    showProjectionGroup: (...args) => showProjectionGroup(P, ...args),

    /** Register the handler run when a structure-panel connection row is clicked. */
    onConnection(fn) {
      pickHandlers.onConnectionPick = fn;
    },

    /** Register the handler run when a drug-panel binding (target) row is clicked. */
    onTarget(fn) {
      pickHandlers.onTargetPick = fn;
    },

    /**
     * Register the handler run when a region row in a receptor / target panel's
     * "Found in" list is clicked. Called with the structure base id; the caller
     * resolves it to a mesh and jumps to that structure.
     */
    onStructure(fn) {
      pickHandlers.onStructurePick = fn;
    },

    /**
     * Register the handler run when a drug row in a receptor / target panel's
     * "Interacting drugs" list is clicked. Called with the drug record; the caller
     * focuses it exactly like its Drugs legend row / search pick.
     */
    onDrug(fn) {
      pickHandlers.onDrugPick = fn;
    },

    /**
     * Register the handler run when an enzyme row (a drug panel's Metabolism list)
     * is clicked. Called with the enzyme record from `data.enzymes`; the caller
     * opens it exactly like its Enzymes legend row.
     */
    onEnzyme(fn) {
      pickHandlers.onEnzymePick = fn;
    },

    /** Register the handler run when an effect row is clicked (see onEffectPick). */
    onEffect(fn) {
      pickHandlers.onEffectPick = fn;
    },

    /**
     * Register the handler run when a projection-group row in a drug panel's
     * "Neurotransmitter tone" list is clicked. Called with the group record; the
     * caller focuses it exactly like its Projections legend row / search pick.
     */
    onProjectionGroup(fn) {
      pickHandlers.onProjectionGroupPick = fn;
    },

    /**
     * Register the handler run when a clickable Class / Nomenclature value in a drug
     * panel is clicked. Called with a `field:"value"` search query string; the caller
     * opens the search box pre-filled with it.
     */
    onSearch(fn) {
      pickHandlers.onSearchPick = fn;
    },
    /** Set the handler that enlarges a clicked panel image (the lightbox). */
    onImage(fn) {
      pickHandlers.onImagePick = fn;
    },

    /**
     * The grade pill builder, so a view outside the info panel (the Data browser's
     * rows) badges a node with the very same element the panel does: same tooltip,
     * same verbatim quote / Ki / reasons-to-doubt, same "Click for details" cue.
     * @param {string|null} level a stored grade, or the "uncertain" display grade
     * @param {{sources?: object[], ki?: object, uncertainty?: object[]}} [node] what
     *   backs the claim; omit it for a bare grade badge with no source to show
     */
    provenancePill(level, node) {
      return sourceBackedPill(level === "nosource" ? null : level, node);
    },

    /**
     * Render the Data browser's (detached, state-keeping) container in the Details
     * pane. It is not a show*() view: the browser owns its own DOM so its filter,
     * selects and scroll survive a tab switch, and the panel only hosts it.
     * @param {HTMLElement} elm the container built by js/node-browser.js
     */
    showNodeBrowser(elm) {
      clearBody("browser");
      body.appendChild(el("h2", "info-title", t("panel.nodes")));
      body.appendChild(elm);
    },

    /**
     * Render the Simulation tab's (detached, state-keeping) container in the Details
     * pane, exactly as showNodeBrowser does: the tab owns its own DOM so the picked
     * drugs, the scrub position and the solver's wish list survive a tab switch.
     * @param {HTMLElement} elm the container built by js/simulation.js
     */
    showSimulation(elm) {
      clearBody("simulation");
      body.appendChild(el("h2", "info-title", t("panel.simulation")));
      body.appendChild(elm);
    },

    /**
     * Fill an addon slot that lives OUTSIDE the info panel. The Projections browse
     * section owns one (the bilaterality caveat, anchored on the section rather than
     * on a node), and that section is built by buildLegend, not by a show*() view, so
     * the hook is exported instead of duplicated: an addon must render the same way,
     * with the same source pill, wherever its slot happens to sit.
     */
    appendAddons,
  };
}
