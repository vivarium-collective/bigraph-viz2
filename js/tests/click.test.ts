import { describe, it, expect, beforeEach } from "vitest";
import { attachClick } from "../src/interact/click";
import { renderSvg } from "../src/render/svg";
import { layout } from "../src/layout";
import { normalize } from "../src/normalize";
import { renderInspector } from "../src/inspector/render";
import { readFileSync } from "fs";
import { resolve } from "path";

const cellSpec = JSON.parse(
  readFileSync(resolve(__dirname, "fixtures/cell.json"), "utf-8")
);

describe("click → inspector", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("clicking a process populates the inspector with name + address", () => {
    const root = normalize(cellSpec);
    const lr = layout(root, new Set(), 480);
    const svg = renderSvg(lr);
    const inspector = document.createElement("div");
    inspector.className = "bgv2-inspector";
    document.body.appendChild(svg);
    document.body.appendChild(inspector);

    attachClick(svg, lr, (selectedId) => renderInspector(inspector, lr, selectedId));

    const procNode = svg.querySelector('[data-bgv2-id="cell/diffusion"]')!;
    procNode.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(inspector.textContent).toContain("diffusion");
    expect(inspector.textContent).toContain("ode.IonFlux");
  });

  it("clicking empty space clears selection", () => {
    const root = normalize(cellSpec);
    const lr = layout(root, new Set(), 480);
    const svg = renderSvg(lr);
    const inspector = document.createElement("div");
    document.body.appendChild(svg);
    document.body.appendChild(inspector);

    attachClick(svg, lr, (id) => renderInspector(inspector, lr, id));
    svg.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(inspector.textContent).toContain("Nothing selected");
  });
});
