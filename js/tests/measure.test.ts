import { describe, it, expect } from "vitest";
import { measure } from "../src/layout/measure";
import { normalize } from "../src/normalize";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  VAR_W, VAR_H, PROC_W, PROC_H, STORE_PAD, STORE_HEADER,
} from "../src/layout/constants";

const cellSpec = JSON.parse(
  readFileSync(resolve(__dirname, "fixtures/cell.json"), "utf-8")
);

describe("measure", () => {
  it("variable gets fixed cell", () => {
    const root = normalize({ name: "s", v: 1 });
    const v = root.children[0];
    const sizes = measure(root, new Set(), 480);
    expect(sizes.get(v.id)).toEqual({ w: VAR_W, h: VAR_H });
  });

  it("process gets fixed cell", () => {
    const root = normalize({
      name: "s",
      p: { _type: "process", address: "x", config: {}, ports: {} },
    });
    const sizes = measure(root, new Set(), 480);
    const p = root.children[0];
    expect(sizes.get(p.id)).toEqual({ w: PROC_W, h: PROC_H });
  });

  it("store size = packed content + padding + header", () => {
    const root = normalize(cellSpec);
    const sizes = measure(root, new Set(), 480);
    const membrane = root.children.find(c => c.name === "membrane")!;
    const m = sizes.get(membrane.id)!;
    // membrane has 3 variables in one row (3*VAR_W + 2*CHILD_GAP_X)
    expect(m.w).toBeGreaterThanOrEqual(3 * VAR_W);
    expect(m.h).toBeGreaterThanOrEqual(VAR_H + STORE_HEADER + 2 * STORE_PAD);
  });

  it("collapsed store sizes to chip footprint, ignoring children", () => {
    const root = normalize(cellSpec);
    const cyto = root.children.find(c => c.name === "cytoplasm")!;
    const sizes = measure(root, new Set([cyto.id]), 480);
    const c = sizes.get(cyto.id)!;
    // chip is the size of one process box (or smaller)
    expect(c.w).toBeLessThan(200);
    expect(c.h).toBeLessThan(80);
  });

  it("is deterministic — same spec, same sizes", () => {
    const root = normalize(cellSpec);
    const a = measure(root, new Set(), 480);
    const b = measure(root, new Set(), 480);
    for (const [id, sz] of a) expect(b.get(id)).toEqual(sz);
  });
});
