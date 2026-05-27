import type { LayoutResult, NodeId } from "../types";

export type SelectionCallback = (selectedId: NodeId | null) => void;

export interface ClickOpts {
  /** Returns true when a node-drag gesture is in progress; suppress selection. */
  isLocked?: () => boolean;
}

export function attachClick(
  svg: SVGSVGElement, _lr: LayoutResult, onSelect: SelectionCallback, opts: ClickOpts = {},
): () => void {
  onSelect(null);
  function onClick(e: MouseEvent) {
    if (opts.isLocked && opts.isLocked()) return;
    const target = (e.target as Element).closest(".bgv2-node");
    svg.querySelectorAll(".bgv2-selected").forEach(el => el.classList.remove("bgv2-selected"));
    if (!target) { onSelect(null); return; }
    const id = target.getAttribute("data-bgv2-id");
    if (!id) return;
    target.classList.add("bgv2-selected");
    onSelect(id);
  }
  svg.addEventListener("click", onClick);
  return () => svg.removeEventListener("click", onClick);
}
