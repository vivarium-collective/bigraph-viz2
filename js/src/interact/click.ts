import type { LayoutResult, NodeId } from "../types";

export type SelectionCallback = (selectedId: NodeId | null) => void;

export function attachClick(
  svg: SVGSVGElement, _lr: LayoutResult, onSelect: SelectionCallback
): () => void {
  onSelect(null);
  function onClick(e: MouseEvent) {
    const target = (e.target as Element).closest(".bgv2-node");
    // clear previous selection
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
