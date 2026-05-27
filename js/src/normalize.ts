import type { SpecNode, NodeKind, WirePath } from "./types";

type RawSpec = {
  name?: string;
  stores?: Record<string, RawChild>;
  // also allowed shape: top-level keys are children directly (no "stores" wrapper)
} & Record<string, unknown>;

type RawChild = {
  _type?: NodeKind;
  address?: string;
  config?: unknown;
  ports?: Record<string, WirePath>;
  type?: string;
  value?: unknown;
} & Record<string, unknown>;

const PROCESS_KEYS = new Set([
  "_type", "address", "config", "ports", "type", "value",
]);

export function normalize(raw: RawSpec): SpecNode {
  const rootName = raw.name ?? "root";
  const rootChildren = raw.stores ?? raw;
  return buildNode(rootName, rootChildren, "store", rootName);
}

function buildNode(
  name: string,
  raw: unknown,
  inferredKind: NodeKind,
  path: string
): SpecNode {
  if (typeof raw !== "object" || raw === null) {
    return { id: path, name, kind: "variable", children: [], value: raw };
  }
  const obj = raw as RawChild;
  const declaredKind = obj._type;
  const kind: NodeKind = declaredKind ?? inferredKind;

  if (kind === "variable") {
    return {
      id: path, name, kind: "variable", children: [],
      type: obj.type, value: obj.value ?? obj,
    };
  }
  if (kind === "process") {
    return {
      id: path, name, kind: "process", children: [],
      address: obj.address, config: obj.config, ports: obj.ports ?? {},
    };
  }
  // store: walk children = entries that aren't process/variable metadata keys
  const childEntries = Object.entries(obj).filter(([k]) => !PROCESS_KEYS.has(k));
  const children = childEntries.map(([childName, childRaw]) => {
    const childKind = inferChildKind(childRaw);
    return buildNode(childName, childRaw, childKind, `${path}/${childName}`);
  });
  // stable child order: stores first, then processes, then variables
  children.sort((a, b) => kindRank(a.kind) - kindRank(b.kind));
  return { id: path, name, kind: "store", children };
}

function inferChildKind(raw: unknown): NodeKind {
  if (typeof raw !== "object" || raw === null) return "variable";
  const t = (raw as RawChild)._type;
  if (t === "process" || t === "variable" || t === "store") return t;
  // heuristic: has only metadata keys (no child stores)?
  const obj = raw as Record<string, unknown>;
  const childKeys = Object.keys(obj).filter(k => !PROCESS_KEYS.has(k));
  return childKeys.length === 0 ? "variable" : "store";
}

function kindRank(k: NodeKind): number {
  return k === "store" ? 0 : k === "process" ? 1 : 2;
}
