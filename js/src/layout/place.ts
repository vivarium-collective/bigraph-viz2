import type { SpecNode, NodeId, LayoutNode, BBox, RowsOverride, PosOverride } from "../types";
import type { Sizes } from "./measure";
import {
  STORE_PAD, STORE_HEADER, CHILD_GAP_X, CHILD_GAP_Y,
} from "./constants";
import { effectiveRows } from "./order";

export function place(
  root: SpecNode,
  sizes: Sizes,
  collapsed: Set<NodeId>,
  maxRowWidth: number,
  rowsOverride?: RowsOverride,
  deleted?: Set<NodeId>,
  posOverride?: PosOverride,
): Map<NodeId, LayoutNode> {
  const byId = new Map<NodeId, LayoutNode>();
  const rootSz = sizes.get(root.id)!;
  placeNode(root, 0, 0, rootSz.w, rootSz.h, sizes, collapsed, maxRowWidth, byId, rowsOverride, deleted, posOverride);
  return byId;
}

function placeNode(
  node: SpecNode,
  x: number, y: number, w: number, h: number,
  sizes: Sizes,
  collapsed: Set<NodeId>,
  maxRowWidth: number,
  byId: Map<NodeId, LayoutNode>,
  rowsOverride?: RowsOverride,
  deleted?: Set<NodeId>,
  posOverride?: PosOverride,
): void {
  const bbox: BBox = { x, y, w, h };
  byId.set(node.id, { node, bbox, collapsed: collapsed.has(node.id) });
  if (node.kind !== "store" || collapsed.has(node.id)) return;

  const contentX = x + STORE_PAD;
  const contentY = y + STORE_HEADER + STORE_PAD;
  const isFree = (id: NodeId) => !!posOverride?.has(id);
  const { rows: rowsAll, explicit } = effectiveRows(node, rowsOverride);
  const rows = (deleted || posOverride)
    ? rowsAll.map(r => r.filter(c => !deleted?.has(c.id) && !isFree(c.id))).filter(r => r.length > 0)
    : rowsAll;

  // Free-positioned children: placed absolutely at the parent's content origin
  // plus their clamped (>= 0) local position, so they stay inside this parent.
  const placeFree = () => {
    if (!posOverride) return;
    for (const child of node.children) {
      if (deleted?.has(child.id)) continue;
      const pos = posOverride.get(child.id);
      if (!pos) continue;
      const cs = sizes.get(child.id)!;
      placeNode(child, contentX + Math.max(0, pos.x), contentY + Math.max(0, pos.y),
                cs.w, cs.h, sizes, collapsed, maxRowWidth, byId, rowsOverride, deleted, posOverride);
    }
  };

  if (explicit) {
    // Honor user's rows verbatim.
    let cursorY = contentY;
    for (const row of rows) {
      let cursorX = contentX;
      let rowH = 0;
      for (const child of row) {
        const cs = sizes.get(child.id)!;
        placeNode(child, cursorX, cursorY, cs.w, cs.h, sizes, collapsed, maxRowWidth, byId, rowsOverride, deleted, posOverride);
        cursorX += cs.w + CHILD_GAP_X;
        rowH = Math.max(rowH, cs.h);
      }
      cursorY += rowH + CHILD_GAP_Y;
    }
    placeFree();
    return;
  }

  // Auto-wrap path (free-positioned children excluded from the flow).
  let curRowX = contentX, curRowY = contentY, curRowH = 0;
  const visibleChildren = node.children.filter(c => !deleted?.has(c.id) && !isFree(c.id));
  for (const child of visibleChildren) {
    const cs = sizes.get(child.id)!;
    if (curRowX > contentX && (curRowX + cs.w) > (x + w - STORE_PAD)) {
      curRowX = contentX;
      curRowY += curRowH + CHILD_GAP_Y;
      curRowH = 0;
    }
    placeNode(child, curRowX, curRowY, cs.w, cs.h, sizes, collapsed, maxRowWidth, byId, rowsOverride, deleted, posOverride);
    curRowX += cs.w + CHILD_GAP_X;
    curRowH = Math.max(curRowH, cs.h);
  }
  placeFree();
}
