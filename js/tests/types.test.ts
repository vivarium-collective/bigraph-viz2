import { describe, it, expect } from "vitest";
import type { SpecNode, BBox } from "../src/types";

describe("types", () => {
  it("compiles and allows constructing a SpecNode", () => {
    const node: SpecNode = { id: "x", name: "x", kind: "variable", children: [] };
    const bbox: BBox = { x: 0, y: 0, w: 10, h: 10 };
    expect(node.kind).toBe("variable");
    expect(bbox.w).toBe(10);
  });
});
