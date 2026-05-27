const DRAG_THRESHOLD = 4;  // px before mousedown→mousemove counts as a pan, not a click

export interface PanZoomOpts {
  /** Returns true when a node-drag gesture is in progress; pan should bail. */
  isLocked?: () => boolean;
}

export function attachPanZoom(svg: SVGSVGElement, rootG: SVGGElement, opts: PanZoomOpts = {}): () => void {
  let tx = 0, ty = 0, s = 1;
  let armed = false, didMove = false;
  let startX = 0, startY = 0, startTx = 0, startTy = 0;

  function apply() {
    rootG.setAttribute("transform", `translate(${tx},${ty}) scale(${s})`);
  }
  apply();
  svg.style.cursor = "grab";

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newS = Math.max(0.25, Math.min(4, s * factor));
    const rect = svg.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    tx = cx - (cx - tx) * (newS / s);
    ty = cy - (cy - ty) * (newS / s);
    s = newS;
    apply();
  }

  function onDown(e: MouseEvent) {
    if (e.button !== 0) return;
    if (opts.isLocked && opts.isLocked()) return;
    // Any plain drag arms a pan; distinguishing click vs pan happens in onMove.
    armed = true;
    didMove = false;
    startX = e.clientX; startY = e.clientY;
    startTx = tx; startTy = ty;
  }

  function onMove(e: MouseEvent) {
    if (!armed) return;
    // If a drag gesture took over (e.g. long-press fired), give up the pan.
    if (opts.isLocked && opts.isLocked()) { armed = false; didMove = false; svg.style.cursor = "grab"; return; }
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!didMove && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
      didMove = true;
      svg.style.cursor = "grabbing";
    }
    if (didMove) {
      tx = startTx + dx;
      ty = startTy + dy;
      apply();
    }
  }

  function onUp() {
    if (!armed) return;
    armed = false;
    svg.style.cursor = "grab";
    // Note: didMove stays true through the next click event so onClickCapture
    // can suppress it. It's reset by onClickCapture itself.
  }

  // Capture-phase click handler: if the user just panned, swallow the click
  // event so the selection/inspector doesn't fire spuriously.
  function onClickCapture(e: MouseEvent) {
    if (didMove) {
      e.stopImmediatePropagation();
      e.preventDefault();
      didMove = false;
    }
  }

  svg.addEventListener("wheel", onWheel, { passive: false });
  svg.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  svg.addEventListener("click", onClickCapture, true);

  return () => {
    svg.removeEventListener("wheel", onWheel);
    svg.removeEventListener("mousedown", onDown);
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    svg.removeEventListener("click", onClickCapture, true);
    svg.style.cursor = "";
  };
}
