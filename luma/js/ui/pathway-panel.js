// Mode 1 side panel: live stimulation readout, layer toggles, one card per
// visible pathway whose steps light up as the animation reaches them, and the
// not-a-brain-scan caveat.

import { h } from "./dom.js";
import { PATHWAYS, PLACEMENTS, PATHWAY_COLORS } from "../anatomy.js";

const INFO_ICON = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>';
const ORDER = ["device", "visual", "migraine"];
const NAMES = { device: "Device", visual: "Visual", migraine: "Migraine" };

export function createPathwayPanel(host, { onToggle }) {
  const visible = { device: false, visual: false, migraine: false };
  let placement = "side";
  let cards = {};

  const bars = h("div", { class: "bars" }, ...Array.from({ length: 12 }, () => h("span", { style: { height: "3px" } })));
  const meterText = h("div", { class: "txt" });
  const meter = h("div", { class: "vibe-meter" }, bars, meterText);

  const toggles = {};
  const toggleRow = h("div", { class: "toggles" });
  for (const id of ORDER) {
    const b = h("button", { class: "toggle", type: "button", style: { "--c": PATHWAY_COLORS[id] } }, h("i"), NAMES[id]);
    b.addEventListener("click", () => onToggle(id, !visible[id]));
    toggles[id] = b;
    toggleRow.append(b);
  }
  const cardHost = h("div");

  host.replaceChildren(
    h("div", { class: "mode-head" }, h("span", { class: "eyebrow" }, "Mode 1 · Educational pathways")),
    meter, toggleRow, cardHost,
    h("div", { class: "disclaimer", html: `${INFO_ICON}<span>Illustration on a standard brain model, not a brain scan. Highlights follow the explanation; they do not show activity measured in this session. Tap a region to learn more.</span>` }),
  );

  function def(id) {
    if (id !== "device") return PATHWAYS[id];
    const pl = PLACEMENTS[placement];
    return { title: `Device pathway · ${pl.short}`, color: PATHWAY_COLORS.device, steps: pl.steps, note: pl.note };
  }

  function buildCard(id) {
    const d = def(id);
    const steps = d.steps.map((st, i) => h("li", { class: id === "device" && i === d.steps.length - 1 ? "proposed" : "" },
      h("b", {}, st.title), h("span", {}, st.text)));
    const el = h("div", { class: "path-card", style: { "--c": d.color } },
      h("h4", {}, h("i"), d.title, d.optional ? h("span", { class: "opt" }, "optional") : null),
      h("ol", { class: "steps" }, steps),
      h("p", { class: "path-note" }, d.note));
    cards[id] = { el, steps };
    return el;
  }

  function layout() {
    cardHost.replaceChildren(...ORDER.filter((id) => visible[id]).map((id) => cards[id]?.el || buildCard(id)));
    for (const [id, b] of Object.entries(toggles)) b.classList.toggle("on", visible[id]);
  }

  return {
    setVisible(id, on) { visible[id] = on; layout(); },
    setStep(id, index, on = true) {
      if (!cards[id]) buildCard(id);
      cards[id].steps[index]?.classList.toggle("on", on);
    },
    clearSteps(id) {
      for (const k of id ? [id] : Object.keys(cards)) for (const li of cards[k]?.steps || []) li.classList.remove("on");
    },
    setPlacement(id) {
      placement = id;
      delete cards.device;
      layout();
    },
    /** Live stimulation readout; `level` 0..1 drives the bar meter. */
    setVibe(level, html) {
      if (html !== undefined) meterText.innerHTML = html;
      const now = performance.now();
      [...bars.children].forEach((b, i) => {
        const wob = 0.55 + 0.45 * Math.sin(now / 70 + i * 1.7);
        b.style.height = `${3 + level * wob * 19}px`;
      });
    },
    reset() {
      for (const k of Object.keys(visible)) visible[k] = false;
      cards = {};
      layout();
    },
  };
}
