// Simulated participant, sensor streams, personalization engine and results.
//
// Every number the UI shows flows from this module, so wiring in the real
// check-in app, eye tracker, motion sensor, voice pipeline and wearable means
// replacing this file, not touching the views. The settings logic is a
// stand-in for the overview's explore/exploit tuner, not a clinical algorithm.

export function rng(seed = 7) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const PERSONA = { name: "Alex Rivera", initials: "AR", age: 29, day: 64 };

// ---- Daily check-in -------------------------------------------------------------------

export const LOCATIONS = [
  { id: "right", label: "Right side" }, { id: "left", label: "Left side" }, { id: "both", label: "Both sides" },
  { id: "forehead", label: "Forehead" }, { id: "back", label: "Back of head" },
];
export const SYMPTOMS = [
  { id: "aura", label: "Aura" }, { id: "nausea", label: "Nausea" },
  { id: "light", label: "Light sensitivity" }, { id: "sound", label: "Sound sensitivity" },
  { id: "neck", label: "Neck stiffness" },
];
export const MEDICATIONS = [
  { id: "none", label: "None yet" }, { id: "triptan", label: "Triptan" }, { id: "nsaid", label: "Ibuprofen / NSAID" },
];
/** Red flags that stop the flow and send the person to urgent care. */
export const DANGER_SIGNS = [
  { id: "worst", label: "Sudden, worst-ever headache" },
  { id: "weakness", label: "Weakness or numbness" },
  { id: "speech", label: "Trouble speaking" },
  { id: "vision", label: "Vision loss" },
];

export const CHECKIN_DEFAULTS = {
  migraine: true,
  pain: 7,
  location: "right",
  symptoms: ["light", "nausea", "neck"],
  medication: "none",
  startedHoursAgo: 1,
  danger: [],
  sleep: 5.5,
  stress: "high",
  caffeine: 2,
};
export const WEATHER = "Pressure falling · 1,009 hPa · pulled automatically";

// ---- Daily tracking task ---------------------------------------------------------------

/** Live readout rows, in HUD order. Eye tracker + clip-on motion sensor. */
export const METRICS = [
  { id: "head_range", label: "Head turn range", unit: "°", digits: 0, range: [0, 90], sensor: "motion" },
  { id: "head_speed", label: "Head turn speed", unit: "°/s", digits: 0, range: [0, 180], sensor: "motion" },
  { id: "blink", label: "Blink rate", unit: "/min", digits: 0, range: [4, 30], sensor: "eye" },
  { id: "pupil", label: "Pupil diameter", unit: "mm", digits: 1, range: [2, 6], sensor: "eye" },
  { id: "squint", label: "Squint index", unit: "", digits: 2, range: [0, 1], sensor: "eye" },
  { id: "bright_gaze", label: "Gaze to bright areas", unit: "%", digits: 0, range: [0, 100], sensor: "eye" },
];

/** The fixed 4-minute task, same lighting every day so days compare. */
export const TASK_PHASES = [
  { id: "pursuit", label: "Follow the dot", detail: "Smooth pursuit · 60 s", seconds: 60 },
  { id: "turns", label: "Turn your head left and right", detail: "Range of motion · 45 s", seconds: 45 },
  { id: "light", label: "Brightness steps", detail: "Screen steps 50 to 400 nits · 60 s", seconds: 60 },
  { id: "scene", label: "Free viewing", detail: "Bright and dim scene · 45 s", seconds: 45 },
];

/** Per-person means from the baseline month. */
export const NORMAL_DAY = { head_range: 74, head_speed: 126, blink: 15, pupil: 3.9, squint: 0.22, bright_gaze: 41, speech_rate: 152, pitch_var: 1.0 };
export const ATTACK_DAY = { head_range: 46, head_speed: 77, blink: 21, pupil: 3.4, squint: 0.47, bright_gaze: 19, speech_rate: 124, pitch_var: 0.72 };

export const SIGNATURE_LABELS = {
  head_range: "Head turn range", head_speed: "Head turn speed", blink: "Blink rate", pupil: "Pupil diameter",
  squint: "Squinting", bright_gaze: "Gaze to bright areas", speech_rate: "Speech rate", pitch_var: "Pitch variation",
};

