import type { LayoutNode, NodeId, ResolvedWire } from "../types";
import { chooseEdge, portPosition } from "../wires/ports";
import type { Edge } from "../wires/ports";

const SVG_NS = "http://www.w3.org/2000/svg";

// Visual constants — must match render/svg.ts.
const VAR_CIRCLE_R = 16;
const VAR_CIRCLE_Y_OFFSET = -6;

export function renderWires(
  parent: SVGElement,
  wires: ResolvedWire[],
  byId: Map<NodeId, LayoutNode>,
): void {
  const byProc = new Map<NodeId, ResolvedWire[]>();
  for (const w of wires) {
    let list = byProc.get(w.processId);
    if (!list) { list = []; byProc.set(w.processId, list); }
    list.push(w);
  }

  for (const [procId, procWires] of byProc) {
    const procLn = byId.get(procId);
    if (!procLn) continue;
    const procBox = procLn.bbox;

    type Annotated = {
      w: ResolvedWire;
      target: LayoutNode;
      portEdge: Edge;
      endpoint: { x: number; y: number; approachEdge: Edge };
    };
    const annotated: Annotated[] = procWires.map(w => {
      const target = byId.get(w.targetId)!;
      const tcx = target.bbox.x + target.bbox.w / 2;
      const tcy = target.bbox.y + target.bbox.h / 2;
      const portEdge = chooseEdge(procBox, tcx, tcy);
      const tentativePort = portPosition(procBox, portEdge, 0, 1);
      const endpoint = visualEndpoint(target, tentativePort);
      return { w, target, portEdge, endpoint };
    });

    const byEdge: Record<Edge, Annotated[]> = { top: [], bottom: [], left: [], right: [] };
    for (const a of annotated) byEdge[a.portEdge].push(a);

    for (const e of ["top", "bottom", "left", "right"] as Edge[]) {
      const group = byEdge[e];
      if (group.length === 0) continue;
      if (e === "top" || e === "bottom") {
        group.sort((a, b) => a.endpoint.x - b.endpoint.x);
      } else {
        group.sort((a, b) => a.endpoint.y - b.endpoint.y);
      }
      group.forEach((a, i) => {
        const port = portPosition(procBox, e, i, group.length);
        drawBezierWire(parent, port, e, a.endpoint, a.w);
        drawPortLabel(parent, port, e, procBox, a.w.portName, a.w.direction);
      });
    }
  }
}

/**
 * Render the port name as a small label hugging the port glyph, INSIDE the
 * process rectangle. Anchored to the same edge the port lives on so it stays
 * visually attached to the dot.
 */
function drawPortLabel(
  parent: SVGElement,
  port: { x: number; y: number },
  portEdge: Edge,
  procBox: { x: number; y: number; w: number; h: number },
  name: string,
  dir: ResolvedWire["direction"],
): void {
  const t = document.createElementNS(SVG_NS, "text") as SVGTextElement;
  t.textContent = name;
  t.classList.add("bgv2-port-label", `bgv2-port-label-${dir}`);
  const inset = 6;
  if (portEdge === "top") {
    t.setAttribute("x", String(port.x));
    t.setAttribute("y", String(procBox.y + inset + 6));
    t.setAttribute("text-anchor", "middle");
  } else if (portEdge === "bottom") {
    t.setAttribute("x", String(port.x));
    t.setAttribute("y", String(procBox.y + procBox.h - inset));
    t.setAttribute("text-anchor", "middle");
  } else if (portEdge === "left") {
    t.setAttribute("x", String(procBox.x + inset));
    t.setAttribute("y", String(port.y + 3));
    t.setAttribute("text-anchor", "start");
  } else {
    t.setAttribute("x", String(procBox.x + procBox.w - inset));
    t.setAttribute("y", String(port.y + 3));
    t.setAttribute("text-anchor", "end");
  }
  parent.appendChild(t);
}

