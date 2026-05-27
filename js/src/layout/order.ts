import type { SpecNode, NodeId, RowsOverride } from "../types";

/**
 * Resolve a parent's children into ordered rows.
 *
 * - If the parent has an explicit `RowsOverride`, return those rows verbatim,
 *   appending any children not listed (e.g. added since the override was
 *   captured) to a synthesized final row. The override disables auto row-wrap
 *   for this parent — placements are honored exactly.
 * - Otherwise, return a single row containing all children in declaration
 *   order; the packer will auto-wrap based on max_row_width.
 */
export function effectiveRows(
  node: SpecNode,
  rowsOverride?: RowsOverride,
): { rows: SpecNode[][]; explicit: boolean } {
  const override = rowsOverride?.get(node.id);
  if (!override) {
    return { rows: [node.children], explicit: false };
  }
  const byId = new Map<NodeId, SpecNode>(node.children.map(c => [c.id, c]));
  const claimed = new Set<NodeId>();
  const rows: SpecNode[][] = [];
  for (const rowIds of override) {
    const row: SpecNode[] = [];
    for (const id of rowIds) {
      const c = byId.get(id);
      if (c) { row.push(c); claimed.add(id); }
    }
    if (row.length > 0) rows.push(row);
  }
  const orphans = node.children.filter(c => !claimed.has(c.id));
  if (orphans.length > 0) rows.push(orphans);
  return { rows, explicit: true };
}
