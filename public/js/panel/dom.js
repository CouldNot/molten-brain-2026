// Panel DOM helpers: fold a panel's headed sections into <details>, and flash a row
// a jump landed on (unfolding the section holding it).

/**
 * Scroll an element into view and flash it, for an action that lands the reader
 * somewhere they did not choose to scroll to: a click that navigates to another node
 * *because of* one row (arriving on the target's panel, the row that explains the jump
 * is under the eye instead of hunted for), or a search pick that flips a setting (the
 * changed toggle says so itself). Deferred a frame because the caller usually shows
 * the host pane right AFTER this runs (see focusDrug -> openDetailTab, and the search
 * pick, which closes the search box only after the item's select()), and
 * scrollIntoView on a hidden box is a no-op.
 * @param {?HTMLElement} elm
 */
export function flashRow(elm) {
  if (!elm) return;
  requestAnimationFrame(() => {
    // A row folded inside a collapsed section (see foldSections) is opened first, or
    // the jump would land on nothing visible. Inside the rAF: the fold pass runs
    // after a panel's rows are built, so the <details> only exists by now.
    if (elm.tagName === "DETAILS") elm.open = true;
    for (let d = elm.parentElement?.closest("details"); d;
      d = d.parentElement?.closest("details")) d.open = true;
    elm.scrollIntoView({ block: "center", behavior: "smooth" });
    elm.classList.add("node-flash");
    elm.addEventListener("animationend",
      () => elm.classList.remove("node-flash"), { once: true });
  });
}

/**
 * Fold every headed section directly under `host` into a collapsed `<details>`: a
 * section whose first child is an `<h3>` becomes `details.disclosure.panel-sec` with
 * that heading as its `<summary>` and the rest in an indented `.panel-sec-body`; one
 * that already is a `<details>` (the drug panel's "Drug interactions") just gets the
 * same classes and body. Classes and `data-tour-*` hooks carry over, so a tour step
 * or flashRow still finds the section (and flashRow opens it). Unheaded blocks (the
 * title, intro, facts) stay as they are.
 * @param {HTMLElement} host
 */
export function foldSections(host) {
  for (const sec of [...host.children]) {
    const isDetails = sec.tagName === "DETAILS";
    const head = sec.firstElementChild;
    if (!head || (!isDetails && head.tagName !== "H3")) continue;
    let det = sec;
    let summary = head;
    if (!isDetails) {
      det = document.createElement("details");
      det.className = sec.className;
      Object.assign(det.dataset, sec.dataset);
      summary = document.createElement("summary");
      summary.append(...head.childNodes);
      head.remove();
    }
    det.classList.add("disclosure", "panel-sec");
    const inner = document.createElement("div");
    inner.className = "panel-sec-body";
    inner.append(...[...sec.childNodes].filter((n) => n !== summary));
    if (!isDetails) sec.replaceWith(det);
    det.replaceChildren(summary, inner);
  }
}
