// A composite state dict, structurally:
//   { stores: {name: SpecStore | SpecVariable}, processes: {name: SpecProcess} }
// — but the renderer doesn't reify any of those shapes itself; it walks
// children based on the `_type` discriminator and `children` map below.

export type NodeId = string;        // dotted path: "cell/membrane/v"
export type WirePath = string[];    // ["..", "membrane", "v"] — relative or absolute

export type NodeKind = "store" | "variable" | "process";

export interface SpecNode {
  id: NodeId;                       // computed during normalization (parent + name)
  name: string;                     // leaf name
  kind: NodeKind;
  children: SpecNode[];             // empty for variables; substores + nested processes for stores
  // process-only:
  address?: string;                 // e.g. "fba.CobraStep"
  config?: unknown;
  ports?: Record<string, WirePath>; // port_name -> wire path (relative/absolute)
  // variable-only:
  type?: string;                    // declared type, if present
  value?: unknown;
}

export interface BBox { x: number; y: number; w: number; h: number; }

export interface LayoutNode {
  node: SpecNode;
  bbox: BBox;                       // absolute coords
  collapsed: boolean;
}

export interface LayoutResult {
  byId: Map<NodeId, LayoutNode>;
  root: LayoutNode;
  // wires resolved during layout (after collapse retargeting):
  wires: ResolvedWire[];
}

export interface ResolvedWire {
  processId: NodeId;
  portName: string;
  // either a target node id or a collapsed chip id:
  targetId: NodeId;
  retargetedToChip: boolean;
}
