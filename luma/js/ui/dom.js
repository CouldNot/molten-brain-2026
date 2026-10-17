// Minimal DOM builder: h("div", { class: "x", onclick }, child, "text", ...).

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") {
      // Custom properties (--c) only take via setProperty, not property assignment.
      for (const [sk, sv] of Object.entries(v)) sk.startsWith("--") ? el.style.setProperty(sk, sv) : (el.style[sk] = sv);
    }
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";
export function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Shared hover tooltip. `bind(el, () => html)` shows it while hovering `el`. */
export function createTooltip(node) {
  const move = (e) => {
    const pad = 14;
    const r = node.getBoundingClientRect();
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - pad;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - pad;
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
  };
  return {
    bind(el, content) {
      el.addEventListener("pointerenter", (e) => { node.innerHTML = content(); node.hidden = false; move(e); });
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerleave", () => { node.hidden = true; });
    },
    hide() { node.hidden = true; },
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
