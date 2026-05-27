import { describe, it, expect } from "vitest";
import { encodeHash, decodeHash } from "../src/hash/sync";

describe("hash sync", () => {
  it("round-trips an empty collapse set", () => {
    const out = decodeHash(encodeHash("viz1", new Set()), "viz1");
    expect(Array.from(out)).toEqual([]);
  });

  it("encodes ids comma-separated under bgv2-<id>=collapse:", () => {
    const h = encodeHash("viz1", new Set(["cell/cytoplasm", "cell/membrane"]));
    expect(h).toMatch(/^#?bgv2-viz1=collapse:/);
    expect(h).toContain("cell/cytoplasm");
    expect(h).toContain("cell/membrane");
  });

  it("decodes only the slice for the matching viz id", () => {
    const merged = encodeHash("a", new Set(["x"])) + "&" + encodeHash("b", new Set(["y"])).replace(/^#/, "");
    const a = decodeHash(merged, "a");
    const b = decodeHash(merged, "b");
    expect(Array.from(a)).toEqual(["x"]);
    expect(Array.from(b)).toEqual(["y"]);
  });

  it("returns empty set if no matching slice", () => {
    expect(Array.from(decodeHash("#nope=1", "viz1"))).toEqual([]);
  });
});
