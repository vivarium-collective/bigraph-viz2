import { describe, it, expect, beforeEach } from "vitest";
import { attachPanZoom } from "../src/interact/panzoom";

function svgSetup() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  const g = document.createElementNS(ns, "g");
  g.classList.add("bgv2-root");
  svg.appendChild(g);
  document.body.appendChild(svg);
  return { svg, g };
}

describe("panzoom", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("attaches a transform attribute to the root g", () => {
    const { svg, g } = svgSetup();
    attachPanZoom(svg as SVGSVGElement, g as SVGGElement);
    expect(g.getAttribute("transform")).toMatch(/translate\(0,0\)\s*scale\(1\)/);
  });

  it("wheel event updates scale (zoom in)", () => {
    const { svg, g } = svgSetup();
    attachPanZoom(svg as SVGSVGElement, g as SVGGElement);
    svg.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, clientX: 0, clientY: 0, bubbles: true, cancelable: true }));
    const t = g.getAttribute("transform")!;
    const scale = Number(t.match(/scale\(([\d.]+)\)/)![1]);
    expect(scale).toBeGreaterThan(1);
  });

  it("mousedown + mousemove pans", () => {
    const { svg, g } = svgSetup();
    attachPanZoom(svg as SVGSVGElement, g as SVGGElement);
    svg.dispatchEvent(new MouseEvent("mousedown", { clientX: 100, clientY: 100, button: 0, bubbles: true }));
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 130, clientY: 120, bubbles: true }));
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    const t = g.getAttribute("transform")!;
    expect(t).toMatch(/translate\(30,20\)/);
  });
});
