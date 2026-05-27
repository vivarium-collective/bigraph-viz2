import type { SpecNode, NodeId, RowsOverride } from "../types";
import {
  VAR_W, VAR_H, PROC_W, PROC_H, STORE_PAD, STORE_HEADER,
  CHILD_GAP_X, CHILD_GAP_Y,
} from "./constants";
import { effectiveRows } from "./order";

const CHIP_W = 140;
const CHIP_H = 56;

// Width budget for leaf-cell labels so long variable/process names don't
// collide with their neighbors. Labels longer than the cap get ellipsized
// (see render code) with the full name on hover.
const VAR_LABEL_MAX = 180;
const PROC_LABEL_MAX = 300;
// Approximate glyph advance for the system-ui / monospace fonts we use at
// the relevant sizes (10 px and 11 px). Slightly generous so we don't clip.
const CHAR_W = 5.8;
const VAR_LABEL_PAD = 8;
const PROC_LABEL_PAD = 18;
const STORE_HEADER_LABEL_PAD = 28;

function estimateTextWidth(s: string, perChar = CHAR_W): number {
  if (!s) return 0;
  return s.length * perChar;
}

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
    const labelW = Math.min(estimateTextWidth(node.name) + VAR_LABEL_PAD, VAR_LABEL_MAX);
    const sz = { w: Math.max(VAR_W, labelW), h: VAR_H };
    sizes.set(node.id, sz);
    return sz;
  }
  if (node.kind === "process") {
    const nameW = estimateTextWidth(node.name, 6.6);
    const addrW = estimateTextWidth(node.address ?? "");
    const widestLabel = Math.min(Math.max(nameW, addrW) + PROC_LABEL_PAD, PROC_LABEL_MAX);
    const sz = { w: Math.max(PROC_W, widestLabel), h: PROC_H };
    sizes.set(node.id, sz);
    return sz;
  }
  if (collapsed.has(node.id)) {
    const chipNameW = estimateTextWidth(node.name) + 24;
    const sz = { w: Math.max(CHIP_W, chipNameW), h: CHIP_H };
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

  // Don't let the store header label crash into the right border for stores
  // whose name is wider than their content.
  const headerW = estimateTextWidth(node.name, 6.6) + STORE_HEADER_LABEL_PAD;
  const sz = {
    w: Math.max(totalW + 2 * STORE_PAD, headerW + 2 * STORE_PAD),
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