/** One live sample during `phase` at time `t` s, from a day profile (normal or attack-like). */
export function sampleTask(phase, t, rand, profile = ATTACK_DAY) {
  const j = () => (rand() - 0.5) * 2;
  const w = (f, p) => Math.sin(t * f + p);
  const turning = phase === "turns";
  const bright = phase === "light" ? 0.5 + 0.5 * Math.sin(t * 0.9) : phase === "scene" ? 0.6 : 0.2;
  return {
    // Range is a running measurement: it holds the last value outside the head-turn step.
    head_range: clamp(profile.head_range * (turning ? 0.85 + 0.15 * Math.abs(w(1.6, 0)) : 0.97) + 0.6 * j(), 0, 90),
    head_speed: clamp(profile.head_speed * (turning ? 0.6 + 0.4 * Math.abs(w(3.2, 1)) : 0.08 + 0.04 * Math.abs(j())), 0, 180),
    blink: clamp(profile.blink + 2.2 * w(0.5, 2) + 1.2 * j() + bright * 2, 3, 30),
    pupil: clamp(profile.pupil - bright * 0.6 + 0.1 * w(0.7, 3) + 0.04 * j(), 2, 6),
    squint: clamp(profile.squint + bright * 0.18 + 0.04 * w(0.8, 4) + 0.02 * j(), 0, 1),
    bright_gaze: clamp(profile.bright_gaze + (phase === "scene" ? 6 * w(0.6, 5) : 0) + 3 * j(), 0, 100),
  };
}

export const VOICE_NOTE = {
  seconds: 42,
  transcript: "Woke up with it behind my right eye. The lights at work feel way too bright, and turning my head makes it throb.",
  speech_rate: 121,
  pitch_var: 0.7,
};

// ---- Baseline month + personalization engine -----------------------------------------

/** 30 days of the baseline month: attack days, pain, task done, model guess. */
export function baselineMonth() {
  const attacks = new Map([[3, 6], [6, 8], [10, 5], [14, 7], [17, 6], [21, 8], [25, 7], [28, 6]]);
  const skipped = new Set([6, 21]); // too painful to do the task: itself a data point
  const missed = new Set([12, 21]); // model disagreed with the check-in
  const days = [];
  for (let d = 1; d <= 30; d++) {
    const attack = attacks.has(d);
    days.push({
      day: d, attack, pain: attacks.get(d) || 0,
      task: !skipped.has(d),
      predicted: missed.has(d) ? !attack : attack,
    });
  }
  return days;
}

