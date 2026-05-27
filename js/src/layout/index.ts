import type { SpecNode, NodeId, LayoutResult, RowsOverride } from "../types";
import { measure } from "./measure";
import { place } from "./place";
import { routeWires } from "../wires/route";

export function layout(
  root: SpecNode,
  collapsed: Set<NodeId>,
  maxRowWidth: number,
  rowsOverride?: RowsOverride,
  deleted?: Set<NodeId>,
): LayoutResult {
  const sizes = measure(root, collapsed, maxRowWidth, rowsOverride, deleted);
  const byId = place(root, sizes, collapsed, maxRowWidth, rowsOverride, deleted);
  const wires = routeWires(root, byId, collapsed)
    .filter(w => !(deleted && (deleted.has(w.processId) || deleted.has(w.targetId))));
  return { byId, root: byId.get(root.id)!, wires };
}
