import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { normalize } from "../src/normalize";

const cellSpec = JSON.parse(
  readFileSync(resolve(__dirname, "fixtures/cell.json"), "utf-8")
);

describe("normalize", () => {
  it("returns a root SpecNode named 'cell'", () => {
    const root = normalize(cellSpec);
    expect(root.name).toBe("cell");
    expect(root.kind).toBe("store");
    expect(root.id).toBe("cell");
  });

  it("recursively normalizes children", () => {
    const root = normalize(cellSpec);
    const names = root.children.map(c => c.name).sort();
    expect(names).toEqual(["cytoplasm", "diffusion", "membrane"]);
  });

  it("assigns id as parent/name", () => {
    const root = normalize(cellSpec);
    const membrane = root.children.find(c => c.name === "membrane")!;
    expect(membrane.id).toBe("cell/membrane");
    const v = membrane.children.find(c => c.name === "v")!;
    expect(v.id).toBe("cell/membrane/v");
    expect(v.kind).toBe("variable");
  });

  it("classifies processes by _type='process'", () => {
    const root = normalize(cellSpec);
    const diffusion = root.children.find(c => c.name === "diffusion")!;
    expect(diffusion.kind).toBe("process");
    expect(diffusion.address).toBe("ode.IonFlux");
    expect(diffusion.ports!["voltage"]).toEqual(["membrane", "v"]);
  });

  it("places nested processes inside their containing store", () => {
    const root = normalize(cellSpec);
    const cyto = root.children.find(c => c.name === "cytoplasm")!;
    const metab = cyto.children.find(c => c.name === "metabolism")!;
    expect(metab.kind).toBe("process");
    expect(metab.id).toBe("cell/cytoplasm/metabolism");
  });
});
