import "./style.css";
import { normalize } from "./normalize";
import { materializeWireTargets } from "./materialize";
import { layout } from "./layout";
import { renderSvg } from "./render/svg";
import { attachPanZoom, type ViewTransform } from "./interact/panzoom";
import { attachHover } from "./interact/hover";
import { attachClick } from "./interact/click";
import { attachCollapse } from "./interact/collapse";
import { attachDragNode } from "./interact/dragnode";
import { attachDelete } from "./interact/delete";
import { renderPanel, collectProcesses, buildNodeTree, type PanelTab } from "./panel/render";
import { decodeHash } from "./hash/sync";
import type { NodeId, RowsOverride, LayoutResult } from "./types";

export const version = "0.3.21";

export interface MountOpts {
  inspector?: boolean;
  maxRowWidth?: number;
  id?: string;
  /** Node ids to start collapsed (rendered as chips). Applied only on first
   * mount when the URL hash has no saved collapse state for this viz, so user
   * expand/collapse still wins on reload. */
  collapsed?: string[];
  /** If true (default), synthesize any wire-target stores that the spec
   * references but doesn't declare, so wires render. Synthetic nodes appear
   * with a dashed outline. Set false to view the literal spec only. */
  materialize?: boolean;
}

interface Instance {
  detachers: Array<() => void>;        // re-render-scoped (reset each rerender)
  mountDetachers: Array<() => void>;   // mount-lifetime (cleaned on unmount)
}

const INSTANCES = new WeakMap<HTMLElement, Instance>();
let nextId = 0;

