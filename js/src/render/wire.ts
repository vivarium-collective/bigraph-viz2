import type { LayoutNode, ResolvedWire } from "../types";
import { chooseEdge, portPosition } from "../wires/ports";

const SVG_NS = "http://www.w3.org/2000/svg";

export function renderWire(
  parent: SVGElement, proc: LayoutNode, target: LayoutNode, w: ResolvedWire
): void {
  const tcx = target.bbox.x + target.bbox.w / 2;
  const tcy = target.bbox.y + target.bbox.h / 2;
  const edge = chooseEdge(proc.bbox, tcx, tcy);
  // v0.1: one port per edge at the midpoint (multi-port spacing deferred —
  // wires/ports.ts portPosition can be invoked with proper i/total when ready)
  const p = portPosition(proc.bbox, edge, 0, 1);
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", String(p.x));
  line.setAttribute("y1", String(p.y));
  line.setAttribute("x2", String(tcx));
  line.setAttribute("y2", String(tcy));
  line.setAttribute("stroke-dasharray", "4,3");
  line.classList.add("bgv2-wire");
  if (w.retargetedToChip) line.classList.add("bgv2-wire-retargeted");
  parent.appendChild(line);

  // port handle dot
  const dot = document.createElementNS(SVG_NS, "circle");
  dot.setAttribute("cx", String(p.x));
  dot.setAttribute("cy", String(p.y));
  dot.setAttribute("r", "3");
  dot.classList.add("bgv2-port");
  parent.appendChild(dot);
}
