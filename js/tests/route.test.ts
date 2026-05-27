import { describe, it, expect } from "vitest";
import { layout } from "../src/layout";
import { normalize } from "../src/normalize";
import { readFileSync } from "fs";
import { resolve } from "path";

const cellSpec = JSON.parse(
  readFileSync(resolve(__dirname, "fixtures/cell.json"), "utf-8")
);

describe("wire routing", () => {
  it("produces 3 wires for metabolism + 2 for diffusion = 5", () => {
    const root = normalize(cellSpec);
    const result = layout(root, new Set(), 480);
    expect(result.wires.length).toBe(5);
  });

  it("metabolism.substrates targets cell/cytoplasm/M", () => {
    const root = normalize(cellSpec);
    const result = layout(root, new Set(), 480);
    const w = result.wires.find(
      w => w.processId === "cell/cytoplasm/metabolism" && w.portName === "substrates"
    )!;
    expect(w.targetId).toBe("cell/cytoplasm/M");
    expect(w.retargetedToChip).toBe(false);
  });

  it("retargets to chip when target is inside collapsed ancestor", () => {
    const root = normalize(cellSpec);
    const result = layout(root, new Set(["cell/membrane"]), 480);
    const w = result.wires.find(
      w => w.processId === "cell/diffusion" && w.portName === "voltage"
    )!;
    expect(w.targetId).toBe("cell/membrane");
    expect(w.retargetedToChip).toBe(true);
  });

  it("drops wires whose target cannot be resolved (silently)", () => {
    const broken = {
      name: "s",
      stores: {
        p: {
          _type: "process",
          address: "x",
          config: {},
          ports: { bad: ["does", "not", "exist"] },
        },
      },
    };
    const root = normalize(broken);
    const result = layout(root, new Set(), 480);
    expect(result.wires.length).toBe(0);
  });
});
