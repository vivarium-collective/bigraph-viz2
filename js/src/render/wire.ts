import type { LayoutNode, NodeId, ResolvedWire, BBox } from "../types";
import { chooseEdge, portPosition } from "../wires/ports";
import type { Edge } from "../wires/ports";
import { buildRouter, type Router } from "./route";

const SVG_NS = "http://www.w3.org/2000/svg";

// Visual constants — must match render/svg.ts.
const VAR_CIRCLE_R = 16;
const VAR_CIRCLE_Y_OFFSET = -6;

// How far past a node's bbox we want the wire to stay clear.
const OBSTACLE_CLEARANCE = 8;
// Cap on lateral nudge so a single wire doesn't fly across the whole canvas.
const MAX_DETOUR = 90;

// --- Orthogonal channel routing tunables -----------------------------------
// Perpendicular stub length: how far a wire travels straight out of its port
// (and straight into its target) before it is allowed to turn. Gives every
// wire a clean, readable "exit" and keeps turns away from the glyphs.
const STUB = 18;
// Spacing between parallel wires sharing a trunk, so a bundle of wires reads as
// a set of distinct channels rather than one thick smear.
const LANE_GAP = 7;
// Corner radius for the rounded orthogonal bends ("delicate" turns).
const CORNER_R = 8;

export function renderWires(
  wireParent: SVGElement,
  glyphParent: SVGElement,
  wires: ResolvedWire[],
  byId: Map<NodeId, LayoutNode>,
): void {
  // Precompute the list of all node bboxes for obstacle-avoidance routing.
  // Stores (which CONTAIN the wire's endpoints) and chip bboxes are skipped
  // — only leaves (variables, processes, collapsed chips) act as obstacles.
  const obstacles: Array<{ id: NodeId; box: BBox }> = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ln of byId.values()) {
    const b = ln.bbox;
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
    if (ln.node.kind === "store" && !ln.collapsed) continue;
    obstacles.push({ id: ln.node.id, box: ln.bbox });
  }
  // A* router that threads wires AROUND the solid glyphs. Built once and shared
  // across every wire; bounds are padded so routes can use the outer margins.
  const PAD = 60;
  const router = buildRouter(
    obstacles.map(o => o.box),
    { x: minX - PAD, y: minY - PAD, w: (maxX - minX) + 2 * PAD, h: (maxY - minY) + 2 * PAD },
  );
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
        // Lane index centered on 0 so a bundle fans symmetrically about its
        // trunk; each wire in the group gets its own parallel channel.
        const lane = i - (group.length - 1) / 2;
        drawChannelWire(
          wireParent, glyphParent, port, e, a.endpoint, a.w, lane,
          router, obstacles,
        );
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

/**
 * Route one wire as a rounded orthogonal connector. A perpendicular stub leaves
 * the port and enters the target; between the stub ends an A* router finds a
 * path of axis-aligned segments that goes AROUND obstacle glyphs. Corners are
 * rounded so the path bends rather than spiking. Per-lane stub stagger keeps a
 * bundle's turn points from coinciding. If routing fails the wire falls back to
 * a simple trunk (nudged off node centers).
 */
