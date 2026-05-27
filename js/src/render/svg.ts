import type { LayoutResult, LayoutNode, SpecNode } from "../types";
import { renderWires } from "./wire";

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

  // Three layers, painted back to front:
  //   1. wireLayer — bezier paths drawn BEHIND nodes so the node bodies sit
  //      on top; with the detour heuristic + CHILD_GAP_Y room, wires are
  //      visible in the empty channels between rows
  //   2. nodeLayer — store/process/variable bodies
  //   3. portLayer — port glyphs and labels on TOP of nodes so they stay
  //      hoverable and labels stay legible
  const wireLayer = document.createElementNS(SVG_NS, "g");
  const nodeLayer = document.createElementNS(SVG_NS, "g");
  const portLayer = document.createElementNS(SVG_NS, "g");
  wireLayer.classList.add("bgv2-wire-layer");
  portLayer.classList.add("bgv2-port-layer");
  root.appendChild(wireLayer);
  root.appendChild(nodeLayer);
  root.appendChild(portLayer);

  for (const ln of lr.byId.values()) renderNode(nodeLayer, ln);
  renderWires(wireLayer, portLayer, lr.wires, lr.byId);
  return svg;
}


function renderNode(parent: SVGElement, ln: LayoutNode): void {
  const { node, bbox, collapsed } = ln;
  const g = document.createElementNS(SVG_NS, "g");
  g.setAttribute("data-bgv2-id", node.id);
  g.classList.add("bgv2-node", `bgv2-node-${node.kind}`);
  if (node.synthetic) g.classList.add("bgv2-synthetic");
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
    fittedText(g, cx, cy + 28, node.name, "bgv2-var-label", bbox.w - 4);
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
    fittedText(g, bbox.x + bbox.w / 2, bbox.y + 22, node.name, "bgv2-proc-name", bbox.w - 16);
    if (node.address) {
      fittedText(g, bbox.x + bbox.w / 2, bbox.y + 40, node.address, "bgv2-proc-addr", bbox.w - 16);
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
    fittedText(g, bbox.x + bbox.w / 2, bbox.y + 24, node.name, "bgv2-chip-name", bbox.w - 16);
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
  fittedText(g, bbox.x + 16, bbox.y + 22, node.name, "bgv2-store-label", bbox.w - 32, "start");
}

function text(
  parent: SVGElement, x: number, y: number, content: string, cls: string,
  anchor: "start" | "middle" | "end" = "middle",
): SVGTextElement {
  const t = document.createElementNS(SVG_NS, "text") as SVGTextElement;
  t.setAttribute("x", String(x));
  t.setAttribute("y", String(y));
  t.setAttribute("text-anchor", anchor);
  t.classList.add(cls);
  t.textContent = content;
  parent.appendChild(t);
  return t;
}

/** Like text(), but truncate with an ellipsis if the rendered string would
 * exceed `maxWidth` SVG units, and stash the full string in a native <title>
 * tooltip so hover still surfaces it. */
function fittedText(
  parent: SVGElement, x: number, y: number, content: string, cls: string, maxWidth: number,
  anchor: "start" | "middle" | "end" = "middle",
): SVGTextElement {
  const charW = cls.includes("name") ? 6.6 : 5.8;
  const maxChars = Math.max(2, Math.floor(maxWidth / charW));
  const fits = content.length <= maxChars;
  const shown = fits ? content : content.slice(0, maxChars - 1) + "…";
  const t = text(parent, x, y, shown, cls, anchor);
  if (!fits) {
    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = content;
    t.appendChild(title);
  }
  return t;
}

function countDescendants(node: SpecNode): number {
  let n = 0;
  for (const c of node.children) { n += 1 + countDescendants(c); }
  return n;
}
