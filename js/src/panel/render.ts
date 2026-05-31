import type { LayoutResult, NodeId, SpecNode } from "../types";
import { renderInspector } from "../inspector/render";

export type PanelTab = "inspector" | "processes" | "nodes";

export interface NodeEntry { id: NodeId; name: string; address?: string; }

/** Lightweight tree of the non-process state nodes for the Nodes tab. */
export interface NodeTreeNode {
  id: NodeId;
  name: string;
  kind: string;
  type?: string;
  children: NodeTreeNode[];
}

export interface PanelState {
  activeTab: PanelTab;
  selectedId: NodeId | null;
  hidden: Set<NodeId>;
  processes: NodeEntry[];
  nodeTree: NodeTreeNode;
  expanded: Set<NodeId>;
}

export interface PanelCallbacks {
  onTab: (tab: PanelTab) => void;
  onToggleHidden: (id: NodeId, hide: boolean) => void;
  onShowAll: () => void;
  onSelectNode: (id: NodeId) => void;
  onToggleExpand: (id: NodeId) => void;
}

/** Flatten every process node (regardless of current visibility). */
export function collectProcesses(root: SpecNode): NodeEntry[] {
  const out: NodeEntry[] = [];
  const walk = (n: SpecNode) => {
    if (n.kind === "process") out.push({ id: n.id, name: n.name, address: n.address });
    for (const c of n.children) walk(c);
  };
  walk(root);
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** Build a tree of the non-process state nodes, preserving nesting so the Nodes
 * tab can be browsed top-down. Process subtrees are skipped (Processes tab). */
export function buildNodeTree(root: SpecNode): NodeTreeNode {
  const conv = (n: SpecNode): NodeTreeNode => ({
    id: n.id, name: n.name, kind: n.kind, type: n.type,
    children: n.children.filter(c => c.kind !== "process").map(conv),
  });
  return conv(root);
}

function countTree(node: NodeTreeNode): number {
  let n = 0;
  for (const c of node.children) n += 1 + countTree(c);
  return n;
}

/** Render the tabbed right panel: Inspector | Processes | Nodes. */
export function renderPanel(
  panel: HTMLElement,
  lr: LayoutResult,
  state: PanelState,
  cb: PanelCallbacks,
): void {
  panel.innerHTML = "";

  const tabs = document.createElement("div");
  tabs.className = "bgv2-tabs";
  const mkTab = (tab: PanelTab, text: string) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "bgv2-tab" + (state.activeTab === tab ? " bgv2-tab-active" : "");
    b.textContent = text;
    b.addEventListener("click", () => cb.onTab(tab));
    tabs.appendChild(b);
  };
  mkTab("inspector", "Inspector");
  mkTab("processes", `Processes (${state.processes.length})`);
  mkTab("nodes", `Nodes (${countTree(state.nodeTree)})`);
  panel.appendChild(tabs);

  const content = document.createElement("div");
  content.className = "bgv2-panel-content";
  panel.appendChild(content);

  if (state.activeTab === "inspector") {
    renderInspector(content, lr, state.selectedId);
  } else if (state.activeTab === "processes") {
    hint(content, "Toggle to show/hide. Click a name to highlight it on the left.");
    showAllButton(content, state, cb);
    if (state.processes.length === 0) {
      empty(content, "No processes.");
    } else {
      for (const e of state.processes) {
        content.appendChild(row({ id: e.id, name: e.name, sub: e.address, hasChildren: false, depth: 0 }, state, cb));
      }
    }
  } else {
    renderNodes(content, state, cb);
  }
}

function renderNodes(content: HTMLElement, state: PanelState, cb: PanelCallbacks): void {
  hint(content, "Browse the state top-down: ▸ expands a node. Toggle to show/hide (off when it or an ancestor is hidden); click a name to highlight it on the left.");
  showAllButton(content, state, cb);
  if (state.nodeTree.children.length === 0) {
    empty(content, "No nodes.");
    return;
  }
  const walk = (node: NodeTreeNode, depth: number) => {
    for (const child of node.children) {
      const hasChildren = child.children.length > 0;
      const expanded = state.expanded.has(child.id);
      content.appendChild(row(
        { id: child.id, name: child.name, sub: child.type, hasChildren, expanded, depth },
        state, cb,
      ));
      if (hasChildren && expanded) walk(child, depth + 1);
    }
  };
  walk(state.nodeTree, 0);
}

