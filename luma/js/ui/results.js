// Mode 2: the person's own results arranged around the neutral brain.

import { h } from "./dom.js";
import { painDumbbells } from "./charts.js";
import { fmt } from "../sim-data.js";

const DOWN = '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';
const UP = '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';

export function createResults(host, tip) {
  function card(r, i) {
    const delta = r.after - r.before;
    const improved = r.better === "higher" ? delta > 0 : delta < 0;
    const el = h("div", { class: "glass result" },
      h("div", { class: "result-head" }, h("span", {}, r.label),
        h("span", { class: "result-delta", html: `${delta > 0 ? UP : DOWN}${fmt(Math.abs(delta), r.digits)}`, style: { color: improved ? "var(--good)" : "var(--ink-3)" } })),
      h("div", { class: "result-vals" },
        h("span", { class: "b num" }, fmt(r.before, r.digits)),
        h("span", { class: "a num" }, fmt(r.after, r.digits)),
        h("span", { class: "u" }, r.unit)),
      h("div", { class: "pair" },
        h("span", {}, "Before"), track(r.before / r.max, "var(--chart-before)"),
        h("span", {}, "After"), track(r.after / r.max, "var(--chart-after)")),
      r.note ? h("div", { class: "fine", style: { marginTop: "6px" } }, r.note) : null);
    el.style.animationDelay = `${0.25 + i * 0.12}s`;
    tip.bind(el, () => `<b>${r.label}</b><br><span class="k">Before</span>${fmt(r.before, r.digits)} ${r.unit}<br><span class="k">After</span>${fmt(r.after, r.digits)} ${r.unit}`);
    return el;
  }

  function track(f, color) {
    return h("div", { class: "track" }, h("div", { class: "fill", style: { width: `${Math.max(2, Math.min(1, f) * 100)}%`, background: color } }));
  }

  return {
    render(res) {
      const left = h("div", { class: "col" },
        h("div", { class: "legend", style: { paddingLeft: "4px" } },
          h("span", {}, h("i", { style: { background: "var(--chart-before)" } }), "Before"),
          h("span", {}, h("i", { style: { background: "var(--chart-after)" } }), "After")),
        ...res.cards.map(card));
      const chartHost = h("div", { class: "chart", style: { height: "150px" } });
      const right = h("div", { class: "col" },
        h("div", { class: "glass result stats", style: { animationDelay: "0.3s" } },
          ...res.stats.map((s) => h("div", { class: "stat" }, h("b", { class: "num" }, s.value), h("span", {}, s.label), h("small", {}, s.sub)))),
        h("div", { class: "glass result", style: { animationDelay: "0.45s" } },
          h("div", { class: "result-head", style: { marginBottom: "6px" } }, h("span", {}, "Every treated attack")),
          chartHost));
      host.replaceChildren(left,
        h("div", { class: "center" },
          h("div", { class: "glass results-summary" },
            h("div", { class: "eyebrow" }, "Mode 2 · Your results"),
            h("b", {}, "What changed, measured by you and your sensors"),
            h("p", {}, "Simulated data. The brain is a standard model shown neutral: it illustrates the targeted pathway and does not show brain changes. No sham control yet, so placebo can't be ruled out; the planned three-arm trial tests that."))),
        right);
      requestAnimationFrame(() => painDumbbells(chartHost, res.treated, tip, { highlightLast: true }));
    },
  };
}
