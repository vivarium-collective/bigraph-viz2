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

  it("preserves an explicit null variable value", () => {
    const root = normalize({
      name: "s",
      stores: { x: { _type: "variable", value: null } },
    });
    const x = root.children[0];
    expect(x.value).toBeNull();
  });

  it("does not leak 'name' as a child when 'stores' wrapper is absent", () => {
    const root = normalize({
      name: "s",
      a: { _type: "variable", value: 1 },
      b: { _type: "variable", value: 2 },
    });
    const childNames = root.children.map(c => c.name).sort();
    expect(childNames).toEqual(["a", "b"]);
  });

  it("keeps `stores:` as a named substore when it has top-level siblings " +
     "(process-bigraph composite convention)", () => {
    // Typical composite shape: processes at top level, a `stores:` sibling
    // holding shared variables that processes wire into.
    const root = normalize({
      MM: {
        _type: "process",
        address: "local:MichaelisMentenStep",
        inputs:  { substrates: ["stores", "substrates"] },
        outputs: { uptake_rates: ["stores", "uptake_rates"] },
      },
      FBA: {
        _type: "process",
        address: "local:FBAProcess",
        inputs:  { uptake_rates: ["stores", "uptake_rates"] },
        outputs: { biomass:      ["stores", "biomass"] },
      },
      stores: {
        substrates:   { _type: "variable", value: 1.0 },
        uptake_rates: { _type: "variable", value: 0.0 },
        biomass:      { _type: "variable", value: 0.1 },
      },
    });
    const childNames = root.children.map(c => c.name).sort();
    // `stores` is a *named* child here, not a wrapper — alongside MM and FBA.
    expect(childNames).toEqual(["FBA", "MM", "stores"]);

    // And its children (substrates / biomass / uptake_rates) are nested
    // under `stores`, so wire paths like ["stores", "substrates"] still
    // resolve correctly via lookup.
    const stores = root.children.find(c => c.name === "stores")!;
    const storeChildren = stores.children.map(c => c.name).sort();
    expect(storeChildren).toEqual(["biomass", "substrates", "uptake_rates"]);
  });

  it("unwraps `stores:` when it's the only non-`name` top-level key " +
     "(bigraph-viz fixture convention)", () => {
    const root = normalize({
      name: "demo",
      stores: {
        a: { _type: "variable", value: 1 },
        b: { _type: "variable", value: 2 },
      },
    });
    const childNames = root.children.map(c => c.name).sort();
    expect(childNames).toEqual(["a", "b"]);
  });
});