export function signature() {
  return Object.keys(SIGNATURE_LABELS).map((k) => ({
    id: k,
    label: SIGNATURE_LABELS[k],
    change: (ATTACK_DAY[k] - NORMAL_DAY[k]) / NORMAL_DAY[k],
    normal: NORMAL_DAY[k],
    attack: ATTACK_DAY[k],
    sensor: k.startsWith("head") ? "Motion" : k === "speech_rate" || k === "pitch_var" ? "Voice" : "Eye",
  })).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

export function detectionStats(days) {
  const scored = days.filter((d) => d.task);
  const agree = scored.filter((d) => d.predicted === d.attack).length;
  return { agree, total: scored.length, rate: agree / scored.length };
}

/** Hard-coded limits the tuner can never cross (illustrative values, to set with clinicians). */
export const SAFETY_LIMITS = [
  { label: "Max intensity", value: "60%" },
  { label: "Skin temperature", value: "15 to 40 °C" },
  { label: "Max session", value: "20 min" },
  { label: "Max sessions a day", value: "3" },
];

/** Adaptive-phase sessions so far: settings tried and the 2-hour pain score. */
export const SESSIONS = [
  { n: 1, hz: 100, pct: 35, min: 12, temp: "Neutral", pain0: 7, pain2: 5 },
  { n: 2, hz: 100, pct: 40, min: 12, temp: "Neutral", pain0: 6, pain2: 4 },
  { n: 3, hz: 110, pct: 40, min: 12, temp: "Neutral", pain0: 8, pain2: 4 },
  { n: 4, hz: 90, pct: 40, min: 12, temp: "Neutral", pain0: 6, pain2: 5 },
  { n: 5, hz: 110, pct: 40, min: 12, temp: "Cool −2 °C", pain0: 7, pain2: 3 },
  { n: 6, hz: 110, pct: 45, min: 14, temp: "Neutral", pain0: 7, pain2: 4 },
  { n: 7, hz: 110, pct: 40, min: 12, temp: "Cool −2 °C", pain0: 6, pain2: 2 },
  { n: 8, hz: 120, pct: 40, min: 12, temp: "Cool −2 °C", pain0: 7, pain2: 4 },
];

export function todaysSettings(placement = "side") {
  const drop = (s) => s.pain0 - s.pain2;
  const best = [...SESSIONS].sort((a, b) => drop(b) - drop(a) || a.pain2 - b.pain2)[0];
  const avgDrop = (rows) => rows.reduce((t, s) => t + drop(s), 0) / rows.length;
  const cool = SESSIONS.filter((s) => s.temp !== "Neutral");
  const neutral = SESSIONS.filter((s) => s.temp === "Neutral");
  return {
    placement,
    hz: best.hz, pct: best.pct, min: best.min, temp: best.temp,
    mode: "Exploit",
    rows: [
      { id: "freq", label: "Vibration frequency", value: `${best.hz} Hz`, why: `Biggest 2-hour pain drop so far (sessions ${SESSIONS.filter((s) => s.hz === best.hz && s.temp === best.temp).map((s) => s.n).join(", ")}).` },
      { id: "intensity", label: "Intensity", value: `${best.pct}%`, why: "Up from the 35% default; the limit is 60%." },
      { id: "length", label: "Session length", value: `${best.min} min`, why: "Started longer: your head movement drops 38% during attacks." },
      { id: "temp", label: "Temperature", value: best.temp, why: `Tested as its own setting: average drop ${avgDrop(cool).toFixed(1)} cool vs ${avgDrop(neutral).toFixed(1)} neutral.` },
      { id: "timing", label: "Timing", value: "At attack start", why: "Check-in said yes, and the tracking model agreed (88%)." },
    ],
  };
}

// ---- Results ----------------------------------------------------------------------------

export function sessionResult(checkin) {
  const pain0 = checkin.pain;
  return { pain0, pain2: Math.max(0, pain0 - 4) };
}

/** Results over time for Mode 2, framed with the overview's study metrics. */
export function resultsOverTime(checkin, detection) {
  const today = sessionResult(checkin);
  const treated = [...SESSIONS, { n: SESSIONS.length + 1, pain0: today.pain0, pain2: today.pain2 }];
  const relief = treated.filter((s) => s.pain0 >= 4 && s.pain2 <= 3).length;
  const free = treated.filter((s) => s.pain2 === 0).length;
  return {
    treated,
    cards: [
      { id: "today", label: "Pain at 2 hours, this session", unit: "/10", before: today.pain0, after: today.pain2, max: 10, better: "lower", digits: 0 },
      { id: "days", label: "Migraine days a month", unit: "days", before: 8, after: 6, max: 12, better: "lower", digits: 0, note: "Baseline month vs month 2" },
      { id: "rescue", label: "Rescue medication days", unit: "days", before: 5, after: 3, max: 10, better: "lower", digits: 0, note: "Baseline month vs month 2" },
    ],
    stats: [
      { label: "Pain relief at 2 h", value: `${relief} of ${treated.length}`, sub: "moderate/severe to mild or none" },
      { label: "Pain free at 2 h", value: `${free} of ${treated.length}`, sub: "the standard FDA endpoint" },
      { label: "Detection agreement", value: `${Math.round(detection.rate * 100)}%`, sub: "model vs daily yes/no" },
      { label: "Adherence", value: "91%", sub: "check-in + task completed" },
    ],
  };
}

export function fmt(value, digits = 0) {
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
