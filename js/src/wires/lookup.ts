import type { SpecNode, NodeId, WirePath } from "../types";

export function findNode(root: SpecNode, id: NodeId): SpecNode | null {
  if (root.id === id) return root;
  for (const c of root.children) {
    const found = findNode(c, id);
    if (found) return found;
  }
  return null;
}

function parentId(id: NodeId): NodeId | null {
  const i = id.lastIndexOf("/");
  return i < 0 ? null : id.slice(0, i);
}

export function resolveWirePath(
  root: SpecNode,
  fromNode: SpecNode,
  path: WirePath
): NodeId | null {
  // Wires resolve from the process's *parent* (the process lives at a leaf;
  // its wires reach into its enclosing store's children).
  const parent = parentId(fromNode.id);
  if (parent === null) return null;
  let cursor: NodeId | null = parent;

  for (const segment of path) {
    if (cursor === null) return null;
    if (segment === "..") {
      cursor = parentId(cursor);
    } else if (segment === ".") {
      // no-op
    } else {
      const candidateId = `${cursor}/${segment}`;
      // walk down: candidate must exist
      const node = findNode(root, candidateId);
      if (!node) return null;
      cursor = candidateId;
    }
  }
  return cursor;
}
