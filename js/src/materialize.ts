import type { SpecNode, NodeId, WirePath } from "./types";

/**
 * Walk every process port and synthesize any store/variable that its wire
 * path references but isn't already present in the tree. Each segment along
 * the path becomes a synthetic store; the final segment becomes a synthetic
 * variable. Synthetic nodes are flagged so the renderer can style them
 * differently (we render them with a dashed outline).
 *
 * This gives a viewable approximation of what `process_bigraph.Composite`
 * would materialize at instantiation time, without requiring all the spec's
 * custom process types to be registered.
 *
 * The tree is mutated in place. Re-running is a no-op (existing nodes are
 * reused).
 */
export function materializeWireTargets(root: SpecNode): void {
  const parents = buildParentIndex(root);

  // Collect processes first; mutating during walk would re-trigger on new nodes.
  const processes: SpecNode[] = [];
  collectProcesses(root, processes);

  for (const proc of processes) {
    const procParent = parents.get(proc.id);
    if (!procParent) continue;
    for (const path of Object.values(proc.ports ?? {})) {
      ensurePath(root, procParent, path, parents);
    }
  }
}

function collectProcesses(node: SpecNode, out: SpecNode[]): void {
  if (node.kind === "process") out.push(node);
  for (const c of node.children) collectProcesses(c, out);
}

function buildParentIndex(root: SpecNode): Map<NodeId, SpecNode> {
  const m = new Map<NodeId, SpecNode>();
  function visit(node: SpecNode) {
    for (const c of node.children) {
      m.set(c.id, node);
      visit(c);
    }
  }
  visit(root);
  return m;
}

function ensurePath(
  root: SpecNode,
  startStore: SpecNode,
  path: WirePath,
  parents: Map<NodeId, SpecNode>,
): void {
  let cursor: SpecNode = startStore;
  for (let i = 0; i < path.length; i++) {
    const seg = path[i];
    if (seg === "..") {
      const p = parents.get(cursor.id);
      if (!p) return;
      cursor = p;
      continue;
    }
    if (seg === ".") continue;
    let child = cursor.children.find(c => c.name === seg);
    if (!child) {
      const isLast = i === path.length - 1;
      child = {
        id: cursor.id ? `${cursor.id}/${seg}` : seg,
        name: seg,
        kind: isLast ? "variable" : "store",
        children: [],
        synthetic: true,
      };
      cursor.children.push(child);
      parents.set(child.id, cursor);
      // keep the store children sorted (stores → processes → variables), with
      // synthetics taking the natural position for their kind
      cursor.children.sort((a, b) => kindRank(a.kind) - kindRank(b.kind));
    }
    cursor = child;
  }
}

function kindRank(k: SpecNode["kind"]): number {
  return k === "store" ? 0 : k === "process" ? 1 : 2;
}
