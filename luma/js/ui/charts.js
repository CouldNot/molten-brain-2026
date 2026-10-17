// Small hand-rolled SVG charts. Single-series charts use one hue and no legend
// (the card title names them); before/after uses the validated pair
// (--chart-before / --chart-after) and always carries a legend.

import { s, h } from "./dom.js";
import { fmt } from "../sim-data.js";

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function frame(host) {
  const w = Math.max(200, host.clientWidth);
  const ht = Math.max(100, host.clientHeight);
  const svg = s("svg", { viewBox: `0 0 ${w} ${ht}`, width: w, height: ht });
  host.replaceChildren(svg);
  return { svg, w, h: ht };
}

/** The baseline month as a 10 × 3 grid of days. */
export function monthCalendar(host, days, tip) {
  const { svg, w, h: H } = frame(host);
  const cols = 10, rows = 3, gap = 5;
  const legendH = 22;
  const cw = (w - gap * (cols - 1)) / cols;
  const ch = Math.min(cw, (H - legendH - gap * (rows - 1)) / rows);
  const attack = css("--migraine");
  days.forEach((d, i) => {
    const x = (i % cols) * (cw + gap);
    const y = Math.floor(i / cols) * (ch + gap);
    const g = s("g", {});
    g.append(s("rect", {
      x, y, width: cw, height: ch, rx: 6,
      fill: d.attack ? attack : "rgba(255,255,255,0.04)",
      "fill-opacity": d.attack ? 0.25 + (d.pain / 10) * 0.65 : 1,
      stroke: d.predicted !== d.attack && d.task ? "#ffffff" : "rgba(255,255,255,0.06)",
      "stroke-width": d.predicted !== d.attack && d.task ? 1.5 : 1,
      "stroke-dasharray": d.predicted !== d.attack && d.task ? "3 2" : null,
    }));
    g.append(s("text", { x: x + 6, y: y + 13, class: d.attack ? "val" : "" }, d.day));
    if (!d.task) g.append(s("line", { x1: x + cw - 14, y1: y + ch - 6, x2: x + cw - 6, y2: y + ch - 14, stroke: "#ffffff", "stroke-width": 1.5, "stroke-linecap": "round", opacity: 0.8 }));
    const hit = s("rect", { class: "hit", x, y, width: cw, height: ch });
    tip.bind(hit, () => `<b>Day ${d.day}</b><br>${d.attack ? `Migraine · pain ${d.pain}/10` : "No migraine"}<br><span class="k">Task</span>${d.task ? "done" : "skipped (too painful)"}<br><span class="k">Model</span>${d.task ? (d.predicted === d.attack ? "agreed" : "disagreed") : "no data"}`);
    g.append(hit);
    svg.append(g);
  });
  const ly = rows * (ch + gap) + 8;
  const legend = [
    ["rect", "Migraine day (darker = more pain)"],
    ["dash", "Model disagreed"],
    ["slash", "Task skipped"],
  ];
  let lx = 0;
  for (const [kind, label] of legend) {
    if (kind === "rect") svg.append(s("rect", { x: lx, y: ly, width: 10, height: 10, rx: 3, fill: attack, "fill-opacity": 0.7 }));
    if (kind === "dash") svg.append(s("rect", { x: lx, y: ly, width: 10, height: 10, rx: 3, fill: "none", stroke: "#fff", "stroke-dasharray": "3 2" }));
    if (kind === "slash") svg.append(s("line", { x1: lx + 1, y1: ly + 10, x2: lx + 10, y2: ly + 1, stroke: "#fff", "stroke-width": 1.5 }));
    const t = s("text", { x: lx + 15, y: ly + 9 }, label);
    svg.append(t);
    lx += 15 + label.length * 5.6 + 16;
  }
}

/** Signed % change, attack days vs normal days, bars about a zero line. */
export function signatureBars(host, rows, tip) {
  const { svg, w, h: H } = frame(host);
  const color = css("--chart-one");
  const labelW = 150, valueW = 48;
  const plotW = w - labelW - valueW;
  const max = Math.max(...rows.map((r) => Math.abs(r.change)));
  const zero = labelW + plotW * (max / (2 * max));
  const X = (v) => zero + (v / max) * (plotW / 2 - 4);
  const rowH = Math.min(26, H / rows.length);
  const barH = Math.min(11, rowH * 0.45);
  svg.append(s("line", { class: "axis", x1: zero, x2: zero, y1: 0, y2: rows.length * rowH }));
  rows.forEach((r, i) => {
    const y = i * rowH + rowH / 2;
    svg.append(s("text", { class: "lbl", x: 0, y: y + 4 }, r.label));
    svg.append(s("text", { x: labelW - 8, y: y + 4, "text-anchor": "end", class: "basis" }, r.sensor));
    const x0 = Math.min(zero, X(r.change)), bw = Math.abs(X(r.change) - zero);
    const bar = s("rect", { x: x0, y: y - barH / 2, width: Math.max(3, bw), height: barH, rx: 4, fill: color, class: "grow" });
    bar.style.transformOrigin = r.change < 0 ? "right center" : "left center";
    bar.style.animationDelay = `${0.5 + i * 0.06}s`;
    svg.append(bar);
    svg.append(s("text", { class: "val", x: w, y: y + 4, "text-anchor": "end" }, `${r.change > 0 ? "+" : "−"}${Math.round(Math.abs(r.change) * 100)}%`));
    const hit = s("rect", { class: "hit", x: 0, y: y - rowH / 2, width: w, height: rowH });
    tip.bind(hit, () => `<b>${r.label}</b><br><span class="k">Normal days</span>${fmt(r.normal, r.normal < 10 ? 1 : 0)}<br><span class="k">Attack days</span>${fmt(r.attack, r.attack < 10 ? 1 : 0)}`);
    svg.append(hit);
  });
}