function drawChannelWire(
  wireParent: SVGElement,
  glyphParent: SVGElement,
  port: { x: number; y: number },
  portEdge: Edge,
  end: { x: number; y: number; approachEdge: Edge },
  w: ResolvedWire,
  lane: number,
  router: Router,
  obstacles: Array<{ id: NodeId; box: BBox }>,
): void {
  const pn = edgeNormal(portEdge);
  const an = edgeNormal(end.approachEdge);
  // Stagger stub depth slightly per lane so a bundle's turn points don't all
  // line up — this also gives each wire its own grid line into the router.
  const stubP = STUB + Math.abs(lane) * LANE_GAP;
  const stubE = STUB + Math.abs(lane) * LANE_GAP;

  const p1 = { x: port.x + pn.dx * stubP, y: port.y + pn.dy * stubP };
  const e1 = { x: end.x + an.dx * stubE, y: end.y + an.dy * stubE };

  const pts: Array<{ x: number; y: number }> = [{ x: port.x, y: port.y }];
  const routed = router.route(p1, e1);
  if (routed && routed.length >= 2) {
    pts.push(...routed);                       // routed[0]=p1 … routed[last]=e1
  } else {
    // Fallback: perpendicular stubs + a single nudged trunk.
    const exitVert = portEdge === "top" || portEdge === "bottom";
    const entryVert = end.approachEdge === "top" || end.approachEdge === "bottom";
    pts.push(p1);
    if (exitVert && entryVert) {
      const trunkY = nudgeTrunk("h", (p1.y + e1.y) / 2, p1.x, e1.x, obstacles, w);
      pts.push({ x: p1.x, y: trunkY }, { x: e1.x, y: trunkY });
    } else if (!exitVert && !entryVert) {
      const trunkX = nudgeTrunk("v", (p1.x + e1.x) / 2, p1.y, e1.y, obstacles, w);
      pts.push({ x: trunkX, y: p1.y }, { x: trunkX, y: e1.y });
    } else if (exitVert) {
      pts.push({ x: p1.x, y: e1.y });
    } else {
      pts.push({ x: e1.x, y: p1.y });
    }
    pts.push(e1);
  }
  pts.push({ x: end.x, y: end.y });

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", roundedPath(dedupePoints(pts), CORNER_R));
  // Stroke widths in SCREEN pixels regardless of viewBox scale. Chunky 8/4
  // dash pattern reads clearly as a dashed line at small canvas scales
  // without disappearing into noise.
  path.setAttribute("vector-effect", "non-scaling-stroke");
  path.setAttribute("stroke-dasharray", "8,4");
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

/** Drop consecutive duplicate / colinear-collapsed points so roundedPath()
 * never sees a zero-length segment (which would produce a NaN arc). */
function dedupePoints(pts: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 0.5 || Math.abs(last.y - p.y) > 0.5) {
      out.push(p);
    }
  }
  return out;
}

/** Build an SVG path from an axis-aligned polyline, rounding each interior
 * vertex with a quadratic-bezier corner of radius up to `r`. */
function roundedPath(pts: Array<{ x: number; y: number }>, r: number): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1], cur = pts[i], next = pts[i + 1];
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y) || 1;
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y) || 1;
    const rr = Math.min(r, inLen / 2, outLen / 2);
    const ix = cur.x - ((cur.x - prev.x) / inLen) * rr;
    const iy = cur.y - ((cur.y - prev.y) / inLen) * rr;
    const ox = cur.x + ((next.x - cur.x) / outLen) * rr;
    const oy = cur.y + ((next.y - cur.y) / outLen) * rr;
    d += ` L ${ix} ${iy} Q ${cur.x} ${cur.y} ${ox} ${oy}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

/**
 * Nudge a trunk segment off any node centers it would cross. `axis` is the
 * orientation of the trunk line ("h" = horizontal trunk at y=`coord` spanning
 * x in [a,b]; "v" = vertical trunk at x=`coord` spanning y in [a,b]). Returns a
 * shifted `coord` that clears obstacle bands, capped at MAX_DETOUR.
 */
function nudgeTrunk(
  axis: "h" | "v",
  coord: number,
  a: number,
  b: number,
  obstacles: Array<{ id: NodeId; box: BBox }>,
  w: ResolvedWire,
): number {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  let push = 0;
  for (const o of obstacles) {
    if (o.id === w.processId || o.id === w.targetId) continue;
    const cx = o.box.x + o.box.w / 2;
    const cy = o.box.y + o.box.h / 2;
    // Along-trunk position and across-trunk distance depend on orientation.
    const along = axis === "h" ? cx : cy;
    const across = axis === "h" ? cy : cx;
    if (along <= lo + 6 || along >= hi - 6) continue;
    const half = (axis === "h" ? o.box.h : o.box.w) / 2;
    const overlap = half + OBSTACLE_CLEARANCE - Math.abs(across - coord);
    if (overlap > 0) push += -Math.sign(across - coord || 1) * overlap;
  }
  if (push === 0) return coord;
  return coord + Math.max(-MAX_DETOUR, Math.min(MAX_DETOUR, push));
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
