import type { SpecNode, NodeId, RowsOverride } from "../types";
import {
  VAR_W, VAR_H, PROC_W, PROC_H, STORE_PAD, STORE_HEADER,
  CHILD_GAP_X, CHILD_GAP_Y,
} from "./constants";
import { effectiveRows } from "./order";

const CHIP_W = 140;
const CHIP_H = 56;

export type Sizes = Map<NodeId, { w: number; h: number }>;

export function measure(
  root: SpecNode,
  collapsed: Set<NodeId>,
  maxRowWidth: number,
  rowsOverride?: RowsOverride,
): Sizes {
  const sizes: Sizes = new Map();
  visit(root, collapsed, maxRowWidth, sizes, rowsOverride);
  return sizes;
}

function visit(
  node: SpecNode,
  collapsed: Set<NodeId>,
  maxRowWidth: number,
  sizes: Sizes,
  rowsOverride?: RowsOverride,
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
  if (collapsed.has(node.id)) {
    const sz = { w: CHIP_W, h: CHIP_H };
    sizes.set(node.id, sz);
    return sz;
  }

  // Recurse first so all child sizes are known.
  for (const c of node.children) visit(c, collapsed, maxRowWidth, sizes, rowsOverride);

  const { rows, explicit } = effectiveRows(node, rowsOverride);
  let totalW = 0, totalH = 0;

  if (explicit) {
    // Honor the user's rows verbatim — no auto-wrap.
    for (const row of rows) {
      const rowW = sumRowWidth(row, sizes);
      const rowH = maxRowHeight(row, sizes);
      totalW = Math.max(totalW, rowW);
      totalH += (totalH > 0 ? CHILD_GAP_Y : 0) + rowH;
    }
  } else {
    // Auto-wrap based on max_row_width.
    let curRowW = 0, curRowH = 0;
    for (const child of node.children) {
      const sz = sizes.get(child.id)!;
      const wantW = curRowW === 0 ? sz.w : curRowW + CHILD_GAP_X + sz.w;
      if (curRowW > 0 && wantW > maxRowWidth) {
        totalW = Math.max(totalW, curRowW);
        totalH += (totalH > 0 ? CHILD_GAP_Y : 0) + curRowH;
        curRowW = sz.w;
        curRowH = sz.h;
      } else {
        curRowW = wantW;
        curRowH = Math.max(curRowH, sz.h);
      }
    }
    if (curRowW > 0) {
      totalW = Math.max(totalW, curRowW);
      totalH += (totalH > 0 ? CHILD_GAP_Y : 0) + curRowH;
    }
  }

  const sz = {
    w: totalW + 2 * STORE_PAD,
    h: totalH + STORE_HEADER + 2 * STORE_PAD,
  };
  sizes.set(node.id, sz);
  return sz;
}

function sumRowWidth(row: SpecNode[], sizes: Sizes): number {
  if (row.length === 0) return 0;
  let w = 0;
  for (let i = 0; i < row.length; i++) {
    w += sizes.get(row[i].id)!.w;
    if (i > 0) w += CHILD_GAP_X;
  }
  return w;
}

function maxRowHeight(row: SpecNode[], sizes: Sizes): number {
  let h = 0;
  for (const c of row) h = Math.max(h, sizes.get(c.id)!.h);
  return h;
}
