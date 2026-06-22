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
import type { NodeId, RowsOverride, PosOverride, LayoutResult, SpecNode } from "./types";

export const version = "0.3.21";

export interface MountOpts {
  inspector?: boolean;
  maxRowWidth?: number;
  id?: string;
  /** Node ids to start collapsed (rendered as chips). Applied only on first
   * mount when the URL hash has no saved collapse state for this viz, so user
   * expand/collapse still wins on reload. */
  collapsed?: string[];
  /** Auto-collapse every container node at this depth or deeper (root's children
   * are depth 0), so a large composite opens as a shallow, legible tree the user
   * drills into. Unioned with `collapsed`; applied only when the URL hash has no
   * saved collapse state. e.g. 1 shows only the top level. */
  collapseDepth?: number;
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

/** Collect ids of every container node (a non-variable node with children) at
 * `depth` or deeper, so the diagram opens collapsed below that level. Root's
 * children are depth 0. */
function collectCollapsedByDepth(node: SpecNode, depth: number, minDepth: number, acc: Set<NodeId>): void {
  for (const child of node.children) {
    if (child.kind !== "variable" && child.children.length > 0 && depth >= minDepth) {
      acc.add(child.id);
    }
    collectCollapsedByDepth(child, depth + 1, minDepth, acc);
  }
}

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
    // Re-frame the whole graph (fit-to-content) rather than snapping to the raw
    // identity transform, which would scroll a large composite off-screen.
    userPanned = false;
    rerender();
  });
  canvas.appendChild(resetBtn);

  // Navigation help: a "?" button toggling a small overlay listing the gestures.
  const helpBtn = document.createElement("button");
  helpBtn.className = "bgv2-help";
  helpBtn.type = "button";
  helpBtn.title = "Navigation help";
  helpBtn.textContent = "?";
  const helpPanel = document.createElement("div");
  helpPanel.className = "bgv2-help-panel";
  helpPanel.innerHTML =
    "<h4>Navigation</h4><dl>" +
    "<dt>Drag</dt><dd>pan</dd>" +
    "<dt>Scroll</dt><dd>zoom in / out</dd>" +
    "<dt>Double-click</dt><dd>collapse / expand a node</dd>" +
    "<dt>Click</dt><dd>select &amp; inspect</dd>" +
    "<dt><kbd>Alt</kbd> + drag</dt><dd>move a node (within its parent)</dd>" +
    "<dt>Select + <kbd>Del</kbd></dt><dd>hide (<kbd>⌘/Ctrl</kbd>+<kbd>Z</kbd> undo)</dd>" +
    "<dt>Snap</dt><dd>align moved nodes to a grid</dd>" +
    "<dt>Reset view</dt><dd>re-frame everything</dd>" +
    "</dl>";
  helpBtn.addEventListener("click", () => helpPanel.classList.toggle("bgv2-help-open"));
  canvas.appendChild(helpBtn);
  canvas.appendChild(helpPanel);

  // Snap-to-grid toggle: when on, an Alt-dragged node lands on the nearest grid
  // cell so arrangements stay aligned. On by default.
  const SNAP_GRID = 20;
  let snapEnabled = true;
  const snapBtn = document.createElement("button");
  snapBtn.className = "bgv2-snap bgv2-snap-on";
  snapBtn.type = "button";
  snapBtn.title = "Snap moved nodes to grid";
  snapBtn.textContent = "▦";
  snapBtn.addEventListener("click", () => {
    snapEnabled = !snapEnabled;
    snapBtn.classList.toggle("bgv2-snap-on", snapEnabled);
    snapBtn.title = snapEnabled ? "Snap to grid: on" : "Snap to grid: off";
  });
  canvas.appendChild(snapBtn);

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
  if (!hashHasState && opts.collapseDepth != null) {
    collectCollapsedByDepth(root, 0, opts.collapseDepth, collapsed);
  }
  let rowsOverride: RowsOverride = new Map();
  // Free-positioned nodes (Alt-drag): parent-local positions honored by layout().
  const posOverride: PosOverride = new Map();
  let selectedId: NodeId | null = null;
  // Persisted camera transform so collapse/expand/drag/delete re-renders keep
  // the user looking at the same place instead of snapping back to identity.
  let view: ViewTransform = { tx: 0, ty: 0, s: 1 };
  // Until the user takes control of the camera (a pan/zoom gesture or a node
  // drag), every render frames the whole graph (fit-to-content). This keeps
  // large composites visible — including across the resize events that fire
  // while the page lays out, where an early one-shot fit would lock in a wrong
  // camera computed against a not-yet-sized canvas. Once true, the user's
  // pan/zoom is preserved across re-renders.
  let userPanned = false;
  // Zoom-out floor, refreshed by the fit step so the user can always pull back
  // far enough to see the entire graph (huge composites fit at a tiny scale).
  let minZoom = 0.01;
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
    const lr = layout(root, collapsed, maxRowWidth, rowsOverride, hidden, posOverride);
    currentLr = lr;
    // Fit-to-content: until the user takes camera control (and unless a camera
    // was restored from the URL hash), frame the entire graph so large
    // composites are visible instead of opening on an empty top-left corner.
    // Re-running on every pre-interaction render means the final layout/resize
    // wins, rather than a stale fit computed against a not-yet-sized canvas.
    if (!userPanned && !hashHasState) {
      const cw = canvas.clientWidth, ch = canvas.clientHeight;
      const b = lr.root.bbox;
      if (cw > 0 && ch > 0 && b.w > 0 && b.h > 0) {
        const PAD = 24;
        const availW = Math.max(1, cw - PAD * 2), availH = Math.max(1, ch - PAD * 2);
        // The scale at which the WHOLE graph fits — used as the zoom-out floor so
        // the user can always pull back to see everything, however large.
        const fitBoth = Math.min(availW / b.w, availH / b.h);
        minZoom = Math.min(0.05, fitBoth * 0.5);
        // Scale to fit both dimensions, never enlarging past 1:1. But a graph
        // with an extreme aspect ratio (e.g. a 1016-node whole-cell model laid
        // out ~750×38000) would shrink to an unreadable sliver under fit-both —
        // so floor the scale at fit-to-width. The long axis then overflows and
        // is reached by panning, with content at a legible size.
        const s = Math.min(Math.max(fitBoth, Math.min(availW / b.w, 1)), 1);
        // Center each axis when the scaled graph fits it; otherwise anchor to the
        // start (top / left) with padding so it opens at a readable corner.
        const tx = s * b.w <= availW ? cw / 2 - s * (b.x + b.w / 2) : PAD - s * b.x;
        const ty = s * b.h <= availH ? ch / 2 - s * (b.y + b.h / 2) : PAD - s * b.y;
        view = { s, tx, ty };
      }
    }
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

    const drag = attachDragNode(svg, lr, (nodeId, pos) => {
      posOverride.set(nodeId, pos);
      userPanned = true;   // user arranged a node — stop auto-reframing
      rerender();
    }, () => (snapEnabled ? SNAP_GRID : 0));
    detachers.push(drag.detach);

    // attachPanZoom calls onChange once on its initial (programmatic) apply with
    // exactly the camera we seed here — that must NOT count as the user taking
    // control, or the fit-to-content would lock to this render's (possibly
    // pre-resize) canvas size. Only a value that differs from the seed is a real
    // pan/zoom gesture.
    const seeded = { tx: view.tx, ty: view.ty, s: view.s };
    detachers.push(attachPanZoom(svg, svg.querySelector(".bgv2-root")!, {
      isLocked: drag.isActive,
      initial: view,
      minScale: minZoom,
      maxScale: 16,
      onChange: (v) => {
        view = v;
        if (v.tx !== seeded.tx || v.ty !== seeded.ty || v.s !== seeded.s) userPanned = true;
      },
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
  // A standalone embed (e.g. a raw emit_html page) can mount before the canvas
  // has a resolved size, and several resize events fire as the page lays out.
  // Re-render (and thus re-fit) on each until the user takes camera control, so
  // the final canvas size frames the graph instead of an early intermediate one.
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => { if (!userPanned) rerender(); });
    ro.observe(canvas);
    mountDetachers.push(() => ro.disconnect());
  }
  // While Alt is held, show a grab cursor on nodes so it's discoverable that
  // Alt-drag moves a node (otherwise the gesture is invisible).
  const onAltToggle = (e: KeyboardEvent) => el.classList.toggle("bgv2-alt-mode", e.altKey);
  window.addEventListener("keydown", onAltToggle);
  window.addEventListener("keyup", onAltToggle);
  mountDetachers.push(() => {
    window.removeEventListener("keydown", onAltToggle);
    window.removeEventListener("keyup", onAltToggle);
    el.classList.remove("bgv2-alt-mode");
  });
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
