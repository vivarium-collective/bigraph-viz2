import type { SpecNode, NodeId, LayoutResult, RowsOverride } from "../types";
import { measure } from "./measure";
import { place } from "./place";
import { routeWires } from "../wires/route";

export function layout(
  root: SpecNode,
  collapsed: Set<NodeId>,
  maxRowWidth: number,
  rowsOverride?: RowsOverride,
): LayoutResult {
  const sizes = measure(root, collapsed, maxRowWidth, rowsOverride);
  const byId = place(root, sizes, collapsed, maxRowWidth, rowsOverride);
  const wires = routeWires(root, byId, collapsed);
  return { byId, root: byId.get(root.id)!, wires };
}
