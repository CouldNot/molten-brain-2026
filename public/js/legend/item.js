// Legend row primitives shared by every browse section: one swatch row, the
// active-row reflector, and the neutral caption + count-tagged list the Enzymes and
// Effects sections are.

const { t } = window.__I18N__;

/**
 * Append one swatch+label row to a container. `line` renders a thin bar.
 * @returns {HTMLElement} the created row, so callers can wire it up.
 */
export function addLegendItem(container, color, label, line = false) {
  const row = document.createElement("div");
  row.className = "legend-item";
  const swatch = document.createElement("span");
  swatch.className = line ? "swatch line" : "swatch";
  swatch.style.background = color;
  row.append(swatch, document.createTextNode(label));
  container.appendChild(row);
  return row;
}

/**
 * The `reflect(activeId)` every browse legend returns over its `{row, id}` rows: lights
 * the active row and dims the rest (nothing dimmed when `activeId` is null).
 * @param {{row: HTMLElement, id: string}[]} rows
 * @returns {(activeId: string|null) => void}
 */
export function reflectRows(rows) {
  return function reflect(activeId) {
    for (const { row, id } of rows) {
      const selected = id === activeId;
      row.classList.toggle("selected", selected);
      row.classList.toggle("dimmed", activeId !== null && !selected);
    }
  };
}

/**
 * A flat browse list in `#<section>-body`: its caption, then one clickable row per
 * item with a neutral swatch (the item carries no effect colour, and borrowing one
 * would imply a net effect the row does not claim) and a count tag. Rows carry
 * `data-tour-id="<kind>:<id>"` for the tour and the snapshot tooling.
 * @param {{section: string, captionKey: string, kind: string, items: object[],
 *   count: (item: object) => number, tagTitle?: string, onPick: (item: object) => void}} o
 * @returns {(activeId: string|null) => void} reflect: lights the active row
 */
export function buildBrowseList({ section, captionKey, kind, items, count, tagTitle, onPick }) {
  const container = document.getElementById(`${section}-body`);
  if (!container) return () => {};
  container.replaceChildren();
  const rows = [];
  const caption = document.createElement("p");
  caption.className = "legend-caption";
  caption.textContent = t(captionKey);
  container.appendChild(caption);
  for (const item of items) {
    const row = addLegendItem(container, "#9aa0a6", item.label);
    const tag = document.createElement("span");
    tag.className = "legend-tag";
    tag.textContent = String(count(item));
    if (tagTitle) tag.title = tagTitle;
    row.appendChild(tag);
    row.classList.add("clickable");
    row.dataset.tourId = `${kind}:${item.id}`;
    row.addEventListener("click", () => onPick(item));
    rows.push({ row, id: item.id });
  }
  return reflectRows(rows);
}
