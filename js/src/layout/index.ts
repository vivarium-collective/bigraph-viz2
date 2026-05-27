import type { SpecNode, NodeId, LayoutResult } from "../types";
import { measure } from "./measure";
import { place } from "./place";

export function layout(
  root: SpecNode,
  collapsed: Set<NodeId>,
  maxRowWidth: number
): LayoutResult {
  const sizes = measure(root, collapsed, maxRowWidth);
  const byId = place(root, sizes, collapsed, maxRowWidth);
  return { byId, root: byId.get(root.id)!, wires: [] };  // wires filled in Task 9
}