export function mount(el: HTMLElement, state: unknown, opts: MountOpts = {}): void {
  unmount(el);
  el.classList.add("bgv2");
  const vizId = opts.id ?? `auto-${++nextId}`;
  const showInspector = opts.inspector !== false;
  const maxRowWidth = opts.maxRowWidth ?? 480;

  const canvas = document.createElement("div");
  canvas.className = "bgv2-canvas";
  el.appendChild(canvas);

  // Persistent "reset view" control: restores the default camera (identity
  // pan/zoom). Created once and overlaid on the canvas; survives re-renders.
  const resetBtn = document.createElement("button");
  resetBtn.className = "bgv2-reset";
  resetBtn.type = "button";
  resetBtn.title = "Reset view";
  resetBtn.textContent = "Reset view";
  resetBtn.addEventListener("click", () => {
    view = { tx: 0, ty: 0, s: 1 };
    rerender();
  });
  canvas.appendChild(resetBtn);

  const mountDetachers: Array<() => void> = [];
  let inspectorEl: HTMLDivElement | null = null;
  if (showInspector) {
    // Drag-resizable + collapsible details panel. The handle and panel are
    // created once (not in rerender), so their width/collapsed state persists.
    const handle = document.createElement("div");
    handle.className = "bgv2-resize";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "bgv2-collapse-btn";
    toggle.title = "Hide details";
    toggle.textContent = "›";
    handle.appendChild(toggle);

    inspectorEl = document.createElement("div");
    inspectorEl.className = "bgv2-inspector";
    inspectorEl.style.width = "280px";
    el.appendChild(handle);
    el.appendChild(inspectorEl);

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const collapsed = el.classList.toggle("bgv2-inspector-collapsed");
      toggle.textContent = collapsed ? "‹" : "›";
      toggle.title = collapsed ? "Show details" : "Hide details";
    });

    let dragging = false, startX = 0, startW = 0;
    const onDown = (e: MouseEvent) => {
      if (e.target === toggle || el.classList.contains("bgv2-inspector-collapsed")) return;
      dragging = true; startX = e.clientX; startW = inspectorEl!.offsetWidth;
      document.body.style.cursor = "col-resize";
      e.preventDefault();
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      // Handle sits left of the panel: dragging left widens it.
      const w = Math.max(160, Math.min(760, startW - (e.clientX - startX)));
      inspectorEl!.style.width = `${w}px`;
    };
    const onUp = () => { if (dragging) { dragging = false; document.body.style.cursor = ""; } };
    handle.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    mountDetachers.push(() => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    });
  }

  const root = normalize(state as Parameters<typeof normalize>[0]);
  if (opts.materialize !== false) materializeWireTargets(root);
  // Honor saved collapse state from the hash; otherwise fall back to the
  // caller-provided initial collapsed set (e.g. "start with stores collapsed").
  const hashHasState = window.location.hash.includes(`bgv2-${vizId}=`);
  let collapsed: Set<NodeId> = decodeHash(window.location.hash, vizId);
  if (!hashHasState && opts.collapsed?.length) {
    collapsed = new Set(opts.collapsed);
  }
  let rowsOverride: RowsOverride = new Map();
  let selectedId: NodeId | null = null;
  // Persisted camera transform so collapse/expand/drag/delete re-renders keep
  // the user looking at the same place instead of snapping back to identity.
  let view: ViewTransform = { tx: 0, ty: 0, s: 1 };
  // Right-panel state: which tab and which nodes are hidden. Deleting a node
  // (select + Delete) and switching a process off in the Processes tab share
  // this ONE `hidden` set — so a deleted process appears switched off and is
  // recovered by flipping it back on (or "Show all hidden"). `deleteHistory`
  // backs Cmd/Ctrl+Z and persists across re-renders.
  let activeTab: PanelTab = "inspector";
  let hidden: Set<NodeId> = new Set();
  const deleteHistory: NodeId[] = [];
  let pendingCenterId: NodeId | null = null;
  let currentLr: LayoutResult | null = null;
  const processList = collectProcesses(root);
  const nodeTree = buildNodeTree(root);
  const expanded: Set<NodeId> = new Set();
  const detachers: Array<() => void> = [];

  function paintPanel(lr: LayoutResult): void {
    if (!inspectorEl) return;
    renderPanel(inspectorEl, lr, { activeTab, selectedId, hidden, processes: processList, nodeTree, expanded }, {
      onTab: (t) => { activeTab = t; if (currentLr) paintPanel(currentLr); },
      onToggleHidden: (id, hide) => { if (hide) hidden.add(id); else hidden.delete(id); rerender(); },
      onShowAll: () => { hidden.clear(); rerender(); },
      onToggleExpand: (id) => {
        if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
        if (currentLr) paintPanel(currentLr);   // panel-only; no diagram relayout
      },
      onSelectNode: (id) => {
        hidden.delete(id);          // ensure it's visible to highlight
        selectedId = id;
        pendingCenterId = id;       // recenter on it after relayout
        rerender();
      },
    });
  }

  function rerender() {
    detachers.forEach(d => d()); detachers.length = 0;
    // Remove only the prior SVG, preserving persistent overlays (reset button).
    canvas.querySelector(".bgv2-svg")?.remove();
    // Hidden nodes (Delete key OR a Processes-tab switch) are filtered out.
    const lr = layout(root, collapsed, maxRowWidth, rowsOverride, hidden);
    currentLr = lr;
    // Honor a pending "center on this node" request (e.g. Processes-tab click)
    // by seeding the camera so the node sits in the middle of the canvas.
    if (pendingCenterId) {
      const ln = lr.byId.get(pendingCenterId);
      const cw = canvas.clientWidth, ch = canvas.clientHeight;
      if (ln && cw > 0 && ch > 0) {
        const s = view.s || 1;
        const b = ln.bbox;
        view = { s, tx: cw / 2 - s * (b.x + b.w / 2), ty: ch / 2 - s * (b.y + b.h / 2) };
      }
      pendingCenterId = null;
    }
    const svg = renderSvg(lr);
    canvas.appendChild(svg);
    // Re-apply the selection highlight after the SVG is rebuilt.
    if (selectedId) {
      svg.querySelector(`[data-bgv2-id="${selectedId}"]`)?.classList.add("bgv2-selected");
    }

    const drag = attachDragNode(svg, lr, rowsOverride, (next) => {
      rowsOverride = next;
      rerender();
    });
    detachers.push(drag.detach);

    detachers.push(attachPanZoom(svg, svg.querySelector(".bgv2-root")!, {
      isLocked: drag.isActive,
      initial: view,
      onChange: (v) => { view = v; },
    }));
    detachers.push(attachHover(svg, lr));
    detachers.push(attachClick(svg, lr, (sel) => {
      selectedId = sel;
      paintPanel(lr);
    }, { isLocked: drag.isActive }));
    detachers.push(attachCollapse(svg, root, vizId, collapsed, (next) => {
      collapsed = next; rerender();
    }));
    detachers.push(attachDelete(svg, () => selectedId, hidden, (next) => {
      hidden = next;
      // If we just hid the selected node, clear the selection so the next
      // delete doesn't act on a stale id.
      if (selectedId && next.has(selectedId)) selectedId = null;
      rerender();
    }, deleteHistory));
    paintPanel(lr);
  }
  rerender();
  INSTANCES.set(el, { detachers, mountDetachers });
}

export function unmount(el: HTMLElement): void {
  const inst = INSTANCES.get(el);
  if (inst) {
    inst.detachers.forEach(d => d());
    inst.mountDetachers.forEach(d => d());
    INSTANCES.delete(el);
  }
  el.innerHTML = "";
  el.classList.remove("bgv2");
}
