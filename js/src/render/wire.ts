import type { LayoutNode, NodeId, ResolvedWire } from "../types";
import { chooseEdge, portPosition } from "../wires/ports";
import type { Edge } from "../wires/ports";

const SVG_NS = "http://www.w3.org/2000/svg";

// Visual constants — must match render/svg.ts.
const VAR_CIRCLE_R = 16;
const VAR_CIRCLE_Y_OFFSET = -6;

export function renderWires(
  wireParent: SVGElement,
  glyphParent: SVGElement,
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
        drawBezierWire(wireParent, glyphParent, port, e, a.endpoint, a.w);
        drawPortLabel(glyphParent, port, e, procBox, a.w.portName, a.w.direction, a.w.processId, a.w.targetId);
      });
    }
  }
}

/**
 * Render the port name as a small label hugging the port glyph, INSIDE the
 * process rectangle. Anchored to the same edge the port lives on so it stays
 * visually attached to the dot.
 */
/**
 * Render the port name OUTSIDE the process box, anchored at the port glyph
 * and oriented along the wire direction. Top/bottom-edge labels are rotated
 * so they read along the wire (vertical), which avoids the inside-the-box
 * horizontal collision when a process has many same-edge ports with long
 * names.
 */
const PORT_LABEL_MAX_CHARS = 12;

function drawPortLabel(
  parent: SVGElement,
  port: { x: number; y: number },
  portEdge: Edge,
  _procBox: { x: number; y: number; w: number; h: number },
  name: string,
  dir: ResolvedWire["direction"],
  processId: string,
  targetId: string,
): void {
  const t = document.createElementNS(SVG_NS, "text") as SVGTextElement;
  // Truncate long names so adjacent rotated labels don't pile into each other;
  // the full name is still available via the port glyph's <title> tooltip.
  const shown = name.length > PORT_LABEL_MAX_CHARS
    ? name.slice(0, PORT_LABEL_MAX_CHARS - 1) + "…"
    : name;
  t.textContent = shown;
  t.classList.add("bgv2-port-label", `bgv2-port-label-${dir}`);
  t.setAttribute("data-bgv2-from", processId);
  t.setAttribute("data-bgv2-to", targetId);
  // Always add the full name as a <title>, even if not truncated, so hovering
  // the label itself surfaces the canonical port name.
  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = name;
  t.appendChild(title);
  // Horizontal labels positioned just outside the port glyph. Only one is
  // visible at a time (CSS `.bgv2-port:hover + .bgv2-port-label`) — so they
  // never stack, even when a process has many ports on one edge.
  const gap = 6;
  if (portEdge === "top") {
    t.setAttribute("x", String(port.x));
    t.setAttribute("y", String(port.y - gap));
    t.setAttribute("text-anchor", "middle");
  } else if (portEdge === "bottom") {
    t.setAttribute("x", String(port.x));
    t.setAttribute("y", String(port.y + gap + 9));  // +font-size to baseline
    t.setAttribute("text-anchor", "middle");
  } else if (portEdge === "left") {
    t.setAttribute("x", String(port.x - gap));
    t.setAttribute("y", String(port.y + 3));
    t.setAttribute("text-anchor", "end");
  } else {  // right
    t.setAttribute("x", String(port.x + gap));
    t.setAttribute("y", String(port.y + 3));
    t.setAttribute("text-anchor", "start");
  }
  parent.appendChild(t);
}

function drawBezierWire(
  wireParent: SVGElement,
  glyphParent: SVGElement,
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
  // Stroke widths in SCREEN pixels regardless of viewBox scale.
  path.setAttribute("vector-effect", "non-scaling-stroke");
  // Solid wires read much better than dashes in dense graphs; the inspector
  // and port glyph still distinguish wires from the place graph visually.
  path.setAttribute("data-bgv2-from", w.processId);
  path.setAttribute("data-bgv2-to", w.targetId);
  path.classList.add("bgv2-wire", `bgv2-wire-${w.direction}`);
  if (w.retargetedToChip) path.classList.add("bgv2-wire-retargeted");
  wireParent.appendChild(path);

  // Port glyph carries direction (orientation + color). Tag it with the same
  // from/to so hover emphasis can find it via the same selector. Native SVG
  // <title> gives the port name on hover without cluttering the canvas.
  const glyph = makePortGlyph(port, portEdge, w.direction);
  glyph.setAttribute("data-bgv2-from", w.processId);
  glyph.setAttribute("data-bgv2-to", w.targetId);
  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = w.portName;
  glyph.appendChild(title);
  glyphParent.appendChild(glyph);
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
