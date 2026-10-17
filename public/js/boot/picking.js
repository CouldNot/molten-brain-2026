// Canvas picking: click / tap selects the structure or arrow under the pointer (the
// nearer one wins), hover highlights, and touch gestures that are not taps (pinch, drag)
// never select. Inert while the guided tour is on screen.

export function wireCanvasPicking({
  arrows, canvas, labels, meshes, pickStructureHit, raycaster, selectConnection,
  selection, selectStructure, setPointer, tabs,
}) {
  // Arrow picking, two object sets for two purposes:
  //  - `arrowPickables` includes each arrow's fat invisible pick hull
  //    (PICK_RADIUS), so a thin arrow over empty space is still easy to
  //    click/tap; used only as the empty-space fallback below.
  //  - `visibleArrowPickables` is the *visible* geometry only (tube + cone(s),
  //    minus that hull), so the click handler can compare an arrow's real
  //    on-screen depth against a structure's and pick whichever is in front.
  // Arrows hidden in isolated screenshot views (group.visible=false) are ignored.
  const arrowPickables = arrows.flatMap((arrow) => arrow.meshes);
  const visibleArrowPickables = arrows.flatMap((a) => a.meshes.filter((m) => m !== a.pick));
  const firstVisibleArrowHit = (pickables) => {
    for (const hit of raycaster.intersectObjects(pickables, false)) {
      const arrow = hit.object.userData.arrow;
      if (arrow && arrow.group.visible) return { arrow, distance: hit.distance };
    }
    return null;
  };
  // Arrow under a point via the generous pick hull (or null).
  const pickArrowAt = (clientX, clientY) => {
    setPointer(clientX, clientY);
    // The fat pick hulls are rebuilt lazily (deferred during a spread), so make
    // sure any stale ones are current before raycasting them.
    for (const a of arrows) a.ensurePickGeometry();
    return firstVisibleArrowHit(arrowPickables)?.arrow || null;
  };
  // Nearest *visible* arrow part under a point ({arrow, distance}) or null.
  const pickVisibleArrowHit = (clientX, clientY) => {
    setPointer(clientX, clientY);
    return firstVisibleArrowHit(visibleArrowPickables);
  };

  // What a tap/click does: select whatever is *visually* front-most under the
  // point. We compare depths so a click on a region selects the region even when
  // an arrow's fat (invisible) pick hull happens to pass over it; an arrow wins
  // only when its *visible* tube/cone is at least as near the camera as the
  // nearest structure. With nothing solid under the point (empty space) we fall
  // back to the generous arrow hull, so a thin arrow over the background is still
  // easy to hit; a true miss clears the halo, label, and panel. handleSelect owns
  // the label set so callers need no separate fallback.
  // While the guided tour is on screen, a tap on the brain is inert: the tour
  // drives selection itself, and a stray pick would derail it. Dragging to rotate
  // never reaches here (it fails the movement threshold), and wheel/pinch zoom is
  // untouched, so the brain still moves. Checked via the overlay's own visibility
  // so the 3D wiring stays decoupled from the tour module.
  const tourOnScreen = () => {
    const tr = document.getElementById("tour-root");
    return !!(tr && !tr.hidden);
  };
  const handleSelect = (clientX, clientY) => {
    if (tourOnScreen()) return false;
    const structHit = pickStructureHit(clientX, clientY);
    const arrowHit = pickVisibleArrowHit(clientX, clientY);
    let arrow = null;
    if (arrowHit && (!structHit || arrowHit.distance <= structHit.distance)) {
      arrow = arrowHit.arrow; // a visible arrow is at/in front of the structure
    } else if (!structHit) {
      // Nothing visible under the point: let the fat pick hull catch a thin arrow.
      arrow = pickArrowAt(clientX, clientY);
    }
    if (arrow) {
      selectConnection(arrow); // plain click: no camera move
      return true;
    }
    const mesh = structHit ? structHit.object : null;
    if (mesh) {
      // A structure opens its own panel (name, group, connections).
      selectStructure(mesh);
    } else {
      // A true miss on empty space clears the halo + label and deselects to the
      // Settings tab (the opened detail tabs stay in the strip as history).
      selection.select(null);
      labels.setHovered(null);
      tabs.showSettings();
    }
    return true;
  };

  // Hover picking. When a focus is active (a halo'd structure, an isolated set,
  // a circuit, a receptor's regions, ...), a focused region the ray passes
  // through wins even when a non-focused region sits nearer the camera, so the
  // thing you focused always names *itself* on hover rather than whatever happens
  // to occlude it (e.g. an isolated deep nucleus hidden behind the dimmed
  // cortex). With nothing focused this is just the nearest visible structure.
  const pickHover = (clientX, clientY) => {
    setPointer(clientX, clientY);
    const hits = raycaster.intersectObjects(meshes, false);
    const focus = selection.getSelected();
    if (focus && focus.meshes.size) {
      for (const hit of hits) {
        if (hit.object.visible && focus.meshes.has(hit.object)) return hit.object;
      }
    }
    for (const hit of hits) if (hit.object.visible) return hit.object;
    return null;
  };

  // Mouse: hover a region to reveal its name. Mouse-only so that touch-drag
  // rotation doesn't flicker labels (touch uses tap, below).
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    labels.setHovered(pickHover(event.clientX, event.clientY));
  });
  canvas.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse") labels.setHovered(null);
  });

  // Mouse click (a press + release that didn't drag) selects: an arrow opens its
  // info panel, a miss closes it. Thresholds on movement/time so dragging to
  // rotate (OrbitControls) is never mistaken for a click.
  let mouseDown = null;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") {
      mouseDown = { x: event.clientX, y: event.clientY, t: performance.now() };
    }
  });
  canvas.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "mouse" || !mouseDown) return;
    const moved = Math.hypot(event.clientX - mouseDown.x, event.clientY - mouseDown.y);
    const elapsed = performance.now() - mouseDown.t;
    mouseDown = null;
    if (moved < 6 && elapsed < 500) handleSelect(event.clientX, event.clientY);
  });

  // Touch: a tap on a structure reveals its name; a tap on empty space clears
  // it. A tap is a single finger pressed and released with little movement, so
  // it never competes with one-finger rotate or two-finger pan/zoom (those move
  // too far, or involve a second finger, and are ignored here).
  let tapStart = null;
  let touchPointers = 0;
  let gestureMultiTouch = false;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") return;
    touchPointers += 1;
    if (touchPointers > 1) {
      // A second finger means this is a pan/zoom gesture, not a tap.
      gestureMultiTouch = true;
      tapStart = null;
      return;
    }
    gestureMultiTouch = false;
    tapStart = { x: event.clientX, y: event.clientY, t: performance.now() };
  });
  canvas.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "touch") return;
    touchPointers = Math.max(0, touchPointers - 1);
    const start = tapStart;
    const wasMultiTouch = gestureMultiTouch;
    if (touchPointers === 0) {
      gestureMultiTouch = false;
      tapStart = null;
    }
    if (wasMultiTouch || !start) return;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    const elapsed = performance.now() - start.t;
    if (moved < 12 && elapsed < 400) {
      // An arrow tap opens its info panel; otherwise the structure under the tap
      // is haloed + named (and a tap on empty space clears everything).
      // handleSelect owns all of that, so there is no separate fallback.
      handleSelect(event.clientX, event.clientY);
    }
  });
  canvas.addEventListener("pointercancel", (event) => {
    if (event.pointerType !== "touch") return;
    touchPointers = Math.max(0, touchPointers - 1);
    if (touchPointers === 0) {
      gestureMultiTouch = false;
      tapStart = null;
    }
  });

  return { tourOnScreen };
}
