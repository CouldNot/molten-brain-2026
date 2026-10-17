// Live sensor readout for the tracking task (eye tracker + motion sensor), the
// voice note, and the before/after numbers in the session acts.

import { h } from "./dom.js";
import { METRICS, fmt } from "../sim-data.js";

const HISTORY = 90;

export function createHud(host, eventsHost) {
  const rec = h("span", { class: "rec idle" }, "Idle");
  const heading = h("span", { class: "eyebrow" }, "Daily tracking");
  const title = h("b", {}, "");
  const detail = h("span", {}, "");
  const activity = h("div", { class: "hud-activity" }, title, detail);
  const big = h("div", { class: "hud-big" });

  const rows = new Map();
  const list = h("div", {});
  for (const m of METRICS) {
    const canvas = h("canvas", { width: 192, height: 52 });
    const value = h("div", { class: "metric-value num" }, "–");
    list.append(h("div", { class: "metric" },
      h("div", { class: "metric-name" }, m.label, h("span", { class: `sensor ${m.sensor}` }, m.sensor === "eye" ? "eye" : "motion")),
      canvas, value));
    rows.set(m.id, { m, canvas, value, history: [] });
  }

  // Voice note: live transcript, level meter, extracted features.
  const transcript = h("p", { class: "transcript" });
  const wave = h("canvas", { width: 616, height: 80, class: "voice-wave" });
  const voiceStats = h("div", { class: "hud-big" });
  const voice = h("div", { class: "voice" }, wave, transcript, voiceStats,
    h("div", { class: "fine" }, "Transcribed and scored on-device. Only the features are stored."));
  voice.hidden = true;

  const footLeft = h("span", {}, "");
  const footRight = h("span", { class: "num" }, "");
  const fill = h("span");
  host.replaceChildren(
    h("div", { class: "hud-head" }, heading, rec),
    activity, big, list, voice,
    h("div", { class: "hud-foot" }, footLeft, footRight),
    h("div", { class: "progress" }, fill),
  );

  function draw(row) {
    const { canvas, history, m } = row;
    const g = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    g.clearRect(0, 0, W, H);
    if (history.length < 2) return;
    const [lo, hi] = m.range;
    const y = (v) => H - 4 - Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * (H - 8);
    g.beginPath();
    history.forEach((v, i) => {
      const x = (i / (HISTORY - 1)) * W;
      i ? g.lineTo(x, y(v)) : g.moveTo(x, y(v));
    });
    g.strokeStyle = m.sensor === "eye" ? "#4fe3ff" : "#ffc35a";
    g.lineWidth = 2.5;
    g.shadowColor = g.strokeStyle;
    g.shadowBlur = 8;
    g.stroke();
    const last = history.length - 1;
    g.fillStyle = "#e8f3ff";
    g.beginPath();
    g.arc((last / (HISTORY - 1)) * W, y(history[last]), 3.5, 0, Math.PI * 2);
    g.fill();
  }

  let total = 0;
  const levels = [];
  return {
    setRecording(on, label) {
      rec.classList.toggle("idle", !on);
      rec.textContent = label || (on ? "Recording" : "Idle");
    },
    setTitle(text) { heading.textContent = text; },
    setActivity(name, where) { title.textContent = name; detail.textContent = where; },
    setBig(items) {
      big.hidden = !items?.length;
      big.replaceChildren(...(items || []).map((i) => h("div", {}, h("b", { class: "num" }, i.value), h("span", {}, i.label))));
    },
    setFoot(left, right = "") { footLeft.textContent = left; footRight.textContent = right; },
    setProgress(f) { fill.style.width = `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`; },
    showMetrics(on) { list.hidden = !on; },
    push(sample) {
      for (const row of rows.values()) {
        const v = sample[row.m.id];
        row.history.push(v);
        if (row.history.length > HISTORY) row.history.shift();
        row.value.innerHTML = `${fmt(v, row.m.digits)}${row.m.unit ? `<small>${row.m.unit}</small>` : ""}`;
        draw(row);
      }
      total++;
    },
    /** Voice note mode: `words` so far, a 0..1 level, features once known. */
    setVoice(on) { voice.hidden = !on; list.hidden = on; if (on) { transcript.textContent = ""; levels.length = 0; voiceStats.replaceChildren(); } },
    voiceWords(text) { transcript.textContent = text; },
    voiceLevel(level) {
      levels.push(level);
      if (levels.length > 72) levels.shift();
      const g = wave.getContext("2d");
      g.clearRect(0, 0, wave.width, wave.height);
      g.fillStyle = "#4fe3ff";
      g.shadowColor = "#4fe3ff";
      g.shadowBlur = 6;
      const bw = wave.width / 72;
      levels.forEach((l, i) => {
        const hh = Math.max(2, l * (wave.height - 8));
        g.fillRect(i * bw, (wave.height - hh) / 2, bw * 0.6, hh);
      });
    },
    voiceStats(items) {
      voiceStats.replaceChildren(...items.map((i) => h("div", {}, h("b", { class: "num" }, i.value), h("span", {}, i.label))));
    },
    reset() {
      total = 0;
      for (const row of rows.values()) { row.history = []; row.value.textContent = "–"; draw(row); }
      fill.style.width = "0%";
      eventsHost.replaceChildren();
      this.setBig(null);
      this.setVoice(false);
      this.showMetrics(true);
      this.setFoot("", "");
      this.setTitle("Daily tracking");
    },
    event(text, stamp) {
      eventsHost.append(h("div", { class: "event" }, h("span", { class: "t" }, stamp), text));
      while (eventsHost.children.length > 3) eventsHost.firstChild.remove();
    },
  };
}
