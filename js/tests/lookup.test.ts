import { describe, it, expect } from "vitest";
import { resolveWirePath, findNode } from "../src/wires/lookup";
import { normalize } from "../src/normalize";
import { readFileSync } from "fs";
import { resolve } from "path";

const cellSpec = JSON.parse(
  readFileSync(resolve(__dirname, "fixtures/cell.json"), "utf-8")
);

describe("resolveWirePath", () => {
  it("resolves a relative path from process's parent", () => {
    const root = normalize(cellSpec);
    const cyto = root.children.find(c => c.name === "cytoplasm")!;
    const metab = cyto.children.find(c => c.name === "metabolism")!;
    const targetId = resolveWirePath(root, metab, ["M"]);
    expect(targetId).toBe("cell/cytoplasm/M");
  });

  it("resolves '..' to go up one level", () => {
    const root = normalize(cellSpec);
    const cyto = root.children.find(c => c.name === "cytoplasm")!;
    const metab = cyto.children.find(c => c.name === "metabolism")!;
    const targetId = resolveWirePath(root, metab, ["..", "membrane", "v"]);
    expect(targetId).toBe("cell/membrane/v");
  });

  it("resolves diffusion's voltage port to membrane.v", () => {
    const root = normalize(cellSpec);
    const diff = root.children.find(c => c.name === "diffusion")!;
    const targetId = resolveWirePath(root, diff, diff.ports!["voltage"]);
    expect(targetId).toBe("cell/membrane/v");
  });

  it("returns null for an unresolvable path", () => {
    const root = normalize(cellSpec);
    const diff = root.children.find(c => c.name === "diffusion")!;
    const targetId = resolveWirePath(root, diff, ["nope"]);
    expect(targetId).toBeNull();
  });
});

describe("findNode", () => {
  it("locates a node by id", () => {
    const root = normalize(cellSpec);
    const n = findNode(root, "cell/membrane/v");
    expect(n).not.toBeNull();
    expect(n!.name).toBe("v");
  });
  it("returns null for missing id", () => {
    const root = normalize(cellSpec);
    expect(findNode(root, "nope")).toBeNull();
  });
});
