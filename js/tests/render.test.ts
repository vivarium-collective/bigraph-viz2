import { describe, it, expect } from "vitest";
import { renderSvg } from "../src/render/svg";
import { layout } from "../src/layout";
import { normalize } from "../src/normalize";
import { readFileSync } from "fs";
import { resolve } from "path";

const cellSpec = JSON.parse(
  readFileSync(resolve(__dirname, "fixtures/cell.json"), "utf-8")
);

describe("renderSvg", () => {
  it("produces an SVGSVGElement with viewBox covering root bbox", () => {
    const root = normalize(cellSpec);
    const lr = layout(root, new Set(), 480);
    const svg = renderSvg(lr);
    expect(svg.tagName.toLowerCase()).toBe("svg");
    const vb = svg.getAttribute("viewBox")!.split(" ").map(Number);
    expect(vb[2]).toBeCloseTo(lr.root.bbox.w, 0);
    expect(vb[3]).toBeCloseTo(lr.root.bbox.h, 0);
  });

  it("contains one <circle> per variable", () => {
    const root = normalize(cellSpec);
    const lr = layout(root, new Set(), 480);
    const svg = renderSvg(lr);
    const vars = Array.from(lr.byId.values()).filter(l => l.node.kind === "variable").length;
    expect(svg.querySelectorAll("circle.bgv2-var").length).toBe(vars);
  });

  it("contains one <rect class='bgv2-proc'> per process (sharp corners, no rx)", () => {
    const root = normalize(cellSpec);
    const lr = layout(root, new Set(), 480);
    const svg = renderSvg(lr);
    const procs = svg.querySelectorAll("rect.bgv2-proc");
    expect(procs.length).toBe(2);
    procs.forEach(r => expect(r.getAttribute("rx")).toBeNull());
  });

  it("contains one <rect class='bgv2-store'> per non-collapsed store (rounded)", () => {
    const root = normalize(cellSpec);
    const lr = layout(root, new Set(), 480);
    const svg = renderSvg(lr);
    const stores = svg.querySelectorAll("rect.bgv2-store");
    // root + membrane + cytoplasm = 3
    expect(stores.length).toBe(3);
    stores.forEach(r => expect(Number(r.getAttribute("rx"))).toBeGreaterThan(0));
  });

  it("contains one <path class='bgv2-wire'> per resolved wire", () => {
    const root = normalize(cellSpec);
    const lr = layout(root, new Set(), 480);
    const svg = renderSvg(lr);
    const wires = svg.querySelectorAll("path.bgv2-wire");
    expect(wires.length).toBe(lr.wires.length);
    // Rounded orthogonal routing: each wire is a polyline with quadratic-bezier
    // (Q) corners — starts with a moveto and contains at least one curved bend.
    wires.forEach(w => expect(w.getAttribute("d")).toMatch(/^M .* Q /));
  });

  it("renders collapsed stores as a dashed chip with badge", () => {
    const root = normalize(cellSpec);
    const lr = layout(root, new Set(["cell/cytoplasm"]), 480);
    const svg = renderSvg(lr);
    const chips = svg.querySelectorAll("rect.bgv2-chip");
    expect(chips.length).toBe(1);
    expect(chips[0].getAttribute("stroke-dasharray")).toBeTruthy();
  });
});
