import type { LayoutResult, LayoutNode, SpecNode } from "../types";
import { renderWire } from "./wire";

const SVG_NS = "http://www.w3.org/2000/svg";

export function renderSvg(lr: LayoutResult): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  const { w, h } = lr.root.bbox;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("xmlns", SVG_NS);
  svg.classList.add("bgv2-svg");

  // pan/zoom transform group (Task 11 attaches handlers)
  const root = document.createElementNS(SVG_NS, "g") as SVGGElement;
  root.classList.add("bgv2-root");
  svg.appendChild(root);

  // nodes first, wires on top
  const nodeLayer = document.createElementNS(SVG_NS, "g");
  const wireLayer = document.createElementNS(SVG_NS, "g");
  root.appendChild(nodeLayer);
  root.appendChild(wireLayer);

  for (const ln of lr.byId.values()) renderNode(nodeLayer, ln);
  for (const w of lr.wires) {
    const proc = lr.byId.get(w.processId)!;
    const target = lr.byId.get(w.targetId)!;
    renderWire(wireLayer, proc, target, w);
  }
  return svg;
}

function renderNode(parent: SVGElement, ln: LayoutNode): void {
  const { node, bbox, collapsed } = ln;
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("data-bgv2-id", node.id);
  g.classList.add("bgv2-node", `bgv2-node-${node.kind}`);
  parent.appendChild(g);

  if (node.kind === "variable") {
    const cx = bbox.x + bbox.w / 2;
    const cy = bbox.y + bbox.h / 2 - 6;
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("cx", String(cx));
    c.setAttribute("cy", String(cy));
    c.setAttribute("r", "16");
    c.classList.add("bgv2-var");
    g.appendChild(c);
    text(g, cx, cy + 4, node.name.slice(0, 2), "bgv2-var-icon");
    text(g, cx, cy + 28, node.name, "bgv2-var-label");
    return;
  }
  if (node.kind === "process") {
    const r = document.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", String(bbox.x));
    r.setAttribute("y", String(bbox.y));
    r.setAttribute("width", String(bbox.w));
    r.setAttribute("height", String(bbox.h));
    r.classList.add("bgv2-proc");
    g.appendChild(r);
    text(g, bbox.x + bbox.w / 2, bbox.y + 22, node.name, "bgv2-proc-name");
    if (node.address) {
      text(g, bbox.x + bbox.w / 2, bbox.y + 40, node.address, "bgv2-proc-addr");
    }
    return;
  }
  // store
  if (collapsed) {
    const r = document.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", String(bbox.x));
    r.setAttribute("y", String(bbox.y));
    r.setAttribute("width", String(bbox.w));
    r.setAttribute("height", String(bbox.h));
    r.setAttribute("rx", "28");
    r.setAttribute("stroke-dasharray", "6,3");
    r.classList.add("bgv2-chip");
    g.appendChild(r);
    text(g, bbox.x + bbox.w / 2, bbox.y + 24, node.name, "bgv2-chip-name");
    const hidden = countDescendants(node);
    text(g, bbox.x + bbox.w / 2, bbox.y + 42, `▸ ${hidden} hidden`, "bgv2-chip-badge");
    return;
  }
  const r = document.createElementNS(SVG_NS, "rect");
  r.setAttribute("x", String(bbox.x));
  r.setAttribute("y", String(bbox.y));
  r.setAttribute("width", String(bbox.w));
  r.setAttribute("height", String(bbox.h));
  r.setAttribute("rx", "12");
  r.classList.add("bgv2-store");
  g.appendChild(r);
  text(g, bbox.x + 16, bbox.y + 22, node.name, "bgv2-store-label");
}

function text(parent: SVGElement, x: number, y: number, content: string, cls: string): SVGTextElement {
  const t = document.createElementNS(SVG_NS, "text") as SVGTextElement;
  t.setAttribute("x", String(x));
  t.setAttribute("y", String(y));
  t.setAttribute("text-anchor", "middle");
  t.classList.add(cls);
  t.textContent = content;
  parent.appendChild(t);
  return t;
}

function countDescendants(node: SpecNode): number {
  let n = 0;
  for (const c of node.children) { n += 1 + countDescendants(c); }
  return n;
}
