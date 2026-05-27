import type { SpecNode, NodeId } from "../types";
import { writeHash } from "../hash/sync";

export type CollapseCallback = (next: Set<NodeId>) => void;

export function attachCollapse(
  svg: SVGSVGElement,
  _root: SpecNode,
  vizId: string,
  current: Set<NodeId>,
  onChange: CollapseCallback,
): () => void {
  function onDbl(e: MouseEvent) {
    const target = (e.target as Element).closest(".bgv2-node");
    if (!target) return;
    const id = target.getAttribute("data-bgv2-id");
    if (!id) return;
    const kind = Array.from(target.classList).find(c => c.startsWith("bgv2-node-"))?.replace("bgv2-node-", "");
    if (kind === "variable") return;
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    writeHash(vizId, next);
    onChange(next);
  }
  svg.addEventListener("dblclick", onDbl);
  return () => svg.removeEventListener("dblclick", onDbl);
}
