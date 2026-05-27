import type { BBox } from "../types";

export type Edge = "top" | "bottom" | "left" | "right";

export function chooseEdge(processBox: BBox, targetCx: number, targetCy: number): Edge {
  const cx = processBox.x + processBox.w / 2;
  const cy = processBox.y + processBox.h / 2;
  const dx = targetCx - cx;
  const dy = targetCy - cy;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "bottom" : "top";
}

export function portPosition(
  processBox: BBox, edge: Edge, indexOnEdge: number, totalOnEdge: number
): { x: number; y: number } {
  const { x, y, w, h } = processBox;
  const frac = (indexOnEdge + 1) / (totalOnEdge + 1);
  if (edge === "top") return { x: x + w * frac, y };
  if (edge === "bottom") return { x: x + w * frac, y: y + h };
  if (edge === "left") return { x, y: y + h * frac };
  return { x: x + w, y: y + h * frac };
}