function drawBezierWire(
  parent: SVGElement,
  port: { x: number; y: number },
  portEdge: Edge,
  end: { x: number; y: number; approachEdge: Edge },
  w: ResolvedWire,
): void {
  const dx = end.x - port.x;
  const dy = end.y - port.y;
  const dist = Math.hypot(dx, dy);
  const offset = Math.max(28, Math.min(140, dist * 0.45));

  const pn = edgeNormal(portEdge);
  const an = edgeNormal(end.approachEdge);

  // For arrowhead positioning we want the path to ALWAYS go from port to end
  // and the arrow either at the end (out: pointing to variable) or at the
  // start (in: pointing to process). marker-start with orient="auto-start-reverse"
  // does the right thing for the "in" case.
  const c1x = port.x + pn.dx * offset;
  const c1y = port.y + pn.dy * offset;
  const c2x = end.x + an.dx * offset;
  const c2y = end.y + an.dy * offset;

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute(
    "d",
    `M ${port.x} ${port.y} C ${c1x} ${c1y} ${c2x} ${c2y} ${end.x} ${end.y}`,
  );
  path.setAttribute("stroke-dasharray", "4,3");
  path.classList.add("bgv2-wire", `bgv2-wire-${w.direction}`);
  if (w.retargetedToChip) path.classList.add("bgv2-wire-retargeted");
  parent.appendChild(path);

  // Port glyph carries direction (orientation + color). Native SVG <title>
  // gives the port name on hover without cluttering the canvas.
  const glyph = makePortGlyph(port, portEdge, w.direction);
  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = w.portName;
  glyph.appendChild(title);
  parent.appendChild(glyph);
}

function makePortGlyph(
  port: { x: number; y: number },
  portEdge: Edge,
  dir: ResolvedWire["direction"],
): SVGElement {
  if (dir === "both") {
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("cx", String(port.x));
    dot.setAttribute("cy", String(port.y));
    dot.setAttribute("r", "3");
    dot.classList.add("bgv2-port", "bgv2-port-both");
    return dot;
  }
  // Triangle: for "in" it points INTO the process (toward the process interior),
  // for "out" it points AWAY from the process (toward the wire/target).
  const inward = dir === "in";
  const n = edgeNormal(portEdge);
  // direction the triangle's tip points
  const tipDx = inward ? -n.dx : n.dx;
  const tipDy = inward ? -n.dy : n.dy;
  const size = 5;
  const tipX = port.x + tipDx * size;
  const tipY = port.y + tipDy * size;
  // base of triangle perpendicular to tipD
  const perpDx = -tipDy;
  const perpDy = tipDx;
  const baseAx = port.x + perpDx * (size * 0.7);
  const baseAy = port.y + perpDy * (size * 0.7);
  const baseBx = port.x - perpDx * (size * 0.7);
  const baseBy = port.y - perpDy * (size * 0.7);
  const tri = document.createElementNS(SVG_NS, "polygon");
  tri.setAttribute("points", `${tipX},${tipY} ${baseAx},${baseAy} ${baseBx},${baseBy}`);
  tri.classList.add("bgv2-port", `bgv2-port-${dir}`);
  return tri;
}

function visualEndpoint(
  target: LayoutNode,
  port: { x: number; y: number },
): { x: number; y: number; approachEdge: Edge } {
  const bbox = target.bbox;
  if (target.node.kind === "variable" && !target.collapsed) {
    const cx = bbox.x + bbox.w / 2;
    const cy = bbox.y + bbox.h / 2 + VAR_CIRCLE_Y_OFFSET;
    const vx = cx - port.x;
    const vy = cy - port.y;
    const d = Math.hypot(vx, vy) || 1;
    const x = cx - (vx / d) * VAR_CIRCLE_R;
    const y = cy - (vy / d) * VAR_CIRCLE_R;
    const approachEdge: Edge = Math.abs(vx) > Math.abs(vy)
      ? (vx > 0 ? "left" : "right")
      : (vy > 0 ? "top" : "bottom");
    return { x, y, approachEdge };
  }
  const approachEdge = chooseEdge(bbox, port.x, port.y);
  const e = portPosition(bbox, approachEdge, 0, 1);
  return { x: e.x, y: e.y, approachEdge };
}

function edgeNormal(e: Edge): { dx: number; dy: number } {
  switch (e) {
    case "top":    return { dx: 0,  dy: -1 };
    case "bottom": return { dx: 0,  dy:  1 };
    case "left":   return { dx: -1, dy:  0 };
    case "right":  return { dx: 1,  dy:  0 };
  }
}

export function renderWire(): void {
  throw new Error("renderWire is deprecated; use renderWires(parent, wires, byId)");
}