/** Pain at start vs 2 hours later, one dumbbell per treated attack. */
export function painDumbbells(host, sessions, tip, { highlightLast = false } = {}) {
  const { svg, w, h: H } = frame(host);
  const before = css("--chart-before"), after = css("--chart-after");
  const m = { l: 26, r: 8, t: 22, b: 22 };
  const X = (i) => m.l + (i + 0.5) * ((w - m.l - m.r) / sessions.length);
  const Y = (v) => H - m.b - (v / 10) * (H - m.t - m.b);
  for (const v of [0, 5, 10]) {
    svg.append(s("line", { class: v ? "grid" : "axis", x1: m.l, x2: w - m.r, y1: Y(v), y2: Y(v) }));
    svg.append(s("text", { x: m.l - 6, y: Y(v) + 3.5, "text-anchor": "end" }, v));
  }
  // Legend (two series), top-left.
  svg.append(s("circle", { cx: m.l + 5, cy: 7, r: 4, fill: before }));
  svg.append(s("text", { x: m.l + 13, y: 10.5 }, "At start"));
  svg.append(s("circle", { cx: m.l + 70, cy: 7, r: 4, fill: after }));
  svg.append(s("text", { x: m.l + 78, y: 10.5 }, "2 hours later"));
  sessions.forEach((ss, i) => {
    const x = X(i);
    const last = highlightLast && i === sessions.length - 1;
    svg.append(s("line", { x1: x, x2: x, y1: Y(ss.pain0), y2: Y(ss.pain2), stroke: "rgba(255,255,255,0.25)", "stroke-width": 2 }));
    svg.append(s("circle", { cx: x, cy: Y(ss.pain0), r: 4.5, fill: before, stroke: "#0b1220", "stroke-width": 2 }));
    svg.append(s("circle", { cx: x, cy: Y(ss.pain2), r: last ? 6 : 4.5, fill: after, stroke: last ? "#fff" : "#0b1220", "stroke-width": 2 }));
    svg.append(s("text", { x, y: H - 6, "text-anchor": "middle", class: last ? "val" : "" }, last ? "Today" : ss.n));
    const hit = s("rect", { class: "hit", x: x - 12, y: m.t, width: 24, height: H - m.t - m.b });
    tip.bind(hit, () => `<b>${last ? "Today" : `Session ${ss.n}`}</b><br><span class="k">Pain</span>${ss.pain0} → ${ss.pain2}${ss.hz ? `<br><span class="k">Settings</span>${ss.hz} Hz · ${ss.pct}% · ${ss.min} min · ${ss.temp}` : ""}`);
    svg.append(hit);
  });
}

/** The on/off envelope, drawn as a modulated carrier. */
export function rhythmWave(host) {
  const w = Math.max(200, host.clientWidth), H = 40;
  const svg = s("svg", { viewBox: `0 0 ${w} ${H}`, width: w, height: H });
  const cycle = 10, secs = 20;
  const env = (t) => {
    const p = t % cycle;
    if (p < 1.5) return p / 1.5;
    if (p < 4) return 1;
    if (p < 5.5) return 1 - (p - 4) / 1.5;
    return 0;
  };
  const pts = [];
  for (let i = 0; i <= 600; i++) {
    const t = (i / 600) * secs;
    const y = H / 2 - Math.sin(t * 2 * Math.PI * 6) * env(t) * (H / 2 - 4);
    pts.push(`${i ? "L" : "M"}${((i / 600) * w).toFixed(1)},${y.toFixed(1)}`);
  }
  svg.append(s("line", { x1: 0, x2: w, y1: H / 2, y2: H / 2, stroke: "rgba(255,255,255,0.08)" }));
  svg.append(s("path", { d: pts.join(" ") }));
  host.replaceChildren(svg, h("div", { class: "fine", style: { display: "flex", justifyContent: "space-between" } },
    h("span", {}, "0 s"), h("span", {}, "Pulsed: ramps in and out, never abrupt"), h("span", {}, "20 s")));
}

/** Matching envelope for the live device (seconds -> 0..1), sped up 2× for the demo. */
export function rhythmEnvelope(t) {
  const p = (t * 2) % 10;
  if (p < 1.5) return p / 1.5;
  if (p < 4) return 1;
  if (p < 5.5) return 1 - (p - 4) / 1.5;
  return 0;
}
