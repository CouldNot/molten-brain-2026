// The detail panel: createInfoPanel builds the shared panel kit (pills, sections,
// reference links, addon slots) and returns the show*() views, each in panel/views/.

import {
  bindingKi, EFFECT_GLYPHS, formatHalfLife, NOSOURCE_GLYPH, stripSide,
} from "./format.js";
import { appendDrugHistory } from "../drug-history.js";
import { appendPhyschemChips, hasPhyschem } from "../physchem.js";
import { appendTdmChips, valueChip } from "../tdm.js";
import { attachTip, closeOpenTip, linkifiedText } from "./tooltip.js";
import { clipLead, fetchWikiLead } from "../wiki.js";
import { deriveReleaseChanges, transmitterVars } from "../release-modulation.js";
import { flashRow, foldSections } from "./dom.js";
import { formatConditions, groupWorkup } from "../workup.js";
import { groupByVariant, variantsForDrug } from "../receptor-variants.js";
import { groupTargetsBySystem } from "../legend/targets.js";
import { loadPkGrouping, savePkGrouping } from "../legend/drugs.js";
import { shownGrade } from "../node-browser.js";
import { toneWeightOf, withFetched } from "../data.js";
import { showEffect } from "./views/effect.js";
import { showCircuit } from "./views/circuit.js";
import { showProjectionGroup } from "./views/projection-group.js";

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

  // withTip wraps an inline provenance pill in a .help-icon span and returns that
  // wrapper (so the pill anchors to itself). The whole hover/tap tooltip mechanism
  // lives in the module-level attachTip (shared with the sourcing coverage bars).
  const withTip = (trigger, tipText) => attachTip(trigger, tipText, { wrap: true });

  // Per-source provenance pill (how trustworthy the source's attribution is):
  // grey "?" = LLM-only (may be hallucinated), yellow "~" = the LLM had the source
  // document, green "✓" = quote-checked + agreed by a second LLM. The colour is a
  // `.src-prov-<level>` CSS class. A falsy / unknown level is the "no source yet"
  // case and renders the red ✕ NOSOURCE pill (`.src-todo`) instead. The pill is a
  // <button> so a tap pins its explanatory tooltip on touch (via withTip). Each
  // pill's tooltip explains its own grade, and the About panel ("Sources &
  // provenance") carries the full grade key, so there is no separate blanket "?"
  // caveat. The three stored grades come from the data (generate_data.py
  // PROVENANCE_LEVELS); `wikipedia` is a viewer-only presentation for a live-fetched
  // Wikipedia lead (a runtime read, not a stored node grade), green because it is a
  // verbatim programmatic extract of an inspectable source, so it can't drift from
  // Wikipedia. Only the glyph + tooltip live here.
  const PROVENANCE_PILLS = {
    llm: { glyph: "?", tip: "info.provLlm" },
    sourced: { glyph: "~", tip: "info.provSourced" },
    verified: { glyph: "✓", tip: "info.provVerified" },
    // Same source, same quote gate as `verified`, but the audit found the sentence
    // does not attribute the claim (see quotes/uncertainty.py). Its tooltip leads
    // with the reasons to doubt it, each itself badged; the grade is data, this is
    // the badge the data asks for.
    uncertain: { glyph: "⚠", tip: "info.provUncertain" },
    // Fallback marker for a live Wikipedia read. Normally the read's provenance is
    // the Wikipedia link itself, relocated into the description (see
    // liveWikiDescription); this ✓ pill only shows if that link could not be moved.
    // It shares the green of `verified` because both are an inspectable, non-LLM
    // extract of a real source (the tooltip names which).
    wikipedia: { glyph: "✓", tip: "info.provWikipedia" },
    // Not a grade: an addon whose basis is `dataset` (meta.addon_bases) states how this
    // dataset is built, so no source could back it and the red ✕ would misread as a
    // gap. Neutral, and its tooltip says why.
    dataset: { glyph: "◌", tip: "info.provDataset" },
    // Not a grade either: every required source was searched for this claim and none
    // states it (a recorded search, tools/data_generators/unknown.py). A finding, not
    // the to-do the red ✕ is, so it has its own glyph; its tooltip names the search.
    unknown: { glyph: "∅", tip: "info.provUnknown" },
  };

  // The UNKNOWN pill's tooltip body: when the search ran and every source it covered,
  // named from meta.sourceCorpora like any other source line.
  const unknownSearchTip = (stamp) => {
    if (!stamp) return "";
    const corpora = (data.meta && data.meta.sourceCorpora) || {};
    const names = (stamp.corpora || []).map((c) => `• ${(corpora[c] || {}).ref || c}`);
    return `${t("info.unknownSearched", { date: stamp.searched })}\n${names.join("\n")}`;
  };
  // The closing call to action of a provenance tooltip: opens the Sources &
  // provenance popup (the single place that explains what each grade means) and
  // dismisses its own tooltip first. Replaces the verbose per-grade paragraph that
  // used to be inlined into every pill (see makeProvenancePill).
  const makeDetailsCue = () => {
    const cue = el("button", "src-details-cue", t("info.provDetails"));
    cue.type = "button";
    cue.addEventListener("click", (e) => {
      e.stopPropagation();
      const tipEl = cue.closest(".help-tip");
      if (tipEl && tipEl._close) tipEl._close();
      if (sourcingModal && sourcingModal.open) sourcingModal.open();
    });
    return cue;
  };

  // Tooltip = the grade in words, then `extra` (optional: the concrete source, i.e.
  // the verbatim quote + page ref, or a bibliographic citation), then a call-to-action
  // cue opening the Sources & provenance popup (the one place the grades are
  // explained). `base` (the full grade text) stays as the pill's aria-label.
  // (.help-tip is white-space:pre-line so the newlines show.)
  const makeProvenancePill = (level, extra) => {
    const spec = PROVENANCE_PILLS[level];
    const base = spec ? t(spec.tip) : t("info.provNone");
    const tip = document.createDocumentFragment();
    // The grade in words always leads, so even a pill with nothing else to show (a
    // bare ✕) says what it is; the closing cue then names what its click opens.
    tip.append(el("strong", "src-grade-name", t(`prov.name.${spec ? level : "none"}`)),
      document.createTextNode("\n\n"));
    if (extra instanceof Node) {
      tip.append(extra, document.createTextNode("\n\n"));
    } else if (extra) {
      tip.append(linkifiedText(`${extra}\n\n`));
    }
    tip.append(makeDetailsCue());
    const cls = spec ? `src-pill src-prov-${level}` : "src-pill src-todo";
    const pill = el("button", cls, spec ? spec.glyph : NOSOURCE_GLYPH);
    pill.type = "button";
    pill.setAttribute("aria-label", base);
    return withTip(pill, tip);
  };

  // "How this quote got here: source page → an LLM finds the quote → ..." for one
  // source, or "" when the data names no pipeline (a bare reference with no quote).
  //
  // The steps come from `meta.quote_pipelines`, so adding a pipeline is a data edit plus
  // its translations and never a viewer edit, exactly like addon slots and uncertainty
  // reasons. The viewer only joins and localizes.
  const quoteChain = (pipeline) => {
    const steps = ((data.meta && data.meta.quotePipelines) || {})[pipeline];
    if (!Array.isArray(steps) || !steps.length) return "";
    return `${t("info.quoteChain")} ${steps.map((s) => t(`quotechain.${s}`)).join(" → ")}`;
  };

  // One tooltip line for a single source. Every source is quote-level
  // {corpus,page,quote,provenance} (the one shape used everywhere): it renders the
  // verbatim quote + "<ref>, p.N", resolving the ref from meta.sourceCorpora by
  // `corpus`. A corpus source with no page (e.g. a PDSP Ki reference) shows just the
  // ref line; a `quote` prefixes it.
  const sourceTipLine = (s) => {
    if (!s || !s.corpus) return "";
    const corpora = (data.meta && data.meta.sourceCorpora) || {};
    const c = corpora[s.corpus] || {};
    const label = c.ref || c.short || s.corpus;
    // `page` is a book page unless the corpus names what it holds instead (a PMID, a
    // DailyMed setid, a gene). The link is that exact page when the corpus can name it
    // (a stored per-page url such as a Wikipedia permalink or a paper's DOI, else the
    // `{page}` template), else the corpus's own landing page (a book's DOI or ISBN).
    const pageRef = c.page_kind ? `info.sourcePage.${c.page_kind}` : "info.sourceRef";
    const url = (s.page != null && (c.page_urls?.[s.page]
      || (c.page_url && c.page_url.replace("{page}", encodeURIComponent(s.page)))))
      || c.url;
    const pageUrl = url ? `\n${url}` : "";
    const ref = withFetched(s.page != null
      ? t(pageRef, { corpus: label, page: s.page })
      : label, s.fetched, t) + pageUrl;
    // Where in the book the passage sits, above the passage itself. The same
    // sentence reads very differently under "How the Drug Works" (a mechanism the
    // book attributes to this drug) than under "How Drug Causes Side Effects" (a
    // rule it prints without a subject), so the breadcrumb is what lets a reader
    // judge the quote rather than just confirm it exists.
    const trail = headingTrail(s.heading);
    const line = s.quote
      ? `${trail}“${s.quote}”\n— ${ref}`
      : `${trail}— ${ref}`;
    // An expression source (GtoPdb tissue distribution) names the assay species;
    // show it so a non-human claim is explicit on the pill itself, not only the tag.
    const withSpecies = s.species
      ? `${line}\n${t("info.sourceSpecies", { species: speciesLabel(s.species) })}`
      : line;
    // Last, under everything else: how this quote got here. Every green pill looks the
    // same, and it should, because the grade really is the same; but a sentence a model
    // read off a book page and a table cell a parser copied are different evidence, and
    // the reader is the one entitled to weigh that.
    // A blank line before it, so the trail reads apart from the quote block above.
    const chain = quoteChain(s.pipeline);
    return [withSpecies, licenceLine(s.licence), chain && `\n${chain}`,
      corpusCitations(s.corpus)]
      .filter(Boolean).join("\n");
  };

  // "Text licence: CC BY-NC" for a citation quoting an open-access text that asks for
  // credit (a Europe PMC full-text paper), else "". Shared by every source line and the
  // Ki reference, so any citation carrying a `licence` credits it the same way.
  const licenceLine = (licence) => (licence ? t("info.sourceLicence", { licence }) : "");

  // The citation a corpus asks for (meta.sourceCorpora[id].required_citations, e.g.
  // GtoPdb's database paper + licence), as a tooltip block, else "". Data-driven, so
  // honouring a new source's "how to cite us" is a generator edit only.
  const corpusCitations = (corpusId) => {
    const c = ((data.meta && data.meta.sourceCorpora) || {})[corpusId] || {};
    const cites = c.required_citations || [];
    return cites.length ? `${t("info.citeAs")}\n${cites.map((x) => `• ${x}`).join("\n")}` : "";
  };

  // "Clozapine › Side effects › How Drug Causes Side Effects\n" for a source that
  // knows where in its book it sits, else "". Stored as a plain outermost-first
  // list because the books do not share a heading shape (a Stahl monograph, a
  // Kandel part/chapter/section, a Nieuwenhuys chapter), so the viewer only joins.
  // The heading text itself stays in the book's language: it is part of the quote's
  // citation, not UI chrome, so only the separator comes from the catalogue.
  const headingTrail = (trail) =>
    Array.isArray(trail) && trail.length ? `${trail.join(" › ")}\n` : "";

  // Localized species name for an assay/expression source (Human/Rat/Mouse/Monkey,
  // as stored in the data); an unknown value passes through unchanged.
  // A species label: a corpus's own spelling ("Rat") or a tools/species.py key
  // ("guinea_pig", what an animal_evidence bullet carries), via `species.<key>`.
  const speciesLabel = (s) => {
    const key = `species.${String(s || "").toLowerCase().replace(/ /g, "_")}`;
    const label = t(key);
    return label === key ? (s || "") : label;
  };
  // A bullet's slot args as the sentence shows them: a species list is localized.
  const uncertaintyArgs = (args) => (args && Array.isArray(args.species)
    ? { ...args, species: args.species.map(speciesLabel).join(", ") } : args || {});

  // The tooltip tail under a per-claim provenance pill: every source (all
  // quote-level now) rendered as a line. Shared by the binding + NbN rows and the
  // pathway rows / connection panel, so a pathway's source shows on both endpoints'
  // panels.
  const sourcesTip = (sources) =>
    (sources || []).map(sourceTipLine).filter(Boolean).join("\n\n");

  // The corpus reference for a Ki source, rendered as the tooltip "extra": the corpus
  // label made a live link to the exact source (ki.reference pinned-revision permalink,
  // falling back to the corpus's generic URL) when a URL is available, else plain text
  // (the reference on its own line). Returned as a fragment so the link stays clickable.
  // Shared by kiChip's verified badge and the binding row's source pill, so a literature
  // Ki (e.g. a Wikipedia pharmacodynamics table) is reachable from both, not only the Ki
  // badge. `dash` prepends the leading source-line dash marker (the binding pill wants it;
  // kiChip does not, since it appends its own kiCited explainer after).
  const kiCorpusRefNode = (ki, { dash = false } = {}) => {
    const label = ki.corpusRef || "PDSP Ki Database";
    const refUrl = /^https?:\/\//i.test(ki.reference || "") ? ki.reference
      : (/^https?:\/\//i.test(ki.corpusUrl || "") ? ki.corpusUrl : "");
    const frag = document.createDocumentFragment();
    if (dash) frag.append("— ");
    if (refUrl) {
      const a = el("a", null, label);
      a.href = refUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      frag.append(a);
    } else {
      frag.append(label + (ki.reference ? "\n" + ki.reference : ""));
    }
    // The download date of the corpus the Ki was read from (PDSP's CSV, the
    // Wikipedia table), after the link so the link keeps its plain corpus label.
    if (ki.fetched) frag.append(withFetched("", ki.fetched, t));
    const licence = licenceLine(ki.licence);
    if (licence) frag.append("\n" + licence);
    const cites = corpusCitations(ki.corpus);
    if (cites) frag.append("\n" + cites);
    return frag;
  };

  // The provenance pill for a drug binding row (shared by the drug panel's "Acts
  // on" list and a target panel's "Interacting drugs" list, the same resolved
  // binding object). Its grade + tooltip come from whatever backs the binding: its
  // own quote-level Stahl source if present, else its measured PDSP Ki (which lifts
  // it to verified, mirroring _binding_grade), else nothing -> a NOSOURCE pill.
  // There is no drug-level citation fallback: an unsourced binding honestly shows
  // NOSOURCE rather than borrowing the book at large. When the backing is a Ki whose
  // corpus is URL-addressable (a literature Ki, e.g. the Wikipedia table), the label
  // is a clickable link, matching the Ki badge's tooltip below the row.
  // The generic "pill for a node, opening on whatever backs it": its quote-level
  // sources if any, else its measured Ki (the only other inspectable backing), else
  // nothing; reasons to doubt always lead. `node` is any object carrying
  // `{sources?, ki?, uncertainty?}`, which is the shape a binding already has and the
  // shape the Data browser's rows are built in, so both go through this one path and
  // a node badges identically wherever it is shown.
  // `what` (optional) names the claim the pill grades, as the tooltip's first line:
  // for a row carrying two pills (an enzyme row's role + its strength), so neither
  // reads as an unlabeled duplicate of the other.
  const sourceBackedPill = (grade, node, what) => {
    const labelled = (extra) => {
      if (!what) return extra;
      const frag = document.createDocumentFragment();
      frag.append(el("strong", null, what), document.createTextNode("\n\n"));
      if (extra instanceof Node) frag.append(extra);
      else if (extra) frag.append(document.createTextNode(extra));
      return frag;
    };
    const doubt = node && node.uncertainty && node.uncertainty.length
      ? node.uncertainty : null;
    // A doubted node reads orange whatever its own quote scored: `uncertain` is a
    // DISPLAY grade taken by any node carrying bullets (see quotes/uncertainty.py), so
    // it is decided here rather than at each call site, which cannot forget it. The
    // node keeps its own source in the tooltip, under the reasons to doubt it: same
    // evidence, honestly framed. A bare llm claim keeps its grey pill (shownGrade).
    if (grade === "unknown")
      return makeProvenancePill("unknown", labelled(unknownSearchTip(node && node.unknown)));
    const shown = shownGrade(grade, doubt);
    const sources = node && node.sources;
    if (sources && sources.length)
      return makeProvenancePill(shown, labelled(withUncertainty(doubt, sourcesTip(sources))));
    if (node && node.ki)
      return makeProvenancePill(shown,
        labelled(withUncertainty(doubt, kiCorpusRefNode(node.ki, { dash: true }))));
    return makeProvenancePill(shown, labelled(withUncertainty(doubt, null)));
  };
  // THE pill for a node-shaped claim `{provenance, sources, uncertainty?, ki?}`: every
  // row badging one goes through here, so a doubted node (a curated `contradicted`
  // holder, an animal-only region) reads orange wherever it is shown, never green
  // because one call site hand-rolled its pill. A flat facet (NbN, class, release)
  // passes a `{provenance, sources}` view of itself.
  const nodePill = (node, what) => sourceBackedPill((node && node.provenance) || null, node, what);

  // The binding's DIRECTION is its own node (kind `drug_binding_action`): "this drug
  // binds this target" and "it does so as an agonist" are two claims, and a measured Ki
  // only ever backs the first. Returns a pill ONLY when the direction is worse backed
  // than the binding beside it, so a row whose quote covers both stays a single pill and
  // the extra badge means something wherever it appears.
  const bindingActionPill = (binding) => {
    const rank = { llm: 1, sourced: 2, verified: 3 };
    // The pill says what is missing about the DIRECTION, so its screen-reader label
    // replaces the generic grade text makeProvenancePill would otherwise announce.
    const pill = (level, why) => {
      const node = makeProvenancePill(level, why);
      const btn = node.matches && node.matches(".src-pill")
        ? node : node.querySelector(".src-pill");
      if (btn) btn.setAttribute("aria-label", why);
      return node;
    };
    if (binding.affinityOnly && binding.unknown)
      return pill("unknown", `${t("drug.actionUnknown")}\n\n${unknownSearchTip(binding.unknown)}`);
    if (binding.affinityOnly) return pill(null, t("drug.actionNoSource"));
    if (binding.actionProvenance === "llm"
        && (rank[binding.provenance] || 0) > 1)
      return pill("llm", t("drug.actionLlm"));
    return null;
  };

  // --- Addon nodes: the panel-slot annotation kind ------------------------------
  // Every other node kind has an implied home (a binding belongs in "Direct molecular targets", an
  // enzyme row in "Metabolism"), so its collection decides where it draws. An addon
  // is the kind for a claim with no such home: it carries its OWN insertion point
  // (see tools/data_generators/addons.py), and these two pieces are the whole hook
  // system. A panel offers slots; the data decides what, if anything, fills them.
  //
  // How an addon draws, keyed by its `display`. A second form (an inline icon with a
  // tooltip, say) is one entry here plus one string in the generator's ADDON_DISPLAYS,
  // never a change at any call site.
  // The boxed callout every display form shares: the tone glyph + title on one line,
  // carrying the node's own source pill, then the claim. Only the wrapper differs
  // (a plain box, or a <details> folded to that head line).
  const addonBox = (addon, wrapTag, headTag, extraCls) => {
    const box = el(wrapTag, `addon addon-${addon.tone}${extraCls}`);
    const head = el(headTag, "addon-head");
    if (addon.glyph) head.appendChild(el("span", "addon-glyph", addon.glyph));
    if (addon.title) head.appendChild(el("strong", "addon-title", addon.title));
    head.appendChild(nodePill(addon));
    box.appendChild(head);
    box.appendChild(el("p", "addon-text", addon.text));
    return box;
  };
  const ADDON_RENDERERS = {
    // A boxed callout: the tone glyph + title on one line, carrying the node's own
    // source pill (an addon is a graded claim like a binding, not panel chrome), then
    // the claim itself.
    admonition: (addon) => addonBox(addon, "div", "div", ""),
    // The same box folded to its head line (glyph + title + pill) until clicked: a
    // background caveat that should not push the data it qualifies down the panel.
    collapsible: (addon) =>
      addonBox(addon, "details", "summary", " addon-collapsible disclosure"),
  };

  /**
   * Splice in whatever addon nodes are anchored at one panel slot. Every registered
   * slot in meta.addon_slots has exactly one of these calls; a slot with nothing
   * authored for it appends nothing, so the hook costs one Map lookup on the panels
   * of the other few thousand nodes.
   *
   * @param {HTMLElement} host  where the addons are appended
   * @param {string} ownerKind  the anchored node's kind ("drug", "receptor", ...)
   * @param {string} ownerId    that node's id (a structure anchors its BASE)
   * @param {string} slot       a meta.addon_slots key
   * @returns {number} how many addons were drawn, so a caller can fall back to a
   *   derived note only when the slot holds no authored (sourced) one.
   */
  const appendAddons = (host, ownerKind, ownerId, slot) => {
    if (!ownerId || !data.addonsBySlot) return 0;
    // An unregistered slot is a wiring bug, not a missing addon: the generator
    // validated every authored addon against this same list, so a typo here asks a
    // question no node can ever be authored to answer.
    const slots = data.meta.addonSlots;
    if (slots && !(slot in slots)) {
      console.warn(`addon slot "${slot}" is not in meta.addon_slots`);
      return 0;
    }
    let drawn = 0;
    for (const addon of data.addonsBySlot.get(`${ownerKind}:${ownerId}:${slot}`) || []) {
      const render = ADDON_RENDERERS[addon.display];
      if (render) { host.appendChild(render(addon)); drawn += 1; }
      else console.warn(`addon "${addon.id}": unknown display "${addon.display}"`);
    }
    return drawn;
  };

  /**
   * The derived twin of a `drug.metabolism` addon: a drug that is both a substrate
   * and a modulator of one isoform changes its own clearance, so its kinetics are
   * non-linear. Read off `drug.autoModulation` (js/data.js), which is an INFERENCE
   * over the enzyme rows rendered just below, so this box words itself
   * conditionally, carries no source pill, and says where it comes from: the rows
   * it reads each carry their own grade, and the coincidence is our reading, not a
   * sentence any corpus prints. An authored addon in the same slot outranks it (it
   * states a mechanism a source really attests), so the caller only falls back here
   * when the slot is empty.
   *
   * @param {object} drug
   * @returns {HTMLElement|null} the box, or null when the drug modulates no isoform
   *   that also clears it
   */
  const derivedAutoModulation = (drug) => {
    const rows = drug.autoModulation || [];
    if (!rows.length) return null;
    const labels = (role) => rows.filter((r) => r.role === role).map((r) => r.label);
    const box = derivedBox("info", t("drug.autoPkTitle"));
    // One sentence per direction: a drug can inhibit one of its own isoforms and
    // induce another (modafinil), and the two read opposite ways over time.
    const parts = [];
    const inhibits = labels("inhibitor");
    const induces = labels("inducer");
    if (inhibits.length) parts.push(t("drug.autoPkInhibits", { enzymes: inhibits.join(", ") }));
    if (induces.length) parts.push(t("drug.autoPkInduces", { enzymes: induces.join(", ") }));
    box.appendChild(el("p", "addon-text", parts.join(" ")));
    box.appendChild(el("p", "addon-derived-note", t("drug.autoPkDerived")));
    return box;
  };

  // The skeleton of a derived (viewer-computed, unpilled) addon-styled box: its tone
  // glyph + title; the caller appends the body. Shared so every derived box reads alike.
  const derivedBox = (tone, title) => {
    const box = el("div", `addon addon-${tone} addon-derived`);
    const head = el("div", "addon-head");
    const glyph = (data.meta.addonTones || {})[tone];
    if (glyph) head.appendChild(el("span", "addon-glyph", glyph));
    head.appendChild(el("strong", "addon-title", title));
    box.appendChild(head);
    return box;
  };

  // A signed tone value as the tone sections print it: "+0.97" / "−0.42", localized.
  const fmtTone = (v) => `${v < 0 ? "−" : "+"}${Math.abs(v).toLocaleString(
    window.__I18N__.lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  // A drug's net indicative tone on one system, the raw uncapped sum (0 when it sets
  // none): what the drug panel's tone section shows and the group panel ranks by. The
  // overlay's capped `weight` only scales the animation.
  const netTone = (drug, kind) => ((drug.flowSystems || {})[kind] || { sum: 0 }).sum;

  // Caution box leading "Direct molecular targets" for a drug with active
  // metabolites: the rows list only the parent's own bindings, while the metabolites
  // act too (their bindings live under Active metabolites or on their own drug panel).
  // Derived from the drug's sourced metabolite nodes, so no pill of its own; the
  // button jumps to that section, looked up at click time since it renders later.
  const derivedActiveMetabolites = (drug, body) => {
    const names = (drug.metabolites || []).map((m) => m.name);
    if (!names.length || drug.prodrug) return null;
    const box = derivedBox("caution", t("drug.metabolites"));
    const p = el("p", "addon-text", `${t(names.length > 1 ? "drug.activeMetabWarnMany" : "drug.activeMetabWarnOne",
      { names: names.join(", ") })} `);
    const go = el("button", "addon-jump", t("drug.activeMetabSee"));
    go.type = "button";
    go.addEventListener("click", () =>
      flashRow(body.querySelector('[data-tour-sec="metabolites"]')));
    p.appendChild(go);
    box.appendChild(p);
    return box;
  };

  // The "why this is uncertain" block that leads a flagged binding's tooltip: a lead
  // line, then one row per reason. Each row carries its OWN badge, so the reader sees
  // at a glance which reasons rest on a source (green ✓, its quote right there) and
  // which are absences of evidence (red ✕, "the corpus never says this"). The badges
  // are inert spans, not real pills: nesting a .help-tip button inside a tooltip would
  // put a tooltip inside a tooltip. The sentences are i18n strings keyed by the reason
  // `kind`, so nothing here is stored prose (see quotes/uncertainty.py).
  // `shown` is the text of the pill's own source block printed under the reasons: a
  // reason resting on that very source (an animal-only Ki) would repeat it verbatim,
  // and only the copy below carries the live link, so the reason omits it.
  const uncertaintyTip = (list, shown = "") => {
    const box = el("div", "src-uncertain");
    box.appendChild(el("div", "src-uncertain-lead", t("info.uncertainLead")));
    const ul = el("ul", "src-uncertain-list");
    for (const u of list) {
      const li = el("li");
      const badge = el("span",
        u.absence ? "src-pill src-todo" : "src-pill src-prov-verified",
        u.absence ? NOSOURCE_GLYPH : "✓");
      badge.setAttribute("aria-hidden", "true");
      li.append(badge, el("span", "src-uncertain-text",
        t(`uncertain.${u.kind}`, uncertaintyArgs(u.args))));
      const src = (u.sources || []).map(sourceTipLine)
        .filter((line) => line && !shown.includes(line)).join("\n\n");
      if (src) li.appendChild(el("div", "src-uncertain-src", src));
      ul.appendChild(li);
    }
    box.appendChild(ul);
    return box;
  };

  // Prepend uncertaintyTip to whatever tooltip content a pill would otherwise get
  // (a string of source lines, a node, or nothing). Returns `extra` untouched when
  // the node is not flagged, so every non-flagged pill is byte-identical.
  // One "Found in" region's pill (a locationEntry): orange with its reasons first when
  // the region carries bullets (animal-only evidence), else its own grade.
  const locationPill = (meta) => {
    const doubt = meta.uncertainty && meta.uncertainty.length ? meta.uncertainty : null;
    const tip = meta.sources && meta.sources.length
      ? sourcesTip(meta.sources) : t("receptor.locUnsourced");
    return makeProvenancePill(shownGrade(meta.provenance, doubt), withUncertainty(doubt, tip));
  };

  const withUncertainty = (list, extra) => {
    if (!list) return extra;
    const frag = document.createDocumentFragment();
    frag.appendChild(uncertaintyTip(list,
      extra instanceof Node ? extra.textContent : extra || ""));
    if (extra instanceof Node) frag.append(extra);
    else if (extra) frag.append(document.createTextNode(extra));
    return frag;
  };

  // The strongest-affinity binding a drug has feeding a transmitter system (the
  // binding whose flowKind == kind, min representative Ki), or undefined. The one
  // node behind the drug<->system link, so the drug panel's "Neurotransmitter tone"
  // row and the projection-group panel's "Drugs acting on this system" row rank +
  // source it identically. (bindingKi, the shared Ki key, is module-scope above.)
  const strongestBindingForKind = (bindings, kind) =>
    bindings.filter((b) => b.flowKind === kind)
      .sort((a, b) => bindingKi(a) - bindingKi(b))[0];

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

  // A coloured effect glyph (+ boost / − block / ≈ modulate, in the effect's colour)
  // that replaces the plain colour bar at the head of a drug binding row, so the
  // action's direction reads at a glance. `label` (the localized effect name) is the
  // accessible name. When there is a label the glyph is wrapped in a tap-to-explain
  // tooltip (withTip): a tap on it shows the effect name and, crucially, stops the
  // tap from bubbling to the clickable binding row (so on a phone tapping the "+/−"
  // no longer navigates away, per the request); on desktop it also shows on hover.
  const effectGlyph = (effect, color, label) => {
    const g = el("span", "effect-glyph", EFFECT_GLYPHS[effect] || "·");
    g.style.color = color;
    if (label) g.setAttribute("aria-label", label);
    return label ? withTip(g, label) : g;
  };

  // Format a Ki (nM) to ~3 significant figures without trailing noise (0.29, 2.7,
  // 1240), so 0.28999999... reads as 0.29.
  const fmtKi = (n) => {
    const p = Number(n);
    return isFinite(p) ? String(parseFloat(p.toPrecision(3))) : "?";
  };

  // The measured PDSP Ki shown to the right of a binding's source badge: the median
  // value + [min-max] range + human/non-human assay counts, then its own "truth
  // badge" (a verified provenance pill whose tooltip cites the one representative
  // assay: species, preparation, radioligand, reference). A value borrowed through
  // the alias map (an enantiomer/prodrug/metabolite) also gets a visible ⚠ warning
  // naming the compound it was actually measured on, so it is never read as this
  // drug's own number. Returns a fragment appended to the binding row.
  const kiChip = (ki) => {
    const frag = document.createDocumentFragment();
    // A literature Ki (a quote-gated corpus like Wikipedia) is a single value quoted
    // from a source, not a raw assay: it has no ki_id and no human/non-human counts.
    // Render it plainly (value + optional range + a "literature value" tag), with the
    // corpus + revision permalink in the pill tooltip; skip the assay-only chrome
    // (species counts, "measured in non-human", the alias ⚠ warning).
    const measured = ki.kiId != null || ki.nHuman > 0 || ki.nNonhuman > 0;
    if (!measured) {
      const chip = el("span", "ki-chip");
      chip.appendChild(el("span", "ki-val", `Ki ${fmtKi(ki.median)} nM`));
      chip.appendChild(el("span", "ki-detail",
        (ki.min !== ki.max ? `${fmtKi(ki.min)}–${fmtKi(ki.max)} · ` : "")
        + t("drug.kiCited")));
      frag.appendChild(chip);
      // The corpus label doubles as the link to the exact source (see kiCorpusRefNode:
      // ki.reference's pinned-revision permalink, else the corpus URL), so a click opens
      // the very table the value was quoted from. The kiCited explainer follows;
      // makeProvenancePill then appends the grade explainer under it.
      const extra = kiCorpusRefNode(ki);
      extra.append("\n\n" + t("drug.kiCitedTip"));
      frag.appendChild(makeProvenancePill(ki.provenance, extra));
      return frag;
    }
    const chip = el("span", "ki-chip");
    chip.appendChild(el("span", "ki-val", `Ki ${fmtKi(ki.median)} nM`));
    chip.appendChild(el("span", "ki-detail",
      `${fmtKi(ki.min)}–${fmtKi(ki.max)} · `
      + t("drug.kiCounts", { h: ki.nHuman, n: ki.nNonhuman })
      + (ki.inactive ? " · " + t("drug.kiInactive", { n: ki.inactive }) : "")));
    if (ki.nHuman === 0) chip.classList.add("ki-nonhuman");
    frag.appendChild(chip);
    // Truth badge: the assay behind the value.
    const assay = [
      ki.kiId != null ? `#${ki.kiId}` : "",
      ki.valueNm != null ? `${fmtKi(ki.valueNm)} nM` : "",
      ki.species, ki.preparation, ki.radioligand, ki.reference,
    ].filter(Boolean).join(", ");
    let tip = t("drug.kiTip", { h: ki.nHuman, n: ki.nNonhuman,
      assay: `${ki.corpusRef}: ${assay}` });
    if (ki.nHuman === 0) {
      tip += "\n\n" + t("drug.kiTipNonHuman", { species: ki.species || "?" });
    }
    if (ki.inactive) {
      tip += "\n\n" + t("drug.kiInactiveTip", { n: ki.inactive });
    }
    const relationLabel = ki.mapped
      ? t(`drug.rel.${ki.relation}`) || ki.relation : "";
    if (ki.mapped) {
      tip += "\n\n" + t("drug.kiMappedTip",
        { compound: ki.measuredAs, relation: relationLabel });
    }
    frag.appendChild(makeProvenancePill(ki.provenance, tip));
    if (ki.mapped) {
      const warn = el("span", "ki-mapped",
        "⚠ " + t("drug.kiMapped", { compound: ki.measuredAs }));
      warn.title = t("drug.kiMappedTip",
        { compound: ki.measuredAs, relation: relationLabel });
      frag.appendChild(warn);
    }
    return frag;
  };

  // A drug's name as a plain clickable label, the same `.legend-item.clickable` look
  // as the Drugs list rows, so a name that jumps to a drug reads alike everywhere.
  const drugNameLink = (drug, text = drug.label || drug.name) => {
    const a = el("span", "legend-item clickable drug-name-link", text);
    a.setAttribute("role", "link");
    a.tabIndex = 0;
    a.addEventListener("click", () => onDrugPick(drug));
    a.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onDrugPick(drug); }
    });
    return a;
  };

  // One binding row, shared by the drug panel's "Direct molecular targets" list and a
  // receptor/target panel's "Interacting drugs" list: the two render the *same*
  // resolved binding from opposite ends (a drug's target vs a target's drug), so
  // the markup lives once. Layout: the effect glyph, then a text column holding
  // the leading name, the action line, and (stacked under them) the measured Ki
  // chip with its own verified badge; the binding's source pill sits to the right
  // of that whole block. `nameText` leads the row (the target name on a drug
  // panel, the drug name on a target panel); `onActivate`, when given, makes the
  // row a clickable link. An affinity_only binding (PDSP Ki, no known direction)
  // gets a muted neutral glyph + an "affinity only" line and no source pill (Stahl
  // never stated it; the Ki's verified badge is its only source).
  const bindingRow = (binding, drug, nameText, onActivate) => {
    const li = el("li");
    const affinity = binding.affinityOnly;
    if (binding.tentative) li.classList.add("tentative");
    if (affinity) li.classList.add("affinity-only");
    li.appendChild(effectGlyph(
      binding.effect, affinity ? "#8a8f98" : binding.effectColor,
      affinity ? t("drug.affinityOnly") : binding.effectLabel));
    const txt = el("div", "bind-text");
    // Name + the binding's own source pill share the first line, so the pill sits
    // right of the target name rather than being stranded at the far panel edge
    // past the (wide) Ki line below it. An affinity_only binding carries no source
    // pill (its Ki's verified badge is the only source), so the name stands alone.
    const nameRow = el("div", "bind-name");
    nameRow.appendChild(el("span", "bind-target", nameText));
    if (!affinity) nameRow.appendChild(nodePill(binding));
    txt.appendChild(nameRow);
    const parts = [affinity ? t("drug.affinityOnly") : binding.actionLabel,
                   binding.note,
                   binding.viaMetabolite
                     ? t("drug.viaMetabolite", { name: binding.viaMetabolite }) : null];
    if (binding.tentative) parts.push(t("drug.speculative"));
    if (binding.peripheral) parts.push(t("drug.peripheral"));
    const detail = parts.filter(Boolean).join(" · ");
    if (detail) {
      const line = el("span", "bind-action", detail);
      // The direction's own grade rides the action line it grades, not the name row
      // (which carries the binding's).
      const dirPill = bindingActionPill(binding);
      if (dirPill) line.appendChild(dirPill);
      txt.appendChild(line);
    }
    // Ki stacked under the name+action, with its own verified badge beside it.
    if (binding.ki) {
      const kiLine = el("div", "bind-ki");
      kiLine.appendChild(kiChip(binding.ki));
      txt.appendChild(kiLine);
    }
    li.appendChild(txt);
    li.title = affinity
      ? `${t("drug.affinityOnly")} · ${nameText}`
      : `${binding.effectLabel} · ${nameText}`;
    if (onActivate) {
      li.classList.add("clickable");
      li.addEventListener("click", onActivate);
    }
    return li;
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

  const appendDrugsByCategory = (list, container) => {
    const cats = data.meta.drugCategoryLabels || {};
    const byCat = new Map();
    for (const item of list) {
      const cat = (item.drug.categories && item.drug.categories[0]) || "other";
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push(item);
    }
    for (const items of byCat.values()) {
      items.sort((a, b) => {
        const ka = bindingKi(a.binding), kb = bindingKi(b.binding);
        return ka !== kb ? ka - kb : a.drug.name.localeCompare(b.drug.name);
      });
    }
    const metaOrder = [...Object.keys(cats),
                       ...[...byCat.keys()].filter((c) => !(c in cats))];
    const classKi = new Map();
    for (const [cat, its] of byCat)
      classKi.set(cat, Math.min(...its.map((it) => bindingKi(it.binding))));
    const order = [...byCat.keys()].sort((a, b) => {
      const ka = classKi.get(a), kb = classKi.get(b);
      return ka !== kb ? ka - kb : metaOrder.indexOf(a) - metaOrder.indexOf(b);
    });
    for (const cat of order) {
      container.appendChild(el("h4", "drug-cat", cats[cat] || cat));
      const ul = el("ul");
      // Same shared row builder as the drug panel's "Direct molecular targets" list (same resolved
      // binding, seen from the target's side), so the effect glyph, action, the
      // measured Ki chip and the shared source pill all render identically here;
      // clicking a row opens that drug.
      for (const item of byCat.get(cat)) {
        const { drug, binding } = item;
        // A metabolite entry (its own non-drug binding surfaced here) reads
        // "NAME (metab. of PRODRUG)" and clicks through to the parent drug; a normal
        // drug entry just shows its display name. A metabolite shared by several parents
        // lists them all ("metab. of A, B") in one row (see drugsByTarget merge).
        const label = item.viaMetaboliteOfList
          ? `${item.metaboliteName} (${t("drug.metaboliteOf", { prodrug: item.viaMetaboliteOfList.join(", ") })})`
          : drug.displayName;
        // A metabolite deep-links to its parent drug (no standalone metabolite view),
        // passing its name so the parent panel scrolls to + flashes that metabolite's row.
        const row = bindingRow(binding, drug, label,
          item.viaMetaboliteOfList
            ? () => onDrugPick(drug, { highlightMetabolite: item.metaboliteName })
            : () => onDrugPick(drug));
        row.dataset.tourId = `ixdrug:${drug.id}`; // guided-tour hook: a drug row inside a target panel
        ul.appendChild(row);
      }
      container.appendChild(ul);
    }
  };

  // Shared by the receptor + target views: the drugs that act on this target, so
  // you can go from a target to every drug touching it (grouped by category, see
  // appendDrugsByCategory). Omitted entirely when no drug in the dataset acts on it.
  // A prodrug acting through a metabolite drug (lisdexamfetamine via
  // dextroamphetamine) is listed beside it, its row reading "via <metabolite>", but
  // left out of the count: the binding node is the metabolite's (see
  // data.prodrugsByTarget).
  const interactorsOf = (targetId) => ({
    list: (data.drugsByTarget && data.drugsByTarget.get(targetId)) || [],
    borrowed: (data.prodrugsByTarget && data.prodrugsByTarget.get(targetId)) || [],
  });
  const appendInteractingDrugs = (targetId) => {
    const { list, borrowed } = interactorsOf(targetId);
    if (!list.length && !borrowed.length) return;
    const wrap = el("div", "info-bindings info-interactors");
    wrap.dataset.tourSec = "drugs"; // guided-tour section anchor
    wrap.appendChild(el(
      "h3", null, `${t("targets.interactingDrugs")} (${list.length})`));
    appendDrugsByCategory([...list, ...borrowed], wrap);
    body.appendChild(wrap);
  };

  // A receptor_group panel (α2 / glutamate) links to its modeled subtype receptors
  // (target.subtypes, a sourceless taxonomy). Below the group's own interacting
  // drugs, list each subtype that has drugs of its own in a collapsed <details>
  // dropdown, so from the coarse α2 panel you can reach (and expand) the drugs that
  // bind α2A/B/C/D specifically (e.g. asenapine at α2A). Subtypes with no interacting
  // drug are skipped; the whole section is omitted when none qualify.
  const appendSubtypeInteractors = (subtypes) => {
    if (!Array.isArray(subtypes) || !subtypes.length) return;
    const withDrugs = subtypes
      .map(interactorsOf)
      .filter((s) => s.list.length || s.borrowed.length);
    if (!withDrugs.length) return;
    const wrap = el("div", "info-bindings info-interactors info-subtype-interactors");
    wrap.appendChild(el("h3", null, t("targets.bySubtype")));
    for (const { list, borrowed } of withDrugs) {
      const rows = [...list, ...borrowed];
      // The subtype's display name comes off the resolved binding (localized), so it
      // needs no separate receptor lookup and stays in sync with the drug panel.
      const name = (rows[0].binding && rows[0].binding.targetName) || "";
      const details = el("details", "disclosure subtype-group");
      details.appendChild(el("summary", null, `${name} (${list.length})`));
      appendDrugsByCategory(rows, details);
      wrap.appendChild(details);
    }
    body.appendChild(wrap);
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
    appendPathwayList, appendReference, appendSourcedHeading, appendWikiImages,
    betaSection, body, clearBody, data, derivedRow, el, fmtTone, foldBody, linkName,
    locationList, netTone, nodePill, onDrugPick, onTargetPick, strongestBindingForKind,
  };
  return {
    show(proj) {
      clearBody("connection");
      body.appendChild(el("h2", "info-title", proj.label || t("info.connection")));
      // Type line: the connection's analogue of a structure's group line ("Lobe"
      // etc.), stating plainly what this node is (a projection / neuron pathway).
      body.appendChild(el("div", "info-group", t("info.projectionType")));

      // The pathway's one source grade (strongest over its citations), shown on
      // each data row below so every claim (route, transmitter, description) carries
      // its own badge, rather than a single block at the bottom that leaves it
      // unclear which node it backs. The tooltip lists the citation(s).
      const provPill = () => nodePill(proj);

      // Route line: from -> to (or <-> for a bidirectional/commissural link), each
      // endpoint clickable to jump to (and isolate) that structure.
      const route = el("div", "info-route");
      route.appendChild(endpointEl(proj.from));
      route.appendChild(el("span", "conn-dir", proj.bidirectional ? "↔" : "→"));
      route.appendChild(endpointEl(proj.to));
      route.appendChild(provPill());
      body.appendChild(route);

      // Kind swatch + kind/transmitter text + its source badge. The kind line used to
      // state two claims at once ("Excitatory · Glutamate") under the pathway's single
      // grade, so a sentence that only said region A projects to region B also published
      // a green check on the transmitter AND on the sign that colours the arrow in
      // Potential mode. Each is its own graded node now (see the generator's
      // quotes/attestation.py), so each gets its own pill, and a part no cited quote
      // names reads grey rather than borrowing the route's check.
      const claims = proj.claims || {};
      // The shared node pill, so a sub-claim carrying uncertainty bullets reads orange.
      const claimPill = (claim) => sourceBackedPill((claim && claim.grade) || "llm", claim);
      const meta = el("div", "info-meta");
      const swatch = el("span", "swatch line");
      swatch.style.background = proj.color || "#fff";
      meta.appendChild(swatch);
      // A signed pathway splits into two rows (the sign here, the transmitter below);
      // a modulatory one makes no sign claim at all, so its single line ("Histaminergic
      // · Histamine") is entirely the transmitter claim. Localized via the shared
      // colourMeaningOf so this type line and the arrow's colour-meaning tooltip cannot
      // drift.
      const kindLabel = (data.meta.kindLabels && data.meta.kindLabels[proj.kind])
        || proj.kind || "";
      meta.appendChild(el("span", null, claims.sign ? kindLabel : colourMeaningOf(proj)));
      meta.appendChild(claimPill(claims.sign || claims.transmitter));
      body.appendChild(meta);
      if (claims.sign && proj.neurotransmitter) {
        const nt = el("div", "info-meta");
        // An invisible swatch keeps this row aligned under the kind line above it
        // (same indent, no second colour chip: the arrow has only one colour).
        const spacer = el("span", "swatch line");
        spacer.style.visibility = "hidden";
        nt.appendChild(spacer);
        nt.appendChild(el("span", null, proj.neurotransmitter));
        nt.appendChild(claimPill(claims.transmitter));
        body.appendChild(nt);
      }

      // Short description + its source badge (inline at the end, like the receptor
      // baked-description pill).
      if (proj.description) {
        const p = el("p", "info-desc", proj.description);
        p.appendChild(document.createTextNode(" "));
        p.appendChild(provPill());
        body.appendChild(p);
      }
    },

    /**
     * Populate the panel for a *structure* (clicking a region, a double-click,
     * or a structure search result): its name, group, and the list of pathways
     * touching it. Each connection row is clickable and routes through
     * onConnectionPick so the caller can frame it + open the connection panel.
     */
    showStructure(structure) {
      clearBody("structure");
      body.appendChild(el("h2", "info-title", structure.name));
      // The anatomy classification grade (existence / group / position) rides the
      // group line it actually grades, not a broad "Source" row at the bottom (a
      // source always sits on the specific node it backs). Omitted when the anatomy
      // grade is absent (structures are the only node kind that may be ungraded).
      appendSourcedHeading(
        data.meta.groupLabels[structure.group] || structure.group,
        structure.classification_provenance, structure.sources);
      // Addon slot: a caveat about this region as a whole (see appendAddons). A
      // structure addon anchors the hemisphere-less BASE, so it shows on both sides.
      appendAddons(body, "structure", stripSide(structure.id), "structure.top");

      // Wikipedia illustration (the lead rotating-brain GIF, else an SVG diagram or
      // an infobox image) + its lazy "show more" gallery, via the shared helper (see
      // appendWikiImages): hot-linked, spinner while loading, silent hide on failure.
      appendWikiImages(structure.structureImage, structure.structureImageGallery,
        structure.name);

      // External reference (Wikipedia) + its live lead summary, via the shared
      // appendReference (structures carry no baked description, so the live lead,
      // when it arrives, appears above the link).
      appendReference({ url: structure.wikipedia });

      // Pathways with this structure at either end, in the data's order, with
      // left/right twins collapsed (via pathwayList): a midline source (e.g. the
      // raphe) projects to both hemispheres of each target, which would otherwise
      // list as two rows differing only by "Left"/"Right". Each row shows just the
      // other endpoint's hemisphere-stripped base name, direction relative to this
      // structure (out it projects, in it receives, both reciprocal/commissural).
      const conns = data.projections.filter(
        (p) => p.from === structure.id || p.to === structure.id);
      if (conns.length === 0) {
        body.appendChild(el("p", "info-desc", t("info.noConnections")));
      } else {
        const { ul, count } = pathwayList(conns, (proj) => {
          const outgoing = proj.from === structure.id;
          const otherId = outgoing ? proj.to : proj.from;
          return {
            dir: proj.bidirectional ? "both" : outgoing ? "out" : "in",
            label: baseNameOf(otherId),
          };
        });
        const wrap = el("div", "info-connections");
        wrap.appendChild(el(
          "h3", null, `${t("info.connections")} (${count})`));
        wrap.appendChild(ul);
        body.appendChild(wrap);
      }

      // What is expressed here: the receptors + non-receptor targets whose "Found in"
      // list names this region. A structure with no pathway can still carry plenty of
      // them, so this section is outside the branch above.
      appendExpressedTargets(stripSide(structure.id));
      // Headed sections start folded, like the drug panel (see foldSections).
      foldBody();
    },

    /**
     * Populate the panel for a *receptor* (clicking a receptor legend row): its
     * name, neurotransmitter system, a Wikipedia link, a one-line description, the
     * classification facts (neurotransmitter, mechanism type, excit/inhib/modulatory
     * effect with its sign swatch, pre/post-synaptic site) and where it is
     * expressed (the region list, "Throughout the brain" for a ubiquitous receptor,
     * or a no-CNS-role note for a stub). Built fresh each call like the others.
     */
    showReceptor(receptor) {
      clearBody("receptor");
      body.appendChild(el("h2", "info-title", receptor.name));
      body.appendChild(el("div", "info-group", receptor.familyLabel));
      appendAddons(body, "receptor", receptor.id, "receptor.top");

      const { wiki: recWiki } = appendReference({
        url: receptor.wikipedia, description: receptor.description,
      });
      // External lookups beside the reference: PDSP Ki (binding affinity; a browse
      // link, PDSP has no per-target search URL), UniProt, ClinPGx (pharmacogenomics)
      // and the Guide to Pharmacology (GtoPdb). The first two are protein/gene
      // databases, so they search the HGNC symbol (`ADRA1A`; the display name "α1A"
      // finds nothing there), falling back to the name for the one stub receptor
      // with no human gene; GtoPdb indexes the pharmacological name itself.
      const recGene = receptor.gene || receptor.name;
      appendLookupLink(recWiki, "info.pdsp", PDSP_KIDB_URL, "info.pdspTitle");
      appendLookupLink(recWiki, "info.uniprot", uniprotSearchUrl(recGene), "info.uniprotTitle");
      appendLookupLink(recWiki, "info.clinpgx", clinpgxSearchUrl(recGene), "info.clinpgxGeneTitle");
      appendLookupLink(recWiki, "info.gtopdb", gtopdbSearchUrl(receptor.name), "info.gtopdbTitle");

      // Classification facts as label / value rows; the "effect" value carries the
      // sign swatch so the colour matches the dots + legend row. Each attribute
      // (family / class / sign / synaptic) is its OWN graded sub-claim, so each row
      // shows its OWN pill from receptor.classification[attr]: a quote that only
      // backs the sign no longer lends a verified badge to the GPCR or pre/post
      // claim it never addressed. Unsourced attributes read honestly as llm.
      // Through the shared node pill, so an attribute another corpus denies
      // (quotes/contradictions.py) goes orange with the denial leading its tooltip.
      const attrPill = (attr) => {
        const entry = (receptor.classification || {})[attr] || {};
        return sourceBackedPill(entry.grade, entry);
      };
      const facts = el("div", "info-facts");
      facts.dataset.tourSec = "facts"; // guided-tour section anchor
      addFactRow(facts, t("receptor.neurotransmitter"), receptor.neurotransmitter,
        null, { pill: attrPill("family") });
      addFactRow(facts, t("receptor.type"), receptor.classLabel,
        null, { pill: attrPill("receptor_class") });
      addFactRow(facts, t("receptor.effect"), receptor.signLabel, receptor.signColor,
        { pill: attrPill("sign") });
      addFactRow(facts, t("receptor.synaptic"), receptor.synapticLabel,
        null, { pill: attrPill("synaptic") });
      body.appendChild(facts);

      // Where it is expressed.
      const where = el("div", "info-locations");
      where.dataset.tourSec = "regions"; // guided-tour section anchor
      where.appendChild(el("h3", null, t("receptor.foundIn")));
      if (receptor.ubiquitous) {
        const p = el("p", "info-desc info-desc-pilled", t("receptor.ubiquitous"));
        const u = receptor.ubiquitousInfo;
        if (u) {
          const tip = u.sources && u.sources.length
            ? sourcesTip(u.sources) : t("receptor.locUnsourced");
          p.appendChild(makeProvenancePill(u.provenance, tip));
        }
        where.appendChild(p);
      } else if (receptor.locationNames.length === 0) {
        where.appendChild(el("p", "info-desc", t("receptor.noRole")));
      } else {
        where.appendChild(locationList(receptor.locationNames, receptor.locations,
          receptor.locationInfo, receptor.densityInfo));
      }
      body.appendChild(where);
      appendEffects(receptor.effectInfo, receptor.effectsUnknown);
      appendDownstream(receptor.modulationInfo);
      appendDemographics(receptor.demographicInfo);
      appendVariants(receptor.variantInfo);

      // Drugs that act on this receptor, grouped by category.
      appendInteractingDrugs(receptor.id);
      // Headed sections start folded, like the drug panel (see foldSections).
      foldBody();
    },

    /**
     * Populate the panel for a non-receptor *target* (a transporter / enzyme / ion
     * channel / receptor group, clicked in the merged "Receptors & targets" section
     * or a target search result): its name, its neurotransmitter system (or
     * "Other"), a Wikipedia link (or a TODO pill until one is gathered), the type +
     * system facts, and the regions it sits in. Receptors keep the richer
     * showReceptor view; this is the lighter sibling for the non-receptor targets.
     */
    showTarget(target) {
      clearBody("target");
      body.appendChild(el("h2", "info-title", target.name));
      body.appendChild(el(
        "div", "info-group", target.systemLabel || t("targets.otherSystem")));
      appendAddons(body, "target", target.id, "target.top");

      // Reference + live lead (targets carry no baked description), via the shared
      // appendReference, so the link sits under any live lead like every panel.
      const { wiki: tgtWiki } = appendReference({ url: target.wikipedia });
      // PDSP covers transporters / enzymes / ion channels too, so the same lookup,
      // and ClinPGx on the gene (SLC6A4 for SERT): a transporter or a metabolizing
      // enzyme is exactly what the pharmacogenomics literature is about. A group
      // target (α2 = ADRA2A/B/C) searches its representative member.
      appendLookupLink(tgtWiki, "info.pdsp", PDSP_KIDB_URL, "info.pdspTitle");
      if (target.gene) {
        appendLookupLink(tgtWiki, "info.clinpgx",
          clinpgxSearchUrl(target.gene), "info.clinpgxGeneTitle");
      }

      // The classification grade (type / system claims) sits on each fact's OWN row
      // rather than a single broad "Source" row below, so a source always grades the
      // specific node beside it. A fresh pill per row; only when the row has a value
      // (so an empty System row still drops instead of showing a bare pill).
      const tgtPill = () => nodePill({ provenance: target.classificationProvenance, sources: target.sources });
      const withPill = (v) => (v && target.classificationProvenance ? { pill: tgtPill() } : {});
      const facts = el("div", "info-facts");
      addFactRow(facts, t("receptor.type"), target.typeLabel, target.swatchColor,
        withPill(target.typeLabel));
      addFactRow(facts, t("receptor.system"), target.systemLabel, null,
        withPill(target.systemLabel));
      // Tone-polarity row: its OWN sourced sub-claim, NOT the classification grade.
      // The vesicular/sign flags flip the drug-flow overlay's direction, so a wrong
      // one silently inverts a drug's apparent effect on tone; surfacing it with its
      // own pill keeps that claim honestly graded (e.g. α2's autoreceptor character
      // reads llm until quote-verified, VMAT2's vesicular claim reads verified).
      if (target.polarityProvenance) {
        const polText = target.vesicular
          ? t("target.polarityVesicular")
          : (target.polaritySign === "inhibitory"
            ? t("target.polarityAutoreceptor") : null);
        if (polText) {
          const polPill = nodePill({ provenance: target.polarityProvenance, sources: target.polaritySources });
          addFactRow(facts, t("target.polarity"), polText, null, { pill: polPill });
        }
      }
      if (facts.childElementCount) body.appendChild(facts);

      // Where it sits (same "Found in" list as a receptor; empty -> no footprint).
      const where = el("div", "info-locations");
      where.appendChild(el("h3", null, t("receptor.foundIn")));
      if (!target.locationNames.length) {
        where.appendChild(el("p", "info-desc", t("receptor.noRole")));
      } else {
        where.appendChild(locationList(target.locationNames, target.locationBases,
          target.locationInfo, target.densityInfo));
      }
      body.appendChild(where);
      appendEffects(target.effectInfo, target.effectsUnknown);
      appendDemographics(target.demographicInfo);
      appendVariants(target.variantInfo);

      // Drugs that act on this target, grouped by category.
      appendInteractingDrugs(target.id);
      // For a receptor_group (α2 / glutamate): drugs binding each modeled subtype
      // (α2A/B/C/D, ...) in a collapsed per-subtype dropdown below the group's own.
      appendSubtypeInteractors(target.subtypes);
      // Headed sections start folded, like the drug panel (see foldSections).
      foldBody();
    },

    /**
     * Populate the panel for a metabolic *enzyme* (a row in the Enzymes section, or
     * an enzyme row inside a drug's Metabolism list): its Wikipedia reference, then
     * the drugs at it grouped by the role they play (substrates first, then the
     * inhibitors and inducers that move them).
     *
     * Deliberately the lightest panel in the app: an enzyme is pharmacokinetics, so
     * it has no anatomy to show, no expression regions and nothing to light in the
     * 3D scene. Each drug row carries the grade pill of the very node that put it
     * here (the Stahl pharmacokinetics line), so the claim is auditable in place.
     */
    showEnzyme(enzyme) {
      clearBody("enzyme");
      body.appendChild(el("h2", "info-title", enzyme.label));
      body.appendChild(el("div", "info-group", t("enzyme.heading")));
      const { wiki: enzWiki } = appendReference({ url: enzyme.wikipedia });
      // ClinPGx covers exactly what this panel cannot: which variants of this
      // isoform make a carrier a poor or ultra-rapid metabolizer, and the dosing
      // guidance that follows. Lookup link, so no provenance pill.
      if (enzWiki) {
        appendLookupLink(enzWiki, "info.clinpgx",
          clinpgxSearchUrl(enzyme.label), "info.clinpgxEnzymeTitle");
      }

      // The active metabolites this isoform MAKES, the other half of the metabolism
      // graph (the rows below are what it *handles*). Same node seen from the enzyme's
      // end: each row carries the very grade pill the parent drug's panel shows, and
      // clicks through to that parent, where the metabolite is listed.
      const made = enzyme.metabolites || [];
      if (made.length) {
        const box = el("div", "info-bindings info-metabolites");
        box.appendChild(el("h3", null, `${t("enzyme.forms")} (${made.length})`));
        const ul = el("ul");
        for (const { drug, metabolite, formedBy } of made) {
          const li = el("li");
          const text = el("span", "bind-text");
          text.appendChild(el("span", "bind-target", metabolite.name));
          const parts = [t("enzyme.formsOf", { drug: drug.displayName })];
          if (formedBy.reactionLabel) parts.push(formedBy.reactionLabel);
          text.appendChild(el("span", "bind-action", ` ${parts.join(" · ")}`));
          li.appendChild(text);
          li.appendChild(nodePill(formedBy));
          li.classList.add("clickable");
          li.addEventListener("click",
            () => onDrugPick(drug, { highlightMetabolite: metabolite.name }));
          ul.appendChild(li);
        }
        box.appendChild(ul);
        body.appendChild(box);
      }

      // How fast people clear a drug through this isoform, and how common each speed
      // is per population group (PharmFreq, corpus #13). It sits above the drug lists
      // because it qualifies every one of them: a "major substrate" row means
      // something different to a poor metabolizer than to a normal one. One graded
      // node for the whole profile, so one pill on the heading.
      const variability = enzyme.variability;
      if (variability) {
        const box = el("div", "info-bindings info-variability");
        const head = el("h3", null, t("enzyme.variability"));
        head.appendChild(nodePill(variability));
        box.appendChild(head);
        box.appendChild(el("p", "var-caveat", t("enzyme.variabilityCaveat")));
        // Where these numbers come from, and where to go past them: we publish one
        // profile per isoform we model, PharmFreq publishes the whole atlas. A lookup
        // link like the ClinPGx one on a drug's Metabolism section, so no pill: the
        // pill on the heading above already names the source of the claim itself.
        const freqRow = el("div", "info-wiki");
        freqRow.appendChild(el("span", null, t("info.frequencies")));
        appendLookupLink(freqRow, "info.pharmfreq", PHARMFREQ_URL,
          "info.pharmfreqTitle");
        box.appendChild(freqRow);
        // The key doubles as the caption: PM/IM/NM/UM are jargon, and the colour a
        // reader is about to see in every bar is defined here once rather than in a
        // tooltip they would have to hunt for.
        const key = el("ul", "var-key");
        for (const { phenotype, label, note } of variability.groups[0].cells) {
          const li = el("li");
          li.appendChild(el("span", `var-swatch var-${phenotype.toLowerCase()}`));
          li.appendChild(el("span", "var-key-label", label));
          li.appendChild(el("span", "var-key-note", ` · ${note}`));
          key.appendChild(li);
        }
        box.appendChild(key);
        const ul = el("ul", "var-rows");
        for (const group of variability.groups) {
          const li = el("li");
          li.appendChild(el("span", "var-group", group.label));
          const bar = el("span", "var-bar");
          for (const cell of group.cells) {
            const seg = el("span", `var-seg var-${cell.phenotype.toLowerCase()}`);
            seg.style.width = `${cell.freq * 100}%`;
            bar.appendChild(seg);
          }
          // The exact figures, on the bar rather than on each segment: a 1%-wide
          // segment is not a hover target, and reading one speed against the others is
          // the whole point of the bar, so the tip carries the row entire. Nothing is
          // rounded or dropped on the way here; the bar is the shape of the numbers
          // and this is the numbers.
          li.appendChild(attachTip(bar, `${group.label}\n` + group.cells
            .map((c) => `${c.label} ${(c.freq * 100).toFixed(1)}%`).join("\n")));
          ul.appendChild(li);
        }
        box.appendChild(ul);
        body.appendChild(box);
      } else {
        // An empty section rather than no section: 13 of the 18 isoforms we model have
        // no published profile, the two the drug roster leans on hardest among them
        // (CYP3A4 clears 109 of the drugs here, CYP1A2 46), and a reader who sees a
        // bar chart on CYP2D6 and nothing on CYP3A4 would read the blank as "not
        // variable". It carries no pill because it is a statement about this dataset
        // and its corpus's scope, not a sourced claim about the enzyme.
        const box = el("div", "info-bindings info-variability");
        box.appendChild(el("h3", null, t("enzyme.variability")));
        box.appendChild(el("p", "var-caveat", t("enzyme.variabilityNone")));
        const freqRow = el("div", "info-wiki");
        freqRow.appendChild(el("span", null, t("info.frequencies")));
        appendLookupLink(freqRow, "info.pharmfreq", PHARMFREQ_URL,
          "info.pharmfreqTitle");
        box.appendChild(freqRow);
        body.appendChild(box);
      }

      const rows = enzyme.rows || [];
      const wrap = el("div", "info-bindings info-interactors");
      wrap.appendChild(el("h3", null, `${t("enzyme.drugs")} (${rows.length})`));
      if (!rows.length) {
        wrap.appendChild(el("p", "info-desc", t("enzyme.noDrugs")));
        body.appendChild(wrap);
        foldBody();
        return;
      }
      // Group by role in the vocabulary's own order (substrate, inhibitor, inducer)
      // rather than alphabetically: a reader wants "what does this enzyme clear"
      // before "what interferes with it".
      const byRole = new Map();
      for (const r of rows) {
        if (!byRole.has(r.enzyme.role)) byRole.set(r.enzyme.role, []);
        byRole.get(r.enzyme.role).push(r);
      }
      for (const role of ["substrate", "inhibitor", "inducer"]) {
        const group = byRole.get(role);
        if (!group) continue;
        group.sort((a, b) => a.drug.displayName.localeCompare(b.drug.displayName));
        wrap.appendChild(el("h4", "drug-cat", group[0].enzyme.roleLabel));
        const ul = el("ul");
        for (const { drug, enzyme: row } of group) {
          ul.appendChild(enzymeRow(row, drug.displayName, () => onDrugPick(drug)));
        }
        wrap.appendChild(ul);
      }
      body.appendChild(wrap);
      // Headed sections start folded, like the drug panel (see foldSections).
      foldBody();
    },

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
    showDrug(drug, opts = {}) {
      clearBody("drug");
      body.appendChild(el("h2", "info-title", drug.label || drug.name));
      if (drug.category) body.appendChild(el("div", "info-group", drug.category));
      // This drug IS another drug's active metabolite (paliperidone = risperidone's
      // 9-hydroxy metabolite): say so up top, each parent a link, the claim carrying
      // the parent's sourced metabolite pill.
      if (drug.metaboliteOf && drug.metaboliteOf.length) {
        const p = el("p", "info-desc metab-of", `${t("drug.activeMetaboliteOf")} `);
        drug.metaboliteOf.forEach(({ parent, ...claim }, i) => {
          if (i) p.appendChild(document.createTextNode(", "));
          p.appendChild(drugNameLink(parent));
          p.appendChild(nodePill(claim));
        });
        body.appendChild(p);
      }

      // Combination drug: no PDSP Ki of its own (it is a mixture). Warn, and link to
      // each constituent we model as a standalone drug so its binding profile is one
      // click away; interactions between the constituents may exist.
      if (drug.combo && drug.combo.length) {
        const warn = el("div", "combo-warning");
        warn.appendChild(el("strong", null, t("drug.combo")));
        warn.appendChild(el("p", null, t("drug.comboNote")));
        const links = el("div", "combo-parts");
        drug.combo.forEach((c, i) => {
          if (i) links.appendChild(document.createTextNode(" · "));
          const linked = c.drugId && drugById.get(c.drugId);
          if (linked && linked.focusable) {
            const a = el("button", "combo-link", linked.displayName);
            a.type = "button";
            a.addEventListener("click", () => onDrugPick(linked));
            links.appendChild(a);
          } else {
            links.appendChild(el("span", "combo-plain", c.name));
          }
        });
        // A salt's declared composition is its own graded node (drug_constituents);
        // a combo named after its parts states nothing to grade.
        const cc = drug.constituentsClaim;
        if (cc) {
          links.appendChild(document.createTextNode(" "));
          links.appendChild(nodePill(cc));
        }
        warn.appendChild(links);
        body.appendChild(warn);
      }

      // Addon slot: a caveat about the drug as a whole, above everything it does.
      // Below the combo warning, which is about what this row even IS.
      appendAddons(body, "drug", drug.id, "drug.top");

      // Vendored molecular-structure SVG (from Wikipedia, see tools/fetch_molecules.py).
      // It is black/grey line art on transparent; the .mol-structure CSS inverts it
      // to read as light strokes on the dark panel. Absent when no SVG was fetched.
      if (drug.structureImage) {
        const fig = el("figure", "mol-structure");
        const img = document.createElement("img");
        img.alt = t("drug.structureAlt", { name: drug.name });
        img.decoding = "async";
        img.title = t("image.zoomHint");
        // A failed molecule SVG degrades gracefully (drop the figure, no broken
        // icon) and opts out of the global error banner, exactly like the Wikipedia
        // illustrations: an absent diagram is not an app error to shout about.
        img.dataset.optional = "1";
        img.addEventListener("error", () => fig.remove());
        // Click to enlarge; the lightbox inverts it too so the line-art reads on
        // the dark backdrop, matching the panel's .mol-structure treatment.
        img.addEventListener("click", () =>
          onImagePick(img.currentSrc || img.src, img.alt, { invert: true }));
        img.src = drug.structureImage; // set src last, after error handler is wired
        fig.appendChild(img);
        body.appendChild(fig);
      }

      // Description (the drug's Wikipedia lead, baked + live-refreshed) then the
      // Wikipedia link below it, via the shared appendReference. A "sourced"
      // description is the WP lead (CC BY-SA); an "llm" one a mechanism synthesis.
      const { paragraph, wiki } = appendReference({
        url: drug.wikipedia, description: drug.description,
        descriptionProvenance: drug.descriptionProvenance,
        descriptionExtra: drug.descriptionProvenance === "sourced"
          ? t("info.descFromWikipedia") : "",
      });
      // External drug-database lookup links beside the reference. Each is a
      // search-by-name link (it always lands on a results page), a convenience
      // lookup rather than a source for a specific claim, so none carries a
      // provenance pill; all are only linked (navigated to), never fetched, so the
      // CSP is unaffected. Vidal (the French database) shows only in French; the
      // EMA (Europe) and the US FDA show regardless of locale. ANSM is intentionally
      // absent: its ecodex search has no URL-addressable form to deep-link.
      if (wiki) {
        const addLookup = (labelKey, href, titleKey) =>
          appendLookupLink(wiki, labelKey, href, titleKey);
        const q = encodeURIComponent(drug.name);
        // Order: the two regulators first (EMA, FDA), then ClinPGx, then the
        // consumer-facing Drugs.com, so the list runs from the most authoritative
        // to the most readable.
        addLookup(
          "info.ema",
          "https://www.ema.europa.eu/en/search?search_api_fulltext=" + q,
          "info.emaTitle");
        addLookup(
          "info.fda",
          "https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm"
            + "?event=BasicSearch.process&searchTerm=" + q,
          "info.fdaTitle");
        addLookup("info.clinpgx", clinpgxSearchUrl(drug.name), "info.clinpgxTitle");
        // Drugs.com search by name. A search link (always lands on the drug),
        // chosen over a direct /monograph/<name>.html so it never 404s for a drug
        // whose monograph slug differs (combos especially); shown regardless of
        // locale.
        addLookup(
          "info.drugscom",
          "https://www.drugs.com/search.php?searchterm="
            + encodeURIComponent(drug.name.toLowerCase()),
          "info.drugscomTitle");
        if (window.__I18N__.lang === "fr") {
          addLookup(
            "info.vidal",
            "https://www.vidal.fr/recherche/substances.html?query="
              + encodeURIComponent(drug.name.toLowerCase()),
            "info.vidalTitle");
        }
      }

      // The reference row itself (the Wikipedia link + the external-database
      // lookups) is its own tour anchor, so a step can point at "links to reputable
      // sources to read more" distinctly from the description that sits above it.
      if (wiki) wiki.dataset.tourSec = "links";
      // Group the description + Wikipedia link (+ lookups) under one anchor so the
      // guided tour can spotlight the "what it is" section; the live lead lands
      // inside it too (inserted above the link). No-op when there is no wiki wrap.
      if (wiki && wiki.parentNode) {
        const introWrap = el("div", "info-intro");
        introWrap.dataset.tourSec = "wiki";
        wiki.parentNode.insertBefore(introWrap, paragraph || wiki);
        if (paragraph) introWrap.appendChild(paragraph);
        introWrap.appendChild(wiki);
      }

      // Classification facts: the coarse class(es) and the NbN nomenclature line.
      // Both are clickable: each runs a search (class:"..." / nbn:"...") that filters
      // to the matching drugs, so you can pivot from one drug to its whole class. The
      // class list shows one clickable chip per category.
      const facts = el("div", "info-facts");
      facts.dataset.tourSec = "facts"; // guided-tour section anchor
      // The class classification is its own node: pill it (its own grade, or the
      // verbatim quote when category_sources exist), so the claim "this drug is an
      // SSRI/..." carries its provenance beside the value like every other node.
      const catPill = nodePill({ provenance: drug.categoryProvenance, sources: drug.categorySources });
      addFactRow(facts, t("drug.class"), null, null, {
        links: drug.categoryLabels.map((label) => ({
          text: label,
          query: `class:"${label}"`,
        })),
        pill: catPill,
      });
      if (drug.nbn) {
        // The NbN line is quote-sourced from Stahl; show its provenance pill
        // (with the verbatim quote in the tooltip) beside the clickable value. If a
        // drug ever carries an NbN value with no source, still show a pill (its
        // grade, else the red NOSOURCE pill) so the node is never left unbadged.
        const nbnPill = nodePill({ provenance: drug.nbnProvenance, sources: drug.nbnSources });
        addFactRow(facts, t("drug.nomenclature"), null, null, {
          links: [{ text: drug.nbn, query: `nbn:"${drug.nbn}"` }],
          pill: nbnPill,
          // A newer drug with no formal NbN carries Stahl's drug-class descriptor
          // instead; flag it so the value isn't misread as an official NbN.
          note: drug.nbnNonstandard ? t("drug.nbnNonstandard") : null,
        });
      }
      if (facts.childElementCount) body.appendChild(facts);

      // Commercial brand names, each its own graded node (Stahl backs na, Wikipedia
      // eu/fr). Listed in the locale's order (the primary/most-iconic brand first, the
      // same one shown after the drug name everywhere); the region tag is never shown.
      // Each brand carries its own provenance pill, so no node is left unbadged and a
      // mixed-grade list (once eu/fr are added) reads honestly.
      // A brand sold as one formulation (Seroquel XR) is listed under it in the
      // Pharmacokinetics table instead (see below), so this row keeps the molecule's.
      const appendBrand = (host, b) => {
        host.appendChild(el("span", "bind-target", b.name));
        // A brand's grade is its top-region source's (the one the row keeps).
      host.appendChild(nodePill({ ...b, provenance: b.sources && b.sources.length ? b.sources[0].provenance : null }));
      };
      // Administrative: the regulatory history (first approval + years since,
      // withdrawals) and the brands, i.e. what the drug is as a marketed product rather
      // than as a molecule. Omitted when it would hold nothing.
      const admin = el("div", "info-bindings info-admin");
      admin.appendChild(el("h3", null, t("drug.admin")));
      const history = el("div", "info-facts");
      appendDrugHistory(history, drug,
        { addFactRow, nodePill, t, lang: window.__I18N__.lang });
      if (history.childElementCount) admin.appendChild(history);
      const moleculeBrands = (drug.brandsOrdered || []).filter((b) => !b.release);
      if (moleculeBrands.length) {
        const brandsEl = el("div", "info-brands");
        brandsEl.dataset.tourSec = "brands"; // guided-tour section anchor
        brandsEl.appendChild(el("h4", null, t("drug.brands")));
        const ul = el("ul");
        for (const b of moleculeBrands) {
          const li = el("li");
          appendBrand(li, b);
          ul.appendChild(li);
        }
        brandsEl.appendChild(ul);
        admin.appendChild(brandsEl);
      }
      if (admin.childElementCount > 1) body.appendChild(admin);

      // Does the Metabolism section below carry a non-linear-kinetics admonition?
      // A single T½ is only meaningful when clearance is a straight line, so a drug
      // that changes its own clearance makes the number above misleading on its own.
      // The admonition is written down there (it needs the enzyme rows to make sense),
      // so the chip gets a warning that points at it rather than a second copy of it.
      // Either form counts: the authored addon (a mechanism a source attests) or, in
      // its absence, the derived autoModulation flag, exactly the fallback the section
      // itself uses. Gated on the section actually rendering, or the warning would
      // promise a place to jump to that is not there.
      const metabAddons = data.addonsBySlot
        ? data.addonsBySlot.get(`drug:${drug.id}:drug.metabolism`) || [] : [];
      const nonLinearPk = Boolean(drug.enzymes && drug.enzymes.length
        && (metabAddons.length || (drug.autoModulation || []).length));

      // The two per-drug durations, each its own sourced node, placed between brands
      // and the binding list and formatted to days/hours/minutes. They share one
      // section because they are the two ends of one curve (the peak is when the
      // drug arrives, the T½ how long it takes to leave), which is also how
      // js/sim-model.js reads them; either may be missing on its own. The blood
      // levels the AGNP guideline monitors (therapeutic range, alert level) close
      // the block: they are where on that curve the concentration should sit.
      const forms = drug.formulations || [];
      if (drug.halfLife || drug.tmax || drug.therapeuticRange || drug.alertLevel
          || forms.length) {
        const hlEl = el("div", "info-bindings info-halflife");
        hlEl.appendChild(el("h3", null, t("drug.pkTiming")));
        const chipHelpers = { el, nodePill, t,
                              lang: window.__I18N__.lang };
        if (drug.tmax) {
          hlEl.appendChild(valueChip(chipHelpers, {
            label: t("drug.tmax"), tip: t("drug.tmaxTip"),
            value: formatHalfLife(drug.tmax),
            provenance: drug.tmaxProvenance, sources: drug.tmaxSources }));
        }
        if (drug.halfLife) {
          const chip = valueChip(chipHelpers, {
            label: t("drug.halfLife"), value: formatHalfLife(drug.halfLife),
            provenance: drug.halfLifeProvenance, sources: drug.halfLifeSources });
          if (nonLinearPk) {
            const warn = el("button", "hl-warn",
              (data.meta.addonTones || {}).caution || "⚠");
            warn.type = "button";
            warn.title = t("drug.nonLinearPk");
            warn.setAttribute("aria-label", t("drug.nonLinearPk"));
            // Looked up at click time, not captured now: the Metabolism section is
            // built further down this same render, so it does not exist yet here.
            warn.addEventListener("click", () => {
              const sec = body.querySelector('[data-tour-sec="metabolism"]');
              if (sec) flashRow(sec);
            });
            chip.appendChild(warn);
          }
          hlEl.appendChild(chip);
        }
        // Addon slot: a caveat about what these two numbers measure (a serum
        // half-life the brain does not follow), right under the chips it qualifies.
        appendTdmChips(hlEl, drug, chipHelpers);
        appendAddons(hlEl, "drug", drug.id, "drug.timing");
        // Per-formulation list: what a source ties to ONE product (its release
        // type, a pill on the claim that it exists), under the molecule-level values
        // above, which no source tied to a product.
        if (forms.length) {
          const wrap = el("div", "formulations");
          wrap.appendChild(el("h4", null, t("drug.formulations")));
          for (const f of forms) {
            // One block per formulation: its release type (pill: the claim that
            // the product exists) and its Tmax / T½ on one line, its brands below.
            const row = el("div", "form-row");
            const head = el("div", "form-head");
            // The pill rides inside the release name, so the row's wide gap
            // only separates whole items (each chip already ends in its pill).
            const release = el("span", "form-release", `${f.label} `);
            release.appendChild(nodePill({ provenance: f.releaseProvenance, sources: f.releaseSources }));
            head.appendChild(release);
            if (f.tmax) {
              head.appendChild(valueChip(chipHelpers, {
                label: t("drug.tmax"), tip: t("drug.tmaxTip"),
                value: formatHalfLife(f.tmax),
                provenance: f.tmaxProvenance, sources: f.tmaxSources }));
            }
            if (f.halfLife) {
              head.appendChild(valueChip(chipHelpers, {
                label: t("drug.halfLife"), value: formatHalfLife(f.halfLife),
                provenance: f.halfLifeProvenance, sources: f.halfLifeSources }));
            }
            row.appendChild(head);
            if (f.brands.length) {
              const brands = el("div", "form-brands");
              for (const br of f.brands) {
                const item = el("span", "form-brand");
                appendBrand(item, br);
                brands.appendChild(item);
              }
              row.appendChild(brands);
            }
            wrap.appendChild(row);
          }
          hlEl.appendChild(wrap);
        }
        body.appendChild(hlEl);
      }

      // Physicochemistry and brain entry: the computed lipophilicity and polar surface
      // (PubChem) beside the curated blood-brain-barrier label (B3DB), each its own
      // node. Its own small section rather than the Pharmacokinetics block, which is
      // about time (when the drug peaks, how long it stays); this is about whether
      // and how easily it reaches the brain at all. Same chip layout (info-halflife).
      if (hasPhyschem(drug)) {
        const pc = el("div", "info-bindings info-halflife info-physchem");
        pc.appendChild(el("h3", null, t("drug.physchem")));
        appendPhyschemChips(pc, drug,
          { el, nodePill, t, lang: window.__I18N__.lang });
        body.appendChild(pc);
      }

      // (Ki ranking uses the shared bindingKi helper.)

      // What it binds: one row per target, coloured by the action's net effect.
      const acts = el("div", "info-bindings");
      acts.dataset.tourSec = "bindings"; // guided-tour section anchor
      acts.appendChild(el("h3", null, t("drug.actsOn")));
      const metabWarn = derivedActiveMetabolites(drug, body);
      if (metabWarn) acts.appendChild(metabWarn);
      // A prodrug's own graded claim (kind drug_prodrug): it binds nothing itself, so
      // every row below is borrowed from its active metabolite ("via ...").
      if (drug.prodrug) {
        const p = el("p", "info-desc", `${t("drug.prodrug")} `);
        p.title = t("drug.prodrugTip");
        p.appendChild(nodePill(drug.prodrug));
        acts.appendChild(p);
      }
      if (!drug.bindings.length) {
        acts.appendChild(el("p", "info-desc", t("drug.noTargets")));
      } else {
        const ul = el("ul");
        // Strongest-affinity first: order by the binding's representative Ki
        // ascending, so the target a drug grips hardest tops the list; bindings with
        // no measured Ki sink to the bottom. Sort a copy (leave the authored array
        // untouched); a stable sort keeps the authored order within each tier.
        const bindings = [...drug.bindings].sort((a, b) => bindingKi(a) - bindingKi(b));
        for (const b of bindings) {
          // If this binding's target is browsable on its own (in the merged
          // "Receptors & targets" list and focusable), make the row jump to it.
          const tgt = targetById.get(b.target);
          const onActivate = tgt && tgt.focusable
            ? () => onTargetPick(tgt) : null;
          const row = bindingRow(b, drug, b.targetName, onActivate);
          row.dataset.tourId = `ixtarget:${b.target}`; // guided-tour hook: target row in a drug panel
          ul.appendChild(row);
        }
        acts.appendChild(ul);
      }
      body.appendChild(acts);
      appendPossibleEffects(drug);
      appendReleaseChanges(drug);
      appendDrugVariants(drug);
      appendWorkup(drug);

      // Active metabolites: one row per metabolite (its own sourced identity node).
      // A metabolite that is itself a modeled drug links to it (jump via onDrugPick);
      // each shows its own T½ underneath, a bit like a binding's Ki. A non-modeled
      // metabolite's OWN receptor bindings (Wikipedia/PDSP-sourced) are listed under it
      // via the same bindingRow the drug's "Direct molecular targets" uses, so a reader can see what the
      // metabolite hits without hunting each receptor panel. (A linked metabolite shows
      // none here: its bindings live on its own drug row, reachable via the link.)
      if (drug.metabolites && drug.metabolites.length) {
        const metaEl = el("div", "info-bindings info-metabolites");
        metaEl.dataset.tourSec = "metabolites";
        metaEl.appendChild(el("h3", null, t("drug.metabolites")));
        const ul = el("ul");
        let flashLi = null; // the row to scroll to + flash (opts.highlightMetabolite)
        for (const m of drug.metabolites) {
          const li = el("li", "metab-row");
          if (opts.highlightMetabolite && m.name === opts.highlightMetabolite) flashLi = li;
          const head = el("div", "metab-head");
          const linked = m.drugId ? drugById.get(m.drugId) : null;
          if (linked && m.linkFocusable) {
            // A metabolite that IS a modeled drug: its name is the link to that drug's
            // panel, where its bindings live (never re-listed here: one source of truth).
            const a = drugNameLink(linked, m.name);
            if (linked.bindings.length)
              a.title = t("drug.metabSeeBindings", { n: linked.bindings.length });
            head.appendChild(a);
          } else {
            head.appendChild(el("span", "bind-target", m.name));
          }
          // The shared node pill, so a link another corpus denies reads orange.
          head.appendChild(nodePill(m));
          li.appendChild(head);
          // Which enzyme makes it, each its own sourced node and clickable to that
          // enzyme's panel: the prodrug story (why a CYP2D6 poor metabolizer gets a
          // different drug than the label says). Absent for the metabolites no corpus
          // pins down, which is most of them, so no NOSOURCE row is shown here.
          for (const f of m.formedBy || []) {
            const row = el("div", "metab-formed");
            const text = el("span", "bind-text");
            text.appendChild(el("span", "bind-action", `${t("drug.formedBy")} `));
            const name = el("span", "bind-target", f.label);
            text.appendChild(name);
            if (f.reactionLabel)
              text.appendChild(el("span", "bind-action", ` · ${f.reactionLabel}`));
            row.appendChild(text);
            row.appendChild(nodePill(f));
            const enz = enzymeById.get(f.enzyme);
            if (enz) {
              row.classList.add("clickable");
              row.addEventListener("click", () => onEnzymePick(enz));
            }
            li.appendChild(row);
          }
          const hlStr = formatHalfLife(m.halfLife);
          if (hlStr) {
            li.appendChild(valueChip({ el, nodePill }, {
              label: t("drug.halfLife"), value: hlStr, cls: "metab-hl", bare: true,
              provenance: m.halfLifeProvenance, sources: m.halfLifeSources }));
          }
          // A non-modeled metabolite's OWN sourced receptor bindings (m.ownBindings,
          // resolved in js/data.js from its Wikipedia/PDSP pharmacology). Rendered with
          // the same bindingRow the drug's "Direct molecular targets" uses, strongest-affinity first, each
          // row jumping to its target when browsable.
          if (m.ownBindings && m.ownBindings.length) {
            const bul = el("ul", "metab-bindings");
            const mbinds = [...m.ownBindings].sort((a, b) => bindingKi(a) - bindingKi(b));
            for (const b of mbinds) {
              const tgt = targetById.get(b.target);
              const onActivate = tgt && tgt.focusable ? () => onTargetPick(tgt) : null;
              bul.appendChild(bindingRow(b, drug, b.targetName, onActivate));
            }
            li.appendChild(bul);
          }
          ul.appendChild(li);
        }
        metaEl.appendChild(ul);
        body.appendChild(metaEl);
        // Arrived from a metabolite's receptor row: bring it into view and flash it, so
        // the user sees why the parent drug opened and where its metabolite's bindings are.
        flashRow(flashLi);
      }
      // No standalone drug-level "Source(s)" block: the Stahl citation that backs
      // the drug is shown per-binding (each binding's pill above), so a source
      // always refers to a specific binding node rather than "the whole drug".

      // Neurotransmitter tone (indicative): the ascending systems this drug's flow
      // overlay lights (drug.flowKinds, from meta.system_flow_kinds). A *derived*
      // inference from the drug's *tone-setter* bindings only (a reuptake/enzyme/
      // vesicle target or a presynaptic autoreceptor, see js/data.js toneBySystem):
      // each row shows the signed sum (up arrow = raises the tone, down arrow = lowers
      // it), jumps to that projection group, and lists the per-binding arithmetic with
      // each binding's own pill, so the value is traceable. A purely postsynaptic drug
      // sets no tone -> empty flowKinds -> section omitted.
      const groupsByKey = data.projectionGroupsByKey;
      const projColors = data.meta.projectionColors || {};
      if ((drug.flowKinds || []).length && groupsByKey) {
        const proj = el("div", "info-connections info-tone");
        proj.appendChild(el("h3", null, t("drug.tone")));
        const warn = derivedBox("caution", t("drug.toneWarnTitle"));
        warn.appendChild(el("p", "addon-text", t("drug.toneWarn")));
        proj.appendChild(warn);
        proj.appendChild(el("p", "legend-caption", t("drug.toneHow", {
          none: fmtTone(toneWeightOf(null)).slice(1),
          auto: fmtTone((data.meta.toneFactors || {}).autoreceptor ?? 1).slice(1) })));
        const ul = el("ul");
        for (const kind of drug.flowKinds) {
          const group = groupsByKey.get(`kind:${kind}`);
          if (!group) continue;
          const flow = drug.flowSystems[kind];
          const li = el("li", "clickable");
          li.title = group.name;
          li.appendChild(directionArrow(projColors[kind] || "#fff",
            flow.direction < 0 ? "down" : "up",
            (data.meta.kindLabels && data.meta.kindLabels[kind]) || kind));
          li.appendChild(el("span", "conn-label", group.name));
          li.appendChild(el("span", "tone-value", fmtTone(netTone(drug, kind))));
          li.addEventListener("click", () => onProjectionGroupPick(group));
          ul.appendChild(li);
          // The arithmetic behind the value: one line per tone-setting binding, each
          // with its own source pill, clickable to its target like a target row.
          const terms = el("li", "tone-terms");
          for (const b of flow.terms) {
            const row = el("div", "tone-term");
            row.appendChild(el("span", "tone-term-target", b.targetName));
            row.appendChild(el("span", "tone-term-rule", t(`tone.rule.${b.toneRule}`)));
            // "+1 × 0.50 × 0.43 = +0.21": sign, bucket factor (shown only when not 1),
            // Ki weight; the same product toneBySystem sums.
            const factor = b.toneFactor ?? 1;
            const mag = (v) => fmtTone(v).slice(1);
            row.appendChild(el("span", "tone-term-math",
              `${b.toneSign > 0 ? "+1" : "−1"}${factor !== 1 ? ` × ${mag(factor)}` : ""} × ${mag(b.toneWeight)}`
              + ` = ${fmtTone(b.toneSign * factor * b.toneWeight)}`));
            row.appendChild(nodePill(b));
            const tgt = targetById.get(b.target);
            if (tgt && tgt.focusable) {
              row.classList.add("clickable");
              row.addEventListener("click", (e) => {
                if (e.target.closest(".help-icon")) return;
                onTargetPick(tgt);
              });
            }
            terms.appendChild(row);
          }
          ul.appendChild(terms);
        }
        proj.appendChild(ul);
        body.appendChild(proj);
      }

      // Acts within (context): the ascending systems this drug engages only through a
      // POSTSYNAPTIC receptor (drug.contextKinds, e.g. an H1 / 5-HT2 blocker). Their
      // pathways light statically in the 3D view (dimmed, no beads); blocking a
      // postsynaptic receptor makes NO tone claim, so they are listed apart from
      // "Neurotransmitter tone" above, with a neutral swatch and no direction arrow.
      // Excludes any system already flowing (that one is a tone-setter row above).
      if ((drug.contextKinds || []).length && groupsByKey) {
        const ctx = el("div", "info-connections");
        ctx.appendChild(el("h3", null, t("drug.actsWithin")));
        ctx.appendChild(el("p", "legend-caption", t("drug.actsWithinHint")));
        const ul = el("ul");
        for (const kind of drug.contextKinds) {
          const group = groupsByKey.get(`kind:${kind}`);
          if (!group) continue;
          const li = el("li", "clickable");
          li.title = group.name;
          const sw = el("span", "swatch line");
          sw.style.background = projColors[kind] || "#fff";
          li.appendChild(sw);
          li.appendChild(el("span", "conn-label", group.name));
          li.addEventListener("click", () => onProjectionGroupPick(group));
          ul.appendChild(li);
        }
        ctx.appendChild(ul);
        body.appendChild(ctx);
      }

      // Metabolism, last: pharmacokinetics has no anatomy, so it sits AFTER the
      // sections that do (Direct molecular targets / Neurotransmitter tone / Acts within). The enzymes
      // that clear this drug or whose activity it changes, then the drug -> drug
      // interactions those roles imply.
      if (drug.enzymes && drug.enzymes.length) {
        const enzWrap = el("div", "info-bindings");
        enzWrap.dataset.tourSec = "metabolism"; // guided-tour section anchor
        enzWrap.appendChild(el("h3", null, t("drug.metabolism")));
        enzWrap.appendChild(el("p", "legend-caption", t("drug.metabolismHint")));
        // Where to go read the pharmacokinetic pathways themselves: the enzyme rows
        // below say *which* isoform, ClinPGx draws the route. A lookup link like the
        // ones beside the reference, so it carries no provenance pill.
        const pathRow = el("div", "info-wiki");
        pathRow.appendChild(el("span", null, t("info.pathways")));
        appendLookupLink(pathRow, "info.clinpgx",
          clinpgxSearchUrl(drug.name, "Pathway"), "info.clinpgxPathwaysTitle");
        enzWrap.appendChild(pathRow);
        // Addon slot: the coverage caveat on the list below (a union of the routes
        // some corpus names, never all of them). Anchored on the SECTION rather than
        // on this drug, since the claim holds for every drug at once; read before the
        // rows (folded to its title, so it does not push them down).
        appendAddons(enzWrap, "section", "metabolism", "section.metabolism");
        // Addon slot: a caveat about how this drug is cleared, which the per-isoform
        // rows below cannot state (a row gives a role, never a curve). Above the
        // first enzyme so it is read before them, not as a footnote after.
        // An authored addon states a mechanism a source attests; failing one, the
        // same slot takes the derived flag off the enzyme rows below.
        if (!appendAddons(enzWrap, "drug", drug.id, "drug.metabolism")) {
          const derived = derivedAutoModulation(drug);
          if (derived) enzWrap.appendChild(derived);
        }
        // One heading per role ("Substrate of", then what it does to others), the
        // isoforms indented under it, each carrying its role pill and, when a source
        // qualifies it, its strength + pill (strength is per (enzyme, role), so it
        // stays on the isoform's line rather than on the heading).
        const roleOrder = ["substrate", "inhibitor", "inducer"];
        const byRole = new Map();
        for (const row of drug.enzymes) {
          if (!byRole.has(row.role)) byRole.set(row.role, []);
          byRole.get(row.role).push(row);
        }
        // opts.highlightEnzymes: arrived from another drug's interaction row, so land
        // on the isoform the two share instead of making the reader find it.
        const wanted = new Set(opts.highlightEnzymes || []);
        let flashEnz = null;
        const roles = [...roleOrder.filter((r) => byRole.has(r)),
          ...[...byRole.keys()].filter((r) => !roleOrder.includes(r))];
        for (const role of roles) {
          const group = byRole.get(role).sort((a, b) => a.label.localeCompare(b.label));
          enzWrap.appendChild(el("h4", "enz-role", group[0].roleHeading));
          const enzUl = el("ul", "enz-role-list");
          for (const row of group) {
            const enz = enzymeById.get(row.enzyme);
            const li = enzymeRow(row, row.label, enz ? () => onEnzymePick(enz) : null);
            if (!flashEnz && wanted.has(row.enzyme)) flashEnz = li;
            enzUl.appendChild(li);
          }
          enzWrap.appendChild(enzUl);
        }
        body.appendChild(enzWrap);
        flashRow(flashEnz);

        // What a clearance speed means for THIS prescription (CPIC, corpus #15),
        // right under the isoforms that clear it: the two only answer a clinician's
        // question together, since the enzyme rows say who clears the drug and these
        // say what happens to someone who clears it slowly.
        const pgx = pgxSection(drug);
        if (pgx) body.appendChild(pgx);

        // Drug interactions: derived, never stored (see pkInteractionsOf). This drug
        // and the listed one meet at the same enzyme, so one COULD shift the other's
        // level; the wording stays conditional throughout because the edge is an
        // inference from the enzyme roles, not a measured interaction study.
        const pk = data.pkInteractionsOf ? data.pkInteractionsOf(drug) : null;
        const edges = pk ? [
          ...pk.affects.map((x) => ({ ...x, outgoing: true })),
          ...pk.affectedBy.map((x) => ({ ...x, outgoing: false })),
        ] : [];
        if (edges.length) {
          // info-interactors too: reuses that section's .drug-cat sub-heading style.
          // Collapsed by default (a `disclosure` <details>, same caret as the receptor
          // subtype dropdowns): a busy isoform yields dozens of derived rows, which
          // otherwise bury the sourced sections above. The summary carries the count so
          // the reader can see there is something worth opening.
          const pkWrap = el("details", "info-bindings info-interactors disclosure");
          pkWrap.dataset.tourSec = "pk"; // guided-tour section anchor
          const pkSummary = el(
            "summary", null, `${t("drug.pkInteractions")} (${edges.length})`);
          pkWrap.appendChild(pkSummary);
          // It is the panel's LAST section, so opening it unfolds everything below the
          // fold: bring the summary up to the top of the pane so what you see is the
          // list you just asked for, not the rows above it.
          pkWrap.addEventListener("toggle", () => {
            // setTimeout, not rAF: let the newly shown rows lay out first, and the
            // viewer's on-demand render loop can leave rAF idle.
            if (pkWrap.open) {
              setTimeout(
                () => pkSummary.scrollIntoView({ block: "start", behavior: "smooth" }), 0);
            }
          });
          pkWrap.appendChild(el("p", "legend-caption", t("drug.pkInteractionsHint")));

          // One row = one (other drug, direction) edge, and it carries the drug name
          // ALONE: the direction is always a heading above it (a bucket in by-drug mode,
          // a sub-heading under the isoform in by-enzyme mode), so spelling it out per
          // row just repeated the same phrase down the list. `showEnzymes` appends the
          // shared isoforms; by-enzyme mode drops them (the heading IS the isoform).
          const pkRow = (edge, showEnzymes) => {
            const li = el("li", "clickable");
            const text = el("span", "bind-text");
            text.appendChild(el("span", "bind-target", edge.drug.displayName));
            if (showEnzymes) {
              text.appendChild(el("span", "bind-action",
                                  ` · ${edge.enzymes.map((x) => x.label).join(", ")}`));
            }
            li.appendChild(text);
            const via = edge.enzymes.map((x) => x.enzyme);
            li.addEventListener("click",
                                () => onDrugPick(edge.drug, { highlightEnzymes: via }));
            return li;
          };

          // Capped per HEADING, not globally: a global cap would swallow whole headings
          // (a CYP3A4 inhibitor legitimately meets dozens of substrates), so each one
          // shows its first rows and offers the rest in place rather than in a dead-end
          // count. Rows are built lazily so an unexpanded remainder costs nothing.
          const GROUP_CAP = 8;
          // One group = a heading plus its `sections`, each `{label?, rows}`. A section
          // label is the direction sub-heading by-enzyme mode needs (by-drug mode passes
          // a single unlabelled section, since its own heading IS the direction).
          const appendGroup = (box, label, sections, onLabel) => {
            const filled = sections.filter((s) => s.rows.length);
            if (!filled.length) return;
            const head = el("h4", "drug-cat", label);
            if (onLabel) {
              head.classList.add("clickable");
              head.addEventListener("click", onLabel);
            }
            box.appendChild(head);
            // The rows (and the "+n more" that extends them) live in their own indented
            // body under the heading, so which bucket / isoform a drug belongs to reads
            // at a glance in a list of several groups. A labelled section indents one
            // step further, under its own sub-heading.
            const groupBody = el("div", "pk-group-body");
            for (const section of filled) {
              let target = groupBody;
              if (section.label) {
                groupBody.appendChild(el("h5", "pk-dir", section.label));
                target = el("div", "pk-dir-body");
                groupBody.appendChild(target);
              }
              const ul = el("ul");
              for (const make of section.rows.slice(0, GROUP_CAP)) ul.appendChild(make());
              target.appendChild(ul);
              if (section.rows.length > GROUP_CAP) {
                const more = el("button", "pk-more",
                                t("info.more", { n: section.rows.length - GROUP_CAP }));
                more.type = "button";
                more.addEventListener("click", () => {
                  for (const make of section.rows.slice(GROUP_CAP)) ul.appendChild(make());
                  more.remove();
                });
                target.appendChild(more);
              }
            }
            box.appendChild(groupBody);
          };
          // The four direction readings, in the order they are useful: what this drug
          // does to others first (that half is the actionable one), then what others do
          // to it. by-drug mode makes each a top-level heading, by-enzyme mode a
          // sub-heading under every isoform, so the labels are defined once here.
          const PK_DIRECTIONS = [
            ["drug.pkHeadRaises", (e) => e.outgoing && e.direction > 0],
            ["drug.pkHeadLowers", (e) => e.outgoing && e.direction < 0],
            ["drug.pkHeadRaisedBy", (e) => !e.outgoing && e.direction > 0],
            ["drug.pkHeadLoweredBy", (e) => !e.outgoing && e.direction < 0],
          ];
          const byName = (a, b) => a.drug.displayName.localeCompare(b.drug.displayName);

          // Two readings of the SAME edges, because the useful question differs: "what
          // does this drug do to my other prescriptions" (by drug) vs "everything that
          // goes through CYP3A4" (by enzyme, where a pair sharing two isoforms shows up
          // under each; that duplication is the point of this reading).
          const byDrug = (box) => {
            for (const [key, keep] of PK_DIRECTIONS) {
              const rows = edges.filter(keep).sort(byName)
                .map((e) => () => pkRow(e, true));
              appendGroup(box, t(key), [{ rows }]);
            }
          };
          const byEnzyme = (box) => {
            const per = new Map();
            for (const edge of edges) {
              for (const enz of edge.enzymes) {
                if (!per.has(enz.enzyme)) per.set(enz.enzyme, { label: enz.label, rows: [] });
                per.get(enz.enzyme).rows.push(edge);
              }
            }
            // Busiest isoform first (that is where the risk concentrates), ties by name.
            const groups = [...per.entries()].sort((a, b) =>
              (b[1].rows.length - a[1].rows.length) || a[1].label.localeCompare(b[1].label));
            for (const [id, grp] of groups) {
              // Split by direction under the isoform, rather than spelling the direction
              // out on every row: an isoform's rows are mostly one direction, so the
              // per-row phrasing repeated itself line after line.
              const sections = PK_DIRECTIONS.map(([key, keep]) => ({
                label: t(key),
                rows: grp.rows.filter(keep).sort(byName)
                  .map((e) => () => pkRow(e, false)),
              }));
              const enz = enzymeById.get(id);
              appendGroup(box, grp.label, sections, enz ? () => onEnzymePick(enz) : null);
            }
          };

          const listBox = el("div");
          const modeSwitch = el("div", "seg-switch");
          const render = (mode) => {
            listBox.innerHTML = "";
            for (const btn of modeSwitch.children) {
              btn.classList.toggle("active", btn.dataset.mode === mode);
            }
            if (mode === "enzyme") byEnzyme(listBox); else byDrug(listBox);
          };
          for (const [mode, key] of [["drug", "drug.pkByDrug"],
                                     ["enzyme", "drug.pkByEnzyme"]]) {
            const btn = el("button", "seg-btn", t(key));
            btn.type = "button";
            btn.dataset.mode = mode;
            btn.addEventListener("click", () => {
              savePkGrouping(mode);
              render(mode);
            });
            modeSwitch.appendChild(btn);
          }
          pkWrap.appendChild(modeSwitch);
          pkWrap.appendChild(listBox);
          render(loadPkGrouping());
          body.appendChild(pkWrap);
        }
      }
      // Every headed section starts collapsed (a drug panel is long): the heading
      // opens it, its content indented under it.
      foldBody();
    },

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
