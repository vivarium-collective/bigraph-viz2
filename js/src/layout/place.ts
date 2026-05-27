import type { SpecNode, NodeId, LayoutNode, BBox, RowsOverride } from "../types";
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
): Map<NodeId, LayoutNode> {
  const byId = new Map<NodeId, LayoutNode>();
  const rootSz = sizes.get(root.id)!;
  placeNode(root, 0, 0, rootSz.w, rootSz.h, sizes, collapsed, maxRowWidth, byId, rowsOverride);
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
): void {
  const bbox: BBox = { x, y, w, h };
  byId.set(node.id, { node, bbox, collapsed: collapsed.has(node.id) });
  if (node.kind !== "store" || collapsed.has(node.id)) return;

  const contentX = x + STORE_PAD;
  const contentY = y + STORE_HEADER + STORE_PAD;
  const { rows, explicit } = effectiveRows(node, rowsOverride);

  if (explicit) {
    // Honor user's rows verbatim.
    let cursorY = contentY;
    for (const row of rows) {
      let cursorX = contentX;
      let rowH = 0;
      for (const child of row) {
        const cs = sizes.get(child.id)!;
        placeNode(child, cursorX, cursorY, cs.w, cs.h, sizes, collapsed, maxRowWidth, byId, rowsOverride);
        cursorX += cs.w + CHILD_GAP_X;
        rowH = Math.max(rowH, cs.h);
      }
      cursorY += rowH + CHILD_GAP_Y;
    }
    return;
  }

  // Auto-wrap path.
  let curRowX = contentX, curRowY = contentY, curRowH = 0;
  for (const child of node.children) {
    const cs = sizes.get(child.id)!;
    if (curRowX > contentX && (curRowX + cs.w) > (x + w - STORE_PAD)) {
      curRowX = contentX;
      curRowY += curRowH + CHILD_GAP_Y;
      curRowH = 0;
    }
    placeNode(child, curRowX, curRowY, cs.w, cs.h, sizes, collapsed, maxRowWidth, byId, rowsOverride);
    curRowX += cs.w + CHILD_GAP_X;
    curRowH = Math.max(curRowH, cs.h);
  }
}
