import { describe, it, expect, beforeEach } from "vitest";
import { renderSvg } from "../src/render/svg";
import { layout } from "../src/layout";
import { normalize } from "../src/normalize";
import { attachCollapse } from "../src/interact/collapse";
import { readFileSync } from "fs";
import { resolve } from "path";

const cellSpec = JSON.parse(
  readFileSync(resolve(__dirname, "fixtures/cell.json"), "utf-8")
);

describe("double-click collapse", () => {
  beforeEach(() => { document.body.innerHTML = ""; window.location.hash = ""; });

  it("double-clicking a store collapses it and re-renders", () => {
    const root = normalize(cellSpec);
    let collapsed = new Set<string>();
    const container = document.createElement("div");
    document.body.appendChild(container);

    function rerender() {
      container.innerHTML = "";
      const lr = layout(root, collapsed, 480);
      const svg = renderSvg(lr);
      container.appendChild(svg);
      attachCollapse(svg, root, "viz1", collapsed, (next) => {
        collapsed = next;
        rerender();
      });
    }
    rerender();

    const cyto = container.querySelector('[data-bgv2-id="cell/cytoplasm"]')!;
    cyto.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(container.querySelector(".bgv2-chip")).not.toBeNull();
  });
});
