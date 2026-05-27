import "./style.css";
import { normalize } from "./normalize";
import { materializeWireTargets } from "./materialize";
import { layout } from "./layout";
import { renderSvg } from "./render/svg";
import { attachPanZoom } from "./interact/panzoom";
import { attachHover } from "./interact/hover";
import { attachClick } from "./interact/click";
import { attachCollapse } from "./interact/collapse";
import { attachDragNode } from "./interact/dragnode";
import { attachDelete } from "./interact/delete";
import { renderInspector } from "./inspector/render";
import { decodeHash } from "./hash/sync";
import type { NodeId, RowsOverride } from "./types";

export const version = "0.3.14";

export interface MountOpts {
  inspector?: boolean;
  maxRowWidth?: number;
  id?: string;
  /** If true (default), synthesize any wire-target stores that the spec
   * references but doesn't declare, so wires render. Synthetic nodes appear
   * with a dashed outline. Set false to view the literal spec only. */
  materialize?: boolean;
}

interface Instance {
  detachers: Array<() => void>;
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

  const inspectorEl = showInspector ? document.createElement("div") : null;
  if (inspectorEl) { inspectorEl.className = "bgv2-inspector"; el.appendChild(inspectorEl); }

  const root = normalize(state as Parameters<typeof normalize>[0]);
  if (opts.materialize !== false) materializeWireTargets(root);
  let collapsed: Set<NodeId> = decodeHash(window.location.hash, vizId);
  let rowsOverride: RowsOverride = new Map();
  let deleted: Set<NodeId> = new Set();
  let selectedId: NodeId | null = null;
  const detachers: Array<() => void> = [];

  function rerender() {
    detachers.forEach(d => d()); detachers.length = 0;
    canvas.innerHTML = "";
    const lr = layout(root, collapsed, maxRowWidth, rowsOverride, deleted);
    const svg = renderSvg(lr);
    canvas.appendChild(svg);

    const drag = attachDragNode(svg, lr, rowsOverride, (next) => {
      rowsOverride = next;
      rerender();
    });
    detachers.push(drag.detach);

    detachers.push(attachPanZoom(svg, svg.querySelector(".bgv2-root")!, {
      isLocked: drag.isActive,
    }));
    detachers.push(attachHover(svg, lr));
    detachers.push(attachClick(svg, lr, (sel) => {
      selectedId = sel;
      if (inspectorEl) renderInspector(inspectorEl, lr, sel);
    }, { isLocked: drag.isActive }));
    detachers.push(attachCollapse(svg, root, vizId, collapsed, (next) => {
      collapsed = next; rerender();
    }));
    detachers.push(attachDelete(svg, () => selectedId, deleted, (next) => {
      deleted = next;
      // If we just deleted the selected node, clear the selection so the next
      // delete doesn't act on a stale id.
      if (selectedId && next.has(selectedId)) selectedId = null;
      rerender();
    }));
    if (inspectorEl) renderInspector(inspectorEl, lr, selectedId);
  }
  rerender();
  INSTANCES.set(el, { detachers });
}

export function unmount(el: HTMLElement): void {
  const inst = INSTANCES.get(el);
  if (inst) { inst.detachers.forEach(d => d()); INSTANCES.delete(el); }
  el.innerHTML = "";
  el.classList.remove("bgv2");
}
