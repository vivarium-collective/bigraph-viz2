import type { SpecNode, NodeId } from "../types";
import {
  VAR_W, VAR_H, PROC_W, PROC_H, STORE_PAD, STORE_HEADER,
  CHILD_GAP_X, CHILD_GAP_Y,
} from "./constants";

const CHIP_W = 140;
const CHIP_H = 56;

export type Sizes = Map<NodeId, { w: number; h: number }>;

export function measure(
  root: SpecNode,
  collapsed: Set<NodeId>,
  maxRowWidth: number
): Sizes {
  const sizes: Sizes = new Map();
  visit(root, collapsed, maxRowWidth, sizes);
  return sizes;
}

function visit(
  node: SpecNode,
  collapsed: Set<NodeId>,
  maxRowWidth: number,
  sizes: Sizes
): { w: number; h: number } {
  if (node.kind === "variable") {
    const sz = { w: VAR_W, h: VAR_H };
    sizes.set(node.id, sz);
    return sz;
  }
  if (node.kind === "process") {
    const sz = { w: PROC_W, h: PROC_H };
    sizes.set(node.id, sz);
    return sz;
  }
  // store
  if (collapsed.has(node.id)) {
    const sz = { w: CHIP_W, h: CHIP_H };
    sizes.set(node.id, sz);
    return sz;
  }
  // measure all children first
  const childSizes = node.children.map(c => ({
    id: c.id,
    sz: visit(c, collapsed, maxRowWidth, sizes),
  }));
  // pack rows: left-to-right wrapping when row width exceeds maxRowWidth
  let curRowW = 0, curRowH = 0;
  let totalW = 0, totalH = 0;
  for (const { sz } of childSizes) {
    const wantW = curRowW === 0 ? sz.w : curRowW + CHILD_GAP_X + sz.w;
    if (curRowW > 0 && wantW > maxRowWidth) {
      // start a new row
      totalW = Math.max(totalW, curRowW);
      totalH += (totalH > 0 ? CHILD_GAP_Y : 0) + curRowH;
      curRowW = sz.w;
      curRowH = sz.h;
    } else {
      curRowW = wantW;
      curRowH = Math.max(curRowH, sz.h);
    }
  }
  // flush last row
  if (curRowW > 0) {
    totalW = Math.max(totalW, curRowW);
    totalH += (totalH > 0 ? CHILD_GAP_Y : 0) + curRowH;
  }
  const sz = {
    w: totalW + 2 * STORE_PAD,
    h: totalH + STORE_HEADER + 2 * STORE_PAD,
  };
  sizes.set(node.id, sz);
  return sz;
}
