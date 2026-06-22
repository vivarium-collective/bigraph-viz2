import { describe, it, expect } from "vitest";
import { layout } from "../src/layout";
import { normalize } from "../src/normalize";
import { readFileSync } from "fs";
import { resolve } from "path";

const cellSpec = JSON.parse(
  readFileSync(resolve(__dirname, "fixtures/cell.json"), "utf-8")
);

describe("layout", () => {
  it("root placed at 0,0", () => {
    const root = normalize(cellSpec);
    const result = layout(root, new Set(), 480);
    expect(result.root.bbox.x).toBe(0);
    expect(result.root.bbox.y).toBe(0);
  });

  it("every node has a bbox in absolute coords", () => {
    const root = normalize(cellSpec);
    const result = layout(root, new Set(), 480);
    function walk(n: typeof root): number {
      let count = 1;
      const ln = result.byId.get(n.id)!;
      expect(ln.bbox.w).toBeGreaterThan(0);
      expect(ln.bbox.h).toBeGreaterThan(0);
      for (const c of n.children) count += walk(c);
      return count;
    }
    expect(walk(root)).toBeGreaterThan(5);
  });

  it("child bboxes lie inside parent bbox", () => {
    const root = normalize(cellSpec);
    const result = layout(root, new Set(), 480);
    function check(parent: typeof root): void {
      const pb = result.byId.get(parent.id)!.bbox;
      for (const c of parent.children) {
        const cb = result.byId.get(c.id)!.bbox;
        expect(cb.x).toBeGreaterThanOrEqual(pb.x);
        expect(cb.y).toBeGreaterThanOrEqual(pb.y);
        expect(cb.x + cb.w).toBeLessThanOrEqual(pb.x + pb.w);
        expect(cb.y + cb.h).toBeLessThanOrEqual(pb.y + pb.h);
        check(c);
      }
    }
    check(root);
  });

  it("siblings do not overlap horizontally on the same row", () => {
    const root = normalize(cellSpec);
    const result = layout(root, new Set(), 480);
    const membrane = root.children.find(c => c.name === "membrane")!;
    const [v, g, ch] = membrane.children.map(c => result.byId.get(c.id)!.bbox);
    expect(v.x + v.w).toBeLessThanOrEqual(g.x);
    expect(g.x + g.w).toBeLessThanOrEqual(ch.x);
  });

  it("deterministic: same input → same byId map", () => {
    const root = normalize(cellSpec);
    const a = layout(root, new Set(), 480);
    const b = layout(root, new Set(), 480);
    for (const [id, ln] of a.byId) {
      expect(b.byId.get(id)!.bbox).toEqual(ln.bbox);
    }
  });
});

describe("free positioning (posOverride)", () => {
  it("places a freed child at its parent-local position and grows the parent", () => {
    const root = normalize(cellSpec);
    const STORE_PAD = 24, STORE_HEADER = 30;
    const baseline = layout(root, new Set(), 480);
    const targetId = root.children[1].id;  // e.g. "cell/cytoplasm"

    const pos = new Map([[targetId, { x: 600, y: 400 }]]);
    const result = layout(root, new Set(), 480, undefined, undefined, pos);

    const rootBox = result.byId.get(root.id)!.bbox;
    const childBox = result.byId.get(targetId)!.bbox;
    // Positioned at the parent's content origin + the local offset.
    expect(childBox.x).toBeCloseTo(rootBox.x + STORE_PAD + 600, 5);
    expect(childBox.y).toBeCloseTo(rootBox.y + STORE_HEADER + STORE_PAD + 400, 5);
    // Parent grew to contain it, and the child stays within the parent.
    expect(rootBox.w).toBeGreaterThan(baseline.root.bbox.w);
    expect(childBox.x + childBox.w).toBeLessThanOrEqual(rootBox.x + rootBox.w + 0.01);
    expect(childBox.y + childBox.h).toBeLessThanOrEqual(rootBox.y + rootBox.h + 0.01);
  });

  it("clamps negative positions to >= 0 so a node can't escape its parent", () => {
    const root = normalize(cellSpec);
    const STORE_PAD = 24, STORE_HEADER = 30;
    const targetId = root.children[0].id;
    const pos = new Map([[targetId, { x: -500, y: -500 }]]);
    const result = layout(root, new Set(), 480, undefined, undefined, pos);
    const rootBox = result.byId.get(root.id)!.bbox;
    const childBox = result.byId.get(targetId)!.bbox;
    expect(childBox.x).toBeGreaterThanOrEqual(rootBox.x + STORE_PAD - 0.01);
    expect(childBox.y).toBeGreaterThanOrEqual(rootBox.y + STORE_HEADER + STORE_PAD - 0.01);
  });
});
