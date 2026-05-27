import type { SpecNode, NodeId, LayoutNode, ResolvedWire } from "../types";
import { resolveWirePath } from "./lookup";
import { chooseEdge } from "./ports";
import type { Edge } from "./ports";

export function routeWires(
  root: SpecNode,
  byId: Map<NodeId, LayoutNode>,
  collapsed: Set<NodeId>
): ResolvedWire[] {
  const wires: ResolvedWire[] = [];
  walkProcesses(root, (proc) => {
    const portEntries = Object.entries(proc.ports ?? {});
    const procLayout = byId.get(proc.id);
    if (!procLayout) return;
    const procBox = procLayout.bbox;
    const resolved: Array<{
      portName: string; targetId: NodeId; retargeted: boolean; tcx: number; tcy: number;
    }> = [];
    for (const [portName, path] of portEntries) {
      const tgt = resolveWirePath(root, proc, path);
      if (!tgt) continue;
      const { id: effectiveId, retargeted } = retargetIfHidden(tgt, collapsed);
      const ln = byId.get(effectiveId);
      if (!ln) continue;
      const tcx = ln.bbox.x + ln.bbox.w / 2;
      const tcy = ln.bbox.y + ln.bbox.h / 2;
      resolved.push({ portName, targetId: effectiveId, retargeted, tcx, tcy });
    }
    // bucket by chosen edge (kept here for future even-spacing use; current
    // renderer draws all ports at edge midpoint per the v1 deferral).
    const byEdge: Record<Edge, typeof resolved> = { top: [], bottom: [], left: [], right: [] };
    for (const r of resolved) byEdge[chooseEdge(procBox, r.tcx, r.tcy)].push(r);
    for (const e of ["top", "bottom", "left", "right"] as Edge[]) {
      for (const r of byEdge[e]) {
        wires.push({
          processId: proc.id,
          portName: r.portName,
          targetId: r.targetId,
          retargetedToChip: r.retargeted,
        });
      }
    }
  });
  return wires;
}

function walkProcesses(node: SpecNode, fn: (n: SpecNode) => void): void {
  if (node.kind === "process") fn(node);
  for (const c of node.children) walkProcesses(c, fn);
}

function retargetIfHidden(
  id: NodeId, collapsed: Set<NodeId>
): { id: NodeId; retargeted: boolean } {
  // walk up the dotted-path ancestors; if any is collapsed, return that ancestor
  let cur = id;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const i = cur.lastIndexOf("/");
    if (i < 0) return { id, retargeted: false };
    const parent = cur.slice(0, i);
    if (collapsed.has(parent)) {
      return { id: parent, retargeted: parent !== id };
    }
    cur = parent;
  }
}
