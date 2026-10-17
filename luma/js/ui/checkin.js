// Daily check-in: "Do you have a migraine today?", symptoms on yes-days, the
// everyday context questions, and the danger-sign screen that stops the flow.
// Edits write straight into the shared `checkin` object.

import { h } from "./dom.js";
import { LOCATIONS, SYMPTOMS, MEDICATIONS, DANGER_SIGNS, CHECKIN_DEFAULTS, WEATHER, PERSONA } from "../sim-data.js";

export function arrow() {
  const span = document.createElement("span");
  span.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  span.style.display = "inline-flex";
  return span;
}

export function createCheckin(host, checkin, { onSubmit, onDanger }) {
  const refs = {};

  const chips = (key, options, { multi = false, small = false } = {}) => {
    const wrap = h("div", { class: `chips${small ? " small" : ""}` });
    for (const o of options) {
      const b = h("button", { class: "chip", type: "button", "data-id": String(o.id) }, o.label);
      b.addEventListener("click", () => {
        if (multi) {
          const set = new Set(checkin[key]);
          set.has(o.id) ? set.delete(o.id) : set.add(o.id);
          checkin[key] = [...set];
        } else checkin[key] = o.id;
        sync();
      });
      wrap.append(b);
    }
    refs[key] = wrap;
    return wrap;
  };

  const scale = (key) => {
    const wrap = h("div", { class: "seg" });
    for (let i = 0; i <= 10; i++) {
      const b = h("button", { type: "button", "aria-label": `${i}` }, i);
      b.addEventListener("click", () => { checkin[key] = i; sync(); });
      wrap.append(b);
    }
    refs[key] = wrap;
    return wrap;
  };

  const field = (label, control) => h("div", { class: "field" }, h("div", { class: "field-label" }, h("span", {}, label)), control);

  const yesNo = h("div", { class: "yesno" },
    ...[[true, "Yes"], [false, "No"]].map(([val, label]) => {
      const b = h("button", { type: "button", "data-id": String(val) }, label);
      b.addEventListener("click", () => { checkin.migraine = val; sync(); });
      return b;
    }));
  refs.migraine = yesNo;

  const attackFields = h("div", { class: "attack-fields" },
    field("Pain right now (0 to 10)", scale("pain")),
    h("div", { class: "field-row" },
      field("Where", chips("location", LOCATIONS)),
      field("Started", chips("startedHoursAgo", [{ id: 1, label: "Under 1 h" }, { id: 2, label: "1 to 3 h" }, { id: 4, label: "Over 3 h" }]))),
    field("Symptoms", chips("symptoms", SYMPTOMS, { multi: true })),
    field("Medication taken", chips("medication", MEDICATIONS)));

  const dangerBanner = h("div", { class: "danger-banner", role: "alert" },
    h("b", {}, "Please seek urgent care now."),
    " These can be signs of something other than migraine. Call emergency services or go to an emergency department. The session is paused.");
  const danger = h("div", { class: "danger" },
    h("div", { class: "field-label" }, h("span", {}, "Any of these right now?"), h("span", { class: "muted" }, "Safety screen")),
    chips("danger", DANGER_SIGNS, { multi: true }),
    dangerBanner);

  const submit = h("button", { class: "btn-primary", type: "button", onclick: () => onSubmit() }, "Save check-in", arrow());

  host.replaceChildren(
    h("div", { class: "eyebrow" }, `Day ${PERSONA.day} · Daily check-in`),
    h("div", { class: "title" }, "Do you have a migraine today?"),
    yesNo,
    attackFields,
    danger,
    h("div", { class: "everyday" },
      h("div", { class: "field-label" }, h("span", {}, "Every day"), h("span", { class: "muted" }, WEATHER)),
      h("div", { class: "field-row" },
        field("Sleep", chips("sleep", [{ id: 4.5, label: "<5 h" }, { id: 5.5, label: "5–6 h" }, { id: 7, label: "7 h" }, { id: 8.5, label: "8 h+" }], { small: true })),
        field("Stress", chips("stress", [{ id: "low", label: "Low" }, { id: "medium", label: "Medium" }, { id: "high", label: "High" }], { small: true })),
        field("Caffeine", chips("caffeine", [0, 1, 2, 3].map((n) => ({ id: n, label: n === 3 ? "3+" : `${n}` })), { small: true })))),
    h("div", { class: "intake-foot" },
      h("span", { class: "muted fine" }, "Demo persona. Not medical advice."),
      submit),
  );

  function sync() {
    for (const b of yesNo.children) b.classList.toggle("on", b.dataset.id === String(checkin.migraine));
    attackFields.classList.toggle("collapsed", checkin.migraine !== true);
    for (const key of ["location", "startedHoursAgo", "medication", "sleep", "stress", "caffeine"]) {
      for (const b of refs[key].children) b.classList.toggle("on", b.dataset.id === String(checkin[key]));
    }
    for (const key of ["symptoms", "danger"]) {
      for (const b of refs[key].children) b.classList.toggle("on", checkin[key].includes(b.dataset.id));
    }
    [...refs.pain.children].forEach((b, i) => {
      b.classList.toggle("on", i === checkin.pain);
      b.classList.toggle("fill", i < checkin.pain);
    });
    const flagged = checkin.danger.length > 0;
    dangerBanner.hidden = !flagged;
    refs.danger.parentElement.classList.toggle("flagged", flagged);
    submit.disabled = flagged;
    onDanger?.(flagged);
  }

  /** Animate the persona's answers in, one control at a time. */
  async function autofill(wait) {
    const target = structuredClone(CHECKIN_DEFAULTS);
    Object.assign(checkin, { ...target, migraine: null, pain: 0, location: null, symptoms: [], medication: null, startedHoursAgo: null, danger: [], sleep: null, stress: null, caffeine: null });
    sync();
    await wait(700);
    const pulse = async (key, id) => {
      const b = [...refs[key].children].find((x) => x.dataset.id === String(id));
      b?.classList.remove("pulse"); void b?.offsetWidth; b?.classList.add("pulse");
      await wait(240);
    };
    checkin.migraine = true; sync(); await pulse("migraine", true);
    for (let i = 0; i <= target.pain; i++) { checkin.pain = i; sync(); await wait(55); }
    checkin.location = target.location; sync(); await pulse("location", target.location);
    checkin.startedHoursAgo = target.startedHoursAgo; sync(); await pulse("startedHoursAgo", target.startedHoursAgo);
    for (const s of target.symptoms) { checkin.symptoms = [...checkin.symptoms, s]; sync(); await pulse("symptoms", s); }
    checkin.medication = target.medication; sync(); await pulse("medication", target.medication);
    await wait(250);
    for (const k of ["sleep", "stress", "caffeine"]) { checkin[k] = target[k]; sync(); await pulse(k, target[k]); }
  }

  sync();
  return { sync, autofill };
}
