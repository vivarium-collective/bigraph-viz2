import type { LayoutResult, NodeId } from "../types";
import { STORE_PAD, STORE_HEADER } from "../layout/constants";

export interface DragGate {
  /** True while an Alt-drag gesture is mid-flight; pan + click bail when set. */
  isActive(): boolean;
}

/** Commit a free position for `nodeId` in its PARENT's content-local coordinates
 * (clamped >= 0 by the layout so it stays within the parent). */
export type RepositionCallback = (nodeId: NodeId, pos: { x: number; y: number }) => void;

/**
 * Alt + mousedown on a node enters drag mode immediately. The node follows the
 * cursor (a ghost), and on release it is FREE-POSITIONED at the drop point —
 * expressed relative to its parent's content origin and clamped to >= 0, so it
 * moves anywhere within its parent (its branch) but can never escape it. Esc
 * cancels.
 */
export function attachDragNode(
  svg: SVGSVGElement,
  lr: LayoutResult,
  onReposition: RepositionCallback,
  getSnap?: () => number,
): DragGate & { detach: () => void } {
  let dragging = false;
  let suppressClickUntil = 0;

  let dragNodeId: NodeId | null = null;
  let dragParentId: NodeId | null = null;
  let srcG: SVGGElement | null = null;
  let ghost: SVGGElement | null = null;
  let pressX = 0, pressY = 0;
  let nodeOrigin = { x: 0, y: 0 };  // dragged node's top-left in layout coords

  function onDown(e: MouseEvent) {
    if (e.button !== 0 || !e.altKey) return;
    const target = (e.target as Element).closest(".bgv2-node");
    if (!target) return;
    const id = target.getAttribute("data-bgv2-id");
    if (!id || !hasParent(id)) return;
    e.preventDefault();
    pressX = e.clientX; pressY = e.clientY;
    enterDrag(id, target as SVGGElement);
  }

  function onMove(e: MouseEvent) {
    if (!dragging || !ghost) return;
    const press = clientToSvg(svg, pressX, pressY);
    const cur = clientToSvg(svg, e.clientX, e.clientY);
    ghost.setAttribute("transform", `translate(${cur.x - press.x},${cur.y - press.y})`);
  }

  function onUp(e: MouseEvent) {
    if (!dragging) return;
    commitDrop(e);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape" && dragging) cleanupDrag();
  }

  function enterDrag(id: NodeId, g: SVGGElement) {
    const ln = lr.byId.get(id);
    if (!ln) return;
    dragging = true;
    dragNodeId = id;
    dragParentId = parentId(id);
    srcG = g;
    nodeOrigin = { x: ln.bbox.x, y: ln.bbox.y };
    g.setAttribute("opacity", "0.25");

    ghost = g.cloneNode(true) as SVGGElement;
    ghost.classList.add("bgv2-drag-ghost");
    ghost.setAttribute("opacity", "0.85");
    ghost.setAttribute("pointer-events", "none");
    ghost.setAttribute("transform", "translate(0,0)");
    g.parentNode!.appendChild(ghost);
    document.body.style.cursor = "grabbing";
  }

  function commitDrop(e: MouseEvent) {
    if (!dragNodeId || !dragParentId) { cleanupDrag(); return; }
    const parent = lr.byId.get(dragParentId);
    if (parent) {
      // Where the node's top-left lands, in layout coords.
      const press = clientToSvg(svg, pressX, pressY);
      const cur = clientToSvg(svg, e.clientX, e.clientY);
      const newX = nodeOrigin.x + (cur.x - press.x);
      const newY = nodeOrigin.y + (cur.y - press.y);
      // Express relative to the parent's content origin and clamp >= 0 so the
      // node stays within its parent. The layout grows the parent if needed.
      const contentX = parent.bbox.x + STORE_PAD;
      const contentY = parent.bbox.y + STORE_HEADER + STORE_PAD;
      // Optional snap-to-grid: round the parent-local position to the nearest
      // grid cell so dropped nodes align tidily.
      const grid = getSnap?.() ?? 0;
      const snap = (v: number) => (grid > 0 ? Math.round(v / grid) * grid : v);
      onReposition(dragNodeId, {
        x: Math.max(0, snap(newX - contentX)),
        y: Math.max(0, snap(newY - contentY)),
      });
    }
    cleanupDrag();
  }

  function cleanupDrag() {
    const wasDragging = dragging;
    dragging = false;
    if (srcG) { srcG.setAttribute("opacity", ""); srcG = null; }
    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
    ghost = null;
    dragNodeId = null;
    dragParentId = null;
    document.body.style.cursor = "";
    if (wasDragging) suppressClickUntil = performance.now() + 100;
  }

  function onClickCapture(e: MouseEvent) {
    if (dragging || performance.now() < suppressClickUntil) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }

  function hasParent(id: NodeId): boolean { return id.includes("/"); }
  function parentId(id: NodeId): NodeId | null {
    const i = id.lastIndexOf("/");
    return i < 0 ? null : id.slice(0, i);
  }

  svg.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  window.addEventListener("keydown", onKey);
  svg.addEventListener("click", onClickCapture, true);

  return {
    isActive: () => dragging || performance.now() < suppressClickUntil,
    detach: () => {
      cleanupDrag();
      svg.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("keydown", onKey);
      svg.removeEventListener("click", onClickCapture, true);
    },
  };
}

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  // Convert through the pan/zoom group's CTM so the math accounts for the
  // current camera (using the <svg> CTM only works at identity).
  const xformEl = (svg.querySelector(".bgv2-root") as SVGGraphicsElement | null) ?? svg;
  const ctm = xformEl.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}
