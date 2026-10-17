// The desktop dashboard: what the system has learned about this person
// (baseline month, attack signature, detection agreement), the sessions so far,
// and today's stimulation settings with the hard safety limits beside them.

import { h } from "./dom.js";
import { monthCalendar, signatureBars, painDumbbells, rhythmWave } from "./charts.js";
import { PERSONA, SAFETY_LIMITS, SESSIONS, todaysSettings } from "../sim-data.js";
import { PLACEMENTS } from "../anatomy.js";
import { arrow } from "./checkin.js";

const LOCK = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

export function createPortfolio(host, tip) {
  let slot = null;

  function render({ days, sig, detection, placement, onPlacement, onStart }) {
    const kpi = (value, label) => h("div", { class: "kpi" }, h("b", { class: "num" }, value), h("span", {}, label));
    const attackDays = days.filter((d) => d.attack).length;

    slot = h("div", { class: "replay-slot" });
    const replay = h("div", { class: "card replay-card", style: { gridColumn: "1", gridRow: "2" } },
      h("div", { class: "replay-label" }, h("div", { class: "eyebrow" }, "Today's tracking task"),
        h("div", { class: "muted", style: { fontSize: "12px" } }, "4 min · eye tracker + motion sensor")),
      slot);

    const calHost = h("div", { class: "chart" });
    const sigHost = h("div", { class: "chart" });
    const sessHost = h("div", { class: "chart" });
    const waveHost = h("div", { class: "rx-wave" });

    const card = (title, sub, body, style, extra = null) =>
      h("div", { class: "card", style }, h("div", { class: "card-head" }, h("h3", {}, title), extra), h("p", { class: "card-sub" }, sub), body);

    const rxRows = h("div", { class: "rx-rows" });
    const toggle = h("div", { class: "seg-toggle", role: "group", "aria-label": "Placement" });
    for (const [id, p] of Object.entries(PLACEMENTS)) {
      const b = h("button", { type: "button", class: id === placement ? "on" : "", title: p.label }, p.short);
      b.addEventListener("click", () => {
        for (const x of toggle.children) x.classList.toggle("on", x === b);
        onPlacement(id);
        fillRx(id, false);
      });
      toggle.append(b);
    }
    const placementNote = h("div", { class: "fine" });
    const fillRx = (id, animate) => {
      const rx = todaysSettings(id);
      const rows = [{ label: "Placement", value: PLACEMENTS[id].label, why: id === "back" ? "Occipital nerve stimulation, not vagus." : "Targets the vagus nerve, as the overview proposes." }, ...rx.rows];
      rxRows.replaceChildren(...rows.map((r, i) => {
        const row = h("div", { class: "rx-row" }, h("span", { class: "lab" }, r.label), h("b", { class: "num" }, r.value), h("span", { class: "why" }, r.why));
        row.style.animationDelay = animate ? `${0.8 + i * 0.1}s` : "0s";
        return row;
      }));
      placementNote.textContent = "Placement is still an open question in the plan: side of neck, ear, or back of neck.";
    };

    const limits = h("div", { class: "limits" },
      ...SAFETY_LIMITS.map((l) => h("div", { class: "limit" }, h("span", { class: "lock", html: LOCK }), h("span", {}, l.label), h("b", { class: "num" }, l.value))));

    const rx = h("div", { class: "card rx-card", style: { gridColumn: "3", gridRow: "2 / 4", animationDelay: "0.45s" } },
      h("div", { class: "card-head" }, h("div", { class: "eyebrow" }, "Today's stimulation"), h("span", { class: "chip-mini" }, "Exploit best so far")),
      h("div", { class: "placement-row" }, toggle),
      placementNote,
      rxRows,
      waveHost,
      h("div", { class: "limits-head" }, h("span", { class: "eyebrow muted-eyebrow" }, "Hard safety limits"), h("span", { class: "fine" }, "the tuner can never change these")),
      limits,
      h("div", { class: "rx-foot" },
        h("button", { class: "btn-primary", type: "button", onclick: onStart }, "Start session", arrow()),
        h("span", { class: "fine" }, "Found by careful trial and error within safe limits: the data shows what worked, it can't predict day one.")));
    fillRx(placement, true);

    host.replaceChildren(
      h("div", { class: "win-bar" }, h("i"), h("i"), h("i"), h("span", { class: "win-title" }, "LUMA · Personal migraine profile")),
      h("div", { class: "win-body" },
        h("div", { class: "card profile-card" },
          h("div", { class: "avatar" }, PERSONA.initials),
          h("div", { class: "profile-meta" }, h("b", {}, PERSONA.name),
            h("span", {}, `${PERSONA.age} · Day ${PERSONA.day} · Month 3, adaptive phase`)),
          h("div", { class: "kpis" },
            kpi(`${attackDays} / 30`, "Attack days, baseline"),
            kpi(`${Math.round(detection.rate * 100)}%`, "Model agrees with check-in"),
            kpi(`${SESSIONS.length}`, "Sessions so far"),
            h("div", { class: "kpi today" }, h("b", { class: "num" }, "88%"), h("span", {}, "Today looks like an attack")))),
        replay,
        card("Baseline month", "Month 1 · data only, no stimulation", calHost, { gridColumn: "1", gridRow: "3", animationDelay: "0.3s" }),
        card("Your attack signature", "Attack days vs normal days, from the tracking task and voice notes", sigHost, { gridColumn: "2", gridRow: "2", animationDelay: "0.15s" }),
        card("Pain at start vs 2 hours later", "Every treated attack in the adaptive phase", sessHost, { gridColumn: "2", gridRow: "3", animationDelay: "0.35s" }),
        rx,
      ),
    );

    requestAnimationFrame(() => {
      monthCalendar(calHost, days, tip);
      signatureBars(sigHost, sig, tip);
      painDumbbells(sessHost, SESSIONS, tip);
      rhythmWave(waveHost);
    });
  }

  return { render, slot: () => slot };
}
