import type { LayoutResult, NodeId, RowsOverride, LayoutNode } from "../types";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface DragGate {
  /** True while an Alt-drag gesture is mid-flight; pan + click bail when set. */
  isActive(): boolean;
}

export type ReorderCallback = (next: RowsOverride) => void;

/**
 * Alt + mousedown on a node enters drag mode immediately. Releasing in an
 * in-row slot drops the node into that row at that position; releasing in an
 * inter-row slot creates a new row for it. The packer honors the resulting
 * RowsOverride verbatim — no silent row-wrap.
 */
export function attachDragNode(
  svg: SVGSVGElement,
  lr: LayoutResult,
  current: RowsOverride,
  onReorder: ReorderCallback,
): DragGate & { detach: () => void } {
  let dragging = false;
  let suppressClickUntil = 0;

  let dragNodeId: NodeId | null = null;
  let dragParentId: NodeId | null = null;
  let srcG: SVGGElement | null = null;
  let ghost: SVGGElement | null = null;
  let slotIndicator: SVGRectElement | null = null;
  let dropSlots: Slot[] = [];
  let dropIndex = 0;
  let pressX = 0, pressY = 0;
  let ghostAnchor = { x: 0, y: 0 };

  function onDown(e: MouseEvent) {
    if (e.button !== 0 || !e.altKey) return;
    const target = (e.target as Element).closest(".bgv2-node");
    if (!target) return;
    const id = target.getAttribute("data-bgv2-id");
    if (!id || !hasParent(id)) return;
    e.preventDefault();
    pressX = e.clientX; pressY = e.clientY;
    enterDrag(id, target as SVGGElement, e);
  }

  function onMove(e: MouseEvent) {
    if (!dragging || !ghost) return;
    const svgPt = clientToSvg(svg, e.clientX, e.clientY);
    ghost.setAttribute(
      "transform",
      `translate(${svgPt.x - ghostAnchor.x},${svgPt.y - ghostAnchor.y})`,
    );
    updateSlotHighlight(svgPt.x, svgPt.y);
  }

  function onUp() {
    if (dragging) commitDrop();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape" && dragging) cleanupDrag();
  }

  function enterDrag(id: NodeId, g: SVGGElement, e: MouseEvent) {
    const ln = lr.byId.get(id);
    if (!ln) return;
    dragging = true;
    dragNodeId = id;
    dragParentId = parentId(id);
    srcG = g;
    g.setAttribute("opacity", "0.25");

    ghost = g.cloneNode(true) as SVGGElement;
    ghost.classList.add("bgv2-drag-ghost");
    ghost.setAttribute("opacity", "0.75");
    ghost.setAttribute("pointer-events", "none");
    g.parentNode!.appendChild(ghost);

    const pressSvg = clientToSvg(svg, pressX, pressY);
    ghostAnchor = pressSvg;
    const initSvg = clientToSvg(svg, e.clientX, e.clientY);
    ghost.setAttribute(
      "transform",
      `translate(${initSvg.x - pressSvg.x},${initSvg.y - pressSvg.y})`,
    );

    dropSlots = computeSlots(lr, dragParentId!, id, current);
    dropIndex = dropSlots.findIndex(s => s.isOriginal);
    if (dropIndex < 0) dropIndex = 0;

    slotIndicator = document.createElementNS(SVG_NS, "rect") as SVGRectElement;
    slotIndicator.classList.add("bgv2-drag-slot");
    slotIndicator.setAttribute("rx", "3");
    g.parentNode!.appendChild(slotIndicator);
    paintSlot();
    document.body.style.cursor = "grabbing";
  }

  function updateSlotHighlight(svgX: number, svgY: number) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < dropSlots.length; i++) {
      const s = dropSlots[i];
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      const d = Math.hypot(cx - svgX, cy - svgY);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best !== dropIndex) { dropIndex = best; paintSlot(); }
  }

  function paintSlot() {
    if (!slotIndicator) return;
    const s = dropSlots[dropIndex];
    if (!s) return;
    slotIndicator.setAttribute("x", String(s.x));
    slotIndicator.setAttribute("y", String(s.y));
    slotIndicator.setAttribute("width",  String(s.w));
    slotIndicator.setAttribute("height", String(s.h));
  }

  function commitDrop() {
    if (!dragNodeId || !dragParentId) { cleanupDrag(); return; }
    const parent = lr.byId.get(dragParentId)?.node;
    const slot = dropSlots[dropIndex];
    if (parent && slot && !slot.isOriginal) {
      // Start from current rows (override OR snapshot from current layout)
      const rows = startingRows(lr, parent.id, current);
      // Remove dragged from every row.
      for (const row of rows) {
        const i = row.indexOf(dragNodeId);
        if (i >= 0) row.splice(i, 1);
      }
      // Drop empty rows.
      const compacted = rows.filter(r => r.length > 0);
      // Apply the placement.
      if (slot.newRow) {
        compacted.splice(slot.rowIndex, 0, [dragNodeId]);
      } else {
        const target = compacted[slot.rowIndex] ?? [];
        const insertAt = Math.max(0, Math.min(slot.posInRow, target.length));
        if (compacted[slot.rowIndex]) {
          compacted[slot.rowIndex].splice(insertAt, 0, dragNodeId);
        } else {
          compacted.push([dragNodeId]);
        }
      }
      const next = new Map(current);
      next.set(parent.id, compacted);
      onReorder(next);
    }
    cleanupDrag();
  }

  function cleanupDrag() {
    const wasDragging = dragging;
    dragging = false;
    if (srcG) { srcG.setAttribute("opacity", ""); srcG = null; }
    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
    ghost = null;
    if (slotIndicator && slotIndicator.parentNode) slotIndicator.parentNode.removeChild(slotIndicator);
    slotIndicator = null;
    dragNodeId = null;
    dragParentId = null;
    dropSlots = [];
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

interface Slot {
  x: number; y: number; w: number; h: number;
  rowIndex: number;     // index in the rows[] list (post-removal of dragged)
  posInRow: number;     // index within the row (ignored if newRow)
  newRow: boolean;      // true → insert as a new row at rowIndex
  isOriginal: boolean;  // matches the dragged node's current placement
}

/** Snapshot the current rows for a parent from the override (if any) or the
 *  current layout's bbox.y grouping. */
function startingRows(
  lr: LayoutResult, parentId: NodeId, current: RowsOverride,
): NodeId[][] {
  const explicit = current.get(parentId);
  if (explicit) return explicit.map(row => [...row]);
  const parent = lr.byId.get(parentId)?.node;
  if (!parent) return [];
  return inferRowsFromLayout(parent.children.map(c => lr.byId.get(c.id)!));
}

/** Group LayoutNodes into rows by Y proximity, sort each row by X. */
function inferRowsFromLayout(siblings: LayoutNode[]): NodeId[][] {
  const rows: LayoutNode[][] = [];
  for (const s of siblings) {
    const r = rows.find(row => Math.abs(row[0].bbox.y - s.bbox.y) < 4);
    if (r) r.push(s); else rows.push([s]);
  }
  rows.forEach(row => row.sort((a, b) => a.bbox.x - b.bbox.x));
  rows.sort((a, b) => a[0].bbox.y - b[0].bbox.y);
  return rows.map(row => row.map(n => n.node.id));
}

function computeSlots(
  lr: LayoutResult,
  parentId: NodeId,
  dragId: NodeId,
  current: RowsOverride,
): Slot[] {
  // Snapshot the rows pre-drag (from override or inferred), then remove the
  // dragged node from all rows. The user's drop chooses (rowIndex, posInRow)
  // in this filtered structure.
  const rowsRaw = startingRows(lr, parentId, current);
  const originalLoc = findInRows(rowsRaw, dragId);
  const rowsFiltered = rowsRaw
    .map(row => row.filter(id => id !== dragId))
    .filter(row => row.length > 0);

  const slots: Slot[] = [];

  // For each row, compute the row's bbox (using layout positions) so slot
  // rectangles can sit at the right place visually.
  const rowExtents = rowsFiltered.map(row => extent(row, lr));
  if (rowExtents.length === 0) return slots;

  // Inter-row slot ABOVE the first row.
  {
    const ext = rowExtents[0];
    slots.push({
      x: ext.x, y: ext.y - 16, w: ext.w, h: 8,
      rowIndex: 0, posInRow: 0, newRow: true,
      isOriginal: originalLoc.newRow && originalLoc.rowIndex === 0,
    });
  }

  for (let r = 0; r < rowsFiltered.length; r++) {
    const row = rowsFiltered[r];
    const ext = rowExtents[r];

    // In-row slots: before first, between each pair, after last.
    for (let p = 0; p <= row.length; p++) {
      let slotX: number, slotY: number, slotH: number;
      if (p === 0) {
        const sib = lr.byId.get(row[0])!;
        slotX = sib.bbox.x - 14; slotY = sib.bbox.y; slotH = sib.bbox.h;
      } else if (p === row.length) {
        const sib = lr.byId.get(row[row.length - 1])!;
        slotX = sib.bbox.x + sib.bbox.w + 6; slotY = sib.bbox.y; slotH = sib.bbox.h;
      } else {
        const left = lr.byId.get(row[p - 1])!;
        slotX = left.bbox.x + left.bbox.w + 4; slotY = left.bbox.y; slotH = left.bbox.h;
      }
      slots.push({
        x: slotX, y: slotY, w: 8, h: slotH,
        rowIndex: r, posInRow: p, newRow: false,
        isOriginal: !originalLoc.newRow
          && originalLoc.rowIndex === r
          && originalLoc.posInRow === p,
      });
    }

    // Inter-row slot BELOW this row.
    const nextExt = rowExtents[r + 1];
    const yMid = nextExt
      ? (ext.y + ext.h + nextExt.y) / 2 - 4
      : ext.y + ext.h + 8;
    slots.push({
      x: ext.x, y: yMid, w: ext.w, h: 8,
      rowIndex: r + 1, posInRow: 0, newRow: true,
      isOriginal: originalLoc.newRow && originalLoc.rowIndex === r + 1,
    });
  }

  return slots;
}

function extent(rowIds: NodeId[], lr: LayoutResult): { x: number; y: number; w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of rowIds) {
    const b = lr.byId.get(id)!.bbox;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

interface OriginalLoc {
  rowIndex: number;
  posInRow: number;
  newRow: boolean;   // if true, the original lived ALONE in its row (so the equivalent slot is a between-rows slot at this rowIndex)
}

function findInRows(rows: NodeId[][], id: NodeId): OriginalLoc {
  for (let r = 0; r < rows.length; r++) {
    const p = rows[r].indexOf(id);
    if (p >= 0) {
      const alone = rows[r].length === 1;
      return { rowIndex: r, posInRow: p, newRow: alone };
    }
  }
  return { rowIndex: 0, posInRow: 0, newRow: false };
}

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const pt = svg.createSVGPoint();
  pt.x = clientX; pt.y = clientY;
  // Slots/ghost live in the layout coordinate space INSIDE the pan/zoom group
  // (.bgv2-root). Use that group's screen CTM so the conversion accounts for
  // the current pan & zoom — using the <svg>'s CTM only works at identity.
  const xformEl = (svg.querySelector(".bgv2-root") as SVGGraphicsElement | null) ?? svg;
  const ctm = xformEl.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}
