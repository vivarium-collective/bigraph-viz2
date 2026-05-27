import type { SpecNode, NodeKind, WirePath, PortDirection } from "./types";

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
  inputs?: Record<string, WirePath>;
  outputs?: Record<string, WirePath>;
  type?: string;
  value?: unknown;
} & Record<string, unknown>;

const PROCESS_KEYS = new Set([
  "_type", "address", "config", "ports", "inputs", "outputs", "type", "value",
]);

// Keys to exclude when walking a store-shaped root that doesn't use the
// `stores: {...}` wrapper. Without this, `name` would leak as a synthetic child.
const ROOT_NON_CHILD_KEYS = new Set(["name", "stores"]);

export function normalize(raw: RawSpec): SpecNode {
  const rootName = raw.name ?? "root";
  // Root children = (top-level keys except `name` and `stores`) ∪ (entries
  // of `raw.stores` if present). This unwraps the `stores: {...}` convention
  // used by bigraph-viz–style fixtures AND picks up siblings declared at the
  // top level (the shape process_bigraph composites emit, e.g.
  // `{ "global_time": 0, "initialize": {...}, "metabolism": {...} }`).
  const children: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (ROOT_NON_CHILD_KEYS.has(k)) continue;
    children[k] = v;
  }
  if (raw.stores && typeof raw.stores === "object") {
    for (const [k, v] of Object.entries(raw.stores)) {
      children[k] = v;
    }
  }
  return buildNode(rootName, children, "store", rootName);
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
  const declaredKind = obj._type as string | undefined;
  // Recognize "store", "variable", "process" verbatim. Any *other* explicit
  // _type (e.g. process-bigraph's "step", "edge") is treated as a process so
  // its inputs/outputs/ports + address render correctly. Missing _type falls
  // back to structural inference.
  let kind: NodeKind;
  if (declaredKind === "store" || declaredKind === "variable" || declaredKind === "process") {
    kind = declaredKind;
  } else if (declaredKind) {
    kind = "process";
  } else {
    kind = inferredKind;
  }

  if (kind === "variable") {
    // Use `"value" in obj` to preserve explicit null values (?? would lose null).
    const value = "value" in obj ? obj.value : obj;
    return {
      id: path, name, kind: "variable", children: [],
      type: obj.type, value,
    };
  }
  if (kind === "process") {
    // Merge ports (direction-less) + inputs (direction "in") + outputs ("out")
    // into a single `ports` map + `portDirections` lookup.
    const ports: Record<string, WirePath> = {};
    const portDirections: Record<string, PortDirection> = {};
    for (const [n, w] of Object.entries(obj.ports ?? {})) {
      ports[n] = w; portDirections[n] = "both";
    }
    for (const [n, w] of Object.entries(obj.inputs ?? {})) {
      ports[n] = w; portDirections[n] = "in";
    }
    for (const [n, w] of Object.entries(obj.outputs ?? {})) {
      ports[n] = w; portDirections[n] = "out";
    }
    return {
      id: path, name, kind: "process", children: [],
      address: obj.address, config: obj.config, ports, portDirections,
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
