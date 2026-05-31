// A composite state dict, structurally:
//   { stores: {name: SpecStore | SpecVariable}, processes: {name: SpecProcess} }
// — but the renderer doesn't reify any of those shapes itself; it walks
// children based on the `_type` discriminator and `children` map below.

export type NodeId = string;        // dotted path: "cell/membrane/v"
export type WirePath = string[];    // ["..", "membrane", "v"] — relative or absolute

export type NodeKind = "store" | "variable" | "process";

// "in"  → variable feeds the process (arrow points to the process)
// "out" → process writes to variable (arrow points to the variable)
// "both"→ undirected (no arrowhead; used when the spec didn't say)
export type PortDirection = "in" | "out" | "both";

export interface SpecNode {
  id: NodeId;                       // computed during normalization (parent + name)
  name: string;                     // leaf name
  kind: NodeKind;
  children: SpecNode[];             // empty for variables; substores + nested processes for stores
  synthetic?: boolean;              // true if added by materializeWireTargets (not in the source spec)
  // process-only:
  address?: string;                 // e.g. "fba.CobraStep"
  config?: unknown;
  ports?: Record<string, WirePath>; // port_name -> wire path (relative/absolute)
  portDirections?: Record<string, PortDirection>;  // direction lookup, defaults "both"
  // port_name -> declared schema for that port (a type string like
  // "quantity[float,fg]", or a nested schema tree). Surfaces units/types.
  portSchemas?: Record<string, unknown>;
  // True input/output port schemas (keys are the real directional ports, unlike
  // the merged `ports` which can't distinguish a read-write port). Drives the
  // inspector's Inputs/Outputs sections.
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  doc?: string;                     // process class docstring (math description)
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
  direction: PortDirection;
}

// Override for sibling layout order: maps a parent node's id to the explicit
// child id ordering. Children not listed retain their natural position relative
// to listed ones. Used by drag-to-rearrange.
export type SiblingOrder = Map<NodeId, NodeId[]>;

// Explicit per-parent row layout. Each parent's children are partitioned into
// rows (each row is a left-to-right list of child ids). When a parent has an
// override, the auto row-wrap based on max_row_width is disabled for that
// parent — the user's drop placements are honored exactly. Children present in
// the spec but missing from the override are appended to a synthesized last
// row to avoid losing nodes after spec changes.
export type RowsOverride = Map<NodeId, NodeId[][]>;