/** True when a strict ancestor of `id` is in the hidden set. */
function ancestorHidden(id: NodeId, hidden: Set<NodeId>): boolean {
  let i = id.lastIndexOf("/");
  while (i > 0) {
    id = id.slice(0, i);
    if (hidden.has(id)) return true;
    i = id.lastIndexOf("/");
  }
  return false;
}

interface RowSpec {
  id: NodeId; name: string; sub?: string;
  hasChildren: boolean; expanded?: boolean; depth: number;
}

/** One row: optional expand caret, visibility switch, clickable name + subtitle.
 * The switch shows EFFECTIVE visibility — a node hidden via an ancestor reads as
 * off + disabled (toggle the ancestor instead). */
function row(spec: RowSpec, state: PanelState, cb: PanelCallbacks): HTMLElement {
  const selfHidden = state.hidden.has(spec.id);
  const ancHidden = ancestorHidden(spec.id, state.hidden);
  const effectivelyHidden = selfHidden || ancHidden;

  const el = document.createElement("div");
  el.className = "bgv2-proc-row"
    + (effectivelyHidden ? " bgv2-proc-hidden" : "")
    + (state.selectedId === spec.id ? " bgv2-proc-selected" : "");
  el.style.paddingLeft = `${4 + spec.depth * 14}px`;

  // Expand caret (or spacer to keep switches aligned).
  const caret = document.createElement("span");
  if (spec.hasChildren) {
    caret.className = "bgv2-tree-caret";
    caret.textContent = spec.expanded ? "▾" : "▸";
    caret.addEventListener("click", (e) => { e.stopPropagation(); cb.onToggleExpand(spec.id); });
  } else {
    caret.className = "bgv2-tree-spacer";
  }
  el.appendChild(caret);

  // Visibility switch.
  const sw = document.createElement("label");
  sw.className = "bgv2-switch";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = !effectivelyHidden;
  if (ancHidden) {
    input.disabled = true;
    sw.title = "Hidden because an ancestor is hidden";
  } else {
    sw.title = selfHidden ? "Show in diagram" : "Hide from diagram";
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("change", () => cb.onToggleHidden(spec.id, !input.checked));
  }
  const slider = document.createElement("span");
  slider.className = "bgv2-switch-slider";
  sw.appendChild(input);
  sw.appendChild(slider);
  el.appendChild(sw);

  // Name + subtitle.
  const info = document.createElement("div");
  info.className = "bgv2-proc-info";
  info.addEventListener("click", () => cb.onSelectNode(spec.id));
  const nm = document.createElement("div");
  nm.className = "bgv2-proc-row-name";
  nm.textContent = spec.name;
  info.appendChild(nm);
  if (spec.sub) {
    const ad = document.createElement("div");
    ad.className = "bgv2-proc-row-addr";
    ad.textContent = spec.sub;
    info.appendChild(ad);
  }
  el.appendChild(info);
  return el;
}

function hint(content: HTMLElement, text: string): void {
  const h = document.createElement("div");
  h.className = "bgv2-insp-p muted small";
  h.textContent = text;
  content.appendChild(h);
}

function empty(content: HTMLElement, text: string): void {
  const e = document.createElement("div");
  e.className = "bgv2-insp-p muted";
  e.textContent = text;
  content.appendChild(e);
}

function showAllButton(content: HTMLElement, state: PanelState, cb: PanelCallbacks): void {
  if (state.hidden.size === 0) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "bgv2-showall";
  btn.textContent = `Show all hidden (${state.hidden.size})`;
  btn.addEventListener("click", () => cb.onShowAll());
  content.appendChild(btn);
}
