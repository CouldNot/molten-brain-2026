// Tiny promise-based tween engine. Every tween resolves (never rejects), including
// when cleared, so an act script awaiting one can never hang; the director checks
// its abort signal after each await instead.

export const ease = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

export function createTweens() {
  const active = new Set();

  /** Stop animating `keys` (default: all) of `target`; a newer tween always wins. */
  function kill(target, keys = null) {
    for (const it of active) {
      if (it.target !== target) continue;
      for (const k of keys || Object.keys(it.props)) delete it.props[k];
      if (!Object.keys(it.props).length) {
        active.delete(it);
        it.resolve();
      }
    }
  }

  /** Animate numeric `props` of `target` from their current values. */
  function to(target, props, { duration = 1000, delay = 0, easing = ease.inOut, onUpdate } = {}) {
    kill(target, Object.keys(props));
    return new Promise((resolve) => {
      const item = { target, props: { ...props }, duration, delay, easing, onUpdate, resolve, start: null, from: null };
      active.add(item);
    });
  }

  /** Drive an arbitrary 0..1 callback. */
  function run(fn, { duration = 1000, delay = 0, easing = ease.inOut } = {}) {
    return to({ v: 0 }, { v: 1 }, { duration, delay, easing, onUpdate: (o) => fn(o.v) });
  }

  function tick(now) {
    for (const it of active) {
      if (it.start === null) it.start = now + it.delay;
      if (now < it.start) continue;
      if (!it.from) {
        it.from = {};
        for (const k in it.props) it.from[k] = it.target[k];
      }
      const raw = it.duration <= 0 ? 1 : Math.min(1, (now - it.start) / it.duration);
      const e = it.easing(raw);
      for (const k in it.props) it.target[k] = it.from[k] + (it.props[k] - it.from[k]) * e;
      it.onUpdate?.(it.target, raw);
      if (raw >= 1) {
        active.delete(it);
        it.resolve();
      }
    }
  }

  /** Drop every running tween, resolving its promise without finishing it. */
  function clear() {
    for (const it of active) it.resolve();
    active.clear();
  }

  return { to, run, kill, tick, clear };
}
