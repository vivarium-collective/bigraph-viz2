export function attachPanZoom(svg: SVGSVGElement, rootG: SVGGElement): () => void {
  let tx = 0, ty = 0, s = 1;
  let dragging = false, startX = 0, startY = 0, startTx = 0, startTy = 0;

  function apply() { rootG.setAttribute("transform", `translate(${tx},${ty}) scale(${s})`); }
  apply();

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newS = Math.max(0.25, Math.min(4, s * factor));
    const rect = svg.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    // zoom around cursor
    tx = cx - (cx - tx) * (newS / s);
    ty = cy - (cy - ty) * (newS / s);
    s = newS;
    apply();
  }
  function onDown(e: MouseEvent) {
    if (e.button !== 0) return;
    // ignore drags that start on a node (selection/dblclick own those)
    const target = e.target as Element;
    if (target.closest && target.closest(".bgv2-node")) return;
    dragging = true;
    startX = e.clientX; startY = e.clientY; startTx = tx; startTy = ty;
  }
  function onMove(e: MouseEvent) {
    if (!dragging) return;
    tx = startTx + (e.clientX - startX);
    ty = startTy + (e.clientY - startY);
    apply();
  }
  function onUp() { dragging = false; }

  svg.addEventListener("wheel", onWheel, { passive: false });
  svg.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);

  return () => {
    svg.removeEventListener("wheel", onWheel);
    svg.removeEventListener("mousedown", onDown);
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };
}
