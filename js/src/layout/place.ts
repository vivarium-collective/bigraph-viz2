import type { SpecNode, NodeId, LayoutNode, BBox } from "../types";
import type { Sizes } from "./measure";
import {
  STORE_PAD, STORE_HEADER, CHILD_GAP_X, CHILD_GAP_Y,
} from "./constants";

export function place(
  root: SpecNode,
  sizes: Sizes,
  collapsed: Set<NodeId>,
  maxRowWidth: number
): Map<NodeId, LayoutNode> {
  const byId = new Map<NodeId, LayoutNode>();
  const rootSz = sizes.get(root.id)!;
  placeNode(root, 0, 0, rootSz.w, rootSz.h, sizes, collapsed, maxRowWidth, byId);
  return byId;
}

function placeNode(
  node: SpecNode,
  x: number, y: number, w: number, h: number,
  sizes: Sizes,
  collapsed: Set<NodeId>,
  maxRowWidth: number,
  byId: Map<NodeId, LayoutNode>
): void {
  const bbox: BBox = { x, y, w, h };
  byId.set(node.id, { node, bbox, collapsed: collapsed.has(node.id) });
  if (node.kind !== "store" || collapsed.has(node.id)) return;

  // place children inside the content area
  const contentX = x + STORE_PAD;
  const contentY = y + STORE_HEADER + STORE_PAD;
  let curRowX = contentX, curRowY = contentY, curRowH = 0;
  for (const child of node.children) {
    const cs = sizes.get(child.id)!;
    if (curRowX > contentX && (curRowX + cs.w) > (x + w - STORE_PAD)) {
      curRowX = contentX;
      curRowY += curRowH + CHILD_GAP_Y;
      curRowH = 0;
    }
    placeNode(child, curRowX, curRowY, cs.w, cs.h, sizes, collapsed, maxRowWidth, byId);
    curRowX += cs.w + CHILD_GAP_X;
    curRowH = Math.max(curRowH, cs.h);
  }
}
